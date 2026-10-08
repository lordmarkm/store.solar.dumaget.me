import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { ApiConfig } from './config.js';
import { bearerToken, isAdminAuthorized, isAdminEligible, requireAdmin } from './auth.js';
import type { IdentityVerifier } from './auth.js';
import { ApiError } from './errors.js';
import { FirebaseGateway } from './firebase.js';
import { parseProfileInput } from './customer-profile.js';
import type { ProfileRepository } from './customer-profile.js';
import { FirestoreProfileRepository } from './profile.repository.js';
import { FirestoreAccountProjectRepository } from './project.repository.js';
import type { AccountProjectRepository } from './project.repository.js';
import { parseActiveProjectInput, parseCreateProject, parseProjectCommand, parseProjectCursor } from './customer-projects.js';
import { parseCursor, parseProductInput, parseSupplierInput, parseProductId, parseProductUpdate, parseProductCommand, parseReferenceIds } from './admin-catalog.js';
import type { AdminCatalogRepository } from './admin-catalog.js';
import { FirestoreAdminCatalogRepository } from './admin-catalog.repository.js';
import { CloudProductImageStore, MAX_IMAGE_BYTES } from './product-images.js';
import type { ProductImageStore } from './product-images.js';
import { ProductImageLifecycle } from './product-image-lifecycle.js';
import { parseProductQuery, parseBrandCursor, parseSupplierUpdate, parseSupplierStatus } from './admin-catalog.js';

export function buildApp(config: ApiConfig, options: { verifier?: IdentityVerifier; profiles?: ProfileRepository; catalog?: AdminCatalogRepository; projects?: AccountProjectRepository; images?: ProductImageStore; logger?: boolean } = {}) {
  const gateway = new FirebaseGateway(config);
  const verifier = options.verifier ?? gateway;
  const profiles = options.profiles ?? new FirestoreProfileRepository(() => gateway.firestore());
  const imageLifecycle = !options.catalog && !options.images ? new ProductImageLifecycle(() => gateway.firestore(), () => gateway.imageBucket()) : undefined;
  const catalog = options.catalog ?? new FirestoreAdminCatalogRepository(() => gateway.firestore(), undefined, imageLifecycle);
  const projects = options.projects ?? new FirestoreAccountProjectRepository(() => gateway.firestore());
  const images = options.images ?? new CloudProductImageStore(() => gateway.imageBucket(), imageLifecycle);
  const app = Fastify({
    bodyLimit: 64 * 1024,
    requestTimeout: 15_000,
    connectionTimeout: 10_000,
    trustProxy: false,
    logController: new LogController({ disableRequestLogging: true }),
    logger: options.logger === false ? false : {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
  });
  app.register(helmet);
  // In-memory, per-process limiter: no Redis or paid dependency. Deployment-level
  // limits and trusted proxy configuration must be reviewed before public hosting.
  app.register(rateLimit, {
    max: 60, timeWindow: '1 minute', cache: 1000,
    errorResponseBuilder: () => new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.'),
  });
  app.register(cors, {
    origin: [...config.corsOrigins], credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.addHook('onClose', async () => {
    try { await verifier.close(); }
    finally { if (verifier !== gateway) await gateway.close(); }
  });
  app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  app.addHook('onResponse', async (request, reply) => {
    // Route patterns only: never log query strings, bodies, tokens or identities.
    request.log.info({ route: request.routeOptions.url ?? 'unmatched', method: request.method, statusCode: reply.statusCode }, 'Request completed');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, requestId: request.id } });
    }
    const status = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: 'INVALID_REQUEST', message: 'The request is invalid.', requestId: request.id } });
    }
    request.log.error({ code: 'INTERNAL_ERROR' }, 'Request failed');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.', requestId: request.id } });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: request.id } }));

  // Register routes after plugins have booted so onRoute-based limits apply.
  app.register(async (routes) => {
    routes.get('/health', async () => ({ status: 'ok', service: 'solar-store-api' }));
    routes.get('/ready', async () => {
      // A process health check must not imply cloud readiness.
      // Profile wiring exists, but live Auth/database activation and probes remain pending.
      throw new ApiError(503, 'BACKEND_NOT_READY', 'Connected backend readiness is not implemented.');
    });
    routes.get('/api/v1/me', async (request) => {
      if (!config.firebaseEnabled || !config.authSetupApproved) {
        throw new ApiError(503, 'BACKEND_DISABLED', 'Firebase backend activation is pending.');
      }
      const identity = await verifier.verify(bearerToken(request.headers.authorization));
      return {
        uid: identity.uid, email: identity.email, emailVerified: identity.emailVerified,
        adminEligible: isAdminEligible(identity, config.adminEmailDomains),
        adminAuthorized: isAdminAuthorized(identity, config),
      };
    });
    const self = async (authorization: string | undefined) => {
      if (!config.firebaseEnabled || !config.authSetupApproved) {
        throw new ApiError(503, 'BACKEND_DISABLED', 'Firebase backend activation is pending.');
      }
      return verifier.verify(bearerToken(authorization));
    };
    routes.get('/api/v1/me/profile', async (request) => {
      const identity = await self(request.headers.authorization);
      const record = await profiles.get(identity);
      return { profile: record?.profile ?? null, version: record?.version ?? null };
    });
    routes.put('/api/v1/me/profile', async (request) => {
      const identity = await self(request.headers.authorization);
      const record = await profiles.save(identity, parseProfileInput(request.body));
      return { profile: record.profile, version: record.version };
    });
    routes.get('/api/v1/me/projects', async request => {
      const identity = await self(request.headers.authorization);
      return projects.list(identity, parseProjectCursor(request.query));
    });
    routes.get('/api/v1/me/projects/:id', async request => {
      const identity = await self(request.headers.authorization);
      const id = parseProductId((request.params as { id?: unknown }).id);
      return { project: await projects.get(identity, id) };
    });
    routes.post('/api/v1/me/projects', async (request, reply) => {
      const identity = await self(request.headers.authorization);
      const result = await projects.create(identity, parseCreateProject(request.body));
      return reply.code(201).send(result);
    });
    routes.post('/api/v1/me/projects/:id/commands', async request => {
      const identity = await self(request.headers.authorization);
      const id = parseProductId((request.params as { id?: unknown }).id);
      return projects.command(identity, id, parseProjectCommand(request.body));
    });
    routes.put('/api/v1/me/project-active', async request => {
      const identity = await self(request.headers.authorization);
      return projects.setActive(identity, parseActiveProjectInput(request.body));
    });
    const admin = async (authorization: string | undefined) => {
      const identity = await self(authorization);
      requireAdmin(identity, config);
      return identity;
    };
    // Authenticate before buffering/decoding large image bodies. Other JSON routes retain 64 KiB.
    routes.register(async imageRoutes => {
      imageRoutes.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer' },
        (_request, body, done) => done(null, body));
      imageRoutes.post('/api/v1/admin/product-images', {
        bodyLimit: MAX_IMAGE_BYTES,
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        onRequest: async request => { await admin(request.headers.authorization); },
      }, async (request, reply) => {
        const type = request.headers['content-type'] ?? '';
        if (Object.keys(request.query as object).length || !Buffer.isBuffer(request.body))
          throw new ApiError(400, 'INVALID_IMAGE', 'Upload a JPEG, PNG or WebP picture.');
        return reply.code(201).send({ image: await images.upload(request.body, type) });
      });
    });
    routes.get('/api/v1/admin/suppliers', async request => {
      await admin(request.headers.authorization);
      return catalog.suppliers(parseCursor(request.query));
    });
    routes.post('/api/v1/admin/suppliers', async (request, reply) => {
      const identity = await admin(request.headers.authorization);
      const supplier = await catalog.createSupplier(identity, parseSupplierInput(request.body));
      return reply.code(201).send({ supplier });
    });
    routes.get('/api/v1/admin/products', async request => {
      await admin(request.headers.authorization);
      const { cursor, filters } = parseProductQuery(request.query);
      return catalog.products(cursor, filters);
    });
    routes.get('/api/v1/admin/product-brands', async request => {
      await admin(request.headers.authorization);
      return catalog.productBrands(parseBrandCursor(request.query));
    });
    routes.get('/api/v1/admin/suppliers/:id', async request => {
      await admin(request.headers.authorization);
      return { supplier: await catalog.supplier(parseProductId((request.params as { id: string }).id)) };
    });
    routes.put('/api/v1/admin/suppliers/:id', async request => {
      const identity = await admin(request.headers.authorization);
      return { supplier: await catalog.updateSupplier(identity, parseProductId((request.params as { id: string }).id), parseSupplierUpdate(request.body)) };
    });
    routes.post('/api/v1/admin/suppliers/:id/status', async request => {
      const identity = await admin(request.headers.authorization);
      return { supplier: await catalog.setSupplierStatus(identity, parseProductId((request.params as { id: string }).id), parseSupplierStatus(request.body)) };
    });
    routes.post('/api/v1/admin/product-images/cleanup', async request => {
      await admin(request.headers.authorization);
      if (Object.keys(request.query as object).length || request.body !== undefined) throw new ApiError(400, 'INVALID_REQUEST', 'Cleanup takes no input.');
      await imageLifecycle?.sweep();
      return { accepted: true };
    });
    routes.post('/api/v1/admin/products', async (request, reply) => {
      const identity = await admin(request.headers.authorization);
      const input = parseProductInput(request.body);
      if (input.images?.length) await images.validate(input.images);
      const product = await catalog.createProduct(identity, input);
      return reply.code(201).send({ product });
    });
    const productId = (params: unknown) => parseProductId((params as { id?: unknown }).id);
    routes.get('/api/v1/admin/products/:id', async request => {
      await admin(request.headers.authorization);
      return { product: await catalog.product(productId(request.params)) };
    });
    routes.put('/api/v1/admin/products/:id', async request => {
      const identity = await admin(request.headers.authorization);
      const input = parseProductUpdate(request.body);
      if (input.images?.length) await images.validate(input.images);
      return { product: await catalog.updateProduct(identity, productId(request.params), input) };
    });
    routes.post('/api/v1/admin/products/:id/publish', async request => {
      const identity = await admin(request.headers.authorization);
      return { product: await catalog.publishProduct(identity, productId(request.params), parseProductCommand(request.body)) };
    });
    routes.post('/api/v1/admin/products/:id/unpublish', async request => {
      const identity = await admin(request.headers.authorization);
      return { product: await catalog.unpublishProduct(identity, productId(request.params), parseProductCommand(request.body)) };
    });
    const publicCatalog = () => {
      if (!config.firebaseEnabled) throw new ApiError(503, 'BACKEND_DISABLED', 'Public catalog is unavailable.');
    };
    routes.get('/api/v1/catalog/products', async request => {
      publicCatalog();
      return catalog.publishedProducts(parseCursor(request.query));
    });
    routes.get('/api/v1/catalog/products/:id', async request => {
      publicCatalog();
      return { product: await catalog.publishedProduct(productId(request.params)) };
    });
    routes.post('/api/v1/catalog/references', async request => {
      publicCatalog();
      return { items: await catalog.publishedReferences(parseReferenceIds(request.body)) };
    });
  });
  return app;
}

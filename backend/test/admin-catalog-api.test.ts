import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import type { IdentityVerifier, VerifiedIdentity } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import type {
  AdminCatalogRepository, AdminPage, AdminProduct, AdminSupplier, ProductInput, ProductListFilters, SupplierInput,
  SupplierStatusInput, SupplierUpdateInput,
} from '../src/admin-catalog.js';
import { imageDescriptor } from '../src/product-images.js';
import type { ProductImageStore } from '../src/product-images.js';
import { ApiError } from '../src/errors.js';

const enabled = loadConfig({
  NODE_ENV: 'test', FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true',
});
const disabled = loadConfig({ NODE_ENV: 'test' });
const adminIdentity: VerifiedIdentity = {
  uid: 'verified-admin-uid', email: 'admin@solar.dumaget.me', emailVerified: true, storeAdmin: true,
};
const requestId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-07T00:00:00.000Z';
const authorization = { authorization: 'Bearer accepted-token' };
const productImage = imageDescriptor('d'.repeat(64), 120, 80);

function trackedImages() {
  const calls: Array<{ kind: 'upload'; contentType: string } | { kind: 'validate'; images: readonly unknown[] }> = [];
  const images: ProductImageStore = {
    async upload(_bytes, contentType) { calls.push({ kind: 'upload', contentType }); return productImage; },
    async validate(value) { calls.push({ kind: 'validate', images: value }); },
  };
  return { images, calls };
}

const supplierPayload: SupplierInput = {
  requestId, name: 'Solar Supply', region: 'Manila', description: 'Supplier',
  website: 'https://supplier.example', email: 'sales@supplier.example', phone: '123',
};
const productPayload: ProductInput = {
  requestId, sku: 'PANEL-01', name: 'Panel', brand: 'Solar', category: 'Panels', unitCode: 'panel',
  description: 'Panel product', amountMinor: 125000, supplierId,
};

function makeSupplier(input: SupplierInput): AdminSupplier {
  return {
    ...input, id: supplierId, schemaVersion: 1, version: 1, createdBy: adminIdentity.uid,
    createdAt: at, updatedAt: at, status: 'active',
  };
}

function makeProduct(input: ProductInput): AdminProduct {
  return {
    ...input, id: requestId, schemaVersion: 1, version: 1, createdBy: adminIdentity.uid,
    createdAt: at, updatedAt: at, state: 'draft', currency: 'PHP',
  };
}

function trackedCatalog() {
  const calls: string[] = [];
  const owners: VerifiedIdentity[] = [];
  const productQueries: Array<{ cursor: string | null; filters: ProductListFilters | undefined }> = [];
  const brandCursors: Array<string | null> = [];
  const catalog: AdminCatalogRepository = {
    async product() { calls.push('get-product'); return makeProduct(productPayload); },
    async updateProduct(owner, inputId, input) { calls.push('update-product'); owners.push(owner); return { ...makeProduct(input), id: inputId, version: 2 }; },
    async publishProduct(owner) { calls.push('publish-product'); owners.push(owner); return { ...makeProduct(productPayload), version: 2, state: 'published', publishedVersion: 2 }; },
    async unpublishProduct(owner) { calls.push('unpublish-product'); owners.push(owner); return { ...makeProduct(productPayload), version: 3 }; },
    async publishedProducts() { calls.push('public-list'); return { items: [], nextCursor: null }; },
    async publishedProduct() { calls.push('public-product'); throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found.'); },
    async publishedReferences() { calls.push('public-references'); return []; },
    async suppliers(_cursor): Promise<AdminPage<AdminSupplier>> {
      calls.push('list-suppliers');
      return { items: [makeSupplier(supplierPayload)], nextCursor: null };
    },
    async products(cursor, filters): Promise<AdminPage<AdminProduct>> {
      calls.push('list-products');
      productQueries.push({ cursor, filters });
      return { items: [makeProduct(productPayload)], nextCursor: null };
    },
    async productBrands(cursor): Promise<AdminPage<string>> {
      calls.push('list-brands'); brandCursors.push(cursor);
      return { items: ['Solar'], nextCursor: null };
    },
    async supplier(id) {
      calls.push('get-supplier');
      return { ...makeSupplier(supplierPayload), id };
    },
    async updateSupplier(owner, id, input: SupplierUpdateInput) {
      calls.push('update-supplier'); owners.push(owner);
      const { expectedVersion, ...fields } = input;
      return { ...makeSupplier(fields), id, version: expectedVersion + 1 };
    },
    async setSupplierStatus(owner, id, input: SupplierStatusInput) {
      calls.push('set-supplier-status'); owners.push(owner);
      return { ...makeSupplier(supplierPayload), id, version: input.expectedVersion + 1, status: input.status };
    },
    async createSupplier(owner, input) {
      calls.push('create-supplier'); owners.push(owner); return makeSupplier(input);
    },
    async createProduct(owner, input) {
      calls.push('create-product'); owners.push(owner); return makeProduct(input);
    },
  };
  return { catalog, calls, owners, productQueries, brandCursors };
}

function trackedVerifier(resolve: (token: string) => Promise<VerifiedIdentity> = async () => adminIdentity) {
  const calls: string[] = [];
  const verifier: IdentityVerifier = {
    async verify(token) { calls.push(token); return resolve(token); },
    async close() {},
  };
  return { verifier, calls };
}

const protectedRoutes = [
  { method: 'GET' as const, url: '/api/v1/admin/suppliers' },
  { method: 'POST' as const, url: '/api/v1/admin/suppliers', payload: supplierPayload },
  { method: 'GET' as const, url: '/api/v1/admin/products' },
  { method: 'POST' as const, url: '/api/v1/admin/products', payload: productPayload },
  { method: 'GET' as const, url: `/api/v1/admin/products/${requestId}` },
  { method: 'PUT' as const, url: `/api/v1/admin/products/${requestId}`, payload: { ...productPayload, expectedVersion: 1 } },
  { method: 'POST' as const, url: `/api/v1/admin/products/${requestId}/publish`, payload: { requestId, expectedVersion: 1 } },
  { method: 'POST' as const, url: `/api/v1/admin/products/${requestId}/unpublish`, payload: { requestId, expectedVersion: 1 } },
  { method: 'GET' as const, url: '/api/v1/admin/product-brands' },
  { method: 'GET' as const, url: `/api/v1/admin/suppliers/${supplierId}` },
  { method: 'PUT' as const, url: `/api/v1/admin/suppliers/${supplierId}`, payload: { ...supplierPayload, expectedVersion: 1 } },
  { method: 'POST' as const, url: `/api/v1/admin/suppliers/${supplierId}/status`, payload: { requestId, expectedVersion: 1, status: 'inactive' } },
  { method: 'POST' as const, url: '/api/v1/admin/product-images/cleanup' },
];

test('disabled backend returns 503 on both catalog GET and POST routes before verifier or repository use', async () => {
  const tracked = trackedCatalog();
  const auth = trackedVerifier();
  const app = buildApp(disabled, { logger: false, verifier: auth.verifier, catalog: tracked.catalog });
  try {
    for (const route of protectedRoutes) {
      const response = await app.inject({ ...route, headers: authorization });
      assert.equal(response.statusCode, 503, route.url);
      assert.equal(response.json().error.code, 'BACKEND_DISABLED');
    }
    assert.deepEqual(auth.calls, []);
    assert.deepEqual(tracked.calls, []);
  } finally { await app.close(); }
});

test('missing, invalid, and revoked bearer tokens return 401 for every catalog operation', async () => {
  const tracked = trackedCatalog();
  const auth = trackedVerifier(async token => {
    if (token === 'invalid' || token === 'revoked') throw new ApiError(401, 'UNAUTHENTICATED', 'Token rejected.');
    return adminIdentity;
  });
  const app = buildApp(enabled, { logger: false, verifier: auth.verifier, catalog: tracked.catalog });
  try {
    for (const route of protectedRoutes) {
      for (const headers of [{}, { authorization: 'Bearer invalid' }, { authorization: 'Bearer revoked' }]) {
        const response = await app.inject({ ...route, headers });
        assert.equal(response.statusCode, 401, `${route.method} ${route.url}`);
        assert.equal(response.json().error.code, 'UNAUTHENTICATED');
      }
    }
    assert.deepEqual(auth.calls, Array.from({ length: protectedRoutes.length }, () => ['invalid', 'revoked']).flat());
    assert.equal(auth.calls.filter(token => token === 'invalid').length, protectedRoutes.length);
    assert.equal(auth.calls.filter(token => token === 'revoked').length, protectedRoutes.length);
    assert.deepEqual(tracked.calls, []);
  } finally { await app.close(); }
});

test('admin eligibility requires a verified matching email and the storeAdmin claim before input validation', async () => {
  const tracked = trackedCatalog();
  const auth = trackedVerifier(async token => {
    if (token === 'domain-only') return { ...adminIdentity, storeAdmin: false };
    if (token === 'foreign-claim') return { ...adminIdentity, email: 'admin@attacker.example' };
    if (token === 'unverified-claim') return { ...adminIdentity, emailVerified: false };
    return adminIdentity;
  });
  const app = buildApp(enabled, { logger: false, verifier: auth.verifier, catalog: tracked.catalog });
  try {
    for (const token of ['domain-only', 'foreign-claim', 'unverified-claim']) {
      for (const route of protectedRoutes.slice(4)) {
        const denied = await app.inject({ ...route, headers: { authorization: `Bearer ${token}` } });
        assert.equal(denied.statusCode, 403);
      }
      const invalidBody = await app.inject({
        method: 'POST', url: '/api/v1/admin/products', headers: { authorization: `Bearer ${token}` }, payload: {},
      });
      assert.equal(invalidBody.statusCode, 403);
      assert.equal(invalidBody.json().error.code, 'FORBIDDEN');
      const invalidQuery = await app.inject({
        method: 'GET', url: '/api/v1/admin/suppliers?probe=1', headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(invalidQuery.statusCode, 403);
    }
    assert.deepEqual(tracked.calls, []);
    assert.equal(auth.calls.length, 6 + 3 * (protectedRoutes.length - 4));
  } finally { await app.close(); }
});

test('public catalog needs no token and never opens private masters; disabled public access fails closed', async () => {
  const tracked = trackedCatalog();
  const auth = trackedVerifier();
  const app = buildApp(enabled, { logger: false, verifier: auth.verifier, catalog: tracked.catalog });
  try {
    const list = await app.inject({ method: 'GET', url: '/api/v1/catalog/products' });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.json(), { items: [], nextCursor: null });
    const missing = await app.inject({ method: 'GET', url: `/api/v1/catalog/products/${requestId}` });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(auth.calls, []);
    assert.deepEqual(tracked.calls, ['public-list', 'public-product']);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/catalog/references', payload: { ids: [requestId] } })).statusCode, 200);
    assert.deepEqual(auth.calls, []);
    for (const payload of [{ ids: [] }, { ids: Array(21).fill(requestId) }, { ids: [requestId, requestId] }, { ids: ['bad'] }, { ids: [requestId], private: true }]) {
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/catalog/references', payload })).statusCode, 400);
    }
    for (const url of ['/api/v1/catalog/products?state=draft', '/api/v1/catalog/products?cursor=bad', '/api/v1/catalog/products/bad']) {
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 400);
    }
  } finally { await app.close(); }
  const off = buildApp(disabled, { logger: false, verifier: auth.verifier, catalog: tracked.catalog });
  try { assert.equal((await off.inject({ method: 'GET', url: '/api/v1/catalog/products' })).statusCode, 503); }
  finally { await off.close(); }
});

test('product edit and lifecycle endpoints accept only versioned reviewed data and verified actors', async () => {
  const tracked = trackedCatalog();
  const app = buildApp(enabled, { logger: false, verifier: trackedVerifier().verifier, catalog: tracked.catalog });
  try {
    for (const route of protectedRoutes.slice(4, 8)) assert.equal((await app.inject({ ...route, headers: authorization })).statusCode, 200);
    assert.deepEqual(tracked.calls, ['get-product', 'update-product', 'publish-product', 'unpublish-product']);
    assert.ok(tracked.owners.every(owner => owner.uid === adminIdentity.uid));
    for (const payload of [{ requestId, expectedVersion: 0 }, { requestId, expectedVersion: 1, state: 'published' }, { requestId, expectedVersion: 1.5 }, { requestId: 'bad', expectedVersion: 1 }]) {
      assert.equal((await app.inject({ method: 'POST', url: `/api/v1/admin/products/${requestId}/publish`, headers: authorization, payload })).statusCode, 400);
    }
    assert.equal((await app.inject({ method: 'PUT', url: `/api/v1/admin/products/${requestId}`, headers: authorization,
      payload: { ...productPayload, expectedVersion: 1, publishedVersion: 1 } })).statusCode, 400);
  } finally { await app.close(); }
});

test('verified store admin can list and create suppliers and products through injected repository', async () => {
  const tracked = trackedCatalog();
  const auth = trackedVerifier();
  const app = buildApp(enabled, { logger: false, verifier: auth.verifier, catalog: tracked.catalog });
  try {
    const suppliers = await app.inject({ method: 'GET', url: '/api/v1/admin/suppliers', headers: authorization });
    assert.equal(suppliers.statusCode, 200);
    assert.equal(suppliers.json().items[0].id, supplierId);
    const products = await app.inject({ method: 'GET', url: '/api/v1/admin/products', headers: authorization });
    assert.equal(products.statusCode, 200);
    assert.equal(products.json().items[0].currency, 'PHP');
    const createdSupplier = await app.inject({
      method: 'POST', url: '/api/v1/admin/suppliers', headers: authorization, payload: supplierPayload,
    });
    assert.equal(createdSupplier.statusCode, 201);
    assert.equal(createdSupplier.json().supplier.createdBy, adminIdentity.uid);
    const createdProduct = await app.inject({
      method: 'POST', url: '/api/v1/admin/products', headers: authorization, payload: productPayload,
    });
    assert.equal(createdProduct.statusCode, 201);
    assert.equal(createdProduct.json().product.state, 'draft');
    assert.deepEqual(tracked.calls, ['list-suppliers', 'list-products', 'create-supplier', 'create-product']);
    assert.equal(tracked.owners.length, 2);
    assert.ok(tracked.owners.every(owner => owner.uid === adminIdentity.uid));
  } finally { await app.close(); }
});

test('admin product filters are bounded, allowlisted, normalized, and forwarded to the repository', async () => {
  const tracked = trackedCatalog();
  const auth = trackedVerifier(async token => token === 'not-admin'
    ? { ...adminIdentity, storeAdmin: false }
    : adminIdentity);
  const app = buildApp(enabled, { logger: false, verifier: auth.verifier, catalog: tracked.catalog });
  try {
    const query = `cursor=next_01&skuPrefix=%20panel-01%20&brand=%20Solar%20&category=Panels&supplierId=${supplierId.toUpperCase()}`;
    const response = await app.inject({ method: 'GET', url: `/api/v1/admin/products?${query}`, headers: authorization });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(tracked.productQueries, [{
      cursor: 'next_01',
      filters: { skuPrefix: 'PANEL-01', brand: 'Solar', category: 'Panels', supplierId },
    }]);

    for (const invalidQuery of [
      'extra=1', 'category=unknown', 'brand=%20', 'skuPrefix=has%20space',
      'supplierId=bad', `cursor=${'a'.repeat(513)}`,
    ]) {
      const invalid = await app.inject({
        method: 'GET', url: `/api/v1/admin/products?${invalidQuery}`, headers: authorization,
      });
      assert.equal(invalid.statusCode, 400, invalidQuery);
      assert.equal(invalid.json().error.code, 'INVALID_CATALOG_INPUT', invalidQuery);
    }

    const denied = await app.inject({
      method: 'GET', url: '/api/v1/admin/products?category=invalid&unlisted=1',
      headers: { authorization: 'Bearer not-admin' },
    });
    assert.equal(denied.statusCode, 403);
    assert.deepEqual(tracked.productQueries, [{
      cursor: 'next_01',
      filters: { skuPrefix: 'PANEL-01', brand: 'Solar', category: 'Panels', supplierId },
    }]);
  } finally { await app.close(); }
});

test('admin brand and supplier routes forward bounded inputs and require bodyless cleanup', async () => {
  const tracked = trackedCatalog();
  const app = buildApp(enabled, { logger: false, verifier: trackedVerifier().verifier, catalog: tracked.catalog });
  try {
    const brands = await app.inject({
      method: 'GET', url: '/api/v1/admin/product-brands?cursor=Solar', headers: authorization,
    });
    assert.equal(brands.statusCode, 200);
    assert.deepEqual(tracked.brandCursors, ['Solar']);

    const supplier = await app.inject({
      method: 'GET', url: `/api/v1/admin/suppliers/${supplierId}`, headers: authorization,
    });
    assert.equal(supplier.statusCode, 200);
    const updated = await app.inject({
      method: 'PUT', url: `/api/v1/admin/suppliers/${supplierId}`, headers: authorization,
      payload: { ...supplierPayload, expectedVersion: 1 },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().supplier.version, 2);
    const status = await app.inject({
      method: 'POST', url: `/api/v1/admin/suppliers/${supplierId}/status`, headers: authorization,
      payload: { requestId, expectedVersion: 1, status: 'inactive' },
    });
    assert.equal(status.statusCode, 200);
    assert.equal(status.json().supplier.status, 'inactive');

    const cleanup = await app.inject({
      method: 'POST', url: '/api/v1/admin/product-images/cleanup', headers: authorization,
    });
    assert.equal(cleanup.statusCode, 200);
    assert.deepEqual(cleanup.json(), { accepted: true });
    for (const request of [
      { url: '/api/v1/admin/product-images/cleanup?probe=1' },
      { url: '/api/v1/admin/product-images/cleanup', payload: { unsafe: true } },
    ]) {
      const rejected = await app.inject({ method: 'POST', ...request, headers: authorization });
      assert.equal(rejected.statusCode, 400);
    }

    assert.deepEqual(tracked.calls, ['list-brands', 'get-supplier', 'update-supplier', 'set-supplier-status']);
    assert.deepEqual(tracked.brandCursors, ['Solar']);
    assert.equal(tracked.owners.length, 2);
    assert.ok(tracked.owners.every(owner => owner.uid === adminIdentity.uid));
  } finally { await app.close(); }
});

test('invalid bodies, server-controlled fields, and extra cursor parameters are rejected for an authenticated admin', async () => {
  const tracked = trackedCatalog();
  const auth = trackedVerifier();
  const app = buildApp(enabled, { logger: false, verifier: auth.verifier, catalog: tracked.catalog });
  try {
    for (const field of ['createdBy', 'role', 'roles', 'state', 'currency', 'stock', 'createdAt', 'updatedAt']) {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/admin/products', headers: authorization,
        payload: { ...productPayload, [field]: 'attacker-controlled' },
      });
      assert.equal(response.statusCode, 400, field);
      assert.equal(response.json().error.code, 'INVALID_CATALOG_INPUT');
    }
    for (const payload of [[], { ...supplierPayload, extra: true }]) {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/admin/suppliers', headers: authorization, payload,
      });
      assert.equal(response.statusCode, 400);
    }
    const malformedJson = await app.inject({
      method: 'POST', url: '/api/v1/admin/suppliers',
      headers: { ...authorization, 'content-type': 'application/json' }, payload: '{',
    });
    assert.equal(malformedJson.statusCode, 400);
    for (const url of [
      '/api/v1/admin/suppliers?probe=1', '/api/v1/admin/products?cursor=has%20space',
      '/api/v1/admin/products?cursor=11111111-1111-4111-8111-111111111111&extra=1',
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: authorization });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, 'INVALID_CATALOG_INPUT');
    }
    assert.deepEqual(tracked.calls, []);
  } finally { await app.close(); }
});

test('image upload authenticates before parsing and isolates its 5 MiB limit from JSON limits', async () => {
  const deniedVerifier = trackedVerifier(async token => token === 'forbidden'
    ? { ...adminIdentity, storeAdmin: false }
    : token === 'accepted-token' ? adminIdentity : (() => { throw new ApiError(401, 'UNAUTHENTICATED', 'No.'); })());
  const deniedImages = trackedImages();
  const deniedApp = buildApp(enabled, { logger: false, verifier: deniedVerifier.verifier, images: deniedImages.images });
  try {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    const responseFor = (headers: Record<string, string>) => deniedApp.inject({ method: 'POST',
      url: '/api/v1/admin/product-images', headers: { 'content-type': 'image/png', ...headers }, payload: oversized });
    assert.equal((await responseFor({})).statusCode, 401);
    assert.equal((await responseFor({ authorization: 'Bearer forbidden' })).statusCode, 403);
    assert.deepEqual(deniedImages.calls, []);
  } finally { await deniedApp.close(); }

  const disabledImages = trackedImages();
  const disabledApp = buildApp(disabled, { logger: false, images: disabledImages.images });
  try {
    const response = await disabledApp.inject({ method: 'POST', url: '/api/v1/admin/product-images',
      headers: { ...authorization, 'content-type': 'image/png' }, payload: Buffer.alloc(5 * 1024 * 1024 + 1) });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'BACKEND_DISABLED');
    assert.deepEqual(disabledImages.calls, []);
  } finally { await disabledApp.close(); }

  const images = trackedImages();
  const app = buildApp(enabled, { logger: false, verifier: trackedVerifier().verifier, images: images.images });
  try {
    for (const contentType of ['image/png', 'image/jpeg', 'image/webp']) {
      const accepted = await app.inject({ method: 'POST', url: '/api/v1/admin/product-images', headers: {
        ...authorization, 'content-type': contentType,
      }, payload: Buffer.alloc(70 * 1024) });
      assert.equal(accepted.statusCode, 201, contentType);
    }
    for (const contentType of ['image/gif', 'image/svg+xml', 'application/octet-stream']) {
      const rejected = await app.inject({ method: 'POST', url: '/api/v1/admin/product-images', headers: {
        ...authorization, 'content-type': contentType,
      }, payload: Buffer.from('not an accepted upload') });
      assert.equal(rejected.statusCode, 415, contentType);
    }
    const jsonTooLarge = await app.inject({ method: 'POST', url: '/api/v1/admin/suppliers', headers: {
      ...authorization, 'content-type': 'application/json',
    }, payload: JSON.stringify({ field: 'x'.repeat(70 * 1024) }) });
    assert.equal(jsonTooLarge.statusCode, 413);
    assert.deepEqual(images.calls, ['image/png', 'image/jpeg', 'image/webp'].map(contentType => ({ kind: 'upload', contentType })));
  } finally { await app.close(); }
});

test('product create and update validate attached image metadata before repository writes', async () => {
  const tracked = trackedCatalog();
  const images = trackedImages();
  const app = buildApp(enabled, { logger: false, verifier: trackedVerifier().verifier, catalog: tracked.catalog, images: images.images });
  try {
    const create = await app.inject({ method: 'POST', url: '/api/v1/admin/products', headers: authorization,
      payload: { ...productPayload, images: [productImage] } });
    assert.equal(create.statusCode, 201);
    const update = await app.inject({ method: 'PUT', url: `/api/v1/admin/products/${requestId}`, headers: authorization,
      payload: { ...productPayload, images: [productImage], expectedVersion: 1 } });
    assert.equal(update.statusCode, 200);
    assert.deepEqual(images.calls, [
      { kind: 'validate', images: [productImage] }, { kind: 'validate', images: [productImage] },
    ]);
    for (const request of [
      { method: 'POST' as const, url: '/api/v1/admin/products', payload: { ...productPayload, images: [{ ...productImage, width: 0 }] } },
      { method: 'PUT' as const, url: `/api/v1/admin/products/${requestId}`, payload: { ...productPayload, images: [{ ...productImage, url: 'https://attacker.example/x' }], expectedVersion: 1 } },
    ]) assert.equal((await app.inject({ ...request, headers: authorization })).statusCode, 400);
    assert.deepEqual(tracked.calls, ['create-product', 'update-product']);
    assert.equal(images.calls.length, 2);
  } finally { await app.close(); }
});

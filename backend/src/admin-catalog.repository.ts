import { createHash, randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import type { Firestore, Query } from 'firebase-admin/firestore';
import type { VerifiedIdentity } from './auth.js';
import { ApiError } from './errors.js';
import { exact, object, parseProductInput, parseProductRecord, parseSupplierInput, parseSupplierRecord, uuid, parseProductId, parseProductUpdate, parseProductCommand, parsePublishedProduct, publicProjection, validVersion, parseReferenceIds, parseProductQuery, parseSupplierUpdate, parseSupplierStatus } from './admin-catalog.js';
import type { AdminCatalogRepository, AdminPage, AdminProduct, AdminSupplier, ProductInput, SupplierInput, ProductCommand, ProductUpdateInput, PublishedProduct, ProductListFilters, SupplierUpdateInput, SupplierStatusInput } from './admin-catalog.js';
import type { ProductImageLifecycle } from './product-image-lifecycle.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalizedName = (name: string) => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** API-only private masters; atomic identity, idempotency and audit writes. */
export class FirestoreAdminCatalogRepository implements AdminCatalogRepository {
  constructor(private readonly database: () => Firestore, private readonly now = () => new Date(), private readonly imageLifecycle?: ProductImageLifecycle) {}

  suppliers(cursor: string | null): Promise<AdminPage<AdminSupplier>> {
    return this.list('suppliers', cursor, parseSupplierRecord);
  }
  async products(cursor: string | null, rawFilters: ProductListFilters = {}): Promise<AdminPage<AdminProduct>> {
    try {
      const { filters } = parseProductQuery(rawFilters);
      const fingerprint = hash(JSON.stringify(filters));
      let query: Query = this.database().collection('products');
      for (const key of ['brand', 'category', 'supplierId'] as const) if (filters[key]) query = query.where(key, '==', filters[key]);
      // Fixed SKU ordering supports a bounded prefix range without a paid search service.
      query = query.orderBy('sku').orderBy(FieldPath.documentId());
      if (filters.skuPrefix) query = query.where('sku', '>=', filters.skuPrefix).where('sku', '<', filters.skuPrefix + '\uf8ff');
      if (cursor !== null) {
        if (!/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) throw new ApiError(400, 'INVALID_CURSOR', 'Invalid page cursor.');
        let data: unknown;
        try { data = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { throw new ApiError(400, 'INVALID_CURSOR', 'Invalid page cursor.'); }
        if (!object(data) || !exact(data, ['filter', 'sku', 'id']) || data['filter'] !== fingerprint || !uuid(data['id'])
          || typeof data['sku'] !== 'string' || !/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(data['sku'])) throw new ApiError(400, 'INVALID_CURSOR', 'Cursor does not match these filters.');
        query = query.startAfter(data['sku'], data['id']);
      }
      const page = await query.limit(51).get();
      const items = page.docs.slice(0, 50).map(doc => parseProductRecord(doc.data(), doc.id));
      const last = items.at(-1);
      return { items, nextCursor: page.docs.length > 50 && last ? Buffer.from(JSON.stringify({ filter: fingerprint, sku: last.sku, id: last.id })).toString('base64url') : null };
    } catch (error) { throw this.sanitize(error); }
  }
  async productBrands(cursor: string | null): Promise<AdminPage<string>> {
    try {
      if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 80 || cursor.trim() !== cursor || /[\u0000-\u001f\u007f]/.test(cursor)))
        throw new ApiError(400, 'INVALID_CURSOR', 'Invalid brand cursor.');
      let query = this.database().collection('products').select('brand').orderBy('brand').where('brand', '>', '').limit(51);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      const values = page.docs.slice(0, 50).map(doc => {
        const brand: unknown = doc.get('brand');
        if (typeof brand !== 'string' || !brand || brand.length > 80 || brand.trim() !== brand || /[\u0000-\u001f\u007f]/.test(brand)) throw new ApiError(503, 'CATALOG_DATA_INVALID', 'Stored brands need review.');
        return brand;
      });
      return { items: [...new Set(values)], nextCursor: page.docs.length > 50 ? values.at(-1)! : null };
    } catch (error) { throw this.sanitize(error); }
  }
  publishedProducts(cursor: string | null): Promise<AdminPage<PublishedProduct>> {
    return this.list('publishedProducts', cursor, parsePublishedProduct);
  }
  product(id: string): Promise<AdminProduct> { return this.get('products', id, parseProductRecord); }
  supplier(id: string): Promise<AdminSupplier> { return this.get('suppliers', id, parseSupplierRecord); }
  updateSupplier(identity: VerifiedIdentity, id: string, input: SupplierUpdateInput): Promise<AdminSupplier> {
    return this.mutateSupplier(identity, id, 'updated', parseSupplierUpdate(input));
  }
  setSupplierStatus(identity: VerifiedIdentity, id: string, input: SupplierStatusInput): Promise<AdminSupplier> {
    return this.mutateSupplier(identity, id, 'status', parseSupplierStatus(input));
  }
  private async mutateSupplier(identity: VerifiedIdentity, rawId: string, action: 'updated' | 'status', input: SupplierUpdateInput | SupplierStatusInput): Promise<AdminSupplier> {
    try {
      if (!identity.uid || identity.uid.length > 128 || /[\u0000-\u001f\u007f]/.test(identity.uid)) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid account identity is required.');
      const id = parseProductId(rawId), db = this.database();
      const entity = db.collection('suppliers').doc(id);
      const receiptId = hash(identity.uid) + '-supplier-' + input.requestId;
      const receipt = db.collection('adminSupplierRequests').doc(receiptId);
      const payloadHash = hash(JSON.stringify({ id, action, input }));
      return await db.runTransaction(async tx => {
        const previous = await tx.get(receipt), saved = await tx.get(entity);
        if (!saved.exists) throw new ApiError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found.');
        const current = parseSupplierRecord(saved.data(), id);
        if (previous.exists) {
          const data = previous.data();
          if (!object(data) || !exact(data, ['schemaVersion', 'actorUid', 'entityId', 'payloadHash', 'version'])
            || data['schemaVersion'] !== 1 || data['actorUid'] !== identity.uid || data['entityId'] !== id || !validVersion(data['version'])
            || typeof data['payloadHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(data['payloadHash'])) throw new ApiError(503, 'CATALOG_DATA_INVALID', 'Stored request data needs review.');
          if (data['payloadHash'] !== payloadHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Request ID already used for different details.');
          if (data['version'] !== current.version) throw new ApiError(409, 'SUPPLIER_CHANGED', 'Supplier changed after this operation. Reload.');
          return current;
        }
        if (current.version !== input.expectedVersion || current.version >= Number.MAX_SAFE_INTEGER - 1) throw new ApiError(409, 'SUPPLIER_CHANGED', 'Supplier changed elsewhere. Reload.');
        const { requestId: _requestId, expectedVersion: _expectedVersion, ...fields } = input;
        const result = parseSupplierRecord({ ...current, ...fields, version: current.version + 1, updatedAt: this.now().toISOString() }, id);
        const oldName = normalizedName(current.name), newName = normalizedName(result.name);
        const oldKey = db.collection('supplierNameKeys').doc(hash(oldName)), newKey = db.collection('supplierNameKeys').doc(hash(newName));
        const oldUnique = await tx.get(oldKey), newUnique = oldName === newName ? oldUnique : await tx.get(newKey);
        if (!oldUnique.exists || oldUnique.get('entityId') !== id) throw new ApiError(503, 'CATALOG_DATA_INVALID', 'Stored supplier name needs review.');
        if (newUnique.exists && newUnique.get('entityId') !== id) throw new ApiError(409, 'DUPLICATE_SUPPLIER', 'A supplier with this name already exists.');
        if (oldName !== newName) { tx.delete(oldKey); tx.set(newKey, { schemaVersion: 1, entityId: id, key: newName }); }
        tx.set(entity, result);
        tx.create(receipt, { schemaVersion: 1, actorUid: identity.uid, entityId: id, payloadHash, version: result.version });
        tx.create(db.collection('adminCatalogAudit').doc(receiptId), { schemaVersion: 1, action: 'supplier.' + (action === 'status' ? result.status : 'updated'),
          entityId: id, actorUid: identity.uid, at: result.updatedAt, requestId: input.requestId, version: result.version });
        return result;
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }
  publishedProduct(id: string): Promise<PublishedProduct> { return this.get('publishedProducts', id, parsePublishedProduct); }
  async publishedReferences(rawIds: readonly string[]): Promise<PublishedProduct[]> {
    try {
      const ids = parseReferenceIds({ ids: rawIds });
      const db = this.database();
      const docs = await db.getAll(...ids.map(id => db.collection('publishedProducts').doc(id)));
      return docs.filter(doc => doc.exists).map(doc => parsePublishedProduct(doc.data(), doc.id));
    } catch (error) { throw this.sanitize(error); }
  }
  private async get<T>(collection: string, rawId: string, parse: (value: unknown, id: string) => T): Promise<T> {
    try {
      const id = parseProductId(rawId);
      const saved = await this.database().collection(collection).doc(id).get();
      if (!saved.exists) throw new ApiError(404, collection === 'suppliers' ? 'SUPPLIER_NOT_FOUND' : 'PRODUCT_NOT_FOUND', 'Catalog record not found.');
      return parse(saved.data(), id);
    } catch (error) { throw this.sanitize(error); }
  }
  updateProduct(identity: VerifiedIdentity, id: string, input: ProductUpdateInput): Promise<AdminProduct> {
    return this.mutate(identity, id, 'updated', parseProductUpdate(input));
  }
  publishProduct(identity: VerifiedIdentity, id: string, input: ProductCommand): Promise<AdminProduct> {
    return this.mutate(identity, id, 'published', parseProductCommand(input));
  }
  unpublishProduct(identity: VerifiedIdentity, id: string, input: ProductCommand): Promise<AdminProduct> {
    return this.mutate(identity, id, 'unpublished', parseProductCommand(input));
  }
  private async mutate(identity: VerifiedIdentity, rawId: string, action: 'updated' | 'published' | 'unpublished', input: ProductCommand | ProductUpdateInput): Promise<AdminProduct> {
    try {
      if (!identity.uid || identity.uid.length > 128 || /[\u0000-\u001f\u007f]/.test(identity.uid)) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid account identity is required.');
      const id = parseProductId(rawId);
      const db = this.database();
      const entity = db.collection('products').doc(id);
      const publicEntity = db.collection('publishedProducts').doc(id);
      const receiptId = `${hash(identity.uid)}-product-${input.requestId}`;
      const receipt = db.collection('adminProductRequests').doc(receiptId);
      const payloadHash = hash(JSON.stringify({ id, action, input }));
      let removedImageIds: string[] = [];
      const committed = await db.runTransaction(async tx => {
        removedImageIds = [];
        // All reads precede writes, including retry and supplier checks.
        const previous = await tx.get(receipt);
        const saved = await tx.get(entity);
        if (!saved.exists) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
        const current = parseProductRecord(saved.data(), id);
        if (previous.exists) {
          const data = previous.data();
          if (!object(data) || !exact(data, ['schemaVersion', 'actorUid', 'entityId', 'payloadHash', 'version'])
            || data['schemaVersion'] !== 1 || data['actorUid'] !== identity.uid || data['entityId'] !== id
            || !validVersion(data['version']) || typeof data['payloadHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(data['payloadHash'])) {
            throw new ApiError(503, 'CATALOG_DATA_INVALID', 'Stored request data needs review.');
          }
          if (data['payloadHash'] !== payloadHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Request ID already used for different details.');
          if (current.version !== data['version']) throw new ApiError(409, 'PRODUCT_CHANGED', 'Product changed after this operation. Reload before continuing.');
          return current;
        }
        if (current.version !== input.expectedVersion) throw new ApiError(409, 'PRODUCT_CHANGED', 'Product changed elsewhere. Reload before continuing.');
        if (current.version >= Number.MAX_SAFE_INTEGER - 1) throw new ApiError(409, 'PRODUCT_CHANGED', 'Product version needs review.');
        if (action === 'unpublished' && current.state !== 'published') throw new ApiError(409, 'PRODUCT_NOT_PUBLISHED', 'Product is not published.');
        const { requestId: _requestId, expectedVersion: _expectedVersion, ...fields } = input;
        if (action === 'updated' && (fields as ProductInput).sku !== current.sku) throw new ApiError(400, 'SKU_IMMUTABLE', 'SKU cannot be changed after creation.');
        const at = this.now().toISOString();
        const updated: AdminProduct = { ...current, ...(action === 'updated' ? fields : {}), version: current.version + 1, updatedAt: at };
        if (action !== 'unpublished') {
          const supplier = await tx.get(db.collection('suppliers').doc(updated.supplierId));
          if (!supplier.exists) throw new ApiError(400, 'INVALID_SUPPLIER', 'Choose an existing active supplier.');
          const source = parseSupplierRecord(supplier.data(), supplier.id);
          if (source.status !== 'active' && (action === 'published' || updated.supplierId !== current.supplierId))
            throw new ApiError(400, 'INVALID_SUPPLIER', 'Choose an existing active supplier.');
        }
        if (action === 'published') { updated.state = 'published'; updated.publishedVersion = updated.version; }
        if (action === 'unpublished') { updated.state = 'draft'; delete updated.publishedVersion; }
        const result = parseProductRecord(updated, id);
        const projection = action === 'published' ? parsePublishedProduct(publicProjection(result, at), id) : null;
        const oldPublic = action !== 'updated' ? await tx.get(publicEntity) : null;
        removedImageIds = await this.imageLifecycle?.stage(tx, current.images ?? [], result.images ?? [],
          oldPublic?.exists ? parsePublishedProduct(oldPublic.data(), id).images ?? [] : [],
          projection?.images ?? []) ?? [];
        tx.set(entity, result);
        if (projection) tx.set(publicEntity, projection);
        if (action === 'unpublished') tx.delete(publicEntity);
        tx.create(receipt, { schemaVersion: 1, actorUid: identity.uid, entityId: id, payloadHash, version: result.version });
        tx.create(db.collection('adminCatalogAudit').doc(receiptId), {
          schemaVersion: 1, action: `product.${action}`, entityId: id, actorUid: identity.uid, at, requestId: input.requestId, version: result.version,
        });
        return result;
      }, { maxAttempts: 3 });
      await this.imageLifecycle?.sweep(removedImageIds);
      return committed;
    } catch (error) { throw this.sanitize(error); }
  }
  private async list<T>(collection: string, cursor: string | null, parse: (value: unknown, id: string) => T): Promise<AdminPage<T>> {
    try {
      if (cursor !== null && !uuid(cursor)) throw new ApiError(400, 'INVALID_CURSOR', 'Enter a valid page cursor.');
      let query = this.database().collection(collection).orderBy(FieldPath.documentId()).limit(51);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      const visible = page.docs.slice(0, 50);
      return { items: visible.map(doc => parse(doc.data(), doc.id)), nextCursor: page.docs.length > 50 ? visible.at(-1)!.id : null };
    } catch (error) { throw this.sanitize(error); }
  }
  async createSupplier(identity: VerifiedIdentity, raw: SupplierInput): Promise<AdminSupplier> {
    const input = parseSupplierInput(raw);
    return this.create('supplier', identity, input) as Promise<AdminSupplier>;
  }
  async createProduct(identity: VerifiedIdentity, raw: ProductInput): Promise<AdminProduct> {
    const input = parseProductInput(raw);
    return this.create('product', identity, input) as Promise<AdminProduct>;
  }
  private async create(kind: 'supplier' | 'product', identity: VerifiedIdentity, input: SupplierInput | ProductInput): Promise<AdminSupplier | AdminProduct> {
    try {
      if (!identity.uid || identity.uid.length > 128 || /[\u0000-\u001f\u007f]/.test(identity.uid)) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'A valid account identity is required.');
      }
      const db = this.database();
      const { requestId, ...fields } = input;
      const payloadHash = hash(JSON.stringify(fields));
      const receipt = db.collection('adminCreateRequests').doc(`${hash(identity.uid)}-${kind}-${requestId}`);
      const collection = kind === 'supplier' ? 'suppliers' : 'products';
      const id = randomUUID();
      const entity = db.collection(collection).doc(id);
      const keyText = kind === 'supplier' ? normalizedName((input as SupplierInput).name) : (input as ProductInput).sku;
      const unique = db.collection(kind === 'supplier' ? 'supplierNameKeys' : 'productSkuKeys').doc(hash(keyText));
      const at = this.now().toISOString();
      return await db.runTransaction(async tx => {
        const previous = await tx.get(receipt);
        if (previous.exists) {
          const data: unknown = previous.data();
          if (!object(data) || !exact(data, ['schemaVersion', 'actorUid', 'kind', 'payloadHash', 'entityId'])
            || data['schemaVersion'] !== 1 || data['actorUid'] !== identity.uid || data['kind'] !== kind
            || !uuid(data['entityId']) || typeof data['payloadHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(data['payloadHash'])) {
            throw new ApiError(503, 'CATALOG_DATA_INVALID', 'Stored request data needs review.');
          }
          if (data['payloadHash'] !== payloadHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This request ID was already used for different details.');
          const saved = await tx.get(db.collection(collection).doc(data['entityId']));
          const result = kind === 'supplier' ? parseSupplierRecord(saved.data(), saved.id) : parseProductRecord(saved.data(), saved.id);
          if (result.createdBy !== identity.uid) throw new ApiError(503, 'CATALOG_DATA_INVALID', 'Stored request data needs review.');
          return result;
        }
        if ((await tx.get(unique)).exists) {
          throw new ApiError(409, kind === 'supplier' ? 'DUPLICATE_SUPPLIER' : 'DUPLICATE_SKU',
            kind === 'supplier' ? 'A supplier with this name already exists.' : 'This SKU already exists.');
        }
        if (kind === 'product') {
          const supplier = await tx.get(db.collection('suppliers').doc((input as ProductInput).supplierId));
          if (!supplier.exists) throw new ApiError(400, 'INVALID_SUPPLIER', 'Choose an existing active supplier.');
          if (parseSupplierRecord(supplier.data(), supplier.id).status !== 'active') throw new ApiError(400, 'INVALID_SUPPLIER', 'Choose an existing active supplier.');
        }
        const metadata = { id, schemaVersion: 1 as const, version: 1 as const, createdBy: identity.uid, createdAt: at, updatedAt: at };
        const record = kind === 'supplier'
          ? { ...fields, ...metadata, status: 'active' as const }
          : { ...fields, ...metadata, state: 'draft' as const, currency: 'PHP' as const };
        // Validate the exact stored shape before committing any write.
        const result = kind === 'supplier' ? parseSupplierRecord(record, id) : parseProductRecord(record, id);
        if (kind === 'product') await this.imageLifecycle?.stage(tx, [], (result as AdminProduct).images ?? []);
        tx.create(entity, result);
        tx.create(unique, { schemaVersion: 1, entityId: id, key: keyText });
        tx.create(receipt, { schemaVersion: 1, actorUid: identity.uid, kind, payloadHash, entityId: id });
        tx.create(db.collection('adminCatalogAudit').doc(`${kind}-${id}`), {
          schemaVersion: 1, action: `${kind}.created`, entityId: id, actorUid: identity.uid, at, requestId,
        });
        return result;
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }
  private sanitize(error: unknown): ApiError {
    return error instanceof ApiError ? error : new ApiError(503, 'CATALOG_UNAVAILABLE', 'Catalog storage is temporarily unavailable.');
  }
}

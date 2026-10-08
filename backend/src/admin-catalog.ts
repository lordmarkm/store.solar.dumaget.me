import { ApiError } from './errors.js';
import type { VerifiedIdentity } from './auth.js';
import { parseProductImages } from './product-images.js';
import type { ProductImage } from './product-images.js';

export interface SupplierInput {
  requestId: string; name: string; region: string; description: string;
  website: string; email: string; phone: string;
}
export interface ProductInput {
  requestId: string; sku: string; name: string; brand: string;
  category: 'Panels' | 'Inverters' | 'Batteries' | 'Mounting' | 'Protection' | null;
  unitCode: 'unit' | 'panel' | 'kit' | null; description: string;
  amountMinor: number | null; supplierId: string;
  panelSpecifications?: PanelSpecifications | null;
  images?: ProductImage[];
}
export const panelSpecificationKeys = ['productCode', 'eanCode', 'lightColor', 'cable', 'ratedMaximumPower',
  'shortCircuitCurrentTolerance', 'openCircuitVoltageTolerance', 'ipRating', 'dimensions', 'standardTestConditions',
  'safetyClass', 'maxSystemVoltage', 'grossWeight', 'netWeight', 'warranty'] as const;
export type PanelSpecificationKey = typeof panelSpecificationKeys[number];
export type PanelSpecifications = Partial<Record<PanelSpecificationKey, string>>;
interface RecordMetadata {
  id: string; schemaVersion: 1; version: number; createdBy: string;
  createdAt: string; updatedAt: string;
}
export interface AdminSupplier extends Omit<SupplierInput, 'requestId'>, RecordMetadata { status: 'active' | 'inactive' }
export interface SupplierUpdateInput extends SupplierInput { expectedVersion: number }
export interface SupplierStatusInput extends ProductCommand { status: 'active' | 'inactive' }
export interface ProductListFilters { skuPrefix?: string; brand?: string; category?: string; supplierId?: string }
export interface AdminProduct extends Omit<ProductInput, 'requestId'>, RecordMetadata { state: 'draft' | 'published'; currency: 'PHP'; publishedVersion?: number }
export interface ProductCommand { requestId: string; expectedVersion: number }
export interface ProductUpdateInput extends ProductInput { expectedVersion: number }
export interface PublishedProduct {
  id: string; schemaVersion: 1; version: number; publishedAt: string;
  sku: string; name: string; brand: string; category: NonNullable<ProductInput['category']>;
  unitCode: NonNullable<ProductInput['unitCode']>; description: string; amountMinor: number; currency: 'PHP';
  panelSpecifications?: PanelSpecifications | null;
  images?: ProductImage[];
}
export interface AdminPage<T> { items: T[]; nextCursor: string | null }
export interface AdminCatalogRepository {
  suppliers(cursor: string | null): Promise<AdminPage<AdminSupplier>>;
  products(cursor: string | null, filters?: ProductListFilters): Promise<AdminPage<AdminProduct>>;
  productBrands(cursor: string | null): Promise<AdminPage<string>>;
  supplier(id: string): Promise<AdminSupplier>;
  updateSupplier(identity: VerifiedIdentity, id: string, input: SupplierUpdateInput): Promise<AdminSupplier>;
  setSupplierStatus(identity: VerifiedIdentity, id: string, input: SupplierStatusInput): Promise<AdminSupplier>;
  createSupplier(identity: VerifiedIdentity, input: SupplierInput): Promise<AdminSupplier>;
  createProduct(identity: VerifiedIdentity, input: ProductInput): Promise<AdminProduct>;
  product(id: string): Promise<AdminProduct>;
  updateProduct(identity: VerifiedIdentity, id: string, input: ProductUpdateInput): Promise<AdminProduct>;
  publishProduct(identity: VerifiedIdentity, id: string, input: ProductCommand): Promise<AdminProduct>;
  unpublishProduct(identity: VerifiedIdentity, id: string, input: ProductCommand): Promise<AdminProduct>;
  publishedProducts(cursor: string | null): Promise<AdminPage<PublishedProduct>>;
  publishedProduct(id: string): Promise<PublishedProduct>;
  publishedReferences(ids: readonly string[]): Promise<PublishedProduct[]>;
}

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
}
function invalid(): never { throw new ApiError(400, 'INVALID_CATALOG_INPUT', 'Enter valid supplier or product details.'); }
function text(value: unknown, max: number, required = false, multiline = false): string {
  if (typeof value !== 'string' || value.length > max
    || (multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) invalid();
  const result = value.trim();
  if (required && !result) invalid();
  return result;
}
const supplierFields = ['requestId', 'name', 'region', 'description', 'website', 'email', 'phone'] as const;
const productFields = ['requestId', 'sku', 'name', 'brand', 'category', 'unitCode', 'description', 'amountMinor', 'supplierId'] as const;
const metadataFields = ['id', 'schemaVersion', 'version', 'createdBy', 'createdAt', 'updatedAt'];
function optionalProductKeys(value: Record<string, unknown>): string[] {
  return ['panelSpecifications', 'images'].filter(key => Object.hasOwn(value, key));
}

export function parseSupplierInput(value: unknown): SupplierInput {
  if (!object(value) || !exact(value, supplierFields) || !uuid(value['requestId'])) invalid();
  const website = text(value['website'], 500);
  if (website) {
    try {
      const url = new URL(website);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) invalid();
    } catch { invalid(); }
  }
  const email = text(value['email'], 320);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid();
  return {
    requestId: value['requestId'].toLowerCase(), name: text(value['name'], 160, true),
    region: text(value['region'], 120), description: text(value['description'], 4000, false, true),
    website, email, phone: text(value['phone'], 80),
  };
}
export function parseProductInput(value: unknown): ProductInput {
  if (!object(value) || !exact(value, [...productFields, ...optionalProductKeys(value)])
    || !uuid(value['requestId']) || !uuid(value['supplierId'])) invalid();
  const sku = text(value['sku'], 64, true).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku)) invalid();
  const category = value['category'];
  const unitCode = value['unitCode'];
  if (category !== null && (typeof category !== 'string' || !['Panels', 'Inverters', 'Batteries', 'Mounting', 'Protection'].includes(category))) invalid();
  if (unitCode !== null && (typeof unitCode !== 'string' || !['unit', 'panel', 'kit'].includes(unitCode))) invalid();
  // Never convert fractional pesos or trust a browser-provided currency/tax value.
  const amountMinor = value['amountMinor'];
  if (amountMinor !== null && (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor)
    || amountMinor < 0 || amountMinor > 99_999_999_999_999)) invalid();
  const result: ProductInput = {
    requestId: value['requestId'].toLowerCase(), sku, name: text(value['name'], 160, true),
    brand: text(value['brand'], 80), category: category as ProductInput['category'],
    unitCode: unitCode as ProductInput['unitCode'], description: text(value['description'], 4000, false, true),
    amountMinor: amountMinor as number | null, supplierId: value['supplierId'].toLowerCase(),
  };
  if (Object.hasOwn(value, 'panelSpecifications')) {
    if (value['panelSpecifications'] === null) result.panelSpecifications = null;
    else {
      if (category !== 'Panels') invalid();
      result.panelSpecifications = parsePanelSpecifications(value['panelSpecifications']);
    }
  }
  if (Object.hasOwn(value, 'images')) result.images = parseProductImages(value['images']);
  return result;
}
export function parsePanelSpecifications(value: unknown): PanelSpecifications {
  if (!object(value) || Object.keys(value).some(key => !(panelSpecificationKeys as readonly string[]).includes(key))) invalid();
  const result: PanelSpecifications = {};
  for (const key of panelSpecificationKeys) if (Object.hasOwn(value, key)) {
    const multiline = key === 'standardTestConditions' || key === 'warranty';
    result[key] = text(value[key], key === 'standardTestConditions' ? 500 : key === 'warranty' ? 1000 : 200, false, multiline);
  }
  return result;
}
export function parseCursor(value: unknown): string | null {
  if (!object(value) || Object.keys(value).some(key => key !== 'cursor')) invalid();
  if (value['cursor'] === undefined) return null;
  if (!uuid(value['cursor'])) invalid();
  return value['cursor'].toLowerCase();
}
export function parseProductQuery(value: unknown): { cursor: string | null; filters: ProductListFilters } {
  if (!object(value) || Object.keys(value).some(key => !['cursor', 'skuPrefix', 'brand', 'category', 'supplierId'].includes(key))) invalid();
  const filters: ProductListFilters = {};
  if (value['skuPrefix'] !== undefined) {
    const prefix = text(value['skuPrefix'], 64, true).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(prefix)) invalid();
    filters.skuPrefix = prefix;
  }
  if (value['brand'] !== undefined) filters.brand = text(value['brand'], 80, true);
  if (value['category'] !== undefined) {
    const category = text(value['category'], 32, true);
    if (!['Panels', 'Inverters', 'Batteries', 'Mounting', 'Protection'].includes(category)) invalid();
    filters.category = category;
  }
  if (value['supplierId'] !== undefined) filters.supplierId = parseProductId(value['supplierId']);
  const cursor = value['cursor'] ?? null;
  if (cursor !== null && (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(cursor))) invalid();
  return { cursor: cursor as string | null, filters };
}
export function parseBrandCursor(value: unknown): string | null {
  if (!object(value) || Object.keys(value).some(key => key !== 'cursor')) invalid();
  return value['cursor'] === undefined ? null : text(value['cursor'], 80, true);
}
export function parseSupplierUpdate(value: unknown): SupplierUpdateInput {
  if (!object(value) || !exact(value, [...supplierFields, 'expectedVersion']) || !validVersion(value['expectedVersion'])) invalid();
  const { expectedVersion, ...fields } = value;
  return { ...parseSupplierInput(fields), expectedVersion: expectedVersion as number };
}
export function parseSupplierStatus(value: unknown): SupplierStatusInput {
  if (!object(value) || !exact(value, ['requestId', 'expectedVersion', 'status']) || !['active', 'inactive'].includes(value['status'] as string)) invalid();
  return { ...parseProductCommand({ requestId: value['requestId'], expectedVersion: value['expectedVersion'] }), status: value['status'] as SupplierStatusInput['status'] };
}
function iso(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 24) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function validMetadata(value: Record<string, unknown>, id: string): boolean {
  return value['id'] === id && uuid(id) && id === id.toLowerCase() && value['schemaVersion'] === 1 && validVersion(value['version'])
    && typeof value['createdBy'] === 'string' && value['createdBy'].length > 0 && value['createdBy'].length <= 128
    && !/[\u0000-\u001f\u007f]/.test(value['createdBy'])
    && iso(value['createdAt']) && iso(value['updatedAt']) && value['createdAt'] <= value['updatedAt'];
}
export function parseSupplierRecord(value: unknown, id: string): AdminSupplier {
  try {
    if (!object(value) || !exact(value, [...supplierFields.filter(key => key !== 'requestId'), ...metadataFields, 'status'])
      || !validMetadata(value, id) || !['active', 'inactive'].includes(value['status'] as string)) invalid();
    const parsed = parseSupplierInput({ requestId: id, name: value['name'], region: value['region'],
      description: value['description'], website: value['website'], email: value['email'], phone: value['phone'] });
    const { requestId: _requestId, ...input } = parsed;
    for (const key of Object.keys(input)) if (input[key as keyof typeof input] !== value[key]) invalid();
    return value as unknown as AdminSupplier;
  } catch { throw new ApiError(503, 'CATALOG_DATA_INVALID', 'Stored catalog data needs review.'); }
}
export function parseProductRecord(value: unknown, id: string): AdminProduct {
  try {
    if (!object(value)) invalid();
    const allowed = [...productFields.filter(key => key !== 'requestId'), ...metadataFields, 'state', 'currency', ...(value['state'] === 'published' ? ['publishedVersion'] : []), ...optionalProductKeys(value)];
    if (!exact(value, allowed)
      || !validMetadata(value, id) || !['draft', 'published'].includes(value['state'] as string) || value['currency'] !== 'PHP'
      || (value['state'] === 'published' && (!validVersion(value['publishedVersion']) || value['publishedVersion'] > (value['version'] as number)))) invalid();
    const parsed = parseProductInput({ requestId: id, sku: value['sku'], name: value['name'], brand: value['brand'],
      category: value['category'], unitCode: value['unitCode'], description: value['description'],
      amountMinor: value['amountMinor'], supplierId: value['supplierId'],
      ...(Object.hasOwn(value, 'panelSpecifications') ? { panelSpecifications: value['panelSpecifications'] } : {}),
      ...(Object.hasOwn(value, 'images') ? { images: value['images'] } : {}) });
    const { requestId: _requestId, ...input } = parsed;
    for (const key of Object.keys(input)) if (key !== 'panelSpecifications' && key !== 'images' && input[key as keyof typeof input] !== value[key]) invalid();
    if (Object.hasOwn(value, 'panelSpecifications')) {
      if (parsed.panelSpecifications === null ? value['panelSpecifications'] !== null : !object(value['panelSpecifications'])) invalid();
      if (parsed.panelSpecifications && object(value['panelSpecifications'])) {
        const storedSpecs = value['panelSpecifications'];
        if (Object.keys(parsed.panelSpecifications).length !== Object.keys(storedSpecs).length
          || Object.keys(parsed.panelSpecifications).some(key => parsed.panelSpecifications?.[key as PanelSpecificationKey] !== storedSpecs[key])) invalid();
      }
    }
    return { ...value, ...(Object.hasOwn(value, 'panelSpecifications') ? { panelSpecifications: parsed.panelSpecifications } : {}),
      ...(Object.hasOwn(value, 'images') ? { images: parsed.images } : {}) } as unknown as AdminProduct;
  } catch { throw new ApiError(503, 'CATALOG_DATA_INVALID', 'Stored catalog data needs review.'); }
}

export function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
}
export function parseProductId(value: unknown): string {
  if (!uuid(value)) invalid();
  return value.toLowerCase();
}
export function parseReferenceIds(value: unknown): string[] {
  if (!object(value) || !exact(value, ['ids']) || !Array.isArray(value['ids']) || value['ids'].length < 1 || value['ids'].length > 20) invalid();
  const ids = value['ids'].map(parseProductId);
  if (new Set(ids).size !== ids.length) invalid();
  return ids;
}
export function parseProductCommand(value: unknown): ProductCommand {
  if (!object(value) || !exact(value, ['requestId', 'expectedVersion']) || !uuid(value['requestId']) || !validVersion(value['expectedVersion'])) invalid();
  return { requestId: value['requestId'].toLowerCase(), expectedVersion: value['expectedVersion'] };
}
export function parseProductUpdate(value: unknown): ProductUpdateInput {
  if (!object(value) || !exact(value, [...productFields, ...optionalProductKeys(value), 'expectedVersion'])
    || !validVersion(value['expectedVersion'])) invalid();
  const { expectedVersion, ...input } = value;
  return { ...parseProductInput(input), expectedVersion: expectedVersion as number };
}
export function publicationBlockers(product: Pick<AdminProduct, 'brand' | 'category' | 'unitCode' | 'description' | 'amountMinor' | 'images'>, requireImages = true): string[] {
  return [!product.brand.trim() ? 'brand' : '', !product.category ? 'category' : '', !product.unitCode ? 'sellable unit' : '',
    !product.description.trim() ? 'description' : '', product.amountMinor === null ? 'price' : '',
    requireImages && !product.images?.length ? 'product image' : ''].filter(Boolean);
}
export function publicProjection(product: AdminProduct, at: string): PublishedProduct {
  const blockers = publicationBlockers(product);
  if (blockers.length) throw new ApiError(422, 'PRODUCT_NOT_READY', `Complete ${blockers.join(', ')} before publishing.`);
  return { id: product.id, schemaVersion: 1, version: product.version, publishedAt: at, sku: product.sku, name: product.name,
    brand: product.brand, category: product.category!, unitCode: product.unitCode!, description: product.description,
    amountMinor: product.amountMinor!, currency: 'PHP', ...(Object.hasOwn(product, 'panelSpecifications') ? { panelSpecifications: product.panelSpecifications } : {}),
    ...(Object.hasOwn(product, 'images') ? { images: product.images } : {}) };
}
export function parsePublishedProduct(value: unknown, id: string): PublishedProduct {
  try {
    const publishedFields = ['id', 'schemaVersion', 'version', 'publishedAt', 'sku', 'name', 'brand', 'category', 'unitCode', 'description', 'amountMinor', 'currency'];
    if (!object(value) || !exact(value, [...publishedFields, ...optionalProductKeys(value)])
      || value['id'] !== id || id !== id.toLowerCase() || !uuid(id) || value['schemaVersion'] !== 1 || !validVersion(value['version']) || !iso(value['publishedAt']) || value['currency'] !== 'PHP') invalid();
    const parsed = parseProductInput({ requestId: id, supplierId: id, sku: value['sku'], name: value['name'], brand: value['brand'], category: value['category'],
      unitCode: value['unitCode'], description: value['description'], amountMinor: value['amountMinor'],
      ...(Object.hasOwn(value, 'panelSpecifications') ? { panelSpecifications: value['panelSpecifications'] } : {}),
      ...(Object.hasOwn(value, 'images') ? { images: value['images'] } : {}) });
    // Read historical projections honestly; require pictures only on the next publish/republish.
    if (publicationBlockers(parsed, false).length) invalid();
    for (const key of ['sku', 'name', 'brand', 'category', 'unitCode', 'description', 'amountMinor'] as const) if (parsed[key] !== value[key]) invalid();
    if (Object.hasOwn(value, 'panelSpecifications')) {
      if (parsed.panelSpecifications === null ? value['panelSpecifications'] !== null : !object(value['panelSpecifications'])) invalid();
      if (parsed.panelSpecifications && object(value['panelSpecifications'])) {
        const storedSpecs = value['panelSpecifications'];
        if (Object.keys(parsed.panelSpecifications).length !== Object.keys(storedSpecs).length
          || Object.keys(parsed.panelSpecifications).some(key => parsed.panelSpecifications?.[key as PanelSpecificationKey] !== storedSpecs[key])) invalid();
      }
    }
    return { ...value, ...(Object.hasOwn(value, 'panelSpecifications') ? { panelSpecifications: parsed.panelSpecifications } : {}),
      ...(Object.hasOwn(value, 'images') ? { images: parsed.images } : {}) } as unknown as PublishedProduct;
  } catch { throw new ApiError(503, 'CATALOG_DATA_INVALID', 'Stored public catalog data needs review.'); }
}

import { inject, Injectable } from '@angular/core';
import type { AdminPage, AdminProduct, AdminSupplier, ProductCreateInput, ProductUpdateInput, ProductPublicationInput, SupplierCreateInput } from './admin-catalog.models';
import { StoreApiError, StoreApiService } from './store-api.service';
import { normalizePanelSpecifications, validPanelSpecifications } from './panel-specifications';
import { validProductImages, type ProductImage } from './product-images';
import { supplierProductUrlError } from './supplier-product-url';
import { validProtectionFields, type McbSpecifications, type AtsSpecifications, type ProtectionType } from './mcb-specifications';
import type { ProductListFilters, SupplierListFilters, SupplierUpdateInput, SupplierStatusInput } from './admin-catalog.models';
export type { ProductListFilters, SupplierListFilters, SupplierUpdateInput, SupplierStatusInput } from './admin-catalog.models';

export type { AdminPage, AdminProduct, AdminSupplier, ProductCreateInput, ProductUpdateInput, ProductPublicationInput, SupplierCreateInput } from './admin-catalog.models';

const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SUPPLIER_FIELDS = ['requestId', 'name', 'region', 'description', 'website', 'email', 'phone'] as const;
const SUPPLIER_RECORD_FIELDS = ['id', 'name', 'region', 'description', 'website', 'email', 'phone', 'schemaVersion', 'version', 'status', 'createdBy', 'createdAt', 'updatedAt'] as const;
const PRODUCT_FIELDS = ['requestId', 'sku', 'name', 'brand', 'category', 'unitCode', 'description', 'amountMinor', 'supplierId'] as const;
const PRODUCT_RECORD_FIELDS = ['id', 'sku', 'name', 'brand', 'category', 'unitCode', 'description', 'amountMinor', 'supplierId', 'schemaVersion', 'version', 'state', 'currency', 'createdBy', 'createdAt', 'updatedAt'] as const;
const MAX_AMOUNT_MINOR = 99_999_999_999_999;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function productKeys(value: Record<string, unknown>, keys: readonly string[]): string[] {
  return [...keys, ...(Object.hasOwn(value, 'supplierUrl') ? ['supplierUrl'] : []), ...(Object.hasOwn(value, 'protectionType') ? ['protectionType'] : []), ...(Object.hasOwn(value, 'mcbSpecifications') ? ['mcbSpecifications'] : []), ...(Object.hasOwn(value, 'atsSpecifications') ? ['atsSpecifications'] : []), ...(Object.hasOwn(value, 'panelSpecifications') ? ['panelSpecifications'] : []), ...(Object.hasOwn(value, 'images') ? ['images'] : [])];
}
function validProductSpecifications(value: Record<string, unknown>, canonical = false): boolean {
  return !Object.hasOwn(value, 'panelSpecifications') || validPanelSpecifications(value['panelSpecifications'], canonical)
    && (value['panelSpecifications'] === null || value['category'] === 'Panels');
}

function cleanText(value: unknown, max: number, min = 0, multiline = false): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max
    && (multiline ? !/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(value) : !/[\u0000-\u001f\u007f]/.test(value));
}

function validUid(value: unknown): value is string {
  return cleanText(value, 128, 1) && value.trim() === value;
}

function canonicalIso(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validWebsite(value: unknown): value is string {
  if (!cleanText(value, 500)) return false;
  const normalized = value.trim();
  if (!normalized) return true;
  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

function validEmail(value: unknown): value is string {
  return cleanText(value, 320) && (!value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function canonicalText(value: unknown, max: number, required = false, multiline = false): value is string {
  return cleanText(value, max, 0, multiline) && value.trim() === value && (!required || value.length > 0);
}

function validSupplier(value: unknown): value is AdminSupplier {
  if (!record(value) || !exactKeys(value, SUPPLIER_RECORD_FIELDS)) return false;
  return typeof value['id'] === 'string' && UUID_V4.test(value['id']) && value['id'] === value['id'].toLowerCase()
    && canonicalText(value['name'], 160, true) && canonicalText(value['region'], 120)
    && canonicalText(value['description'], 4000, false, true) && validWebsite(value['website'])
    && canonicalText(value['website'], 500) && validEmail(value['email']) && canonicalText(value['email'], 320)
    && canonicalText(value['phone'], 80)
    && value['schemaVersion'] === 1 && validVersion(value['version']) && ['active', 'inactive'].includes(value['status'] as string)
    && validUid(value['createdBy']) && canonicalIso(value['createdAt']) && canonicalIso(value['updatedAt'])
    && value['createdAt'] <= value['updatedAt'];
}

export function validProduct(value: unknown): value is AdminProduct {
  if (!record(value) || !exactKeys(value, productKeys(value, Object.hasOwn(value, 'publishedVersion')
    ? [...PRODUCT_RECORD_FIELDS, 'publishedVersion'] : PRODUCT_RECORD_FIELDS)) || !validProductSpecifications(value, true) || !validProtectionFields(value, true)) return false;
  return typeof value['id'] === 'string' && UUID_V4.test(value['id']) && value['id'] === value['id'].toLowerCase()
    && canonicalText(value['sku'], 64, true) && /^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(value['sku'] as string)
    && canonicalText(value['name'], 160, true) && canonicalText(value['brand'], 80)
    && (value['category'] === null || ['Panels', 'Inverters', 'Batteries', 'Mounting', 'Circuit breakers', 'Surge Protection Device', 'ATS', 'PV Isolator', 'MCCB'].includes(value['category'] as string))
    && (value['unitCode'] === null || ['unit', 'panel', 'kit'].includes(value['unitCode'] as string))
    && canonicalText(value['description'], 4000, false, true)
    && (value['amountMinor'] === null || Number.isSafeInteger(value['amountMinor']) && (value['amountMinor'] as number) >= 0 && (value['amountMinor'] as number) <= MAX_AMOUNT_MINOR)
    && typeof value['supplierId'] === 'string' && UUID_V4.test(value['supplierId']) && value['supplierId'] === value['supplierId'].toLowerCase()
    && (!Object.hasOwn(value, 'supplierUrl') || typeof value['supplierUrl'] === 'string' && value['supplierUrl'].trim() === value['supplierUrl'] && supplierProductUrlError(value['supplierUrl']) === null)
    && value['schemaVersion'] === 1 && validVersion(value['version'])
    && (value['state'] === 'draft' && !Object.hasOwn(value, 'publishedVersion')
      || value['state'] === 'published' && validVersion(value['publishedVersion']) && value['publishedVersion'] <= value['version'])
    && (!Object.hasOwn(value, 'images') || validProductImages(value['images']))
    && value['currency'] === 'PHP'
    && validUid(value['createdBy']) && canonicalIso(value['createdAt']) && canonicalIso(value['updatedAt'])
    && value['createdAt'] <= value['updatedAt'];
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value < Number.MAX_SAFE_INTEGER;
}

function invalidResponse(): never { throw new StoreApiError('invalid-response'); }

@Injectable({ providedIn: 'root' })
export class AdminCatalogApiService {
  private readonly api = inject(StoreApiService);

  uploadProductImage(file: Blob): Promise<ProductImage> { return this.api.uploadProductImage(file); }

  listSuppliers(cursor: string | null = null, filters: SupplierListFilters = {}): Promise<AdminPage<AdminSupplier>> {
    if (!record(filters) || Object.keys(filters).some(key => !['namePrefix', 'status'].includes(key))
      || filters['namePrefix'] !== undefined && (!canonicalText(filters['namePrefix'], 160, true) || /[\uD800-\uDFFF]/u.test(filters['namePrefix']))
      || filters['status'] !== undefined && (typeof filters['status'] !== 'string' || !['active', 'inactive'].includes(filters['status']))) return Promise.reject(new StoreApiError('invalid-input'));
    const filtered = Object.keys(filters).length > 0;
    if (!(filtered ? cursor === null || typeof cursor === 'string' && /^[A-Za-z0-9_-]{1,2048}$/.test(cursor) : this.validCursor(cursor)))
      return Promise.reject(new StoreApiError('invalid-input'));
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) query[key] = value as string;
    return this.api.adminRequest('/api/v1/admin/suppliers', 'GET', undefined,
      value => this.parsePage(value, validSupplier, filtered ? 'supplier' : 'uuid'), cursor, query);
  }

  createSupplier(input: SupplierCreateInput): Promise<{ supplier: AdminSupplier }> {
    const body = this.validSupplierInput(input);
    if (!body) return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest('/api/v1/admin/suppliers', 'POST', body, value => {
      if (!record(value) || !exactKeys(value, ['supplier']) || !validSupplier(value['supplier'])) return invalidResponse();
      return { supplier: value['supplier'] };
    });
  }

  listProducts(cursor: string | null = null, filters: ProductListFilters = {}): Promise<AdminPage<AdminProduct>> {
    if (!(cursor === null || typeof cursor === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(cursor))
      || !record(filters) || Object.keys(filters).some(key => !['skuPrefix', 'brand', 'category', 'supplierId'].includes(key))
      || Object.entries(filters).some(([key, value]) => !canonicalText(value, key === 'skuPrefix' ? 64 : 80, true))
      || filters['skuPrefix'] !== undefined && (typeof filters['skuPrefix'] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(filters['skuPrefix']))
      || filters['category'] !== undefined && (typeof filters['category'] !== 'string' || !['Panels', 'Inverters', 'Batteries', 'Mounting', 'Circuit breakers', 'Surge Protection Device', 'ATS', 'PV Isolator', 'MCCB'].includes(filters['category']))
      || filters['supplierId'] !== undefined && !this.validId(filters['supplierId'])) return Promise.reject(new StoreApiError('invalid-input'));
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) query[key] = key === 'skuPrefix' ? (value as string).toUpperCase() : value as string;
    return this.api.adminRequest('/api/v1/admin/products', 'GET', undefined,
      value => this.parsePage(value, validProduct, 'opaque'), cursor, query);
  }
  listProductBrands(cursor: string | null = null): Promise<AdminPage<string>> {
    if (cursor !== null && !canonicalText(cursor, 80, true)) return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest('/api/v1/admin/product-brands', 'GET', undefined,
      value => this.parsePage(value, (item): item is string => canonicalText(item, 80, true), 'brand'), cursor);
  }
  getSupplier(id: string): Promise<{ supplier: AdminSupplier }> {
    if (!this.validId(id)) return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest(`/api/v1/admin/suppliers/${id.toLowerCase()}`, 'GET', undefined, value => this.parseSupplier(value, id));
  }
  updateSupplier(id: string, input: SupplierUpdateInput): Promise<{ supplier: AdminSupplier }> {
    if (!this.validId(id) || !record(input) || !exactKeys(input, [...SUPPLIER_FIELDS, 'expectedVersion']) || !validVersion(input.expectedVersion))
      return Promise.reject(new StoreApiError('invalid-input'));
    const { expectedVersion, ...fields } = input;
    const body = this.validSupplierInput(fields);
    if (!body) return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest(`/api/v1/admin/suppliers/${id.toLowerCase()}`, 'PUT', { ...body, expectedVersion }, value => this.parseSupplier(value, id));
  }
  setSupplierStatus(id: string, input: SupplierStatusInput): Promise<{ supplier: AdminSupplier }> {
    if (!this.validId(id) || !record(input) || !exactKeys(input, ['requestId', 'expectedVersion', 'status'])
      || !this.validId(input.requestId) || !validVersion(input.expectedVersion) || !['active', 'inactive'].includes(input.status))
      return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest(`/api/v1/admin/suppliers/${id.toLowerCase()}/status`, 'POST',
      { ...input, requestId: input.requestId.toLowerCase() }, value => this.parseSupplier(value, id));
  }
  private parseSupplier(value: unknown, id: string): { supplier: AdminSupplier } {
    if (!record(value) || !exactKeys(value, ['supplier']) || !validSupplier(value['supplier']) || value['supplier'].id !== id.toLowerCase()) return invalidResponse();
    return { supplier: value['supplier'] };
  }

  createProduct(input: ProductCreateInput): Promise<{ product: AdminProduct }> {
    const body = this.validProductInput(input);
    if (!body) return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest('/api/v1/admin/products', 'POST', body, value => {
      if (!record(value) || !exactKeys(value, ['product']) || !validProduct(value['product'])) return invalidResponse();
      return { product: value['product'] };
    });
  }

  getProduct(id: string): Promise<{ product: AdminProduct }> {
    if (!this.validId(id)) return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest(`/api/v1/admin/products/${id.toLowerCase()}`, 'GET', undefined,
      value => this.parseProduct(value, id));
  }

  updateProduct(id: string, input: ProductUpdateInput): Promise<{ product: AdminProduct }> {
    if (!this.validId(id) || !record(input) || !exactKeys(input, productKeys(input, [...PRODUCT_FIELDS, 'expectedVersion']))
      || !validVersion(input.expectedVersion)) return Promise.reject(new StoreApiError('invalid-input'));
    const { expectedVersion, ...values } = input;
    const normalized = this.validProductInput(values);
    if (!normalized) return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest(`/api/v1/admin/products/${id.toLowerCase()}`, 'PUT',
      { ...normalized, expectedVersion }, value => this.parseProduct(value, id));
  }

  publishProduct(id: string, input: ProductPublicationInput): Promise<{ product: AdminProduct }> {
    return this.publication(id, input, 'publish');
  }

  unpublishProduct(id: string, input: ProductPublicationInput): Promise<{ product: AdminProduct }> {
    return this.publication(id, input, 'unpublish');
  }

  private publication(id: string, input: ProductPublicationInput, action: 'publish' | 'unpublish'): Promise<{ product: AdminProduct }> {
    if (!this.validId(id) || !record(input) || !exactKeys(input, ['requestId', 'expectedVersion'])
      || !this.validId(input.requestId) || !validVersion(input.expectedVersion)) {
      return Promise.reject(new StoreApiError('invalid-input'));
    }
    const body = { requestId: input.requestId.toLowerCase(), expectedVersion: input.expectedVersion };
    return this.api.adminRequest(`/api/v1/admin/products/${id.toLowerCase()}/${action}`, 'POST', body,
      value => this.parseProduct(value, id));
  }

  private validId(id: unknown): id is string { return typeof id === 'string' && UUID_V4.test(id); }

  private parseProduct(value: unknown, id: string): { product: AdminProduct } {
    if (!record(value) || !exactKeys(value, ['product']) || !validProduct(value['product'])
      || value['product'].id !== id.toLowerCase()) return invalidResponse();
    return { product: value['product'] };
  }

  private validCursor(cursor: string | null): boolean {
    return cursor === null || typeof cursor === 'string' && UUID_V4.test(cursor);
  }

  private parsePage<T>(value: unknown, parseItem: (item: unknown) => item is T, cursorType: 'uuid' | 'opaque' | 'brand' | 'supplier' = 'uuid'): AdminPage<T> {
    if (!record(value) || !exactKeys(value, ['items', 'nextCursor']) || !Array.isArray(value['items'])
      || value['items'].length > 50 || !(value['nextCursor'] === null || typeof value['nextCursor'] === 'string'
        && (cursorType === 'supplier' ? /^[A-Za-z0-9_-]{1,2048}$/.test(value['nextCursor']) : cursorType === 'opaque' ? /^[A-Za-z0-9_-]{1,512}$/.test(value['nextCursor']) : cursorType === 'brand'
          ? canonicalText(value['nextCursor'], 80, true) : UUID_V4.test(value['nextCursor']) && value['nextCursor'] === value['nextCursor'].toLowerCase()))) return invalidResponse();
    if (!value['items'].every(parseItem)) return invalidResponse();
    return { items: value['items'], nextCursor: value['nextCursor'] } as AdminPage<T>;
  }

  private validSupplierInput(value: unknown): SupplierCreateInput | null {
    if (!record(value) || !exactKeys(value, SUPPLIER_FIELDS)
      || typeof value['requestId'] !== 'string' || !UUID_V4.test(value['requestId'])
      || !cleanText(value['name'], 160, 1) || !value['name'].trim() || !cleanText(value['region'], 120)
      || !cleanText(value['description'], 4000, 0, true) || !validWebsite(value['website'])
      || !validEmail(value['email']) || !cleanText(value['phone'], 80)) return null;
    return { requestId: value['requestId'].toLowerCase(), name: value['name'].trim(), region: value['region'].trim(), description: value['description'].trim(), website: value['website'].trim(), email: value['email'].trim(), phone: value['phone'].trim() };
  }

  private validProductInput(value: unknown): ProductCreateInput | null {
    if (!record(value) || !exactKeys(value, productKeys(value, PRODUCT_FIELDS)) || !validProductSpecifications(value) || !validProtectionFields(value)
      || Object.hasOwn(value, 'images') && !validProductImages(value['images'])
      || typeof value['requestId'] !== 'string' || !UUID_V4.test(value['requestId'])
      || !cleanText(value['sku'], 64, 1) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value['sku'].trim())
      || !cleanText(value['name'], 160, 1) || !value['name'].trim()
      || !cleanText(value['brand'], 80) || !(value['category'] === null || ['Panels', 'Inverters', 'Batteries', 'Mounting', 'Circuit breakers', 'Surge Protection Device', 'ATS', 'PV Isolator', 'MCCB'].includes(value['category'] as string))
      || !(value['unitCode'] === null || ['unit', 'panel', 'kit'].includes(value['unitCode'] as string))
      || !cleanText(value['description'], 4000, 0, true)
      || !(value['amountMinor'] === null || Number.isSafeInteger(value['amountMinor']) && (value['amountMinor'] as number) >= 0 && (value['amountMinor'] as number) <= MAX_AMOUNT_MINOR)
      || typeof value['supplierId'] !== 'string' || !UUID_V4.test(value['supplierId'])) return null;
    if (Object.hasOwn(value, 'supplierUrl') && (typeof value['supplierUrl'] !== 'string' || supplierProductUrlError(value['supplierUrl']) !== null)) return null;
    return { requestId: value['requestId'].toLowerCase(), sku: value['sku'].trim().toUpperCase(), name: value['name'].trim(), brand: value['brand'].trim(), category: value['category'] as ProductCreateInput['category'], unitCode: value['unitCode'] as ProductCreateInput['unitCode'], description: value['description'].trim(), amountMinor: value['amountMinor'] as number | null, supplierId: value['supplierId'].toLowerCase(),
      ...(Object.hasOwn(value, 'supplierUrl') ? { supplierUrl: (value['supplierUrl'] as string).trim() } : {}),
      ...(Object.hasOwn(value, 'protectionType') ? { protectionType: value['protectionType'] as ProtectionType | null } : {}),
      ...(Object.hasOwn(value, 'mcbSpecifications') ? { mcbSpecifications: value['mcbSpecifications'] as McbSpecifications | null } : {}),
      ...(Object.hasOwn(value, 'atsSpecifications') ? { atsSpecifications: value['atsSpecifications'] as AtsSpecifications | null } : {}),
      ...(Object.hasOwn(value, 'panelSpecifications') ? { panelSpecifications: value['panelSpecifications'] === null ? null : normalizePanelSpecifications(value['panelSpecifications'] as NonNullable<ProductCreateInput['panelSpecifications']>) } : {}),
      ...(Object.hasOwn(value, 'images') ? { images: [...value['images'] as ProductImage[]] } : {}) };
  }
}

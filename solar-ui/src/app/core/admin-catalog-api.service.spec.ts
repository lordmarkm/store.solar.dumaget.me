import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_DRIVER, AuthDriver, AuthSessionService } from './auth-session.service';
import { AdminCatalogApiService } from './admin-catalog-api.service';
import { AdminProduct, AdminSupplier, ProductCreateInput, SupplierCreateInput } from './admin-catalog.models';
import { STORE_API_FETCH } from './store-api.service';

const UUID_A = '123e4567-e89b-42d3-a456-426614174000';
const UUID_B = '223e4567-e89b-42d3-a456-426614174000';
const UUID_C = '323e4567-e89b-42d3-a456-426614174000';
const timestamp = '2026-10-07T04:00:00.000Z';

function response(value: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => value } as Response;
}

function supplier(): AdminSupplier {
  return { id: UUID_B, name: 'Supplier', region: 'Luzon', description: '', website: '', email: '', phone: '',
    schemaVersion: 1, version: 1, status: 'active', createdBy: 'firebase-user-1', createdAt: timestamp, updatedAt: timestamp };
}

function product(supplierUrl?: string): AdminProduct {
  return { id: UUID_B, sku: 'SOL-1', name: 'Solar panel', brand: 'Brand', category: 'Panels', unitCode: 'panel',
    description: '', amountMinor: 12345, supplierId: UUID_C, schemaVersion: 1, version: 1, state: 'draft', currency: 'PHP',
    createdBy: 'firebase-user-1', createdAt: timestamp, updatedAt: timestamp, ...(supplierUrl === undefined ? {} : { supplierUrl }) };
}

describe('AdminCatalogApiService', () => {
  let publish: (session: { customerId: string; source?: 'firebase' } | null) => void;
  let fetcher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const driver: AuthDriver = {
      observe: vi.fn(next => { publish = next; return vi.fn(); }),
      signInGoogle: vi.fn(async () => {}), signOut: vi.fn(async () => {}), getIdToken: vi.fn(async () => 'token'),
    };
    fetcher = vi.fn(async () => response({ items: [], nextCursor: null }));
    TestBed.configureTestingModule({ providers: [{ provide: AUTH_DRIVER, useValue: driver }, { provide: STORE_API_FETCH, useValue: fetcher }] });
    TestBed.inject(AuthSessionService);
    publish({ customerId: 'firebase-user-1', source: 'firebase' });
  });

  afterEach(() => TestBed.resetTestingModule());
  it.each(['PV Isolator', 'MCCB'] as const)('accepts %s for API filtering and creation without unrelated ratings', async category => {
    const api = TestBed.inject(AdminCatalogApiService);
    fetcher.mockResolvedValueOnce(response({ items: [{ ...product(), category }], nextCursor: null }));
    expect((await api.listProducts(null, { category })).items[0].category).toBe(category);
    expect(new URL(String(fetcher.mock.calls[0][0]), 'https://store.example').searchParams.get('category')).toBe(category);
    const input: ProductCreateInput = { requestId: UUID_A, sku: 'DEVICE-1', name: category, brand: 'Generic', category,
      unitCode: 'unit', description: '', amountMinor: null, supplierId: UUID_C };
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), category } }));
    expect((await api.createProduct(input)).product.category).toBe(category);
    expect(JSON.parse(fetcher.mock.calls[1][1].body as string)).toEqual(input);
  });
  it('captures encoded supplier API filters and validates filtered vs unfiltered cursors', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    const filters = { namePrefix: 'Solar & 🌞', status: 'active' as const };
    fetcher.mockResolvedValueOnce(response({ items: [supplier()], nextCursor: 'opaque_next' }));
    const pending = api.listSuppliers('opaque_first', filters);
    filters.namePrefix = 'Changed';
    await expect(pending).resolves.toMatchObject({ nextCursor: 'opaque_next' });
    const params = new URL(fetcher.mock.calls[0][0], 'https://store.example').searchParams;
    expect(Object.fromEntries(params)).toEqual({ namePrefix: 'Solar & 🌞', status: 'active', cursor: 'opaque_first' });
    await expect(api.listSuppliers('opaque_unfiltered')).rejects.toMatchObject({ code: 'invalid-input' });
    for (const filter of [{ status: 'deleted' }, { namePrefix: '' }, { namePrefix: 'x'.repeat(161) }, { namePrefix: '\ud800' }, { unknown: 'x' }])
      await expect(api.listSuppliers(null, filter as never)).rejects.toMatchObject({ code: 'invalid-input' });
    fetcher.mockResolvedValueOnce(response({ items: [], nextCursor: '../escape' }));
    await expect(api.listSuppliers(null, { status: 'active' })).rejects.toMatchObject({ code: 'invalid-response' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses fixed supplier/product endpoints, cursor only on GET, and captures POST inputs', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    fetcher.mockResolvedValueOnce(response({ items: [supplier()], nextCursor: UUID_A }));
    await expect(api.listSuppliers(UUID_C)).resolves.toMatchObject({ items: [{ id: UUID_B }], nextCursor: UUID_A });
    expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/admin/suppliers?cursor=${UUID_C}`);
    expect(fetcher.mock.calls[0][1].method).toBe('GET');
    expect(fetcher.mock.calls[0][1].body).toBeUndefined();

    const input: SupplierCreateInput = { requestId: UUID_A, name: 'Supplier', region: 'Luzon', description: '', website: '', email: '', phone: '' };
    fetcher.mockImplementationOnce(async (_path, init) => {
      const posted = JSON.parse(init.body as string) as typeof input;
      expect(posted).toEqual({ requestId: UUID_A, name: 'Supplier', region: 'Luzon', description: '', website: '', email: '', phone: '' });
      return response({ supplier: supplier() });
    });
    const creation = api.createSupplier(input);
    input.name = 'Changed after call';
    await expect(creation).resolves.toMatchObject({ supplier: { status: 'active' } });
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/admin/suppliers');
    expect(fetcher.mock.calls[1][1].method).toBe('POST');

    const productInput: ProductCreateInput = { requestId: UUID_A, sku: 'SOL-1', name: 'Solar panel', brand: 'Brand', category: 'Surge Protection Device', unitCode: 'kit', description: '', amountMinor: null, supplierId: UUID_C };
    fetcher.mockImplementationOnce(async (_path, init) => {
      const posted = JSON.parse(init.body as string) as ProductCreateInput;
      expect(posted).toEqual(productInput);
      return response({ product: product() });
    });
    await expect(api.createProduct(productInput))
      .resolves.toMatchObject({ product: { category: 'Panels' } });
    expect(fetcher.mock.calls[2][0]).toBe('/api/v1/admin/products');
  });

  it('trims only outer supplier URL whitespace, accepts legacy records without the field, and rejects invalid optional values', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    const query = 'id=1%2F2&redirect=https%3A%2F%2Fshop.example%2Fp%3Fx%3Done';
    const supplierUrl = `https://shop.example/item?${query}`;
    const input: ProductCreateInput = { requestId: UUID_A, sku: 'SOL-1', name: 'Solar panel', brand: 'Brand', category: 'Surge Protection Device', unitCode: 'kit', description: '', amountMinor: null, supplierId: UUID_C, supplierUrl: `  ${supplierUrl}  ` };
    fetcher.mockResolvedValueOnce(response({ product: product(supplierUrl) }));
    await expect(api.createProduct(input)).resolves.toMatchObject({ product: { supplierUrl } });
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string).supplierUrl).toBe(supplierUrl);
    const { supplierUrl: _supplierUrl, ...legacyInput } = input;
    fetcher.mockResolvedValueOnce(response({ product: product() }));
    await expect(api.createProduct(legacyInput)).resolves.toMatchObject({ product: { id: UUID_B } });
    const calls = fetcher.mock.calls.length;
    const valid = 'https://shop.example/p';
    for (const invalid of ['http://shop.example/p', 'https://user:pass@shop.example/p', 'https://shop.example:444/p', `https://shop.example/${'x'.repeat(2040)}`, 'https://shop.example/\ud800', 'https://shop.example/a b', 'https://shop.example\\p', `${' '.repeat(2049 - valid.length)}${valid}`]) {
      await expect(api.createProduct({ ...input, supplierUrl: invalid })).rejects.toMatchObject({ code: 'invalid-input' });
    }
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });

  it('sends encoded server filters and opaque cursors and pages brands independently', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    const filters = { skuPrefix: 'sol-', brand: 'Brand & Co', category: 'Panels', supplierId: UUID_C };
    fetcher.mockResolvedValueOnce(response({ items: [product()], nextCursor: 'opaque_page-01' }));
    const pending = api.listProducts('opaque_start-01', filters);
    filters.brand = 'Changed after request';
    await expect(pending).resolves.toMatchObject({ items: [{ id: UUID_B }], nextCursor: 'opaque_page-01' });
    const query = new URL(fetcher.mock.calls[0][0], 'https://store.example').searchParams;
    expect(Object.fromEntries(query.entries())).toEqual({ cursor: 'opaque_start-01', skuPrefix: 'SOL-', brand: 'Brand & Co', category: 'Panels', supplierId: UUID_C });
    fetcher.mockResolvedValueOnce(response({ items: ['A brand', 'Z brand'], nextCursor: 'Z brand' }));
    await expect(api.listProductBrands('Brand & Co')).resolves.toEqual({ items: ['A brand', 'Z brand'], nextCursor: 'Z brand' });
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/admin/product-brands?cursor=Brand+%26+Co');
    for (const input of [{ category: 'Other' }, { skuPrefix: 'two words' }, { supplierId: '../foreign' }, { q: 'unbounded' }, { brand: 'x'.repeat(81) }])
      await expect(api.listProducts(null, input as never)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.listProducts('x'.repeat(513))).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('loads and mutates versioned inactive suppliers using captured requests', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    const updated = { ...supplier(), status: 'inactive' as const, version: 2, updatedAt: '2026-10-07T04:00:01.000Z' };
    fetcher.mockResolvedValueOnce(response({ supplier: updated }));
    await expect(api.getSupplier(UUID_B.toUpperCase())).resolves.toEqual({ supplier: updated });
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/admin/suppliers/' + UUID_B);
    const input = { requestId: UUID_A, name: ' New name ', region: '', description: '', website: '', email: '', phone: '', expectedVersion: 2 };
    fetcher.mockResolvedValueOnce(response({ supplier: { ...updated, name: 'New name', version: 3 } }));
    const save = api.updateSupplier(UUID_B, input);
    input.name = 'Edited after Save';
    await expect(save).resolves.toMatchObject({ supplier: { name: 'New name', version: 3, status: 'inactive' } });
    expect(fetcher.mock.calls[1][1].method).toBe('PUT');
    expect(JSON.parse(fetcher.mock.calls[1][1].body).name).toBe('New name');
    fetcher.mockResolvedValueOnce(response({ supplier: { ...updated, status: 'active', version: 4 } }));
    await expect(api.setSupplierStatus(UUID_B, { requestId: UUID_C, expectedVersion: 3, status: 'active' })).resolves.toMatchObject({ supplier: { status: 'active' } });
    expect(fetcher.mock.calls[2][0]).toBe('/api/v1/admin/suppliers/' + UUID_B + '/status');
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ requestId: UUID_C, expectedVersion: 3, status: 'active' });
    await expect(api.getSupplier(UUID_C)).rejects.toMatchObject({ code: 'invalid-response' }); // Default is a page, not a supplier envelope.
  });

  it('rejects invalid supplier mutations and mismatched detail responses', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    await expect(api.getSupplier(UUID_B + '/status')).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.updateSupplier(UUID_B, { expectedVersion: 1 } as never)).rejects.toMatchObject({ code: 'invalid-input' });
    for (const input of [{ requestId: UUID_A, expectedVersion: 0, status: 'inactive' }, { requestId: UUID_A, expectedVersion: 1, status: 'disabled' }, { requestId: UUID_A, expectedVersion: 1, status: 'inactive', extra: true }])
      await expect(api.setSupplierStatus(UUID_B, input as never)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(response({ supplier: supplier() }));
    await expect(api.getSupplier(UUID_A)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('captures normalized panel details on creation and accepts them on admin responses', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    const { id: _id, schemaVersion: _schema, version: _version, state: _state, currency: _currency, createdBy: _actor, createdAt: _created, updatedAt: _updated, ...fields } = product();
    const panelSpecifications = { eanCode: '0123456789012', ratedMaximumPower: '620 Wp' };
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), panelSpecifications } }));
    await expect(api.createProduct({ requestId: UUID_A, ...fields, panelSpecifications: { eanCode: ' 0123456789012 ', ratedMaximumPower: ' 620 Wp ' } }))
      .resolves.toMatchObject({ product: { panelSpecifications } });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).panelSpecifications).toEqual(panelSpecifications);
    fetcher.mockResolvedValueOnce(response({ items: [{ ...product(), panelSpecifications }], nextCursor: null }));
    await expect(api.listProducts()).resolves.toMatchObject({ items: [{ panelSpecifications }] });
  });

  it('accepts exact MCB fields on create and records while rejecting incomplete or out-of-category values', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    const input: ProductCreateInput = { requestId: UUID_A, sku: 'BREAKER-1', name: 'Breaker', brand: 'Brand', category: 'Circuit breakers',
      unitCode: 'unit', description: '', amountMinor: null, supplierId: UUID_C, protectionType: 'MCB',
      mcbSpecifications: { type: 'AC', amperage: 16.25 } };
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: input.mcbSpecifications } }));
    await expect(api.createProduct(input)).resolves.toMatchObject({ product: { mcbSpecifications: { type: 'AC', amperage: 16.25 } } });
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toMatchObject({ protectionType: 'MCB', mcbSpecifications: { type: 'AC', amperage: 16.25 } });

    for (const change of [
      { mcbSpecifications: null },
      { mcbSpecifications: { type: 'ac', amperage: 16 } },
      { mcbSpecifications: { type: 'DC', amperage: Number.MAX_SAFE_INTEGER + 1 } },
      { category: 'Inverters', mcbSpecifications: { type: 'DC', amperage: 16 } },
      { category: 'Panels', protectionType: null, mcbSpecifications: { type: 'DC', amperage: 16 } },
    ]) await expect(api.createProduct({ ...input, ...change } as never)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockResolvedValueOnce(response({ product: { ...product(), category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: input.mcbSpecifications } }));
    await expect(api.getProduct(UUID_B)).resolves.toMatchObject({ product: { mcbSpecifications: input.mcbSpecifications } });
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: { type: 'DC', amperage: 0 } } }));
    await expect(api.getProduct(UUID_B)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('accepts ATS Protection without MCB specifications and rejects cross-category or MCB-rated ATS input', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    const input: ProductCreateInput = { requestId: UUID_A, sku: 'ATS-1', name: 'Transfer switch', brand: 'Brand', category: 'ATS',
      unitCode: 'unit', description: '', amountMinor: null, supplierId: UUID_C, protectionType: 'ATS', atsSpecifications: { amperage: 63.5 } };
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), category: 'ATS', protectionType: 'ATS', atsSpecifications: input.atsSpecifications } }));
    await expect(api.createProduct(input)).resolves.toMatchObject({ product: { protectionType: 'ATS' } });
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toMatchObject({ protectionType: 'ATS', atsSpecifications: { amperage: 63.5 } });
    for (const change of [
      { category: 'Inverters' },
      { mcbSpecifications: { type: 'AC', amperage: 16 } },
      { mcbSpecifications: null as null, protectionType: 'MCB' },
      { atsSpecifications: null },
      { atsSpecifications: { amperage: 0 } },
      { atsSpecifications: { amperage: '63' } },
      { atsSpecifications: { amperage: 63, type: 'AC' } },
    ]) await expect(api.createProduct({ ...input, ...change } as never)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const { atsSpecifications: ignored, ...legacyInput } = input;
    await expect(api.createProduct(legacyInput)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.updateProduct(UUID_B, { ...legacyInput, expectedVersion: 1 })).rejects.toMatchObject({ code: 'invalid-input' });
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), category: 'ATS', protectionType: 'ATS', atsSpecifications: input.atsSpecifications } }));
    await expect(api.updateProduct(UUID_B, { ...input, expectedVersion: 1 })).resolves.toMatchObject({ product: { atsSpecifications: { amperage: 63.5 } } });
    for (const extra of [{}, { atsSpecifications: null }]) {
      fetcher.mockResolvedValueOnce(response({ product: { ...product(), category: 'ATS', protectionType: 'ATS', ...extra } }));
      await expect(api.getProduct(UUID_B)).resolves.toMatchObject({ product: { protectionType: 'ATS' } });
    }
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage: 0 } } }));
    await expect(api.getProduct(UUID_B)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('rejects malformed panel input before fetch and invalid panel responses', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    const input: ProductCreateInput = { requestId: UUID_A, sku: 'PANEL-1', name: 'Panel', brand: 'Solar', category: 'Panels', unitCode: 'panel', description: '', amountMinor: null, supplierId: UUID_C };
    for (const specs of [{ eanCode: 123 }, { private: 'secret' }, { cable: 'x'.repeat(201) }]) {
      await expect(api.createProduct({ ...input, panelSpecifications: specs as never })).rejects.toMatchObject({ code: 'invalid-input' });
    }
    await expect(api.createProduct({ ...input, category: 'Inverters', panelSpecifications: {} })).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).not.toHaveBeenCalled();
    for (const specs of [{ productCode: ' untrimmed ' }, { eanCode: 123 }, { hidden: 'secret' }]) {
      fetcher.mockResolvedValueOnce(response({ product: { ...product(), panelSpecifications: specs } }));
      await expect(api.getProduct(UUID_B)).rejects.toMatchObject({ code: 'invalid-response' });
    }
  });

  it('rejects bad cursors, malformed payloads, and invalid inputs without a fetch', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    await expect(api.listProducts('not a cursor')).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.createSupplier({ requestId: UUID_A, name: ' '.repeat(161), region: 'Luzon', description: '', website: '', email: '', phone: '' }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.createProduct({ requestId: UUID_A, sku: 'x', name: 'Name', brand: '', category: 'Unknown' as never, unitCode: null, description: '', amountMinor: -1, supplierId: UUID_C }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.createProduct({ requestId: UUID_A, sku: 'bad sku', name: 'Name', brand: '', category: null, unitCode: null, description: '', amountMinor: 0, supplierId: UUID_C }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.createProduct({ requestId: UUID_A, sku: 'SKU-1', name: 'Name', brand: '', category: null, unitCode: null, description: '', amountMinor: 100_000_000_000_000, supplierId: UUID_C }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).not.toHaveBeenCalled();

    fetcher.mockResolvedValueOnce(response({ items: [supplier()], nextCursor: 'bad-cursor' }));
    await expect(api.listSuppliers()).rejects.toMatchObject({ code: 'invalid-response' });
    fetcher.mockResolvedValueOnce(response({ items: Array.from({ length: 51 }, () => supplier()), nextCursor: null }));
    await expect(api.listSuppliers()).rejects.toMatchObject({ code: 'invalid-response' });
    fetcher.mockResolvedValueOnce(response({ items: [{ ...product(), extra: 'unexpected' }], nextCursor: null }));
    await expect(api.listProducts()).rejects.toMatchObject({ code: 'invalid-response' });
    fetcher.mockResolvedValueOnce(response({ supplier: { ...supplier(), createdBy: '' } }));
    await expect(api.createSupplier({ requestId: UUID_A, name: 'Supplier', region: 'Luzon', description: '', website: '', email: '', phone: '' }))
      .rejects.toMatchObject({ code: 'invalid-response' });

    fetcher.mockResolvedValueOnce(response({ product: { ...product(), createdAt: timestamp, updatedAt: '2026-10-07T03:59:59.000Z' } }));
    await expect(api.createProduct({ requestId: UUID_A, sku: 'SKU-1', name: 'Name', brand: '', category: null, unitCode: null, description: '', amountMinor: 0, supplierId: UUID_C }))
      .rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('uses bounded product UUID routes, captured PUT JSON, and publication envelopes', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    fetcher.mockResolvedValueOnce(response({ product: product() }));
    await expect(api.getProduct(UUID_B.toUpperCase())).resolves.toEqual({ product: product() });
    expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/admin/products/${UUID_B}`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' });
    expect(fetcher.mock.calls[0][1].body).toBeUndefined();
    const input = { requestId: UUID_A, sku: 'SOL-1', name: 'Changed', brand: '', category: null, unitCode: null, description: '', amountMinor: 0, supplierId: UUID_C, expectedVersion: 1 } as const;
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), name: 'Changed', version: 2, updatedAt: '2026-10-07T04:00:01.000Z' } }));
    const pending = api.updateProduct(UUID_B, { ...input });
    await expect(pending).resolves.toMatchObject({ product: { version: 2 } });
    expect(fetcher.mock.calls[1][1].method).toBe('PUT');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(input);
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), state: 'published', version: 3, publishedVersion: 3 } }));
    await expect(api.publishProduct(UUID_B, { requestId: UUID_A, expectedVersion: 2 })).resolves.toMatchObject({ product: { publishedVersion: 3 } });
    expect(fetcher.mock.calls[2][0]).toBe(`/api/v1/admin/products/${UUID_B}/publish`);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ requestId: UUID_A, expectedVersion: 2 });
    fetcher.mockResolvedValueOnce(response({ product: { ...product(), version: 4 } }));
    await expect(api.unpublishProduct(UUID_B, { requestId: UUID_C, expectedVersion: 3 })).resolves.toMatchObject({ product: { state: 'draft' } });
    expect(fetcher.mock.calls[3][0]).toBe(`/api/v1/admin/products/${UUID_B}/unpublish`);
  });

  it('accepts legacy drafts and private edits to published records with exact optional metadata', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    for (const item of [product(), { ...product(), state: 'published', version: 4, publishedVersion: 2, updatedAt: '2026-10-07T04:00:01.000Z' }]) {
      fetcher.mockResolvedValueOnce(response({ items: [item], nextCursor: null }));
      await expect(api.listProducts()).resolves.toMatchObject({ items: [item] });
    }
    for (const item of [
      { ...product(), publishedVersion: 1 },
      { ...product(), state: 'published', version: 2 },
      { ...product(), state: 'published', version: 2, publishedVersion: 3 },
      { ...product(), state: 'published', publishedVersion: undefined },
      { ...product(), state: 'published', publishedVersion: 0 },
      { ...product(), version: 0 }, { ...product(), version: 1.5 },
      { ...product(), version: Number.MAX_SAFE_INTEGER },
      { ...product(), internalToken: 'not-for-browser' },
    ]) {
      fetcher.mockResolvedValueOnce(response({ product: item }));
      await expect(api.getProduct(UUID_B)).rejects.toMatchObject({ code: 'invalid-response' });
    }
  });

  it('rejects malformed IDs/versions/extra fields before transport and mismatched response IDs', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    await expect(api.getProduct(`${UUID_B}/publish`)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.getProduct({ toString: () => UUID_B } as unknown as string)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.publishProduct(UUID_B, { requestId: UUID_A, expectedVersion: 0 })).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.publishProduct(UUID_B, { requestId: UUID_A, expectedVersion: Number.MAX_SAFE_INTEGER })).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.unpublishProduct(UUID_B, { requestId: UUID_A, expectedVersion: 1, extra: true } as never)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.updateProduct(UUID_B, { expectedVersion: 1 } as never)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).not.toHaveBeenCalled();
    for (const method of [
      () => api.getProduct(UUID_A),
      () => api.publishProduct(UUID_A, { requestId: UUID_C, expectedVersion: 1 }),
      () => api.unpublishProduct(UUID_A, { requestId: UUID_C, expectedVersion: 1 }),
      () => api.updateProduct(UUID_A, { requestId: UUID_C, expectedVersion: 1, sku: 'SOL-1', name: 'Name', brand: '', category: null, unitCode: null, description: '', amountMinor: null, supplierId: UUID_C }),
    ]) {
      fetcher.mockResolvedValueOnce(response({ product: product() }));
      await expect(method()).rejects.toMatchObject({ code: 'invalid-response' });
    }
  });

  it('matches backend text limits and normalizes optional fields and product values', async () => {
    const api = TestBed.inject(AdminCatalogApiService);
    const input: SupplierCreateInput = { requestId: UUID_A.toUpperCase(), name: ' Supplier ', region: '', description: 'd'.repeat(4000), website: ' https://vendor.example ', email: ' sales@vendor.example ', phone: '' };
    fetcher.mockImplementationOnce(async (_path, init) => {
      expect(JSON.parse(init.body as string)).toEqual({ requestId: UUID_A, name: 'Supplier', region: '', description: 'd'.repeat(4000), website: 'https://vendor.example', email: 'sales@vendor.example', phone: '' });
      return response({ supplier: supplier() });
    });
    await expect(api.createSupplier(input)).resolves.toMatchObject({ supplier: { id: UUID_B } });

    const productInput: ProductCreateInput = { requestId: UUID_A, sku: ' lower_1 ', name: ' Product ', brand: ' Brand ', category: 'Surge Protection Device', unitCode: 'kit', description: 'd'.repeat(4000), amountMinor: 99_999_999_999_999, supplierId: UUID_C.toUpperCase() };
    fetcher.mockImplementationOnce(async (_path, init) => {
      const posted = JSON.parse(init.body as string);
      expect(posted).toMatchObject({ requestId: UUID_A, sku: 'LOWER_1', name: 'Product', brand: 'Brand', amountMinor: 99_999_999_999_999, supplierId: UUID_C, description: 'd'.repeat(4000) });
      return response({ product: product() });
    });
    await expect(api.createProduct(productInput)).resolves.toMatchObject({ product: { id: UUID_B } });
  });
});

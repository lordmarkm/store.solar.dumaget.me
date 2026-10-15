import { Dialog } from '@angular/cdk/dialog';
import { computed, signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { AdminProduct, AdminSupplier } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { StoreApiError } from '../../core/store-api.service';
import { ToastService } from '../../core/toast.service';
import { AdminProductEditorPage } from './admin-product-editor';
import { AdminProductsPage } from './admin-products';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const SUPPLIER_ID = '223e4567-e89b-42d3-a456-426614174000';
const timestamp = '2026-10-07T04:00:00.000Z';
const productImage = {
  id: 'a'.repeat(64),
  url: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${'a'.repeat(64)}/detail.webp`,
  thumbnailUrl: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${'a'.repeat(64)}/thumb.webp`,
  width: 1200, height: 900,
};
function product(values: Partial<AdminProduct> = {}): AdminProduct {
  return { id: ID, sku: 'PANEL-1', name: 'Solar panel', brand: 'Sun Co', category: 'Panels', unitCode: 'panel',
    description: 'A panel', amountMinor: 0, supplierId: SUPPLIER_ID, schemaVersion: 1, version: 1, state: 'draft',
    currency: 'PHP', createdBy: 'admin-1', createdAt: timestamp, updatedAt: timestamp, images: [productImage], ...values };
}
const supplier: AdminSupplier = { id: SUPPLIER_ID, name: 'North Solar', region: '', description: '', website: '', email: '', phone: '',
  schemaVersion: 1, version: 1, status: 'active', createdBy: 'admin-1', createdAt: timestamp, updatedAt: timestamp };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('admin product editor', () => {
  let revision: WritableSignal<number>;
  let authorized: WritableSignal<boolean>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let api: Record<'getProduct' | 'getSupplier' | 'updateProduct' | 'publishProduct' | 'unpublishProduct' | 'listSuppliers' | 'listProducts', ReturnType<typeof vi.fn>>;
  let fixture: ComponentFixture<AdminProductEditorPage>;
  let page: AdminProductEditorPage;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  async function open() {
    fixture = TestBed.createComponent(AdminProductEditorPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  beforeEach(() => {
    revision = signal(1); authorized = signal(true);
    params = new BehaviorSubject(convertToParamMap({ id: ID }));
    api = {
      getProduct: vi.fn().mockResolvedValue({ product: product() }),
      getSupplier: vi.fn().mockResolvedValue({ supplier }),
      updateProduct: vi.fn().mockResolvedValue({ product: product({ name: 'Changed', version: 2 }) }),
      publishProduct: vi.fn().mockResolvedValue({ product: product({ state: 'published', version: 2, publishedVersion: 2 }) }),
      unpublishProduct: vi.fn().mockResolvedValue({ product: product({ version: 3 }) }),
      listSuppliers: vi.fn().mockResolvedValue({ items: [supplier], nextCursor: null }),
      listProducts: vi.fn().mockResolvedValue({ items: [product()], nextCursor: null }),
    };
    toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { paramMap: params.value } } },
        { provide: AdminAccessService, useValue: { authorized, status: computed(() => authorized() ? 'authorized' : 'signed-out'), retry: vi.fn() } },
        { provide: AuthSessionService, useValue: { sessionRevision: revision, signOutRevision: signal(0), status: signal('signed-in'), busy: signal(false), error: signal(null) } },
        { provide: AuthNavigationService, useValue: { signInGoogle: vi.fn() } },
        { provide: AdminCatalogApiService, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('retains an existing inactive source for private edits but blocks new inactive sourcing and publication', async () => {
    const other = { ...supplier, id: '323e4567-e89b-42d3-a456-426614174000', status: 'inactive' as const };
    api.listSuppliers.mockResolvedValueOnce({ items: [{ ...supplier, status: 'inactive' }, other], nextCursor: null });
    await open();
    expect(page.currentSupplierKnown()).toBe(true);
    expect(page.canPublish()).toBe(false);
    expect(fixture.nativeElement.querySelector('#edit-supplierId').textContent).toContain('(inactive)');
    expect(fixture.nativeElement.querySelector('#edit-supplierId').textContent).not.toContain('(not loaded)');
    page.update('name', 'Private edit');
    expect(page.errors().supplierId).toBeUndefined();
    await page.save();
    expect(api.updateProduct).toHaveBeenCalledOnce();
    page.update('supplierId', other.id);
    expect(page.errors().supplierId).toBe('Choose a loaded active supplier.');
    expect(fixture.nativeElement.querySelector('option[value="' + other.id + '"]').disabled).toBe(true);
    expect(api.publishProduct).not.toHaveBeenCalled();
  });

  it('loads a draft with its image, keeps SKU readonly, and permits publishing an explicit zero price', async () => {
    await open();
    expect(api.getProduct).toHaveBeenCalledWith(ID);
    expect(page.input().priceText).toBe('0.00');
    expect(page.dirty()).toBe(false);
    expect(page.canPublish()).toBe(true);
    expect(fixture.nativeElement.querySelector('#edit-sku').readOnly).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('app-product-image-uploader img')).toHaveLength(1);
    await page.publish();
    expect(api.publishProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ expectedVersion: 1, requestId: expect.any(String) }));
    expect(page.product()?.publishedVersion).toBe(2);
    expect(toast.success).toHaveBeenCalledWith('The saved product is now published.');
  });

  it('reloads panel fields and saves edits privately without publishing', async () => {
    const specs = { eanCode: '0123456789012', ratedMaximumPower: '620 Wp' };
    api.getProduct.mockResolvedValueOnce({ product: product({ panelSpecifications: specs, state: 'published', version: 4, publishedVersion: 2 }) });
    await open();
    expect((fixture.nativeElement.querySelector('#edit-panel-eanCode') as HTMLInputElement).value).toBe('0123456789012');
    expect(page.dirty()).toBe(false);
    const next = { ...specs, warranty: '15 years product\n30 years / 85% output' };
    api.updateProduct.mockResolvedValueOnce({ product: product({ panelSpecifications: next, state: 'published', version: 5, publishedVersion: 2 }) });
    page.update('panelSpecifications', next); await page.save();
    expect(api.updateProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ panelSpecifications: next, expectedVersion: 4 }));
    expect(api.publishProduct).not.toHaveBeenCalled();
    expect(page.product()?.publishedVersion).toBe(2);
    expect(toast.success).toHaveBeenCalledWith('Saved privately. Publish to update the public listing.');
    expect(page.dirty()).toBe(false);
  });

  it('loads MCB values, preserves exact decimal amperage across retries, and clears subtype fields', async () => {
    const mcbSpecifications = { type: 'AC' as const, amperage: 20.5 };
    api.getProduct.mockResolvedValueOnce({ product: product({ category: 'Circuit breakers', unitCode: 'kit', protectionType: 'MCB', mcbSpecifications }) });
    api.updateProduct.mockRejectedValueOnce(new StoreApiError('unavailable'));
    api.updateProduct.mockResolvedValueOnce({ product: product({ category: 'Circuit breakers', unitCode: 'kit', protectionType: 'MCB', mcbSpecifications: { type: 'AC', amperage: 16.25 }, version: 2 }) });
    await open();
    expect(page.input()).toMatchObject({ protectionType: 'MCB', mcbType: 'AC', mcbAmperage: '20.5' });
    expect(page.dirty()).toBe(false);
    expect(page.checklist().find(item => item.label === 'MCB type and amperage are valid')?.ready).toBe(true);
    page.update('mcbAmperage', '16.25');
    await page.save();
    const first = api.updateProduct.mock.calls[0][1];
    expect(first).toMatchObject({ protectionType: 'MCB', mcbSpecifications: { type: 'AC', amperage: 16.25 } });
    expect(page.input().mcbAmperage).toBe('16.25');
    await page.save();
    expect(api.updateProduct.mock.calls[1][1].requestId).toBe(first.requestId);
    page.update('category', 'Inverters');
    await page.save();
    expect(api.updateProduct.mock.calls[2][1]).toMatchObject({ protectionType: null, mcbSpecifications: null, category: 'Inverters' });
  });

  it('preserves ATS on unrelated edits and clears MCB ratings when changing MCB to ATS', async () => {
    api.getProduct.mockResolvedValueOnce({ product: product({ category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage: 63.5 } }) });
    api.updateProduct.mockResolvedValueOnce({ product: product({ category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage: 63.5 }, name: 'Updated ATS', version: 2 }) });
    await open();
    expect(page.input().protectionType).toBe('ATS');
    expect(page.input().atsAmperage).toBe('63.5');
    expect(page.dirty()).toBe(false);
    page.update('name', 'Updated ATS');
    await page.save();
    expect(api.updateProduct.mock.calls[0][1]).toMatchObject({ protectionType: 'ATS', category: 'ATS', atsSpecifications: { amperage: 63.5 } });
    expect(api.updateProduct.mock.calls[0][1]).not.toHaveProperty('mcbSpecifications');
    fixture.destroy();

    api.getProduct.mockResolvedValueOnce({ product: product({ category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: { type: 'DC', amperage: 10 } }) });
    await open();
    page.update('category', 'ATS');
    expect(page.input()).toMatchObject({ protectionType: 'ATS', mcbType: '', mcbAmperage: '' });
    page.update('atsAmperage', '63');
    api.updateProduct.mockResolvedValueOnce({ product: product({ category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage: 63 }, version: 2 }) });
    page.update('name', 'ATS unit');
    await page.save();
    expect(api.updateProduct.mock.calls[1][1]).toMatchObject({ protectionType: 'ATS', mcbSpecifications: null, atsSpecifications: { amperage: 63 } });
  });

  it.each(['missing', 'null'])('loads legacy ATS with %s ratings and requires amperage for saving and publishing', async legacy => {
    api.getProduct.mockResolvedValueOnce({ product: product({ category: 'ATS', protectionType: 'ATS', ...(legacy === 'null' ? { atsSpecifications: null } : {}) }) });
    await open();
    expect(page.input().atsAmperage).toBe('');
    expect(page.dirty()).toBe(false);
    expect(page.canPublish()).toBe(false);
    expect(page.checklist().find(item => item.label === 'ATS amperage is valid')?.ready).toBe(false);
    await page.publish();
    expect(api.publishProduct).not.toHaveBeenCalled();
    page.update('name', 'Edited transfer switch');
    for (const amperage of ['', '0', '-1', 'Infinity', '63A', '9007199254740992']) {
      page.update('atsAmperage', amperage);
      await page.save();
      expect(api.updateProduct).not.toHaveBeenCalled();
      expect(page.showError('atsAmperage')).toBeTruthy();
    }
    page.update('atsAmperage', '0.5');
    api.updateProduct.mockResolvedValueOnce({ product: product({ category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage: 0.5 }, name: 'Edited transfer switch', version: 2 }) });
    await page.save();
    expect(api.updateProduct.mock.calls[0][1]).toMatchObject({ protectionType: 'ATS', atsSpecifications: { amperage: 0.5 }, amountMinor: 0, images: [productImage] });
    expect(page.dirty()).toBe(false);
    expect(page.canPublish()).toBe(true);
  });

  it('clears ATS ratings when changing to MCB or another category', async () => {
    const rated = product({ category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage: 63 } });
    api.getProduct.mockResolvedValueOnce({ product: rated });
    await open();
    page.update('category', 'Circuit breakers');
    expect(page.input().atsAmperage).toBe('');
    expect(page.errors().mcbType).toBeTruthy();
    expect(page.errors().mcbAmperage).toBeTruthy();
    page.update('mcbType', 'AC'); page.update('mcbAmperage', '16');
    await page.save();
    expect(api.updateProduct.mock.calls[0][1]).toMatchObject({ protectionType: 'MCB', atsSpecifications: null, mcbSpecifications: { type: 'AC', amperage: 16 } });
    fixture.destroy();
    api.getProduct.mockResolvedValueOnce({ product: rated });
    await open();
    page.update('category', 'Inverters');
    expect(page.input()).toMatchObject({ protectionType: '', atsAmperage: '' });
    await page.save();
    expect(api.updateProduct.mock.calls[1][1]).toMatchObject({ protectionType: null, atsSpecifications: null, category: 'Inverters' });
  });

  it('marks a normalized legacy unclassified product dirty when ATS is selected', async () => {
    api.getProduct.mockResolvedValueOnce({ product: product({ category: null, protectionType: undefined, mcbSpecifications: undefined }) });
    await open();
    const save = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(page.dirty()).toBe(false);
    expect(save.disabled).toBe(true);
    page.update('category', 'ATS');
    fixture.detectChanges();
    expect(page.input().protectionType).toBe('ATS');
    expect(page.dirty()).toBe(true);
    expect(save.disabled).toBe(false);
  });

  it('clears stored panel fields on category change and rejects malformed panel edits', async () => {
    api.getProduct.mockResolvedValueOnce({ product: product({ panelSpecifications: { cable: '4 mm²' } }) });
    await open();
    page.update('panelSpecifications', { cable: 'bad\ttab' }); await page.save();
    expect(toast.error).toHaveBeenCalledWith('Review the highlighted fields and try again.');
    expect(page.showError('panelSpecifications')).toBeTruthy();
    expect(api.updateProduct).not.toHaveBeenCalled();
    page.update('category', 'Inverters'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#edit-panel-cable')).toBeNull();
    await page.save();
    expect(api.updateProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ category: 'Inverters', panelSpecifications: null }));
  });

  it('blocks missing publication content locally, including an unloaded supplier, then loads another supplier page', async () => {
    api.getProduct.mockResolvedValueOnce({ product: product({ brand: '', description: '', category: null, unitCode: null, amountMinor: null }) });
    api.listSuppliers.mockResolvedValueOnce({ items: [], nextCursor: SUPPLIER_ID });
    await open();
    await vi.waitFor(() => expect(page.selectedSupplier()?.name).toBe('North Solar'));
    fixture.detectChanges();
    expect(page.checklist().filter(item => !item.ready)).toHaveLength(6);
    const checklist = fixture.nativeElement.querySelector('[aria-labelledby="publish-checklist"]') as HTMLElement;
    expect(checklist.querySelectorAll('li .ki-cross')).toHaveLength(6);
    expect(checklist.querySelectorAll('li .ki-check')).toHaveLength(2);
    expect(checklist.querySelector('li')?.textContent).toContain('Missing');
    await page.publish();
    expect(api.publishProduct).not.toHaveBeenCalled();
    page.update('brand', 'Sun Co'); page.update('description', 'Panel'); page.update('category', 'Surge Protection Device');
    page.update('unitCode', 'kit'); page.update('priceText', '0');
    fixture.detectChanges();
    expect(checklist.querySelectorAll('li .ki-check')).toHaveLength(7);
    expect(checklist.querySelectorAll('li .ki-cross')).toHaveLength(1);
    expect(page.checklist().find(item => item.label.includes('price'))?.ready).toBe(true);
    expect(page.canPublish()).toBe(false);
    await page.loadMoreSuppliers();
    expect(page.currentSupplierLoaded()).toBe(true);
    expect(api.listSuppliers).toHaveBeenLastCalledWith(SUPPLIER_ID);
    expect(page.dirty()).toBe(true);
    await page.publish();
    expect(api.publishProduct).not.toHaveBeenCalled();
  });

  it('saves retained fields with immutable SKU and exact centavos, leaving the public snapshot unchanged', async () => {
    api.getProduct.mockResolvedValueOnce({ product: product({ state: 'published', version: 4, publishedVersion: 2 }) });
    api.updateProduct.mockResolvedValueOnce({ product: product({ name: 'Changed', amountMinor: 645050, state: 'published', version: 5, publishedVersion: 2 }) });
    await open();
    page.update('name', 'Changed'); page.update('priceText', '6450.50');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unsaved edits');
    expect(page.canPublish()).toBe(false);
    await page.save();
    const body = api.updateProduct.mock.calls[0][1];
    expect(body).toMatchObject({ sku: 'PANEL-1', name: 'Changed', brand: 'Sun Co', category: 'Panels', unitCode: 'panel',
      description: 'A panel', amountMinor: 645050, supplierId: SUPPLIER_ID, images: [productImage], expectedVersion: 4, requestId: expect.any(String) });
    expect(page.dirty()).toBe(false);
    expect(page.product()?.publishedVersion).toBe(2);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Saved private changes are not yet public');
  });

  it('loads older products without images but blocks publishing until one is uploaded', async () => {
    api.getProduct.mockResolvedValueOnce({ product: product({ images: undefined }) });
    await open();
    expect(page.input().images).toEqual([]);
    expect(page.dirty()).toBe(false);
    expect(page.canPublish()).toBe(false);
    expect(page.checklist().find(item => item.label.includes('image'))?.ready).toBe(false);
    await page.publish();
    expect(api.publishProduct).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('app-product-image-uploader img')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('At least one product image is uploaded');
  });

  it('round-trips supplier URLs, blocks a missing Shopee URL on save and in the publish checklist', async () => {
    api.listSuppliers.mockResolvedValueOnce({ items: [{ ...supplier, name: 'Shopee' }], nextCursor: null });
    await open();
    expect(page.input().supplierUrl).toBe('');
    expect(page.dirty()).toBe(false);
    expect(page.checklist().find(item => item.label === 'Supplier product URL is valid')?.ready).toBe(false);
    page.update('name', 'Changed');
    await page.save();
    expect(api.updateProduct).not.toHaveBeenCalled();
    expect(page.showError('supplierUrl')).toContain('Shopee product URL');
    const url = 'https://shopee.ph/product/1?item=a%2Fb&ref=https%3A%2F%2Fexample.com%2Fp%3Fx%3Done';
    page.update('supplierUrl', ` ${url} `);
    api.updateProduct.mockResolvedValueOnce({ product: product({ name: 'Changed', supplierUrl: url, version: 2 }) });
    await page.save();
    expect(api.updateProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ supplierUrl: url }));
    expect(page.input().supplierUrl).toBe(url);
    expect(page.dirty()).toBe(false);
  });

  it('resolves an unloaded existing supplier before applying its Shopee URL requirement', async () => {
    api.listSuppliers.mockResolvedValueOnce({ items: [], nextCursor: null });
    api.getSupplier.mockResolvedValueOnce({ supplier: { ...supplier, name: 'Shopee' } });
    await open();
    await vi.waitFor(() => expect(page.selectedSupplier()?.name).toBe('Shopee'));
    expect(api.getSupplier).toHaveBeenCalledWith(SUPPLIER_ID);
    expect(page.supplierUrlRequired()).toBe(true);
    expect(page.errors().supplierUrl).toContain('Shopee product URL');
    expect(page.checklist().find(item => item.label === 'Supplier product URL is valid')?.ready).toBe(false);
  });

  it('blocks save and publish while an image upload is pending', async () => {
    await open();
    page.update('name', 'Changed');
    page.imageUploading.set(true);
    await page.save();
    await page.publish();
    expect(api.updateProduct).not.toHaveBeenCalled();
    expect(api.publishProduct).not.toHaveBeenCalled();
    expect(page.canLeave()).toBe(false);
  });

  it('validates basic editor fields and preserves dirty input on a conflict', async () => {
    await open();
    page.update('name', ''); await page.save();
    expect(api.updateProduct).not.toHaveBeenCalled();
    expect(page.showError('name')).toBeTruthy();
    page.update('name', 'Changed'); page.update('description', 'bad\ttext');
    await page.save(); expect(api.updateProduct).not.toHaveBeenCalled();
    page.update('description', 'Panel');
    api.updateProduct.mockRejectedValueOnce(new StoreApiError('conflict'));
    await page.save();
    expect(page.conflict()).toBe(true);
    expect(toast.error).toHaveBeenCalledTimes(3);
    expect(page.input().name).toBe('Changed');
    expect(page.product()?.version).toBe(1);
    expect(page.dirty()).toBe(true);
    const guard = page.canLeave();
    expect(typeof guard).not.toBe('boolean');
    const result = firstValueFrom(guard as Exclude<typeof guard, boolean>);
    TestBed.inject(Dialog).openDialogs[0].close(false);
    await expect(result).resolves.toBe(false);
    const reload = page.reload();
    TestBed.inject(Dialog).openDialogs[0].close(true);
    await reload;
    expect(page.dirty()).toBe(false);
    expect(page.conflict()).toBe(false);
  });

  it('reuses request IDs for unchanged failed saves and replaces them after payload or action changes', async () => {
    await open();
    api.updateProduct.mockRejectedValue(new StoreApiError('unavailable'));
    page.update('name', 'Changed');
    await page.save(); await page.save();
    const first = api.updateProduct.mock.calls[0][1].requestId;
    expect(api.updateProduct.mock.calls[1][1].requestId).toBe(first);
    page.update('name', 'Another');
    await page.save();
    expect(api.updateProduct.mock.calls[2][1].requestId).not.toBe(first);
    const reload = page.reload();
    TestBed.inject(Dialog).openDialogs[0].close(true);
    await reload;
    api.publishProduct.mockRejectedValueOnce(new StoreApiError('unavailable'));
    await page.publish();
    expect(api.publishProduct.mock.calls[0][1].requestId).not.toBe(first);
  });

  it('reuses a failed publish request ID, while blocking duplicates and edits during its request', async () => {
    await open();
    api.publishProduct.mockRejectedValueOnce(new StoreApiError('timeout'));
    await page.publish();
    const first = api.publishProduct.mock.calls[0][1].requestId;
    const pending = deferred<{ product: AdminProduct }>();
    api.publishProduct.mockReturnValueOnce(pending.promise);
    const publishing = page.publish();
    await page.publish(); page.update('name', 'Not accepted');
    expect(api.publishProduct).toHaveBeenCalledTimes(2);
    expect(api.publishProduct.mock.calls[1][1].requestId).toBe(first);
    expect(page.input().name).toBe('Solar panel');
    expect(page.canLeave()).toBe(false);
    pending.resolve({ product: product({ state: 'published', version: 2, publishedVersion: 2 }) });
    await publishing;
    expect(page.product()?.state).toBe('published');
    expect(page.notice()).toContain('now published');
    expect(toast.error).toHaveBeenCalledWith(new StoreApiError('timeout').message);
    expect(toast.success).toHaveBeenCalledWith('The saved product is now published.');
  });

  it('requires explicit unpublish confirmation and sends a versioned request only after approval', async () => {
    api.getProduct.mockResolvedValueOnce({ product: product({ state: 'published', version: 2, publishedVersion: 2 }) });
    await open();
    const canceled = page.unpublish();
    TestBed.tick();
    expect(document.body.textContent).toContain('Remove Solar panel from the public catalog?');
    TestBed.inject(Dialog).openDialogs[0].close(false);
    await canceled;
    expect(api.unpublishProduct).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    const confirmed = page.unpublish();
    TestBed.inject(Dialog).openDialogs[0].close(true);
    await confirmed;
    expect(api.unpublishProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ expectedVersion: 2, requestId: expect.any(String) }));
    expect(page.product()?.state).toBe('draft');
    expect(page.notice()).toContain('Listing removed');
    expect(api.publishProduct).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Listing removed. The product is now a private draft.');
  });

  it('clears input on access loss and ignores a late save even before the reset effect runs', async () => {
    await open(); page.update('name', 'Changed');
    const pending = deferred<{ product: AdminProduct }>();
    api.updateProduct.mockReturnValueOnce(pending.promise);
    const saving = page.save();
    revision.set(2);
    expect(page.canAccess()).toBe(false);
    pending.resolve({ product: product({ name: 'Old account data', version: 2 }) });
    await saving;
    expect(page.product()?.name).not.toBe('Old account data');
    authorized.set(false); fixture.detectChanges();
    expect(page.product()).toBeNull();
    expect(page.input().name).toBe('');
    expect(page.dirty()).toBe(false);
    await page.save(); await page.publish(); await page.unpublish();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(api.updateProduct).toHaveBeenCalledOnce();
    expect(api.publishProduct).not.toHaveBeenCalled();
    expect(api.unpublishProduct).not.toHaveBeenCalled();
  });

  it('preserves an unpublish retry ID after a timeout and disallows unpublishing dirty input', async () => {
    api.getProduct.mockResolvedValueOnce({ product: product({ state: 'published', version: 2, publishedVersion: 2 }) });
    await open();
    page.update('name', 'Unsaved');
    await page.unpublish();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(api.unpublishProduct).not.toHaveBeenCalled();
    page.update('name', 'Solar panel');
    api.unpublishProduct.mockRejectedValueOnce(new StoreApiError('timeout'));
    const first = page.unpublish();
    TestBed.inject(Dialog).openDialogs[0].close(true);
    await first;
    const requestId = api.unpublishProduct.mock.calls[0][1].requestId;
    const retry = page.unpublish();
    TestBed.inject(Dialog).openDialogs[0].close(true);
    await retry;
    expect(api.unpublishProduct.mock.calls[1][1].requestId).toBe(requestId);
    expect(page.product()?.state).toBe('draft');
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it('revokes old-route actions synchronously before the reset effect runs', async () => {
    await open();
    params.next(convertToParamMap({ id: SUPPLIER_ID }));
    expect(page.canAccess()).toBe(false);
    await page.publish();
    expect(api.publishProduct).not.toHaveBeenCalled();
    api.getProduct.mockResolvedValueOnce({ product: product({ id: SUPPLIER_ID }) });
    fixture.detectChanges(); await fixture.whenStable();
    expect(page.product()?.id).toBe(SUPPLIER_ID);
  });

  it('ignores a late mutation after destruction', async () => {
    await open(); page.update('name', 'Changed');
    const pending = deferred<{ product: AdminProduct }>();
    api.updateProduct.mockReturnValueOnce(pending.promise);
    const saving = page.save();
    fixture.destroy();
    pending.resolve({ product: product({ name: 'Late data', version: 2 }) });
    await saving;
    expect(page.product()).toBeNull();
    expect(page.notice()).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('isolates route/account changes and destroyed editors from stale loads', async () => {
    const pending = deferred<{ product: AdminProduct }>();
    api.getProduct.mockReturnValueOnce(pending.promise);
    fixture = TestBed.createComponent(AdminProductEditorPage); page = fixture.componentInstance; fixture.detectChanges();
    authorized.set(false); revision.set(2); fixture.detectChanges();
    pending.resolve({ product: product() });
    await Promise.resolve(); await Promise.resolve();
    expect(page.product()).toBeNull();
    authorized.set(true); fixture.detectChanges(); await fixture.whenStable();
    const second = deferred<{ product: AdminProduct }>();
    api.getProduct.mockReturnValueOnce(second.promise);
    params.next(convertToParamMap({ id: SUPPLIER_ID })); fixture.detectChanges();
    fixture.destroy();
    second.resolve({ product: product({ id: SUPPLIER_ID }) });
    await Promise.resolve(); await Promise.resolve();
    expect(page.product()).toBeNull();
  });

  it('cancels an open unpublish confirmation on account change', async () => {
    api.getProduct.mockResolvedValueOnce({ product: product({ state: 'published', version: 2, publishedVersion: 2 }) });
    await open();
    const pending = page.unpublish();
    revision.set(2); authorized.set(false); fixture.detectChanges();
    await pending;
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(api.unpublishProduct).not.toHaveBeenCalled();
  });

  it('renders state and a contextual Edit destination in the product list', async () => {
    api.listProducts.mockResolvedValueOnce({ items: [product({ state: 'published', version: 3, publishedVersion: 2 })], nextCursor: null });
    const list = TestBed.createComponent(AdminProductsPage);
    list.detectChanges(); await list.whenStable(); list.detectChanges();
    const link = list.nativeElement.querySelector('a[aria-label="Edit Solar panel"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/products/' + ID + '/edit');
    expect(list.nativeElement.textContent).toContain('Private changes not published');
  });
});

import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, DestroyRef, effect, HostListener, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { defaultIfEmpty, firstValueFrom, map, Observable } from 'rxjs';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import { ToastService } from '../../core/toast.service';
import type { AdminProduct, AdminSupplier, ProductCreateInput, ProductUpdateInput } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { StoreApiError } from '../../core/store-api.service';
import { Tooltip } from '../../shared/tooltip';
import { AdminDiscardDialog } from './admin-discard-dialog';
import { AdminProductUnpublishDialog } from './admin-product-unpublish-dialog';
import { panelSpecificationErrors, panelSpecificationPayload, type PanelSpecifications } from '../../core/panel-specifications';
import { PanelSpecificationFields } from '../../shared/panel-specification-fields';
import { ProductImageUploader } from '../../shared/product-image-uploader';
import type { ProductImage } from '../../core/product-images';
import { validProductImages } from '../../core/product-images';
import { supplierProductUrlError } from '../../core/supplier-product-url';
import { parseMcbAmperage, parseAtsAmperage } from '../../core/mcb-specifications';
import { PRODUCT_CATEGORIES } from '../../core/product-categories';

interface ProductForm {
  name: string; brand: string; category: string; protectionType: string; mcbType: string; mcbAmperage: string; atsAmperage: string; unitCode: string;
  description: string; priceText: string; supplierId: string; supplierUrl: string;
  panelSpecifications: PanelSpecifications;
  images: ProductImage[];
}
const EMPTY: ProductForm = { name: '', brand: '', category: '', protectionType: '', mcbType: '', mcbAmperage: '', atsAmperage: '', unitCode: '', description: '', priceText: '', supplierId: '', supplierUrl: '', panelSpecifications: {}, images: [] };
const CATEGORIES = PRODUCT_CATEGORIES;
const UNITS = ['unit', 'panel', 'kit'] as const;
const MAX_AMOUNT = 99_999_999_999_999;

function price(text: string): number | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text.trim())) return null;
  const [whole, fraction = ''] = text.trim().split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= MAX_AMOUNT ? amount : null;
}
function form(product: AdminProduct): ProductForm {
  return {
    name: product.name, brand: product.brand, category: product.category ?? '', unitCode: product.unitCode ?? '',
    protectionType: product.protectionType ?? '', mcbType: product.mcbSpecifications?.type ?? '',
    mcbAmperage: product.mcbSpecifications ? String(product.mcbSpecifications.amperage) : '',
    atsAmperage: product.atsSpecifications ? String(product.atsSpecifications.amperage) : '',
    description: product.description, supplierId: product.supplierId, supplierUrl: product.supplierUrl ?? '',
    panelSpecifications: { ...product.panelSpecifications },
    images: [...(product.images ?? [])],
    priceText: product.amountMinor === null ? '' : `${Math.floor(product.amountMinor / 100)}.${String(product.amountMinor % 100).padStart(2, '0')}`,
  };
}
function clean(text: string, max: number, multiline = false): boolean {
  return text.length <= max && !(multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(text);
}

@Component({
  selector: 'app-admin-product-editor',
  imports: [FormsModule, RouterLink, Tooltip, PanelSpecificationFields, ProductImageUploader],
  templateUrl: './admin-product-editor.html',
})
export class AdminProductEditorPage {
  readonly access = inject(AdminAccessService);
  readonly auth = inject(AuthSessionService);
  readonly login = inject(AuthNavigationService);
  private readonly api = inject(AdminCatalogApiService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  readonly routeId = toSignal(this.route.paramMap.pipe(map(params => params.get('id') ?? '')), { initialValue: this.route.snapshot.paramMap.get('id') ?? '' });
  readonly authorizedRevision = signal(-1);
  private readonly authorizedId = signal('');
  readonly canAccess = computed(() => this.access.authorized() && this.auth.sessionRevision() === this.authorizedRevision()
    && this.routeId() === this.authorizedId());
  readonly product = signal<AdminProduct | null>(null);
  readonly input = signal<ProductForm>({ ...EMPTY });
  private readonly baseline = signal<ProductForm>({ ...EMPTY });
  readonly dirty = computed(() => JSON.stringify(this.input()) !== JSON.stringify(this.baseline()));
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly imageUploading = signal(false);
  readonly confirming = signal(false);
  readonly busy = computed(() => this.loading() || this.saving() || this.confirming() || this.imageUploading());
  readonly error = signal<string | null>(null);
  readonly conflict = signal(false);
  readonly notice = signal<string | null>(null);
  readonly attempted = signal(false);
  readonly suppliers = signal<AdminSupplier[]>([]);
  private readonly resolvedSupplier = signal<AdminSupplier | null>(null);
  readonly supplierCursor = signal<string | null>(null);
  readonly suppliersLoading = signal(false);
  readonly suppliersError = signal<string | null>(null);
  readonly categories = CATEGORIES;
  readonly units = UNITS;
  readonly currentSupplierLoaded = computed(() => this.suppliers().some(item => item.id === this.input().supplierId && item.status === 'active'));
  readonly currentSupplierKnown = computed(() => this.suppliers().some(item => item.id === this.input().supplierId));
  readonly selectedSupplier = computed(() => this.suppliers().find(item => item.id === this.input().supplierId)
    ?? (this.resolvedSupplier()?.id === this.input().supplierId ? this.resolvedSupplier() : null));
  readonly supplierUrlRequired = computed(() => this.selectedSupplier()?.name.trim().toLowerCase() === 'shopee');
  readonly errors = computed(() => {
    const input = this.input();
    const errors: Partial<Record<keyof ProductForm, string>> = {};
    if (!input.name.trim() || !clean(input.name, 160)) errors.name = 'Enter a product name of 1–160 characters without control characters.';
    if (!clean(input.brand, 80)) errors.brand = 'Keep the brand to 80 characters without control characters.';
    if (input.category && !CATEGORIES.includes(input.category as typeof CATEGORIES[number])) errors.category = 'Choose a listed category.';
    if (input.category === 'Circuit breakers') {
      if (input.mcbType !== 'AC' && input.mcbType !== 'DC') errors.mcbType = 'Choose AC or DC.';
      if (parseMcbAmperage(input.mcbAmperage) === null) errors.mcbAmperage = 'Enter a valid amperage greater than zero.';
    }
    if (input.category === 'ATS' && parseAtsAmperage(input.atsAmperage) === null)
      errors.atsAmperage = 'Enter a valid amperage greater than zero.';
    if (input.unitCode && !UNITS.includes(input.unitCode as typeof UNITS[number])) errors.unitCode = 'Choose a listed unit.';
    if (!clean(input.description, 4000, true)) errors.description = 'Keep the description to 4,000 characters; tabs and other control characters are not allowed.';
    if (input.priceText.trim() && price(input.priceText) === null) errors.priceText = 'Enter 0–999,999,999,999.99 PHP, with up to two decimal places and no commas.';
    // Preserve an existing supplier outside the loaded page; new choices must be loaded and active.
    if (!input.supplierId || input.supplierId !== this.product()?.supplierId && !this.currentSupplierLoaded()) errors.supplierId = 'Choose a loaded active supplier.';
    const supplierUrlError = supplierProductUrlError(input.supplierUrl, this.selectedSupplier()?.name);
    if (!this.selectedSupplier()) errors.supplierUrl = 'Load the selected supplier before validating its product URL.';
    else if (supplierUrlError) errors.supplierUrl = supplierUrlError;
    if (input.category === 'Panels' && Object.keys(panelSpecificationErrors(input.panelSpecifications)).length) errors.panelSpecifications = 'Review the panel specification fields.';
    if (!validProductImages(input.images)) errors.images = 'Use at most 6 unique uploaded images.';
    return errors;
  });
  readonly checklist = computed(() => {
    const input = this.input();
    return [
      { label: 'Brand is provided', ready: !!input.brand.trim() && !this.errors().brand },
      { label: 'Description is provided', ready: !!input.description.trim() && !this.errors().description },
      { label: 'Category is selected', ready: !!input.category && !this.errors().category },
      { label: 'Sellable unit is selected', ready: !!input.unitCode && !this.errors().unitCode },
      { label: 'PHP price is set (zero is valid)', ready: price(input.priceText) !== null },
      { label: 'Supplier is loaded and active', ready: this.currentSupplierLoaded() },
      { label: 'Supplier product URL is valid', ready: !this.errors().supplierUrl },
      { label: 'At least one product image is uploaded', ready: input.images.length >= 1 && validProductImages(input.images) },
      ...(input.category === 'Circuit breakers'
        ? [{ label: 'MCB type and amperage are valid', ready: !this.errors().mcbType && !this.errors().mcbAmperage }] : []),
      ...(input.category === 'ATS'
        ? [{ label: 'ATS amperage is valid', ready: !this.errors().atsAmperage }] : []),
    ];
  });
  readonly canPublish = computed(() => this.canAccess() && !!this.product() && !this.busy() && !this.dirty()
    && Object.keys(this.errors()).length === 0 && this.checklist().every(item => item.ready));
  readonly publishHint = computed(() => this.dirty() ? 'Save changes before publishing.'
    : this.busy() ? 'Wait for the current operation.' : !this.canPublish() ? 'Complete the publishing checklist first.' : 'Publish the saved product.');
  private operation = 0;
  private supplierOperation = 0;
  private supplierLookupOperation = 0;
  private supplierLookupId: string | null = null;
  private disposed = false;
  private requestKey: string | null = null;
  private requestId: string | null = null;
  private confirmation: DialogRef<boolean> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.disposed = true; this.reset(); });
    effect(() => {
      const revision = this.auth.sessionRevision();
      const authorized = this.access.authorized();
      const id = this.routeId();
      untracked(() => {
        this.reset();
        this.authorizedRevision.set(authorized ? revision : -1);
        this.authorizedId.set(authorized ? id : '');
        if (authorized) { void this.loadProduct(id, revision); void this.loadSuppliers(null, revision); }
      });
    });
  }

  update<K extends keyof ProductForm>(key: K, value: ProductForm[K]): void {
    if (!this.canAccess() || this.loading() || this.saving() || this.confirming() || this.input()[key] === value) return;
    this.input.update(input => {
      const updated = { ...input, [key]: value };
      if (key === 'category') {
        updated.protectionType = value === 'Circuit breakers' ? 'MCB' : value === 'ATS' ? 'ATS' : '';
        if (value !== 'Circuit breakers') { updated.mcbType = ''; updated.mcbAmperage = ''; }
        if (value !== 'ATS') updated.atsAmperage = '';
      } else if (key === 'protectionType') {
        if (value !== 'MCB') { updated.mcbType = ''; updated.mcbAmperage = ''; }
        if (value !== 'ATS') updated.atsAmperage = '';
      }
      return updated;
    });
    this.requestKey = null; this.requestId = null; this.error.set(null); this.notice.set(null);
  }
  showError(key: keyof ProductForm): string | null { return this.attempted() ? this.errors()[key] ?? null : null; }

  private current(id: string, revision: number, operation: number): boolean {
    return !this.disposed && this.canAccess() && this.routeId() === id && this.auth.sessionRevision() === revision && this.operation === operation;
  }
  private accept(product: AdminProduct): void {
    this.product.set(product);
    const values = form(product);
    this.input.set(values); this.baseline.set(values);
    this.requestKey = null; this.requestId = null; this.attempted.set(false); this.conflict.set(false);
    void this.resolveSupplier(product.supplierId, this.auth.sessionRevision());
  }
  private async loadProduct(id: string, revision: number): Promise<void> {
    const operation = ++this.operation;
    this.loading.set(true); this.error.set(null);
    try {
      const result = await this.api.getProduct(id);
      if (this.current(id, revision, operation)) this.accept(result.product);
    } catch (error) { if (this.current(id, revision, operation)) this.report(error); }
    finally { if (operation === this.operation) this.loading.set(false); }
  }
  async reload(): Promise<void> {
    if (!this.canAccess() || this.busy()) return;
    const revision = this.auth.sessionRevision(), id = this.routeId(), operation = this.operation;
    if (this.dirty()) {
      const allowed = await this.confirmDiscard();
      if (!allowed || !this.current(id, revision, operation)) return;
    }
    if (this.current(id, revision, operation)) await this.loadProduct(id, revision);
  }
  async loadMoreSuppliers(): Promise<void> {
    if (this.supplierCursor()) await this.loadSuppliers(this.supplierCursor(), this.auth.sessionRevision());
  }
  async retrySuppliers(): Promise<void> {
    await this.loadSuppliers(this.suppliers().length ? this.supplierCursor() : null, this.auth.sessionRevision());
  }
  private async loadSuppliers(cursor: string | null, revision: number): Promise<void> {
    if (!this.canAccess() || this.disposed || this.suppliersLoading()) return;
    const operation = ++this.supplierOperation;
    this.suppliersLoading.set(true); this.suppliersError.set(null);
    try {
      const page = await this.api.listSuppliers(cursor);
      if (!this.disposed && operation === this.supplierOperation && this.canAccess() && revision === this.auth.sessionRevision()) {
        this.suppliers.set(cursor ? [...this.suppliers(), ...page.items] : page.items);
        this.supplierCursor.set(page.nextCursor);
        void this.resolveSupplier(this.product()?.supplierId ?? '', revision);
      }
    } catch (error) {
      if (!this.disposed && operation === this.supplierOperation && this.canAccess() && revision === this.auth.sessionRevision()) {
        this.suppliersError.set(error instanceof StoreApiError ? error.message : 'Unable to load suppliers. Retry.');
      }
    } finally { if (operation === this.supplierOperation) this.suppliersLoading.set(false); }
  }
  private async resolveSupplier(id: string, revision: number): Promise<void> {
    if (!id || !this.product() || this.product()?.supplierId !== id || !this.canAccess() || revision !== this.auth.sessionRevision()) return;
    const listed = this.suppliers().find(item => item.id === id);
    if (listed) {
      this.supplierLookupOperation++;
      this.supplierLookupId = null;
      this.resolvedSupplier.set(listed);
      return;
    }
    if (this.resolvedSupplier()?.id === id || this.supplierLookupId === id) return;
    const operation = ++this.supplierLookupOperation;
    this.supplierLookupId = id;
    this.resolvedSupplier.set(null);
    try {
      const result = await this.api.getSupplier(id);
      if (!this.disposed && operation === this.supplierLookupOperation && this.canAccess() && revision === this.auth.sessionRevision() && this.product()?.supplierId === id)
        this.resolvedSupplier.set(result.supplier);
    } catch (error) {
      if (!this.disposed && operation === this.supplierLookupOperation && this.canAccess() && revision === this.auth.sessionRevision())
        this.suppliersError.set(error instanceof StoreApiError ? error.message : 'Unable to load the selected supplier. Retry.');
    }
    finally { if (operation === this.supplierLookupOperation) this.supplierLookupId = null; }
  }
  private idFor(action: string, values: unknown): string {
    const key = JSON.stringify([this.auth.sessionRevision(), this.routeId(), action, values]);
    if (key !== this.requestKey || !this.requestId) { this.requestKey = key; this.requestId = crypto.randomUUID(); }
    return this.requestId;
  }
  async save(): Promise<void> {
    const product = this.product();
    if (!this.canAccess() || !product || this.busy() || !this.dirty()) return;
    this.attempted.set(true); this.error.set(null); this.notice.set(null);
    if (Object.keys(this.errors()).length) { this.toast.error('Review the highlighted fields and try again.'); return; }
    const input = this.input();
    const values: Omit<ProductUpdateInput, 'requestId'> = {
      sku: product.sku, name: input.name.trim(), brand: input.brand.trim(),
      category: (input.category || null) as ProductCreateInput['category'],
      unitCode: (input.unitCode || null) as ProductCreateInput['unitCode'],
      description: input.description.trim(), amountMinor: input.priceText.trim() ? price(input.priceText) : null,
      supplierId: input.supplierId, supplierUrl: input.supplierUrl.trim(), expectedVersion: product.version,
      ...protectionPayload(input, product),
      images: [...input.images],
      ...panelSpecificationPayload(input.category, input.panelSpecifications, Object.hasOwn(product, 'panelSpecifications')),
    };
    const body = { requestId: this.idFor('save', values), ...values };
    await this.mutate(() => this.api.updateProduct(product.id, body), 'Saved privately. Publish to update the public listing.');
  }
  async publish(): Promise<void> {
    const product = this.product();
    if (!this.canPublish() || !product) return;
    const values = { expectedVersion: product.version };
    const body = { requestId: this.idFor('publish', values), ...values };
    await this.mutate(() => this.api.publishProduct(product.id, body), 'The saved product is now published.');
  }
  async unpublish(): Promise<void> {
    const product = this.product();
    if (!this.canAccess() || !product || product.state !== 'published' || this.busy() || this.dirty()) return;
    const revision = this.auth.sessionRevision(), id = this.routeId(), operation = this.operation;
    this.confirming.set(true);
    const confirmation = this.dialog.open<boolean>(AdminProductUnpublishDialog, {
      data: { name: product.name }, width: '480px', maxWidth: 'calc(100vw - 32px)',
      ariaLabelledBy: 'admin-unpublish-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    });
    this.confirmation = confirmation;
    const confirmed = await firstValueFrom(confirmation.closed.pipe(defaultIfEmpty(false)));
    if (!this.current(id, revision, operation)) return;
    if (this.confirmation === confirmation) this.confirmation = null;
    this.confirming.set(false);
    if (confirmed !== true) return;
    const values = { expectedVersion: product.version };
    const body = { requestId: this.idFor('unpublish', values), ...values };
    await this.mutate(() => this.api.unpublishProduct(product.id, body), 'Listing removed. The product is now a private draft.');
  }
  private async mutate(request: () => Promise<{ product: AdminProduct }>, notice: string): Promise<void> {
    const id = this.routeId(), revision = this.auth.sessionRevision(), operation = ++this.operation;
    this.saving.set(true); this.error.set(null); this.notice.set(null);
    try {
      if (!this.current(id, revision, operation)) return;
      const result = await request();
      if (this.current(id, revision, operation)) { this.accept(result.product); this.notice.set(notice); this.toast.success(notice); }
    } catch (error) {
      if (this.current(id, revision, operation)) {
        this.report(error);
        this.toast.error(this.error() ?? 'Unable to complete this action. Your input is preserved; retry unchanged details.');
      }
    }
    finally { if (operation === this.operation) this.saving.set(false); }
  }
  private report(error: unknown): void {
    this.conflict.set(error instanceof StoreApiError && error.code === 'conflict');
    this.error.set(error instanceof StoreApiError ? error.message : 'Unable to complete this action. Your input is preserved; retry unchanged details.');
  }
  canLeave(): boolean | Observable<boolean> {
    if (this.auth.signOutRevision() > 0 && this.auth.status() === 'signed-out') return true;
    if (!this.canAccess()) return true;
    if (this.saving() || this.imageUploading() || this.confirming() || this.confirmation) return false;
    if (!this.dirty()) return true;
    return this.openDiscard().closed.pipe(map(value => value === true));
  }
  private openDiscard(): DialogRef<boolean> {
    this.confirming.set(true);
    const confirmation = this.dialog.open<boolean>(AdminDiscardDialog, {
      data: { kind: 'product' }, width: '480px', maxWidth: 'calc(100vw - 32px)',
      ariaLabelledBy: 'admin-discard-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    });
    this.confirmation = confirmation;
    confirmation.closed.subscribe(() => {
      if (this.confirmation === confirmation) { this.confirmation = null; this.confirming.set(false); }
    });
    return confirmation;
  }
  private async confirmDiscard(): Promise<boolean> {
    const id = this.routeId(), revision = this.auth.sessionRevision(), operation = this.operation;
    this.confirming.set(true);
    const confirmation = this.openDiscard();
    const result = await firstValueFrom(confirmation.closed.pipe(defaultIfEmpty(false)));
    if (this.current(id, revision, operation)) this.confirming.set(false);
    return result === true;
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.canAccess() && (this.dirty() || this.imageUploading())) { event.preventDefault(); event.returnValue = ''; }
  }
  private reset(): void {
    this.operation++; this.supplierOperation++; this.supplierLookupOperation++; this.supplierLookupId = null;
    this.confirmation?.close(false); this.confirmation = null;
    this.product.set(null); this.input.set({ ...EMPTY, images: [] }); this.baseline.set({ ...EMPTY, images: [] });
    this.suppliers.set([]); this.resolvedSupplier.set(null); this.supplierCursor.set(null); this.suppliersError.set(null);
    this.loading.set(false); this.saving.set(false); this.confirming.set(false); this.imageUploading.set(false); this.suppliersLoading.set(false);
    this.error.set(null); this.notice.set(null); this.attempted.set(false); this.conflict.set(false);
    this.requestKey = null; this.requestId = null;
  }
}

function protectionPayload(input: ProductForm, product: AdminProduct): Pick<ProductUpdateInput, 'protectionType' | 'mcbSpecifications' | 'atsSpecifications'> | Record<string, never> {
  const cleared = {
    ...(Object.hasOwn(product, 'mcbSpecifications') || product.protectionType === 'MCB' ? { mcbSpecifications: null } : {}),
    ...(Object.hasOwn(product, 'atsSpecifications') || product.protectionType === 'ATS' ? { atsSpecifications: null } : {}),
  };
  if (input.category === 'Circuit breakers') {
    const amperage = parseMcbAmperage(input.mcbAmperage);
    if ((input.mcbType === 'AC' || input.mcbType === 'DC') && amperage !== null)
      return { ...cleared, protectionType: 'MCB', mcbSpecifications: { type: input.mcbType, amperage } };
  }
  if (input.category === 'ATS') {
    const amperage = parseAtsAmperage(input.atsAmperage);
    if (amperage !== null) return { ...cleared, protectionType: 'ATS', atsSpecifications: { amperage } };
  }
  return Object.hasOwn(product, 'protectionType') || Object.keys(cleared).length ? { ...cleared, protectionType: null } : {};
}

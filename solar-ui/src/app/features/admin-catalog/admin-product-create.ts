import { Dialog } from '@angular/cdk/dialog';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, Injector, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import { ToastService } from '../../core/toast.service';
import type { AdminPage, AdminSupplier, ProductCreateInput } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { STOREFRONT_AUTH_ENABLED } from '../../core/firebase-config';
import { StoreApiError } from '../../core/store-api.service';
import { AdminDiscardDialog } from './admin-discard-dialog';
import { parsePreviewPrice } from '../products/product-draft';
import { panelSpecificationErrors, panelSpecificationPayload, type PanelSpecifications } from '../../core/panel-specifications';
import { PanelSpecificationFields } from '../../shared/panel-specification-fields';
import { ProductImageUploader } from '../../shared/product-image-uploader';
import type { ProductImage } from '../../core/product-images';

interface ProductForm { sku: string; name: string; brand: string; category: string; unitCode: string; description: string; priceText: string; supplierId: string; panelSpecifications: PanelSpecifications; images: ProductImage[]; }
type ProductErrors = Partial<Record<keyof ProductForm, string>>;
const EMPTY: ProductForm = { sku: '', name: '', brand: '', category: '', unitCode: '', description: '', priceText: '', supplierId: '', panelSpecifications: {}, images: [] };
const CATEGORIES = ['Panels', 'Inverters', 'Batteries', 'Mounting', 'Protection'] as const;
const UNITS = ['unit', 'panel', 'kit'] as const;
const MAX_AMOUNT_MINOR = 99_999_999_999_999;

function validate(input: ProductForm, suppliers: readonly AdminSupplier[]): ProductErrors {
  const errors: ProductErrors = {};
  if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(input.sku.trim())) errors.sku = 'Enter an uppercase ASCII SKU of 1–64 letters, numbers, dots, hyphens, or underscores.';
  const name = input.name.trim();
  if (!name || name.length > 160) errors.name = 'Enter a product name of 1–160 characters.';
  if (input.brand.trim().length > 80) errors.brand = 'Keep the brand to 80 characters or fewer.';
  if (input.category && !CATEGORIES.includes(input.category as typeof CATEGORIES[number])) errors.category = 'Choose a listed category or leave it unset.';
  if (input.unitCode && !UNITS.includes(input.unitCode as typeof UNITS[number])) errors.unitCode = 'Choose a listed unit or leave it unset.';
  if (input.description.length > 4000) errors.description = 'Keep the description to 4,000 characters or fewer.';
  if (input.priceText.trim()) {
    const price = parsePreviewPrice(input.priceText);
    if (!price || price.amountMinor > MAX_AMOUNT_MINOR) errors.priceText = 'Enter a PHP amount from 0 to 999,999,999,999.99 with at most two decimal places and no commas.';
  }
  if (!input.supplierId || !suppliers.some(supplier => supplier.id === input.supplierId && supplier.status === 'active')) errors.supplierId = 'Choose an active supplier from the loaded supplier records.';
  if (input.category === 'Panels' && Object.keys(panelSpecificationErrors(input.panelSpecifications)).length) errors.panelSpecifications = 'Review the panel specification fields.';
  return errors;
}

@Component({
  selector: 'app-admin-product-create',
  imports: [FormsModule, RouterLink, PanelSpecificationFields, ProductImageUploader],
  templateUrl: './admin-product-create.html',
})
export class AdminProductCreatePage {
  readonly access = inject(AdminAccessService);
  readonly auth = inject(AuthSessionService);
  readonly login = inject(AuthNavigationService);
  readonly authorizedRevision = signal(-1);
  readonly canAccess = computed(() => this.access.authorized() && this.auth.sessionRevision() === this.authorizedRevision());
  private readonly api = inject(AdminCatalogApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly input = signal<ProductForm>({ ...EMPTY });
  readonly attempted = signal(false);
  readonly saving = signal(false);
  readonly imageUploading = signal(false);
  readonly saved = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly suppliers = signal<AdminSupplier[]>([]);
  readonly supplierCursor = signal<string | null>(null);
  readonly suppliersLoading = signal(false);
  readonly suppliersError = signal<string | null>(null);
  readonly errors = computed(() => validate(this.input(), this.suppliers()));
  readonly dirty = computed(() => JSON.stringify(this.input()) !== JSON.stringify(EMPTY));
  readonly categories = CATEGORIES;
  readonly units = UNITS;
  private operation = 0;
  private supplierSequence = 0;
  private seenRevision = -1;
  private suppliersRevision = -1;
  private wasAuthorized = false;
  private reviewedPayload: string | null = null;
  private requestId: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => { this.operation++; this.supplierSequence++; });
    this.seenRevision = this.auth.sessionRevision();
    this.wasAuthorized = this.access.authorized();
    effect(() => {
      const revision = this.auth.sessionRevision();
      const authorized = this.access.authorized();
      const revisionChanged = revision !== this.seenRevision;
      const authorizationChanged = !this.wasAuthorized;
      if (revisionChanged || !authorized && this.wasAuthorized) this.clearForAccessChange();
      this.seenRevision = revision;
      this.authorizedRevision.set(authorized ? revision : -1);
      if (authorized && (authorizationChanged || revisionChanged || this.suppliersRevision !== revision)) {
        this.suppliersRevision = revision;
        this.suppliers.set([]); this.supplierCursor.set(null);
        void this.loadSuppliers(null, true, revision);
      }
      if (!authorized) {
        this.supplierSequence++; this.suppliers.set([]); this.supplierCursor.set(null);
        this.suppliersError.set(null); this.suppliersLoading.set(false);
        this.suppliersRevision = -1;
      }
      this.wasAuthorized = authorized;
    });
  }

  update<K extends keyof ProductForm>(field: K, value: ProductForm[K]): void {
    const next = field === 'sku' ? String(value).toUpperCase() : value;
    if (this.input()[field] === next) return;
    this.input.update(input => ({ ...input, [field]: next }));
    this.reviewedPayload = null; this.requestId = null; this.saveError.set(null);
  }
  showError(field: keyof ProductForm): string | null { return this.attempted() ? this.errors()[field] ?? null : null; }

  async loadMoreSuppliers(): Promise<void> {
    const cursor = this.supplierCursor();
    if (cursor) await this.loadSuppliers(cursor, false, this.auth.sessionRevision());
  }
  retrySuppliers(): void {
    if (this.suppliersLoading() || !this.canAccess()) return;
    void this.loadSuppliers(this.suppliers().length ? this.supplierCursor() : null, !this.suppliers().length, this.auth.sessionRevision());
  }

  private async loadSuppliers(cursor: string | null, replace: boolean, revision: number): Promise<void> {
    if (!this.canAccess() || revision !== this.auth.sessionRevision() || this.suppliersLoading()) return;
    const sequence = ++this.supplierSequence;
    this.suppliersLoading.set(true); this.suppliersError.set(null);
    try {
      const page: AdminPage<AdminSupplier> = await this.api.listSuppliers(cursor);
      if (sequence !== this.supplierSequence || !this.canAccess() || revision !== this.auth.sessionRevision()) return;
      const active = page.items.filter(supplier => supplier.status === 'active');
      this.suppliers.set(replace ? active : [...this.suppliers(), ...active]);
      this.supplierCursor.set(page.nextCursor);
    } catch (error) {
      if (sequence === this.supplierSequence && this.canAccess() && revision === this.auth.sessionRevision()) {
        this.suppliersError.set(error instanceof StoreApiError ? error.message : 'Unable to load suppliers. Try again.');
      }
    } finally { if (sequence === this.supplierSequence) this.suppliersLoading.set(false); }
  }

  async save(): Promise<void> {
    if (this.saving() || this.imageUploading() || this.saved() || !this.canAccess()) return;
    this.attempted.set(true); this.saveError.set(null);
    if (Object.keys(this.errors()).length) { this.toast.error('Review the highlighted fields and try again.'); this.focusError(); return; }
    const revision = this.auth.sessionRevision();
    const input = this.input();
    const price = input.priceText.trim() ? parsePreviewPrice(input.priceText) : null;
    const values: Omit<ProductCreateInput, 'requestId'> = {
      sku: input.sku.trim(), name: input.name.trim(), brand: input.brand.trim(),
      category: input.category ? input.category as ProductCreateInput['category'] : null,
      unitCode: input.unitCode ? input.unitCode as ProductCreateInput['unitCode'] : null,
      description: input.description, amountMinor: price?.amountMinor ?? null, supplierId: input.supplierId,
      images: [...input.images],
      ...panelSpecificationPayload(input.category, input.panelSpecifications),
    };
    const key = JSON.stringify(values);
    if (key !== this.reviewedPayload || !this.requestId) { this.reviewedPayload = key; this.requestId = crypto.randomUUID(); }
    const payload: ProductCreateInput = { requestId: this.requestId, ...values };
    const operation = ++this.operation;
    this.saving.set(true);
    try {
      if (!this.canAccess() || revision !== this.auth.sessionRevision()) return;
      try { await this.api.createProduct(payload); }
      catch (error) {
        if (operation === this.operation && this.canAccess() && revision === this.auth.sessionRevision()) {
          const message = error instanceof StoreApiError ? error.message : 'Unable to save product. Your input is preserved; review it and retry.';
          this.saveError.set(message);
          this.toast.error(message);
        }
        return;
      }
      if (operation !== this.operation || !this.canAccess() || revision !== this.auth.sessionRevision()) return;
      this.saved.set(true);
      this.toast.success('Product saved.');
      try { await this.router.navigateByUrl('/admin/products'); } catch { /* The product was saved; navigation can be retried separately. */ }
    } finally { if (operation === this.operation) this.saving.set(false); }
  }

  cancel(): void { if (!this.saving()) void this.router.navigateByUrl('/admin/products'); }
  canLeave(): boolean | Observable<boolean> {
    if (this.auth.signOutRevision() > 0 && this.auth.status() === 'signed-out') return true;
    if (this.saved()) return true;
    if (this.saving() || this.imageUploading()) return false;
    if (!this.dirty()) return true;
    return this.dialog.open<boolean, { kind: 'product' }>(AdminDiscardDialog, {
      data: { kind: 'product' }, width: '480px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'admin-discard-heading',
      panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    }).closed.pipe(map(result => result === true));
  }
  statusMessage(): string {
    if (!STOREFRONT_AUTH_ENABLED && this.auth.status() === 'unavailable') return 'Google sign-in is disabled pending Firebase Auth setup approval. No product data was submitted.';
    switch (this.access.status()) {
      case 'checking': return 'Checking administrator access…';
      case 'signed-out': return 'Sign in with an authorized Google account to create a private draft product.';
      case 'forbidden': return 'This account is not authorized to create product records.';
      case 'unavailable': return 'Administrator access is unavailable. Retry when the service is reachable.';
      default: return '';
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void { if ((this.dirty() && !this.saved()) || this.imageUploading()) { event.preventDefault(); event.returnValue = ''; } }

  private clearForAccessChange(): void {
    this.operation++; this.saving.set(false); this.imageUploading.set(false); this.input.set({ ...EMPTY, images: [] }); this.attempted.set(false);
    this.saved.set(false); this.saveError.set(null); this.reviewedPayload = null; this.requestId = null;
  }
  private focusError(): void {
    afterNextRender(() => (this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?? this.host.nativeElement.querySelector<HTMLElement>('[role="alert"]'))?.focus(), { injector: this.injector });
  }
}

import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, DestroyRef, effect, HostListener, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { defaultIfEmpty, firstValueFrom, map, Observable } from 'rxjs';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import { ToastService } from '../../core/toast.service';
import type { AdminSupplier, SupplierUpdateInput, SupplierStatusInput } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { STOREFRONT_AUTH_ENABLED } from '../../core/firebase-config';
import { StoreApiError } from '../../core/store-api.service';
import { AdminDiscardDialog } from './admin-discard-dialog';
import { AdminSupplierStatusDialog } from './admin-supplier-status-dialog';

interface SupplierForm {
  name: string;
  region: string;
  description: string;
  website: string;
  email: string;
  phone: string;
}
type SupplierField = keyof SupplierForm;
type SupplierErrors = Partial<Record<SupplierField, string>>;
const EMPTY: SupplierForm = { name: '', region: '', description: '', website: '', email: '', phone: '' };

function form(supplier: AdminSupplier): SupplierForm {
  return { name: supplier.name, region: supplier.region, description: supplier.description,
    website: supplier.website, email: supplier.email, phone: supplier.phone };
}

function cleanText(value: string, max: number, multiline = false): boolean {
  return value.length <= max && !(multiline
    ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/
    : /[\u0000-\u001f\u007f]/).test(value);
}

function validate(input: SupplierForm): SupplierErrors {
  const errors: SupplierErrors = {};
  const name = input.name.trim();
  if (!name || name.length > 160 || !cleanText(name, 160)) errors.name = 'Enter a supplier name of 1–160 characters without control characters.';
  if (!cleanText(input.region, 120)) errors.region = 'Keep the region to 120 characters without control characters.';
  if (!cleanText(input.description, 4000, true)) errors.description = 'Keep the description to 4,000 characters; tabs and other control characters are not allowed.';
  if (!cleanText(input.website, 500)) errors.website = 'Keep the website URL to 500 characters without control characters.';
  else if (input.website.trim()) {
    try {
      const url = new URL(input.website.trim());
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error();
    } catch { errors.website = 'Enter an HTTPS website URL without username or password.'; }
  }
  if (!cleanText(input.email, 320) || input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Enter a valid email address of 320 characters or fewer.';
  }
  if (!cleanText(input.phone, 80)) errors.phone = 'Keep the phone number to 80 characters without control characters.';
  return errors;
}

@Component({
  selector: 'app-admin-supplier-editor',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-supplier-editor.html',
})
export class AdminSupplierEditorPage {
  readonly access = inject(AdminAccessService);
  readonly auth = inject(AuthSessionService);
  readonly login = inject(AuthNavigationService);
  private readonly api = inject(AdminCatalogApiService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly routeId = toSignal(this.route.paramMap.pipe(map(params => params.get('id') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('id') ?? '' });
  readonly authorizedRevision = signal(-1);
  private readonly authorizedId = signal('');
  readonly canAccess = computed(() => this.access.authorized()
    && this.auth.sessionRevision() === this.authorizedRevision() && this.routeId() === this.authorizedId());

  readonly supplier = signal<AdminSupplier | null>(null);
  readonly input = signal<SupplierForm>({ ...EMPTY });
  private readonly baseline = signal<SupplierForm>({ ...EMPTY });
  readonly dirty = computed(() => JSON.stringify(this.input()) !== JSON.stringify(this.baseline()));
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly confirming = signal(false);
  readonly busy = computed(() => this.loading() || this.saving() || this.confirming());
  readonly attempted = signal(false);
  readonly error = signal<string | null>(null);
  readonly conflict = signal(false);
  readonly notice = signal<string | null>(null);
  readonly errors = computed(() => validate(this.input()));

  private operation = 0;
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
        if (authorized && id) void this.loadSupplier(id, revision);
      });
    });
  }

  update(field: SupplierField, value: string): void {
    if (!this.canAccess() || this.busy() || this.input()[field] === value) return;
    this.input.update(input => ({ ...input, [field]: value }));
    this.requestKey = null; this.requestId = null; this.error.set(null); this.conflict.set(false); this.notice.set(null);
  }

  showError(field: SupplierField): string | null { return this.attempted() ? this.errors()[field] ?? null : null; }

  private current(id: string, revision: number, operation: number): boolean {
    return !this.disposed && this.canAccess() && this.routeId() === id
      && this.auth.sessionRevision() === revision && this.operation === operation;
  }

  private accept(supplier: AdminSupplier): void {
    this.supplier.set(supplier);
    const values = form(supplier);
    this.input.set(values); this.baseline.set(values);
    this.requestKey = null; this.requestId = null; this.attempted.set(false); this.conflict.set(false);
  }

  private async loadSupplier(id: string, revision: number): Promise<void> {
    const operation = ++this.operation;
    this.loading.set(true); this.error.set(null); this.notice.set(null);
    try {
      const result = await this.api.getSupplier(id);
      if (this.current(id, revision, operation) && result.supplier.id === id.toLowerCase()) this.accept(result.supplier);
    } catch (error) {
      if (this.current(id, revision, operation)) this.report(error, 'Unable to load supplier details. Retry.');
    } finally { if (operation === this.operation) this.loading.set(false); }
  }

  async reload(): Promise<void> {
    if (!this.canAccess() || this.busy()) return;
    const id = this.routeId(), revision = this.auth.sessionRevision(), operation = this.operation;
    if (this.dirty()) {
      const allowed = await this.confirmDiscard();
      if (!allowed || !this.current(id, revision, operation)) return;
    }
    if (this.current(id, revision, operation)) await this.loadSupplier(id, revision);
  }

  private idFor(action: 'save' | 'status', values: unknown): string {
    const key = JSON.stringify([this.auth.sessionRevision(), this.routeId(), action, values]);
    if (key !== this.requestKey || !this.requestId) { this.requestKey = key; this.requestId = crypto.randomUUID(); }
    return this.requestId;
  }

  async save(): Promise<void> {
    const supplier = this.supplier();
    if (!this.canAccess() || !supplier || this.busy() || !this.dirty()) return;
    this.attempted.set(true); this.error.set(null); this.notice.set(null);
    if (Object.keys(this.errors()).length) {
      this.toast.error('Review the highlighted fields and try again.');
      return;
    }
    const input = this.input();
    const values: Omit<SupplierUpdateInput, 'requestId'> = {
      name: input.name.trim(), region: input.region.trim(), description: input.description.trim(),
      website: input.website.trim(), email: input.email.trim(), phone: input.phone.trim(),
      expectedVersion: supplier.version,
    };
    const body: SupplierUpdateInput = { requestId: this.idFor('save', values), ...values };
    await this.mutate(() => this.api.updateSupplier(supplier.id, body), 'Supplier details saved.');
  }

  async changeStatus(targetStatus: 'active' | 'inactive'): Promise<void> {
    const supplier = this.supplier();
    if (!this.canAccess() || !supplier || supplier.status === targetStatus || this.busy() || this.dirty()) return;
    const id = this.routeId(), revision = this.auth.sessionRevision(), operation = this.operation;
    this.confirming.set(true);
    const confirmation = this.dialog.open<boolean, { supplierName: string; targetStatus: 'active' | 'inactive' }>(AdminSupplierStatusDialog, {
      data: { supplierName: supplier.name, targetStatus }, width: '520px', maxWidth: 'calc(100vw - 32px)',
      ariaLabelledBy: 'admin-supplier-status-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    });
    this.confirmation = confirmation;
    const confirmed = await firstValueFrom(confirmation.closed.pipe(defaultIfEmpty(false)));
    if (!this.current(id, revision, operation)) return;
    if (this.confirmation === confirmation) this.confirmation = null;
    this.confirming.set(false);
    if (confirmed !== true) return;
    const values = { expectedVersion: supplier.version, status: targetStatus } as const;
    const body: SupplierStatusInput = { requestId: this.idFor('status', values), ...values };
    const message = targetStatus === 'inactive' ? 'Supplier deactivated.' : 'Supplier reactivated.';
    await this.mutate(() => this.api.setSupplierStatus(supplier.id, body), message);
  }

  private async mutate(request: () => Promise<{ supplier: AdminSupplier }>, message: string): Promise<void> {
    const id = this.routeId(), revision = this.auth.sessionRevision(), operation = ++this.operation;
    this.saving.set(true); this.error.set(null); this.notice.set(null);
    try {
      if (!this.current(id, revision, operation)) return;
      const result = await request();
      if (this.current(id, revision, operation)) {
        this.accept(result.supplier); this.notice.set(message); this.toast.success(message);
      }
    } catch (error) {
      if (this.current(id, revision, operation)) {
        this.report(error, 'Unable to complete this action. Your input is preserved; retry unchanged details.');
        this.toast.error(this.error() ?? 'Unable to complete this action. Your input is preserved; retry unchanged details.');
      }
    } finally { if (operation === this.operation) this.saving.set(false); }
  }

  private report(error: unknown, fallback: string): void {
    this.conflict.set(error instanceof StoreApiError && error.code === 'conflict');
    this.error.set(error instanceof StoreApiError ? error.message : fallback);
  }

  canLeave(): boolean | Observable<boolean> {
    if (this.auth.signOutRevision() > 0 && this.auth.status() === 'signed-out') return true;
    if (!this.canAccess()) return true;
    if (this.saving() || this.confirming() || this.confirmation) return false;
    if (!this.dirty()) return true;
    return this.openDiscard().closed.pipe(map(value => value === true));
  }

  private openDiscard(): DialogRef<boolean> {
    this.confirming.set(true);
    const confirmation = this.dialog.open<boolean, { kind: 'supplier' }>(AdminDiscardDialog, {
      data: { kind: 'supplier' }, width: '480px', maxWidth: 'calc(100vw - 32px)',
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
    const confirmation = this.openDiscard();
    const result = await firstValueFrom(confirmation.closed.pipe(defaultIfEmpty(false)));
    if (this.current(id, revision, operation)) this.confirming.set(false);
    return result === true;
  }

  cancel(): void { if (!this.saving()) void this.router.navigateByUrl('/admin/suppliers'); }

  statusMessage(): string {
    if (!STOREFRONT_AUTH_ENABLED && this.auth.status() === 'unavailable') return 'Google sign-in is disabled pending Firebase Auth setup approval. No private supplier records were opened.';
    switch (this.access.status()) {
      case 'checking': return 'Checking administrator access…';
      case 'signed-out': return 'Sign in with an authorized Google account to view private supplier details.';
      case 'forbidden': return 'This account is not authorized to edit supplier records.';
      case 'unavailable': return 'Administrator access is unavailable. Retry when the service is reachable.';
      default: return '';
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.canAccess() && (this.dirty() || this.saving())) { event.preventDefault(); event.returnValue = ''; }
  }

  private reset(): void {
    this.operation++;
    this.confirmation?.close(false); this.confirmation = null;
    this.supplier.set(null); this.input.set({ ...EMPTY }); this.baseline.set({ ...EMPTY });
    this.loading.set(false); this.saving.set(false); this.confirming.set(false);
    this.error.set(null); this.conflict.set(false); this.notice.set(null); this.attempted.set(false);
    this.requestKey = null; this.requestId = null;
  }
}

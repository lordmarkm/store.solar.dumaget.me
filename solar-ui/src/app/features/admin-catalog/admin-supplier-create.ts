import { Dialog } from '@angular/cdk/dialog';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, Injector, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import { ToastService } from '../../core/toast.service';
import type { SupplierCreateInput } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { STOREFRONT_AUTH_ENABLED } from '../../core/firebase-config';
import { StoreApiError } from '../../core/store-api.service';
import { AdminDiscardDialog } from './admin-discard-dialog';

interface SupplierForm { name: string; region: string; description: string; website: string; email: string; phone: string; }
type SupplierErrors = Partial<Record<keyof SupplierForm, string>>;
const EMPTY: SupplierForm = { name: '', region: '', description: '', website: '', email: '', phone: '' };

function validate(input: SupplierForm): SupplierErrors {
  const errors: SupplierErrors = {};
  const name = input.name.trim();
  if (!name || name.length > 160) errors.name = 'Enter a supplier name of 1–160 characters.';
  if (input.region.length > 120) errors.region = 'Keep the region to 120 characters or fewer.';
  if (input.description.length > 4000) errors.description = 'Keep the description to 4,000 characters or fewer.';
  if (input.website.length > 500) errors.website = 'Keep the website URL to 500 characters or fewer.';
  else if (input.website) {
    try {
      const url = new URL(input.website);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error();
    } catch { errors.website = 'Enter an HTTPS website URL without username or password.'; }
  }
  if (input.email && (input.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) errors.email = 'Enter a valid email address of 320 characters or fewer.';
  if (input.phone.length > 80) errors.phone = 'Keep the phone number to 80 characters or fewer.';
  return errors;
}

@Component({
  selector: 'app-admin-supplier-create',
  imports: [FormsModule],
  templateUrl: './admin-supplier-create.html',
})
export class AdminSupplierCreatePage {
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
  readonly input = signal<SupplierForm>({ ...EMPTY });
  readonly attempted = signal(false);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly errors = computed(() => validate(this.input()));
  readonly dirty = computed(() => JSON.stringify(this.input()) !== JSON.stringify(EMPTY));
  private operation = 0;
  private seenRevision = -1;
  private wasAuthorized = false;
  private reviewedPayload: string | null = null;
  private requestId: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => { this.operation++; });
    const revision = this.auth.sessionRevision();
    this.seenRevision = revision;
    this.wasAuthorized = this.access.authorized();
    effect(() => {
      const currentRevision = this.auth.sessionRevision();
      const authorized = this.access.authorized();
      if (currentRevision !== this.seenRevision || !authorized && this.wasAuthorized) this.clearForAccessChange();
      this.seenRevision = currentRevision;
      this.authorizedRevision.set(authorized ? currentRevision : -1);
      this.wasAuthorized = authorized;
    });
  }

  update<K extends keyof SupplierForm>(field: K, value: SupplierForm[K]): void {
    if (this.input()[field] === value) return;
    this.input.update(input => ({ ...input, [field]: value }));
    this.reviewedPayload = null; this.requestId = null; this.saveError.set(null);
  }
  showError(field: keyof SupplierForm): string | null { return this.attempted() ? this.errors()[field] ?? null : null; }

  async save(): Promise<void> {
    if (this.saving() || this.saved() || !this.canAccess()) return;
    this.attempted.set(true); this.saveError.set(null);
    if (Object.keys(this.errors()).length) { this.toast.error('Review the highlighted fields and try again.'); this.focusError(); return; }
    const revision = this.auth.sessionRevision();
    const input = this.input();
    const values = { name: input.name.trim(), region: input.region.trim(), description: input.description, website: input.website.trim(), email: input.email.trim(), phone: input.phone.trim() };
    const key = JSON.stringify(values);
    if (key !== this.reviewedPayload || !this.requestId) { this.reviewedPayload = key; this.requestId = crypto.randomUUID(); }
    const payload: SupplierCreateInput = { requestId: this.requestId, ...values };
    const operation = ++this.operation;
    this.saving.set(true);
    try {
      if (!this.canAccess() || revision !== this.auth.sessionRevision()) return;
      try { await this.api.createSupplier(payload); }
      catch (error) {
        if (operation === this.operation && this.canAccess() && revision === this.auth.sessionRevision()) {
          const message = error instanceof StoreApiError ? error.message : 'Unable to save supplier. Your input is preserved; review it and retry.';
          this.saveError.set(message);
          this.toast.error(message);
        }
        return;
      }
      if (operation !== this.operation || !this.canAccess() || revision !== this.auth.sessionRevision()) return;
      this.saved.set(true);
      this.toast.success('Supplier saved.');
      try { await this.router.navigateByUrl('/admin/suppliers'); } catch { /* The supplier was saved; navigation can be retried separately. */ }
    } finally { if (operation === this.operation) this.saving.set(false); }
  }

  cancel(): void { if (!this.saving()) void this.router.navigateByUrl('/admin/suppliers'); }
  canLeave(): boolean | Observable<boolean> {
    if (this.auth.signOutRevision() > 0 && this.auth.status() === 'signed-out') return true;
    if (this.saved()) return true;
    if (this.saving()) return false;
    if (!this.dirty()) return true;
    return this.dialog.open<boolean, { kind: 'supplier' }>(AdminDiscardDialog, {
      data: { kind: 'supplier' }, width: '480px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'admin-discard-heading',
      panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    }).closed.pipe(map(result => result === true));
  }
  statusMessage(): string {
    if (!STOREFRONT_AUTH_ENABLED && this.auth.status() === 'unavailable') return 'Google sign-in is disabled pending Firebase Auth setup approval. No supplier data was submitted.';
    switch (this.access.status()) {
      case 'checking': return 'Checking administrator access…';
      case 'signed-out': return 'Sign in with an authorized Google account to create a private supplier record.';
      case 'forbidden': return 'This account is not authorized to create supplier records.';
      case 'unavailable': return 'Administrator access is unavailable. Retry when the service is reachable.';
      default: return '';
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void { if (this.dirty() && !this.saved()) { event.preventDefault(); event.returnValue = ''; } }

  private clearForAccessChange(): void {
    this.operation++; this.saving.set(false); this.input.set({ ...EMPTY }); this.attempted.set(false);
    this.saved.set(false); this.saveError.set(null); this.reviewedPayload = null; this.requestId = null;
  }
  private focusError(): void {
    afterNextRender(() => (this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?? this.host.nativeElement.querySelector<HTMLElement>('[role="alert"]'))?.focus(), { injector: this.injector });
  }
}

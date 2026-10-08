import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { CurrencyPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { pendingProduct } from '../../core/project-bom';
import { CustomerAccessService } from '../../core/customer-access.service';
import { Router } from '@angular/router';
import { Project } from '../../core/models';
import { AddToProjectDialog } from '../../shared/add-to-project-dialog';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BomService } from '../../core/bom.service';
import { CATEGORIES } from '../../core/demo-data';
import { PublicCatalogService } from '../../core/public-catalog.service';
import { NoticeService } from '../../core/notice.service';
import { Product } from '../../core/models';
import { Tooltip } from '../../shared/tooltip';
import { ProductVisualComponent } from '../../shared/product-visual';
import { ProductDialog } from '../../shared/product-dialog';
import { projectUiSession } from '../../shared/project-ui-session';

@Component({
  selector: 'app-catalog',
  imports: [CurrencyPipe, FormsModule, RouterLink, Tooltip, ProductVisualComponent],
  templateUrl: './catalog.html',
})
export class Catalog {
  readonly access = inject(CustomerAccessService);
  readonly source = inject(PublicCatalogService);
  readonly checking = signal(false);
  private readonly router = inject(Router);
  readonly bom = inject(BomService);
  private readonly notice = inject(NoticeService);
  private readonly dialog = inject(Dialog);
  private readonly destroyRef = inject(DestroyRef);
  private projectDialog?: DialogRef<Project>;
  private readonly addedToState = signal<Project | null>(null);
  readonly addedTo = computed(() => this.access.canAccessProjects() && this.addedToState()?.customerId === this.access.customerId() ? this.addedToState() : null);
  private readonly session = projectUiSession(() => { this.projectDialog?.close(); this.projectDialog = undefined; this.addedToState.set(null); });
  readonly categories = CATEGORIES;
  readonly categoryOptions = ['All equipment', ...CATEGORIES];
  readonly brands = computed(() => [...new Set(this.source.items().map(p => p.brand))].sort());
  readonly search = signal('');
  readonly category = signal('All equipment');
  readonly brand = signal('All brands');
  readonly filtered = computed(() => this.source.items().filter(product =>
    (this.category() === 'All equipment' || product.category === this.category()) &&
    (this.brand() === 'All brands' || product.brand === this.brand()) &&
    `${product.name} ${product.brand} ${product.sku}`.toLowerCase().includes(this.search().trim().toLowerCase()),
  ));
  reset(): void { this.search.set(''); this.category.set('All equipment'); this.brand.set('All brands'); }
  async add(product: Product): Promise<void> {
    if (this.checking()) return;
    this.checking.set(true);
    try {
      const current = await this.source.checkProduct(product.id);
      if (this.destroyRef.destroyed) return;
      this.notice.show(this.bom.add(current.id) ? `${current.name} added to your cart.` : this.bom.error() ?? 'Unable to add equipment. Enter a valid whole quantity.');
    } catch { if (!this.destroyRef.destroyed) this.notice.show('This product could not be confirmed. Refresh the catalog and try again. Nothing was added.'); }
    finally { this.checking.set(false); }
  }
  detail(product: Product): void {
    this.dialog.open(ProductDialog, { data: product, width: '520px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'product-dialog-title', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop' });
  }
  constructor() { void this.source.refresh(); this.destroyRef.onDestroy(() => this.projectDialog?.close()); }
  retry(): void { if (this.source.items().length && this.source.nextCursor()) void this.source.loadMore(); else void this.source.refresh(); }
  async addToProject(product: Product): Promise<void> {
    if (!this.access.canAccessProjects()) { void this.access.requestSignIn({ kind: 'product', returnUrl: this.router.url, pending: pendingProduct(product) }); return; }
    if (this.projectDialog || this.checking()) return;
    const owner = this.session.capture();
    this.checking.set(true);
    try { product = await this.source.checkProduct(product.id); }
    catch { this.notice.show('This product is unavailable. Refresh the catalog before adding it to a project.'); return; }
    finally { this.checking.set(false); }
    if (!this.session.current(owner)) return;
    const ref = this.dialog.open<Project>(AddToProjectDialog, { data: { pending: pendingProduct(product) }, width: '640px', maxWidth: 'calc(100vw - 32px)', ariaLabel: 'Add equipment to a project', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop' });
    this.projectDialog = ref;
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(project => {
      if (this.projectDialog === ref) this.projectDialog = undefined;
      if (project && this.session.current(owner) && project.customerId === this.access.customerId()) { this.addedToState.set(project); this.notice.show(`Item added to ${project.name}. Your active project is unchanged.`); }
    });
  }
}

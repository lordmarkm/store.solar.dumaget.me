import { computed, inject, Injectable } from '@angular/core';
import { BomLine, DraftItem } from './models';
import { includedVat, unitPrice } from './pricing';
import { LEGACY_DRAFT_KEY } from './guest-lists';
import { resolveProduct } from './project-bom';
import { ProjectService } from './project.service';

export const DRAFT_KEY = LEGACY_DRAFT_KEY;
@Injectable({ providedIn: 'root' })
export class BomService {
  readonly projects = inject(ProjectService);
  readonly currentList = this.projects.currentGuestList;
  readonly history = this.projects.guestHistory;
  readonly error = this.projects.error;
  readonly entries = computed(() => this.currentList()?.items ?? []);
  private readonly items = computed<readonly DraftItem[]>(() => this.entries().map(item => ({ productId: item.product.productId, quantity: item.quantity })));
  readonly lines = computed<readonly BomLine[]>(() => this.entries().flatMap(item => {
    const product = resolveProduct(item.product, this.projects.products());
    const price = product ? product.source === 'published' ? product.price : unitPrice(product, item.quantity) : null;
    return product && price !== null ? [{ product, quantity: item.quantity, unitPrice: price, total: price * item.quantity }] : [];
  }));
  readonly unavailable = computed(() => this.entries().filter(item => !resolveProduct(item.product, this.projects.products())).map(item => ({ productId: item.product.productId, quantity: item.quantity })));
  readonly count = computed(() => this.items().reduce((sum, item) => sum + item.quantity, 0));
  readonly lineCount = computed(() => this.items().length);
  readonly total = computed(() => this.lines().reduce((sum, line) => sum + line.total, 0));
  readonly vat = computed(() => this.lines().some(line => line.product.source === 'published') ? null : includedVat(this.total()));
  readonly savings = computed(() => this.lines().reduce((sum, line) => sum + (line.product.source === 'published' ? 0 : (line.product.price - line.unitPrice) * line.quantity), 0));

  constructor() { this.projects.ensureGuestLists(); }

  quantity(id: string): number { return this.items().find(item => item.productId === id)?.quantity ?? 0; }
  add(id: string, quantity = 1): boolean {
    const existing = this.entries().find(item => item.product.productId === id);
    if (existing && !resolveProduct(existing.product, this.projects.products())) return false;
    return Number.isSafeInteger(quantity) && quantity > 0 && this.setQuantity(id, this.quantity(id) + quantity);
  }
  setQuantity(id: string, quantity: number): boolean {
    return this.projects.setGuestQuantity(id, quantity).ok;
  }
  remove(id: string): void { this.projects.removeGuestItem(id); }
}

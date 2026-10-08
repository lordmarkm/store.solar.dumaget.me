import { Dialog } from '@angular/cdk/dialog';
import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CATEGORIES, PRODUCTS, SUPPLIERS } from '../../core/demo-data';
import { Product } from '../../core/models';
import { ProductDialog } from '../../shared/product-dialog';
import { Tooltip } from '../../shared/tooltip';
import { ProductVisualComponent } from '../../shared/product-visual';

@Component({
  selector: 'app-inventory',
  imports: [CurrencyPipe, FormsModule, RouterLink, Tooltip, ProductVisualComponent],
  templateUrl: './inventory.html',
})
export class Inventory {
  private readonly dialog = inject(Dialog);
  readonly suppliers = SUPPLIERS;
  readonly categories = CATEGORIES;
  readonly products = PRODUCTS;
  readonly search = signal('');
  readonly supplier = signal('All suppliers');
  readonly category = signal('All categories');
  readonly allocatedValue = PRODUCTS.reduce((sum, product) => sum + product.price * product.stock, 0);
  readonly filtered = computed(() => PRODUCTS.filter(product =>
    (this.supplier() === 'All suppliers' || product.supplierId === this.supplier()) &&
    (this.category() === 'All categories' || product.category === this.category()) &&
    `${product.name} ${product.sku} ${product.brand}`.toLowerCase().includes(this.search().trim().toLowerCase()),
  ));
  supplierName(id: string): string { return SUPPLIERS.find(s => s.id === id)?.name ?? 'Unassigned'; }
  reset(): void { this.search.set(''); this.supplier.set('All suppliers'); this.category.set('All categories'); }
  detail(product: Product): void { this.dialog.open(ProductDialog, { data: product, width: '520px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'product-dialog-title', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop' }); }
}

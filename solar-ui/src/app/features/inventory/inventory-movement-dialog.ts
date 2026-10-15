import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import type { Signal } from '@angular/core';
import type { InventoryLocation, InventoryMovement } from '../../core/inventory.models';
import type { AdminProduct } from '../../core/admin-catalog.models';

export interface InventoryMovementDialogData {
  product: AdminProduct;
  location: InventoryLocation;
  locations: readonly InventoryLocation[];
  movements: Signal<InventoryMovement[]>;
  cursor: Signal<string | null>;
  loading: Signal<boolean>;
  error: Signal<string>;
  page: Signal<number>;
  previous(): void;
  next(): void;
  retry(): void;
  exporting: Signal<boolean>;
  exportError: Signal<string>;
  exportAll(): void;
  cancelExport(): void;
}

@Component({
  selector: 'app-inventory-movement-dialog',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './inventory-movement-dialog.html',
})
export class InventoryMovementDialog {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<InventoryMovementDialogData>(DIALOG_DATA);
  otherLocationName(id: string): string { return this.data.locations.find(location => location.id === id)?.name ?? 'Location unavailable'; }
}

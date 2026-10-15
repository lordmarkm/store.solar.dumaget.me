import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { describe, expect, it, vi } from 'vitest';
import { InventoryMovementDialog, type InventoryMovementDialogData } from './inventory-movement-dialog';
import type { InventoryMovement } from '../../core/inventory.models';

describe('Inventory movement dialog dismissal layout', () => {
  it('keeps the only Close last in the footer while preserving pagination and dismissal', () => {
    const close = vi.fn(), previous = vi.fn(), next = vi.fn();
    const data = {
      product: { sku: 'TEST-SKU', name: 'Test product' },
      location: { code: 'MAIN', name: 'Main location' },
      movements: signal([]), cursor: signal('next-page'), loading: signal(false),
      error: signal(''), page: signal(2), previous, next, retry: vi.fn(),
      exporting: signal(false), exportError: signal(''),
      exportAll: vi.fn(), cancelExport: vi.fn(),
    } as unknown as InventoryMovementDialogData;
    TestBed.configureTestingModule({
      imports: [InventoryMovementDialog],
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(InventoryMovementDialog);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const closes = buttons.filter(button => button.textContent?.trim() === 'Close');
    expect(closes).toHaveLength(1);
    const footer = root.querySelector('footer')!;
    expect(closes[0].parentElement).toBe(footer);
    expect(footer.lastElementChild).toBe(closes[0]);
    expect(root.querySelector('header button')).toBeNull();
    buttons.find(button => button.textContent?.trim() === 'Previous')!.click();
    buttons.find(button => button.textContent?.trim() === 'Next')!.click();
    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    closes[0].click();
    expect(close).toHaveBeenCalledOnce();
    fixture.destroy();
  });
});

describe('Inventory movement actor display', () => {
  it('shows an escaped name and never displays the actor UID, including malformed mocked values', () => {
    const actorUid = 'private-auth-uid';
    const movement: InventoryMovement = {
      id: 'movement-1', schemaVersion: 1, productId: 'product-1', locationId: 'location-1',
      unitCode: 'panel', kind: 'opening', quantity: 0, delta: 0, onHandBefore: null, onHandAfter: 0,
      version: 1, reason: 'Opening', observedAt: '2026-10-09T04:00:00.000Z', createdAt: '2026-10-09T04:00:00.000Z',
      actorUid, actorName: 'Alex <img src=x onerror=alert(1)>',
    };
    const movements = signal([movement]);
    const data = {
      product: { sku: 'TEST-SKU', name: 'Test product' }, location: { code: 'MAIN', name: 'Main location' },
      movements, cursor: signal(null), loading: signal(false), error: signal(''), page: signal(1),
      previous: vi.fn(), next: vi.fn(), retry: vi.fn(), exporting: signal(false), exportError: signal(''),
      exportAll: vi.fn(), cancelExport: vi.fn(),
    } as unknown as InventoryMovementDialogData;
    TestBed.configureTestingModule({ imports: [InventoryMovementDialog], providers: [
      { provide: DIALOG_DATA, useValue: data }, { provide: DialogRef, useValue: { close: vi.fn() } },
    ] });
    const fixture = TestBed.createComponent(InventoryMovementDialog);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const actorValue = () => Array.from(root.querySelectorAll('article .grid > div'))
      .find(cell => cell.firstElementChild?.textContent === 'Actor')?.querySelector('p:last-child')?.textContent;
    expect(actorValue()).toBe(movement.actorName);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).not.toContain(actorUid);

    for (const actorName of [undefined, '', actorUid]) {
      movements.set([{ ...movement, actorName } as InventoryMovement]);
      fixture.detectChanges();
      expect(actorValue()).toBe('Name unavailable');
      expect(root.textContent).not.toContain(actorUid);
    }
    fixture.destroy();
  });
});

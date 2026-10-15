import { describe, expect, it } from 'vitest';
import type { AdminProduct } from './admin-catalog.models';
import type { InventoryBalance, InventoryLocation, InventoryMovement, InventoryRow } from './inventory.models';
import { inventoryMovementsCsv, inventoryRowsCsv, safeCSV } from './inventory-csv';

const timestamp = '2026-10-08T12:30:00.000Z';
const product: AdminProduct = {
  id: 'product-1', sku: 'PANEL-1', name: 'Solar panel', brand: 'Example', category: 'Panels', unitCode: 'panel',
  description: '', amountMinor: null, supplierId: 'supplier-1', schemaVersion: 1, version: 4,
  state: 'published', currency: 'PHP', createdBy: 'admin-1', createdAt: timestamp, updatedAt: timestamp,
};
const location: InventoryLocation = {
  id: 'location-1', schemaVersion: 1, code: 'MAIN', name: 'Main depot', notes: '', status: 'active',
  version: 2, createdAt: timestamp, updatedAt: timestamp, createdBy: 'admin-1',
};
function balance(onHand: number): InventoryBalance {
  return {
    schemaVersion: 1, productId: product.id, locationId: location.id, unitCode: 'panel', onHand,
    version: 3, updatedAt: timestamp, observedAt: '2026-10-08T12:00:00.000Z', updatedBy: 'staff-1',
  };
}

describe('inventory CSV helpers', () => {
  it('writes a BOM, CRLF records, and RFC-style escaped quoted and multiline text', () => {
    expect(safeCSV([['name', 'reason'], ['Panel, "A"', 'first line\nsecond line']]))
      .toBe('\uFEFFname,reason\r\n"Panel, ""A""","first line\nsecond line"');
  });

  it('protects dangerous text after whitespace and leading controls without changing numeric negatives', () => {
    expect(safeCSV([['sku', 'reason', 'actor', 'delta'], [' \t=1+1', '+cmd', '\u0000@name', -2]]))
      .toBe("\uFEFFsku,reason,actor,delta\r\n' \t=1+1,'+cmd,'\u0000@name,-2");
  });

  it('keeps an unknown balance distinct from a known zero and exports balance metadata', () => {
    const rows: InventoryRow[] = [{ product, balance: null }, { product, balance: balance(0) }];
    const csv = inventoryRowsCsv(rows, location);
    expect(csv.startsWith('\uFEFFsku,productName,locationCode,locationName,')).toBe(true);
    expect(csv).toContain('PANEL-1,Solar panel,MAIN,Main depot,unknown,panel,,,,,');
    expect(csv).not.toContain('product-1');
    expect(csv).not.toContain('location-1');
    expect(csv).toContain('updatedByName,reorderPoint,settingsVersion');
    expect(csv).toContain('known,panel,0,3,2026-10-08T12:00:00.000Z,2026-10-08T12:30:00.000Z,Name unavailable');
    expect(csv).not.toContain('staff-1');
  });

  it('exports the actor name rather than the private UID, preserving legacy omission fallback', () => {
    const move: InventoryMovement = {
      id: 'movement-1', schemaVersion: 1, productId: product.id, locationId: location.id,
      unitCode: 'panel', kind: 'issue', quantity: 2, delta: -2, onHandBefore: null,
      onHandAfter: 0, version: 5, reason: 'Customer return, damaged', observedAt: '2026-10-08T11:00:00.000Z',
      createdAt: timestamp, actorUid: 'private-auth-uid', actorName: 'Alex "AJ", Rivera',
    };
    const csv = inventoryMovementsCsv([move], { id: product.id, sku: product.sku, name: product.name }, location);
    expect(csv).toContain('schemaVersion,productSku,productName,locationCode,locationName,unitCode,kind,quantity,delta,onHandBefore,onHandAfter,version,reason,observedAt,createdAt,actorName,otherLocationCode,otherLocationName');
    expect(csv).toContain('1,PANEL-1,Solar panel,MAIN,Main depot,panel,issue,2,-2,,0,5,"Customer return, damaged",2026-10-08T11:00:00.000Z,2026-10-08T12:30:00.000Z,"Alex ""AJ"", Rivera,,');
    expect(csv).not.toContain('movement-1');
    expect(csv).not.toContain('product-1');
    expect(csv).not.toContain('location-1');
    expect(csv).not.toContain('private-auth-uid');
  });

  it('protects spreadsheet formulas in product, reason and actor text', () => {
    const move: InventoryMovement = {
      id: 'movement-1', schemaVersion: 1, productId: product.id, locationId: location.id,
      unitCode: 'panel', kind: 'receipt', quantity: 1, delta: 1, onHandBefore: 0,
      onHandAfter: 1, version: 1, reason: '  =HYPERLINK("x")', observedAt: timestamp,
      createdAt: timestamp, actorUid: 'private-auth-uid', actorName: '@staff',
    };
    const csv = inventoryMovementsCsv([move], { id: product.id, sku: '+SKU', name: '=Product' }, location);
    expect(csv).toContain("'  =HYPERLINK(");
    expect(csv).toContain("1,'+SKU,'=Product");
    expect(csv.endsWith(',' + String.fromCharCode(39) + '@staff,,')).toBe(true);
    expect(csv).not.toContain('private-auth-uid');
  });

  it('exports authoritative statuses, threshold zero, settings version and linked transfer identity', () => {
    const csv = inventoryRowsCsv([{ product, balance: balance(0), stockStatus: 'zero',
      settings: { schemaVersion: 1, productId: product.id, locationId: location.id, reorderPoint: 0,
        version: 2, updatedAt: timestamp, updatedBy: 'admin-1' } }], location);
    expect(csv).toContain('reorderPoint,settingsVersion');
    expect(csv).toContain('Main depot,zero,panel,0,3,');
    expect(csv.endsWith('Name unavailable,0,2')).toBe(true);
    expect(csv).not.toContain('admin-1');
    const transfer: InventoryMovement = { id: 'transfer-1', schemaVersion: 1, productId: product.id,
      locationId: location.id, unitCode: 'panel', kind: 'transfer-out', quantity: 2, delta: -2,
      onHandBefore: 3, onHandAfter: 1, version: 4, reason: 'Move', observedAt: timestamp,
      createdAt: timestamp, actorUid: 'private-auth-uid', transferId: 'transfer-1', otherLocationId: 'location-2' };
    const history = inventoryMovementsCsv([transfer], product, location);
    expect(history).toContain('otherLocationCode,otherLocationName');
    expect(history.endsWith('Name unavailable,Location unavailable,Location unavailable')).toBe(true);
    expect(history).not.toContain('transfer-1');
    expect(history).not.toContain('location-2');
    expect(history).not.toContain('private-auth-uid');
  });
});

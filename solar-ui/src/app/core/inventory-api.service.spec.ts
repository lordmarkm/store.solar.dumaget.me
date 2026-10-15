import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreApiError } from './store-api.service';
import { StoreApiService } from './store-api.service';
import { InventoryApiService } from './inventory-api.service';
import { MAX_STOCK } from './inventory.models';
import type { InventoryBalance, InventoryCountInput, InventoryLocation, InventoryMovement, InventorySettings,
  InventoryStockResult, InventoryTransferInput } from './inventory.models';
import type { AdminProduct } from './admin-catalog.models';

const LOCATION = '123e4567-e89b-42d3-a456-426614174000';
const PRODUCT = '223e4567-e89b-42d3-a456-426614174000';
const SUPPLIER = '323e4567-e89b-42d3-a456-426614174000';
const REQUEST = '423e4567-e89b-42d3-a456-426614174000';
const OTHER_LOCATION = '523e4567-e89b-42d3-a456-426614174000';
const TIME = '2026-10-09T04:00:00.000Z';

function product(values: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: PRODUCT, sku: 'PANEL-1', name: 'Solar panel', brand: 'Example', category: 'Panels', unitCode: 'panel',
    description: '', amountMinor: null, supplierId: SUPPLIER, schemaVersion: 1, version: 4, state: 'draft',
    currency: 'PHP', createdBy: 'admin-1', createdAt: TIME, updatedAt: TIME, ...values,
  };
}
function location(values: Partial<InventoryLocation> = {}): InventoryLocation {
  return { id: LOCATION, schemaVersion: 1, code: 'MAIN', name: 'Main depot', notes: '', status: 'active', version: 1,
    createdAt: TIME, updatedAt: TIME, createdBy: 'admin-1', ...values };
}
function balance(values: Partial<InventoryBalance> = {}): InventoryBalance {
  return { schemaVersion: 1, productId: PRODUCT, locationId: LOCATION, unitCode: 'panel', onHand: 0, version: 1,
    updatedAt: TIME, observedAt: TIME, updatedBy: 'admin-1', ...values };
}
function movement(values: Partial<InventoryMovement> = {}): InventoryMovement {
  return { id: REQUEST, schemaVersion: 1, productId: PRODUCT, locationId: LOCATION, unitCode: 'panel', kind: 'opening',
    quantity: 0, delta: 0, onHandBefore: null, onHandAfter: 0, version: 1, reason: 'Opening count', observedAt: TIME,
    createdAt: TIME, actorUid: 'admin-1', ...values };
}
function settings(values: Partial<InventorySettings> = {}): InventorySettings {
  return { schemaVersion: 1, productId: PRODUCT, locationId: LOCATION, reorderPoint: 5, version: 1,
    updatedAt: TIME, updatedBy: 'admin-1', ...values };
}

describe('InventoryApiService', () => {
  let api: InventoryApiService;
  let transport: { adminRequest: ReturnType<typeof vi.fn>; response: unknown };
  beforeEach(() => {
    transport = {
      response: null,
      adminRequest: vi.fn(async (_path: string, _method: string, _body: unknown, parse: (value: unknown) => unknown) => parse(transport.response)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: StoreApiService, useValue: transport }] });
    api = TestBed.inject(InventoryApiService);
  });

  it('loads paged locations and rejects malformed records and unbounded cursors', async () => {
    transport.response = { items: [location()], nextCursor: null };
    await expect(api.listLocations()).resolves.toEqual({ items: [location()], nextCursor: null });
    expect(transport.adminRequest).toHaveBeenCalledWith('/api/v1/admin/inventory/locations', 'GET', undefined, expect.any(Function), null);
    await expect(api.listLocations('not-a-uuid')).rejects.toMatchObject({ code: 'invalid-input' });
    transport.response = { items: [{ ...location(), surprise: true }], nextCursor: null };
    await expect(api.listLocations()).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('sends idempotent create/update requests and enforces immutable canonical location records', async () => {
    transport.response = { location: location() };
    await api.createLocation({ requestId: REQUEST, code: 'MAIN', name: 'Main depot', notes: '' });
    expect(transport.adminRequest).toHaveBeenCalledWith('/api/v1/admin/inventory/locations', 'POST',
      { requestId: REQUEST, code: 'MAIN', name: 'Main depot', notes: '' }, expect.any(Function));
    await api.updateLocation(LOCATION, { requestId: REQUEST, expectedVersion: 1, name: 'North depot', notes: '', status: 'inactive' });
    expect(transport.adminRequest).toHaveBeenLastCalledWith(`/api/v1/admin/inventory/locations/${LOCATION}`, 'PUT',
      { requestId: REQUEST, expectedVersion: 1, name: 'North depot', notes: '', status: 'inactive' }, expect.any(Function));
    await expect(api.createLocation({ requestId: REQUEST, code: 'bad code', name: 'Depot', notes: '' })).rejects.toMatchObject({ code: 'invalid-input' });
    transport.response = { location: location({ code: 'lowercase' }) };
    await expect(api.createLocation({ requestId: REQUEST, code: 'MAIN', name: 'Main depot', notes: '' })).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('uses API-side product filters and keeps an unknown balance explicitly null', async () => {
    transport.response = { items: [{ product: product(), balance: null }], nextCursor: 'opaque_1' };
    await expect(api.listInventory(LOCATION, null, { skuPrefix: 'PANEL', category: 'Panels', supplierId: SUPPLIER }))
      .resolves.toEqual({ items: [{ product: product(), balance: null }], nextCursor: 'opaque_1' });
    expect(transport.adminRequest).toHaveBeenCalledWith(`/api/v1/admin/inventory/${LOCATION}`, 'GET', undefined, expect.any(Function), null,
      { skuPrefix: 'PANEL', category: 'Panels', supplierId: SUPPLIER });
    await expect(api.listInventory(LOCATION, 'opaque cursor')).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.listInventory(LOCATION, null, { unsupported: 'x' } as never)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.listInventory(LOCATION, null, { stockStatus: 'available' } as never)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.listInventory(LOCATION, null, { stockStatus: 'low' })).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { items: [{ product: product(), balance: balance({ onHand: 4 }), settings: settings(),
      stockStatus: 'low' }], nextCursor: null };
    await expect(api.listInventory(LOCATION, null, { stockStatus: 'low' }))
      .resolves.toMatchObject({ items: [{ stockStatus: 'low', settings: settings() }] });
    expect(transport.adminRequest).toHaveBeenLastCalledWith('/api/v1/admin/inventory/' + LOCATION, 'GET', undefined,
      expect.any(Function), null, { stockStatus: 'low' });
    transport.response = { items: [{ product: product(), balance: balance({ onHand: 0 }), settings: settings(),
      stockStatus: 'low' }], nextCursor: null };
    await expect(api.listInventory(LOCATION)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { items: [{ product: product(), balance: null, settings: null, stockStatus: 'in-stock' }], nextCursor: null };
    await expect(api.listInventory(LOCATION)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { items: [{ product: product(), balance: null, mystery: true }], nextCursor: null };
    await expect(api.listInventory(LOCATION)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { items: [{ product: product(), balance: { ...balance(), onHand: 1_000_000_001 } }], nextCursor: null };
    await expect(api.listInventory(LOCATION)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('reads one inventory row directly and validates its identity, status, and optional fields', async () => {
    const row = { product: product(), balance: balance({ onHand: 8 }), settings: settings(), stockStatus: 'in-stock' as const };
    transport.response = row;
    await expect(api.inventoryRow(PRODUCT, LOCATION)).resolves.toEqual(row);
    expect(transport.adminRequest).toHaveBeenCalledWith('/api/v1/admin/inventory/' + LOCATION + '/products/' + PRODUCT,
      'GET', undefined, expect.any(Function));
    transport.response = { product: product(), balance: null };
    await expect(api.inventoryRow(PRODUCT, LOCATION)).resolves.toEqual({ product: product(), balance: null });
    transport.response = { ...row, product: product({ id: SUPPLIER }) };
    await expect(api.inventoryRow(PRODUCT, LOCATION)).rejects.toMatchObject({ code: 'invalid-response' });
    await expect(api.inventoryRow('bad-id', LOCATION)).rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('records absolute counts, accepts zero-change counts, and rejects malformed or conflicting results', async () => {
    const observedAt = new Date().toISOString();
    const input: InventoryCountInput = { requestId: REQUEST, expectedVersion: 1, expectedProductVersion: 4,
      countedQuantity: 0, reason: 'Verified empty shelf', observedAt };
    const result: InventoryStockResult = {
      balance: balance({ version: 2, updatedAt: observedAt, observedAt }),
      movement: movement({ kind: 'count', quantity: 0, delta: 0, onHandBefore: 0, onHandAfter: 0, version: 2,
        reason: input.reason, observedAt, createdAt: observedAt }),
    };
    transport.response = result;
    await expect(api.recordCount(PRODUCT, LOCATION, input)).resolves.toEqual(result);
    expect(transport.adminRequest).toHaveBeenCalledWith('/api/v1/admin/inventory/' + LOCATION + '/products/' + PRODUCT + '/counts',
      'POST', input, expect.any(Function));
    transport.response = { ...result, movement: { ...result.movement, delta: 1 } };
    await expect(api.recordCount(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { balance: { ...result.balance, version: 3 },
      movement: { ...result.movement, version: 3 } };
    await expect(api.recordCount(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { balance: { ...result.balance, onHand: 1 },
      movement: { ...result.movement, quantity: 1, delta: 1, onHandAfter: 1 } };
    await expect(api.recordCount(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { ...result, movement: { ...result.movement, reason: 'Different reason' } };
    await expect(api.recordCount(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    const alternateObservedAt = new Date(Date.parse(observedAt) - 1_000).toISOString();
    transport.response = { balance: { ...result.balance, observedAt: alternateObservedAt },
      movement: { ...result.movement, observedAt: alternateObservedAt } };
    await expect(api.recordCount(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = result;
    await expect(api.recordCount(PRODUCT, LOCATION, { ...input, countedQuantity: MAX_STOCK + 1 }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.recordCount(PRODUCT, LOCATION, { ...input, unexpected: true } as never))
      .rejects.toMatchObject({ code: 'invalid-input' });
    transport.adminRequest.mockRejectedValueOnce(new StoreApiError('conflict'));
    await expect(api.recordCount(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'conflict' });
    await expect(api.adjustStock(PRODUCT, LOCATION, { ...input, kind: 'count', quantity: 0 } as never))
      .rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('validates linked transfer movements and conserved stock across locations', async () => {
    const observedAt = new Date().toISOString();
    const input: InventoryTransferInput = { requestId: REQUEST, expectedProductVersion: 4, destinationLocationId: OTHER_LOCATION,
      expectedSourceVersion: 1, expectedDestinationVersion: 1, quantity: 2, reason: 'Move panels', observedAt };
    const sourceMovement = movement({ kind: 'transfer-out', quantity: 2, delta: -2, onHandBefore: 7, onHandAfter: 5,
      version: 2, reason: input.reason, observedAt, createdAt: observedAt, transferId: REQUEST, otherLocationId: OTHER_LOCATION });
    const destinationMovement = movement({ locationId: OTHER_LOCATION, kind: 'transfer-in', quantity: 2, delta: 2,
      onHandBefore: 3, onHandAfter: 5, version: 2, reason: input.reason, observedAt, createdAt: observedAt,
      transferId: REQUEST, otherLocationId: LOCATION });
    const result = { source: { balance: balance({ onHand: 5, version: 2, updatedAt: observedAt, observedAt }), movement: sourceMovement },
      destination: { balance: balance({ locationId: OTHER_LOCATION, onHand: 5, version: 2, updatedAt: observedAt, observedAt }),
        movement: destinationMovement } };
    transport.response = result;
    await expect(api.transferStock(PRODUCT, LOCATION, input)).resolves.toEqual(result);
    expect(transport.adminRequest).toHaveBeenCalledWith('/api/v1/admin/inventory/' + LOCATION + '/products/' + PRODUCT + '/transfers',
      'POST', input, expect.any(Function));
    await expect(api.transferStock(PRODUCT, LOCATION, { ...input, destinationLocationId: LOCATION }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.transferStock(PRODUCT, LOCATION, { ...input, quantity: 0 }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    transport.response = { ...result, destination: { ...result.destination,
      movement: { ...destinationMovement, otherLocationId: SUPPLIER } } };
    await expect(api.transferStock(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { ...result, destination: { ...result.destination,
      balance: { ...result.destination.balance, onHand: 6 },
      movement: { ...destinationMovement, onHandAfter: 6 } } };
    await expect(api.transferStock(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { ...result, source: { balance: { ...result.source.balance, version: 3 },
      movement: { ...sourceMovement, version: 3 } } };
    await expect(api.transferStock(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { ...result, destination: { balance: { ...result.destination.balance, version: 3 },
      movement: { ...destinationMovement, version: 3 } } };
    await expect(api.transferStock(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { source: { ...result.source, movement: { ...sourceMovement, reason: 'Other reason' } },
      destination: { ...result.destination, movement: { ...destinationMovement, reason: 'Other reason' } } };
    await expect(api.transferStock(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    const alternateObservedAt = new Date(Date.parse(observedAt) - 1_000).toISOString();
    transport.response = { source: { balance: { ...result.source.balance, observedAt: alternateObservedAt },
      movement: { ...sourceMovement, observedAt: alternateObservedAt } },
      destination: { balance: { ...result.destination.balance, observedAt: alternateObservedAt },
        movement: { ...destinationMovement, observedAt: alternateObservedAt } } };
    await expect(api.transferStock(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = result;
    transport.adminRequest.mockRejectedValueOnce(new StoreApiError('conflict'));
    await expect(api.transferStock(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'conflict' });
    await expect(api.adjustStock(PRODUCT, LOCATION, { requestId: REQUEST, expectedVersion: 1, expectedProductVersion: 4,
      kind: 'transfer-out', quantity: 2, reason: input.reason, observedAt } as never))
      .rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('saves versioned per-product inventory settings and validates the wrapped response', async () => {
    const row = { product: product(), balance: null };
    const input = { requestId: REQUEST, expectedVersion: null, expectedProductVersion: row.product.version, reorderPoint: 5 };
    transport.response = { settings: settings() };
    await expect(api.saveSettings(PRODUCT, LOCATION, input)).resolves.toEqual(settings());
    expect(transport.adminRequest).toHaveBeenCalledWith('/api/v1/admin/inventory/' + LOCATION + '/products/' + PRODUCT + '/settings',
      'PUT', input, expect.any(Function));
    const existingSettingsInput = { ...input, expectedVersion: 1 };
    transport.response = { settings: settings({ version: 2 }) };
    await expect(api.saveSettings(PRODUCT, LOCATION, existingSettingsInput)).resolves.toEqual(settings({ version: 2 }));
    transport.response = { settings: settings() };
    await expect(api.saveSettings(PRODUCT, LOCATION, { ...input, reorderPoint: MAX_STOCK + 1 }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.saveSettings(PRODUCT, LOCATION, { ...input, expectedProductVersion: 0 }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    const { expectedProductVersion: _expectedProductVersion, ...missingProductVersion } = input;
    await expect(api.saveSettings(PRODUCT, LOCATION, missingProductVersion as never))
      .rejects.toMatchObject({ code: 'invalid-input' });
    transport.response = { settings: settings({ reorderPoint: 4 }) };
    await expect(api.saveSettings(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { settings: settings({ version: 2 }) };
    await expect(api.saveSettings(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { settings: settings() };
    transport.response = { settings: settings({ locationId: OTHER_LOCATION }) };
    await expect(api.saveSettings(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.response = { settings: settings(), unexpected: true };
    await expect(api.saveSettings(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'invalid-response' });
    transport.adminRequest.mockRejectedValueOnce(new StoreApiError('conflict'));
    await expect(api.saveSettings(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects inventory responses larger than ten rows', async () => {
    transport.response = { items: Array.from({ length: 11 }, () => ({ product: product(), balance: null })), nextCursor: 'opaque_next' };
    await expect(api.listInventory(LOCATION)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('accepts zero opening and signed correction with the product-version fence', async () => {
    const zeroOpening = { requestId: REQUEST, expectedVersion: null, expectedProductVersion: 4, kind: 'opening' as const,
      quantity: 0, reason: 'Zero count', observedAt: new Date().toISOString() };
    const openingResult: InventoryStockResult = { balance: balance(), movement: movement({ reason: 'Zero count', observedAt: zeroOpening.observedAt, createdAt: zeroOpening.observedAt }) };
    transport.response = openingResult;
    await expect(api.adjustStock(PRODUCT, LOCATION, zeroOpening)).resolves.toEqual(openingResult);
    expect(transport.adminRequest).toHaveBeenCalledWith(`/api/v1/admin/inventory/${LOCATION}/products/${PRODUCT}/adjustments`, 'POST',
      zeroOpening, expect.any(Function));

    const correction = { requestId: REQUEST, expectedVersion: 2, expectedProductVersion: 4, kind: 'correction' as const,
      quantity: -2, reason: 'Count discrepancy', observedAt: new Date().toISOString() };
    const correctedBalance = balance({ onHand: 3, version: 3, updatedAt: correction.observedAt, observedAt: correction.observedAt });
    const correctedMovement = movement({ kind: 'correction', quantity: -2, delta: -2, onHandBefore: 5, onHandAfter: 3,
      version: 3, reason: correction.reason, observedAt: correction.observedAt, createdAt: correction.observedAt });
    transport.response = { balance: correctedBalance, movement: correctedMovement };
    await expect(api.adjustStock(PRODUCT, LOCATION, correction)).resolves.toEqual({ balance: correctedBalance, movement: correctedMovement });
    expect(transport.adminRequest.mock.calls[1][2]).toMatchObject({ expectedProductVersion: 4, quantity: -2 });
    await expect(api.adjustStock(PRODUCT, LOCATION, { ...correction, quantity: 0 })).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.adjustStock(PRODUCT, LOCATION, { ...correction, expectedProductVersion: 0 })).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.adjustStock(PRODUCT, LOCATION, { ...zeroOpening, expectedVersion: 1 })).rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('validates stock change results and requires reload after server conflicts', async () => {
    const input = { requestId: REQUEST, expectedVersion: 2, expectedProductVersion: 4, kind: 'receipt' as const,
      quantity: 5, reason: 'Received', observedAt: new Date().toISOString() };
    transport.response = { balance: balance({ onHand: 5, version: 3, updatedAt: input.observedAt, observedAt: input.observedAt }),
      movement: movement({ kind: 'receipt', quantity: 5, delta: 5, onHandBefore: 0, onHandAfter: 5, version: 3,
        reason: 'Received', observedAt: input.observedAt, createdAt: input.observedAt }) };
    await api.adjustStock(PRODUCT, LOCATION, input);
    transport.adminRequest.mockRejectedValueOnce(new StoreApiError('conflict'));
    await expect(api.adjustStock(PRODUCT, LOCATION, input)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('validates movement pages in authoritative version-descending order', async () => {
    const newer = movement({ kind: 'receipt', quantity: 2, delta: 2, onHandBefore: 1, onHandAfter: 3,
      version: 3, reason: 'Received', createdAt: TIME });
    const older = movement({ id: '523e4567-e89b-42d3-a456-426614174000', kind: 'opening', quantity: 1, delta: 1,
      onHandBefore: null, onHandAfter: 1, version: 1, reason: 'Opening', createdAt: TIME });
    transport.response = { items: [newer, older], nextCursor: null };
    await expect(api.listMovements(PRODUCT, LOCATION)).resolves.toMatchObject({ items: [newer, older] });
    transport.response = { items: [older, newer], nextCursor: null };
    await expect(api.listMovements(PRODUCT, LOCATION)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('accepts legacy movements and validates optional actor names without exposing the UID as a name', async () => {
    const legacy = movement();
    transport.response = { items: [legacy], nextCursor: null };
    await expect(api.listMovements(PRODUCT, LOCATION)).resolves.toMatchObject({ items: [{ actorUid: 'admin-1' }] });

    const named = movement({ actorUid: 'private-auth-uid', actorName: 'Alex Rivera' });
    transport.response = { items: [named], nextCursor: null };
    await expect(api.listMovements(PRODUCT, LOCATION)).resolves.toMatchObject({ items: [named] });

    for (const actorName of ['', '   ', ' leading', 'trailing ', 'x'.repeat(161), 'bad\u0007name', 'bad\u009fname', '\ud800', 'private-auth-uid']) {
      transport.response = { items: [movement({ actorUid: 'private-auth-uid', actorName })], nextCursor: null };
      await expect(api.listMovements(PRODUCT, LOCATION)).rejects.toMatchObject({ code: 'invalid-response' });
    }
  });

  it('accepts five movement records and rejects a sixth lookahead record', async () => {
    const records = Array.from({ length: 6 }, (_, index) => {
      const recordVersion = 6 - index;
      const opening = recordVersion === 1;
      return movement({
        id: `423e4567-e89b-42d3-a456-${(index + 1).toString(16).padStart(12, '0')}`,
        kind: opening ? 'opening' : 'receipt', quantity: opening ? 0 : 1, delta: opening ? 0 : 1,
        onHandBefore: opening ? null : 0, onHandAfter: opening ? 0 : 1, version: recordVersion,
      });
    });
    transport.response = { items: records.slice(0, 5), nextCursor: 'older_1' };
    await expect(api.listMovements(PRODUCT, LOCATION)).resolves.toMatchObject({ items: records.slice(0, 5), nextCursor: 'older_1' });
    transport.response = { items: records, nextCursor: null };
    await expect(api.listMovements(PRODUCT, LOCATION)).rejects.toMatchObject({ code: 'invalid-response' });
  });
});

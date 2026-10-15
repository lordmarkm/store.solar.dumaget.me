import { inject, Injectable } from '@angular/core';
import { validProduct } from './admin-catalog-api.service';
import type { ProductListFilters } from './admin-catalog.models';
import { StoreApiError, StoreApiService } from './store-api.service';
import {
  MAX_STOCK, type InventoryBalance, type InventoryLocation, type InventoryLocationCreateInput,
  type InventoryLocationUpdateInput, type InventoryMovement, type InventoryPage, type InventoryProductFilters,
  type InventoryRow, type InventoryStockInput, type InventoryStockResult, type InventoryCountInput,
  type InventoryTransferInput, type InventoryTransferResult, type InventorySettingsInput, type InventorySettings,
  type InventoryMovementKind, type InventoryStockStatus,
} from './inventory.models';

const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const OPAQUE_CURSOR = /^[A-Za-z0-9_-]{1,512}$/;
const LOCATION_CODE = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const UNITS = ['unit', 'panel', 'kit'] as const;
const MANUAL_KINDS = ['opening', 'receipt', 'issue', 'return', 'damage', 'correction'] as const;
const KINDS = [...MANUAL_KINDS, 'count', 'transfer-in', 'transfer-out'] as const;

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exact(value: RecordValue, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function invalidInput(): never { throw new StoreApiError('invalid-input'); }
function invalidResponse(): never { throw new StoreApiError('invalid-response'); }
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID_V4.test(value); }
function version(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function stock(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_STOCK; }
function canonicalText(value: unknown, max: number, required = true, newlines = false): value is string {
  return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0)
    && value.trim() === value && !(newlines ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/u : /[\u0000-\u001f\u007f\ud800-\udfff]/u).test(value);
}
function validActorName(value: unknown, actorUid: string): value is string {
  return canonicalText(value, 160) && !/[\u0080-\u009f]/u.test(value) && value !== actorUid;
}
function iso(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 24 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function validIdPair(id: unknown, locationId: unknown): id is string { return uuid(id) && uuid(locationId); }
function isUnit(value: unknown): value is InventoryBalance['unitCode'] { return typeof value === 'string' && (UNITS as readonly string[]).includes(value); }
function isKind(value: unknown): value is InventoryMovementKind { return typeof value === 'string' && (KINDS as readonly string[]).includes(value); }
function isManualKind(value: unknown): value is InventoryStockInput['kind'] { return typeof value === 'string' && (MANUAL_KINDS as readonly string[]).includes(value); }
function isStockStatus(value: unknown): value is InventoryStockStatus {
  return typeof value === 'string' && ['unknown', 'zero', 'low', 'in-stock'].includes(value);
}
function computedStockStatus(balance: InventoryBalance | null, settings: InventorySettings | null): InventoryStockStatus {
  if (!balance) return 'unknown';
  if (balance.onHand === 0) return 'zero';
  return settings?.reorderPoint !== null && settings?.reorderPoint !== undefined && balance.onHand <= settings.reorderPoint ? 'low' : 'in-stock';
}

function validLocation(value: unknown): value is InventoryLocation {
  return record(value) && exact(value, ['id', 'schemaVersion', 'code', 'name', 'notes', 'status', 'version', 'createdAt', 'updatedAt', 'createdBy'])
    && uuid(value['id']) && value['id'] === value['id'].toLowerCase() && value['schemaVersion'] === 1
    && typeof value['code'] === 'string' && LOCATION_CODE.test(value['code'])
    && canonicalText(value['name'], 160) && canonicalText(value['notes'], 1000, false, true)
    && (value['status'] === 'active' || value['status'] === 'inactive') && version(value['version'])
    && iso(value['createdAt']) && iso(value['updatedAt']) && value['updatedAt'] >= value['createdAt']
    && canonicalText(value['createdBy'], 128);
}

function validBalance(value: unknown, productId: string, locationId: string): value is InventoryBalance {
  return record(value) && exact(value, ['schemaVersion', 'productId', 'locationId', 'unitCode', 'onHand', 'version', 'updatedAt', 'observedAt', 'updatedBy'])
    && value['schemaVersion'] === 1 && value['productId'] === productId && value['locationId'] === locationId
    && uuid(value['productId']) && uuid(value['locationId']) && isUnit(value['unitCode']) && stock(value['onHand'])
    && version(value['version']) && iso(value['updatedAt']) && iso(value['observedAt'])
    && Date.parse(value['observedAt']) <= Date.parse(value['updatedAt']) + 300_000
    && canonicalText(value['updatedBy'], 128);
}

function movementDelta(kind: InventoryMovement['kind'], quantity: number): number {
  return kind === 'issue' || kind === 'damage' || kind === 'transfer-out' ? -quantity : quantity;
}

function validMovement(value: unknown, productId: string, locationId: string): value is InventoryMovement {
  const baseKeys = ['id', 'schemaVersion', 'productId', 'locationId', 'unitCode', 'kind', 'quantity', 'delta',
    'onHandBefore', 'onHandAfter', 'version', 'reason', 'observedAt', 'createdAt', 'actorUid'];
  if (!record(value) || !isKind(value['kind']) || !exact(value, [...baseKeys,
    ...(Object.hasOwn(value, 'actorName') ? ['actorName'] : []),
    ...(value['kind'] === 'transfer-in' || value['kind'] === 'transfer-out' ? ['transferId', 'otherLocationId'] : [])])
    || !uuid(value['id']) || value['id'] !== value['id'].toLowerCase() || value['schemaVersion'] !== 1
    || value['productId'] !== productId || value['locationId'] !== locationId || !validIdPair(value['productId'], value['locationId'])
    || !isUnit(value['unitCode']) || !Number.isSafeInteger(value['quantity'])
    || Math.abs(value['quantity'] as number) > MAX_STOCK || !version(value['version']) || !stock(value['onHandAfter'])
    || !iso(value['observedAt']) || !iso(value['createdAt']) || Date.parse(value['observedAt']) > Date.parse(value['createdAt']) + 300_000
    || !canonicalText(value['reason'], 500) || !canonicalText(value['actorUid'], 128)
    || (Object.hasOwn(value, 'actorName') && !validActorName(value['actorName'], value['actorUid'] as string))) return false;
  const kind = value['kind'], quantity = value['quantity'] as number;
  if (kind === 'count') {
    if (!stock(quantity) || (value['onHandBefore'] === null ? value['version'] !== 1
      : !stock(value['onHandBefore']) || (value['version'] as number) <= 1)) return false;
    return value['delta'] === quantity - (value['onHandBefore'] === null ? 0 : value['onHandBefore'] as number)
      && (value['onHandBefore'] === null ? 0 : value['onHandBefore'] as number) + (value['delta'] as number) === value['onHandAfter'];
  }
  if (kind === 'transfer-in' || kind === 'transfer-out') {
    if (quantity <= 0 || !stock(value['onHandBefore']) || (value['version'] as number) <= 1
      || !uuid(value['transferId']) || value['transferId'] !== value['id'] || !uuid(value['otherLocationId'])
      || value['otherLocationId'] === locationId) return false;
    return value['delta'] === movementDelta(kind, quantity)
      && (value['onHandBefore'] as number) + (value['delta'] as number) === value['onHandAfter'];
  }
  if (kind === 'opening') {
    if (quantity < 0 || value['onHandBefore'] !== null || value['version'] !== 1) return false;
  } else if (kind === 'correction') {
    if (quantity === 0 || !stock(value['onHandBefore']) || (value['version'] as number) <= 1) return false;
  } else if (quantity <= 0 || !stock(value['onHandBefore']) || (value['version'] as number) <= 1) return false;
  return value['delta'] === movementDelta(kind, quantity)
    && (value['onHandBefore'] === null ? 0 : value['onHandBefore'] as number) + (value['delta'] as number) === value['onHandAfter'];
}

function validLocationInput(value: unknown): value is InventoryLocationCreateInput {
  return record(value) && exact(value, ['requestId', 'code', 'name', 'notes']) && uuid(value['requestId'])
    && typeof value['code'] === 'string' && value['code'].trim().toUpperCase() === value['code']
    && LOCATION_CODE.test(value['code']) && canonicalText(value['name'], 160)
    && canonicalText(value['notes'], 1000, false, true);
}
function validLocationUpdate(value: unknown): value is InventoryLocationUpdateInput {
  return record(value) && exact(value, ['requestId', 'expectedVersion', 'name', 'notes', 'status']) && uuid(value['requestId'])
    && version(value['expectedVersion']) && canonicalText(value['name'], 160) && canonicalText(value['notes'], 1000, false, true)
    && (value['status'] === 'active' || value['status'] === 'inactive');
}
function validStockInput(value: unknown): value is InventoryStockInput {
  if (!record(value) || !exact(value, ['requestId', 'expectedVersion', 'expectedProductVersion', 'kind', 'quantity', 'reason', 'observedAt'])
    || !uuid(value['requestId']) || !version(value['expectedProductVersion']) || !isManualKind(value['kind'])
    || typeof value['quantity'] !== 'number' || !Number.isSafeInteger(value['quantity']) || Math.abs(value['quantity']) > MAX_STOCK
    || !canonicalText(value['reason'], 500) || !iso(value['observedAt'])
    || Date.parse(value['observedAt']) > Date.now() + 300_000) return false;
  return value['kind'] === 'opening'
    ? value['expectedVersion'] === null && value['quantity'] >= 0
    : version(value['expectedVersion']) && (value['kind'] === 'correction' ? value['quantity'] !== 0 : value['quantity'] > 0);
}

function validCountInput(value: unknown): value is InventoryCountInput {
  return record(value) && exact(value, ['requestId', 'expectedVersion', 'expectedProductVersion', 'countedQuantity', 'reason', 'observedAt'])
    && uuid(value['requestId']) && (value['expectedVersion'] === null || version(value['expectedVersion']))
    && version(value['expectedProductVersion']) && stock(value['countedQuantity'])
    && canonicalText(value['reason'], 500) && iso(value['observedAt']) && Date.parse(value['observedAt']) <= Date.now() + 300_000;
}

function validTransferInput(value: unknown, sourceLocationId: string): value is InventoryTransferInput {
  return record(value) && exact(value, ['requestId', 'expectedProductVersion', 'destinationLocationId', 'expectedSourceVersion',
    'expectedDestinationVersion', 'quantity', 'reason', 'observedAt'])
    && uuid(value['requestId']) && uuid(value['destinationLocationId'])
    && value['destinationLocationId'].toLowerCase() !== sourceLocationId.toLowerCase()
    && version(value['expectedProductVersion']) && version(value['expectedSourceVersion']) && version(value['expectedDestinationVersion'])
    && stock(value['quantity']) && value['quantity'] > 0 && canonicalText(value['reason'], 500)
    && iso(value['observedAt']) && Date.parse(value['observedAt']) <= Date.now() + 300_000;
}

function validSettingsInput(value: unknown): value is InventorySettingsInput {
  return record(value) && exact(value, ['requestId', 'expectedVersion', 'expectedProductVersion', 'reorderPoint']) && uuid(value['requestId'])
    && (value['expectedVersion'] === null || version(value['expectedVersion']))
    && version(value['expectedProductVersion'])
    && (value['reorderPoint'] === null || stock(value['reorderPoint']));
}

function validSettings(value: unknown, productId: string, locationId: string): value is InventorySettings {
  return record(value) && exact(value, ['schemaVersion', 'productId', 'locationId', 'reorderPoint', 'version', 'updatedAt', 'updatedBy'])
    && value['schemaVersion'] === 1 && value['productId'] === productId && value['locationId'] === locationId
    && uuid(productId) && uuid(locationId) && (value['reorderPoint'] === null || stock(value['reorderPoint']))
    && version(value['version']) && iso(value['updatedAt']) && canonicalText(value['updatedBy'], 128);
}

@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly api = inject(StoreApiService);
  private readonly locationCodes = new Map<string, string>();

  async listLocations(cursor: string | null = null): Promise<InventoryPage<InventoryLocation>> {
    if (cursor !== null && !uuid(cursor)) return Promise.reject(new StoreApiError('invalid-input'));
    const page = await this.api.adminRequest('/api/v1/admin/inventory/locations', 'GET', undefined,
      value => this.parsePage(value, validLocation, 'uuid'), cursor);
    for (const location of page.items) this.locationCodes.set(location.id, location.code);
    return page;
  }

  createLocation(input: InventoryLocationCreateInput): Promise<InventoryLocation> {
    if (!validLocationInput(input)) return Promise.reject(new StoreApiError('invalid-input'));
    const body = { ...input, requestId: input.requestId.toLowerCase() };
    return this.api.adminRequest('/api/v1/admin/inventory/locations', 'POST', body, value => {
      if (!record(value) || !exact(value, ['location']) || !validLocation(value['location']) || value['location'].code !== body.code) return invalidResponse();
      this.locationCodes.set(value['location'].id, value['location'].code);
      return value['location'];
    });
  }

  updateLocation(id: string, input: InventoryLocationUpdateInput): Promise<InventoryLocation> {
    if (!uuid(id) || !validLocationUpdate(input)) return Promise.reject(new StoreApiError('invalid-input'));
    const normalizedId = id.toLowerCase(), existingCode = this.locationCodes.get(normalizedId);
    return this.api.adminRequest(`/api/v1/admin/inventory/locations/${id.toLowerCase()}`, 'PUT',
      { ...input, requestId: input.requestId.toLowerCase() }, value => {
        if (!record(value) || !exact(value, ['location']) || !validLocation(value['location']) || value['location'].id !== id.toLowerCase()
          || existingCode !== undefined && value['location'].code !== existingCode) return invalidResponse();
        this.locationCodes.set(value['location'].id, value['location'].code);
        return value['location'];
      });
  }

  listInventory(locationId: string, cursor: string | null = null, filters: InventoryProductFilters = {}): Promise<InventoryPage<InventoryRow>> {
    if (!uuid(locationId) || cursor !== null && !OPAQUE_CURSOR.test(cursor) || !validProductFilters(filters))
      return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest(`/api/v1/admin/inventory/${locationId.toLowerCase()}`, 'GET', undefined,
      value => {
        const page = this.parsePage(value, item => this.validInventoryRow(item, locationId.toLowerCase()), 'opaque', 10);
        if (filters.stockStatus && page.items.some(row => row.stockStatus !== filters.stockStatus)) return invalidResponse();
        return page;
      }, cursor, { ...filters });
  }

  inventoryRow(productId: string, locationId: string): Promise<InventoryRow> {
    if (!uuid(productId) || !uuid(locationId)) return Promise.reject(new StoreApiError('invalid-input'));
    const product = productId.toLowerCase(), location = locationId.toLowerCase();
    return this.api.adminRequest(`/api/v1/admin/inventory/${location}/products/${product}`, 'GET', undefined, value => {
      if (!this.validInventoryRow(value, location) || value.product.id !== product) return invalidResponse();
      return value;
    });
  }

  recordCount(productId: string, locationId: string, input: InventoryCountInput): Promise<InventoryStockResult> {
    if (!uuid(productId) || !uuid(locationId) || !validCountInput(input)) return Promise.reject(new StoreApiError('invalid-input'));
    const product = productId.toLowerCase(), location = locationId.toLowerCase();
    const body = { ...input, requestId: input.requestId.toLowerCase() };
    return this.api.adminRequest(`/api/v1/admin/inventory/${location}/products/${product}/counts`, 'POST', body,
      value => {
        const result = this.validStockResult(value, product, location, input.requestId, 'count',
          input.expectedVersion === null ? 1 : input.expectedVersion + 1, input.reason, input.observedAt);
        if (result.movement.quantity !== input.countedQuantity || result.balance.onHand !== input.countedQuantity) return invalidResponse();
        return result;
      });
  }

  transferStock(productId: string, sourceLocationId: string, input: InventoryTransferInput): Promise<InventoryTransferResult> {
    if (!uuid(productId) || !uuid(sourceLocationId) || !validTransferInput(input, sourceLocationId.toLowerCase()))
      return Promise.reject(new StoreApiError('invalid-input'));
    const product = productId.toLowerCase(), source = sourceLocationId.toLowerCase();
    const body = { ...input, requestId: input.requestId.toLowerCase(), destinationLocationId: input.destinationLocationId.toLowerCase() };
    return this.api.adminRequest(`/api/v1/admin/inventory/${source}/products/${product}/transfers`, 'POST', body, value => {
      if (!record(value) || !exact(value, ['source', 'destination'])) return invalidResponse();
      const sourceResult = this.validStockResult(value['source'], product, source, input.requestId, 'transfer-out',
        input.expectedSourceVersion + 1, input.reason, input.observedAt);
      const destination = body.destinationLocationId;
      const destinationResult = this.validStockResult(value['destination'], product, destination, input.requestId, 'transfer-in',
        input.expectedDestinationVersion + 1, input.reason, input.observedAt);
      const sourceMove = sourceResult.movement, destinationMove = destinationResult.movement;
      if (sourceResult.balance.unitCode !== destinationResult.balance.unitCode
        || sourceMove.quantity !== input.quantity || destinationMove.quantity !== input.quantity
        || sourceMove.transferId !== destinationMove.transferId
        || sourceMove.otherLocationId !== destination || destinationMove.otherLocationId !== source
        || sourceMove.reason !== destinationMove.reason || sourceMove.observedAt !== destinationMove.observedAt
        || sourceMove.createdAt !== destinationMove.createdAt
        || (sourceMove.onHandBefore as number) + (destinationMove.onHandBefore as number)
          !== sourceResult.balance.onHand + destinationResult.balance.onHand) return invalidResponse();
      return { source: sourceResult, destination: destinationResult };
    });
  }

  saveSettings(productId: string, locationId: string, input: InventorySettingsInput): Promise<InventorySettings> {
    if (!uuid(productId) || !uuid(locationId) || !validSettingsInput(input)) return Promise.reject(new StoreApiError('invalid-input'));
    const product = productId.toLowerCase(), location = locationId.toLowerCase();
    const body = { ...input, requestId: input.requestId.toLowerCase() };
    return this.api.adminRequest(`/api/v1/admin/inventory/${location}/products/${product}/settings`, 'PUT', body, value => {
      const expectedVersion = input.expectedVersion === null ? 1 : input.expectedVersion + 1;
      if (!record(value) || !exact(value, ['settings']) || !validSettings(value['settings'], product, location)
        || value['settings'].reorderPoint !== input.reorderPoint || value['settings'].version !== expectedVersion)
        return invalidResponse();
      return value['settings'];
    });
  }

  adjustStock(productId: string, locationId: string, input: InventoryStockInput): Promise<InventoryStockResult> {
    if (!uuid(productId) || !uuid(locationId) || !validStockInput(input)) return Promise.reject(new StoreApiError('invalid-input'));
    const body = { ...input, requestId: input.requestId.toLowerCase() };
    return this.api.adminRequest(`/api/v1/admin/inventory/${locationId.toLowerCase()}/products/${productId.toLowerCase()}/adjustments`, 'POST', body, value => {
      if (!record(value) || !exact(value, ['balance', 'movement'])
        || !validBalance(value['balance'], productId.toLowerCase(), locationId.toLowerCase())
        || !validMovement(value['movement'], productId.toLowerCase(), locationId.toLowerCase())
        || value['movement'].id !== input.requestId.toLowerCase()
        || value['balance'].version !== value['movement'].version
        || value['balance'].onHand !== value['movement'].onHandAfter
        || value['balance'].unitCode !== value['movement'].unitCode) return invalidResponse();
      return { balance: value['balance'], movement: value['movement'] };
    });
  }

  listMovements(productId: string, locationId: string, cursor: string | null = null): Promise<InventoryPage<InventoryMovement>> {
    if (!uuid(productId) || !uuid(locationId) || cursor !== null && !OPAQUE_CURSOR.test(cursor))
      return Promise.reject(new StoreApiError('invalid-input'));
    return this.api.adminRequest(`/api/v1/admin/inventory/${locationId.toLowerCase()}/products/${productId.toLowerCase()}/movements`, 'GET', undefined,
      value => this.parseMovementsPage(value, productId.toLowerCase(), locationId.toLowerCase()), cursor);
  }

  private validInventoryRow(value: unknown, locationId: string): value is InventoryRow {
    if (!record(value) || Object.keys(value).some(key => !['product', 'balance', 'settings', 'stockStatus'].includes(key))
      || !Object.hasOwn(value, 'product') || !Object.hasOwn(value, 'balance') || !validProduct(value['product'])) return false;
    const product = value['product'];
    if (value['balance'] !== null && (!validBalance(value['balance'], product.id, locationId)
      || product.unitCode !== value['balance'].unitCode)) return false;
    if (Object.hasOwn(value, 'settings') && value['settings'] !== null
      && !validSettings(value['settings'], product.id, locationId)) return false;
    if (Object.hasOwn(value, 'stockStatus')) {
      const settings = Object.hasOwn(value, 'settings') && value['settings'] !== null ? value['settings'] as InventorySettings : null;
      if (!isStockStatus(value['stockStatus']) || value['stockStatus'] !== computedStockStatus(value['balance'] as InventoryBalance | null, settings))
        return false;
    }
    return true;
  }

  private validStockResult(value: unknown, productId: string, locationId: string, requestId: string,
    kind: InventoryMovement['kind'], expectedVersion: number, reason: string, observedAt: string): InventoryStockResult {
    if (!record(value) || !exact(value, ['balance', 'movement'])
      || !validBalance(value['balance'], productId, locationId)
      || !validMovement(value['movement'], productId, locationId)
      || value['movement'].id !== requestId.toLowerCase() || value['movement'].kind !== kind
      || !version(expectedVersion) || value['balance'].version !== expectedVersion
      || value['balance'].version !== value['movement'].version
      || value['balance'].onHand !== value['movement'].onHandAfter
      || value['balance'].unitCode !== value['movement'].unitCode
      || value['movement'].reason !== reason || value['movement'].observedAt !== observedAt
      || value['balance'].updatedAt !== value['movement'].createdAt
      || value['balance'].observedAt !== value['movement'].observedAt
      || value['balance'].updatedBy !== value['movement'].actorUid) return invalidResponse();
    return { balance: value['balance'], movement: value['movement'] };
  }

  private validMovementItem(value: unknown, productId: string, locationId: string): value is InventoryMovement {
    return validMovement(value, productId, locationId);
  }

  private parseMovementsPage(value: unknown, productId: string, locationId: string): InventoryPage<InventoryMovement> {
    const page = this.parsePage(value, item => this.validMovementItem(item, productId, locationId), 'opaque', 5);
    if (page.items.some((item, index) => index > 0 && page.items[index - 1].version <= item.version)) return invalidResponse();
    return page;
  }

  private parsePage<T>(value: unknown, parseItem: (item: unknown) => item is T, cursorKind: 'uuid' | 'opaque', maxItems = 50): InventoryPage<T> {
    if (!record(value) || !exact(value, ['items', 'nextCursor']) || !Array.isArray(value['items'])
      || value['items'].length > maxItems || !(value['nextCursor'] === null || typeof value['nextCursor'] === 'string'
        && (cursorKind === 'uuid' ? uuid(value['nextCursor']) && value['nextCursor'] === value['nextCursor'].toLowerCase() : OPAQUE_CURSOR.test(value['nextCursor'])))
      || !value['items'].every(parseItem)) return invalidResponse();
    return { items: value['items'], nextCursor: value['nextCursor'] } as InventoryPage<T>;
  }
}

function validProductFilters(value: unknown): value is ProductListFilters {
  if (!record(value) || Object.keys(value).some(key => !['skuPrefix', 'brand', 'category', 'supplierId', 'stockStatus'].includes(key))) return false;
  return Object.entries(value).every(([key, item]) => typeof item === 'string' && item.length > 0 && item.trim() === item
    && item.length <= (key === 'skuPrefix' ? 64 : 80) && !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(item)
    && (key !== 'skuPrefix' || /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(item))
    && (key !== 'category' || ['Panels', 'Inverters', 'Batteries', 'Mounting', 'Circuit breakers', 'Surge Protection Device', 'ATS', 'PV Isolator', 'MCCB'].includes(item))
    && (key !== 'supplierId' || UUID_V4.test(item))
    && (key !== 'stockStatus' || isStockStatus(item)));
}

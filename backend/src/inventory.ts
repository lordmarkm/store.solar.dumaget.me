import { ApiError } from './errors.js';
import { exact, object, parseCursor, parseProductId, parseProductQuery, uuid, validVersion } from './admin-catalog.js';
import type { AdminPage, AdminProduct, ProductListFilters } from './admin-catalog.js';
import type { VerifiedIdentity } from './auth.js';

export type UnitCode = 'unit' | 'panel' | 'kit';
export type ManualMovementKind = 'opening' | 'receipt' | 'issue' | 'return' | 'damage' | 'correction';
export type MovementKind = ManualMovementKind | 'count' | 'transfer-in' | 'transfer-out';
export type StockStatus = 'unknown' | 'zero' | 'low' | 'in-stock';
export interface InventoryFilters extends ProductListFilters { stockStatus?: StockStatus }
export const MAX_STOCK = 1_000_000_000;
export const INVENTORY_PAGE_SIZE = 10;
export const MOVEMENT_PAGE_SIZE = 5;
export interface InventoryLocation {
  id: string; schemaVersion: 1; code: string; name: string; notes: string;
  status: 'active' | 'inactive'; version: number; createdAt: string; updatedAt: string; createdBy: string;
}
export interface LocationInput { requestId: string; code: string; name: string; notes: string }
export interface LocationUpdateInput { requestId: string; expectedVersion: number; name: string; notes: string; status: 'active' | 'inactive' }
export interface InventoryBalance {
  schemaVersion: 1; productId: string; locationId: string; unitCode: UnitCode;
  onHand: number; version: number; updatedAt: string; observedAt: string; updatedBy: string;
}
export interface InventoryMovement {
  id: string; schemaVersion: 1; productId: string; locationId: string; unitCode: UnitCode;
  kind: MovementKind; quantity: number; delta: number; onHandBefore: number | null; onHandAfter: number;
  version: number; reason: string; observedAt: string; createdAt: string; actorUid: string; actorName?: string;
  transferId?: string; otherLocationId?: string;
}
export interface StockInput {
  requestId: string; expectedVersion: number | null; expectedProductVersion: number; kind: ManualMovementKind; quantity: number; reason: string; observedAt: string;
}
export interface CountInput { requestId: string; expectedVersion: number | null; expectedProductVersion: number; countedQuantity: number; reason: string; observedAt: string }
export interface TransferInput { requestId: string; expectedProductVersion: number; destinationLocationId: string; expectedSourceVersion: number; expectedDestinationVersion: number; quantity: number; reason: string; observedAt: string }
export interface TransferResult { source: StockResult; destination: StockResult }
export interface InventorySettings { schemaVersion: 1; productId: string; locationId: string; reorderPoint: number | null; version: number; updatedAt: string; updatedBy: string }
export interface SettingsInput { requestId: string; expectedVersion: number | null; expectedProductVersion: number; reorderPoint: number | null }
export interface InventoryRow { product: AdminProduct; balance: InventoryBalance | null; settings?: InventorySettings | null; stockStatus?: StockStatus }
export interface StockResult { balance: InventoryBalance; movement: InventoryMovement }
export interface InventoryRepository {
  locations(cursor: string | null): Promise<AdminPage<InventoryLocation>>;
  createLocation(actor: VerifiedIdentity, input: LocationInput): Promise<InventoryLocation>;
  updateLocation(actor: VerifiedIdentity, id: string, input: LocationUpdateInput): Promise<InventoryLocation>;
  list(locationId: string, cursor: string | null, filters: InventoryFilters): Promise<AdminPage<InventoryRow>>;
  row(productId: string, locationId: string): Promise<InventoryRow>;
  count(actor: VerifiedIdentity, productId: string, locationId: string, input: CountInput): Promise<StockResult>;
  transfer(actor: VerifiedIdentity, productId: string, sourceLocationId: string, input: TransferInput): Promise<TransferResult>;
  settings(actor: VerifiedIdentity, productId: string, locationId: string, input: SettingsInput): Promise<InventorySettings>;
  movements(productId: string, locationId: string, cursor: string | null): Promise<AdminPage<InventoryMovement>>;
  adjust(actor: VerifiedIdentity, productId: string, locationId: string, input: StockInput): Promise<StockResult>;
}
function invalid(): never { throw new ApiError(400, 'INVALID_INVENTORY_INPUT', 'Enter valid inventory details.'); }
export function clean(value: unknown, max: number, required = true, multiline = false): string {
  if (typeof value !== 'string' || value.length > max || (multiline
    ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]/u : /[\u0000-\u001f\u007f\uD800-\uDFFF]/u).test(value)) invalid();
  const result = value.trim(); if (required && !result) invalid(); return result;
}
export function iso(value: unknown): value is string {
  return typeof value === 'string' && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function stock(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_STOCK; }
const unit = (value: unknown): value is UnitCode => typeof value === 'string' && ['unit', 'panel', 'kit'].includes(value);
export function parseLocationInput(value: unknown): LocationInput {
  if (!object(value) || !exact(value, ['requestId', 'code', 'name', 'notes']) || !uuid(value['requestId'])) invalid();
  const code = clean(value['code'], 32).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) invalid();
  return { requestId: value['requestId'].toLowerCase(), code, name: clean(value['name'], 160), notes: clean(value['notes'], 1000, false, true) };
}
export function parseLocationUpdate(value: unknown): LocationUpdateInput {
  if (!object(value) || !exact(value, ['requestId', 'expectedVersion', 'name', 'notes', 'status']) || !uuid(value['requestId'])
    || !validVersion(value['expectedVersion']) || typeof value['status'] !== 'string' || !['active', 'inactive'].includes(value['status'])) invalid();
  return { requestId: value['requestId'].toLowerCase(), expectedVersion: value['expectedVersion'] as number,
    name: clean(value['name'], 160), notes: clean(value['notes'], 1000, false, true), status: value['status'] as 'active' | 'inactive' };
}
export function parseStockInput(value: unknown): StockInput {
  if (!object(value) || !exact(value, ['requestId', 'expectedVersion', 'expectedProductVersion', 'kind', 'quantity', 'reason', 'observedAt']) || !uuid(value['requestId']) || !validVersion(value['expectedProductVersion'])
    || typeof value['kind'] !== 'string' || !['opening', 'receipt', 'issue', 'return', 'damage', 'correction'].includes(value['kind'])
    || !iso(value['observedAt']) || typeof value['quantity'] !== 'number' || !Number.isSafeInteger(value['quantity']) || Math.abs(value['quantity']) > MAX_STOCK) invalid();
  const kind = value['kind'] as ManualMovementKind, quantity = value['quantity'];
  if (kind === 'opening' ? value['expectedVersion'] !== null || quantity < 0
    : !validVersion(value['expectedVersion']) || (kind === 'correction' ? quantity === 0 : quantity <= 0)) invalid();
  return { requestId: value['requestId'].toLowerCase(), expectedVersion: value['expectedVersion'] as number | null,
    expectedProductVersion: value['expectedProductVersion'] as number, kind, quantity, reason: clean(value['reason'], 500), observedAt: value['observedAt'] };
}
export function movementDelta(input: { kind: MovementKind; quantity: number }): number {
  return input.kind === 'issue' || input.kind === 'damage' || input.kind === 'transfer-out' ? -input.quantity : input.quantity;
}
export function parseCountInput(value: unknown): CountInput {
  if (!object(value) || !exact(value, ['requestId', 'expectedVersion', 'expectedProductVersion', 'countedQuantity', 'reason', 'observedAt'])
    || !uuid(value['requestId']) || !validVersion(value['expectedProductVersion']) || !stock(value['countedQuantity'])
    || !(value['expectedVersion'] === null || validVersion(value['expectedVersion'])) || !iso(value['observedAt'])) invalid();
  return { requestId: value['requestId'].toLowerCase(), expectedVersion: value['expectedVersion'] as number | null,
    expectedProductVersion: value['expectedProductVersion'] as number, countedQuantity: value['countedQuantity'],
    reason: clean(value['reason'], 500), observedAt: value['observedAt'] };
}
export function parseTransferInput(value: unknown): TransferInput {
  if (!object(value) || !exact(value, ['requestId', 'expectedProductVersion', 'destinationLocationId', 'expectedSourceVersion', 'expectedDestinationVersion', 'quantity', 'reason', 'observedAt'])
    || !uuid(value['requestId']) || !uuid(value['destinationLocationId']) || !validVersion(value['expectedProductVersion'])
    || !validVersion(value['expectedSourceVersion']) || !validVersion(value['expectedDestinationVersion'])
    || !stock(value['quantity']) || value['quantity'] === 0 || !iso(value['observedAt'])) invalid();
  return { requestId: value['requestId'].toLowerCase(), expectedProductVersion: value['expectedProductVersion'] as number,
    destinationLocationId: value['destinationLocationId'].toLowerCase(), expectedSourceVersion: value['expectedSourceVersion'] as number,
    expectedDestinationVersion: value['expectedDestinationVersion'] as number, quantity: value['quantity'],
    reason: clean(value['reason'], 500), observedAt: value['observedAt'] };
}
export function parseSettingsInput(value: unknown): SettingsInput {
  if (!object(value) || !exact(value, ['requestId', 'expectedVersion', 'expectedProductVersion', 'reorderPoint']) || !uuid(value['requestId'])
    || !validVersion(value['expectedProductVersion'])
    || !(value['expectedVersion'] === null || validVersion(value['expectedVersion']))
    || !(value['reorderPoint'] === null || stock(value['reorderPoint']))) invalid();
  return { requestId: value['requestId'].toLowerCase(), expectedVersion: value['expectedVersion'] as number | null,
    expectedProductVersion: value['expectedProductVersion'] as number, reorderPoint: value['reorderPoint'] as number | null };
}
export function stockStatus(balance: InventoryBalance | null, settings: InventorySettings | null): StockStatus {
  if (!balance) return 'unknown';
  if (balance.onHand === 0) return 'zero';
  return settings?.reorderPoint != null && balance.onHand <= settings.reorderPoint ? 'low' : 'in-stock';
}
export function parseSettings(value: unknown, productId: string, locationId: string): InventorySettings {
  try {
    if (!object(value) || !exact(value, ['schemaVersion', 'productId', 'locationId', 'reorderPoint', 'version', 'updatedAt', 'updatedBy'])
      || value['schemaVersion'] !== 1 || value['productId'] !== productId || value['locationId'] !== locationId
      || !uuid(productId) || !uuid(locationId) || !(value['reorderPoint'] === null || stock(value['reorderPoint']))
      || !validVersion(value['version']) || !iso(value['updatedAt']) || clean(value['updatedBy'], 128) !== value['updatedBy']) corrupt();
    return value as unknown as InventorySettings;
  } catch { return corrupt(); }
}
function corrupt(): never { throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Stored inventory needs review.'); }
export function parseLocation(value: unknown, id: string): InventoryLocation {
  try {
    if (!object(value) || !exact(value, ['id', 'schemaVersion', 'code', 'name', 'notes', 'status', 'version', 'createdAt', 'updatedAt', 'createdBy'])
      || value['id'] !== id || !uuid(id) || value['schemaVersion'] !== 1 || !validVersion(value['version'])
      || !iso(value['createdAt']) || !iso(value['updatedAt']) || value['updatedAt'] < value['createdAt']) corrupt();
    const input = parseLocationInput({ requestId: id, code: value['code'], name: value['name'], notes: value['notes'] });
    if (input.code !== value['code'] || input.name !== value['name'] || input.notes !== value['notes']
      || typeof value['status'] !== 'string' || !['active', 'inactive'].includes(value['status']) || clean(value['createdBy'], 128) !== value['createdBy']) corrupt();
    return value as unknown as InventoryLocation;
  } catch { return corrupt(); }
}
export function parseBalance(value: unknown, productId: string, locationId: string): InventoryBalance {
  try {
    if (!object(value) || !exact(value, ['schemaVersion', 'productId', 'locationId', 'unitCode', 'onHand', 'version', 'updatedAt', 'observedAt', 'updatedBy'])
      || value['schemaVersion'] !== 1 || value['productId'] !== productId || value['locationId'] !== locationId
      || !uuid(productId) || !uuid(locationId) || !unit(value['unitCode']) || !stock(value['onHand']) || !validVersion(value['version'])
      || !iso(value['updatedAt']) || !iso(value['observedAt']) || Date.parse(value['observedAt']) > Date.parse(value['updatedAt']) + 300_000
      || clean(value['updatedBy'], 128) !== value['updatedBy']) corrupt();
    return value as unknown as InventoryBalance;
  } catch { return corrupt(); }
}
export function parseMovement(value: unknown, productId: string, locationId: string): InventoryMovement {
  try {
    if (!object(value) || !exact(value, ['id', 'schemaVersion', 'productId', 'locationId', 'unitCode', 'kind', 'quantity', 'delta',
      'onHandBefore', 'onHandAfter', 'version', 'reason', 'observedAt', 'createdAt', 'actorUid',
      ...(Object.hasOwn(value, 'actorName') ? ['actorName'] : []),
      ...(Object.hasOwn(value, 'transferId') ? ['transferId', 'otherLocationId'] : [])]) || !uuid(value['id'])
      || value['schemaVersion'] !== 1 || value['productId'] !== productId || value['locationId'] !== locationId
      || !uuid(productId) || !uuid(locationId) || !unit(value['unitCode']) || !validVersion(value['version']) || !stock(value['onHandAfter'])
      || !iso(value['createdAt']) || clean(value['actorUid'], 128) !== value['actorUid']) corrupt();
    if (Object.hasOwn(value, 'actorName') && (clean(value['actorName'], 160) !== value['actorName'] || value['actorName'] === value['actorUid'])) corrupt();
    if (value['kind'] === 'count' || value['kind'] === 'transfer-in' || value['kind'] === 'transfer-out') {
      const count = value['kind'] === 'count', before = value['onHandBefore'], quantity = value['quantity'];
      if (!stock(quantity) || (!count && quantity === 0) || (before === null ? !count || value['version'] !== 1 : !stock(before) || Number(value['version']) <= 1)
        || !iso(value['observedAt']) || Date.parse(value['observedAt']) > Date.parse(value['createdAt']) + 300_000
        || clean(value['reason'], 500) !== value['reason']) corrupt();
      const delta = count ? quantity - (before === null ? 0 : Number(before)) : movementDelta({ kind: value['kind'], quantity });
      if (value['delta'] !== delta || (before === null ? 0 : Number(before)) + delta !== value['onHandAfter']
        || (count ? Object.hasOwn(value, 'transferId') : !uuid(value['transferId']) || value['transferId'] !== value['id']
          || !uuid(value['otherLocationId']) || value['otherLocationId'] === locationId)) corrupt();
      return value as unknown as InventoryMovement;
    }
    if (Object.hasOwn(value, 'transferId')) corrupt();
    const input = parseStockInput({ requestId: value['id'], expectedVersion: value['kind'] === 'opening' ? null : 1, expectedProductVersion: 1,
      kind: value['kind'], quantity: value['quantity'], reason: value['reason'], observedAt: value['observedAt'] });
    if (input.reason !== value['reason'] || value['delta'] !== movementDelta(input)
      || (input.kind === 'opening' ? value['onHandBefore'] !== null || value['version'] !== 1
        : !stock(value['onHandBefore']) || (value['version'] as number) <= 1)
      || (value['onHandBefore'] === null ? 0 : value['onHandBefore'] as number) + input.quantity * (input.kind === 'issue' || input.kind === 'damage' ? -1 : 1) !== value['onHandAfter']
      || Date.parse(input.observedAt) > Date.parse(value['createdAt']) + 300_000) corrupt();
    return value as unknown as InventoryMovement;
  } catch { return corrupt(); }
}
export function parseInventoryQuery(value: unknown): { cursor: string | null; filters: InventoryFilters } {
  if (!object(value)) invalid();
  const { stockStatus: status, ...catalog } = value;
  if (status !== undefined && (typeof status !== 'string' || !['unknown', 'zero', 'low', 'in-stock'].includes(status))) invalid();
  const parsed = parseProductQuery(catalog);
  return { cursor: parsed.cursor, filters: { ...parsed.filters, ...(status ? { stockStatus: status as StockStatus } : {}) } };
}
export function parseMovementCursor(value: unknown): string | null {
  if (!object(value) || Object.keys(value).some(key => key !== 'cursor')) invalid();
  const cursor = value['cursor'] ?? null;
  if (cursor !== null && (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(cursor))) invalid();
  return cursor as string | null;
}
export { parseCursor, parseProductId };

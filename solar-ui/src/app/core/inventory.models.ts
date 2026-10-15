import type { AdminPage, AdminProduct, ProductListFilters } from './admin-catalog.models';
export const MAX_STOCK = 1_000_000_000;
export type InventoryUnitCode = 'unit' | 'panel' | 'kit';
export type InventoryManualMovementKind = 'opening' | 'receipt' | 'issue' | 'return' | 'damage' | 'correction';
export type InventoryMovementKind = InventoryManualMovementKind | 'count' | 'transfer-in' | 'transfer-out';
export type InventoryStockStatus = 'unknown' | 'zero' | 'low' | 'in-stock';
export interface InventoryLocation { id: string; schemaVersion: 1; code: string; name: string; notes: string; status: 'active' | 'inactive'; version: number; createdAt: string; updatedAt: string; createdBy: string }
export interface InventoryLocationCreateInput { requestId: string; code: string; name: string; notes: string }
export interface InventoryLocationUpdateInput { requestId: string; expectedVersion: number; name: string; notes: string; status: 'active' | 'inactive' }
export interface InventoryBalance { schemaVersion: 1; productId: string; locationId: string; unitCode: InventoryUnitCode; onHand: number; version: number; updatedAt: string; observedAt: string; updatedBy: string }
export interface InventoryMovement { id: string; schemaVersion: 1; productId: string; locationId: string; unitCode: InventoryUnitCode; kind: InventoryMovementKind; quantity: number; delta: number; onHandBefore: number | null; onHandAfter: number; version: number; reason: string; observedAt: string; createdAt: string; actorUid: string; actorName?: string; transferId?: string; otherLocationId?: string }
export interface InventoryStockInput { requestId: string; expectedVersion: number | null; expectedProductVersion: number; kind: InventoryManualMovementKind; quantity: number; reason: string; observedAt: string }
export interface InventoryCountInput { requestId: string; expectedVersion: number | null; expectedProductVersion: number; countedQuantity: number; reason: string; observedAt: string }
export interface InventoryTransferInput { requestId: string; expectedProductVersion: number; destinationLocationId: string; expectedSourceVersion: number; expectedDestinationVersion: number; quantity: number; reason: string; observedAt: string }
export interface InventoryTransferResult { source: InventoryStockResult; destination: InventoryStockResult }
export interface InventorySettings { schemaVersion: 1; productId: string; locationId: string; reorderPoint: number | null; version: number; updatedAt: string; updatedBy: string }
export interface InventorySettingsInput { requestId: string; expectedVersion: number | null; expectedProductVersion: number; reorderPoint: number | null }
export interface InventoryRow { product: AdminProduct; balance: InventoryBalance | null; settings?: InventorySettings | null; stockStatus?: InventoryStockStatus }
export interface InventoryStockResult { balance: InventoryBalance; movement: InventoryMovement }
export type InventoryPage<T> = AdminPage<T>;
export interface InventoryProductFilters extends ProductListFilters { stockStatus?: InventoryStockStatus }

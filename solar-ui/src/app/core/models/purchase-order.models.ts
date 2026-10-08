import type { ProductSnapshot } from './catalog.models';
import type { EntityId, IsoDateTime, Money, ProductReference, TaxBasis } from './shared.models';

/** Proposal only. No transition, finality, or lock policy is encoded by this list. */
export const PROPOSED_PO_STATUSES = [
  'draft', 'submitted', 'under-review', 'awaiting-customer-confirmation',
  'confirmed', 'preparing', 'dispatched', 'completed', 'cancelled',
] as const;
export type PurchaseOrderStatus = typeof PROPOSED_PO_STATUSES[number];
export type PaymentStatus = 'unpaid' | 'partially-paid' | 'paid' | 'refunded';

/** Pricing groups differ from stock groups; never group solely by line ID or SKU text. */
export interface CatalogPriceBasis {
  readonly product: ProductReference;
  readonly offerId: EntityId;
  readonly tierScheduleId: EntityId;
  readonly aggregateQuantity: number;
  readonly appliedTierMinimum: number | null;
}

export type PricingProvenance =
  | { readonly kind: 'catalog'; readonly basis: CatalogPriceBasis }
  | { readonly kind: 'manual-review'; readonly explanation: string };

export interface AgreedLinePricing {
  readonly unitPrice: Money;
  readonly tax: TaxBasis;
  readonly discountTotal: Money;
  readonly taxTotal: Money;
  readonly lineTotal: Money;
  readonly provenance: PricingProvenance;
}

export type ProvisionalLinePricing =
  | { readonly state: 'unpriced' }
  | { readonly state: 'proposed'; readonly pricing: AgreedLinePricing };

interface PurchaseOrderItemBase {
  readonly id: EntityId;
  readonly sourceBomItemId: EntityId | null;
  readonly quantity: number;
  readonly notes?: string;
}

export type PurchaseOrderItem = PurchaseOrderItemBase & (
  | { readonly kind: 'store-product'; readonly product: ProductReference; readonly pricing: ProvisionalLinePricing }
  | { readonly kind: 'free-text'; readonly title: string; readonly description: string; readonly unit: string; readonly pricing: ProvisionalLinePricing }
);

/** Historical rendering is self-contained; no live Product lookup is required. */
export type LockedPurchaseOrderItem = PurchaseOrderItemBase & (
  | { readonly kind: 'store-product'; readonly snapshot: ProductSnapshot; readonly pricing: AgreedLinePricing }
  | { readonly kind: 'free-text'; readonly title: string; readonly description: string; readonly unit: string; readonly pricing: AgreedLinePricing }
);

export interface PurchaseOrderTotals {
  readonly subtotal: Money;
  readonly discountTotal: Money;
  readonly taxTotal: Money;
  readonly deliveryTotal: Money;
  readonly grandTotal: Money;
}

export interface PurchaseOrderTerms {
  readonly commercialTerms: string;
  readonly paymentTerms: string;
  readonly deliveryTerms: string;
  readonly notes?: string;
}

interface PurchaseOrderBase {
  readonly id: EntityId;
  readonly schemaVersion: 1;
  readonly projectId: EntityId;
  readonly customerId: EntityId;
  readonly orderNumber: string | null;
  readonly status: PurchaseOrderStatus;
  readonly paymentStatus: PaymentStatus | null;
  readonly replacesPurchaseOrderId: EntityId | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface UnlockedPurchaseOrder extends PurchaseOrderBase {
  readonly commitment: 'unlocked';
  readonly items: readonly PurchaseOrderItem[];
  readonly proposedTotals: PurchaseOrderTotals | null;
  readonly proposedTerms: PurchaseOrderTerms | null;
  readonly effectiveRevisionId: null;
  readonly lockedAt: null;
}

export interface LockedPurchaseOrder extends PurchaseOrderBase {
  readonly commitment: 'locked';
  readonly effectiveRevisionId: EntityId;
  readonly lockedAt: IsoDateTime;
  /** Commercial items/totals/terms are read from the effective revision, not this envelope. */
  readonly items?: never;
  readonly proposedTotals?: never;
  readonly proposedTerms?: never;
}

/** Cancellation can exist on either branch; status alone never establishes a lock. */
export type PurchaseOrder = UnlockedPurchaseOrder | LockedPurchaseOrder;

export interface PurchaseOrderRevision {
  readonly id: EntityId;
  readonly schemaVersion: 1;
  readonly purchaseOrderId: EntityId;
  readonly revisionNumber: number;
  readonly reason: 'initial-lock' | 'approved-amendment';
  readonly previousRevisionId: EntityId | null;
  readonly items: readonly LockedPurchaseOrderItem[];
  readonly totals: PurchaseOrderTotals;
  readonly terms: PurchaseOrderTerms;
  readonly createdAt: IsoDateTime;
  readonly createdBy: EntityId;
}

export interface PurchaseOrderStatusEvent {
  readonly id: EntityId;
  readonly purchaseOrderId: EntityId;
  readonly fromStatus: PurchaseOrderStatus | null;
  readonly toStatus: PurchaseOrderStatus;
  readonly occurredAt: IsoDateTime;
  readonly actorId: EntityId;
  readonly reason?: string;
  readonly revisionId: EntityId | null;
  readonly idempotencyKey: string;
}

/** Server-calculated projection. Delivered units already belong to ordered quantities. */
export interface ProjectQuantitySummary {
  readonly projectId: EntityId;
  readonly generatedAt: IsoDateTime;
  readonly lines: readonly {
    readonly sourceBomItemId: EntityId | null;
    readonly unit: string;
    readonly required: number;
    readonly proposed: number;
    readonly ordered: number;
    readonly delivered: number;
    readonly cancelled: number;
    readonly remainingToOrder: number;
    readonly overOrdered: number;
    readonly unmatchedPurchaseOrderItemIds: readonly EntityId[];
  }[];
}

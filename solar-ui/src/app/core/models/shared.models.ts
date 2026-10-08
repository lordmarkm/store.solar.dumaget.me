/** JSON-friendly frontend contracts; Firebase timestamps/SDK objects stay in adapters. */
export type EntityId = string;
/** ISO 8601 UTC timestamp, e.g. 2026-10-06T01:00:00.000Z. Validate on ingestion. */
export type IsoDateTime = string;
export type CurrencyCode = 'PHP';

export interface Money {
  readonly currency: CurrencyCode;
  /** Integer centavos, not floating-point pesos. Negative amounts only for adjustments. */
  readonly amountMinor: number;
}

export interface TaxBasis {
  readonly treatment: 'inclusive' | 'exclusive' | 'exempt' | 'unspecified';
  /** Basis points: 1200 means 12%; null means unknown, not zero. */
  readonly rateBps: number | null;
}

export interface ProductReference {
  readonly productId: EntityId;
  readonly variantId: EntityId | null;
  /** Stable sellable unit identity, not a display label or implicit unit conversion. */
  readonly unitCode: string;
}

/** Shared input validation only: deliberately independent of catalog stock. */
export function isPlanningQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export interface CustomerProfile {
  readonly customerId: EntityId;
  readonly displayName: string;
  readonly email: string;
  readonly phone?: string;
  readonly companyName?: string;
  readonly contractorDetails?: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface CustomerPreferences {
  readonly customerId: EntityId;
  readonly activeProjectId: EntityId | null;
  readonly theme: 'system' | 'light' | 'dark';
  readonly updatedAt: IsoDateTime;
}

export interface Favorite {
  readonly id: EntityId;
  readonly customerId: EntityId;
  readonly productId: EntityId;
  readonly createdAt: IsoDateTime;
}

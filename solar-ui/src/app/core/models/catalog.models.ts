import type { EntityId, IsoDateTime, Money, ProductReference, TaxBasis } from './shared.models';

export interface DisplayReference {
  readonly id: EntityId | null;
  readonly name: string;
}

export interface ProductSpecification {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
}

export interface ProductOption {
  readonly name: string;
  readonly value: string;
}

export interface PublicSupplierDetails extends DisplayReference {
  readonly region: string;
  readonly description: string;
  readonly website: string | null;
}

export interface CatalogPriceTier {
  readonly minimumQuantity: number;
  readonly unitPrice: Money;
  readonly label: string;
}

export interface CatalogPricing {
  readonly offerId: EntityId | null;
  readonly tierScheduleId: EntityId | null;
  readonly baseUnitPrice: Money;
  readonly tax: TaxBasis;
  readonly tiers: readonly CatalogPriceTier[];
}

export interface CatalogAsset {
  readonly id: EntityId;
  readonly kind: 'image' | 'datasheet' | 'document';
  readonly name: string;
  readonly mimeType: string;
  readonly url: string;
}

/** Durable versioned asset identity; resolve temporary view URLs separately. */
export interface RetainedProductAsset extends Omit<CatalogAsset, 'url'> {
  readonly objectKey: string;
  readonly objectVersion: string;
  readonly sha256: string;
}

export interface ProductAvailability {
  readonly inventoryPoolId: EntityId;
  readonly depotName: string;
  readonly availableQuantity: number;
  readonly observedAt: IsoDateTime;
}

/** Full customer-visible catalog payload, distinct from the current demo Product. */
export interface CatalogProductDetails {
  readonly source: ProductReference;
  readonly productVersionId: EntityId | null;
  readonly sku: string;
  readonly name: string;
  readonly brand: DisplayReference;
  readonly category: DisplayReference;
  readonly description: string;
  readonly specifications: readonly ProductSpecification[];
  readonly unitLabel: string;
  readonly options: readonly ProductOption[];
  readonly suppliers: readonly PublicSupplierDetails[];
  readonly pricing: CatalogPricing;
  readonly availability: readonly ProductAvailability[];
  readonly assets: readonly CatalogAsset[];
}

/** Created only at a PO lock or approved amendment, never on BOM/draft saves. */
export interface ProductSnapshot {
  readonly id: EntityId;
  readonly schemaVersion: 1;
  readonly purchaseOrderId: EntityId;
  readonly purchaseOrderRevisionId: EntityId;
  readonly capturedAt: IsoDateTime;
  readonly capturedBy: EntityId;
  readonly product: Omit<CatalogProductDetails, 'assets'> & {
    readonly assets: readonly RetainedProductAsset[];
  };
}

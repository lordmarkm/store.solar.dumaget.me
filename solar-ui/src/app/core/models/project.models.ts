import type { CatalogProductDetails } from './catalog.models';
import type { EntityId, IsoDateTime, Money, ProductReference } from './shared.models';

export const PROJECT_CLASSIFICATIONS = [
  'residential', 'commercial', 'industrial', 'agricultural', 'institutional-public', 'other',
] as const;
export const INSTALLATION_TYPES = ['rooftop', 'ground-mounted', 'carport', 'other'] as const;
export const SYSTEM_CONFIGURATIONS = ['grid-tied', 'hybrid', 'off-grid', 'undecided'] as const;
export const WORK_SCOPES = ['new-installation', 'expansion', 'retrofit', 'maintenance'] as const;
export const DEFAULT_INSTALLATION_TYPE = 'rooftop' as const;
export type ProjectClassification = typeof PROJECT_CLASSIFICATIONS[number];
export type InstallationType = typeof INSTALLATION_TYPES[number];
export type SystemConfiguration = typeof SYSTEM_CONFIGURATIONS[number];
export type WorkScope = typeof WORK_SCOPES[number];
export type ProjectStatus = 'draft' | 'archived';

export interface ProjectDetails {
  readonly name: string;
  readonly classification: ProjectClassification;
  readonly installation: InstallationType;
  readonly configuration: SystemConfiguration;
  readonly workScope: WorkScope;
  readonly classificationOther?: string;
  readonly installationOther?: string;
  readonly location?: string;
  readonly description?: string;
  readonly notes?: string;
}

/** Null selections are wizard state, not valid saved-project defaults. */
export interface NewProjectDraft extends Omit<ProjectDetails, 'classification' | 'configuration' | 'workScope'> {
  readonly classification: ProjectClassification | null;
  readonly configuration: SystemConfiguration | null;
  readonly workScope: WorkScope | null;
}

export function createNewProjectDraft(): NewProjectDraft {
  return {
    name: '', classification: null, installation: DEFAULT_INSTALLATION_TYPE,
    configuration: null, workScope: null,
  };
}

export type ManualEstimate =
  | { readonly kind: 'unpriced' }
  | { readonly kind: 'manual-estimate'; readonly unitPrice: Money; readonly taxTreatment: 'unspecified' };

interface BomItemBase {
  readonly id: EntityId;
  readonly quantity: number;
  readonly notes?: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface StoreProductBomItem extends BomItemBase {
  readonly kind: 'store-product';
  readonly product: ProductReference;
}

export interface FreeTextBomItem extends BomItemBase {
  readonly kind: 'free-text';
  readonly title: string;
  readonly description: string;
  readonly unit: string;
  readonly estimate: ManualEstimate;
}

export type BomItem = StoreProductBomItem | FreeTextBomItem;

/** Always editable with the project; no lock flag or immutable BOM revisions. */
export interface ProjectBom {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly items: readonly BomItem[];
  readonly updatedAt: IsoDateTime;
}

export interface Project extends ProjectDetails {
  readonly id: EntityId;
  readonly schemaVersion: 1;
  readonly customerId: EntityId;
  readonly status: ProjectStatus;
  readonly bom: ProjectBom;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly archivedAt: IsoDateTime | null;
}

/** A view projection, not persisted historical catalog details. */
export type StoreProductResolution =
  | { readonly state: 'available' | 'out-of-stock'; readonly product: CatalogProductDetails }
  | { readonly state: 'missing'; readonly productId: EntityId };

export interface BomSelection {
  readonly bomId: EntityId;
  readonly selectedItemIds: readonly EntityId[];
}

/** Browser-local lists have products only, and never carry row selection. */
export interface GuestEquipmentItem {
  readonly id: EntityId;
  readonly kind: 'store-product';
  readonly product: ProductReference;
  readonly quantity: number;
}

export interface GuestListCopyReceipt {
  readonly id: EntityId;
  readonly listId: EntityId;
  readonly customerId: EntityId;
  readonly projectId: EntityId;
  readonly copiedAt: IsoDateTime;
  readonly idempotencyKey: string;
  readonly itemMappings: readonly {
    readonly guestItemId: EntityId;
    readonly destinationBomItemId: EntityId;
  }[];
}

interface GuestEquipmentListBase {
  readonly id: EntityId;
  readonly schemaVersion: 1;
  readonly items: readonly GuestEquipmentItem[];
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export type GuestEquipmentList = GuestEquipmentListBase & (
  | { readonly state: 'unlinked'; readonly copyReceipt: null }
  | { readonly state: 'linked'; readonly copyReceipt: GuestListCopyReceipt }
);

/** A new current-list ID does not clear/unlink earlier lists. Account access is enforced elsewhere. */
export interface GuestEquipmentListHistory {
  readonly currentListId: EntityId;
  readonly lists: readonly GuestEquipmentList[];
}

/** Transient modal state: project BOMs are intentionally not valid add sources. */
export type AddToProjectSource =
  | { readonly kind: 'product'; readonly product: ProductReference; readonly quantity: number }
  | { readonly kind: 'guest-list'; readonly listId: EntityId };

export type ProjectDestination =
  | { readonly kind: 'active-project'; readonly projectId: EntityId }
  | { readonly kind: 'existing-project'; readonly projectId: EntityId }
  | { readonly kind: 'new-project'; readonly draft: NewProjectDraft };

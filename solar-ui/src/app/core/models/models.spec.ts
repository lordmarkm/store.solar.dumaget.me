import { describe, expect, it } from 'vitest';
import {
  createNewProjectDraft, isPlanningQuantity, PROPOSED_PO_STATUSES,
  type AddToProjectSource, type BomItem, type CatalogProductDetails,
  type FreeTextBomItem, type GuestEquipmentItem, type GuestEquipmentList,
  type GuestEquipmentListHistory, type LockedPurchaseOrder, type LockedPurchaseOrderItem,
  type Money, type ProductSnapshot, type Project, type ProjectBom,
  type PurchaseOrderRevision, type UnlockedPurchaseOrder,
} from '../models';

const timestamp = '2026-10-06T01:00:00.000Z';
const reference = { productId: 'panel-1', variantId: null, unitCode: 'piece' } as const;
const money: Money = { currency: 'PHP', amountMinor: 645000 };
const storeItem: BomItem = {
  id: 'line-1', kind: 'store-product', product: reference, quantity: 999,
  createdAt: timestamp, updatedAt: timestamp,
};
const freeTextItem: FreeTextBomItem = {
  id: 'line-2', kind: 'free-text', title: 'Existing mounting hardware',
  description: 'Inspect before reuse', unit: 'set', quantity: 1,
  estimate: { kind: 'unpriced' }, createdAt: timestamp, updatedAt: timestamp,
};
const bom: ProjectBom = {
  id: 'bom-1', projectId: 'project-1', items: [storeItem, freeTextItem], updatedAt: timestamp,
};
const project: Project = {
  id: 'project-1', schemaVersion: 1, customerId: 'customer-1', name: 'Home backup',
  classification: 'residential', installation: 'rooftop', configuration: 'hybrid',
  workScope: 'new-installation', status: 'draft', bom,
  createdAt: timestamp, updatedAt: timestamp, archivedAt: null,
};
const catalog: CatalogProductDetails = {
  source: reference, productVersionId: 'product-version-1', sku: 'PANEL-001',
  name: 'Solar panel', brand: { id: 'brand-1', name: 'Sample brand' },
  category: { id: 'panels', name: 'Panels' }, description: 'Full panel description',
  specifications: [{ key: 'power', label: 'Output', value: '620', unit: 'Wp' }],
  unitLabel: 'piece', options: [], suppliers: [], availability: [],
  pricing: {
    offerId: 'offer-1', tierScheduleId: 'tiers-1', baseUnitPrice: money,
    tax: { treatment: 'inclusive', rateBps: 1200 }, tiers: [],
  }, assets: [],
};
const snapshot: ProductSnapshot = {
  id: 'snapshot-1', schemaVersion: 1, purchaseOrderId: 'po-1',
  purchaseOrderRevisionId: 'revision-1', capturedAt: timestamp, capturedBy: 'reviewer-1',
  product: {
    ...catalog,
    assets: [{
      id: 'asset-1', kind: 'datasheet', name: 'Panel datasheet', mimeType: 'application/pdf',
      objectKey: 'orders/po-1/revision-1/datasheet.pdf', objectVersion: 'version-1',
      sha256: 'a'.repeat(64),
    }],
  },
};
const revision: PurchaseOrderRevision = {
  id: 'revision-1', schemaVersion: 1, purchaseOrderId: 'po-1', revisionNumber: 1,
  reason: 'initial-lock', previousRevisionId: null,
  items: [{
    id: 'po-line-1', sourceBomItemId: storeItem.id, kind: 'store-product', quantity: 1,
    snapshot,
    pricing: {
      unitPrice: money, tax: { treatment: 'inclusive', rateBps: 1200 },
      discountTotal: { currency: 'PHP', amountMinor: 0 },
      taxTotal: { currency: 'PHP', amountMinor: 69107 }, lineTotal: money,
      provenance: {
        kind: 'catalog', basis: {
          product: reference, offerId: 'offer-1', tierScheduleId: 'tiers-1',
          aggregateQuantity: 1, appliedTierMinimum: null,
        },
      },
    },
  }],
  totals: {
    subtotal: money, discountTotal: { currency: 'PHP', amountMinor: 0 },
    taxTotal: { currency: 'PHP', amountMinor: 69107 },
    deliveryTotal: { currency: 'PHP', amountMinor: 0 }, grandTotal: money,
  },
  terms: { commercialTerms: 'Sample terms', paymentTerms: 'TBD', deliveryTerms: 'TBD' },
  createdAt: timestamp, createdBy: 'reviewer-1',
};
const unlocked: UnlockedPurchaseOrder = {
  id: 'po-1', schemaVersion: 1, projectId: project.id, customerId: project.customerId,
  orderNumber: null, status: 'draft', paymentStatus: null, replacesPurchaseOrderId: null,
  createdAt: timestamp, updatedAt: timestamp, commitment: 'unlocked',
  items: [{
    id: 'po-line-1', sourceBomItemId: storeItem.id, kind: 'store-product',
    product: reference, quantity: 1, pricing: { state: 'unpriced' },
  }],
  proposedTotals: null, proposedTerms: null, effectiveRevisionId: null, lockedAt: null,
};

describe('customer frontend model contracts', () => {
  it('defaults only installation, leaving required wizard choices unset', () => {
    expect(createNewProjectDraft()).toEqual({
      name: '', classification: null, installation: 'rooftop', configuration: null, workScope: null,
    });
    expect(createNewProjectDraft()).not.toBe(createNewProjectDraft());
  });

  it('validates positive safe whole-number planning quantities without stock caps', () => {
    for (const value of [1, 999, Number.MAX_SAFE_INTEGER]) expect(isPlanningQuantity(value)).toBe(true);
    for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null, undefined]) {
      expect(isPlanningQuantity(value)).toBe(false);
    }
  });

  it('round-trips mixed BOM lines and keeps unpriced estimates distinct from zero', () => {
    expect(JSON.parse(JSON.stringify(project))).toEqual(project);
    expect(freeTextItem.estimate).toEqual({ kind: 'unpriced' });
    expect(storeItem.quantity).toBe(999);
    expect('snapshot' in storeItem).toBe(false);
    expect('lockedAt' in bom).toBe(false);
  });

  it('represents duplicate products as separate source lines', () => {
    const duplicate: BomItem = { ...storeItem, id: 'line-3', quantity: 6 };
    const lines = [{ ...storeItem, quantity: 6 }, duplicate];
    expect(new Set(lines.map(line => line.id)).size).toBe(2);
    expect(lines.map(line => line.kind === 'store-product' ? line.product.productId : null))
      .toEqual(['panel-1', 'panel-1']);
    expect(lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(12);
  });

  it('retains a linked list receipt alongside a fresh unlinked current list', () => {
    const linked: GuestEquipmentList = {
      id: 'guest-1', schemaVersion: 1, state: 'linked', items: [],
      createdAt: timestamp, updatedAt: timestamp,
      copyReceipt: {
        id: 'copy-1', listId: 'guest-1', customerId: project.customerId, projectId: project.id,
        copiedAt: timestamp, idempotencyKey: 'request-1', itemMappings: [],
      },
    };
    const fresh: GuestEquipmentList = {
      id: 'guest-2', schemaVersion: 1, state: 'unlinked', copyReceipt: null,
      items: [], createdAt: timestamp, updatedAt: timestamp,
    };
    const history: GuestEquipmentListHistory = { currentListId: fresh.id, lists: [linked, fresh] };
    expect(JSON.parse(JSON.stringify(history))).toEqual(history);
    expect(history.lists[0].state).toBe('linked');
    expect(history.currentListId).not.toBe(linked.id);
  });

  it('allows pre-lock cancellation without inventing a historical revision', () => {
    const cancelled: UnlockedPurchaseOrder = { ...unlocked, status: 'cancelled' };
    expect(cancelled.effectiveRevisionId).toBeNull();
    expect(cancelled.lockedAt).toBeNull();
    expect(JSON.parse(JSON.stringify(cancelled))).toEqual(cancelled);
  });

  it('represents locked cancellation with its effective revision intact', () => {
    const locked: LockedPurchaseOrder = {
      id: unlocked.id, schemaVersion: 1, projectId: project.id, customerId: project.customerId,
      orderNumber: 'PO-001', status: 'cancelled', paymentStatus: 'unpaid',
      replacesPurchaseOrderId: null, createdAt: timestamp, updatedAt: timestamp,
      commitment: 'locked', effectiveRevisionId: revision.id, lockedAt: timestamp,
    };
    expect(JSON.parse(JSON.stringify(locked))).toEqual(locked);
    expect(locked.effectiveRevisionId).toBe(revision.id);
    expect('items' in locked).toBe(false);
  });

  it('round-trips self-contained history including versioned asset identities', () => {
    expect(JSON.parse(JSON.stringify(revision))).toEqual(revision);
    const historicalLine = revision.items[0];
    expect(historicalLine.kind).toBe('store-product');
    if (historicalLine.kind !== 'store-product') throw new Error('Expected product line');
    expect(historicalLine.snapshot.product.description).toBe('Full panel description');
    expect(historicalLine.snapshot.product.assets[0].objectVersion).toBe('version-1');
    expect('url' in historicalLine.snapshot.product.assets[0]).toBe(false);
  });

  it('exposes proposed status names without a transition or lock implementation', () => {
    expect(PROPOSED_PO_STATUSES).toContain('confirmed');
    expect(PROPOSED_PO_STATUSES).toContain('cancelled');
    expect(PROPOSED_PO_STATUSES).toHaveLength(9);
  });
});

/** Compile-only negative contracts; run tsc --noEmit for the spec config as well as tests. */
function rejectedContracts(): void {
  // @ts-expect-error Guest equipment cannot contain free-text lines.
  const invalidGuestItem: GuestEquipmentItem = freeTextItem;
  // @ts-expect-error A linked list requires its copy receipt.
  const invalidLinkedList: GuestEquipmentList = { id: 'g', schemaVersion: 1, state: 'linked', copyReceipt: null, items: [], createdAt: timestamp, updatedAt: timestamp };
  // @ts-expect-error An unlocked PO cannot reference an effective locked revision.
  const invalidUnlocked: UnlockedPurchaseOrder = { ...unlocked, effectiveRevisionId: 'revision-1' };
  // @ts-expect-error A locked product line requires a complete snapshot, not a live reference.
  const invalidHistory: LockedPurchaseOrderItem = { id: 'line', sourceBomItemId: null, kind: 'store-product', product: reference, quantity: 1, pricing: revision.items[0].pricing };
  // @ts-expect-error Project BOMs are not Add to project sources.
  const invalidSource: AddToProjectSource = { kind: 'project-bom', bomId: bom.id };
  // @ts-expect-error Historical revision arrays cannot be appended to.
  revision.items.push(revision.items[0]);
  // @ts-expect-error Historical nested product details are readonly too.
  snapshot.product.name = 'Repriced/replaced product';
  // @ts-expect-error Wizard null selections cannot be persisted as a saved project.
  const invalidProject: Project = { ...project, ...createNewProjectDraft() };
  void [invalidGuestItem, invalidLinkedList, invalidUnlocked, invalidHistory, invalidSource, invalidProject];
}
void rejectedContracts;

import { PRODUCTS } from './demo-data';
import { GuestEquipmentList, GuestEquipmentListHistory, isPlanningQuantity } from './models';

export const LEGACY_DRAFT_KEY = 'solar.bom.v1';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const date = (v: unknown): v is string => text(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));

/** Validate links without consulting mutable catalog/BOM contents. Later list edits are independent. */
export function validGuestHistory(v: unknown): v is GuestEquipmentListHistory {
  if (!record(v) || !text(v['currentListId']) || !Array.isArray(v['lists']) || !v['lists'].length) return false;
  for (const list of v['lists']) {
    if (!record(list) || list['schemaVersion'] !== 1 || !text(list['id']) || !date(list['createdAt']) || !date(list['updatedAt']) || !Array.isArray(list['items'])) return false;
    for (const item of list['items']) {
      if (!record(item) || !text(item['id']) || item['kind'] !== 'store-product' || !isPlanningQuantity(item['quantity'])) return false;
      const p = item['product'];
      if (!record(p) || !text(p['productId']) || !text(p['unitCode']) || !(p['variantId'] === null || text(p['variantId']))) return false;
    }
    if (new Set(list['items'].map(i => i.id)).size !== list['items'].length) return false;
    if (list['state'] === 'unlinked') { if (list['copyReceipt'] !== null) return false; }
    else if (list['state'] === 'linked') {
      const r = list['copyReceipt'];
      if (!record(r) || !text(r['id']) || r['listId'] !== list['id'] || !text(r['customerId']) || !text(r['projectId']) || !date(r['copiedAt']) || !text(r['idempotencyKey']) || !Array.isArray(r['itemMappings']) || !r['itemMappings'].length) return false;
      if (!r['itemMappings'].every(m => record(m) && text(m['guestItemId']) && text(m['destinationBomItemId']))) return false;
      if (new Set(r['itemMappings'].map(m => m.guestItemId)).size !== r['itemMappings'].length || new Set(r['itemMappings'].map(m => m.destinationBomItemId)).size !== r['itemMappings'].length) return false;
    } else return false;
  }
  return new Set(v['lists'].map(l => l.id)).size === v['lists'].length && v['lists'].some(l => l.id === v['currentListId']);
}
export function emptyGuestList(id: string): GuestEquipmentList {
  const now = new Date().toISOString();
  return { id, schemaVersion: 1, items: [], state: 'unlinked', copyReceipt: null, createdAt: now, updatedAt: now };
}
/** Keep legacy raw storage as a recovery backup. Preserve valid rows, including missing products. */
export function migrateGuestList(raw: string | null): GuestEquipmentListHistory {
  const parsed: unknown = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Invalid legacy list');
  const list = emptyGuestList(`guest-${crypto.randomUUID()}`);
  const items = new Map<string, GuestEquipmentList['items'][number]>();
  for (const candidate of parsed) {
    if (!record(candidate) || !text(candidate['productId']) || !isPlanningQuantity(candidate['quantity'])) continue;
    const productId = candidate['productId'];
    items.set(productId, { id: `guest-item-${crypto.randomUUID()}`, kind: 'store-product', product: { productId, variantId: null, unitCode: PRODUCTS.find(p => p.id === productId)?.unit ?? 'unknown' }, quantity: candidate['quantity'] });
  }
  return { currentListId: list.id, lists: [{ ...list, items: [...items.values()] }] };
}
/** A transient all-rows review fingerprint, never a product snapshot or revision. */
export function guestListFingerprint(list: GuestEquipmentList): string { return JSON.stringify({ id: list.id, state: list.state, items: list.items }); }
export interface PendingGuestList { readonly listId: string; readonly fingerprint: string }

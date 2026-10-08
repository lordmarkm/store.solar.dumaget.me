import { createHash } from 'node:crypto';
import { ApiError } from './errors.js';
import { customerDocumentId } from './customer-profile.js';
import type { VerifiedIdentity } from './auth.js';

export type ProjectClassification = 'residential' | 'commercial' | 'industrial' | 'agricultural' | 'institutional-public' | 'other';
export type InstallationType = 'rooftop' | 'ground-mounted' | 'carport' | 'other';
export type SystemConfiguration = 'grid-tied' | 'hybrid' | 'off-grid' | 'undecided';
export type WorkScope = 'new-installation' | 'expansion' | 'retrofit' | 'maintenance';
export interface ProjectDetails {
  name: string; classification: ProjectClassification; installation: InstallationType;
  configuration: SystemConfiguration; workScope: WorkScope;
  classificationOther?: string; installationOther?: string; location?: string; description?: string; notes?: string;
}
export interface ItemInput { product: { productId: string; variantId: null; unitCode: string }; quantity: number }
interface BomBase { id: string; quantity: number; notes?: string; createdAt: string; updatedAt: string }
export interface StoreBomItem extends BomBase { kind: 'store-product'; product: ItemInput['product'] }
export interface FreeTextBomItem extends BomBase { kind: 'free-text'; title: string; description: string; unit: string; estimate: { kind: 'unpriced' } }
export type BomItem = StoreBomItem | FreeTextBomItem;
export interface AccountProject extends ProjectDetails {
  id: string; schemaVersion: 1; customerId: string; version: number; status: 'draft' | 'archived';
  bom: { id: string; projectId: string; items: BomItem[]; updatedAt: string };
  createdAt: string; updatedAt: string; archivedAt: string | null;
}
export interface GuestCopyInput { listId: string; fingerprint: string; itemIds: string[] }
export interface GuestListCopyReceipt {
  id: string; listId: string; customerId: string; projectId: string; copiedAt: string; idempotencyKey: string;
  itemMappings: { guestItemId: string; destinationBomItemId: string }[];
}
export interface CreateProjectInput { requestId: string; details: ProjectDetails; items?: ItemInput[]; guest?: GuestCopyInput }
export interface AddItemsCommand { requestId: string; expectedVersion: number; action: 'add-items'; items: ItemInput[]; guest?: GuestCopyInput }
export interface FreeTextCommand { requestId: string; expectedVersion: number; action: 'free-text'; itemId?: string; input: { title: string; description: string; unit: string; quantity: number; notes: string } }
export interface QuantityCommand { requestId: string; expectedVersion: number; action: 'quantity'; itemId: string; quantity: number }
export interface RemoveCommand { requestId: string; expectedVersion: number; action: 'remove'; itemId: string }
export interface RestoreCommand { requestId: string; expectedVersion: number; action: 'restore'; itemId: string; index: number }
export type ProjectCommand = AddItemsCommand | FreeTextCommand | QuantityCommand | RemoveCommand | RestoreCommand;
export interface ActiveProjectInput { requestId: string; expectedVersion: number | null; activeProjectId: string | null }

const fail = (): never => { throw new ApiError(400, 'INVALID_PROJECT_INPUT', 'Enter valid project details and try again.'); };
export const projectObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const iso = (value: unknown): value is string => typeof value === 'string' && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const version = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
const quantity = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function string(value: unknown, max: number, required = false, multiline = false): string {
  if (typeof value !== 'string' || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) return fail();
  const result = value.trim(); if (required && !result) return fail(); return result;
}
const detailKeys = ['name', 'classification', 'installation', 'configuration', 'workScope'] as const;
const detailOptional = ['classificationOther', 'installationOther', 'location', 'description', 'notes'] as const;
export function parseProjectDetails(value: unknown): ProjectDetails {
  if (!projectObject(value) || !exact(value, detailKeys, detailOptional)) return fail();
  if (!['residential', 'commercial', 'industrial', 'agricultural', 'institutional-public', 'other'].includes(value['classification'] as string)
    || !['rooftop', 'ground-mounted', 'carport', 'other'].includes(value['installation'] as string)
    || !['grid-tied', 'hybrid', 'off-grid', 'undecided'].includes(value['configuration'] as string)
    || !['new-installation', 'expansion', 'retrofit', 'maintenance'].includes(value['workScope'] as string)) return fail();
  const result: ProjectDetails = { name: string(value['name'], 120, true), classification: value['classification'] as ProjectClassification,
    installation: value['installation'] as InstallationType, configuration: value['configuration'] as SystemConfiguration, workScope: value['workScope'] as WorkScope };
  const optional: Partial<Record<typeof detailOptional[number], string>> = {};
  for (const [key, max] of [['classificationOther', 240], ['installationOther', 240], ['location', 240], ['description', 2000], ['notes', 2000]] as const) {
    if (value[key] !== undefined) { const parsed = string(value[key], max, false, key === 'description' || key === 'notes'); if (parsed) optional[key] = parsed; }
  }
  return { ...result, ...optional };
}
export function parseItemInput(value: unknown): ItemInput {
  if (!projectObject(value) || !exact(value, ['product', 'quantity']) || !projectObject(value['product']) || !exact(value['product'], ['productId', 'variantId', 'unitCode'])
    || !uuid(value['product']['productId']) || value['product']['variantId'] !== null || !quantity(value['quantity'])) return fail();
  return { product: { productId: value['product']['productId'].toLowerCase(), variantId: null, unitCode: string(value['product']['unitCode'], 80, true) }, quantity: value['quantity'] };
}
function parseItems(value: unknown, allowEmpty = false): ItemInput[] {
  if (!Array.isArray(value) || value.length > 200 || (!allowEmpty && value.length === 0)) return fail(); return value.map(parseItemInput);
}
export function parseGuestCopy(value: unknown, items: readonly ItemInput[]): GuestCopyInput {
  if (!projectObject(value) || !exact(value, ['listId', 'fingerprint', 'itemIds'])) return fail();
  const listId = string(value['listId'], 256, true); const fingerprint = string(value['fingerprint'], 60_000, true);
  if (!Array.isArray(value['itemIds']) || value['itemIds'].length !== items.length || !value['itemIds'].length) return fail();
  const itemIds = value['itemIds'].map(id => string(id, 256, true)); if (new Set(itemIds).size !== itemIds.length) return fail();
  const canonical = JSON.stringify({ id: listId, state: 'unlinked', items: items.map((item, index) => ({ id: itemIds[index], kind: 'store-product', product: item.product, quantity: item.quantity })) });
  if (fingerprint !== canonical) return fail(); return { listId, fingerprint, itemIds };
}
export function parseCreateProject(value: unknown): CreateProjectInput {
  if (!projectObject(value) || !exact(value, ['requestId', 'details'], ['items', 'guest']) || !uuid(value['requestId'])) return fail();
  const items = value['items'] === undefined ? [] : parseItems(value['items'], true);
  if (value['guest'] !== undefined && value['items'] === undefined) return fail();
  const guest = value['guest'] === undefined ? undefined : parseGuestCopy(value['guest'], items);
  return { requestId: value['requestId'].toLowerCase(), details: parseProjectDetails(value['details']), ...(value['items'] !== undefined ? { items } : {}), ...(guest ? { guest } : {}) };
}
function itemId(value: unknown): string {
  if (typeof value !== 'string' || !/^(product|text)-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) return fail(); return value;
}
function parseFreeText(value: unknown): FreeTextCommand['input'] {
  if (!projectObject(value) || !exact(value, ['title', 'description', 'unit', 'quantity', 'notes']) || !quantity(value['quantity'])) return fail();
  return { title: string(value['title'], 240, true), description: string(value['description'], 2000, false, true), unit: string(value['unit'], 80, true), quantity: value['quantity'], notes: string(value['notes'], 2000, false, true) };
}
export function parseBomItem(value: unknown): BomItem {
  if (!projectObject(value) || !['store-product', 'free-text'].includes(value['kind'] as string) || !quantity(value['quantity']) || !iso(value['createdAt']) || !iso(value['updatedAt'])
    || (value['notes'] !== undefined && typeof value['notes'] !== 'string')) return fail();
  const id = itemId(value['id']); const common = ['id', 'kind', 'quantity', 'createdAt', 'updatedAt']; const optional = ['notes'];
  const base: BomBase = { id, quantity: value['quantity'], createdAt: value['createdAt'], updatedAt: value['updatedAt'], ...(value['notes'] !== undefined ? { notes: string(value['notes'], 2000, false, true) } : {}) };
  if (value['kind'] === 'store-product') {
    if (!exact(value, [...common, 'product'], optional) || !id.startsWith('product-')) return fail();
    return { ...base, kind: 'store-product', product: parseItemInput({ product: value['product'], quantity: value['quantity'] }).product };
  }
  if (!exact(value, [...common, 'title', 'description', 'unit', 'estimate'], optional) || !id.startsWith('text-') || !projectObject(value['estimate'])
    || !exact(value['estimate'], ['kind']) || value['estimate']['kind'] !== 'unpriced') return fail();
  return { ...base, kind: 'free-text', title: string(value['title'], 240, true), description: string(value['description'], 2000, false, true), unit: string(value['unit'], 80, true), estimate: { kind: 'unpriced' } };
}
export function parseProjectCommand(value: unknown): ProjectCommand {
  if (!projectObject(value) || !uuid(value['requestId']) || !version(value['expectedVersion']) || typeof value['action'] !== 'string') return fail();
  const common = ['requestId', 'expectedVersion', 'action']; const requestId = value['requestId'].toLowerCase();
  if (value['action'] === 'add-items') {
    if (!exact(value, [...common, 'items'], ['guest'])) return fail(); const items = parseItems(value['items']);
    const guest = value['guest'] === undefined ? undefined : parseGuestCopy(value['guest'], items);
    return { requestId, expectedVersion: value['expectedVersion'], action: 'add-items', items, ...(guest ? { guest } : {}) };
  }
  if (value['action'] === 'free-text') {
    if (!exact(value, [...common, 'input'], ['itemId'])) return fail();
    return { requestId, expectedVersion: value['expectedVersion'], action: 'free-text', input: parseFreeText(value['input']), ...(value['itemId'] !== undefined ? { itemId: itemId(value['itemId']) } : {}) };
  }
  if (value['action'] === 'quantity') {
    if (!exact(value, [...common, 'itemId', 'quantity']) || !quantity(value['quantity'])) return fail();
    return { requestId, expectedVersion: value['expectedVersion'], action: 'quantity', itemId: itemId(value['itemId']), quantity: value['quantity'] };
  }
  if (value['action'] === 'remove') {
    if (!exact(value, [...common, 'itemId'])) return fail(); return { requestId, expectedVersion: value['expectedVersion'], action: 'remove', itemId: itemId(value['itemId']) };
  }
  if (value['action'] === 'restore') {
    if (!exact(value, [...common, 'itemId', 'index']) || !Number.isSafeInteger(value['index']) || (value['index'] as number) < 0 || (value['index'] as number) > 200) return fail();
    return { requestId, expectedVersion: value['expectedVersion'], action: 'restore', itemId: itemId(value['itemId']), index: value['index'] as number };
  }
  return fail();
}
export function parseActiveProjectInput(value: unknown): ActiveProjectInput {
  if (!projectObject(value) || !exact(value, ['requestId', 'expectedVersion', 'activeProjectId']) || !uuid(value['requestId'])
    || (value['expectedVersion'] !== null && !version(value['expectedVersion'])) || (value['activeProjectId'] !== null && !uuid(value['activeProjectId']))) return fail();
  return { requestId: value['requestId'].toLowerCase(), expectedVersion: value['expectedVersion'] as number | null, activeProjectId: value['activeProjectId'] === null ? null : (value['activeProjectId'] as string).toLowerCase() };
}
export function parseProjectCursor(value: unknown): string | null {
  if (!projectObject(value) || Object.keys(value).some(key => key !== 'cursor')) return fail();
  if (value['cursor'] === undefined) return null;
  if (!uuid(value['cursor'])) return fail();
  return value['cursor'].toLowerCase();
}
export function accountPathId(identity: VerifiedIdentity): string { return customerDocumentId(identity.uid); }
export function parseAccountProject(value: unknown, id: string, customerId: string): AccountProject {
  const invalid = (): never => { throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored project data needs review.'); };
  try {
    if (!projectObject(value) || !uuid(id) || !exact(value, [...detailKeys, 'id', 'schemaVersion', 'customerId', 'version', 'status', 'bom', 'createdAt', 'updatedAt', 'archivedAt'], detailOptional)
      || value['id'] !== id || value['customerId'] !== customerId || value['schemaVersion'] !== 1 || !version(value['version'])
      || !iso(value['createdAt']) || !iso(value['updatedAt']) || value['createdAt'] > value['updatedAt']
      || (value['status'] !== 'draft' && value['status'] !== 'archived') || (value['status'] === 'draft' ? value['archivedAt'] !== null : !iso(value['archivedAt']))) return invalid();
    const details = parseProjectDetails(Object.fromEntries([...detailKeys, ...detailOptional].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])));
    if (!projectObject(value['bom']) || !exact(value['bom'], ['id', 'projectId', 'items', 'updatedAt']) || value['bom']['id'] !== 'bom-' + id || value['bom']['projectId'] !== id
      || !iso(value['bom']['updatedAt']) || !Array.isArray(value['bom']['items']) || value['bom']['items'].length > 200) return invalid();
    const bomUpdatedAt = value['bom']['updatedAt'] as string;
    if (bomUpdatedAt !== value['updatedAt'] || bomUpdatedAt < (value['createdAt'] as string)
      || (value['status'] === 'archived' && ((value['archivedAt'] as string) < (value['createdAt'] as string) || (value['archivedAt'] as string) > (value['updatedAt'] as string)))) return invalid();
    const items = value['bom']['items'].map(parseBomItem);
    if (items.some(item => item.createdAt > item.updatedAt || item.updatedAt > bomUpdatedAt) || new Set(items.map(item => item.id)).size !== items.length) return invalid();
    return { ...details, id, schemaVersion: 1, customerId, version: value['version'], status: value['status'], bom: { id: 'bom-' + id, projectId: id, items, updatedAt: value['bom']['updatedAt'] as string }, createdAt: value['createdAt'], updatedAt: value['updatedAt'], archivedAt: value['archivedAt'] as string | null };
  } catch (error) { if (error instanceof ApiError && error.statusCode === 503) throw error; return invalid(); }
}
export function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }

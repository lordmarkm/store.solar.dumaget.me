import { createHash } from 'node:crypto';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import type { VerifiedIdentity } from './auth.js';
import { ApiError } from './errors.js';
import { parsePublishedProduct } from './admin-catalog.js';
import {
  accountPathId, parseAccountProject, parseBomItem, projectObject, sha256, matchesProjectQuery, parseProjectDetails, parseFreeTextProtectionMetadata,
} from './customer-projects.js';
import type {
  AccountProject, ActiveProjectInput, BomItem, CreateProjectInput, FreeTextCommand, GuestCopyInput,
  GuestListCopyReceipt, ItemInput, ProjectCommand, RestoreCommand, StoreBomItem, ProjectListQuery, ProjectManagementInput,
} from './customer-projects.js';

export interface AccountProjectPage { items: AccountProject[]; nextCursor: string | null; activeProjectId: string | null; preferencesVersion: number | null }
export interface ProjectManagementResult { project: AccountProject; activeProjectId: string | null; preferencesVersion: number | null }
export interface AccountProjectRepository {
  list(identity: VerifiedIdentity, cursor: string | null, filters?: ProjectListQuery): Promise<AccountProjectPage>;
  manage(identity: VerifiedIdentity, id: string, input: ProjectManagementInput): Promise<ProjectManagementResult>;
  get(identity: VerifiedIdentity, id: string): Promise<AccountProject>;
  create(identity: VerifiedIdentity, input: CreateProjectInput): Promise<{ project: AccountProject; copyReceipt: GuestListCopyReceipt | null }>;
  command(identity: VerifiedIdentity, id: string, input: ProjectCommand): Promise<{ project: AccountProject; copyReceipt: GuestListCopyReceipt | null }>;
  setActive(identity: VerifiedIdentity, input: ActiveProjectInput): Promise<{ activeProjectId: string | null; preferencesVersion: number | null }>;
}

const validVersion = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const isoDate = (value: unknown): value is string => typeof value === 'string' && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function deterministicUuid(seed: unknown): string {
  const hex = createHash('sha256').update(JSON.stringify(seed)).digest('hex').slice(0, 32).split('');
  hex[12] = '4'; hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  const value = hex.join('');
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20);
}
function iso(date: Date): string { return date.toISOString(); }
function plainHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function receiptData(value: unknown, customerId: string, expectedProjectId: string): { payloadHash: string; projectId: string; copyReceipt: GuestListCopyReceipt | null } {
  if (!projectObject(value) || Object.keys(value).sort().join(',') !== ['copyReceipt', 'payloadHash', 'projectId', 'schemaVersion'].sort().join(',')
    || value['schemaVersion'] !== 1 || typeof value['payloadHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['payloadHash'])
    || value['projectId'] !== expectedProjectId || !uuidPattern.test(value['projectId'])
    || (value['copyReceipt'] !== null && !validCopyReceipt(value['copyReceipt']))) throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored project request needs review.');
  if (value['copyReceipt'] !== null && (value['copyReceipt'].customerId !== customerId || value['copyReceipt'].projectId !== expectedProjectId)) {
    throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored project request owner needs review.');
  }
  return value as unknown as { payloadHash: string; projectId: string; copyReceipt: GuestListCopyReceipt | null };
}
function validCopyReceipt(value: unknown): value is GuestListCopyReceipt {
  if (!projectObject(value) || Object.keys(value).sort().join(',') !== ['id', 'listId', 'customerId', 'projectId', 'copiedAt', 'idempotencyKey', 'itemMappings'].sort().join(',')
    || typeof value['id'] !== 'string' || typeof value['listId'] !== 'string' || typeof value['customerId'] !== 'string'
    || typeof value['projectId'] !== 'string' || !uuidPattern.test(value['projectId']) || typeof value['idempotencyKey'] !== 'string'
    || typeof value['copiedAt'] !== 'string' || !Number.isFinite(Date.parse(value['copiedAt'])) || !Array.isArray(value['itemMappings'])) return false;
  return value['itemMappings'].every(mapping => projectObject(mapping)
    && Object.keys(mapping).sort().join(',') === 'destinationBomItemId,guestItemId'
    && typeof mapping['guestItemId'] === 'string' && typeof mapping['destinationBomItemId'] === 'string');
}
interface Preferences { schemaVersion: 1; customerId: string; version: number; activeProjectId: string | null; updatedAt: string }
function parsePreferences(value: unknown, uid: string): Preferences {
  if (!projectObject(value) || Object.keys(value).sort().join(',') !== 'activeProjectId,customerId,schemaVersion,updatedAt,version'
    || value['schemaVersion'] !== 1 || value['customerId'] !== uid || !validVersion(value['version'])
    || (value['activeProjectId'] !== null && (typeof value['activeProjectId'] !== 'string' || !uuidPattern.test(value['activeProjectId'])))
    || typeof value['updatedAt'] !== 'string' || !Number.isFinite(Date.parse(value['updatedAt']))) {
    throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored project preferences need review.');
  }
  return value as unknown as Preferences;
}
function projectHash(value: unknown): string { return plainHash(value); }

/** Account-owned mutable project/BOM documents; never stores or rewrites profile fields. */
export class FirestoreAccountProjectRepository implements AccountProjectRepository {
  constructor(private readonly database: () => Firestore, private readonly now = () => new Date()) {}

  async list(identity: VerifiedIdentity, cursor: string | null, filters: ProjectListQuery = { limit: 50 }): Promise<AccountProjectPage> {
    const customerId = identity.uid;
    if (cursor !== null && !uuidPattern.test(cursor)) throw new ApiError(400, 'INVALID_PROJECT_INPUT', 'Enter a valid project cursor.');
    try {
      const root = this.database().collection('customers').doc(accountPathId(identity));
      const enumFilters = (['status', 'classification', 'configuration', 'workScope'] as const).filter(key => filters[key] !== undefined);
      const budget = filters.search || enumFilters.length > 1 ? 50 : filters.limit;
      let query: FirebaseFirestore.Query = root.collection('projects');
      // One equality uses its automatic single-field index; other criteria stay API-side within the read budget.
      const primary = enumFilters[0];
      if (primary) query = query.where(primary, '==', filters[primary]);
      query = query.orderBy('__name__').limit(budget + 1);
      if (cursor) query = query.startAfter(cursor);
      const [page, prefDoc] = await Promise.all([query.get(), root.collection('preferences').doc('current').get()]);
      const visible: AccountProject[] = [];
      let consumed = 0;
      for (const doc of page.docs.slice(0, budget)) {
        consumed++;
        const project = parseAccountProject(doc.data(), doc.id, customerId);
        if (matchesProjectQuery(project, filters)) visible.push(project);
        if (visible.length === filters.limit) break;
      }
      const prefs = prefDoc.exists ? parsePreferences(prefDoc.data(), customerId) : null;
      return { items: visible, nextCursor: consumed < page.docs.length ? page.docs[consumed - 1]!.id : null,
        activeProjectId: prefs?.activeProjectId ?? null, preferencesVersion: prefs?.version ?? null };
    } catch (error) { throw this.sanitize(error); }
  }

  async get(identity: VerifiedIdentity, id: string): Promise<AccountProject> {
    if (!uuidPattern.test(id)) throw new ApiError(400, 'INVALID_PROJECT_INPUT', 'Enter a valid project ID.');
    try {
      const doc = await this.projectRef(identity, id).get();
      if (!doc.exists) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
      return parseAccountProject(doc.data(), id, identity.uid);
    } catch (error) { throw this.sanitize(error); }
  }

  /** Lifecycle changes and active preference clearing commit atomically; BOM planning never becomes a PO. */
  async manage(identity: VerifiedIdentity, id: string, input: ProjectManagementInput): Promise<ProjectManagementResult> {
    if (!uuidPattern.test(id)) throw new ApiError(400, 'INVALID_PROJECT_INPUT', 'Enter a valid project ID.');
    try {
      const db = this.database(), root = db.collection('customers').doc(accountPathId(identity));
      const sourceRef = root.collection('projects').doc(id);
      const targetId = input.action === 'duplicate-project' ? deterministicUuid(['duplicate', identity.uid, id, input.requestId]) : id;
      const targetRef = root.collection('projects').doc(targetId);
      const requestRef = root.collection('projectRequests').doc(input.requestId);
      const prefsRef = root.collection('preferences').doc('current');
      const payloadHash = projectHash({ sourceId: id, ...input, requestId: undefined });
      return await db.runTransaction(async tx => {
        const [sourceDoc, requestDoc, prefsDoc, targetDoc] = await Promise.all([
          tx.get(sourceRef), tx.get(requestRef), tx.get(prefsRef),
          targetId === id ? Promise.resolve(null) : tx.get(targetRef),
        ]);
        if (!sourceDoc.exists) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
        const source = parseAccountProject(sourceDoc.data(), id, identity.uid);
        let prefs = prefsDoc.exists ? parsePreferences(prefsDoc.data(), identity.uid) : null;
        if (requestDoc.exists) {
          const receipt = receiptData(requestDoc.data(), identity.uid, targetId);
          if (receipt.payloadHash !== payloadHash) throw new ApiError(409, 'PROJECT_REQUEST_CONFLICT', 'Request ID already used for a different project change.');
          const resultDoc = targetId === id ? sourceDoc : targetDoc;
          if (!resultDoc?.exists) throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored request has no project.');
          return { project: parseAccountProject(resultDoc.data(), targetId, identity.uid), activeProjectId: prefs?.activeProjectId ?? null, preferencesVersion: prefs?.version ?? null };
        }
        if (source.version !== input.expectedVersion || source.version >= Number.MAX_SAFE_INTEGER - 1) throw new ApiError(409, 'PROJECT_CHANGED', 'Project changed. Reload and review before continuing.');
        if (input.action === 'restore-project' ? source.status !== 'archived'
          : input.action !== 'duplicate-project' && source.status !== 'draft') throw new ApiError(409, 'PROJECT_NOT_EDITABLE', 'Project is not in the required state.');
        const at = iso(this.now());
        let project: AccountProject;
        if (input.action === 'duplicate-project') {
          if (targetDoc?.exists) throw new ApiError(409, 'PROJECT_REQUEST_CONFLICT', 'Duplicate identity already exists.');
          const details = parseProjectDetails(Object.fromEntries(['name', 'classification', 'installation', 'configuration', 'workScope', 'classificationOther', 'installationOther', 'location', 'description', 'notes']
            .filter(key => Object.hasOwn(source, key)).map(key => [key, source[key as keyof AccountProject]])));
          project = parseAccountProject({ ...details, name: 'Copy of ' + source.name.slice(0, 112), id: targetId,
            schemaVersion: 1, customerId: identity.uid, version: 1, status: 'draft', archivedAt: null, createdAt: at, updatedAt: at,
            bom: { id: 'bom-' + targetId, projectId: targetId, updatedAt: at, items: source.bom.items.map((item, index) => ({
              ...item, id: (item.kind === 'store-product' ? 'product-' : 'text-') + deterministicUuid(['duplicate-line', input.requestId, index]),
              createdAt: at, updatedAt: at,
            })) } }, targetId, identity.uid);
          tx.create(targetRef, project);
        } else {
          const { classificationOther: _c, installationOther: _i, location: _l, description: _d, notes: _n, ...required } = source;
          const changed = input.action === 'edit-details' ? { ...required, ...input.details } :
            { ...source, status: input.action === 'archive-project' ? 'archived' : 'draft', archivedAt: input.action === 'archive-project' ? at : null };
          project = parseAccountProject({ ...changed, version: source.version + 1, updatedAt: at, bom: { ...source.bom, updatedAt: at } }, id, identity.uid);
          tx.set(sourceRef, project);
          if (input.action === 'archive-project' && prefs?.activeProjectId === id) {
            const nextVersion = prefs.version + 1;
            if (!validVersion(nextVersion)) throw new ApiError(409, 'PREFERENCES_CHANGED', 'Project preferences need review.');
            prefs = { ...prefs, version: nextVersion, activeProjectId: null, updatedAt: at };
            tx.set(prefsRef, prefs);
          }
        }
        tx.create(requestRef, { schemaVersion: 1, payloadHash, projectId: targetId, copyReceipt: null });
        return { project, activeProjectId: prefs?.activeProjectId ?? null, preferencesVersion: prefs?.version ?? null };
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }

  async create(identity: VerifiedIdentity, input: CreateProjectInput): Promise<{ project: AccountProject; copyReceipt: GuestListCopyReceipt | null }> {
    try {
      const db = this.database(); const root = db.collection('customers').doc(accountPathId(identity));
      const id = deterministicUuid(['project', identity.uid, input.requestId]);
      const projectRef = root.collection('projects').doc(id); const requestRef = root.collection('projectRequests').doc(input.requestId);
      const guestRef = input.guest ? this.guestRef(root, input.guest.listId) : null;
      const refs = this.catalogRefs(db, input.items ?? []);
      const payload = { action: 'create', details: input.details, items: input.items ?? [], guest: input.guest ? { listId: input.guest.listId, itemIds: input.guest.itemIds, items: input.items ?? [] } : null };
      const payloadHash = projectHash(payload);
      return await db.runTransaction(async tx => {
        const requestDoc = await tx.get(requestRef);
        const projectDoc = await tx.get(projectRef);
        const guestDoc = guestRef ? await tx.get(guestRef) : null;
        const catalogDocs = refs.length ? await tx.getAll(...refs) : [];
        const existingReceipt = requestDoc.exists ? receiptData(requestDoc.data(), identity.uid, id) : null;
        if (existingReceipt) {
          if (existingReceipt.payloadHash !== payloadHash || existingReceipt.projectId !== id) throw new ApiError(409, 'PROJECT_REQUEST_CONFLICT', 'Request ID already used for different project details.');
          if (!projectDoc.exists) throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored project request has no project.');
          return { project: parseAccountProject(projectDoc.data(), id, identity.uid), copyReceipt: existingReceipt.copyReceipt };
        }
        if (projectDoc.exists) throw new ApiError(409, 'PROJECT_REQUEST_CONFLICT', 'Project request identity is already in use.');
        const at = iso(this.now());
        const bomItems = this.newProductItems(input.items ?? [], input.requestId, at);
        this.validateCatalogItems(input.items ?? [], refs, catalogDocs);
        const copyReceipt = input.guest ? this.checkGuestReceipt(guestDoc?.exists ? guestDoc.data() : null, input.guest, input.items ?? [], id, input.requestId, identity.uid, bomItems, at) : null;
        const project = parseAccountProject({ ...input.details, id, schemaVersion: 1, customerId: identity.uid, version: 1,
          status: 'draft', bom: { id: 'bom-' + id, projectId: id, items: bomItems, updatedAt: at },
          createdAt: at, updatedAt: at, archivedAt: null }, id, identity.uid);
        tx.create(projectRef, project);
        tx.create(requestRef, { schemaVersion: 1, payloadHash, projectId: id, copyReceipt });
        if (input.guest && guestRef && copyReceipt) tx.create(guestRef, this.guestReceiptData(input.guest, input.items ?? [], copyReceipt, input.requestId, payloadHash));
        return { project, copyReceipt };
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }

  async command(identity: VerifiedIdentity, rawId: string, input: ProjectCommand): Promise<{ project: AccountProject; copyReceipt: GuestListCopyReceipt | null }> {
    if (!uuidPattern.test(rawId)) throw new ApiError(400, 'INVALID_PROJECT_INPUT', 'Enter a valid project ID.');
    try {
      const db = this.database(); const root = db.collection('customers').doc(accountPathId(identity));
      const id = rawId.toLowerCase(); const projectRef = root.collection('projects').doc(id);
      const requestRef = root.collection('projectRequests').doc(input.requestId);
      const guest = input.action === 'add-items' ? input.guest : undefined;
      const guestRef = guest ? this.guestRef(root, guest.listId) : null;
      const itemInputs = input.action === 'add-items' ? input.items : [];
      const refs = this.catalogRefs(db, itemInputs);
      const commandBusiness = { ...input, requestId: undefined, expectedVersion: undefined, guest: undefined };
      const payloadHash = projectHash({ projectId: id, command: commandBusiness,
        guest: guest ? { listId: guest.listId, itemIds: guest.itemIds, items: input.action === 'add-items' ? input.items : [] } : null });
      const tombstoneRef = input.action === 'remove' || input.action === 'restore'
        ? projectRef.collection('removedItems').doc(input.itemId) : null;
      return await db.runTransaction(async tx => {
        const [requestDoc, projectDoc, guestDoc, tombstoneDoc] = await Promise.all([
          tx.get(requestRef), tx.get(projectRef), guestRef ? tx.get(guestRef) : Promise.resolve(null),
          tombstoneRef ? tx.get(tombstoneRef) : Promise.resolve(null),
        ]);
        if (!projectDoc.exists) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
        const current = parseAccountProject(projectDoc.data(), id, identity.uid);
        if (requestDoc.exists) {
          const previous = receiptData(requestDoc.data(), identity.uid, id);
          if (previous.payloadHash !== payloadHash || previous.projectId !== id) throw new ApiError(409, 'PROJECT_REQUEST_CONFLICT', 'Request ID already used for a different project command.');
          return { project: current, copyReceipt: previous.copyReceipt };
        }
        let restoredItem: BomItem | null = null;
        if (input.action === 'restore') {
          if (!tombstoneDoc?.exists) throw new ApiError(404, 'BOM_REMOVED_ITEM_NOT_FOUND', 'Removed BOM item is no longer available to restore.');
          restoredItem = this.parseTombstone(tombstoneDoc.data(), identity.uid, id, input.itemId);
        } else if (input.action === 'remove' && tombstoneDoc?.exists) {
          throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored removed BOM item conflicts with the current project.');
        }
        if (current.status !== 'draft') throw new ApiError(409, 'PROJECT_NOT_EDITABLE', 'This project is not editable.');
        if (current.version !== input.expectedVersion) throw new ApiError(409, 'PROJECT_CHANGED', 'Project changed. Reload before continuing.');
        if (current.version >= Number.MAX_SAFE_INTEGER - 1) throw new ApiError(409, 'PROJECT_CHANGED', 'Project version needs review.');
        const validatedInputs = input.action === 'restore' && restoredItem?.kind === 'store-product'
          ? [{ product: restoredItem.product, quantity: restoredItem.quantity }] : itemInputs;
        const catalogRefs = input.action === 'restore' ? this.catalogRefs(db, validatedInputs) : refs;
        const catalogDocs = catalogRefs.length ? await tx.getAll(...catalogRefs) : [];
        this.validateCatalogItems(validatedInputs, catalogRefs, catalogDocs);
        const at = iso(this.now());
        const changed = this.applyCommand(current, input, at, restoredItem);
        if (changed.bom.items.length > 200) throw new ApiError(400, 'PROJECT_ITEM_LIMIT', 'A project can contain at most 200 BOM items.');
        const newProject = parseAccountProject({ ...current, version: current.version + 1, updatedAt: at,
          bom: { ...changed.bom, updatedAt: at } }, id, identity.uid);
        const copyReceipt = guest ? this.checkGuestReceipt(guestDoc?.exists ? guestDoc.data() : null, guest, input.action === 'add-items' ? input.items : [], id, input.requestId, identity.uid, changed.newItems, at) : null;
        tx.set(projectRef, newProject);
        tx.create(requestRef, { schemaVersion: 1, payloadHash, projectId: id, copyReceipt });
        if (input.action === 'remove' && tombstoneRef && changed.removedItem) {
          tx.create(tombstoneRef, { schemaVersion: 1, customerId: identity.uid, projectId: id, item: changed.removedItem, removedAt: at });
        }
        if (input.action === 'restore' && tombstoneRef) tx.delete(tombstoneRef);
        if (guest && guestRef && copyReceipt) tx.create(guestRef, this.guestReceiptData(guest, input.action === 'add-items' ? input.items : [], copyReceipt, input.requestId, payloadHash));
        return { project: newProject, copyReceipt };
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }

  async setActive(identity: VerifiedIdentity, input: ActiveProjectInput): Promise<{ activeProjectId: string | null; preferencesVersion: number | null }> {
    try {
      const db = this.database(); const root = db.collection('customers').doc(accountPathId(identity));
      const prefsRef = root.collection('preferences').doc('current'); const receiptRef = root.collection('preferenceRequests').doc(input.requestId);
      const projectRef = input.activeProjectId ? root.collection('projects').doc(input.activeProjectId) : null;
      const payloadHash = projectHash({ activeProjectId: input.activeProjectId });
      return await db.runTransaction(async tx => {
        const receiptDoc = await tx.get(receiptRef); const prefsDoc = await tx.get(prefsRef);
        const activeDoc = projectRef ? await tx.get(projectRef) : null;
        const previous = prefsDoc.exists ? parsePreferences(prefsDoc.data(), identity.uid) : null;
        if (receiptDoc.exists) {
          const data = this.activeReceipt(receiptDoc.data());
          if (data.payloadHash !== payloadHash) throw new ApiError(409, 'PROJECT_REQUEST_CONFLICT', 'Request ID already used for different preferences.');
          return { activeProjectId: previous?.activeProjectId ?? null, preferencesVersion: previous?.version ?? null };
        }
        if ((previous?.version ?? null) !== input.expectedVersion) throw new ApiError(409, 'PREFERENCES_CHANGED', 'Project preferences changed. Reload before continuing.');
        if (input.activeProjectId) {
          if (!activeDoc?.exists) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
          const activeProject = parseAccountProject(activeDoc.data(), input.activeProjectId, identity.uid);
          if (activeProject.status !== 'draft') throw new ApiError(409, 'PROJECT_NOT_EDITABLE', 'Choose an editable project.');
        }
        const nextVersion = (previous?.version ?? 0) + 1;
        if (!validVersion(nextVersion)) throw new ApiError(409, 'PREFERENCES_CHANGED', 'Project preferences need review.');
        const record: Preferences = { schemaVersion: 1, customerId: identity.uid, version: nextVersion, activeProjectId: input.activeProjectId, updatedAt: iso(this.now()) };
        tx.set(prefsRef, record);
        tx.create(receiptRef, { schemaVersion: 1, payloadHash, activeProjectId: input.activeProjectId, preferencesVersion: nextVersion });
        return { activeProjectId: record.activeProjectId, preferencesVersion: record.version };
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }

  private projectRef(identity: VerifiedIdentity, id: string): DocumentReference {
    return this.database().collection('customers').doc(accountPathId(identity)).collection('projects').doc(id);
  }
  private guestRef(root: FirebaseFirestore.DocumentReference, listId: string): DocumentReference {
    return root.collection('guestCopies').doc(sha256(listId));
  }
  private catalogRefs(db: Firestore, items: readonly ItemInput[]): DocumentReference[] {
    return [...new Set(items.map(item => item.product.productId))].map(id => db.collection('publishedProducts').doc(id));
  }
  private validateCatalogItems(items: readonly ItemInput[], refs: readonly DocumentReference[], docs: readonly FirebaseFirestore.DocumentSnapshot[]): void {
    const byId = new Map(refs.map((ref, index) => [ref.id, docs[index]]));
    for (const item of items) {
      const doc = byId.get(item.product.productId);
      if (!doc?.exists) throw new ApiError(400, 'PRODUCT_UNAVAILABLE', 'Choose an available published product and sellable unit.');
      const product = parsePublishedProduct(doc.data(), doc.id);
      if (product.unitCode !== item.product.unitCode || item.product.variantId !== null) throw new ApiError(400, 'PRODUCT_UNIT_UNAVAILABLE', 'Choose a published sellable unit.');
    }
  }
  private newProductItems(items: readonly ItemInput[], requestId: string, at: string): StoreBomItem[] {
    return items.map((input, index) => ({ id: 'product-' + deterministicUuid(['bom-item', requestId, index]), kind: 'store-product', product: input.product,
      quantity: input.quantity, createdAt: at, updatedAt: at }));
  }
  private applyCommand(project: AccountProject, command: ProjectCommand, at: string, restoredItem: BomItem | null): { bom: AccountProject['bom']; newItems: BomItem[]; removedItem: BomItem | null } {
    const items = [...project.bom.items]; let newItems: BomItem[] = []; let removedItem: BomItem | null = null;
    if (command.action === 'add-items') {
      newItems = this.newProductItems(command.items, command.requestId, at);
      if (newItems.some(item => items.some(existing => existing.id === item.id))) throw new ApiError(409, 'PROJECT_REQUEST_CONFLICT', 'BOM item identity is already in use.');
      items.push(...newItems);
    } else if (command.action === 'free-text') {
      const index = command.itemId ? items.findIndex(item => item.id === command.itemId) : -1;
      if (command.itemId && (index < 0 || items[index]!.kind !== 'free-text')) throw new ApiError(404, 'BOM_ITEM_NOT_FOUND', 'Free-text BOM item not found.');
      const old = index >= 0 ? items[index] as Extract<BomItem, { kind: 'free-text' }> : null;
      const input = command.input as FreeTextCommand['input'];
      const id = command.itemId ?? 'text-' + deterministicUuid(['bom-text', command.requestId]);
      const metadata = parseFreeTextProtectionMetadata(input.componentCategory ?? old?.componentCategory,
        input.componentProtectionType ?? old?.componentProtectionType, input.amperage ?? old?.amperage);
      const item: BomItem = { id, kind: 'free-text', title: input.title, description: input.description, unit: input.unit,
        quantity: input.quantity, notes: input.notes, ...metadata,
        estimate: { kind: 'unpriced' }, createdAt: old?.createdAt ?? at, updatedAt: at };
      if (index >= 0) items[index] = item; else { if (items.some(existing => existing.id === id)) throw new ApiError(409, 'PROJECT_REQUEST_CONFLICT', 'BOM item identity is already in use.'); items.push(item); }
      newItems = [item];
    } else if (command.action === 'quantity') {
      const index = items.findIndex(item => item.id === command.itemId); if (index < 0) throw new ApiError(404, 'BOM_ITEM_NOT_FOUND', 'BOM item not found.');
      items[index] = { ...items[index]!, quantity: command.quantity, updatedAt: at };
    } else if (command.action === 'remove') {
      const index = items.findIndex(item => item.id === command.itemId); if (index < 0) throw new ApiError(404, 'BOM_ITEM_NOT_FOUND', 'BOM item not found.');
      removedItem = items[index]!; items.splice(index, 1);
    } else {
      const restore = command as RestoreCommand;
      if (!restoredItem) throw new ApiError(404, 'BOM_REMOVED_ITEM_NOT_FOUND', 'Removed BOM item is no longer available to restore.');
      if (items.some(item => item.id === restore.itemId)) throw new ApiError(409, 'BOM_ITEM_EXISTS', 'BOM item already exists.');
      const restored = { ...restoredItem, updatedAt: at };
      items.splice(Math.min(restore.index, items.length), 0, { ...restored, updatedAt: at }); newItems = [restored];
    }
    if (new Set(items.map(item => item.id)).size !== items.length) throw new ApiError(409, 'BOM_ITEM_EXISTS', 'BOM item already exists.');
    return { bom: { ...project.bom, items, updatedAt: at }, newItems, removedItem };
  }
  private parseTombstone(value: unknown, customerId: string, projectId: string, expectedItemId: string): BomItem {
    if (!projectObject(value) || Object.keys(value).sort().join(',') !== 'customerId,item,projectId,removedAt,schemaVersion'
      || value['schemaVersion'] !== 1 || value['customerId'] !== customerId || value['projectId'] !== projectId || !isoDate(value['removedAt'])) {
      throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored removed BOM item needs review.');
    }
    const item = parseBomItem(value['item']);
    if (item.id !== expectedItemId) throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored removed BOM item identity needs review.');
    return item;
  }
  private checkGuestReceipt(existing: unknown, guest: GuestCopyInput, inputs: readonly ItemInput[], projectId: string, requestId: string, customerId: string, destination: readonly BomItem[], at: string): GuestListCopyReceipt {
    const normalizedHash = plainHash({ listId: guest.listId, itemIds: guest.itemIds, items: inputs });
    if (existing !== null) {
      if (!projectObject(existing) || Object.keys(existing).sort().join(',') !== 'customerId,listId,payloadHash,projectId,receipt,requestId,schemaVersion'
        || existing['schemaVersion'] !== 1 || existing['customerId'] !== customerId || existing['listId'] !== guest.listId
        || existing['payloadHash'] !== normalizedHash || existing['projectId'] !== projectId || existing['requestId'] !== requestId
        || !validCopyReceipt(existing['receipt'])) throw new ApiError(409, 'GUEST_LIST_ALREADY_COPIED', 'This cart was already copied to another project or changed.');
      return existing['receipt'];
    }
    if (guest.itemIds.length !== destination.length) throw new ApiError(400, 'INVALID_GUEST_COPY', 'Reviewed cart rows do not match the selected products.');
    return { id: 'copy-' + deterministicUuid(['guest-copy', customerId, guest.listId]), listId: guest.listId, customerId, projectId, copiedAt: at, idempotencyKey: requestId,
      itemMappings: guest.itemIds.map((guestItemId, index) => ({ guestItemId, destinationBomItemId: destination[index]!.id })) };
  }
  private guestReceiptData(guest: GuestCopyInput, items: readonly ItemInput[], receipt: GuestListCopyReceipt, requestId: string, _requestPayloadHash: string): unknown {
    return { schemaVersion: 1, customerId: receipt.customerId, listId: guest.listId, payloadHash: plainHash({ listId: guest.listId, itemIds: guest.itemIds, items }), projectId: receipt.projectId, requestId, receipt };
  }
  private activeReceipt(value: unknown): { payloadHash: string } {
    if (!projectObject(value) || Object.keys(value).sort().join(',') !== 'activeProjectId,payloadHash,preferencesVersion,schemaVersion'
      || value['schemaVersion'] !== 1 || typeof value['payloadHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['payloadHash'])
      || (value['activeProjectId'] !== null && (typeof value['activeProjectId'] !== 'string' || !uuidPattern.test(value['activeProjectId'])))
      || !validVersion(value['preferencesVersion'])) throw new ApiError(503, 'PROJECT_DATA_INVALID', 'Stored preference request needs review.');
    return { payloadHash: value['payloadHash'] };
  }
  private sanitize(error: unknown): ApiError {
    return error instanceof ApiError ? error : new ApiError(503, 'PROJECT_UNAVAILABLE', 'Project storage is temporarily unavailable.');
  }
}

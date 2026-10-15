import { computed, Inject, Injectable, Optional, Signal, signal } from '@angular/core';
import {
  BomItem, INSTALLATION_TYPES, isPlanningQuantity, isValidFreeTextProtectionMetadata, NewProjectDraft, Project,
  PROJECT_CLASSIFICATIONS, ProjectDetails, SYSTEM_CONFIGURATIONS, WORK_SCOPES, GuestEquipmentList, GuestEquipmentListHistory,
} from './models';
import { FreeTextInput, PendingProduct, validateFreeText, validPendingProduct } from './project-bom';
import { PLANNING_PRODUCTS } from './product-source';
import { Product } from './models';
import { ACCOUNT_PROJECT_STORE, AccountGuestCopy, AccountProjectAction, AccountProjectStore, ProjectListQuery, ProjectManagementAction } from './account-project.service';
import { StoreApiError } from './store-api.service';
import { emptyGuestList, guestListFingerprint, LEGACY_DRAFT_KEY, migrateGuestList, PendingGuestList, validGuestHistory } from './guest-lists';

export const LOCAL_PROJECTS_KEY = 'solar.projects.preview.v1';
export const LOCAL_CUSTOMER_ID = 'local-preview';
export type ProjectWriteResult = { readonly ok: true } | { readonly ok: false; readonly message: string };
export type CreateProjectResult = { readonly ok: true; readonly project: Project } | { readonly ok: false; readonly message: string };
export type ProjectInputErrors = Partial<Record<keyof NewProjectDraft, string>>;

const optionalLimits = { classificationOther: 240, installationOther: 240, location: 240, description: 2000, notes: 2000 } as const;

/** Both the wizard and local persistence validate inputs; no field defaults except Rooftop. */
export function validateProjectInput(input: NewProjectDraft): ProjectInputErrors {
  const errors: ProjectInputErrors = {};
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) errors.name = 'Enter a project name (1-120 characters).';
  if (!PROJECT_CLASSIFICATIONS.includes(input.classification!)) errors.classification = 'Choose a classification.';
  if (!INSTALLATION_TYPES.includes(input.installation)) errors.installation = 'Choose an installation type.';
  if (!SYSTEM_CONFIGURATIONS.includes(input.configuration!)) errors.configuration = 'Choose a system configuration.';
  if (!WORK_SCOPES.includes(input.workScope!)) errors.workScope = 'Choose a work scope.';
  for (const [field, limit] of Object.entries(optionalLimits)) {
    const key = field as keyof typeof optionalLimits;
    const value = input[key];
    if (value !== undefined && (typeof value !== 'string' || value.trim().length > limit)) errors[key] = `Use no more than ${limit} characters.`;
  }
  return errors;
}

function details(input: NewProjectDraft): ProjectDetails {
  const fields: Record<string, string> = {};
  for (const field of Object.keys(optionalLimits) as (keyof typeof optionalLimits)[]) {
    const text = input[field]?.trim();
    if (text && (field !== 'classificationOther' || input.classification === 'other') && (field !== 'installationOther' || input.installation === 'other')) fields[field] = text;
  }
  return { name: input.name.trim(), classification: input.classification!, installation: input.installation, configuration: input.configuration!, workScope: input.workScope!, ...fields };
}

interface LocalProjectState {
  readonly schemaVersion: 1;
  readonly customerId: typeof LOCAL_CUSTOMER_ID;
  readonly projects: readonly Project[];
  readonly activeProjectId: string | null;
  readonly guestHistory?: GuestEquipmentListHistory;
}
const emptyState = (): LocalProjectState => ({ schemaVersion: 1, customerId: LOCAL_CUSTOMER_ID, projects: [], activeProjectId: null });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const timestamp = (value: unknown): value is string => text(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

function validBomItem(value: unknown): value is BomItem {
  if (!record(value) || !text(value['id']) || !isPlanningQuantity(value['quantity']) || !timestamp(value['createdAt']) || !timestamp(value['updatedAt']) || (value['notes'] !== undefined && typeof value['notes'] !== 'string')) return false;
  if (value['kind'] === 'store-product') {
    const product = value['product'];
    return value['componentCategory'] === undefined && value['componentProtectionType'] === undefined && value['amperage'] === undefined && record(product) && text(product['productId']) && text(product['unitCode']) && (product['variantId'] === null || text(product['variantId']));
  }
  if (value['kind'] !== 'free-text' || !text(value['title']) || typeof value['description'] !== 'string' || !text(value['unit']) || !record(value['estimate'])) return false;
  if (!isValidFreeTextProtectionMetadata(value)) return false;
  const estimate = value['estimate'];
  if (estimate['kind'] === 'unpriced') return true;
  const price = estimate['unitPrice'];
  return estimate['kind'] === 'manual-estimate' && estimate['taxTreatment'] === 'unspecified' && record(price) && price['currency'] === 'PHP' && Number.isSafeInteger(price['amountMinor']) && (price['amountMinor'] as number) >= 0;
}

function validProject(value: unknown): value is Project {
  if (!record(value) || value['schemaVersion'] !== 1 || value['customerId'] !== LOCAL_CUSTOMER_ID || !text(value['id']) || !timestamp(value['createdAt']) || !timestamp(value['updatedAt'])) return false;
  if (Object.keys(validateProjectInput(value as unknown as NewProjectDraft)).length) return false;
  if (value['status'] !== 'draft' && value['status'] !== 'archived') return false;
  if (value['status'] === 'draft' ? value['archivedAt'] !== null : !timestamp(value['archivedAt'])) return false;
  const bom = value['bom'];
  if (!record(bom) || !text(bom['id']) || bom['projectId'] !== value['id'] || !timestamp(bom['updatedAt']) || !Array.isArray(bom['items']) || !bom['items'].every(validBomItem)) return false;
  return new Set(bom['items'].map(item => item.id)).size === bom['items'].length;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  constructor(
    @Inject(PLANNING_PRODUCTS) readonly products: Signal<readonly Product[]> = signal<readonly Product[]>([]),
    @Optional() @Inject(ACCOUNT_PROJECT_STORE) private readonly accountStore: AccountProjectStore | null = null,
  ) {}
  private readonly problem = signal<string | null>(null);
  readonly accountBacked = computed(() => !!this.accountStore?.accountBacked());
  readonly error = computed(() => this.accountStore ? this.accountStore.error() : this.problem());
  readonly loading = computed(() => this.accountStore?.loading() ?? false);
  readonly nextCursor = computed(() => this.accountStore?.nextCursor() ?? null);
  private lastStored: string | null = null;
  private restoreBlocked = false;
  private guestBlocked = false;
  private legacyBeforeMigration: string | null | undefined = undefined;
  private readonly state = signal<LocalProjectState>(this.restore());
  readonly projects = computed<readonly Project[]>(() => this.accountStore ? this.accountStore.projects() : this.state().projects);
  readonly activeProject = computed<Project | null>(() => this.accountStore
    ? this.accountStore.activeProject()
    : this.projects().find(project => project.id === this.state().activeProjectId && project.status === 'draft') ?? null);
  readonly guestHistory = computed(() => this.state().guestHistory ?? null);
  readonly currentGuestList = computed(() => this.guestHistory()?.lists.find(list => list.id === this.guestHistory()?.currentListId) ?? null);

  refresh(): Promise<void> { return this.accountStore?.refresh() ?? Promise.resolve(); }
  loadMore(): Promise<void> { return this.accountStore?.loadMore() ?? Promise.resolve(); }
  async fetchPage(query: ProjectListQuery, cursor: string | null = null): Promise<{ items: readonly Project[]; nextCursor: string | null; activeProjectId: string | null; preferencesVersion: number | null }> {
    if (this.accountStore) return this.accountStore.queryPage(query, cursor);
    const filtered = this.projects().filter(project =>
      (!query.search || [project.name, project.location ?? ''].some(value => value.toLowerCase().includes(query.search!.trim().toLowerCase())))
      && (!query.status || project.status === query.status) && (!query.classification || project.classification === query.classification)
      && (!query.configuration || project.configuration === query.configuration) && (!query.workScope || project.workScope === query.workScope));
    const start = cursor ? Math.max(0, filtered.findIndex(project => project.id === cursor) + 1) : 0;
    const items = filtered.slice(start, start + (query.limit ?? 10));
    return { items, nextCursor: start + items.length < filtered.length ? items.at(-1)?.id ?? null : null,
      activeProjectId: this.activeProject()?.id ?? null, preferencesVersion: null };
  }
  async updateProject(id: string, input: NewProjectDraft, requestId: string, expectedVersion?: number): Promise<ProjectWriteResult> {
    if (Object.keys(validateProjectInput(input)).length) return this.fail('Complete the required project fields.');
    return this.manageForAccount(id, requestId, { action: 'edit-details', details: details(input) }, expectedVersion);
  }
  async archiveProject(id: string, requestId: string, expectedVersion?: number): Promise<ProjectWriteResult> {
    return this.manageForAccount(id, requestId, { action: 'archive-project' }, expectedVersion);
  }
  async restoreProject(id: string, requestId: string, expectedVersion?: number): Promise<ProjectWriteResult> {
    return this.manageForAccount(id, requestId, { action: 'restore-project' }, expectedVersion);
  }
  async duplicateProject(id: string, requestId: string, expectedVersion?: number): Promise<CreateProjectResult> {
    if (!this.accountStore?.accountBacked()) return this.fail('Sign in with your account before duplicating a project.');
    try { const project = await this.accountStore.manageProject(id, requestId, { action: 'duplicate-project' }, expectedVersion); return { ok: true, project }; }
    catch (error) { return this.fail(this.message(error)); }
  }
  private async manageForAccount(id: string, requestId: string, action: ProjectManagementAction, expectedVersion?: number): Promise<ProjectWriteResult> {
    if (!this.accountStore?.accountBacked()) return this.fail('Sign in with your account before editing a project.');
    try { await this.accountStore.manageProject(id, requestId, action, expectedVersion); return { ok: true }; }
    catch (error) { return this.fail(this.message(error)); }
  }
  async loadProject(id: string): Promise<Project | null> {
    if (this.accountStore) return this.accountStore.accountBacked() ? this.accountStore.loadProject(id) : null;
    return this.projects().find(project => project.id === id) ?? null;
  }

  /** Lazy, write-free migration. The first successful transaction persists identity/history. */
  ensureGuestLists(): void {
    if (this.guestHistory() || this.guestBlocked || this.restoreBlocked) return;
    try {
      this.legacyBeforeMigration = localStorage.getItem(LEGACY_DRAFT_KEY);
      this.state.update(state => ({ ...state, guestHistory: migrateGuestList(this.legacyBeforeMigration!) }));
    } catch {
      this.guestBlocked = true;
      this.problem.set('Local cart could not be loaded. Original data has been preserved; recover it and reload before editing.');
    }
  }

  setGuestQuantity(productId: string, quantity: number): ProjectWriteResult {
    this.ensureGuestLists();
    const list = this.currentGuestList();
    if (!list || !isPlanningQuantity(quantity)) return this.fail('Enter a positive safe whole quantity in an available local list.');
    const existing = list.items.find(item => item.product.productId === productId);
    const product = this.products().find(candidate => candidate.id === productId);
    if (!existing && !product) return this.fail('Choose a catalog product.');
    const item = existing ? { ...existing, quantity } : { id: `guest-item-${crypto.randomUUID()}`, kind: 'store-product' as const, product: { productId: product!.id, variantId: null, unitCode: product!.unit }, quantity };
    return this.saveGuestList({ ...list, items: existing ? list.items.map(i => i.id === existing.id ? item : i) : [...list.items, item], updatedAt: new Date().toISOString() });
  }
  removeGuestItem(productId: string): ProjectWriteResult {
    this.ensureGuestLists();
    const list = this.currentGuestList();
    if (!list) return this.fail('No editable local cart is available.');
    return this.saveGuestList({ ...list, items: list.items.filter(i => i.product.productId !== productId), updatedAt: new Date().toISOString() });
  }
  startNewGuestList(requestId: string): ProjectWriteResult {
    this.ensureGuestLists();
    const history = this.guestHistory();
    if (!history || !this.currentGuestList() || !this.validRequest(requestId)) return this.fail('No local cart is available.');
    const id = `guest-${requestId}`;
    if (history.lists.some(list => list.id === id)) return history.currentListId === id ? { ok: true } : this.fail('This new-list request has already completed. Reopen that list from history.');
    if (this.currentGuestList()!.state !== 'linked') return this.fail('Link the current cart before starting a new one.');
    return this.commit({ ...this.state(), guestHistory: { currentListId: id, lists: [...history.lists, emptyGuestList(id)] } });
  }
  reopenGuestList(listId: string): ProjectWriteResult {
    this.ensureGuestLists();
    const history = this.guestHistory();
    if (!history?.lists.some(list => list.id === listId)) return this.fail('This local list is unavailable.');
    return this.commit({ ...this.state(), guestHistory: { ...history, currentListId: listId } });
  }
  copyGuestList(projectId: string, pending: PendingGuestList, requestId: string): ProjectWriteResult | Promise<ProjectWriteResult> {
    if (this.accountStore) return this.copyGuestListForAccount(projectId, pending);
    const project = this.editable(projectId);
    if (!project || !this.validRequest(requestId)) return this.fail('Choose an editable local project.');
    const reviewed = this.reviewGuest(pending, projectId, requestId);
    if (!reviewed.ok) return reviewed;
    if (reviewed.list.state === 'linked') return { ok: true }; // Only identical retry is accepted.
    const copied = this.copyInto(project, reviewed.list, requestId);
    return this.commit({ ...this.state(), projects: this.projects().map(p => p.id === projectId ? copied.project : p), guestHistory: copied.history });
  }
  createFromGuestList(input: NewProjectDraft, requestId: string, pending: PendingGuestList): CreateProjectResult | Promise<CreateProjectResult> {
    if (this.accountStore) return this.createFromGuestListForAccount(input, pending);
    if (Object.keys(validateProjectInput(input)).length || !this.validRequest(requestId)) return this.fail('Complete the required project fields.');
    const id = `preview-${requestId}`;
    const reviewed = this.reviewGuest(pending, id, requestId);
    if (!reviewed.ok) return reviewed;
    const existing = this.projects().find(p => p.id === id);
    if (reviewed.list.state === 'linked') return existing ? { ok: true, project: existing } : this.fail('The linked project is no longer available.');
    if (existing) return this.fail('This request identity is already used. Reopen the wizard.');
    const now = new Date().toISOString();
    const project: Project = { ...details(input), id, schemaVersion: 1, customerId: LOCAL_CUSTOMER_ID, status: 'draft', archivedAt: null, createdAt: now, updatedAt: now, bom: { id: `bom-${id}`, projectId: id, items: [], updatedAt: now } };
    const copied = this.copyInto(project, reviewed.list, requestId);
    const written = this.commit({ ...this.state(), projects: [...this.projects(), copied.project], guestHistory: copied.history });
    return written.ok ? { ok: true, project: copied.project } : written;
  }
  private reviewGuest(pending: PendingGuestList, projectId: string, requestId: string): { ok: true; list: GuestEquipmentList } | { ok: false; message: string } {
    this.ensureGuestLists();
    const list = this.currentGuestList();
    if (!list || list.id !== pending.listId) return this.fail('The current cart changed. Reopen Add to project to review it.');
    if (list.state === 'linked') {
      const receipt = list.copyReceipt;
      return receipt.customerId === LOCAL_CUSTOMER_ID && receipt.projectId === projectId && receipt.idempotencyKey === requestId ? { ok: true, list } : this.fail('This list is already linked and cannot be copied again. Start a new cart.');
    }
    if (!list.items.length || guestListFingerprint(list) !== pending.fingerprint) return this.fail('The cart changed or is empty. Reopen Add to project to review all rows.');
    if (!list.items.every(item => validPendingProduct(item, this.products()))) return this.fail('Some products or sellable units are unavailable. No rows were copied. Resolve or explicitly remove those rows, then review the list again.');
    return { ok: true, list };
  }
  private copyInto(project: Project, list: GuestEquipmentList, requestId: string): { project: Project; history: GuestEquipmentListHistory } {
    const now = new Date().toISOString();
    const lines = list.items.map(item => ({ ...this.productItem(item, crypto.randomUUID(), now) }));
    const linked: GuestEquipmentList = { ...list, state: 'linked', updatedAt: now, copyReceipt: { id: `copy-${requestId}`, listId: list.id, customerId: LOCAL_CUSTOMER_ID, projectId: project.id, copiedAt: now, idempotencyKey: requestId, itemMappings: list.items.map((item, index) => ({ guestItemId: item.id, destinationBomItemId: lines[index].id })) } };
    return { project: { ...project, updatedAt: now, bom: { ...project.bom, items: [...project.bom.items, ...lines], updatedAt: now } }, history: { ...this.guestHistory()!, lists: this.guestHistory()!.lists.map(l => l.id === list.id ? linked : l) } };
  }
  private saveGuestList(list: GuestEquipmentList): ProjectWriteResult {
    return this.commit({ ...this.state(), guestHistory: { ...this.guestHistory()!, lists: this.guestHistory()!.lists.map(l => l.id === list.id ? list : l) } });
  }
  create(input: NewProjectDraft, requestId: string, initialProduct?: PendingProduct): CreateProjectResult | Promise<CreateProjectResult> {
    if (this.accountStore) return this.createForAccount(input, requestId, initialProduct);
    if (this.restoreBlocked) return this.fail('Stored local projects could not be loaded. Reload after recovering the original data; no data was overwritten.');
    if (Object.keys(validateProjectInput(input)).length) return this.fail('Complete the required project fields and check their lengths.');
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(requestId)) return this.fail('The creation request is invalid. Reopen the wizard.');
    if (initialProduct && !validPendingProduct(initialProduct, this.products())) return this.fail('The selected product or quantity is unavailable. Check the catalog and retry.');
    const id = `preview-${requestId}`;
    const existing = this.projects().find(project => project.id === id);
    if (existing) return { ok: true, project: existing }; // Same wizard request cannot create a second project.
    const now = new Date().toISOString();
    const project: Project = {
      ...details(input), id, schemaVersion: 1, customerId: LOCAL_CUSTOMER_ID,
      status: 'draft', archivedAt: null, createdAt: now, updatedAt: now,
      bom: { id: `bom-${id}`, projectId: id, items: initialProduct ? [this.productItem(initialProduct, requestId, now)] : [], updatedAt: now },
    };
    const written = this.commit({ ...this.state(), projects: [...this.projects(), project] });
    return written.ok ? { ok: true, project } : written;
  }

  setActive(id: string | null): ProjectWriteResult | Promise<ProjectWriteResult> {
    if (this.accountStore) return this.setActiveForAccount(id);
    if (id !== null && !this.projects().some(project => project.id === id && project.status === 'draft')) return this.fail('Choose an editable local project.');
    return this.commit({ ...this.state(), activeProjectId: id });
  }

  addProduct(projectId: string, pending: PendingProduct, requestId: string): ProjectWriteResult | Promise<ProjectWriteResult> {
    if (this.accountStore) return this.commandForAccount(projectId, requestId, { action: 'add-items', items: [pending] });
    const project = this.editable(projectId);
    if (!project) return this.fail('Choose an editable local project.');
    if (!this.validRequest(requestId) || !validPendingProduct(pending, this.products())) return this.fail('Choose an available product and a positive safe whole quantity. Stock does not limit planning.');
    const now = new Date().toISOString();
    const item = this.productItem(pending, requestId, now);
    if (project.bom.items.some(line => line.id === item.id)) return { ok: true };
    return this.replaceItems(project, [...project.bom.items, item]);
  }

  saveFreeText(projectId: string, input: FreeTextInput, requestId: string, itemId?: string): ProjectWriteResult | Promise<ProjectWriteResult> {
    if (this.accountStore) return this.commandForAccount(projectId, requestId, { action: 'free-text', ...(itemId ? { itemId } : {}), input });
    const project = this.editable(projectId);
    if (!project) return this.fail('Choose an editable local project.');
    if (!this.validRequest(requestId) || Object.keys(validateFreeText(input)).length) return this.fail('Check the item name, unit, quantity, and text lengths.');
    const existing = itemId ? project.bom.items.find(item => item.id === itemId) : undefined;
    if (itemId && existing?.kind !== 'free-text') return this.fail('This free-text line is no longer available. Close and reopen the editor.');
    const id = itemId ?? `text-${requestId}`;
    if (!itemId && project.bom.items.some(item => item.id === id)) return { ok: true };
    const now = new Date().toISOString();
    const metadata = {
      componentCategory: input.componentCategory ?? (existing?.kind === 'free-text' ? existing.componentCategory : undefined),
      componentProtectionType: input.componentProtectionType ?? (existing?.kind === 'free-text' ? existing.componentProtectionType : undefined),
      amperage: input.amperage ?? (existing?.kind === 'free-text' ? existing.amperage : undefined),
    };
    if (!isValidFreeTextProtectionMetadata(metadata)) return this.fail('Check the protection type and amperage.');
    const item: BomItem = { kind: 'free-text', id, title: input.title.trim(), description: input.description.trim(), unit: input.unit.trim(), quantity: input.quantity, notes: input.notes.trim(), estimate: existing?.kind === 'free-text' ? existing.estimate : { kind: 'unpriced' }, createdAt: existing?.createdAt ?? now, updatedAt: now, ...metadata };
    return this.replaceItems(project, itemId ? project.bom.items.map(line => line.id === itemId ? item : line) : [...project.bom.items, item]);
  }

  setItemQuantity(projectId: string, itemId: string, quantity: number): ProjectWriteResult | Promise<ProjectWriteResult> {
    if (this.accountStore) return this.commandForAccount(projectId, crypto.randomUUID(), { action: 'quantity', itemId, quantity });
    const project = this.editable(projectId);
    if (!project || !project.bom.items.some(item => item.id === itemId)) return this.fail('This editable BOM line is unavailable.');
    if (!isPlanningQuantity(quantity)) return this.fail('Enter a positive safe whole quantity. Stock does not limit planning.');
    return this.replaceItems(project, project.bom.items.map(item => item.id === itemId ? { ...item, quantity, updatedAt: new Date().toISOString() } : item));
  }

  removeItem(projectId: string, itemId: string): ProjectWriteResult | Promise<ProjectWriteResult> {
    if (this.accountStore) return this.commandForAccount(projectId, crypto.randomUUID(), { action: 'remove', itemId });
    const project = this.editable(projectId);
    if (!project || !project.bom.items.some(item => item.id === itemId)) return this.fail('This editable BOM line is unavailable.');
    return this.replaceItems(project, project.bom.items.filter(item => item.id !== itemId));
  }

  restoreItem(projectId: string, item: BomItem, index: number): ProjectWriteResult | Promise<ProjectWriteResult> {
    if (this.accountStore) {
      if (item.kind === 'free-text' && item.estimate.kind !== 'unpriced') return Promise.resolve(this.fail('Manual estimates cannot be restored to an account project.'));
      return this.commandForAccount(projectId, crypto.randomUUID(), { action: 'restore', itemId: item.id, index });
    }
    const project = this.editable(projectId);
    if (!project || !validBomItem(item) || project.bom.items.some(line => line.id === item.id)) return this.fail('This line cannot be restored to the current project.');
    const items = [...project.bom.items];
    items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
    return this.replaceItems(project, items);
  }

  private async createForAccount(input: NewProjectDraft, requestId: string, initialProduct?: PendingProduct): Promise<CreateProjectResult> {
    if (!this.accountStore?.accountBacked()) return this.fail('Sign in with your account before saving a project.');
    if (Object.keys(validateProjectInput(input)).length) return this.fail('Complete the required project fields and check their lengths.');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)
      || initialProduct && !this.validAccountProduct(initialProduct)) return this.fail('Review the request and product, then retry.');
    try {
      const result = await this.accountStore.createProject(details(input), requestId, initialProduct ? [initialProduct] : undefined);
      return { ok: true, project: result.project };
    } catch (error) { return this.fail(this.message(error)); }
  }

  private async createFromGuestListForAccount(input: NewProjectDraft, pending: PendingGuestList): Promise<CreateProjectResult> {
    if (!this.accountStore?.accountBacked()) return this.fail('Sign in with your account before saving a project.');
    if (Object.keys(validateProjectInput(input)).length) return this.fail('Complete the required project fields.');
    const review = this.reviewAccountGuest(pending);
    if (!review.ok) return review;
    const list = review.list;
    const reviewed = this.accountGuestPayload(list);
    try {
      const requestId = await this.accountStore.stableGuestRequestId('new-project', { details: details(input), ...reviewed });
      const items = list.items.map(item => ({ product: item.product, quantity: item.quantity }));
      const result = await this.accountStore.createProject(details(input), requestId, items, reviewed);
      if (!result.copyReceipt || !this.linkAccountGuest(list, result.project, result.copyReceipt)) {
        return this.fail('The server may already have saved this project and cart copy, but the local receipt could not be saved. Retry the same reviewed operation to recover its receipt; your cart remains unchanged until that succeeds.');
      }
      return { ok: true, project: result.project };
    } catch (error) { return this.fail(this.message(error)); }
  }

  private async copyGuestListForAccount(projectId: string, pending: PendingGuestList): Promise<ProjectWriteResult> {
    if (!this.accountStore?.accountBacked()) return this.fail('Sign in with your account before copying a cart.');
    const review = this.reviewAccountGuest(pending);
    if (!review.ok) return review;
    const list = review.list;
    let project = this.accountStore.projects().find(value => value.id === projectId);
    if (!project) project = await this.accountStore.loadProject(projectId) ?? undefined;
    if (!project || project.status !== 'draft') return this.fail('Choose an editable account project.');
    const reviewed = this.accountGuestPayload(list);
    try {
      const requestId = await this.accountStore.stableGuestRequestId(`copy:${projectId}`, reviewed);
      const items = list.items.map(item => ({ product: item.product, quantity: item.quantity }));
      const result = await this.accountStore.command(projectId, requestId, { action: 'add-items', items, guest: reviewed });
      if (!result.copyReceipt || !this.linkAccountGuest(list, result.project, result.copyReceipt)) {
        return this.fail('The server may already have saved this cart copy, but the local receipt could not be saved. Retry the same reviewed operation to recover its receipt; your cart remains unchanged until that succeeds.');
      }
      return { ok: true };
    } catch (error) { return this.fail(this.message(error)); }
  }

  private reviewAccountGuest(pending: PendingGuestList): { ok: true; list: GuestEquipmentList } | { ok: false; message: string } {
    this.ensureGuestLists();
    const list = this.currentGuestList();
    if (!list || list.id !== pending.listId || list.state !== 'unlinked'
      || !list.items.length || list.items.length > 200 || guestListFingerprint(list) !== pending.fingerprint
      || !list.items.every(item => this.validAccountProduct({ product: item.product, quantity: item.quantity }))) {
      return { ok: false, message: 'The cart changed, is empty, or contains an invalid reference. Reopen Add to project and review every row again.' };
    }
    return { ok: true, list };
  }

  private accountGuestPayload(list: GuestEquipmentList): AccountGuestCopy {
    return { listId: list.id, fingerprint: guestListFingerprint(list), itemIds: list.items.map(item => item.id) };
  }

  private linkAccountGuest(list: GuestEquipmentList, project: Project, receipt: NonNullable<GuestEquipmentList['copyReceipt']>): boolean {
    const current = this.currentGuestList();
    if (!current || current.id !== list.id || current.state !== 'unlinked' || guestListFingerprint(current) !== guestListFingerprint(list)
      || receipt.listId !== list.id || receipt.projectId !== project.id || receipt.customerId !== project.customerId
      || receipt.itemMappings.length !== list.items.length
      || !receipt.itemMappings.every((mapping, index) => mapping.guestItemId === list.items[index].id)) return false;
    const linked: GuestEquipmentList = { ...list, state: 'linked', updatedAt: receipt.copiedAt, copyReceipt: receipt };
    return this.commit({ ...this.state(), guestHistory: { ...this.guestHistory()!, lists: this.guestHistory()!.lists.map(value => value.id === list.id ? linked : value) } }).ok;
  }

  private validAccountProduct(pending: PendingProduct): boolean {
    return isPlanningQuantity(pending.quantity) && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(pending.product.productId)
      && pending.product.variantId === null && typeof pending.product.unitCode === 'string' && pending.product.unitCode.length > 0 && pending.product.unitCode.length <= 64;
  }

  private async commandForAccount(projectId: string, requestId: string, command: AccountProjectAction): Promise<ProjectWriteResult> {
    if (!this.accountStore?.accountBacked()) return this.fail('Sign in with your account before editing a project.');
    try { await this.accountStore.command(projectId, requestId, command); return { ok: true }; }
    catch (error) { return this.fail(this.message(error)); }
  }

  private async setActiveForAccount(id: string | null): Promise<ProjectWriteResult> {
    if (!this.accountStore?.accountBacked()) return this.fail('Sign in with your account before changing the active project.');
    try { await this.accountStore.setActiveProject(id); return { ok: true }; }
    catch (error) { return this.fail(this.message(error)); }
  }

  private message(error: unknown): string { return error instanceof StoreApiError ? error.message : 'The account project could not be saved. Retry without changing the reviewed request.'; }

  private editable(id: string): Project | undefined { return this.projects().find(project => project.id === id && project.customerId === LOCAL_CUSTOMER_ID && project.status === 'draft'); }
  private validRequest(id: string): boolean { return /^[a-zA-Z0-9-]{1,80}$/.test(id); }
  private productItem(pending: PendingProduct, requestId: string, now: string): BomItem {
    return { id: `product-${requestId}`, kind: 'store-product', product: { ...pending.product }, quantity: pending.quantity, createdAt: now, updatedAt: now };
  }
  private replaceItems(project: Project, items: readonly BomItem[]): ProjectWriteResult {
    const now = new Date().toISOString();
    const updated = { ...project, updatedAt: now, bom: { ...project.bom, items, updatedAt: now } };
    return this.commit({ ...this.state(), projects: this.projects().map(value => value.id === project.id ? updated : value) });
  }

  private fail(message: string): { ok: false; message: string } { this.problem.set(message); return { ok: false, message }; }

  private commit(state: LocalProjectState): ProjectWriteResult {
    if (this.restoreBlocked) return this.fail('Local project data is unavailable. Reload after recovering the original data.');
    try {
      if (localStorage.getItem(LOCAL_PROJECTS_KEY) !== this.lastStored) return this.fail('Local projects changed in another tab. Reload before saving to avoid overwriting them.');
      if (this.legacyBeforeMigration !== undefined && localStorage.getItem(LEGACY_DRAFT_KEY) !== this.legacyBeforeMigration) return this.fail('The legacy cart changed in another tab. Reload before migrating it.');
      const serialized = JSON.stringify(state);
      localStorage.setItem(LOCAL_PROJECTS_KEY, serialized);
      this.lastStored = serialized;
      this.legacyBeforeMigration = undefined;
      this.state.set(state);
      this.problem.set(null);
      return { ok: true };
    } catch { return this.fail('Could not save local projects and carts in this browser. Your inputs are retained; enable browser storage or free space and retry.'); }
  }

  private restore(): LocalProjectState {
    try {
      this.lastStored = localStorage.getItem(LOCAL_PROJECTS_KEY);
      if (this.lastStored === null) return emptyState();
      const parsed: unknown = JSON.parse(this.lastStored);
      if (!record(parsed) || parsed['schemaVersion'] !== 1 || parsed['customerId'] !== LOCAL_CUSTOMER_ID || !Array.isArray(parsed['projects']) || !parsed['projects'].every(validProject) || (parsed['activeProjectId'] !== null && typeof parsed['activeProjectId'] !== 'string')) throw new Error('Invalid local project envelope');
      const projects = parsed['projects'] as Project[];
      if (parsed['guestHistory'] !== undefined && !validGuestHistory(parsed['guestHistory'])) throw new Error('Invalid cart history');
      if (new Set(projects.map(project => project.id)).size !== projects.length || new Set(projects.map(project => project.bom.id)).size !== projects.length) throw new Error('Duplicate project/BOM identities');
      const activeProjectId = projects.some(project => project.id === parsed['activeProjectId'] && project.status === 'draft') ? parsed['activeProjectId'] as string : null;
      return { schemaVersion: 1, customerId: LOCAL_CUSTOMER_ID, projects, activeProjectId, ...(parsed['guestHistory'] !== undefined ? { guestHistory: parsed['guestHistory'] as GuestEquipmentListHistory } : {}) };
    } catch {
      this.restoreBlocked = true;
      this.problem.set('Local project data could not be loaded. The original stored data has been preserved; reload after recovering it.');
      return emptyState();
    }
  }
}

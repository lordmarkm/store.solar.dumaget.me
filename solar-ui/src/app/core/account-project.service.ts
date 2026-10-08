import { computed, effect, inject, Injectable, InjectionToken, Signal, signal } from '@angular/core';
import { BomItem, GuestListCopyReceipt, ProductReference, Project, ProjectDetails, ProjectStatus, isPlanningQuantity } from './models';
import { PendingProduct } from './project-bom';
import { AuthSessionService } from './auth-session.service';
import { PublicCatalogService } from './public-catalog.service';
import { ProjectApiPath, StoreApiError, StoreApiService } from './store-api.service';

export interface AccountProject extends Project { readonly version: number }
export interface AccountProjectPage {
  readonly items: readonly AccountProject[];
  readonly nextCursor: string | null;
  readonly activeProjectId: string | null;
  readonly preferencesVersion: number | null;
}
export interface AccountGuestCopy {
  readonly listId: string;
  readonly fingerprint: string;
  readonly itemIds: readonly string[];
}
export type AccountProjectAction =
  | { readonly action: 'add-items'; readonly items: readonly PendingProduct[]; readonly guest?: AccountGuestCopy }
  | { readonly action: 'free-text'; readonly itemId?: string; readonly input: { readonly title: string; readonly description: string; readonly unit: string; readonly quantity: number; readonly notes: string } }
  | { readonly action: 'quantity'; readonly itemId: string; readonly quantity: number }
  | { readonly action: 'remove'; readonly itemId: string }
  | { readonly action: 'restore'; readonly itemId: string; readonly index: number };

export interface AccountProjectStore {
  readonly accountBacked: Signal<boolean>;
  readonly projects: Signal<readonly AccountProject[]>;
  readonly activeProject: Signal<AccountProject | null>;
  readonly activeProjectId: Signal<string | null>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<string | null>;
  readonly nextCursor: Signal<string | null>;
  refresh(): Promise<void>;
  loadMore(): Promise<void>;
  loadProject(id: string): Promise<AccountProject | null>;
  createProject(details: ProjectDetails, requestId: string, items?: readonly PendingProduct[], guest?: AccountGuestCopy): Promise<{ project: AccountProject; copyReceipt: GuestListCopyReceipt | null }>;
  command(projectId: string, requestId: string, command: AccountProjectAction): Promise<{ project: AccountProject; copyReceipt: GuestListCopyReceipt | null }>;
  setActiveProject(activeProjectId: string | null): Promise<string | null>;
  stableGuestRequestId(scope: string, payload: unknown): Promise<string>;
}

export const ACCOUNT_PROJECT_STORE = new InjectionToken<AccountProjectStore | null>('Account project store', {
  providedIn: 'root', factory: () => null,
});

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) =>
  required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const optionalText = (value: unknown, max: number, multiline = false): boolean => value === undefined || typeof value === 'string' && value.length <= max
  && !(multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value);
const iso = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const version = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) < Number.MAX_SAFE_INTEGER;
const classifications = ['residential', 'commercial', 'industrial', 'agricultural', 'institutional-public', 'other'];
const installations = ['rooftop', 'ground-mounted', 'carport', 'other'];
const configurations = ['grid-tied', 'hybrid', 'off-grid', 'undecided'];
const scopes = ['new-installation', 'expansion', 'retrofit', 'maintenance'];
const validDetails = (value: unknown): value is ProjectDetails => record(value)
  && exact(value, ['name', 'classification', 'installation', 'configuration', 'workScope'], ['classificationOther', 'installationOther', 'location', 'description', 'notes'])
  && text(value['name'], 120) && classifications.includes(value['classification'] as string)
  && installations.includes(value['installation'] as string) && configurations.includes(value['configuration'] as string)
  && scopes.includes(value['workScope'] as string) && optionalText(value['classificationOther'], 240)
  && optionalText(value['installationOther'], 240) && optionalText(value['location'], 240)
  && optionalText(value['description'], 2000, true) && optionalText(value['notes'], 2000, true);

function parseBomItem(value: unknown): value is BomItem {
  if (!record(value) || !text(value['id'], 100) || !isPlanningQuantity(value['quantity']) || !iso(value['createdAt']) || !iso(value['updatedAt']) || !optionalText(value['notes'], 2000, true)) return false;
  if (value['kind'] === 'store-product') {
    const product = value['product'];
    return exact(value, ['id', 'kind', 'product', 'quantity', 'createdAt', 'updatedAt'], ['notes']) && record(product)
      && exact(product, ['productId', 'variantId', 'unitCode']) && UUID.test(String(product['productId']))
      && product['variantId'] === null && text(product['unitCode'], 64);
  }
  return value['kind'] === 'free-text' && exact(value, ['id', 'kind', 'title', 'description', 'unit', 'estimate', 'quantity', 'createdAt', 'updatedAt'], ['notes'])
    && text(value['title'], 240) && typeof value['description'] === 'string' && value['description'].length <= 2000
    && text(value['unit'], 80) && record(value['estimate']) && exact(value['estimate'], ['kind']) && value['estimate']['kind'] === 'unpriced'
    && optionalText(value['notes'], 2000, true);
}

function parseProject(value: unknown, uid: string): AccountProject {
  if (!record(value) || !exact(value, ['id', 'schemaVersion', 'customerId', 'version', 'name', 'classification', 'installation', 'configuration', 'workScope', 'status', 'archivedAt', 'createdAt', 'updatedAt', 'bom'], ['classificationOther', 'installationOther', 'location', 'description', 'notes'])
    || !UUID.test(String(value['id'])) || value['schemaVersion'] !== 1 || value['customerId'] !== uid || !version(value['version'])
    || !validDetails(Object.fromEntries(Object.entries(value).filter(([key]) => ['name', 'classification', 'installation', 'configuration', 'workScope', 'classificationOther', 'installationOther', 'location', 'description', 'notes'].includes(key))))
    || !['draft', 'archived'].includes(value['status'] as string) || !iso(value['createdAt']) || !iso(value['updatedAt'])
    || !(value['archivedAt'] === null || iso(value['archivedAt']))) throw new StoreApiError('invalid-response');
  const bom = value['bom'];
  if (!record(bom) || !exact(bom, ['id', 'projectId', 'items', 'updatedAt']) || bom['id'] !== `bom-${value['id']}`
    || bom['projectId'] !== value['id'] || !iso(bom['updatedAt']) || !Array.isArray(bom['items']) || bom['items'].length > 200
    || !bom['items'].every(parseBomItem) || new Set(bom['items'].map(item => item.id)).size !== bom['items'].length
    || (value['status'] === 'draft' ? value['archivedAt'] !== null : !iso(value['archivedAt']))) throw new StoreApiError('invalid-response');
  return value as unknown as AccountProject;
}

function parseReceipt(value: unknown, uid: string, projectId: string): GuestListCopyReceipt | null {
  if (value === null) return null;
  if (!record(value) || !exact(value, ['id', 'listId', 'customerId', 'projectId', 'copiedAt', 'idempotencyKey', 'itemMappings'])
    || !text(value['id'], 128) || !text(value['listId'], 256) || value['customerId'] !== uid || value['projectId'] !== projectId
    || !iso(value['copiedAt']) || !UUID.test(String(value['idempotencyKey'])) || !Array.isArray(value['itemMappings'])
    || !value['itemMappings'].length || value['itemMappings'].length > 200
    || !value['itemMappings'].every(mapping => record(mapping) && exact(mapping, ['guestItemId', 'destinationBomItemId']) && text(mapping['guestItemId'], 128) && text(mapping['destinationBomItemId'], 128))) {
    throw new StoreApiError('invalid-response');
  }
  const mappings = value['itemMappings'] as Array<{ guestItemId: string; destinationBomItemId: string }>;
  if (new Set(mappings.map(mapping => mapping.guestItemId)).size !== mappings.length || new Set(mappings.map(mapping => mapping.destinationBomItemId)).size !== mappings.length) throw new StoreApiError('invalid-response');
  return value as unknown as GuestListCopyReceipt;
}

@Injectable({ providedIn: 'root' })
export class AccountProjectService implements AccountProjectStore {
  private readonly auth = inject(AuthSessionService);
  private readonly api = inject(StoreApiService);
  private readonly catalog = inject(PublicCatalogService);
  private readonly projectState = signal<readonly AccountProject[]>([]);
  private readonly projectOwner = signal<string | null>(null);
  readonly projects = computed(() => this.projectOwner() === this.currentIdentity() ? this.projectState() : []);
  private readonly activeIdState = signal<string | null>(null);
  readonly activeProjectId = computed(() => this.projectOwner() === this.currentIdentity() ? this.activeIdState() : null);
  readonly activeProject = computed(() => this.projects().find(project => project.id === this.activeProjectId() && project.status === 'draft') ?? null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly nextCursor = signal<string | null>(null);
  private readonly preferencesVersionState = signal<number | null>(null);
  readonly preferencesVersion = computed(() => this.projectOwner() === this.currentIdentity() ? this.preferencesVersionState() : null);
  private generation = 0;
  private stateEpoch = 0;
  private listReadSequence = 0;
  private readonly projectReadSequence = new Map<string, number>();
  private identity = '';
  private readonly requestBodies = new Map<string, { path: ProjectApiPath; payload: string; body: string }>();
  private activeRequest?: { uid: string; target: string | null; body: { requestId: string; expectedVersion: number | null; activeProjectId: string | null } };
  readonly accountBacked = computed(() => this.currentIdentity() !== null);

  constructor() {
    effect(() => {
      const session = this.auth.session();
      const revision = this.auth.sessionRevision();
      const valid = this.auth.status() === 'signed-in' && !this.auth.busy() && session?.source === 'firebase' && !!session.customerId;
      const identity = valid ? `${session.customerId}:${revision}` : '';
      if (identity === this.identity) return;
      this.identity = identity;
      this.generation++;
      this.loading.set(false); this.error.set(null); this.nextCursor.set(null);
      this.projectState.set([]); this.projectOwner.set(null); this.activeIdState.set(null); this.preferencesVersionState.set(null);
      this.stateEpoch++; this.listReadSequence++; this.projectReadSequence.clear();
      this.requestBodies.clear(); this.activeRequest = undefined;
      if (valid) void this.refresh();
    });
  }

  async refresh(): Promise<void> {
    const context = this.context();
    if (!context || this.loading()) return;
    const epoch = this.stateEpoch; const sequence = ++this.listReadSequence;
    this.loading.set(true); this.error.set(null); this.nextCursor.set(null);
    try {
      const page = await this.fetchPage(context, null);
      if (!this.current(context) || epoch !== this.stateEpoch || sequence !== this.listReadSequence) return;
      this.projectState.set(this.mergeKnown(page.items, page.activeProjectId)); this.activeIdState.set(page.activeProjectId);
      this.projectOwner.set(context.identity);
      this.preferencesVersionState.set(page.preferencesVersion); this.nextCursor.set(page.nextCursor);
      if (page.activeProjectId && !page.items.some(project => project.id === page.activeProjectId)) void this.loadProject(page.activeProjectId);
    } catch (error) { this.showError(context, error); }
    finally { if (this.current(context)) this.loading.set(false); }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor(); const context = this.context();
    if (!context || !cursor || this.loading()) return;
    const epoch = this.stateEpoch; const sequence = ++this.listReadSequence;
    this.loading.set(true); this.error.set(null);
    try {
      const page = await this.fetchPage(context, cursor);
      if (!this.current(context) || epoch !== this.stateEpoch || sequence !== this.listReadSequence || this.nextCursor() !== cursor) return;
      const byId = new Map(this.projects().map(project => [project.id, project])); page.items.forEach(project => byId.set(project.id, project));
      this.projectState.set([...byId.values()]); this.activeIdState.set(page.activeProjectId);
      this.projectOwner.set(context.identity);
      this.preferencesVersionState.set(page.preferencesVersion); this.nextCursor.set(page.nextCursor);
    } catch (error) { this.showError(context, error); }
    finally { if (this.current(context)) this.loading.set(false); }
  }

  async loadProject(id: string): Promise<AccountProject | null> {
    if (!UUID.test(id)) return null;
    const context = this.context(); if (!context) return null;
    const epoch = this.stateEpoch;
    const sequence = (this.projectReadSequence.get(id) ?? 0) + 1;
    this.projectReadSequence.set(id, sequence);
    try {
      const path: ProjectApiPath = `/api/v1/me/projects/${id}`;
      const project = await this.api.projectRequest(path, 'GET', undefined, value => {
        if (!record(value) || !exact(value, ['project'])) throw new StoreApiError('invalid-response');
        return parseProject(value['project'], context.uid);
      });
      if (!this.current(context) || epoch !== this.stateEpoch || this.projectReadSequence.get(id) !== sequence) return null;
      this.upsert(project, context); this.hydrate([project], true); return project;
    } catch (error) {
      if (this.current(context) && epoch === this.stateEpoch && this.projectReadSequence.get(id) === sequence
        && error instanceof StoreApiError && error.code === 'not-found') {
        this.stateEpoch++; this.projectState.update(projects => projects.filter(project => project.id !== id));
        if (this.activeIdState() === id) this.activeIdState.set(null);
      }
      this.showError(context, error); return null;
    }
  }

  async createProject(details: ProjectDetails, requestId: string, items?: readonly PendingProduct[], guest?: AccountGuestCopy): Promise<{ project: AccountProject; copyReceipt: GuestListCopyReceipt | null }> {
    if (!validDetails(details) || !UUID.test(requestId) || items && (!items.length || items.length > 200 || !items.every(item => validItemInput(item))) || guest && !this.validGuest(guest)) throw new StoreApiError('invalid-input');
    const context = this.requireContext();
    const path: ProjectApiPath = '/api/v1/me/projects';
    const payload = { details, ...(items ? { items } : {}), ...(guest ? { guest } : {}) };
    const request = this.requestBody(context, path, requestId, payload);
    const result = await this.api.projectRequest(path, 'POST', request.body, value => this.parseMutation(value, context.uid));
    if (!this.current(context)) throw new StoreApiError('session-changed');
    if (guest ? !result.copyReceipt : result.copyReceipt !== null) throw new StoreApiError('invalid-response');
    this.acceptMutation(result.project, context);
    return result;
  }

  async command(projectId: string, requestId: string, command: AccountProjectAction): Promise<{ project: AccountProject; copyReceipt: GuestListCopyReceipt | null }> {
    if (!UUID.test(projectId) || !UUID.test(requestId) || !this.validCommand(command)) throw new StoreApiError('invalid-input');
    const context = this.requireContext();
    const current = this.projects().find(project => project.id === projectId);
    if (!current) throw new StoreApiError('not-found');
    const path: ProjectApiPath = `/api/v1/me/projects/${projectId}/commands`;
    const request = this.requestBody(context, path, requestId, command, { expectedVersion: current.version, ...command });
    try {
      const result = await this.api.projectRequest(path, 'POST', request.body, value => this.parseMutation(value, context.uid));
      if (!this.current(context)) throw new StoreApiError('session-changed');
      if (command.action === 'add-items' && command.guest ? !result.copyReceipt : result.copyReceipt !== null) throw new StoreApiError('invalid-response');
      this.acceptMutation(result.project, context); return result;
    } catch (error) {
      if (error instanceof StoreApiError && error.code === 'conflict' && this.current(context)) await this.loadProject(projectId);
      throw error;
    }
  }

  async setActiveProject(activeProjectId: string | null): Promise<string | null> {
    if (activeProjectId !== null && !UUID.test(activeProjectId)) throw new StoreApiError('invalid-input');
    const context = this.requireContext();
    if (!this.activeRequest || this.activeRequest.uid !== context.uid || this.activeRequest.target !== activeProjectId) {
      this.activeRequest = { uid: context.uid, target: activeProjectId, body: { requestId: crypto.randomUUID(), expectedVersion: this.preferencesVersion(), activeProjectId } };
    }
    const body = this.activeRequest.body;
    try {
      const response = await this.api.projectRequest('/api/v1/me/project-active', 'PUT', body, value => {
        if (!record(value) || !exact(value, ['activeProjectId', 'preferencesVersion'])
          || !(value['activeProjectId'] === null || UUID.test(String(value['activeProjectId']))) || !version(value['preferencesVersion'])) throw new StoreApiError('invalid-response');
        return value as { activeProjectId: string | null; preferencesVersion: number };
      });
      if (!this.current(context)) throw new StoreApiError('session-changed');
      this.activeIdState.set(response.activeProjectId); this.preferencesVersionState.set(response.preferencesVersion);
      this.activeRequest = undefined;
      return response.activeProjectId;
    } catch (error) {
      if (error instanceof StoreApiError && error.code === 'conflict' && this.current(context)) { this.activeRequest = undefined; await this.refresh(); }
      throw error;
    }
  }

  async stableGuestRequestId(scope: string, payload: unknown): Promise<string> {
    const context = this.requireContext();
    const serialized = JSON.stringify({ uid: context.uid, scope, payload });
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)));
    if (!this.current(context)) throw new StoreApiError('session-changed');
    const bytes = Array.from(digest.slice(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private async fetchPage(context: RequestContext, cursor: string | null): Promise<AccountProjectPage> {
    return this.api.projectRequest('/api/v1/me/projects', 'GET', undefined, value => this.parsePage(value, context.uid), cursor);
  }
  private parsePage(value: unknown, uid: string): AccountProjectPage {
    if (!record(value) || !exact(value, ['items', 'nextCursor', 'activeProjectId', 'preferencesVersion']) || !Array.isArray(value['items'])
      || value['items'].length > 50 || !value['items'].every(item => { try { parseProject(item, uid); return true; } catch { return false; } })
      || !(value['nextCursor'] === null || UUID.test(String(value['nextCursor'])))
      || !(value['activeProjectId'] === null || UUID.test(String(value['activeProjectId'])))
      || !(value['preferencesVersion'] === null || version(value['preferencesVersion']))) throw new StoreApiError('invalid-response');
    const items = (value['items'] as unknown[]).map(item => parseProject(item, uid));
    if (new Set(items.map(project => project.id)).size !== items.length) throw new StoreApiError('invalid-response');
    return { items, nextCursor: value['nextCursor'] as string | null, activeProjectId: value['activeProjectId'] as string | null, preferencesVersion: value['preferencesVersion'] as number | null };
  }
  private parseMutation(value: unknown, uid: string): { project: AccountProject; copyReceipt: GuestListCopyReceipt | null } {
    if (!record(value) || !exact(value, ['project', 'copyReceipt'])) throw new StoreApiError('invalid-response');
    const project = parseProject(value['project'], uid);
    const receipt = parseReceipt(value['copyReceipt'], uid, project.id);
    return { project, copyReceipt: receipt };
  }
  private validGuest(guest: AccountGuestCopy): boolean {
    return text(guest.listId, 256) && text(guest.fingerprint, 65536) && Array.isArray(guest.itemIds) && guest.itemIds.length > 0 && guest.itemIds.length <= 200
      && guest.itemIds.every(id => text(id, 128)) && new Set(guest.itemIds).size === guest.itemIds.length;
  }
  private validCommand(value: AccountProjectAction): boolean {
    if (value.action === 'add-items') return Array.isArray(value.items) && value.items.length > 0 && value.items.length <= 200
      && value.items.every(validItemInput) && (!value.guest || this.validGuest(value.guest));
    if (value.action === 'free-text') return (!value.itemId || text(value.itemId, 128)) && text(value.input.title, 240)
      && optionalText(value.input.description, 2000, true) && text(value.input.unit, 80)
      && isPlanningQuantity(value.input.quantity) && optionalText(value.input.notes, 2000, true);
    if (value.action === 'quantity') return text(value.itemId, 128) && isPlanningQuantity(value.quantity);
    if (value.action === 'remove') return text(value.itemId, 128);
    return value.action === 'restore' && text(value.itemId, 128) && Number.isSafeInteger(value.index) && value.index >= 0 && value.index < 200;
  }
  private requireContext(): RequestContext { const context = this.context(); if (!context) throw new StoreApiError('unauthorized'); return context; }
  private context(): RequestContext | null {
    const session = this.auth.session();
    if (!this.accountBacked() || !session || session.source !== 'firebase') return null;
    return { uid: session.customerId, revision: this.auth.sessionRevision(), generation: this.generation, identity: `${session.customerId}:${this.auth.sessionRevision()}` };
  }
  private current(context: RequestContext): boolean {
    const session = this.auth.session();
    return this.accountBacked() && this.generation === context.generation && this.auth.sessionRevision() === context.revision
      && session?.source === 'firebase' && session.customerId === context.uid;
  }
  private acceptMutation(project: AccountProject, context: RequestContext): void {
    this.stateEpoch++; this.upsert(project, context); this.hydrate([project]); this.error.set(null);
  }
  private upsert(project: AccountProject, context: RequestContext): void {
    if (this.projectOwner() !== context.identity) { this.projectState.set([]); this.projectOwner.set(context.identity); }
    this.projectState.update(projects => projects.some(item => item.id === project.id) ? projects.map(item => item.id === project.id ? project : item) : [...projects, project]);
  }
  private hydrate(projects: readonly AccountProject[], recheck = false): void {
    const ids = projects.flatMap(project => project.bom.items.flatMap(item => item.kind === 'store-product' ? [item.product.productId] : []));
    if (ids.length) void this.catalog.hydrate(ids, recheck).catch(() => undefined);
  }
  private mergeKnown(items: readonly AccountProject[], activeProjectId: string | null): readonly AccountProject[] {
    const current = this.projectOwner() === this.currentIdentity() ? this.projectState() : [];
    const map = new Map(items.map(project => [project.id, project]));
    current.filter(project => project.id === activeProjectId).forEach(project => {
      if ((map.get(project.id)?.version ?? 0) < project.version) map.set(project.id, project);
    });
    return [...map.values()];
  }
  private showError(context: RequestContext, error: unknown): void {
    if (!this.current(context)) return;
    this.error.set(error instanceof StoreApiError ? error.message : 'Unable to load account projects. Try again.');
  }
  private currentIdentity(): string | null {
    const session = this.auth.session();
    return this.auth.status() === 'signed-in' && !this.auth.busy() && session?.source === 'firebase' && session.customerId
      ? `${session.customerId}:${this.auth.sessionRevision()}` : null;
  }
  private requestBody(context: RequestContext, path: ProjectApiPath, requestId: string, payload: unknown, initial?: Record<string, unknown>): { requestId: string; body: unknown } {
    const payloadJson = JSON.stringify(payload);
    let actualId = requestId;
    let key = `${context.uid}:${actualId}`;
    let existing = this.requestBodies.get(key);
    if (existing) {
      if (existing.path !== path || existing.payload !== payloadJson) {
        actualId = crypto.randomUUID(); key = `${context.uid}:${actualId}`; existing = undefined;
      } else return { requestId: actualId, body: JSON.parse(existing.body) as unknown };
    }
    const body = { requestId: actualId, ...(initial ?? payload as Record<string, unknown>) };
    const serialized = JSON.stringify(body);
    this.requestBodies.set(key, { path, payload: payloadJson, body: serialized });
    if (this.requestBodies.size > 256) this.requestBodies.delete(this.requestBodies.keys().next().value!);
    return { requestId: actualId, body };
  }
}

interface RequestContext { readonly uid: string; readonly revision: number; readonly generation: number; readonly identity: string }
function validItemInput(value: unknown): value is PendingProduct {
  if (!record(value) || !exact(value, ['product', 'quantity']) || !isPlanningQuantity(value['quantity']) || !record(value['product'])) return false;
  const product = value['product'];
  return exact(product, ['productId', 'variantId', 'unitCode']) && UUID.test(String(product['productId']))
    && product['variantId'] === null && text(product['unitCode'], 64);
}

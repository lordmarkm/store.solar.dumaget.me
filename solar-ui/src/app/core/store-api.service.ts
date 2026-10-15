import { inject, Injectable, InjectionToken } from '@angular/core';
import type { CustomerProfile } from './models';
import { AuthSessionService } from './auth-session.service';
import { isProductImage, type ProductImage } from './product-images';

export interface ApiIdentity {
  readonly uid: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly adminEligible: boolean;
  readonly adminAuthorized: boolean;
}

export interface CustomerProfileEnvelope {
  readonly profile: CustomerProfile | null;
  readonly version: number | null;
}

export interface SaveCustomerProfileInput {
  readonly expectedVersion: number | null;
  readonly displayName: string;
  readonly phone?: string | null;
  readonly companyName?: string | null;
  readonly contractorDetails?: string | null;
}

export type AdminApiPath = '/api/v1/admin/suppliers' | '/api/v1/admin/products' | '/api/v1/admin/product-brands'
  | `/api/v1/admin/products/${string}` | `/api/v1/admin/suppliers/${string}` | `/api/v1/admin/inventory/${string}`;
export type ProjectApiPath = '/api/v1/me/projects' | '/api/v1/me/project-active'
  | `/api/v1/me/projects/${string}` | `/api/v1/me/projects/${string}/commands` | `/api/v1/me/projects/${string}/management`;

export type StoreApiErrorCode = 'unauthorized' | 'forbidden' | 'not-found' | 'conflict' | 'rate-limited'
  | 'unavailable' | 'timeout' | 'invalid-response' | 'session-changed' | 'invalid-input';

export class StoreApiError extends Error {
  constructor(readonly code: StoreApiErrorCode) {
    super(messageFor(code));
    this.name = 'StoreApiError';
  }
}

type StoreFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Isolated transport seam; callers cannot install a global interceptor. */
export const STORE_API_FETCH = new InjectionToken<StoreFetch>('Store API fetch', {
  providedIn: 'root', factory: () => globalThis.fetch.bind(globalThis),
});

const API_TIMEOUT_MS = 10_000;
const MAX_VERSION = Number.MAX_SAFE_INTEGER;

function messageFor(code: StoreApiErrorCode): string {
  switch (code) {
    case 'unauthorized': return 'Your sign-in has expired. Sign in again and retry.';
    case 'forbidden': return 'You are not allowed to perform this account action.';
    case 'not-found': return 'The requested account record was not found.';
    case 'conflict': return 'This record already exists, changed elsewhere, or the request ID was reused. Review the details and retry.';
    case 'rate-limited': return 'Too many requests. Wait a moment and try again.';
    case 'unavailable': return 'The account service is temporarily unavailable.';
    case 'timeout': return 'The account service took too long to respond.';
    case 'invalid-response': return 'The account service returned an invalid response.';
    case 'session-changed': return 'Your sign-in changed during the request. Retry with the current account.';
    case 'invalid-input': return 'The submitted details are invalid. Review the fields and retry.';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every(key => required.includes(key) || optional.includes(key));
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value < MAX_VERSION;
}

function hasForbiddenControls(value: string, allowNewlines = false): boolean {
  return allowNewlines
    ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/.test(value)
    : /[\u0000-\u001F\u007F]/.test(value);
}

function validEmail(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 320 || /\s/.test(value) || hasForbiddenControls(value)) return false;
  const at = value.indexOf('@');
  return at > 0 && at === value.lastIndexOf('@') && at < value.length - 1;
}

function validDisplayName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 100 && !hasForbiddenControls(value);
}

function validOptionalText(value: unknown, maxLength: number, allowNewlines = false): boolean {
  return value === undefined || value === null || (typeof value === 'string'
    && value.length <= maxLength && !hasForbiddenControls(value, allowNewlines));
}

function validResponseText(value: unknown, maxLength: number, allowNewlines = false): boolean {
  return value === undefined || (typeof value === 'string'
    && value.length <= maxLength && !hasForbiddenControls(value, allowNewlines));
}

function statusError(status: number): StoreApiError {
  switch (status) {
    case 401: return new StoreApiError('unauthorized');
    case 403: return new StoreApiError('forbidden');
    case 404: return new StoreApiError('not-found');
    case 400:
    case 422: return new StoreApiError('invalid-input');
    case 409: return new StoreApiError('conflict');
    case 429: return new StoreApiError('rate-limited');
    case 408: return new StoreApiError('timeout');
    case 503: return new StoreApiError('unavailable');
    default: return new StoreApiError('unavailable');
  }
}

@Injectable({ providedIn: 'root' })
export class StoreApiService {
  private readonly auth = inject(AuthSessionService);
  private readonly fetcher = inject(STORE_API_FETCH);

  me(): Promise<ApiIdentity> {
    return this.request('/api/v1/me', 'GET', undefined, (value, customerId) => this.parseIdentity(value, customerId));
  }

  /** Fixed private-admin routes only, sharing the session/timeout safeguards. */
  adminRequest<T>(path: AdminApiPath, method: 'GET' | 'POST' | 'PUT', body: unknown,
    parse: (value: unknown) => T, cursor: string | null = null, filters: Readonly<Record<string, string>> = {}): Promise<T> {
    const listPath = ['/api/v1/admin/suppliers', '/api/v1/admin/products'].includes(path);
    const productPath = /^\/api\/v1\/admin\/products\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(path);
    const actionPath = /^\/api\/v1\/admin\/products\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/(?:publish|unpublish)$/.test(path);
    const supplierPath = /^\/api\/v1\/admin\/suppliers\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(path);
    const supplierAction = /^\/api\/v1\/admin\/suppliers\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/status$/.test(path);
    const brands = path === '/api/v1/admin/product-brands';
    const uuidPath = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
    const inventoryList = new RegExp('^/api/v1/admin/inventory/' + uuidPath + '$').test(path);
    const locationList = path === '/api/v1/admin/inventory/locations';
    const locationEdit = new RegExp('^/api/v1/admin/inventory/locations/' + uuidPath + '$').test(path);
    const inventoryProduct = new RegExp('^/api/v1/admin/inventory/' + uuidPath + '/products/' + uuidPath + '$').test(path);
    const movements = new RegExp('^/api/v1/admin/inventory/' + uuidPath + '/products/' + uuidPath + '/movements$').test(path);
    const adjustment = new RegExp('^/api/v1/admin/inventory/' + uuidPath + '/products/' + uuidPath + '/adjustments$').test(path);
    const count = new RegExp('^/api/v1/admin/inventory/' + uuidPath + '/products/' + uuidPath + '/counts$').test(path);
    const transfer = new RegExp('^/api/v1/admin/inventory/' + uuidPath + '/products/' + uuidPath + '/transfers$').test(path);
    const settings = new RegExp('^/api/v1/admin/inventory/' + uuidPath + '/products/' + uuidPath + '/settings$').test(path);
    const supplierFilters = path === '/api/v1/admin/suppliers' && Object.keys(filters).length > 0;
    const validCursor = cursor === null || typeof cursor === 'string' && (brands ? cursor.length > 0 && cursor.length <= 80 && !/[\u0000-\u001f\u007f]/.test(cursor)
      : supplierFilters ? /^[A-Za-z0-9_-]{1,2048}$/.test(cursor) : inventoryList || movements || path === '/api/v1/admin/products' ? /^[A-Za-z0-9_-]{1,512}$/.test(cursor)
      : /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(cursor));
    if (!(listPath && ['GET', 'POST'].includes(method) || (productPath || supplierPath) && ['GET', 'PUT'].includes(method)
      || (actionPath || supplierAction || adjustment || count || transfer) && method === 'POST'
      || (brands || inventoryList || inventoryProduct || movements) && method === 'GET'
      || settings && method === 'PUT'
      || locationList && ['GET', 'POST'].includes(method) || locationEdit && method === 'PUT')
      || !validCursor || cursor !== null && (method !== 'GET' || !listPath && !brands && !inventoryList && !movements && !locationList)
      || Object.keys(filters).length > 0 && (!listPath && !inventoryList || method !== 'GET')
      || Object.entries(filters).some(([key, value]) => !(supplierFilters ? ['namePrefix', 'status']
        : ['skuPrefix', 'brand', 'category', 'supplierId', ...(inventoryList ? ['stockStatus'] : [])]).includes(key)
        || typeof value !== 'string' || !value || value.trim() !== value || value.length > (supplierFilters && key === 'namePrefix' ? 160 : 80)
        || /[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value)
        || supplierFilters && key === 'status' && !['active', 'inactive'].includes(value)
        || key === 'stockStatus' && (!inventoryList || !['unknown', 'zero', 'low', 'in-stock'].includes(value)))) {
      return Promise.reject(new StoreApiError('invalid-input'));
    }
    let serialized: string | undefined;
    try { serialized = method !== 'GET' ? JSON.stringify(body) : undefined; }
    catch { return Promise.reject(new StoreApiError('invalid-input')); }
    const query = new URLSearchParams(filters);
    if (cursor) query.set('cursor', cursor);
    return this.request(query.size ? `${path}?${query}` : path,
      method, serialized, value => parse(value));
  }

  /** Fixed account project endpoints only; never accepts caller-selected arbitrary API paths. */
  projectRequest<T>(path: ProjectApiPath, method: 'GET' | 'POST' | 'PUT', body: unknown,
    parse: (value: unknown, customerId: string) => T, cursor: string | null = null, filters: Readonly<Record<string, string>> = {}): Promise<T> {
    const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
    const list = path === '/api/v1/me/projects';
    const active = path === '/api/v1/me/project-active';
    const detail = new RegExp(`^/api/v1/me/projects/${uuid}$`, 'i').test(path);
    const command = new RegExp(`^/api/v1/me/projects/${uuid}/commands$`, 'i').test(path);
    const management = new RegExp(`^/api/v1/me/projects/${uuid}/management$`, 'i').test(path);
    if (!(list && method === 'GET' || detail && method === 'GET' || (command || management) && method === 'POST'
      || path === '/api/v1/me/projects' && method === 'POST' || active && method === 'PUT')
      || (cursor !== null && (!list || method !== 'GET' || !new RegExp(`^${uuid}$`, 'i').test(cursor)))) {
      return Promise.reject(new StoreApiError('invalid-input'));
    }
    if (Object.keys(filters).some(key => !['search', 'status', 'classification', 'configuration', 'workScope', 'limit'].includes(key))
      || Object.keys(filters).length && (!list || method !== 'GET')
      || Object.values(filters).some(value => typeof value !== 'string' || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value))) return Promise.reject(new StoreApiError('invalid-input'));
    let serialized: string | undefined;
    try {
      serialized = method === 'GET' ? undefined : JSON.stringify(body);
      if (method !== 'GET' && (serialized === undefined || new TextEncoder().encode(serialized).byteLength > 65_536)) throw new Error('body-size');
    } catch { return Promise.reject(new StoreApiError('invalid-input')); }
    const query = new URLSearchParams(filters);
    if (cursor) query.set('cursor', cursor);
    const requestPath: ProjectApiPath | `${ProjectApiPath}?${string}` = query.size ? `${path}?${query}` : path;
    return this.request(requestPath, method, serialized, parse);
  }

  profile(): Promise<CustomerProfileEnvelope> {
    return this.request('/api/v1/me/profile', 'GET', undefined, (value, customerId) => this.parseProfileEnvelope(value, customerId));
  }

  saveProfile(input: SaveCustomerProfileInput): Promise<CustomerProfileEnvelope> {
    if (!this.validInput(input)) return Promise.reject(new StoreApiError('invalid-input'));
    // Capture the reviewed input before any asynchronous token acquisition.
    const body = JSON.stringify(input);
    return this.request('/api/v1/me/profile', 'PUT', body, (value, customerId) => {
      const envelope = this.parseProfileEnvelope(value, customerId);
      if (!envelope.profile) throw new StoreApiError('invalid-response');
      return envelope;
    });
  }

  /** Uploads one supported raw image to the fixed private-admin image endpoint. */
  uploadProductImage(file: Blob): Promise<ProductImage> {
    if (!(file instanceof Blob) || file.size < 1 || file.size > 5 * 1024 * 1024
      || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return Promise.reject(new StoreApiError('invalid-input'));
    }
    return this.request('/api/v1/admin/product-images', 'POST', file, value => {
      if (!isRecord(value) || !hasExactKeys(value, ['image']) || !isProductImage(value['image'])) {
        throw new StoreApiError('invalid-response');
      }
      return value['image'];
    });
  }

  private async request<T>(
    path: '/api/v1/me' | '/api/v1/me/profile' | '/api/v1/admin/product-images' | AdminApiPath | `${AdminApiPath}?${string}` | ProjectApiPath | `${ProjectApiPath}?${string}`,
    method: 'GET' | 'PUT' | 'POST',
    body: string | Blob | undefined,
    parse: (value: unknown, customerId: string) => T,
  ): Promise<T> {
    const initial = this.currentFirebaseSession();
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new StoreApiError('timeout'));
      }, API_TIMEOUT_MS);
    });
    try {
      let token: string | null;
      try { token = await Promise.race([this.auth.idToken(), deadline]); }
      catch {
        this.assertCurrent(initial);
        if (timedOut) throw new StoreApiError('timeout');
        throw new StoreApiError('unavailable');
      }
      this.assertCurrent(initial);
      if (!token) throw new StoreApiError('unauthorized');

      let response: Response;
      try {
        response = await Promise.race([this.fetcher(path, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': typeof body === 'string' ? 'application/json' : body.type } : {}),
          },
          ...(body ? { body } : {}),
          credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
        }), deadline]);
      } catch {
        this.assertCurrent(initial);
        throw new StoreApiError(timedOut ? 'timeout' : 'unavailable');
      }
      this.assertCurrent(initial);
      if (!response.ok) throw statusError(response.status);

      let value: unknown;
      try { value = await Promise.race([response.json(), deadline]); }
      catch { this.assertCurrent(initial); throw new StoreApiError(timedOut ? 'timeout' : 'invalid-response'); }
      this.assertCurrent(initial);
      const result = parse(value, initial.customerId);
      this.assertCurrent(initial);
      return result;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private currentFirebaseSession(): { readonly customerId: string; readonly revision: number } {
    const session = this.auth.session();
    if (this.auth.status() !== 'signed-in' || this.auth.busy() || session?.source !== 'firebase'
      || typeof session.customerId !== 'string' || session.customerId.length === 0) {
      throw new StoreApiError('unauthorized');
    }
    return { customerId: session.customerId, revision: this.auth.sessionRevision() };
  }

  private assertCurrent(initial: { readonly customerId: string; readonly revision: number }): void {
    const session = this.auth.session();
    if (this.auth.status() !== 'signed-in' || this.auth.busy() || session?.source !== 'firebase'
      || session.customerId !== initial.customerId || this.auth.sessionRevision() !== initial.revision) {
      throw new StoreApiError('session-changed');
    }
  }

  private parseIdentity(value: unknown, customerId: string): ApiIdentity {
    if (!isRecord(value) || !hasExactKeys(value, ['uid', 'email', 'emailVerified', 'adminEligible', 'adminAuthorized'])
      || value['uid'] !== customerId || !(value['email'] === null || validEmail(value['email']))
      || typeof value['emailVerified'] !== 'boolean' || typeof value['adminEligible'] !== 'boolean'
      || typeof value['adminAuthorized'] !== 'boolean') throw new StoreApiError('invalid-response');
    return value as unknown as ApiIdentity;
  }

  private parseProfileEnvelope(value: unknown, customerId: string): CustomerProfileEnvelope {
    if (!isRecord(value) || !hasExactKeys(value, ['profile', 'version'])
      || !(value['version'] === null || validVersion(value['version']))) {
      throw new StoreApiError('invalid-response');
    }
    if (value['profile'] === null) {
      if (value['version'] !== null) throw new StoreApiError('invalid-response');
      return { profile: null, version: null };
    }
    const profile = value['profile'];
    if (!isRecord(profile) || !hasExactKeys(profile, ['customerId', 'displayName', 'email', 'createdAt', 'updatedAt'], ['phone', 'companyName', 'contractorDetails'])
      || profile['customerId'] !== customerId || !validDisplayName(profile['displayName']) || !validEmail(profile['email'])
      || !isIsoDate(profile['createdAt']) || !isIsoDate(profile['updatedAt'])
      || profile['createdAt'] > profile['updatedAt']
      || !validResponseText(profile['phone'], 80) || !validResponseText(profile['companyName'], 120)
      || !validResponseText(profile['contractorDetails'], 2000, true)) {
      throw new StoreApiError('invalid-response');
    }
    if (!validVersion(value['version'])) throw new StoreApiError('invalid-response');
    return { profile: profile as unknown as CustomerProfile, version: value['version'] as number };
  }

  private validInput(value: unknown): value is SaveCustomerProfileInput {
    if (!isRecord(value) || !hasExactKeys(value, ['expectedVersion', 'displayName'], ['phone', 'companyName', 'contractorDetails'])) return false;
    if (!(value['expectedVersion'] === null || validVersion(value['expectedVersion'])) || !validDisplayName(value['displayName'])) return false;
    return validOptionalText(value['phone'], 80) && validOptionalText(value['companyName'], 120)
      && validOptionalText(value['contractorDetails'], 2000, true);
  }
}

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_DRIVER, AuthDriver, AuthSessionService } from './auth-session.service';
import { STORE_API_FETCH, StoreApiError, StoreApiService } from './store-api.service';

function response(value: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => value } as Response;
}

const identity = {
  uid: 'customer-a', email: 'a@example.test', emailVerified: true,
  adminEligible: false, adminAuthorized: false,
};
const profileEnvelope = {
  profile: {
    customerId: 'customer-a', displayName: 'Customer A', email: 'a@example.test',
    createdAt: '2026-10-06T01:00:00.000Z', updatedAt: '2026-10-06T02:00:00.000Z',
  },
  version: 1,
};
const productImage = {
  id: 'a'.repeat(64),
  url: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${'a'.repeat(64)}/detail.webp`,
  thumbnailUrl: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${'a'.repeat(64)}/thumb.webp`,
  width: 1200, height: 900,
};

describe('StoreApiService', () => {
  let publish: (session: { customerId: string; source?: 'firebase' } | null) => void;
  let driver: AuthDriver;
  let fetcher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    driver = {
      observe: vi.fn(next => { publish = next; return vi.fn(); }),
      signInGoogle: vi.fn(async () => {}), signOut: vi.fn(async () => {}),
      getIdToken: vi.fn(async () => 'fresh-id-token'),
    };
    fetcher = vi.fn(async () => response(identity));
    TestBed.configureTestingModule({ providers: [
      { provide: AUTH_DRIVER, useValue: driver },
      { provide: STORE_API_FETCH, useValue: fetcher },
    ] });
    TestBed.inject(AuthSessionService);
  });

  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('restricts project management and encodes only bounded allowlisted list filters', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService), id = '11111111-1111-4111-8111-111111111111';
    for (const path of ['/api/v1/me/projects/' + id + '/anything', '/api/v1/me/projects/not-uuid/management']) {
      await expect(api.projectRequest(path as never, 'POST', {}, value => value)).rejects.toMatchObject({ code: 'invalid-input' });
    }
    await expect(api.projectRequest('/api/v1/me/projects', 'GET', undefined, value => value, null, { customerId: 'other' })).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.projectRequest('/api/v1/me/projects', 'GET', undefined, value => value, null, { search: 'x'.repeat(121) })).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.projectRequest(`/api/v1/me/projects/${id}/management`, 'POST', {}, value => value, null, { status: 'draft' })).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).not.toHaveBeenCalled();
    await api.projectRequest('/api/v1/me/projects', 'GET', undefined, value => value, id, { search: 'Cebu & roof', status: 'draft', limit: '10' });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.searchParams.get('search')).toBe('Cebu & roof');
    expect(url.searchParams.get('cursor')).toBe(id);
    expect(url.searchParams.get('limit')).toBe('10');
    await api.projectRequest(`/api/v1/me/projects/${id}/management`, 'POST', { action: 'archive-project' }, value => value);
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('POST');
    expect(fetcher.mock.calls[1]?.[1]?.cache).toBe('no-store');
  });
  it('restricts admin transport to reviewed endpoints, methods and UUID cursor values', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService);
    for (const path of ['https://attacker.invalid', '/api/v1/me', '/api/v1/admin/products?cursor=anything']) {
      await expect(api.adminRequest(path as never, 'GET', undefined, value => value)).rejects.toMatchObject({ code: 'invalid-input' });
    }
    await expect(api.adminRequest('/api/v1/admin/products', 'DELETE' as never, undefined, value => value)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.adminRequest('/api/v1/admin/products', 'GET', undefined, value => value, '../escape')).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.adminRequest('/api/v1/admin/products', 'POST', {}, value => value, '11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(response({ items: [], nextCursor: null }));
    await api.adminRequest('/api/v1/admin/products', 'GET', undefined, value => value, '11111111-1111-4111-8111-111111111111');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/admin/products?cursor=11111111-1111-4111-8111-111111111111');
  });
  it('allows only fixed inventory routes with bounded list filters and cursors', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService), id = '11111111-1111-4111-8111-111111111111';
    for (const [path, method] of [['/api/v1/admin/inventory/locations/../escape', 'PUT'],
      ['/api/v1/admin/inventory/' + id + '/products/' + id + '/delete', 'POST'],
      ['/api/v1/admin/inventory/' + id, 'PUT'], ['/api/v1/admin/inventory/locations', 'PUT']]) {
      await expect(api.adminRequest(path as never, method as never, {}, value => value)).rejects.toMatchObject({ code: 'invalid-input' });
    }
    await expect(api.adminRequest('/api/v1/admin/inventory/locations', 'GET', undefined, value => value, 'opaque')).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(response({ items: [], nextCursor: null }));
    await api.adminRequest(`/api/v1/admin/inventory/${id}`, 'GET', undefined, value => value, 'opaque', { skuPrefix: 'SOL-' });
    expect(fetcher.mock.calls[0]?.[0]).toContain('skuPrefix=SOL-');
    await expect(api.adminRequest(`/api/v1/admin/inventory/${id}/products/${id}/movements`, 'GET', undefined,
      value => value, null, { skuPrefix: 'x' })).rejects.toMatchObject({ code: 'invalid-input' });
  });
  it('sends the fixed inventory product, count, transfer and settings routes through the guarded transport', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService), location = '11111111-1111-4111-8111-111111111111';
    const product = '22222222-2222-4222-8222-222222222222';
    const routes = [
      [`/api/v1/admin/inventory/${location}/products/${product}`, 'GET'],
      [`/api/v1/admin/inventory/${location}/products/${product}/counts`, 'POST'],
      [`/api/v1/admin/inventory/${location}/products/${product}/transfers`, 'POST'],
      [`/api/v1/admin/inventory/${location}/products/${product}/settings`, 'PUT'],
    ] as const;
    for (const [path, method] of routes) {
      await api.adminRequest(path, method, method === 'GET' ? undefined : { reviewed: true }, value => value);
      const [url, init] = fetcher.mock.calls.at(-1) as [string, RequestInit];
      expect(url).toBe(path);
      expect(init.method).toBe(method);
      expect(init.credentials).toBe('omit');
      expect(init.cache).toBe('no-store');
    }
    expect(fetcher).toHaveBeenCalledTimes(routes.length);
  });
  it('allows stockStatus only on inventory lists and only for the backend vocabulary', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService), location = '11111111-1111-4111-8111-111111111111';
    for (const status of ['unknown', 'zero', 'low', 'in-stock']) {
      await api.adminRequest(`/api/v1/admin/inventory/${location}`, 'GET', undefined, value => value, null, { stockStatus: status });
      const [url] = fetcher.mock.calls.at(-1) as [string];
      expect(new URL(url, 'http://localhost').searchParams.get('stockStatus')).toBe(status);
    }
    for (const [path, value] of [
      [`/api/v1/admin/inventory/${location}`, 'available'],
      ['/api/v1/admin/products', 'low'],
      [`/api/v1/admin/inventory/${location}/products/22222222-2222-4222-8222-222222222222/movements`, 'low'],
    ]) {
      await expect(api.adminRequest(path as never, 'GET', undefined, value => value, null, { stockStatus: value }))
        .rejects.toMatchObject({ code: 'invalid-input' });
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('rejects wrong methods and malformed UUIDs for inventory product routes before transport', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService), location = '11111111-1111-4111-8111-111111111111';
    const product = '22222222-2222-4222-8222-222222222222';
    for (const [path, method] of [
      [`/api/v1/admin/inventory/${location}/products/${product}`, 'POST'],
      [`/api/v1/admin/inventory/${location}/products/${product}/counts`, 'GET'],
      [`/api/v1/admin/inventory/${location}/products/${product}/transfers`, 'PUT'],
      [`/api/v1/admin/inventory/${location}/products/${product}/settings`, 'POST'],
      ['/api/v1/admin/inventory/not-a-uuid/products/' + product, 'GET'],
      [`/api/v1/admin/inventory/${location}/products/not-a-uuid/counts`, 'POST'],
    ]) {
      await expect(api.adminRequest(path as never, method as never, {}, value => value))
        .rejects.toMatchObject({ code: 'invalid-input' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses only the fixed relative API and sends a fresh bearer token with private caching and credentials disabled', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService);
    expect(await api.me()).toEqual(identity);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/me');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fresh-id-token');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(driver.getIdToken).toHaveBeenCalledWith('customer-a', false);
  });

  it('uploads raw supported image bytes to the fixed endpoint with the existing auth and timeout safeguards', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const file = new File(['png bytes'], 'panel.png', { type: 'image/png' });
    fetcher.mockResolvedValueOnce(response({ image: productImage }));
    const result = await TestBed.inject(StoreApiService).uploadProductImage(file);
    expect(result).toEqual(productImage);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/product-images');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store' });
    expect(init.body).toBe(file);
    expect(new Headers(init.headers).get('Content-Type')).toBe('image/png');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fresh-id-token');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    await expect(TestBed.inject(StoreApiService).uploadProductImage(new File(['gif'], 'panel.gif', { type: 'image/gif' })))
      .rejects.toMatchObject({ code: 'invalid-input' });
    await expect(TestBed.inject(StoreApiService).uploadProductImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })))
      .rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('aborts a product image upload on timeout without retrying', async () => {
    vi.useFakeTimers();
    publish({ customerId: 'customer-a', source: 'firebase' });
    fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const pending = TestBed.inject(StoreApiService).uploadProductImage(new File(['png'], 'panel.png', { type: 'image/png' }))
      .catch(error => error as StoreApiError);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    if (!(result instanceof StoreApiError)) throw new Error('Expected timeout');
    expect(result.code).toBe('timeout');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('rejects a product image response after the signed-in session is revoked', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    let finish!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = TestBed.inject(StoreApiService).uploadProductImage(new File(['png'], 'panel.png', { type: 'image/png' }));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    publish(null);
    finish(response({ image: productImage }));
    await expect(pending).rejects.toMatchObject({ code: 'session-changed' });
  });

  it('does not call the API for signed-out, unavailable, or non-Firebase identities', async () => {
    const api = TestBed.inject(StoreApiService);
    await expect(api.me()).rejects.toMatchObject({ code: 'unauthorized' });
    publish({ customerId: 'test-session' });
    await expect(api.profile()).rejects.toMatchObject({ code: 'unauthorized' });
    publish({ customerId: 'customer-a', source: 'firebase' });
    const auth = TestBed.inject(AuthSessionService);
    auth.busy.set(true);
    await expect(api.me()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(driver.getIdToken).not.toHaveBeenCalled();
  });

  it('reads profiles and sends the exact versioned profile write once', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    fetcher.mockResolvedValueOnce(response(profileEnvelope));
    const api = TestBed.inject(StoreApiService);
    expect(await api.profile()).toEqual(profileEnvelope);
    const update = {
      expectedVersion: 1, displayName: 'Updated', phone: null,
      companyName: 'Solar Co', contractorDetails: 'Installer',
    };
    fetcher.mockResolvedValueOnce(response(profileEnvelope));
    await api.saveProfile(update);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/v1/me/profile');
    expect(init.method).toBe('PUT');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify(update));
  });

  it('maps known HTTP failures without exposing response content', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService);
    for (const [status, code] of [[401, 'unauthorized'], [503, 'unavailable']] as const) {
      fetcher.mockResolvedValueOnce(response({ error: 'SECRET bearer token' }, status));
      const error = await api.me().catch(value => value as StoreApiError);
      expect(error).toBeInstanceOf(StoreApiError);
      if (!(error instanceof StoreApiError)) throw new Error('Expected sanitized API error');
      expect(error.code).toBe(code);
      expect(error.message).not.toContain('SECRET');
    }
  });

  it('rejects responses after the account changes while fetch is in flight', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    let finish!: (value: Response) => void;
    fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const api = TestBed.inject(StoreApiService);
    const pending = api.me();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    publish({ customerId: 'customer-b', source: 'firebase' });
    finish(response(identity));
    await expect(pending).rejects.toMatchObject({ code: 'session-changed' });
  });

  it('rejects malformed, extended, and foreign-owner response shapes', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService);
    fetcher.mockResolvedValueOnce(response({ ...identity, privateToken: 'SECRET' }));
    await expect(api.me()).rejects.toMatchObject({ code: 'invalid-response' });
    fetcher.mockResolvedValueOnce(response({ ...identity, uid: 'customer-b' }));
    await expect(api.me()).rejects.toMatchObject({ code: 'invalid-response' });
    fetcher.mockResolvedValueOnce(response({
      ...profileEnvelope,
      profile: { ...profileEnvelope.profile, customerId: 'customer-b' },
    }));
    await expect(api.profile()).rejects.toMatchObject({ code: 'invalid-response' });
    fetcher.mockResolvedValueOnce(response({
      ...profileEnvelope,
      profile: { ...profileEnvelope.profile, unexpected: 'value' },
    }));
    await expect(api.profile()).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('does not retry a failed profile write', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    fetcher.mockResolvedValueOnce(response({ error: 'SECRET' }, 503));
    const api = TestBed.inject(StoreApiService);
    await expect(api.saveProfile({ expectedVersion: null, displayName: 'Customer' }))
      .rejects.toMatchObject({ code: 'unavailable' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('captures save input before waiting for a token and rejects a null successful-save response', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService);
    const input = { expectedVersion: 1, displayName: 'Reviewed name' };
    fetcher.mockResolvedValueOnce(response(profileEnvelope));
    const saving = api.saveProfile(input);
    input.displayName = 'Changed after click';
    await saving;
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify({ expectedVersion: 1, displayName: 'Reviewed name' }));
    fetcher.mockResolvedValueOnce(response({ profile: null, version: null }));
    await expect(api.saveProfile(input)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('rejects an A to B to A response instead of accepting the old request for the same UID', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    let finish!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = TestBed.inject(StoreApiService).me();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    publish({ customerId: 'customer-b', source: 'firebase' });
    publish({ customerId: 'customer-a', source: 'firebase' });
    finish(response(identity));
    await expect(pending).rejects.toMatchObject({ code: 'session-changed' });
  });

  it('bounds token acquisition without sending a late token to the API', async () => {
    vi.useFakeTimers();
    publish({ customerId: 'customer-a', source: 'firebase' });
    let finish!: (token: string) => void;
    vi.mocked(driver.getIdToken!).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = TestBed.inject(StoreApiService).me().catch(error => error as StoreApiError);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    if (!(result instanceof StoreApiError)) throw new Error('Expected timeout');
    expect(result.code).toBe('timeout');
    finish('late-secret-token');
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts a timed-out fetch without retrying the request', async () => {
    vi.useFakeTimers();
    publish({ customerId: 'customer-a', source: 'firebase' });
    fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const pending = TestBed.inject(StoreApiService).me().catch(error => error as StoreApiError);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    if (!(result instanceof StoreApiError)) throw new Error('Expected timeout');
    expect(result.code).toBe('timeout');
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects out-of-range versions and malformed profile fields before network use', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const api = TestBed.inject(StoreApiService);
    const invalidProfiles = [
      { ...profileEnvelope, version: 0 },
      { ...profileEnvelope, version: Number.MAX_SAFE_INTEGER },
      { ...profileEnvelope, profile: { ...profileEnvelope.profile, displayName: '   ' } },
      { ...profileEnvelope, profile: { ...profileEnvelope.profile, displayName: 'x'.repeat(101) } },
      { ...profileEnvelope, profile: { ...profileEnvelope.profile, email: 'bad email@example.test' } },
      { ...profileEnvelope, profile: { ...profileEnvelope.profile, phone: 'x'.repeat(81) } },
      { ...profileEnvelope, profile: { ...profileEnvelope.profile, phone: null } },
      { ...profileEnvelope, profile: { ...profileEnvelope.profile, contractorDetails: 'bad\u0000text' } },
      { ...profileEnvelope, profile: { ...profileEnvelope.profile, createdAt: '2026-10-07T02:00:00.000Z' } },
    ];
    for (const invalid of invalidProfiles) {
      fetcher.mockResolvedValueOnce(response(invalid));
      await expect(api.profile()).rejects.toMatchObject({ code: 'invalid-response' });
    }
    await expect(api.saveProfile({ expectedVersion: 0, displayName: 'Customer' }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    await expect(api.saveProfile({ expectedVersion: 1, displayName: 'Customer', companyName: 'x'.repeat(121) }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).toHaveBeenCalledTimes(invalidProfiles.length);
  });
});

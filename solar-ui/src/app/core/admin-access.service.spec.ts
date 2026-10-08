import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_DRIVER, AuthDriver } from './auth-session.service';
import { AdminAccessService } from './admin-access.service';
import { ApiIdentity, StoreApiService } from './store-api.service';

const authorized: ApiIdentity = { uid: 'admin-a', email: 'a@example.test', emailVerified: true, adminEligible: false, adminAuthorized: true };
const denied: ApiIdentity = { ...authorized, adminAuthorized: false, adminEligible: true };

describe('AdminAccessService', () => {
  let publish: (session: { customerId: string; source?: 'firebase' } | null) => void;
  let me: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const driver: AuthDriver = {
      observe: vi.fn(next => { publish = next; return vi.fn(); }),
      signInGoogle: vi.fn(async () => {}), signOut: vi.fn(async () => {}), getIdToken: vi.fn(async () => 'token'),
    };
    me = vi.fn(async () => authorized);
    TestBed.configureTestingModule({ providers: [{ provide: AUTH_DRIVER, useValue: driver }, { provide: StoreApiService, useValue: { me } }] });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('uses server authorization as the decision and exposes a reactive authorized gate', async () => {
    const auth = TestBed.inject(AdminAccessService);
    publish({ customerId: 'admin-a', source: 'firebase' });
    await vi.waitFor(() => expect(auth.status()).toBe('authorized'));
    expect(auth.authorized()).toBe(true);
    expect(auth.identity()).toEqual(authorized);
    publish({ customerId: 'admin-b', source: 'firebase' });
    expect(auth.authorized()).toBe(false);
    publish({ customerId: 'admin-a', source: 'firebase' });
    expect(auth.authorized()).toBe(false);
    await vi.waitFor(() => expect(auth.status()).toBe('authorized'));

    me.mockResolvedValueOnce(denied);
    auth.retry();
    await vi.waitFor(() => expect(auth.status()).toBe('forbidden'));
    expect(auth.authorized()).toBe(false);
    expect(auth.identity()?.adminEligible).toBe(true);
    expect(auth.identity()?.adminAuthorized).toBe(false);
  });

  it('clears access on sign-out and ignores a late response from the prior session', async () => {
    let finish!: (identity: ApiIdentity) => void;
    me.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const auth = TestBed.inject(AdminAccessService);
    publish({ customerId: 'admin-a', source: 'firebase' });
    await vi.waitFor(() => expect(me).toHaveBeenCalledOnce());
    publish(null);
    expect(auth.authorized()).toBe(false);
    await vi.waitFor(() => expect(auth.status()).toBe('signed-out'));
    finish(authorized);
    await Promise.resolve();
    expect(auth.status()).toBe('signed-out');
    expect(auth.identity()).toBeNull();
    expect(auth.authorized()).toBe(false);
  });

  it('sanitizes unknown API failures and retries explicitly', async () => {
    const auth = TestBed.inject(AdminAccessService);
    publish({ customerId: 'admin-a', source: 'firebase' });
    me.mockRejectedValueOnce(new Error('private token detail'));
    await vi.waitFor(() => expect(auth.status()).toBe('unavailable'));
    expect(auth.apiError()?.message).not.toContain('private token detail');
    me.mockResolvedValueOnce(authorized);
    auth.retry();
    await vi.waitFor(() => expect(auth.status()).toBe('authorized'));
  });

  it('ignores pending identity results after the service is destroyed', async () => {
    let finish!: (identity: ApiIdentity) => void;
    me.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const auth = TestBed.inject(AdminAccessService);
    publish({ customerId: 'admin-a', source: 'firebase' });
    await vi.waitFor(() => expect(me).toHaveBeenCalledOnce());
    TestBed.resetTestingModule();
    finish(authorized);
    await Promise.resolve();
    expect(auth.identity()).toBeNull();
    expect(auth.authorized()).toBe(false);
  });
});

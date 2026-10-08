import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFirebaseAuthDriver } from './firebase-auth.driver';

const sdk = vi.hoisted(() => ({
  getApps: vi.fn(), initializeApp: vi.fn(), initializeAuth: vi.fn(), observe: vi.fn(), popup: vi.fn(), signOut: vi.fn(), parameters: vi.fn(), auth: null as any,
  persistence: { type: 'SESSION' }, resolver: {},
}));
vi.mock('firebase/app', () => ({ getApps: sdk.getApps, initializeApp: sdk.initializeApp }));
vi.mock('firebase/auth', () => ({
  browserSessionPersistence: sdk.persistence, browserPopupRedirectResolver: sdk.resolver,
  initializeAuth: sdk.initializeAuth, onAuthStateChanged: sdk.observe, signInWithPopup: sdk.popup, signOut: sdk.signOut,
  GoogleAuthProvider: class { setCustomParameters = sdk.parameters; },
}));

describe('modular Firebase auth driver', () => {
  beforeEach(() => {
    vi.clearAllMocks(); sdk.getApps.mockReturnValue([]); sdk.initializeApp.mockReturnValue({ name: 'solar-storefront' });
    sdk.auth = { name: 'auth', currentUser: null }; sdk.initializeAuth.mockReturnValue(sdk.auth); sdk.observe.mockReturnValue(vi.fn());
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'browser' }] });
  });
  it('uses the dedicated app, session-only persistence, and account selection without extra scopes', async () => {
    const driver = TestBed.runInInjectionContext(createFirebaseAuthDriver)!;
    expect(sdk.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'dumaget-me-solar', appId: '1:177959719186:web:1f99f7ab52c55a889723cb' }), 'solar-storefront');
    expect(sdk.initializeAuth).toHaveBeenCalledWith({ name: 'solar-storefront' }, { persistence: sdk.persistence, popupRedirectResolver: sdk.resolver });
    expect(sdk.parameters).toHaveBeenCalledWith({ prompt: 'select_account' });
    await driver.signInGoogle(); expect(sdk.popup).toHaveBeenCalledOnce();
    await driver.signOut(); expect(sdk.signOut).toHaveBeenCalledWith(sdk.auth);
  });
  it('maps observer users to minimal provider-owned identities and forwards cleanup/failure', () => {
    const driver = TestBed.runInInjectionContext(createFirebaseAuthDriver)!; const next = vi.fn(); const failure = vi.fn();
    const cleanup = driver.observe(next, failure);
    const callback = sdk.observe.mock.calls[0][1];
    callback({ uid: 'user', displayName: 'Customer', email: 'not-app-state@example.test', accessToken: 'SECRET' });
    expect(next).toHaveBeenLastCalledWith({ customerId: 'user', displayName: 'Customer', source: 'firebase' });
    callback(null); expect(next).toHaveBeenLastCalledWith(null);
    expect(sdk.observe.mock.calls[0][2]).toBe(failure); expect(cleanup).toBe(sdk.observe.mock.results[0].value);
  });
  it('returns an ID token only for the exact current SDK user before and after token resolution', async () => {
    const driver = TestBed.runInInjectionContext(createFirebaseAuthDriver)!;
    const userA = { uid: 'a', getIdToken: vi.fn(async (force?: boolean): Promise<string> => force ? 'fresh-a' : 'token-a') };
    const userB = { uid: 'b', getIdToken: vi.fn(async () => 'token-b') };
    sdk.auth.currentUser = userA;
    expect(await driver.getIdToken!('b')).toBeNull();
    expect(userA.getIdToken).not.toHaveBeenCalled();
    expect(await driver.getIdToken!('a', true)).toBe('fresh-a');
    expect(userA.getIdToken).toHaveBeenCalledWith(true);

    let finish!: (token: string) => void;
    userA.getIdToken.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = driver.getIdToken!('a');
    sdk.auth.currentUser = userB;
    finish('stale-a');
    expect(await pending).toBeNull();
  });
  it('reuses the named app and fails closed outside the browser or on initialization failure', () => {
    sdk.getApps.mockReturnValue([{ name: 'solar-storefront' }]);
    expect(TestBed.runInInjectionContext(createFirebaseAuthDriver)).not.toBeNull(); expect(sdk.initializeApp).not.toHaveBeenCalled();
    sdk.initializeAuth.mockImplementationOnce(() => { throw new Error('SECRET'); });
    expect(TestBed.runInInjectionContext(createFirebaseAuthDriver)).toBeNull();
    TestBed.resetTestingModule(); TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    const calls = sdk.initializeAuth.mock.calls.length;
    expect(TestBed.runInInjectionContext(createFirebaseAuthDriver)).toBeNull(); expect(sdk.initializeAuth).toHaveBeenCalledTimes(calls);
  });
});

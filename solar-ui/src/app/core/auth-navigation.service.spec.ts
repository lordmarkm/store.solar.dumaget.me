import { Dialog } from '@angular/cdk/dialog';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { routes } from '../app.routes';
import { ShoppingShell } from '../shared/shopping-shell';
import { AdminAccessService } from './admin-access.service';
import { AuthNavigationService } from './auth-navigation.service';
import { AUTH_DRIVER, AuthDriver, AuthSessionService } from './auth-session.service';
import { BomService, DRAFT_KEY } from './bom.service';
import { CUSTOMER_SESSION, CustomerAccessService, CustomerSession, PENDING_CUSTOMER_ACTION_KEY } from './customer-access.service';
import { ApiIdentity, StoreApiService } from './store-api.service';
import { ThemeService } from './theme.service';

@Component({ template: '' })
class EmptyPage {}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
}

function identity(adminAuthorized: boolean, uid = 'admin-a'): ApiIdentity {
  return { uid, email: 'admin@solar.dumaget.me', emailVerified: true, adminEligible: true, adminAuthorized };
}

async function settle() {
  for (let index = 0; index < 3; index++) {
    TestBed.tick();
    await Promise.resolve();
  }
  TestBed.tick();
}

describe('user-initiated Google sign-in navigation', () => {
  let publish: (session: CustomerSession | null) => void;
  let failObserver: () => void;
  let driver: AuthDriver;
  let popup: ReturnType<typeof deferred<void>>;
  let me: ReturnType<typeof vi.fn<() => Promise<ApiIdentity>>>;
  let openDialog: ReturnType<typeof vi.fn>;
  let auth: AuthSessionService;
  let admin: AdminAccessService;
  let login: AuthNavigationService;
  let access: CustomerAccessService;
  let router: Router;
  let navigate: MockInstance<Router['navigateByUrl']>;

  beforeEach(async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
    popup = deferred<void>();
    driver = {
      observe: vi.fn((next, failure) => { publish = next; failObserver = failure; return vi.fn(); }),
      signInGoogle: vi.fn(() => popup.promise),
      signOut: vi.fn(async () => {}),
      getIdToken: vi.fn(async () => 'injected-token'),
    };
    me = vi.fn(async () => identity(false));
    openDialog = vi.fn(() => ({ closed: new Subject<void>(), close: vi.fn() }));
    const adminRedirect = routes.flatMap(route => route.children ?? []).find(route => route.path === 'admin');
    if (!adminRedirect) throw new Error('The actual /admin redirect route is missing');
    TestBed.configureTestingModule({ providers: [
      provideRouter([
        { path: 'catalog', component: EmptyPage },
        { path: 'draft', component: EmptyPage },
        adminRedirect,
        { path: 'admin/products', component: EmptyPage },
      ]),
      { provide: AUTH_DRIVER, useValue: driver },
      { provide: StoreApiService, useValue: { me } },
      { provide: Dialog, useValue: { open: openDialog } },
      { provide: BomService, useValue: { count: signal(3) } },
      { provide: ThemeService, useValue: { dark: signal(false), toggle: vi.fn() } },
      { provide: CUSTOMER_SESSION, useFactory: () => TestBed.inject(AuthSessionService).session },
    ] });
    auth = TestBed.inject(AuthSessionService);
    admin = TestBed.inject(AdminAccessService);
    login = TestBed.inject(AuthNavigationService);
    access = TestBed.inject(CustomerAccessService);
    publish(null);
    await RouterTestingHarness.create('/catalog');
    router = TestBed.inject(Router);
    navigate = vi.spyOn(router, 'navigateByUrl');
    await settle();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function observedLoginAwaitingServer() {
    const server = deferred<ApiIdentity>();
    me.mockReturnValueOnce(server.promise);
    const signingIn = login.signInGoogle();
    publish({ customerId: 'admin-a', source: 'firebase' });
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    popup.resolve();
    await signingIn;
    await settle();
    expect(me).toHaveBeenCalledOnce();
    expect(admin.authorized()).toBe(false);
    return server;
  }

  it('calls the popup driver synchronously from the header without a dialog and disables the busy button', async () => {
    const fixture = TestBed.createComponent(ShoppingShell);
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('header button')]
      .find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === 'Sign in') as HTMLButtonElement;
    expect(button).toBeDefined();
    button.click();
    expect(driver.signInGoogle).toHaveBeenCalledOnce();
    expect(openDialog).not.toHaveBeenCalled();
    expect(auth.busy()).toBe(true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    button.click();
    expect(driver.signInGoogle).toHaveBeenCalledOnce();
    popup.resolve();
    await settle();
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });

  it('retains customer intent and cart while requestSignIn opens the popup immediately and awaits server authorization', async () => {
    const cart = '[{"productId":"osda-620","quantity":3}]';
    localStorage.setItem(DRAFT_KEY, cart);
    const action = { kind: 'product' as const, returnUrl: '/catalog', pending: {
      product: { productId: 'osda-620', variantId: null, unitCode: 'panel' }, quantity: 3,
    } };
    const server = deferred<ApiIdentity>();
    me.mockReturnValueOnce(server.promise);
    const signingIn = access.requestSignIn(action);
    expect(driver.signInGoogle).toHaveBeenCalledOnce();
    expect(openDialog).not.toHaveBeenCalled();
    const retained = sessionStorage.getItem(PENDING_CUSTOMER_ACTION_KEY);
    expect(access.pending()).toEqual(action);
    publish({ customerId: 'admin-a', source: 'firebase' });
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    popup.resolve();
    await signingIn;
    await settle();
    expect(me).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    server.resolve(identity(true));
    await settle();
    await vi.waitFor(() => expect(router.url).toBe('/admin/products'));
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/admin');
    expect(localStorage.getItem(DRAFT_KEY)).toBe(cart);
    expect(sessionStorage.getItem(PENDING_CUSTOMER_ACTION_KEY)).toBe(retained);
    expect(access.pending()).toEqual(action);
  });

  it('prevents duplicate popups and never treats popup completion as an observed identity', async () => {
    const first = login.signInGoogle();
    await login.signInGoogle();
    await access.requestSignIn();
    expect(driver.signInGoogle).toHaveBeenCalledOnce();
    popup.resolve();
    await first;
    await settle();
    expect(auth.session()).toBeNull();
    expect(me).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not redirect a domain-eligible account that the server forbids', async () => {
    const server = await observedLoginAwaitingServer();
    server.resolve(identity(false));
    await settle();
    expect(admin.status()).toBe('forbidden');
    expect(admin.identity()?.adminEligible).toBe(true);
    expect(admin.authorized()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not redirect a restored authorized session without a user login request', async () => {
    me.mockResolvedValueOnce(identity(true));
    publish({ customerId: 'admin-a', source: 'firebase' });
    await settle();
    expect(admin.authorized()).toBe(true);
    await login.signInGoogle();
    expect(driver.signInGoogle).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['auth/popup-closed-by-user', 'auth/popup-blocked'])('permits an immediate retry after %s without losing intent or cart', async code => {
    const cart = '[{"productId":"osda-620","quantity":3}]';
    localStorage.setItem(DRAFT_KEY, cart);
    access.retain({ kind: 'route', returnUrl: '/draft' });
    const retained = sessionStorage.getItem(PENDING_CUSTOMER_ACTION_KEY);
    vi.mocked(driver.signInGoogle).mockRejectedValueOnce({ code, message: 'SECRET provider detail' });
    await access.requestSignIn();
    expect(auth.error()).not.toContain('SECRET');
    expect(auth.error()).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    const retry = access.requestSignIn();
    expect(driver.signInGoogle).toHaveBeenCalledTimes(2);
    expect(openDialog).not.toHaveBeenCalled();
    expect(auth.error()).toBeNull();
    expect(sessionStorage.getItem(PENDING_CUSTOMER_ACTION_KEY)).toBe(retained);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(cart);
    popup.resolve();
    await retry;
  });

  it.each(['signed-in', 'unavailable'])('keeps the account review dialog for %s without opening a popup', async state => {
    if (state === 'signed-in') publish({ customerId: 'admin-a', source: 'firebase' });
    else failObserver();
    await settle();
    await access.requestSignIn();
    expect(openDialog).toHaveBeenCalledOnce();
    expect(driver.signInGoogle).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['sign-out', 'account switch', 'navigation', 'observer failure'])('cancels a delayed authorized redirect after %s', async change => {
    const server = await observedLoginAwaitingServer();
    if (change === 'sign-out') {
      await auth.signOut();
      publish(null);
    } else if (change === 'account switch') {
      me.mockImplementation(async () => identity(true, auth.session()!.customerId));
      publish({ customerId: 'admin-b', source: 'firebase' });
      await settle();
      publish({ customerId: 'admin-a', source: 'firebase' });
    } else if (change === 'navigation') {
      await router.navigateByUrl('/draft');
    } else failObserver();
    await settle();
    server.resolve(identity(true));
    await settle();
    expect(navigate).not.toHaveBeenCalledWith('/admin');
    expect(router.url).toBe(change === 'navigation' ? '/draft' : '/catalog');
  });

  it('ignores delayed authorization after injector destruction', async () => {
    const server = await observedLoginAwaitingServer();
    TestBed.resetTestingModule();
    server.resolve(identity(true));
    await Promise.resolve();
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
  });
});

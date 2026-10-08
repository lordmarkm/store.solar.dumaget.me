import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { App } from '../app';
import { routes } from '../app.routes';
import { AUTH_DRIVER, AuthDriver, AuthSessionService } from './auth-session.service';
import { CUSTOMER_SESSION, CustomerSession } from './customer-access.service';
import { AdminApiPath, ApiIdentity, StoreApiService } from './store-api.service';

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

async function settle() {
  for (let index = 0; index < 3; index++) {
    TestBed.tick();
    await Promise.resolve();
  }
  TestBed.tick();
}

describe('confirmed sign-out navigation from the initialized app', () => {
  let publish: (session: CustomerSession | null) => void;
  let failObserver: () => void;
  let driver: AuthDriver;
  let logout: ReturnType<typeof deferred<void>>;
  let popup: ReturnType<typeof deferred<void>>;
  let auth: AuthSessionService;
  let router: Router;
  let root: ComponentFixture<App>;
  let navigate: MockInstance<Router['navigateByUrl']>;
  let adminRole: boolean;
  let originalDark: boolean;
  let originalTheme: string | undefined;

  beforeEach(async () => {
    originalDark = document.documentElement.classList.contains('dark');
    originalTheme = document.documentElement.dataset['solarTheme'];
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
    logout = deferred<void>();
    popup = deferred<void>();
    adminRole = false;
    driver = {
      observe: vi.fn((next, fail) => { publish = next; failObserver = fail; return vi.fn(); }),
      signOut: vi.fn(() => logout.promise),
      signInGoogle: vi.fn(() => popup.promise),
      getIdToken: vi.fn(async () => 'injected-token'),
    };
    const api = {
      me: vi.fn(async (): Promise<ApiIdentity> => ({
        uid: auth.session()!.customerId, email: adminRole ? 'admin@solar.dumaget.me' : 'customer@example.test',
        emailVerified: true, adminEligible: adminRole, adminAuthorized: adminRole,
      })),
      profile: vi.fn(async () => ({ profile: null, version: null })),
      saveProfile: vi.fn(async () => ({ profile: null, version: null })),
      adminRequest: vi.fn(async (_path: AdminApiPath, _method: 'GET' | 'POST', _body: unknown,
        parse: (value: unknown) => unknown) => parse({ items: [], nextCursor: null })),
    };
    TestBed.configureTestingModule({ providers: [
      provideRouter(routes),
      { provide: AUTH_DRIVER, useValue: driver },
      { provide: StoreApiService, useValue: api },
      { provide: CUSTOMER_SESSION, useFactory: () => TestBed.inject(AuthSessionService).session },
    ] });
    auth = TestBed.inject(AuthSessionService);
    publish(null);
    // App itself must initialize the coordinator; these tests never inject it.
    root = TestBed.createComponent(App);
    root.detectChanges();
    router = TestBed.inject(Router);
    await router.navigateByUrl('/catalog');
    await settle();
    navigate = vi.spyOn(router, 'navigateByUrl');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.classList.toggle('dark', originalDark);
    if (originalTheme === undefined) delete document.documentElement.dataset['solarTheme'];
    else document.documentElement.dataset['solarTheme'] = originalTheme;
  });

  async function restoreAccount() {
    publish({ customerId: adminRole ? 'admin-a' : 'customer-a', source: 'firebase' });
    await settle();
    expect(auth.status()).toBe('signed-in');
    expect(navigate).not.toHaveBeenCalled();
  }

  async function expectGoodbye() {
    await settle();
    await vi.waitFor(() => expect(router.url).toBe('/goodbye'));
    root.detectChanges();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/goodbye', { replaceUrl: true });
    expect(auth.signOutRevision()).toBe(1);
    expect(auth.signOutPending()).toBe(false);
    expect(auth.session()).toBeNull();
    expect(root.nativeElement.querySelector('app-shopping-shell app-goodbye')).not.toBeNull();
    expect(root.nativeElement.querySelector('app-goodbye').textContent).toContain('You’re signed out.');
    expect(root.nativeElement.querySelector('app-goodbye a').getAttribute('href')).toBe('/');
  }

  it.each(['observer-first', 'promise-first'])('waits for both confirmation signals when logout is %s', async order => {
    await restoreAccount();
    const pending = auth.signOut();
    expect(driver.signOut).toHaveBeenCalledOnce();
    expect(auth.signOutPending()).toBe(true);
    if (order === 'observer-first') publish(null);
    else { logout.resolve(); await pending; }
    await settle();
    expect(auth.signOutRevision()).toBe(0);
    expect(auth.signOutPending()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    if (order === 'observer-first') { logout.resolve(); await pending; }
    else publish(null);
    await expectGoodbye();
  });

  it('keeps the observed account and current page when sign-out rejects', async () => {
    await restoreAccount();
    const account = auth.session();
    const pending = auth.signOut();
    logout.reject(new Error('SECRET driver error'));
    await pending;
    await settle();
    expect(auth.session()).toEqual(account);
    expect(auth.status()).toBe('signed-in');
    expect(auth.signOutRevision()).toBe(0);
    expect(auth.signOutPending()).toBe(false);
    expect(auth.busy()).toBe(false);
    expect(auth.error()).toContain('Unable to sign out');
    expect(auth.error()).not.toContain('SECRET');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not treat initial guest restoration or an external null session as a successful logout', async () => {
    publish(null);
    await settle();
    await auth.signOut();
    expect(driver.signOut).not.toHaveBeenCalled();
    await restoreAccount();
    publish(null);
    await settle();
    expect(auth.status()).toBe('signed-out');
    expect(auth.signOutRevision()).toBe(0);
    expect(navigate).not.toHaveBeenCalled();
    expect(router.url).toBe('/catalog');
  });

  it.each(['account switch', 'same-account observer', 'observer failure'])('ignores stale logout fulfillment after %s', async change => {
    await restoreAccount();
    const pending = auth.signOut();
    // Even an earlier null is not sufficient once a subsequent event invalidates it.
    publish(null);
    if (change === 'observer failure') failObserver();
    else publish({ customerId: change === 'account switch' ? 'customer-b' : 'customer-a', source: 'firebase' });
    await settle();
    logout.resolve();
    await pending;
    await settle();
    expect(auth.signOutRevision()).toBe(0);
    expect(auth.signOutPending()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(router.url).toBe('/catalog');
  });

  it.each(['customer', 'admin'])('sends a confirmed %s logout to the same public goodbye route', async role => {
    adminRole = role === 'admin';
    await restoreAccount();
    if (adminRole) {
      await router.navigateByUrl('/admin/products');
      await settle();
      navigate.mockClear();
    }
    const pending = auth.signOut();
    publish(null);
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    logout.resolve();
    await pending;
    await expectGoodbye();
  });

  it('renders the canonical goodbye page without claiming a still-observed account signed out, and its root link returns home', async () => {
    await restoreAccount();
    await router.navigateByUrl('/goodbye');
    await settle();
    root.detectChanges();
    const page = root.nativeElement.querySelector('app-shopping-shell app-goodbye') as HTMLElement;
    expect(page).not.toBeNull();
    expect(page.textContent).toContain('Goodbye!');
    expect(page.textContent).not.toContain('You’re signed out.');
    const home = page.querySelector('a')!;
    expect(home.textContent).toContain('Back to home');
    expect(home.getAttribute('href')).toBe('/');
    home.click();
    await settle();
    await vi.waitFor(() => expect(router.url).toBe('/catalog'));
    expect(auth.status()).toBe('signed-in');
  });

  it('shows disabled pending login buttons with no Cancel sign-in button in the header or sign-in panel', async () => {
    await router.navigateByUrl('/sign-in');
    await settle();
    root.detectChanges();
    const google = [...root.nativeElement.querySelectorAll('app-sign-in-panel button')]
      .find((button: HTMLButtonElement) => button.textContent?.trim() === 'Continue with Google') as HTMLButtonElement;
    expect(google).toBeDefined();
    google.click();
    expect(driver.signInGoogle).toHaveBeenCalledOnce();
    expect(auth.busy()).toBe(true);
    root.detectChanges();
    const buttons = [...root.nativeElement.querySelectorAll('header button, app-sign-in-panel button')] as HTMLButtonElement[];
    expect(buttons.some(button => /cancel/i.test(`${button.textContent} ${button.getAttribute('aria-label') ?? ''}`))).toBe(false);
    const pendingButtons = buttons.filter(button => button.textContent?.includes('Opening Google sign-in'));
    expect(pendingButtons).toHaveLength(2);
    expect(pendingButtons.every(button => button.disabled)).toBe(true);
    popup.resolve();
    await settle();
  });
});

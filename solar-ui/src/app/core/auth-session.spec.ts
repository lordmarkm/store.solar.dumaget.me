import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { SignInPanel } from '../shared/sign-in-panel';
import { AUTH_DRIVER, AuthDriver, AuthSessionService, authErrorMessage, SIGN_IN_RETURN_GRACE_MS, SIGN_IN_MAX_WAIT_MS } from './auth-session.service';
import { CUSTOMER_SESSION, CustomerAccessService, CustomerSession, PENDING_CUSTOMER_ACTION_KEY } from './customer-access.service';
import { LOCAL_CUSTOMER_ID, LOCAL_PROJECTS_KEY, ProjectService } from './project.service';
import { LEGACY_DRAFT_KEY } from './guest-lists';
import { createNewProjectDraft } from './models';

describe('provider-owned Google auth session', () => {
  let publish: (session: CustomerSession | null) => void;
  let fail: () => void;
  let driver: AuthDriver;
  let unsubscribe: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    const storage = () => {
      const values = new Map<string, string>();
      return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
    };
    vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
    unsubscribe = vi.fn();
    driver = { observe: vi.fn((next, error) => { publish = next; fail = error; return unsubscribe; }), signInGoogle: vi.fn(async () => {}), signOut: vi.fn(async () => {}), getIdToken: vi.fn(async () => 'token-a') };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: AUTH_DRIVER, useValue: driver }, { provide: CUSTOMER_SESSION, useFactory: () => TestBed.inject(AuthSessionService).session }] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('cancels a never-settling popup wait immediately and ignores its late failure during retry', async () => {
    let rejectOld!: (error: unknown) => void;
    let finishNew!: () => void;
    vi.mocked(driver.signInGoogle)
      .mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOld = reject; }))
      .mockImplementationOnce(() => new Promise<void>(resolve => { finishNew = resolve; }));
    const auth = TestBed.inject(AuthSessionService); publish(null);
    const old = auth.signInGoogle();
    expect(auth.busy()).toBe(true);
    auth.cancelSignIn(); await old;
    expect(auth.busy()).toBe(false); expect(auth.session()).toBeNull();
    expect(auth.error()).toContain('did not finish');
    const retry = auth.signInGoogle();
    rejectOld({ code: 'auth/popup-closed-by-user' }); await Promise.resolve();
    expect(auth.busy()).toBe(true); expect(auth.error()).toBeNull();
    finishNew(); await retry;
    expect(driver.signInGoogle).toHaveBeenCalledTimes(2);
    expect(auth.busy()).toBe(false); expect(auth.session()).toBeNull();
  });

  it('recovers an unconfirmed popup wait after leaving and returning to the page', async () => {
    vi.useFakeTimers();
    vi.mocked(driver.signInGoogle).mockImplementation(() => new Promise<void>(() => {}));
    const auth = TestBed.inject(AuthSessionService); publish(null);
    const pending = auth.signInGoogle();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(SIGN_IN_RETURN_GRACE_MS);
    expect(auth.busy()).toBe(true); // Focus alone is not evidence of a popup.
    window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(SIGN_IN_RETURN_GRACE_MS);
    await pending;
    expect(auth.busy()).toBe(false); expect(auth.session()).toBeNull();
    expect(auth.error()).toContain('did not finish');
  });

  it('allows a real observed login to finish during the popup return grace', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    vi.mocked(driver.signInGoogle).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const auth = TestBed.inject(AuthSessionService); publish(null);
    const pending = auth.signInGoogle();
    window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus'));
    publish({ customerId: 'real', source: 'firebase' });
    await vi.advanceTimersByTimeAsync(SIGN_IN_RETURN_GRACE_MS);
    expect(auth.busy()).toBe(true); expect(auth.error()).toBeNull();
    finish(); await pending;
    expect(auth.busy()).toBe(false); expect(auth.status()).toBe('signed-in');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds popup waits even when the browser emits no focus or closure events', async () => {
    vi.useFakeTimers();
    vi.mocked(driver.signInGoogle).mockImplementation(() => new Promise<void>(() => {}));
    const auth = TestBed.inject(AuthSessionService); publish(null);
    const pending = auth.signInGoogle();
    await vi.advanceTimersByTimeAsync(SIGN_IN_MAX_WAIT_MS);
    await pending;
    expect(auth.busy()).toBe(false); expect(auth.session()).toBeNull();
    expect(auth.error()).toContain('took too long'); expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for restoration and never trusts browser auth flags', async () => {
    localStorage.setItem('solar.auth.session.v1', JSON.stringify({ customerId: LOCAL_CUSTOMER_ID }));
    const auth = TestBed.inject(AuthSessionService);
    expect(auth.status()).toBe('initializing'); expect(auth.session()).toBeNull();
    await auth.signInGoogle(); expect(driver.signInGoogle).not.toHaveBeenCalled();
    publish(null); expect(auth.status()).toBe('signed-out');
    expect(TestBed.inject(CustomerAccessService).canAccessProjects()).toBe(false);
  });

  it('uses observer identity, supports account changes/sign-out, and never adopts synthetic ownership', async () => {
    const auth = TestBed.inject(AuthSessionService); const access = TestBed.inject(CustomerAccessService);
    publish({ customerId: 'real-one', displayName: 'Test user', source: 'firebase' });
    expect(auth.displayName()).toBe('Test user'); expect(access.signedIn()).toBe(true); expect(access.canAccessProjects()).toBe(true);
    expect(access.projectAccessHint()).toBe('Add to project');
    publish({ customerId: LOCAL_CUSTOMER_ID, source: 'firebase' });
    expect(access.canAccessProjects()).toBe(true); expect(auth.displayName()).toBe('Your account');
    await auth.signOut(); expect(driver.signOut).toHaveBeenCalledOnce();
    // Resolving the request alone is not proof that the SDK session has ended.
    expect(auth.status()).toBe('signed-in');
    publish(null); expect(auth.status()).toBe('signed-out'); expect(access.signedIn()).toBe(false);
  });

  it('prevents duplicate popups and publishes no promise-result identity', async () => {
    let finish!: () => void;
    vi.mocked(driver.signInGoogle).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const auth = TestBed.inject(AuthSessionService); publish(null);
    const pending = auth.signInGoogle(); await auth.signInGoogle();
    expect(auth.busy()).toBe(true); expect(driver.signInGoogle).toHaveBeenCalledOnce();
    finish(); await pending; expect(auth.busy()).toBe(false); expect(auth.session()).toBeNull();
  });

  it('sanitizes popup, provider, network, and unknown errors and allows retry', async () => {
    const auth = TestBed.inject(AuthSessionService); publish(null);
    for (const code of ['auth/popup-closed-by-user', 'auth/popup-blocked', 'auth/unauthorized-domain', 'auth/operation-not-allowed', 'auth/network-request-failed', 'unknown']) {
      vi.mocked(driver.signInGoogle).mockRejectedValueOnce({ code, message: 'SECRET token and email', credential: 'SECRET' });
      await auth.signInGoogle(); expect(auth.busy()).toBe(false); expect(auth.error()).not.toContain('SECRET'); expect(auth.session()).toBeNull();
    }
    await auth.signInGoogle(); expect(auth.error()).toBeNull();
    expect(authErrorMessage({ code: 'auth/account-exists-with-different-credential' })).toContain('not linked');
  });

  it('fails closed on observer errors and keeps sign-out failures visible', async () => {
    const auth = TestBed.inject(AuthSessionService); publish({ customerId: 'real', source: 'firebase' });
    vi.mocked(driver.signOut).mockRejectedValueOnce(new Error('SECRET'));
    await auth.signOut(); expect(auth.session()?.customerId).toBe('real'); expect(auth.error()).toContain('session may still be active');
    fail(); expect(auth.status()).toBe('unavailable'); expect(auth.session()).toBeNull();
    expect(TestBed.inject(CustomerAccessService).canAccessProjects()).toBe(false);
  });

  it('returns a token only while the same Firebase session revision remains current', async () => {
    const auth = TestBed.inject(AuthSessionService);
    publish({ customerId: 'account-a', source: 'firebase' });
    let finish!: (token: string) => void;
    vi.mocked(driver.getIdToken!).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = auth.idToken();
    publish({ customerId: 'account-b', source: 'firebase' });
    finish('stale-token');
    expect(await pending).toBeNull();

    let finishAgain!: (token: string) => void;
    publish({ customerId: 'account-a', source: 'firebase' });
    vi.mocked(driver.getIdToken!).mockImplementation(() => new Promise(resolve => { finishAgain = resolve; }));
    const pendingAgain = auth.idToken(true);
    publish({ customerId: 'account-b', source: 'firebase' });
    publish({ customerId: 'account-a', source: 'firebase' });
    finishAgain('stale-token');
    expect(await pendingAgain).toBeNull();
    expect(driver.getIdToken).toHaveBeenNthCalledWith(1, 'account-a', false);
    expect(driver.getIdToken).toHaveBeenNthCalledWith(2, 'account-a', true);
  });

  it('does not request tokens when signed out, unavailable, busy, or on test-only identities', async () => {
    const auth = TestBed.inject(AuthSessionService);
    expect(await auth.idToken()).toBeNull();
    publish({ customerId: 'test-account' });
    expect(await auth.idToken()).toBeNull();
    publish({ customerId: 'firebase-account', source: 'firebase' });
    auth.busy.set(true);
    expect(await auth.idToken()).toBeNull();
    auth.busy.set(false);
    fail();
    expect(await auth.idToken()).toBeNull();
    expect(driver.getIdToken).not.toHaveBeenCalled();
  });

  it('unsubscribes and ignores late provider callbacks or popup failures on destruction', async () => {
    let reject!: (error: unknown) => void;
    vi.mocked(driver.signInGoogle).mockImplementation(() => new Promise<void>((_, fail) => { reject = fail; }));
    const auth = TestBed.inject(AuthSessionService); publish(null); const operation = auth.signInGoogle();
    TestBed.resetTestingModule(); expect(unsubscribe).toHaveBeenCalledOnce();
    publish({ customerId: 'late', source: 'firebase' }); reject({ code: 'auth/popup-blocked' }); await operation;
    expect(auth.session()).toBeNull(); expect(auth.error()).toBeNull();
  });

  it('does not expose local projects or alter guest data/pending intent after Google sign-in', async () => {
    const projects = TestBed.inject(ProjectService);
    projects.create({ ...createNewProjectDraft(), name: 'Private preview project', classification: 'residential', configuration: 'hybrid', workScope: 'new-installation' }, 'seed');
    const beforeProjects = localStorage.getItem(LOCAL_PROJECTS_KEY);
    localStorage.setItem(LEGACY_DRAFT_KEY, '[{"productId":"osda-620","quantity":3}]');
    const guest = localStorage.getItem(LEGACY_DRAFT_KEY);
    const auth = TestBed.inject(AuthSessionService); const access = TestBed.inject(CustomerAccessService);
    access.retain({ kind: 'product', returnUrl: '/catalog', pending: { product: { productId: 'osda-620', variantId: null, unitCode: 'panel' }, quantity: 3 } });
    const intent = sessionStorage.getItem(PENDING_CUSTOMER_ACTION_KEY);
    publish({ customerId: 'real-account', displayName: 'Customer', source: 'firebase' });
    const harness = await RouterTestingHarness.create('/my/projects/preview-seed/bom');
    expect(harness.routeNativeElement?.textContent).toContain('Project not found');
    expect(harness.routeNativeElement?.textContent).not.toContain('Private preview project');
    publish(null); harness.fixture.detectChanges();
    expect(sessionStorage.getItem(PENDING_CUSTOMER_ACTION_KEY)).toBe(intent);
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(beforeProjects);
    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).toBe(guest);
  });

  it('renders restoration, Google action, errors, and signed-in state without credential inputs', async () => {
    const fixture = TestBed.createComponent(SignInPanel); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Checking sign-in');
    publish(null); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(false); expect(button.textContent).toContain('Continue with Google');
    vi.mocked(driver.signInGoogle).mockRejectedValueOnce({ code: 'auth/popup-blocked' });
    button.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('blocked');
    publish({ customerId: 'real', displayName: '<Account>', source: 'firebase' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('<Account>'); expect(fixture.nativeElement.textContent).toContain('not assigned');
    expect(fixture.nativeElement.querySelector('input,form,img')).toBeNull();
  });
});

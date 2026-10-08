import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_DRIVER, AuthDriver, AuthSessionService } from './auth-session.service';
import { CUSTOMER_SESSION, CustomerAccessService, CustomerSession } from './customer-access.service';
import { customerGuard } from './customer.guard';
import { StoreApiService } from './store-api.service';

@Component({ template: '<h1>Account project</h1>' })
class PrivatePage {}
@Component({ template: '<h1>Sign in</h1>' })
class PublicPage {}

describe('account customer access and restoration guard', () => {
  let publish: (session: CustomerSession | null) => void;
  let failure: () => void;
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    const driver: AuthDriver = {
      observe: (next, fail) => { publish = next; failure = fail; return vi.fn(); },
      signInGoogle: async () => {}, signOut: async () => {},
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'my/projects/:projectId/bom', component: PrivatePage, canActivate: [customerGuard] },
          { path: 'sign-in', component: PublicPage },
        ]),
        { provide: AUTH_DRIVER, useValue: driver },
        { provide: CUSTOMER_SESSION, useFactory: () => TestBed.inject(AuthSessionService).session },
        { provide: StoreApiService, useValue: { me: vi.fn(async () => ({ uid: TestBed.inject(AuthSessionService).session()?.customerId, email: null, emailVerified: false, adminEligible: false, adminAuthorized: false })) } },
      ],
    });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('waits for observer restoration and opens the original deep link without redirecting or applying pending intent', async () => {
    const auth = TestBed.inject(AuthSessionService), access = TestBed.inject(CustomerAccessService);
    access.retain({ kind: 'guest-list', returnUrl: '/draft', guest: { listId: 'guest-retained', fingerprint: 'reviewed' } });
    const retained = access.pending();
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/my/projects/project-id/bom');
    await Promise.resolve(); TestBed.tick();
    expect(auth.status()).toBe('initializing');
    expect(harness.routeNativeElement?.textContent ?? '').not.toContain('Account project');
    publish({ customerId: 'restored-user', source: 'firebase' });
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/my/projects/project-id/bom');
    expect(harness.routeNativeElement?.textContent).toContain('Account project');
    expect(access.pending()).toEqual(retained);
  });

  it('redirects only after the observer confirms signed-out, preserving the deep-link return URL', async () => {
    TestBed.inject(AuthSessionService);
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/my/projects/project-id/bom');
    await Promise.resolve(); TestBed.tick();
    publish(null);
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/sign-in?returnUrl=%2Fmy%2Fprojects%2Fproject-id%2Fbom');
    expect(TestBed.inject(CustomerAccessService).pending()).toEqual({ kind: 'route', returnUrl: '/my/projects/project-id/bom' });
  });

  it('settles a failed restoration without exposing private UI', async () => {
    TestBed.inject(AuthSessionService);
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/my/projects/project-id/bom');
    await Promise.resolve(); TestBed.tick(); failure();
    await navigation;
    expect(TestBed.inject(Router).url).toContain('/sign-in');
    expect(harness.routeNativeElement?.textContent).not.toContain('Account project');
  });

  it('grants live Firebase project access independently of admin eligibility and revokes it synchronously while busy or signed out', () => {
    const auth = TestBed.inject(AuthSessionService), access = TestBed.inject(CustomerAccessService);
    publish({ customerId: 'ordinary-customer', source: 'firebase' });
    expect(access.canAccessProjects()).toBe(true);
    const key = access.projectSessionKey();
    publish({ customerId: 'another-customer', source: 'firebase' });
    expect(access.canAccessProjects()).toBe(true);
    expect(access.projectSessionKey()).not.toBe(key);
    auth.busy.set(true); expect(access.canAccessProjects()).toBe(false);
    auth.busy.set(false); expect(access.canAccessProjects()).toBe(true);
    publish(null); expect(access.canAccessProjects()).toBe(false);
    expect(access.projectAccessHint()).toBe('Sign in to add to project');
  });
});

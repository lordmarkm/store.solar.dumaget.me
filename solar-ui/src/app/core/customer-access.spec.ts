import { Dialog } from '@angular/cdk/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { CUSTOMER_SESSION, CustomerAccessService, PENDING_CUSTOMER_ACTION_KEY, safeCustomerReturnUrl } from './customer-access.service';
import { LEGACY_DRAFT_KEY } from './guest-lists';
import { BomService } from './bom.service';
import { LOCAL_CUSTOMER_ID, LOCAL_PROJECTS_KEY, ProjectService } from './project.service';
import { createNewProjectDraft } from './models';
import { PRODUCTS } from './demo-data';
import { PLANNING_PRODUCTS } from './product-source';
import { PublicCatalogService } from './public-catalog.service';

describe('customer access and pending sign-in actions', () => {
  let localValues: Map<string, string>;
  let sessionValues: Map<string, string>;
  let sessionWriteBlocked: boolean;
  const catalogFixture = () => {
    const products = signal(PRODUCTS);
    return { products, service: { items: products, products, loading: signal(false), error: signal(null), nextCursor: signal(null), ensureLoaded() {}, refresh: async () => {}, loadMore: async () => {}, checkProduct: async (id: string) => products().find(p => p.id === id)! } };
  };

  const storage = (values: Map<string, string>, blocked?: () => boolean) => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (blocked?.()) throw new Error('Storage unavailable');
      values.set(key, String(value));
    },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  });

  beforeEach(() => {
    localValues = new Map();
    sessionValues = new Map();
    sessionWriteBlocked = false;
    vi.stubGlobal('localStorage', storage(localValues));
    vi.stubGlobal('sessionStorage', storage(sessionValues, () => sessionWriteBlocked));
    const catalog = catalogFixture();
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: PLANNING_PRODUCTS, useValue: catalog.products }, { provide: PublicCatalogService, useValue: catalog.service }] });
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    vi.unstubAllGlobals();
  });

  const retainProduct = (quantity = 7) => ({
    kind: 'product' as const,
    returnUrl: '/catalog',
    pending: { product: { productId: 'osda-620', variantId: null, unitCode: 'panel' }, quantity },
  });

  const reconfigure = (customerId?: string) => {
    TestBed.resetTestingModule();
    const catalog = catalogFixture();
    TestBed.configureTestingModule({ providers: [
      provideRouter(routes),
      { provide: PLANNING_PRODUCTS, useValue: catalog.products },
      { provide: PublicCatalogService, useValue: catalog.service },
      ...(customerId ? [{ provide: CUSTOMER_SESSION, useValue: signal({ customerId }) }] : []),
    ] });
  };

  it('redirects direct My routes to sign-in with their original safe return URL and hides seeded preview names', async () => {
    const projects = TestBed.inject(ProjectService);
    const draft = { ...createNewProjectDraft(), name: 'Secret local preview roof', classification: 'residential' as const, configuration: 'hybrid' as const, workScope: 'new-installation' as const };
    expect(projects.create(draft, 'seeded')).toMatchObject({ ok: true });

    const harness = await RouterTestingHarness.create('/my/projects');
    expect(TestBed.inject(Router).url).toBe('/sign-in?returnUrl=%2Fmy%2Fprojects');
    expect(harness.routeNativeElement?.textContent).toContain('Sign in to continue');
    expect(harness.routeNativeElement?.textContent).not.toContain('Secret local preview roof');
    expect(TestBed.inject(CustomerAccessService).pending()).toEqual({ kind: 'route', returnUrl: '/my/projects' });

    await harness.navigateByUrl('/my/favorites');
    expect(TestBed.inject(Router).url).toBe('/sign-in?returnUrl=%2Fmy%2Ffavorites');
    expect(harness.routeNativeElement?.textContent).not.toContain('Secret local preview roof');
    expect(harness.routeNativeElement?.textContent).toContain('Requested page: /my/favorites');
    for (const path of ['/my/profile', '/my/settings', '/my/projects/preview-seeded', '/my/projects/preview-seeded/bom']) {
      await harness.navigateByUrl(path);
      expect(harness.routeNativeElement?.textContent).toContain(`Requested page: ${path}`);
      expect(harness.routeNativeElement?.textContent).not.toContain('Secret local preview roof');
      expect(harness.routeNativeElement?.querySelector('app-customer-shell')).toBeNull();
    }
  });

  it('does not grant synthetic preview access to a real customer ID or fabricated browser auth', async () => {
    localValues.set('solar.auth.session.v1', JSON.stringify({ customerId: LOCAL_CUSTOMER_ID }));
    sessionValues.set('solar.auth.session.v1', JSON.stringify({ customerId: LOCAL_CUSTOMER_ID }));
    reconfigure('real-customer-123');
    const access = TestBed.inject(CustomerAccessService);
    expect(access.signedIn()).toBe(true);
    expect(access.canAccessProjects()).toBe(false);
    const realCustomerHarness = await RouterTestingHarness.create('/my/projects');
    expect(TestBed.inject(Router).url).toBe('/sign-in?returnUrl=%2Fmy%2Fprojects');
    expect(realCustomerHarness.routeNativeElement?.textContent).not.toContain('Secret local preview roof');

    reconfigure();
    expect(TestBed.inject(CustomerAccessService).signedIn()).toBe(false);
    const defaultHarness = await RouterTestingHarness.create('/my/projects');
    expect(TestBed.inject(Router).url).toBe('/sign-in?returnUrl=%2Fmy%2Fprojects');
    expect(defaultHarness.routeNativeElement?.textContent).not.toContain('local-preview');
  });

  it('accepts only local public/customer return routes and rejects external, encoded, and admin targets', () => {
    for (const value of [
      'https://attacker.example', '//attacker.example/path', '/\\attacker.example', '/%2f%2fattacker.example',
      '/my/%70rofile', '/admin/inventory', '/my/projects/%2e%2e/admin', ' /catalog',
    ]) expect(safeCustomerReturnUrl(value)).toBe('/catalog');
    expect(safeCustomerReturnUrl('/my/projects/preview-1/bom')).toBe('/my/projects/preview-1/bom');
    expect(safeCustomerReturnUrl('/draft?from=catalog')).toBe('/draft?from=catalog');
  });

  it('retains product identity and quantity plus guest-list fingerprint in session storage and restores both', () => {
    const access = TestBed.inject(CustomerAccessService);
    const product = retainProduct(19);
    access.retain(product);
    expect(JSON.parse(sessionValues.get(PENDING_CUSTOMER_ACTION_KEY)!)).toMatchObject({ version: 1, action: product });
    expect(access.pending()).toEqual(product);
    reconfigure();
    expect(TestBed.inject(CustomerAccessService).pending()).toEqual(product);

    const guest = { kind: 'guest-list' as const, returnUrl: '/draft', guest: { listId: 'guest-list-42', fingerprint: '{"id":"guest-list-42","items":["row"]}' } };
    TestBed.inject(CustomerAccessService).retain(guest);
    expect(JSON.parse(sessionValues.get(PENDING_CUSTOMER_ACTION_KEY)!).action).toEqual(guest);
    reconfigure();
    expect(TestBed.inject(CustomerAccessService).pending()).toEqual(guest);

    sessionValues.set(PENDING_CUSTOMER_ACTION_KEY, '{broken');
    reconfigure();
    expect(TestBed.inject(CustomerAccessService).pending()).toBeNull();
    for (const stored of [
      { version: 1, savedAt: Date.now() + 60000, action: product },
      { version: 1, savedAt: Date.now(), action: { ...product, pending: { ...product.pending, quantity: 0 } } },
      { version: 1, savedAt: Date.now(), action: { kind: 'route', returnUrl: '//attacker.example' } },
    ]) {
      sessionValues.set(PENDING_CUSTOMER_ACTION_KEY, JSON.stringify(stored));
      reconfigure();
      expect(TestBed.inject(CustomerAccessService).pending()).toBeNull();
    }
    sessionValues.set(PENDING_CUSTOMER_ACTION_KEY, JSON.stringify({ version: 1, savedAt: Date.now() - 25 * 60 * 60 * 1000, action: product }));
    reconfigure();
    expect(TestBed.inject(CustomerAccessService).pending()).toBeNull();
  });

  it('keeps a valid pending request in memory and reports a warning when session storage is blocked', () => {
    sessionWriteBlocked = true;
    const access = TestBed.inject(CustomerAccessService);
    const product = retainProduct(3);
    access.retain(product);
    expect(access.pending()).toEqual(product);
    expect(access.retentionWarning()).toContain('kept for this visit only');
    expect(sessionValues.has(PENDING_CUSTOMER_ACTION_KEY)).toBe(false);
  });

  it('opens one shared header sign-in dialog without a product request, and canceling creates no project or form/password controls', async () => {
    const harness = await RouterTestingHarness.create('/catalog');
    const dialog = TestBed.inject(Dialog);
    const before = localValues.get(LOCAL_PROJECTS_KEY) ?? null;
    localValues.set(LEGACY_DRAFT_KEY, JSON.stringify([{ productId: 'osda-620', quantity: 19 }]));
    const guestListBefore = localValues.get(LEGACY_DRAFT_KEY);
    const articles = [...harness.routeNativeElement!.querySelectorAll<HTMLElement>('article')];
    expect(articles.length).toBeGreaterThan(0);
    for (const article of articles) {
      const productName = article.querySelector('h2, h3')?.textContent?.trim() ?? '';
      const disabled = article.querySelector<HTMLButtonElement>(`button[aria-label="Add ${productName} to project"]`)!;
      expect(disabled.disabled).toBe(true);
      expect(disabled.title).toBe('Sign in to add to project');
      expect(disabled.getAttribute('aria-label')).toBe(`Add ${productName} to project`);
      const tooltip = disabled.closest('app-tooltip')?.querySelector<HTMLElement>('span[tabindex="0"]');
      expect(tooltip?.getAttribute('aria-label')).toBe('Sign in to add to project');
      expect(tooltip?.getAttribute('tabindex')).toBe('0');
      expect([...article.querySelectorAll<HTMLButtonElement>('button')].some(button => /^(Sign in|Review account)$/.test(button.textContent?.trim() ?? ''))).toBe(false);
    }

    const headerSignIns = [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')]
      .filter(button => button.textContent?.trim() === 'Sign in');
    expect(headerSignIns).toHaveLength(1);
    const access = TestBed.inject(CustomerAccessService);
    expect(access.pending()).toBeNull();
    headerSignIns[0].click();
    headerSignIns[0].click();
    harness.fixture.detectChanges();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(1));
    await harness.fixture.whenStable();
    expect(dialog.openDialogs).toHaveLength(1);
    const root = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(root.querySelector('app-sign-in-panel')).not.toBeNull();
    expect(root.querySelector('input, form, input[type="password"]')).toBeNull();
    expect(access.pending()).toEqual({ kind: 'route', returnUrl: '/catalog' });
    root.querySelector<HTMLButtonElement>('button[aria-label="Close sign-in dialog"]')!.click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(dialog.openDialogs).toHaveLength(0);
    expect(access.pending()).toEqual({ kind: 'route', returnUrl: '/catalog' });
    expect(localValues.get(LOCAL_PROJECTS_KEY) ?? null).toBe(before);
    expect(localValues.get(LEGACY_DRAFT_KEY)).toBe(guestListBefore);
  });

  it('shows enabled action tooltips on hover and keeps Details dialog focus restoration from reopening them', async () => {
    const harness = await RouterTestingHarness.create('/catalog');
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const article = harness.routeNativeElement!.querySelector<HTMLElement>('article')!;
    const addButton = article.querySelector<HTMLButtonElement>('button[aria-label^="Add to Cart: "]')!;
    const addWrapper = addButton.closest('app-tooltip')!.querySelector<HTMLElement>('span')!;

    expect(addButton.disabled).toBe(false);
    expect(addWrapper.hasAttribute('tabindex')).toBe(false);
    addWrapper.dispatchEvent(new MouseEvent('mouseenter'));
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(overlay.querySelector<HTMLElement>('[role="tooltip"]')?.textContent?.trim()).toBe('Add to Cart');

    addWrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(overlay.querySelector('[role="tooltip"]')).toBeNull();

    const details = article.querySelector<HTMLButtonElement>('button[aria-label^="View "]')!;
    details.focus();
    addWrapper.dispatchEvent(new MouseEvent('mouseleave'));
    details.click();
    harness.fixture.detectChanges();
    await vi.waitFor(() => expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(document.activeElement).toBe(details);
    expect(overlay.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('presents the public draft route as Cart and retains catalog additions across navigation', async () => {
    const harness = await RouterTestingHarness.create('/catalog');
    const root = harness.routeNativeElement!;
    const headerCart = [...root.querySelectorAll<HTMLAnchorElement>('header a[href="/draft"]')][0];
    const navCart = [...root.querySelectorAll<HTMLAnchorElement>('nav a[href="/draft"]')][0];
    expect(headerCart.textContent).toContain('Cart');
    expect(navCart.textContent?.trim()).toBe('Cart');

    const article = root.querySelector<HTMLElement>('article')!;
    const productName = article.querySelector('h3')!.textContent!.trim();
    const addButton = article.querySelector<HTMLButtonElement>('button[aria-label^="Add to Cart: "]')!;
    expect(addButton.getAttribute('aria-label')).toBe(`Add to Cart: ${productName}`);
    expect(addButton.querySelector('i')?.className).toContain('ki-handcart');
    expect(addButton.textContent?.trim()).toBe('');
    const cart = TestBed.inject(BomService);
    expect(cart.count()).toBe(0);
    addButton.click();
    await vi.waitFor(() => expect(cart.quantity('osda-620')).toBe(1));
    harness.fixture.detectChanges();

    const updatedHeader = [...root.querySelectorAll<HTMLAnchorElement>('header a[href="/draft"]')][0];
    expect(updatedHeader.querySelector('.kt-badge')?.textContent?.trim()).toBe('1');
    expect(cart.quantity('osda-620')).toBe(1);
    await harness.navigateByUrl('/draft');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent?.trim()).toBe('Cart');
    expect(document.title).toBe('Cart · Dumaget.me Solar');
    expect(harness.routeNativeElement?.textContent).toContain(productName);
    expect(cart.quantity('osda-620')).toBe(1);
  });

  it('keeps the signed-out project action disabled without opening a dialog or queuing a request', async () => {
    const harness = await RouterTestingHarness.create('/catalog');
    const article = harness.routeNativeElement!.querySelector<HTMLElement>('article')!;
    const productName = article.querySelector('h3')!.textContent!.trim();
    const disabled = article.querySelector<HTMLButtonElement>(`button[aria-label="Add ${productName} to project"]`)!;

    expect(disabled.disabled).toBe(true);
    disabled.click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(TestBed.inject(CustomerAccessService).pending()).toBeNull();
  });
});

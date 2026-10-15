import { Dialog } from '@angular/cdk/dialog';
import { inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import { ACCOUNT_PROJECT_STORE, AccountProject, AccountProjectService } from '../../core/account-project.service';
import { AUTH_DRIVER, AuthDriver, AuthSessionService } from '../../core/auth-session.service';
import { CUSTOMER_SESSION, CustomerSession } from '../../core/customer-access.service';
import { BomService } from '../../core/bom.service';
import { PLANNING_PRODUCTS } from '../../core/product-source';
import { ProjectService, LOCAL_PROJECTS_KEY } from '../../core/project.service';
import { PublicCatalogService, PublishedProduct } from '../../core/public-catalog.service';
import { ProjectBomPage } from './project-bom';
import { STORE_API_FETCH } from '../../core/store-api.service';
import { FreeTextInput } from '../../core/project-bom';
import { firstValueFrom } from 'rxjs';

const productId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const lineId = 'text-33333333-3333-4333-8333-333333333333';
const at = '2026-10-08T00:00:00.000Z';
const details = { name: 'Account roof', classification: 'residential' as const, installation: 'rooftop' as const, configuration: 'hybrid' as const, workScope: 'new-installation' as const };
const published: PublishedProduct = { id: productId, schemaVersion: 1, version: 2, publishedAt: at,
  sku: 'TEST-PANEL', name: 'Published panel', brand: 'Solar', category: 'Panels', unitCode: 'panel', description: 'Panel details', amountMinor: 10000, currency: 'PHP' };

describe('account project UI with isolated HTTP/SDK doubles', () => {
  let publish: (session: CustomerSession | null) => void;
  let values: Map<string, string>;
  let records: Map<string, AccountProject[]>;
  let preference: Map<string, { activeProjectId: string | null; preferencesVersion: number | null }>;
  let writes: Array<{ path: string; body: Record<string, unknown>; uid: string }>;
  let previewRaw: string;
  let publishedAvailable: boolean;

  beforeEach(() => {
    values = new Map(); records = new Map(); preference = new Map(); writes = []; publishedAvailable = true;
    previewRaw = JSON.stringify({ schemaVersion: 1, customerId: 'local-preview', projects: [{ ...details,
      id: 'preview-old', schemaVersion: 1, customerId: 'local-preview', status: 'draft', archivedAt: null,
      createdAt: at, updatedAt: at, bom: { id: 'bom-preview-old', projectId: 'preview-old', items: [], updatedAt: at } }], activeProjectId: 'preview-old' });
    values.set(LOCAL_PROJECTS_KEY, previewRaw);
    values.set('solar.bom.v1', '[]');
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    const driver: AuthDriver = { observe: next => { publish = next; return () => {}; }, signInGoogle: async () => {},
      signOut: async () => { publish(null); }, getIdToken: async uid => 'test-token-' + uid };
    const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('?')[0]!;
      if (path === '/api/v1/catalog/references') return response({ items: publishedAvailable ? [published] : [] });
      if (path === '/api/v1/catalog/products') return response({ items: [published], nextCursor: null });
      if (path === '/api/v1/catalog/products/' + productId) return response({ product: published });
      const uid = new Headers(init?.headers).get('Authorization')?.replace('Bearer test-token-', '') ?? '';
      const rows = records.get(uid) ?? [];
      if (path === '/api/v1/me') return response({ uid, email: uid + '@example.test', emailVerified: true, adminEligible: false, adminAuthorized: false });
      if (path === '/api/v1/me/projects' && init?.method === 'GET') return response({ items: rows, nextCursor: null, ...(preference.get(uid) ?? { activeProjectId: null, preferencesVersion: null }) });
      if (path === '/api/v1/me/projects/' + projectId && init?.method === 'GET') return rows[0] ? response({ project: rows[0] }) : response({}, 404);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      writes.push({ path, body, uid });
      if (path === '/api/v1/me/projects' && init?.method === 'POST') {
        const project: AccountProject = { ...body['details'] as typeof details, id: projectId, schemaVersion: 1, customerId: uid, version: 1,
          status: 'draft', archivedAt: null, createdAt: at, updatedAt: at, bom: { id: 'bom-' + projectId, projectId, items: [], updatedAt: at } };
        records.set(uid, [project]); return response({ project, copyReceipt: null }, 201);
      }
      if (path === '/api/v1/me/project-active') {
        const next = { activeProjectId: body['activeProjectId'] as string | null, preferencesVersion: (preference.get(uid)?.preferencesVersion ?? 0) + 1 };
        preference.set(uid, next); return response(next);
      }
      if (path === '/api/v1/me/projects/' + projectId + '/commands' && rows[0]) {
        const old = rows[0];
        if (body['expectedVersion'] !== old.version) return response({}, 409);
        let items = [...old.bom.items]; let copyReceipt = null;
        if (body['action'] === 'free-text') {
          const freeText = body['input'] as FreeTextInput;
          items.push({ ...freeText, id: lineId, kind: 'free-text', estimate: { kind: 'unpriced' }, createdAt: at, updatedAt: at });
        } else if (body['action'] === 'quantity') items = items.map(item => item.id === body['itemId'] ? { ...item, quantity: body['quantity'] as number } : item);
        else if (body['action'] === 'add-items') {
          const added = (body['items'] as Array<{ product: { productId: string; variantId: null; unitCode: string }; quantity: number }>).map((item, index) => ({ ...item, id: 'product-44444444-4444-4444-8444-' + String(index).padStart(12, '0'), kind: 'store-product' as const, createdAt: at, updatedAt: at }));
          items.push(...added);
          const guest = body['guest'] as { listId: string; itemIds: string[] } | undefined;
          if (guest) copyReceipt = { id: 'copy-test', listId: guest.listId, customerId: uid, projectId, copiedAt: at, idempotencyKey: body['requestId'],
            itemMappings: guest.itemIds.map((guestItemId, index) => ({ guestItemId, destinationBomItemId: added[index].id })) };
        }
        const project = { ...old, version: old.version + 1, bom: { ...old.bom, items } };
        records.set(uid, [project]); return response({ project, copyReceipt });
      }
      throw new Error('Unexpected isolated request: ' + path);
    };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: AUTH_DRIVER, useValue: driver },
      { provide: STORE_API_FETCH, useValue: fetcher },
      { provide: CUSTOMER_SESSION, useFactory: () => inject(AuthSessionService).session },
      { provide: ACCOUNT_PROJECT_STORE, useExisting: AccountProjectService },
      { provide: PLANNING_PRODUCTS, useFactory: () => inject(PublicCatalogService).products }] });
    TestBed.inject(AuthSessionService);
  });
  afterEach(() => { TestBed.inject(Dialog).closeAll(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) { await harness.fixture.whenStable(); harness.detectChanges(); }
  }
  function fill(root: Element, id: string, value: string) {
    const input = root.querySelector<HTMLInputElement>('#' + id)!;
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function choose(root: Element, id: string, label: string) {
    const select = root.querySelector<HTMLSelectElement>('#' + id)!;
    select.value = [...select.options].find(option => option.textContent?.trim() === label)!.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function click(root: Element, label: string) {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === label);
    expect(button, label).toBeDefined(); button!.click();
  }
  async function createFromWizard(harness: RouterTestingHarness) {
    click(harness.routeNativeElement!, 'New project'); await settle(harness);
    const root = document.querySelector('[role="dialog"]')!;
    fill(root, 'project-name', details.name); choose(root, 'project-classification', 'Residential');
    click(root, 'Next'); await settle(harness);
    expect(root.querySelector<HTMLSelectElement>('#project-installation')!.selectedOptions[0].textContent?.trim()).toBe('Rooftop');
    choose(root, 'project-configuration', 'Hybrid'); choose(root, 'project-work-scope', 'New installation');
    click(root, 'Next'); await settle(harness);
    const closed = firstValueFrom(TestBed.inject(Dialog).openDialogs[0].closed);
    click(root, 'Create project'); await settle(harness);
    await closed;
    await vi.waitFor(() => expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0));
    await settle(harness);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/my/projects/' + projectId));
  }

  it('creates an owned project from form events, persists editable free text/quantity/active preference, and isolates switched accounts', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const harness = await RouterTestingHarness.create('/my/projects'); await settle(harness);
    expect(harness.routeNativeElement!.textContent).not.toContain('browser-local prototype');
    expect(TestBed.inject(ProjectService).projects()).toEqual([]);
    await createFromWizard(harness);
    expect(TestBed.inject(Router).url).toBe('/my/projects/' + projectId);
    expect(records.get('customer-a')?.[0].customerId).toBe('customer-a');
    expect(values.get(LOCAL_PROJECTS_KEY)).toBe(previewRaw);
    expect(values.get('solar.bom.v1')).toBe('[]');
    expect(TestBed.inject(ProjectService).activeProject()).toBeNull();

    await harness.navigateByUrl('/my/projects/' + projectId + '/bom'); await settle(harness);
    await vi.waitFor(async () => {
      await settle(harness);
      const buttons = [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')];
      expect(buttons.some(button => button.textContent?.trim() === 'Add free-text line')).toBe(false);
      expect(buttons.find(button => button.textContent?.trim() === 'Add inverter')?.disabled).toBe(false);
    });
    click(harness.routeNativeElement!, 'Add inverter'); await settle(harness);
    await vi.waitFor(() => expect(document.querySelector('#component-picker-title')).not.toBeNull());
    const pickerRoot = document.querySelector('#component-picker-title')!.closest('section')!;
    await vi.waitFor(() => expect(pickerRoot.querySelector('#component-quantity')).not.toBeNull());
    fill(pickerRoot, 'component-quantity', '7');
    click(pickerRoot, 'Add free-text line'); await settle(harness);
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    expect(document.querySelector('#component-quantity')).toBeNull();
    const editorRoot = document.querySelector('#bom-line-editor-title')!.closest('section')!;
    fill(editorRoot, 'bom-line-title', 'Installation labor'); fill(editorRoot, 'bom-line-unit', 'job');
    fill(editorRoot, 'bom-line-description', 'Roof work\nCommissioning');
    click(editorRoot, 'Add to BOM'); await settle(harness);
    const savedText = records.get('customer-a')![0].bom.items[0];
    expect(savedText).toMatchObject({ kind: 'free-text', componentCategory: 'Inverters', quantity: 7 });
    expect(writes.filter(write => write.body['action'] === 'free-text').map(write => write.body['input']))
      .toEqual([expect.objectContaining({ componentCategory: 'Inverters', quantity: 7 })]);
    expect(harness.routeNativeElement!.textContent).toContain('Installation labor');
    const page = harness.routeDebugElement!.query(node => node.componentInstance instanceof ProjectBomPage)!.componentInstance as ProjectBomPage;
    await page.reload(); await settle(harness);
    expect(page.components().filter(entry => entry.component.id === 'inverters').map(entry => entry.line?.item))
      .toMatchObject([{ kind: 'free-text', componentCategory: 'Inverters', quantity: 7 }]);
    const quantity = harness.routeNativeElement!.querySelector<HTMLInputElement>('#qty-' + lineId)!;
    quantity.value = '7'; quantity.dispatchEvent(new Event('input', { bubbles: true }));
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('[aria-label="Save quantity for Installation labor line 1"]')!.click(); await settle(harness);
    expect(records.get('customer-a')![0].bom.items[0].quantity).toBe(7);
    expect(writes.filter(write => write.body['action'] === 'quantity')).toHaveLength(1);
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);

    await harness.navigateByUrl('/my/projects'); await settle(harness);
    click(harness.routeNativeElement!, 'Make active'); await settle(harness);
    expect(preference.get('customer-a')?.activeProjectId).toBe(projectId);
    expect(TestBed.inject(ProjectService).activeProject()?.id).toBe(projectId);
    publish({ customerId: 'customer-b', source: 'firebase' });
    expect(TestBed.inject(ProjectService).projects()).toEqual([]);
    await settle(harness);
    expect(harness.routeNativeElement!.textContent).not.toContain(details.name);
    expect(values.get(LOCAL_PROJECTS_KEY)).toBe(previewRaw);
    expect(writes.every(write => write.uid === 'customer-a')).toBe(true);
  });

  it('copies all reviewed cart rows to an existing account project without emptying it or changing active selection', async () => {
    publish({ customerId: 'customer-a', source: 'firebase' });
    const harness = await RouterTestingHarness.create('/my/projects'); await settle(harness);
    await createFromWizard(harness);
    await TestBed.inject(PublicCatalogService).refresh();
    const bom = TestBed.inject(BomService);
    expect(bom.add(productId, 6)).toBe(true);
    const service = TestBed.inject(ProjectService);
    const before = service.currentGuestList()!.items;
    await harness.navigateByUrl('/draft'); await settle(harness);
    click(harness.routeNativeElement!, 'Add to project'); await settle(harness);
    const root = document.querySelector('[role="dialog"]')!;
    const select = root.querySelector<HTMLSelectElement>('select')!;
    select.value = [...select.options].find(option => option.textContent?.includes(details.name))!.value;
    select.dispatchEvent(new Event('change', { bubbles: true })); await settle(harness);
    // Destination confirmation is intentionally a separate user action.
    const confirm = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Add') && button.textContent?.includes('selected'));
    const copied = firstValueFrom(TestBed.inject(Dialog).openDialogs[0].closed);
    expect(confirm).toBeDefined(); confirm!.click(); await settle(harness);
    await copied;
    await settle(harness);
    expect(service.currentGuestList()?.state).toBe('linked');
    expect(service.currentGuestList()?.items).toEqual(before);
    expect(records.get('customer-a')![0].bom.items).toHaveLength(before.length);
    expect(records.get('customer-a')![0].bom.items[0].quantity).toBe(6);
    expect(service.activeProject()).toBeNull();
    expect(preference.get('customer-a')).toBeUndefined();
    expect(values.get('solar.bom.v1')).toBe('[]');
    const saved = JSON.parse(values.get(LOCAL_PROJECTS_KEY)!);
    expect(saved.projects[0].customerId).toBe('local-preview');
    expect(saved.projects[0].bom.items).toEqual([]);
  });

  it('waits for restored authentication on a direct BOM link and preserves an unavailable store row', async () => {
    records.set('customer-a', [{ ...details, id: projectId, schemaVersion: 1, customerId: 'customer-a', version: 1,
      status: 'draft', archivedAt: null, createdAt: at, updatedAt: at,
      bom: { id: 'bom-' + projectId, projectId, updatedAt: at, items: [{ id: 'product-44444444-4444-4444-8444-444444444444',
        kind: 'store-product', product: { productId, variantId: null, unitCode: 'panel' }, quantity: 8, createdAt: at, updatedAt: at }] } }]);
    publishedAvailable = false;
    const pending = RouterTestingHarness.create('/my/projects/' + projectId + '/bom');
    await Promise.resolve();
    expect(writes).toEqual([]);
    publish({ customerId: 'customer-a', source: 'firebase' });
    const harness = await pending; await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/my/projects/' + projectId + '/bom');
    expect(harness.routeNativeElement!.textContent).toContain('Unavailable product');
    expect(harness.routeNativeElement!.querySelectorAll('[data-line-id]')).toHaveLength(1);
    expect(TestBed.inject(ProjectService).projects()[0].bom.items[0].quantity).toBe(8);
    expect(values.get(LOCAL_PROJECTS_KEY)).toBe(previewRaw);
    expect(writes).toEqual([]);
  });

  it('omits standalone BOM reload and offers a guarded page-level retry only on error', async () => {
    const firstLine = { id: lineId, kind: 'free-text' as const, title: 'Installation labor', description: 'Roof work', unit: 'job', quantity: 1,
      notes: '', estimate: { kind: 'unpriced' as const }, createdAt: at, updatedAt: at };
    const secondLine = { ...firstLine, id: 'text-44444444-4444-4444-8444-444444444444', title: 'Commissioning', quantity: 2 };
    records.set('customer-a', [{ ...details, id: projectId, schemaVersion: 1, customerId: 'customer-a', version: 1,
      status: 'draft', archivedAt: null, createdAt: at, updatedAt: at,
      bom: { id: 'bom-' + projectId, projectId, updatedAt: at, items: [firstLine, secondLine] } }]);
    publish({ customerId: 'customer-a', source: 'firebase' });
    const harness = await RouterTestingHarness.create('/my/projects/' + projectId + '/bom'); await settle(harness);
    const page = harness.routeDebugElement!.query(node => node.componentInstance instanceof ProjectBomPage);
    expect(page).toBeDefined();
    const root = harness.routeNativeElement!;
    const articleRegion = root.querySelector('section[aria-labelledby="project-bom-title"]')!;
    const estimateRegion = root.querySelector('section[aria-labelledby="bom-estimate-title"]')!;
    const reloadButtons = () => [...root.querySelectorAll<HTMLButtonElement>('button')]
      .filter(button => button.textContent?.trim() === 'Reload / retry BOM');
    expect(root.querySelectorAll('[data-line-id]')).toHaveLength(2);
    expect(reloadButtons()).toHaveLength(0);
    expect([...articleRegion.querySelectorAll('button')].filter(button => button.textContent?.trim() === 'Reload / retry BOM')).toHaveLength(0);
    expect([...estimateRegion.querySelectorAll('button')].filter(button => button.textContent?.trim() === 'Reload / retry BOM')).toHaveLength(0);

    let releaseReload!: () => void;
    const accountProjects = TestBed.inject(AccountProjectService);
    const originalLoadProject = accountProjects.loadProject.bind(accountProjects);
    const loadProject = vi.spyOn(accountProjects, 'loadProject').mockImplementation(id => {
      if (id !== projectId) return originalLoadProject(id);
      return new Promise(resolve => { releaseReload = () => resolve(records.get('customer-a')![0]); });
    });
    const reload = vi.spyOn(page!.componentInstance as ProjectBomPage, 'reload');
    const component = page!.componentInstance as ProjectBomPage;
    const retryButtons = () => [...root.querySelectorAll<HTMLButtonElement>('button')]
      .filter(button => button.textContent?.trim() === 'Retry');
    try {
      expect(retryButtons()).toHaveLength(0);
      component.error.set('Unable to load this project BOM. Review and retry.');
      component.busy.set(true); harness.detectChanges();
      expect(retryButtons()).toHaveLength(1);
      expect(retryButtons()[0].disabled).toBe(true);
      component.busy.set(false); harness.detectChanges();
      expect(retryButtons()[0].disabled).toBe(false);
      retryButtons()[0].click();
      await vi.waitFor(() => expect(component.loading()).toBe(true));
      harness.detectChanges();
      expect([...root.querySelectorAll<HTMLElement>('[role="status"]')].filter(status => status.textContent?.trim() === 'Loading project BOM…')).toHaveLength(1);
      expect(reloadButtons()).toHaveLength(0);
      expect(writes).toEqual([]);
      expect(reload).toHaveBeenCalledTimes(1);
      releaseReload();
      await vi.waitFor(() => expect(component.loading()).toBe(false));
      harness.detectChanges();
      expect([...root.querySelectorAll<HTMLElement>('[role="status"]')].filter(status => status.textContent?.trim() === 'Loading project BOM…')).toHaveLength(0);
      expect(retryButtons()).toHaveLength(0);
      expect(loadProject).toHaveBeenCalledTimes(1);
      expect(reloadButtons()).toHaveLength(0);
    } finally {
      loadProject.mockRestore();
      reload.mockRestore();
    }
  });
});

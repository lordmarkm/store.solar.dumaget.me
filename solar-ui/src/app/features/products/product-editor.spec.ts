import { Dialog } from '@angular/cdk/dialog';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyProductRoutes as routes } from './legacy-product-routes.testing';
import { PRODUCTS } from '../../core/demo-data';
import { ThemeService } from '../../core/theme.service';
import { ProductEditorPage } from './product-editor';
import { PRODUCT_PREVIEW_ENABLED, ProductPreviewStore } from './product-preview.store';
import { ProductsPage } from './products';

describe('retired product editor preview (isolated test routes)', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map([['solar.bom.v1', 'retained guest list'], ['solar.projects.preview.v1', 'retained projects']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: PRODUCT_PREVIEW_ENABLED, useValue: true }] });
  });
  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    const root = TestBed.inject(DOCUMENT).documentElement;
    root.classList.remove('dark');
    delete root.dataset['solarTheme'];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  async function setup(path = '/admin/products/new') {
    TestBed.inject(ThemeService);
    const harness = await RouterTestingHarness.create(path);
    const editor = harness.routeDebugElement!.query(By.directive(ProductEditorPage)).componentInstance as ProductEditorPage;
    return { harness, editor, root: harness.routeNativeElement! };
  }
  async function settle(harness: RouterTestingHarness) { await harness.fixture.whenStable(); harness.fixture.detectChanges(); }
  function fill(root: HTMLElement, id: string, value: string) {
    const input = root.querySelector<HTMLInputElement>(id)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('renders a blue development-only form with no publication, stock or supplier write fields', async () => {
    const { root } = await setup();
    expect(root.querySelector('h1')?.textContent).toBe('New product');
    expect(root.textContent).toContain('Development-only product preview');
    expect(root.textContent).toContain('disappear on refresh or close');
    expect(TestBed.inject(DOCUMENT).documentElement.dataset['solarTheme']).toBe('workspace');
    expect([...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Publish')?.disabled).toBe(true);
    expect(root.querySelector('input[name="stock"]')).toBeNull();
  });

  it('validates required fields and focuses the first error without saving', async () => {
    const { harness, editor, root } = await setup();
    editor.save();
    await settle(harness);
    expect(root.querySelector('#product-sku')?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement?.id).toBe('product-sku');
    expect(TestBed.inject(ProductPreviewStore).drafts()).toHaveLength(0);
    expect(TestBed.inject(Router).url).toBe('/admin/products/new');
  });

  it('saves an incomplete draft through form events and displays it without changing customer data', async () => {
    const { harness, root } = await setup();
    const before = JSON.stringify(PRODUCTS);
    const stored = [...values];
    fill(root, '#product-sku', ' preview-new-1 ');
    fill(root, '#product-name', 'New preview equipment');
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(harness);
    expect(TestBed.inject(Router).url).toContain('state=draft');
    const list = harness.routeDebugElement!.query(By.directive(ProductsPage)).componentInstance as ProductsPage;
    expect(list.filtered()).toHaveLength(1);
    expect(list.filtered()[0]).toMatchObject({ publicationState: 'draft', price: null, product: { sku: 'PREVIEW-NEW-1', stock: null } });
    expect(harness.routeNativeElement!.textContent).toContain('Unpriced');
    list.detail(list.filtered()[0]);
    await settle(harness);
    expect(document.querySelector('#preview-draft-heading')?.textContent).toBe('New preview equipment');
    expect(JSON.stringify(PRODUCTS)).toBe(before);
    expect([...values]).toEqual(stored);
  });

  it('retains entered data after duplicate SKU and price validation failures', async () => {
    const { harness, editor } = await setup();
    editor.update('sku', 'osd-620n-bf'); editor.update('name', 'Name retained'); editor.update('priceText', '1.001');
    editor.save();
    await settle(harness);
    expect(editor.error('sku')).toContain('already exists');
    expect(editor.error('priceText')).toContain('decimal places');
    expect(editor.input().name).toBe('Name retained');
    expect(TestBed.inject(ProductPreviewStore).drafts()).toHaveLength(0);
  });

  it('retains input after a failed save and duplicate save calls create only one draft', async () => {
    const { harness, editor } = await setup();
    editor.update('sku', 'RETRY-NEW'); editor.update('name', 'Retained after error');
    const create = vi.spyOn(TestBed.inject(ProductPreviewStore), 'create').mockReturnValueOnce({ ok: false, message: 'Preview write failed' });
    editor.save(); await settle(harness);
    expect(editor.saveError()).toBe('Preview write failed');
    expect(editor.input().name).toBe('Retained after error');
    editor.save(); editor.save(); await settle(harness);
    expect(create).toHaveBeenCalledTimes(2);
    expect(TestBed.inject(ProductPreviewStore).drafts()).toHaveLength(1);
  });

  it('cancels pristine input back to the validated filtered list without creating a draft', async () => {
    const { harness, editor } = await setup('/admin/products/new?returnTo=%2Fadmin%2Fproducts%3Fbrand%3DSRNE');
    editor.cancel(); await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/admin/products?brand=SRNE');
    expect(TestBed.inject(ProductPreviewStore).drafts()).toHaveLength(0);
  });

  it('protects dirty navigation, treats dismissal as Keep editing, and discards only on confirmation', async () => {
    const { harness, editor } = await setup();
    editor.update('name', 'Unsaved equipment');
    const router = TestBed.inject(Router);
    const first = router.navigateByUrl('/admin/products');
    await vi.waitFor(() => expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1));
    TestBed.inject(Dialog).openDialogs[0].close();
    expect(await first).toBe(false);
    expect(editor.input().name).toBe('Unsaved equipment');
    const second = router.navigateByUrl('/admin/products');
    await vi.waitFor(() => expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1));
    TestBed.inject(Dialog).openDialogs[0].close(true);
    expect(await second).toBe(true);
    await settle(harness);
    expect(router.url).toBe('/admin/products');
    expect(TestBed.inject(ProductPreviewStore).drafts()).toHaveLength(0);
  });

  it('requests an unload warning only for unsaved input', async () => {
    const { editor } = await setup();
    const event = { preventDefault: vi.fn(), returnValue: 'unchanged' } as unknown as BeforeUnloadEvent;
    editor.beforeUnload(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    editor.update('name', 'Unsaved'); editor.beforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    editor.saved.set(true); editor.beforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});

import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_SESSION, CustomerAccessService, CustomerSession } from '../core/customer-access.service';
import type { Product } from '../core/models';
import type { PendingProduct } from '../core/project-bom';
import { PublicCatalogService } from '../core/public-catalog.service';
import { ProjectService, type ProjectWriteResult } from '../core/project.service';
import { ToastService } from '../core/toast.service';
import { ProjectComponentPicker } from './project-component-picker';
import { BomLineEditor } from './bom-line-editor';
import { COMPONENTS, type ComponentDefinition } from '../core/component-bom';

const projectId = '11111111-1111-4111-8111-111111111111';
const otherProjectId = '22222222-2222-4222-8222-222222222222';
const productId = '33333333-3333-4333-8333-333333333333';
const component = { id: 'inverters', label: 'Inverter', addLabel: 'Add inverter', category: 'Inverters' as const };

function product(overrides: Partial<Product> = {}): Product {
  return { id: productId, sku: 'INV-100', name: 'Solar inverter', brand: 'Solar', category: 'Inverters',
    description: 'Published inverter', spec: '5 kW', secondarySpec: 'Hybrid', price: 50000, stock: 0, unit: 'unit',
    depot: '', supplierId: '', visual: 'inverter', tiers: [], ...overrides };
}

function project(id: string, customerId = 'customer-a', status: 'draft' | 'archived' = 'draft') {
  return { id, customerId, status };
}

function setup(options: { projects?: ReturnType<typeof project>[]; session?: CustomerSession | null; component?: typeof component | ComponentDefinition | { id: string; label: string; addLabel: string; category: null };
  categoryPage?: ReturnType<typeof vi.fn>; checkProduct?: ReturnType<typeof vi.fn>; addProduct?: ReturnType<typeof vi.fn> } = {}) {
  const session = signal<CustomerSession | null>(options.session === undefined
    ? { customerId: 'customer-a', source: 'firebase' } : options.session);
  const rows = options.projects ?? [project(projectId)];
  const ref = { close: vi.fn(), disableClose: false };
  const source = {
    categoryPage: options.categoryPage ?? vi.fn(async () => ({ items: [product()], nextCursor: null })),
    checkProduct: options.checkProduct ?? vi.fn(async () => product()),
  };
  const projects = {
    projects: vi.fn(() => rows),
    addProduct: options.addProduct ?? vi.fn(async () => ({ ok: true })),
    saveFreeText: vi.fn(async () => ({ ok: true })),
  };
  const access = {
    customerId: computed(() => session()?.customerId ?? null),
    projectSessionKey: computed(() => JSON.stringify([session()?.source ?? 'preview', session()?.customerId ?? null])),
    canAccessProjects: computed(() => session() !== null),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({ imports: [ProjectComponentPicker], providers: [
    { provide: DIALOG_DATA, useValue: { projectId, component: options.component ?? component } },
    { provide: DialogRef, useValue: ref },
    { provide: CUSTOMER_SESSION, useValue: session.asReadonly() },
    { provide: PublicCatalogService, useValue: source },
    { provide: ProjectService, useValue: projects },
    { provide: CustomerAccessService, useValue: access },
    { provide: ToastService, useValue: toast },
  ] });
  const fixture = TestBed.createComponent(ProjectComponentPicker);
  fixture.detectChanges();
  return { fixture, picker: fixture.componentInstance, session, rows, ref, source, projects, toast };
}

describe('project component picker', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('pages through category results by cursor and returns to the prior page', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => product({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, sku: `INV-${index + 1}`,
    }));
    const categoryPage = vi.fn()
      .mockResolvedValueOnce({ items: firstPage, nextCursor: 'cursor_page_2' })
      .mockResolvedValueOnce({ items: [product({ id: '44444444-4444-4444-8444-444444444444' })], nextCursor: null })
      .mockResolvedValueOnce({ items: firstPage, nextCursor: 'cursor_page_2' });
    const state = await setup({ categoryPage });
    await vi.waitFor(() => expect(state.picker.loading()).toBe(false));
    expect(categoryPage).toHaveBeenNthCalledWith(1, 'Inverters', null);
    expect(state.picker.items()).toHaveLength(10);
    expect(state.picker.nextCursor()).toBe('cursor_page_2');

    state.picker.next();
    await vi.waitFor(() => expect(state.picker.page()).toBe(1));
    expect(categoryPage).toHaveBeenNthCalledWith(2, 'Inverters', 'cursor_page_2');
    expect(state.picker.items()).toHaveLength(1);
    await state.picker.load(0);
    expect(categoryPage).toHaveBeenNthCalledWith(3, 'Inverters', null);
    expect(state.picker.page()).toBe(0);
    expect(state.picker.items()).toHaveLength(10);
  });

  it('requests ATS-only pages and blocks subtype changes or missing amperage on recheck', async () => {
    const component = COMPONENTS.find(component => component.id === 'ats')!;
    const checkProduct = vi.fn().mockResolvedValueOnce(product({ category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: { type: 'AC', amperage: 32 } }))
      .mockResolvedValueOnce(product({ category: 'ATS', protectionType: 'ATS' }))
      .mockResolvedValueOnce(product({ category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage: 63 } }));
    const state = setup({ component, checkProduct });
    await vi.waitFor(() => expect(state.picker.loading()).toBe(false));
    expect(state.source.categoryPage).toHaveBeenCalledWith('ATS', null, 'ATS');
    await state.picker.add(product()); await state.picker.add(product());
    expect(state.projects.addProduct).not.toHaveBeenCalled();
    await state.picker.add(product());
    expect(state.projects.addProduct).toHaveBeenCalledOnce();
  });
  it('seeds ATS free text and requires amperage without a second dialog', async () => {
    const state = setup({ component: COMPONENTS.find(component => component.id === 'ats')! });
    await vi.waitFor(() => expect(state.picker.loading()).toBe(false));
    state.picker.addFreeText(); state.fixture.detectChanges();
    const editor = state.fixture.debugElement.query(By.directive(BomLineEditor)).componentInstance as BomLineEditor;
    expect(editor.draft()).toMatchObject({ componentCategory: 'ATS', componentProtectionType: 'ATS' });
    const rating = state.fixture.nativeElement.querySelector('#bom-line-amperage') as HTMLInputElement;
    expect(rating).not.toBeNull(); expect(rating.required).toBe(true);
    editor.update('title', 'Owner supplied ATS'); editor.update('unit', 'unit');
    await editor.save(); expect(state.projects.saveFreeText).not.toHaveBeenCalled();
    editor.update('amperage', 63.5); await editor.save();
    expect(state.projects.saveFreeText).toHaveBeenCalledWith(projectId,
      expect.objectContaining({ componentProtectionType: 'ATS', amperage: 63.5 }), expect.any(String), undefined);
  });
  it('closes on cancellation without adding a product', async () => {
    const state = await setup();
    await vi.waitFor(() => expect(state.picker.loading()).toBe(false));
    state.picker.close();
    expect(state.ref.close).toHaveBeenCalledWith(false);
    expect(state.projects.addProduct).not.toHaveBeenCalled();
  });

  it('switches the same picker dialog to a category and quantity seeded free-text editor', async () => {
    const state = await setup();
    await vi.waitFor(() => expect(state.picker.loading()).toBe(false));
    state.picker.quantity.set(4);
    const pickerDialog = state.fixture.nativeElement as HTMLElement;
    expect(pickerDialog.querySelector('#component-picker-title')).not.toBeNull();
    pickerDialog.querySelector<HTMLButtonElement>('button')!.click();
    state.fixture.detectChanges();

    const editorElement = state.fixture.debugElement.query(By.directive(BomLineEditor));
    expect(editorElement).toBeDefined();
    expect(state.fixture.nativeElement.querySelector('#bom-line-title')).not.toBeNull();
    expect(state.fixture.nativeElement.querySelector('#component-quantity')).toBeNull();
    expect(state.ref.close).not.toHaveBeenCalled();
    const editor = editorElement.componentInstance as BomLineEditor;
    expect(editor.data).toMatchObject({ projectId, componentCategory: 'Inverters', componentLabel: 'Inverter', quantity: 4 });
    expect(editor.draft()).toMatchObject({ componentCategory: 'Inverters', quantity: 4 });

    editor.update('title', 'Owner supplied inverter');
    editor.update('unit', 'unit');
    await editor.save();
    expect(state.projects.saveFreeText).toHaveBeenCalledWith(projectId,
      expect.objectContaining({ title: 'Owner supplied inverter', componentCategory: 'Inverters', quantity: 4 }), expect.any(String), undefined);
    expect(state.ref.close).toHaveBeenCalledWith(true);
  });

  it('switches to Other free text without querying a catalog and cancellation writes nothing', async () => {
    const categoryPage = vi.fn(async () => ({ items: [product()], nextCursor: null }));
    const state = await setup({ component: { id: 'other', label: 'Other requirements', addLabel: 'Add requirement', category: null }, categoryPage });
    expect(categoryPage).not.toHaveBeenCalled();
    const button = [...(state.fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')]
      .find(candidate => candidate.textContent?.trim() === 'Add free-text line');
    expect(button).toBeDefined();
    button!.click();
    state.fixture.detectChanges();
    const editor = state.fixture.debugElement.query(By.directive(BomLineEditor)).componentInstance as BomLineEditor;
    expect(editor.data).not.toHaveProperty('componentCategory');
    expect(categoryPage).not.toHaveBeenCalled();
    expect(state.fixture.nativeElement.querySelector('#bom-line-title')).not.toBeNull();
    const cancel = [...(state.fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')]
      .find(candidate => candidate.textContent?.includes('Cancel'));
    expect(cancel).toBeDefined(); cancel!.click();
    expect(state.projects.saveFreeText).not.toHaveBeenCalled();
    expect(state.projects.addProduct).not.toHaveBeenCalled();
    expect(state.ref.close).toHaveBeenCalledWith(false);
  });

  it('ignores an in-flight category response after switching to free text', async () => {
    let resume!: (value: { items: Product[]; nextCursor: null }) => void;
    const categoryPage = vi.fn(() => new Promise<{ items: Product[]; nextCursor: null }>(resolve => { resume = resolve; }));
    const state = await setup({ categoryPage });
    await vi.waitFor(() => expect(categoryPage).toHaveBeenCalledOnce());
    const button = [...(state.fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')]
      .find(candidate => candidate.textContent?.trim() === 'Add free-text line');
    expect(button).toBeDefined(); button!.click();
    resume({ items: [product()], nextCursor: null });
    await Promise.resolve();
    state.fixture.detectChanges();
    expect(state.picker.items()).toEqual([]);
    expect(state.fixture.nativeElement.querySelector('#bom-line-title')).not.toBeNull();
  });

  it('requires a positive whole quantity before checking or adding the product', async () => {
    const state = await setup();
    await vi.waitFor(() => expect(state.picker.loading()).toBe(false));
    for (const invalidQuantity of [0, -2, 1.5]) {
      state.picker.quantity.set(invalidQuantity);
      await state.picker.add(product());
      expect(state.picker.error()).toBe('Enter a positive whole quantity.');
    }
    expect(state.source.checkProduct).not.toHaveBeenCalled();
    expect(state.projects.addProduct).not.toHaveBeenCalled();

    state.picker.quantity.set(3);
    await state.picker.add(product());
    expect(state.projects.addProduct).toHaveBeenCalledWith(projectId, expect.objectContaining({ quantity: 3 }), expect.any(String));
  });

  it('targets the supplied current project and reuses one request ID while separate picker instances get independent IDs', async () => {
    const addProduct = vi.fn(async (_projectId: string, _pending: PendingProduct, _requestId: string) => ({ ok: true }));
    const first = await setup({ projects: [project(otherProjectId), project(projectId)], addProduct });
    await vi.waitFor(() => expect(first.picker.loading()).toBe(false));
    await first.picker.add(product());
    await first.picker.add(product());
    const [firstTarget, firstPending, firstRequest] = addProduct.mock.calls[0]!;
    expect(firstTarget).toBe(projectId);
    expect(addProduct.mock.calls[1]![2]).toBe(firstRequest);
    expect(firstPending).toEqual(expect.objectContaining({ quantity: 1, product: expect.objectContaining({ productId }) }));

    first.fixture.destroy();
    TestBed.resetTestingModule();
    const second = await setup({ projects: [project(projectId)], addProduct });
    await vi.waitFor(() => expect(second.picker.loading()).toBe(false));
    await second.picker.add(product());
    expect(addProduct.mock.calls[2]![0]).toBe(projectId);
    expect(addProduct.mock.calls[2]![2]).not.toBe(firstRequest);
  });

  it('retains the request UUID when retrying unchanged input after a failed add', async () => {
    const addProduct = vi.fn((_projectId: string, _pending: PendingProduct, _requestId: string): Promise<ProjectWriteResult> => Promise.reject(new Error('offline')))
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true });
    const state = await setup({ addProduct });
    await vi.waitFor(() => expect(state.picker.loading()).toBe(false));
    await state.picker.add(product());
    expect(state.picker.error()).toContain('retry');
    await state.picker.add(product());
    expect(addProduct.mock.calls[1]![2]).toBe(addProduct.mock.calls[0]![2]);
  });

  it('blocks a product whose category changed after the picker page loaded', async () => {
    const state = await setup({ checkProduct: vi.fn(async () => product({ category: 'Batteries' })) });
    await vi.waitFor(() => expect(state.picker.loading()).toBe(false));
    await state.picker.add(product());
    expect(state.projects.addProduct).not.toHaveBeenCalled();
    expect(state.toast.error).toHaveBeenCalledWith(expect.stringContaining('retry'));
  });

  it.each([
    ['archived destination', [project(projectId, 'customer-a', 'archived')], { customerId: 'customer-a', source: 'firebase' }],
    ['foreign destination', [project(projectId, 'customer-b')], { customerId: 'customer-a', source: 'firebase' }],
  ])('does not add to an %s', async (_label, projects, session) => {
    const state = await setup({ projects, session: session as CustomerSession });
    await state.picker.add(product());
    state.picker.addFreeText();
    state.fixture.detectChanges();
    expect(state.projects.addProduct).not.toHaveBeenCalled();
    expect(state.projects.saveFreeText).not.toHaveBeenCalled();
    expect(state.picker.freeText()).toBe(false);
    expect(state.source.checkProduct).not.toHaveBeenCalled();
  });

  it('does not add after the customer session becomes stale during product revalidation', async () => {
    let resume!: (value: Product) => void;
    const checkProduct = vi.fn(() => new Promise<Product>(resolve => { resume = resolve; }));
    const state = await setup({ checkProduct });
    await vi.waitFor(() => expect(state.picker.loading()).toBe(false));
    const adding = state.picker.add(product());
    await vi.waitFor(() => expect(checkProduct).toHaveBeenCalledOnce());
    state.session.set({ customerId: 'customer-b', source: 'firebase' });
    await vi.waitFor(() => expect(state.ref.close).toHaveBeenCalled());
    resume(product());
    await adding;
    expect(state.projects.addProduct).not.toHaveBeenCalled();
  });
});

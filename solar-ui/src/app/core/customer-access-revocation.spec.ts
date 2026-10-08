import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { CUSTOMER_SESSION, CustomerAccessService, CustomerSession } from './customer-access.service';
import { createNewProjectDraft } from './models';
import { ProjectService, LOCAL_PROJECTS_KEY } from './project.service';
import { Projects } from '../features/projects/projects';
import { NewProjectWizard } from '../shared/new-project-wizard';
import { Bom } from '../features/bom/bom';
import { EquipmentListHistoryDialog } from '../shared/equipment-list-history-dialog';
import { guestListFingerprint } from './guest-lists';
import { PRODUCTS } from './demo-data';
import { PLANNING_PRODUCTS } from './product-source';

describe('guest intent and session revocation boundaries', () => {
  const session = signal<CustomerSession | null>(null);
  beforeEach(() => {
    session.set(null);
    for (const name of ['localStorage', 'sessionStorage']) {
      const values = new Map<string, string>();
      vi.stubGlobal(name, { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    }
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: CUSTOMER_SESSION, useValue: session }, { provide: PLANNING_PRODUCTS, useValue: signal(PRODUCTS) }] });
  });
  afterEach(() => { TestBed.inject(Dialog).closeAll(); vi.unstubAllGlobals(); });
  const settle = async (h: RouterTestingHarness) => { h.fixture.detectChanges(); await h.fixture.whenStable(); };
  const draft = () => ({ ...createNewProjectDraft(), name: 'Private roof', classification: 'residential' as const, configuration: 'hybrid' as const, workScope: 'new-installation' as const });

  it('preserves product intent when guests try a My URL instead of overwriting it with a route', async () => {
    const access = TestBed.inject(CustomerAccessService);
    const action = { kind: 'product' as const, returnUrl: '/catalog', pending: { product: { productId: 'osda-620', variantId: null, unitCode: 'panel' }, quantity: 12 } };
    access.retain(action);
    const h = await RouterTestingHarness.create('/my/projects');
    expect(access.pending()).toEqual(action);
    expect(h.routeNativeElement!.textContent).toContain('selected item and quantity');
    expect(TestBed.inject(ProjectService).projects()).toHaveLength(0);
  });

  it('retains the eligible list fingerprint, keeps Add disabled, and cancel makes no copy', async () => {
    const projects = TestBed.inject(ProjectService);
    projects.ensureGuestLists(); projects.setGuestQuantity('osda-620', 200);
    const list = projects.currentGuestList()!;
    const h = await RouterTestingHarness.create('/draft');
    const page = h.routeDebugElement!.query(n => n.componentInstance instanceof Bom)!.componentInstance as Bom;
    const before = localStorage.getItem(LOCAL_PROJECTS_KEY);
    const action = [...h.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'Add to project')!;
    expect(action.disabled).toBe(true);
    const signIn = [...h.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'Sign in to continue')!;
    signIn.click();
    await vi.waitFor(() => expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1));
    await settle(h);
    expect(page.access.pending()).toMatchObject({ kind: 'guest-list', guest: { listId: list.id, fingerprint: guestListFingerprint(list) } });
    TestBed.inject(Dialog).closeAll(); await settle(h);
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(before);
    expect(projects.currentGuestList()!.state).toBe('unlinked');
    expect(projects.projects()).toHaveLength(0);
  });

  it('hides linked project names on the guest list and in history without deleting the link', async () => {
    const projects = TestBed.inject(ProjectService);
    projects.ensureGuestLists(); projects.setGuestQuantity('osda-620', 32); projects.create(draft(), 'roof');
    const list = projects.currentGuestList()!;
    projects.copyGuestList('preview-roof', { listId: list.id, fingerprint: guestListFingerprint(list) }, 'copy');
    const before = localStorage.getItem(LOCAL_PROJECTS_KEY);
    const h = await RouterTestingHarness.create('/draft');
    expect(h.routeNativeElement!.textContent).not.toContain('Private roof');
    expect(h.routeNativeElement!.querySelector('a[href*="preview-roof"]')).toBeNull();
    const page = h.routeDebugElement!.query(n => n.componentInstance instanceof Bom)!.componentInstance as Bom;
    page.listDialog('history'); await settle(h);
    const modal = TestBed.inject(Dialog).openDialogs[0].componentInstance as EquipmentListHistoryDialog;
    expect(modal.linkedProjectName(projects.currentGuestList()!)).toBe('Linked cart (project unavailable)');
    expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain('Private roof');
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(before);
  });

  it('blocks an open wizard confirmation on session loss, closes it, and hides private pages', async () => {
    session.set({ customerId: 'local-preview' }); // Explicit test-only preview provider.
    const projects = TestBed.inject(ProjectService); projects.create(draft(), 'roof');
    const h = await RouterTestingHarness.create('/my/projects');
    const page = h.routeDebugElement!.query(n => n.componentInstance instanceof Projects)!.componentInstance as Projects;
    page.newProject(); await settle(h);
    const wizard = TestBed.inject(Dialog).openDialogs[0].componentInstance as NewProjectWizard;
    wizard.draft.set(draft()); wizard.step.set(2);
    const before = localStorage.getItem(LOCAL_PROJECTS_KEY);
    session.set(null);
    wizard.create(); // Even before Angular's access-loss effect runs, the mutation fails closed.
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(before);
    await settle(h);
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(TestBed.inject(Router).url).toContain('/sign-in');
    expect(h.routeNativeElement!.textContent).not.toContain('Private roof');
    expect(projects.projects()).toHaveLength(1);
  });
});

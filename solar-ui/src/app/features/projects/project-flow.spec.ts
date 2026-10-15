import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import { createNewProjectDraft } from '../../core/models';
import { LOCAL_PROJECTS_KEY, ProjectService } from '../../core/project.service';
import { Projects } from './projects';
import { signal } from '@angular/core';
import { CUSTOMER_SESSION } from '../../core/customer-access.service';
import { PRODUCTS } from '../../core/demo-data';
import { PLANNING_PRODUCTS } from '../../core/product-source';
import { firstValueFrom } from 'rxjs';

const projectInput = (name: string) => ({ ...createNewProjectDraft(), name, classification: 'residential' as const, configuration: 'hybrid' as const, workScope: 'new-installation' as const });

describe('My projects and overview', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: CUSTOMER_SESSION, useValue: signal({ customerId: 'local-preview' }) }, { provide: PLANNING_PRODUCTS, useValue: signal(PRODUCTS) }] });
  });
  afterEach(() => { TestBed.inject(Dialog).closeAll(); vi.unstubAllGlobals(); });

  it('shows the empty state, opens only one shared wizard, and cancels without creating a project', async () => {
    const harness = await RouterTestingHarness.create('/my/projects');
    await harness.fixture.whenStable(); harness.detectChanges();
    const page = harness.routeNativeElement!;
    expect(page.textContent).toContain('Start with your first project');
    expect(page.querySelectorAll('main')).toHaveLength(1);
    const shell = harness.routeDebugElement!;
    const projects = shell.query(debug => debug.componentInstance instanceof Projects)!.componentInstance as Projects;
    projects.newProject(); projects.newProject();
    harness.fixture.detectChanges(); await harness.fixture.whenStable();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    expect(document.querySelector('h2#new-project-wizard-title')?.textContent).toContain('New project wizard');
    document.querySelector<HTMLButtonElement>('[aria-label="Close New project wizard"]')!.click();
    harness.fixture.detectChanges(); await harness.fixture.whenStable();
    expect(TestBed.inject(ProjectService).projects()).toHaveLength(0);
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBeNull();
  });

  it('creates through the shared wizard then opens the saved overview with an empty BOM', async () => {
    const harness = await RouterTestingHarness.create('/my/projects');
    await harness.fixture.whenStable(); harness.detectChanges();
    const button = [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'New project')!;
    button.click(); harness.fixture.detectChanges(); await harness.fixture.whenStable();
    const root = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const type = (id: string, value: string) => { const input = root.querySelector<HTMLInputElement>('#' + id)!; input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
    const select = (id: string, label: string) => { const control = root.querySelector<HTMLSelectElement>('#' + id)!; control.value = [...control.options].find(option => option.textContent?.trim() === label)!.value; control.dispatchEvent(new Event('change', { bubbles: true })); };
    type('project-name', 'School roof'); select('project-classification', 'Institutional / Public facilities');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); harness.fixture.detectChanges(); await harness.fixture.whenStable();
    expect(root.querySelector<HTMLSelectElement>('#project-installation')!.selectedOptions[0].textContent?.trim()).toBe('Rooftop');
    select('project-configuration', 'Grid-tied'); select('project-work-scope', 'New installation');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); harness.fixture.detectChanges(); await harness.fixture.whenStable();
    expect(TestBed.inject(ProjectService).projects()).toHaveLength(0);
    const closed = firstValueFrom(TestBed.inject(Dialog).openDialogs[0].closed);
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); harness.fixture.detectChanges(); await harness.fixture.whenStable();
    await closed;
    const service = TestBed.inject(ProjectService);
    await vi.waitFor(() => expect(service.projects()).toHaveLength(1));
    for (let i = 0; i < 3; i++) { await harness.fixture.whenStable(); harness.detectChanges(); }
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/my/projects/' + service.projects()[0].id));
    expect(service.projects()).toHaveLength(1);
    expect(TestBed.inject(Router).url).toBe('/my/projects/' + service.projects()[0].id);
    expect(harness.routeNativeElement!.textContent).toContain('School roof');
    expect(harness.routeNativeElement!.textContent).toContain('equipment list is empty');
    expect(service.activeProject()).toBeNull();
  });

  it('searches cards and persists explicit active selection without leaking into the guest draft', async () => {
    const service = TestBed.inject(ProjectService);
    service.create(projectInput('House roof'), 'house');
    service.create({ ...projectInput('Farm'), classification: 'agricultural', location: 'Valencia' }, 'farm');
    const harness = await RouterTestingHarness.create('/my/projects');
    const search = harness.routeNativeElement!.querySelector<HTMLInputElement>('#project-filter-search')!;
    search.value = 'Valencia'; search.dispatchEvent(new Event('input', { bubbles: true }));
    harness.fixture.detectChanges(); await harness.fixture.whenStable();
    const cards = harness.routeNativeElement!.querySelectorAll('article');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('Farm');
    [...cards[0].querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Make active')!.click();
    harness.fixture.detectChanges(); await harness.fixture.whenStable();
    expect(service.activeProject()?.name).toBe('Farm');
    expect(localStorage.getItem('solar.bom.v1')).toBeNull();
    await harness.navigateByUrl('/my/projects/preview-house');
    expect(harness.routeNativeElement!.querySelector('h1')?.textContent).toBe('House roof');
    expect(service.activeProject()?.name).toBe('Farm');
  });

  it('handles missing direct links and closes a wizard when leaving My projects', async () => {
    const harness = await RouterTestingHarness.create('/my/projects/does-not-exist');
    expect(harness.routeNativeElement!.textContent).toContain('Project not found');
    await harness.navigateByUrl('/my/projects');
    [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'New project')!.click();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    await harness.navigateByUrl('/catalog');
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(TestBed.inject(ProjectService).projects()).toHaveLength(0);
  });
});

import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_PROJECTS_KEY, ProjectService } from '../core/project.service';
import { NewProjectWizard } from './new-project-wizard';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CUSTOMER_SESSION } from '../core/customer-access.service';
import { PRODUCTS } from '../core/demo-data';
import { PLANNING_PRODUCTS } from '../core/product-source';

describe('New project wizard', () => {
  let close: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    close = vi.fn();
    TestBed.configureTestingModule({ imports: [NewProjectWizard, DialogModule], providers: [provideRouter([]), { provide: CUSTOMER_SESSION, useValue: signal({ customerId: 'local-preview' }) }, { provide: PLANNING_PRODUCTS, useValue: signal(PRODUCTS) }, { provide: DialogRef, useValue: { close } }] });
  });
  afterEach(() => { TestBed.inject(Dialog).closeAll(); vi.unstubAllGlobals(); });

  it('does not save when opened, canceled, or advanced without required input', async () => {
    const fixture = TestBed.createComponent(NewProjectWizard);
    fixture.detectChanges();
    await fixture.whenStable();
    const wizard = fixture.componentInstance;
    expect(wizard.draft().installation).toBe('rooftop');
    expect(wizard.draft().configuration).toBeNull();
    wizard.next();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(wizard.step()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Choose a classification.');
    expect(fixture.nativeElement.querySelector('[aria-invalid="true"]')).not.toBeNull();
    wizard.cancel();
    expect(close).toHaveBeenCalledWith();
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBeNull();
  });

  it('retains inputs across Back/Next and only creates one empty-BOM project on final confirmation', async () => {
    const fixture = TestBed.createComponent(NewProjectWizard);
    fixture.detectChanges();
    const wizard = fixture.componentInstance;
    wizard.update('name', 'School installation');
    wizard.update('classification', 'institutional-public');
    wizard.update('location', 'Dumaguete');
    wizard.next();
    wizard.update('installation', 'ground-mounted');
    wizard.update('configuration', 'off-grid');
    wizard.update('workScope', 'expansion');
    wizard.update('notes', 'Retain custom notes');
    wizard.next();
    wizard.back();
    expect(wizard.draft().installation).toBe('ground-mounted');
    expect(wizard.draft().notes).toBe('Retain custom notes');
    wizard.next();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Ground-mounted');
    expect(fixture.nativeElement.textContent).toContain('Dumaguete');
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBeNull();
    const creating = wizard.create();
    const duplicate = wizard.create();
    await Promise.all([creating, duplicate]);
    const projects = TestBed.inject(ProjectService);
    expect(projects.projects()).toHaveLength(1);
    expect(projects.projects()[0].bom.items).toEqual([]);
    expect(projects.activeProject()).toBeNull();
    expect(close).toHaveBeenCalledWith(projects.projects()[0]);
  });

  it('retains the review inputs on failed save and creates exactly once after retry', async () => {
    const fixture = TestBed.createComponent(NewProjectWizard);
    fixture.detectChanges();
    const wizard = fixture.componentInstance;
    wizard.update('name', 'Home'); wizard.update('classification', 'residential'); wizard.next();
    wizard.update('configuration', 'hybrid'); wizard.update('workScope', 'new-installation'); wizard.next();
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    await wizard.create();
    fixture.detectChanges();
    expect(wizard.step()).toBe(2);
    expect(wizard.draft().name).toBe('Home');
    expect(close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not save');
    expect(TestBed.inject(ProjectService).projects()).toHaveLength(0);
    write.mockRestore(); await wizard.create();
    expect(TestBed.inject(ProjectService).projects()).toHaveLength(1);
  });
});

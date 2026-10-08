import { Dialog } from '@angular/cdk/dialog';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { BomService, DRAFT_KEY } from '../core/bom.service';
import { ThemeService } from '../core/theme.service';
import { CustomerShell } from './customer-shell';
import { signal } from '@angular/core';
import { CUSTOMER_SESSION } from '../core/customer-access.service';

describe('separate shopping, customer, and admin layouts', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: CUSTOMER_SESSION, useValue: signal({ customerId: 'local-preview' }) }] });
  });
  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    const root = TestBed.inject(DOCUMENT).documentElement;
    root.classList.remove('dark');
    delete root.dataset['solarTheme'];
    vi.unstubAllGlobals();
  });

  it('shares sidebar-free shopping navigation on catalog and draft without admin links', async () => {
    const harness = await RouterTestingHarness.create('/catalog');
    for (const path of ['/catalog', '/draft']) {
      await harness.navigateByUrl(path);
      const root = harness.routeNativeElement!;
      expect(root.tagName).toBe('APP-SHOPPING-SHELL');
      expect(root.querySelector('aside[aria-label*="navigation"]')).toBeNull();
      expect(root.querySelectorAll('main#main-content')).toHaveLength(1);
      expect(root.querySelector('a[href^="/admin"]')).toBeNull();
      expect(root.textContent).not.toMatch(/quotation|Operations workspace|Supplier workspace/i);
      expect(root.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe(path);
    }
  });

  it('redirects old BOM links to draft while preserving legacy browser contents and quantities', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify([{ productId: 'combiner-2', quantity: 30 }, { productId: 'missing', quantity: 4 }]));
    const harness = await RouterTestingHarness.create('/bom');
    expect(TestBed.inject(Router).url).toBe('/draft');
    expect(harness.routeNativeElement!.tagName).toBe('APP-SHOPPING-SHELL');
    const bom = TestBed.inject(BomService);
    expect(bom.quantity('combiner-2')).toBe(30);
    expect(bom.quantity('missing')).toBe(4);
    await harness.navigateByUrl('/my');
    await harness.navigateByUrl('/draft');
    expect(bom.quantity('combiner-2')).toBe(30);
    expect(harness.routeNativeElement!.textContent).toContain('Unavailable product');
  });

  it('defaults My pages to projects, keeps customer-only navigation, and updates active page and heading', async () => {
    TestBed.inject(ThemeService);
    const harness = await RouterTestingHarness.create('/my');
    expect(TestBed.inject(Router).url).toBe('/my/projects');
    for (const [path, heading] of [['projects', 'My projects'], ['favorites', 'Favorites'], ['profile', 'Profile'], ['settings', 'Account settings']]) {
      await harness.navigateByUrl('/my/' + path);
      const root = harness.routeNativeElement!;
      expect(root.tagName).toBe('APP-CUSTOMER-SHELL');
      expect(root.querySelector('h1')?.textContent).toBe(heading);
      expect(root.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/my/' + path);
      expect(root.querySelector('a[href^="/admin"]')).toBeNull();
      expect(root.textContent).toContain(path === 'projects' ? 'not synced to an account' : 'Not connected');
      expect(TestBed.inject(DOCUMENT).documentElement.dataset['solarTheme']).toBe('public');
    }
  });

  it('isolates blue admin navigation and restores the public theme when returning to shopping or My pages', async () => {
    const theme = TestBed.inject(ThemeService);
    const harness = await RouterTestingHarness.create('/my/profile');
    theme.toggle();
    for (const path of ['/admin/products', '/admin/inventory', '/admin/suppliers']) {
      await harness.navigateByUrl(path);
      const root = harness.routeNativeElement!;
      const nav = root.querySelector('nav[aria-label="Solar workspace"]')!;
      expect(root.tagName).toBe('APP-WORKSPACE-SHELL');
      expect([...nav.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['/admin/products', '/admin/inventory', '/admin/suppliers']);
      expect(root.textContent).toContain('Continue shopping');
      expect(TestBed.inject(DOCUMENT).documentElement.dataset['solarTheme']).toBe('workspace');
    }
    for (const path of ['/catalog', '/draft', '/my/projects']) {
      await harness.navigateByUrl(path);
      expect(TestBed.inject(DOCUMENT).documentElement.dataset['solarTheme']).toBe('public');
      expect(TestBed.inject(DOCUMENT).documentElement.classList.contains('dark')).toBe(true);
    }
  });

  it('opens only one customer drawer, clears Escape dismissal state, reopens, and closes on navigation', async () => {
    const harness = await RouterTestingHarness.create('/my/projects');
    const shell = harness.routeDebugElement!.componentInstance as CustomerShell;
    shell.openMenu();
    shell.openMenu();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('My pages navigation');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await harness.fixture.whenStable();
    expect(shell.mobileRef).toBeUndefined();
    shell.openMenu();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    await harness.navigateByUrl('/catalog');
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
  });
});

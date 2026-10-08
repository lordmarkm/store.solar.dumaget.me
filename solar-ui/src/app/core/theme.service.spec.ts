import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { ThemeService } from './theme.service';

describe('route-scoped public theme', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });
  afterEach(() => {
    const root = TestBed.inject(DOCUMENT).documentElement;
    root.classList.remove('dark');
    delete root.dataset['solarTheme'];
    vi.unstubAllGlobals();
  });

  it('keeps catalog and customer BOM green and restores the workspace palette on admin navigation', async () => {
    TestBed.inject(ThemeService);
    const harness = await RouterTestingHarness.create('/catalog');
    const root = TestBed.inject(DOCUMENT).documentElement;
    expect(root.dataset['solarTheme']).toBe('public');
    await harness.navigateByUrl('/bom');
    expect(root.dataset['solarTheme']).toBe('public');
    await harness.navigateByUrl('/admin/products');
    expect(root.dataset['solarTheme']).toBe('workspace');
    await harness.navigateByUrl('/admin/inventory');
    expect(root.dataset['solarTheme']).toBe('workspace');
    await harness.navigateByUrl('/admin/suppliers');
    expect(root.dataset['solarTheme']).toBe('workspace');
    await harness.navigateByUrl('/catalog');
    expect(root.dataset['solarTheme']).toBe('public');
  });

  it('uses the workspace palette on a direct admin entry', async () => {
    TestBed.inject(ThemeService);
    await RouterTestingHarness.create('/admin/products');
    expect(TestBed.inject(DOCUMENT).documentElement.dataset['solarTheme']).toBe('workspace');
  });

  it('preserves the dark-mode preference independently of the route palette', async () => {
    localStorage.setItem('solar.theme', 'dark');
    const theme = TestBed.inject(ThemeService);
    const harness = await RouterTestingHarness.create('/catalog');
    const root = TestBed.inject(DOCUMENT).documentElement;
    expect(theme.dark()).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
    theme.toggle();
    expect(localStorage.getItem('solar.theme')).toBe('light');
    expect(root.dataset['solarTheme']).toBe('public');
    await harness.navigateByUrl('/missing-page');
    expect(root.dataset['solarTheme']).toBe('public');
    expect(root.classList.contains('dark')).toBe(false);
  });
});

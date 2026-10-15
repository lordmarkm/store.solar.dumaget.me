import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BomService, DRAFT_KEY } from '../../core/bom.service';
import { LOCAL_PROJECTS_KEY } from '../../core/project.service';
import { PRODUCTS } from '../../core/demo-data';
import { PLANNING_PRODUCTS } from '../../core/product-source';
import { signal } from '@angular/core';
import { Bom } from './bom';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  TestBed.configureTestingModule({ imports: [Bom], providers: [provideRouter([]), { provide: PLANNING_PRODUCTS, useValue: signal(PRODUCTS) }] });
});
afterEach(() => vi.unstubAllGlobals());

it('updates the equipment list and displayed total when a user types a quantity', async () => {
  const bom = TestBed.inject(BomService);
  bom.add('osda-620');
  const fixture = TestBed.createComponent(Bom);
  fixture.detectChanges();
  await fixture.whenStable();
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="number"]')!;
  input.value = '31';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
  await fixture.whenStable();
  expect(bom.quantity('osda-620')).toBe(31);
  expect(bom.total()).toBe(182590);
  expect((fixture.nativeElement as HTMLElement).textContent).toContain('₱182,590.00');
  expect((fixture.nativeElement as HTMLElement).textContent).toContain('Volume price applied');
});

it('allows typed and incremented quantities above sample stock without a maximum attribute', async () => {
  const bom = TestBed.inject(BomService);
  bom.add('combiner-2', 2);
  const fixture = TestBed.createComponent(Bom);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const input = root.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(input.hasAttribute('max')).toBe(false);
  const increase = root.querySelector<HTMLButtonElement>('button[title="Increase planned quantity"]')!;
  expect(increase.disabled).toBe(false);
  increase.click();
  fixture.detectChanges();
  expect(bom.quantity('combiner-2')).toBe(3);
  input.value = '200';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
  await fixture.whenStable();
  expect(bom.quantity('combiner-2')).toBe(200);
});

it('shows retained unavailable references with unknown pricing and an explicit remove action', async () => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === DRAFT_KEY ? JSON.stringify([{ productId: 'missing-123', quantity: 42 }]) : null, setItem: () => undefined });
  const fixture = TestBed.createComponent(Bom);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  expect(root.textContent).toContain('Unavailable product');
  expect(root.textContent).not.toContain('missing-123');
  expect(root.textContent).toContain('Planned quantity: 42');
  expect(root.textContent).toContain('unpriced, not zero-cost');
  expect(root.textContent).not.toContain('Start with your equipment');
  root.querySelector<HTMLButtonElement>('button[aria-label="Remove unavailable product"]')!.click();
  fixture.detectChanges();
  expect(TestBed.inject(BomService).lineCount()).toBe(0);
});

it('keeps Add to project disabled for guest lists and exposes only its sign-in hint', async () => {
  const bom = TestBed.inject(BomService);
  const fixture = TestBed.createComponent(Bom);
  const root = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const buttonSelector = 'button[title="Sign in to add to project"]';
  const tooltipSelector = 'app-tooltip span[tabindex="0"][aria-label="Sign in to add to project"]';
  const assertDisabledAction = () => {
    const buttons = root.querySelectorAll<HTMLButtonElement>(buttonSelector);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[0].getAttribute('aria-describedby')).toBe('project-sign-in-hint list-copy-hint');
    const wrapper = root.querySelector<HTMLElement>(tooltipSelector);
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelectorAll('button')).toHaveLength(1);
    expect(wrapper!.querySelector('button')!.disabled).toBe(true);
    expect(wrapper!.closest('app-tooltip')!.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(wrapper!.tabIndex).toBe(0);
    expect(root.querySelector('#project-sign-in-hint')?.textContent?.trim()).toBe('Sign in to add to project');
    const descriptionId = wrapper!.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    const description = root.querySelector<HTMLElement>(`#${descriptionId}`);
    expect(description?.classList.contains('sr-only')).toBe(true);
    expect(description?.textContent?.trim()).toBe('Sign in to add to project');
    expect(root.querySelector('#list-copy-hint')).not.toBeNull();
    return wrapper!;
  };

  let wrapper = assertDisabledAction();
  let storedProjects = localStorage.getItem(LOCAL_PROJECTS_KEY);
  wrapper.querySelector<HTMLButtonElement>('button')!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(storedProjects);
  expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);

  bom.add('osda-620');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  expect(bom.lineCount()).toBe(1);
  wrapper = assertDisabledAction();
  storedProjects = localStorage.getItem(LOCAL_PROJECTS_KEY);
  wrapper.querySelector<HTMLButtonElement>('button')!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(storedProjects);
  expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);

  wrapper.dispatchEvent(new MouseEvent('mouseenter'));
  fixture.detectChanges();
  await fixture.whenStable();
  expect(document.querySelector('[role="tooltip"]')?.textContent?.trim()).toBe('Sign in to add to project');
  wrapper.dispatchEvent(new MouseEvent('mouseleave'));
  fixture.detectChanges();
  await fixture.whenStable();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  wrapper.dispatchEvent(new Event('focusin', { bubbles: true }));
  fixture.detectChanges();
  await fixture.whenStable();
  TestBed.tick();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  fixture.detectChanges();
  await fixture.whenStable();
  TestBed.tick();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(root.querySelectorAll(buttonSelector)).toHaveLength(1);
  expect(root.querySelectorAll(tooltipSelector)).toHaveLength(1);
});

import { TestBed } from '@angular/core/testing';
import { KTModal } from '@keenthemes/ktui/components/modal';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmationRef, ConfirmationService } from './ktui-confirmation';

describe('native KTUI confirmation adapter', () => {
  let ref: ConfirmationRef | undefined;
  let trigger: HTMLButtonElement;
  const options = { title: 'Remove BOM line?', message: 'Remove this line only.', confirmLabel: 'Confirm removal', cancelLabel: 'Keep line' };
  beforeEach(() => {
    TestBed.configureTestingModule({});
    trigger = document.createElement('button');
    document.body.append(trigger); trigger.focus();
  });
  afterEach(async () => {
    if (ref) { ref.close(); await firstValueFrom(ref.closed); }
    trigger.remove(); ref = undefined;
    TestBed.resetTestingModule();
  });
  async function open() {
    ref = TestBed.inject(ConfirmationService).open(options);
    await vi.waitFor(() => {
      TestBed.tick();
      expect(document.querySelector<HTMLButtonElement>('app-ktui-confirmation footer button')?.disabled).toBe(false);
    });
    return document.querySelector<HTMLElement>('app-ktui-confirmation')!;
  }
  it('uses the actual vendor modal/backdrop with a labeled dialog and rightmost footer dismissal', async () => {
    const host = await open();
    const modal = host.querySelector<HTMLElement>('.kt-modal')!;
    expect(KTModal.getInstance(modal).isOpen()).toBe(true);
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(host.querySelector('#' + modal.getAttribute('aria-labelledby'))?.textContent).toBe(options.title);
    expect(document.querySelector('[data-kt-modal-backdrop]')).not.toBeNull();
    expect(host.querySelector('header button')).toBeNull();
    expect([...host.querySelectorAll('footer button')].map(button => button.textContent?.trim())).toEqual(['Confirm removal', 'Keep line']);
    expect(host.querySelectorAll('.kt-btn-primary')).toHaveLength(0);
  });
  it('only returns true after an explicit confirmation, once, and restores focus/scroll state', async () => {
    document.body.style.overflow = 'auto';
    const host = await open();
    const closed = firstValueFrom(ref!.closed);
    const button = host.querySelector<HTMLButtonElement>('footer button')!;
    button.click(); button.click();
    expect(await closed).toBe(true);
    expect(document.querySelector('app-ktui-confirmation')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(trigger);
    document.body.style.overflow = '';
  });
  it.each(['footer', 'Escape', 'backdrop'])('cancels via %s without confirmation', async method => {
    const host = await open();
    const closed = firstValueFrom(ref!.closed);
    if (method === 'footer') host.querySelector<HTMLButtonElement>('footer button:last-child')!.click();
    else if (method === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else document.querySelector<HTMLElement>('[data-kt-modal-backdrop]')!.click();
    expect(await closed).toBe(false);
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
  });
  it('cancels safely while the vendor show transition is pending', async () => {
    ref = TestBed.inject(ConfirmationService).open(options);
    ref.close();
    expect(await firstValueFrom(ref.closed)).toBe(false);
    expect(document.body.style.overflow).toBe('');
    expect(document.querySelector('app-ktui-confirmation')).toBeNull();
  });
  it('does not open a duplicate dialog', async () => {
    await open();
    const duplicate = TestBed.inject(ConfirmationService).open(options);
    expect(await firstValueFrom(duplicate.closed)).toBe(false);
    expect(document.querySelectorAll('app-ktui-confirmation')).toHaveLength(1);
  });
  it('interpolates record text rather than rendering it as HTML', async () => {
    ref = TestBed.inject(ConfirmationService).open({ ...options, message: '<img src=x onerror=alert(1)>' });
    expect(document.querySelector('app-ktui-confirmation img')).toBeNull();
    expect(document.querySelector('app-ktui-confirmation p')?.textContent).toContain('<img src=x');
  });
});

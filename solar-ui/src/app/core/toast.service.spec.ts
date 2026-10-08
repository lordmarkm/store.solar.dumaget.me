import { TestBed } from '@angular/core/testing';
import { KTToast } from '@keenthemes/ktui/components/toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';

describe('KTUI operation toasts', () => {
  let service: ToastService;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    service = TestBed.inject(ToastService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    KTToast.clearAll(true);
    vi.runAllTimers();
    log.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('uses actual KTUI success markup, verified icons and an accessible close control', () => {
    service.success('Product saved as a private draft.');
    const toast = document.querySelector<HTMLElement>('.solar-operation-toast')!;
    expect(toast.classList.contains('kt-toast')).toBe(true);
    expect(toast.classList.contains('kt-alert-success')).toBe(true);
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(toast.querySelector('.ki-check-circle')).not.toBeNull();
    expect(toast.querySelector('button')?.getAttribute('aria-label')).toBe('Dismiss notification');
    expect(toast.textContent).toContain('Product saved as a private draft.');
  });

  it('keeps failures visible and renders message content as text, not executable HTML', () => {
    const message = 'Save failed: <img src=x onerror=alert(1)> & retry.';
    service.error(message);
    const toast = document.querySelector<HTMLElement>('.solar-operation-toast')!;
    expect(toast.classList.contains('kt-alert-destructive')).toBe(true);
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.getAttribute('aria-live')).toBe('assertive');
    expect(toast.querySelector('.kt-alert-title')?.textContent).toBe(message);
    expect(toast.querySelector('img')).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(toast.isConnected).toBe(true);
  });

  it('allows manual dismissal without shifting focus into the toast', () => {
    const originalFocus = document.activeElement;
    service.error('Unable to save. Your input is preserved.');
    const toast = document.querySelector<HTMLElement>('.solar-operation-toast')!;
    expect(document.activeElement).toBe(originalFocus);
    toast.querySelector<HTMLButtonElement>('button')!.click();
    vi.advanceTimersByTime(300);
    expect(toast.isConnected).toBe(false);
  });

  it('auto-dismisses successes after five seconds and pauses while hovered', () => {
    service.success('The saved product is now published.');
    const toast = document.querySelector<HTMLElement>('.solar-operation-toast')!;
    vi.advanceTimersByTime(1000);
    toast.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(10_000);
    expect(toast.isConnected).toBe(true);
    toast.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(4300);
    expect(toast.isConnected).toBe(false);
  });

  it('bounds active notifications and cleans up when the root service is destroyed', () => {
    for (let index = 0; index < 4; index++) service.error('Failure ' + index);
    vi.advanceTimersByTime(300);
    expect(document.querySelectorAll('.solar-operation-toast')).toHaveLength(3);
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(300);
    expect(document.querySelectorAll('.solar-operation-toast')).toHaveLength(0);
  });

  it('never turns a notification-rendering failure into a failed mutation outcome', () => {
    const show = vi.spyOn(KTToast, 'show').mockImplementationOnce(() => { throw new Error('Rendering unavailable'); });
    expect(() => service.success('Product saved.')).not.toThrow();
    show.mockRestore();
  });
});

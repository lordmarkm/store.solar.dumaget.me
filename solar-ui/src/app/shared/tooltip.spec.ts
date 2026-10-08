import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from './tooltip';

@Component({
  standalone: true,
  imports: [Tooltip],
  template: `
    <app-tooltip label="Disabled action" [focusable]="true">
      <button id="disabled-action" disabled>Disabled</button>
    </app-tooltip>
    <app-tooltip label="Enabled action" [focusable]="true">
      <button id="enabled-action" (click)="onEnabledClick()">Enabled</button>
    </app-tooltip>
  `,
})
class TooltipHost {
  onEnabledClick = vi.fn();
}

describe('shared tooltip interaction contract', () => {
  let fixture: ComponentFixture<TooltipHost>;
  let overlayContainer: OverlayContainer;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TooltipHost] });
    fixture = TestBed.createComponent(TooltipHost);
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    overlayContainer.getContainerElement().replaceChildren();
  });

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const wrapper = (id: string) => fixture.nativeElement.querySelector(`#${id}`)!.parentElement as HTMLElement;
  const overlay = () => overlayContainer.getContainerElement();
  const tooltips = () => overlay().querySelectorAll<HTMLElement>('[role="tooltip"]');

  it('keeps the label and focus semantics on the inline wrapper and preserves native button disabled state', () => {
    const disabledWrapper = wrapper('disabled-action');
    const enabledWrapper = wrapper('enabled-action');

    for (const element of [disabledWrapper, enabledWrapper]) {
      expect(element.classList.contains('inline-flex')).toBe(true);
      expect(element.getAttribute('tabindex')).toBe('0');
      expect(element.getAttribute('aria-label')).toBeTruthy();
    }
    expect(fixture.nativeElement.querySelector('#disabled-action').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('#enabled-action').disabled).toBe(false);
  });

  it('opens on hover but not focus, closes on Escape, and exposes the accessible arrow markup', async () => {
    const host = wrapper('disabled-action');
    host.dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(tooltips()).toHaveLength(1);
    expect(tooltips()[0].querySelector('.solar-tooltip-arrow[aria-hidden="true"]')).not.toBeNull();
    expect(['above', 'below']).toContain(tooltips()[0].getAttribute('data-side'));

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(tooltips()).toHaveLength(0);

    host.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle();
    expect(tooltips()).toHaveLength(0);
  });

  it.each(['disabled-action', 'enabled-action'])('dismisses %s on pointerdown and stays closed through the ensuing focus and click', async (id) => {
    const host = wrapper(id);
    host.dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(tooltips()).toHaveLength(1);

    host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    host.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle();
    expect(tooltips()).toHaveLength(0);
    host.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(tooltips()).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('#disabled-action').disabled).toBe(true);
  });

  it('allows only a fresh hover to reopen after dismissal', async () => {
    const host = wrapper('disabled-action');
    host.dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(tooltips()).toHaveLength(0);

    host.dispatchEvent(new MouseEvent('mouseleave'));
    host.dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(tooltips()).toHaveLength(1);

    host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(tooltips()).toHaveLength(0);
    host.dispatchEvent(new MouseEvent('mouseleave'));
    await settle();
    expect(tooltips()).toHaveLength(0);
    host.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle();
    expect(tooltips()).toHaveLength(0);
  });

  it('closes on mouseleave even when the trigger still has keyboard focus', async () => {
    const host = wrapper('disabled-action');
    host.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle();
    expect(tooltips()).toHaveLength(0);
    host.dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(tooltips()).toHaveLength(1);
    host.dispatchEvent(new MouseEvent('mouseleave'));
    await settle();
    expect(tooltips()).toHaveLength(0);
  });

  it('keeps a permanent accessible description on the focusable wrapper while hidden', () => {
    const host = wrapper('disabled-action');
    const descriptionId = host.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    const description = fixture.nativeElement.querySelector(`#${descriptionId}`) as HTMLElement;
    expect(description).not.toBeNull();
    expect(description.classList.contains('sr-only')).toBe(true);
    expect(description.textContent?.trim()).toBe('Disabled action');
    expect(host.contains(description)).toBe(false);
  });

  it('closes for an enabled child click while still running the child handler', async () => {
    const host = wrapper('enabled-action');
    host.dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(tooltips()).toHaveLength(1);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('#enabled-action')!.click();
    await settle();
    expect(fixture.componentInstance.onEnabledClick).toHaveBeenCalledOnce();
    expect(tooltips()).toHaveLength(0);
  });
});

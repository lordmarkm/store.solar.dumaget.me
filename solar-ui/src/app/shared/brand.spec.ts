import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Brand } from './brand';

describe('Shared main-site brand', () => {
  it('uses the decorative sun and stacked wordmark, not the old lightning identity', () => {
    const fixture = TestBed.createComponent(Brand);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.brand-mark')?.textContent).toBe('☼');
    expect(root.querySelector('.brand-mark')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.brand-name')?.textContent).toBe('Dumaget.me');
    expect(root.querySelector('.brand-solar')?.textContent).toBe('Solar');
    expect(root.querySelector('svg')).toBeNull();
    expect(root.textContent).not.toContain('Contractor supply hub');
    // Retain the title hook used by the collapsed administration sidebar.
    expect(root.querySelector('.kt-menu-title .brand-name')).not.toBeNull();
  });
});

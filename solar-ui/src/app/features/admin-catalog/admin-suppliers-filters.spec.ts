import { Component, computed, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { AdminSupplier } from '../../core/admin-catalog.models';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { AuthSessionService } from '../../core/auth-session.service';
import { StoreApiError } from '../../core/store-api.service';
import { AdminSuppliersPage } from './admin-suppliers';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

const supplier = (id: string, name = `Supplier ${id}`, status: 'active' | 'inactive' = 'active'): AdminSupplier => ({
  id, name, status, region: '', description: '', email: '', phone: '', website: '',
} as AdminSupplier);

@Component({ template: '' })
class RouteStub {}

describe('admin supplier API filters', () => {
  let revision: WritableSignal<number>;
  let authorized: WritableSignal<boolean>;
  let fixture!: ComponentFixture<AdminSuppliersPage>;
  let page: AdminSuppliersPage;
  let api: { listSuppliers: ReturnType<typeof vi.fn> };

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(AdminSuppliersPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  beforeEach(() => {
    revision = signal(1);
    authorized = signal(true);
    api = { listSuppliers: vi.fn().mockResolvedValue({ items: [supplier('first')], nextCursor: 'opaque-page-2' }) };
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: '**', component: RouteStub }]),
      { provide: AdminAccessService, useValue: { authorized, status: computed(() => authorized() ? 'authorized' : 'signed-out'), retry: vi.fn() } },
      { provide: AuthSessionService, useValue: { sessionRevision: revision, status: () => 'signed-in', busy: () => false, error: () => null } },
      { provide: AuthNavigationService, useValue: { signInGoogle: vi.fn() } },
      { provide: AdminCatalogApiService, useValue: api },
    ] });
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('sends combined filters and renders backend rows directly', async () => {
    await open();
    const backendRow = supplier('server-match', 'ACME Solar');
    api.listSuppliers.mockImplementation((_cursor: string | null, filters: { namePrefix?: string; status?: 'active' | 'inactive' } = {}) => Promise.resolve({
      items: filters.namePrefix ? [backendRow] : [supplier('first')], nextCursor: null,
    }));
    vi.useFakeTimers();
    page.setNamePrefix('ACME');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    page.setStatus('inactive');
    await flushPromises();

    expect(api.listSuppliers).toHaveBeenLastCalledWith(null, { namePrefix: 'ACME', status: 'inactive' });
    expect(page.rows()).toEqual([backendRow]);
    expect(fixture.nativeElement.textContent).toContain('ACME Solar');
    expect(fixture.nativeElement.textContent).not.toContain('Supplier first');
  });

  it('debounces the case-sensitive name prefix for 300 ms and limits it to 160 characters', async () => {
    await open();
    vi.useFakeTimers();
    const before = api.listSuppliers.mock.calls.length;
    page.setNamePrefix('A'.repeat(180));
    expect(page.namePrefix()).toHaveLength(160);
    expect(api.listSuppliers).toHaveBeenCalledTimes(before);
    await vi.advanceTimersByTimeAsync(299);
    expect(api.listSuppliers).toHaveBeenCalledTimes(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.listSuppliers).toHaveBeenLastCalledWith(null, { namePrefix: 'A'.repeat(160) });
    expect(fixture.nativeElement.textContent).toContain('Case-sensitive');
    expect(fixture.nativeElement.querySelector('#admin-supplier-name-prefix')?.getAttribute('maxlength')).toBe('160');
  });

  it('clears immediately, cancels a pending debounce, resets the cursor, and sends empty filters', async () => {
    await open();
    vi.useFakeTimers();
    page.setNamePrefix('North');
    page.setStatus('inactive');
    const beforeClear = api.listSuppliers.mock.calls.length;
    page.clearFilters();
    expect(page.namePrefix()).toBe('');
    expect(page.status()).toBe('');
    expect(page.rows()).toEqual([]);
    expect(page.cursor()).toBeNull();
    expect(api.listSuppliers).toHaveBeenCalledTimes(beforeClear + 1);
    expect(api.listSuppliers).toHaveBeenLastCalledWith(null, {});
    await vi.advanceTimersByTimeAsync(300);
    expect(api.listSuppliers).toHaveBeenCalledTimes(beforeClear + 1);
  });

  it('retains filters and cursor through pagination failure and retry', async () => {
    await open();
    const firstFiltered = supplier('filtered-first', 'North Solar');
    api.listSuppliers.mockResolvedValueOnce({ items: [firstFiltered], nextCursor: 'filtered-cursor' });
    vi.useFakeTimers();
    page.setNamePrefix('North');
    page.setStatus('active');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    api.listSuppliers.mockRejectedValueOnce(new StoreApiError('unavailable'));
    await page.loadMore();
    expect(api.listSuppliers).toHaveBeenLastCalledWith('filtered-cursor', { namePrefix: 'North', status: 'active' });
    expect(page.rows()).toEqual([firstFiltered]);
    expect(page.error()).toBeTruthy();

    const second = supplier('filtered-second', 'North Wind');
    api.listSuppliers.mockResolvedValueOnce({ items: [second], nextCursor: null });
    page.retry();
    await flushPromises();
    expect(api.listSuppliers).toHaveBeenLastCalledWith('filtered-cursor', { namePrefix: 'North', status: 'active' });
    expect(page.rows()).toEqual([firstFiltered, second]);
  });

  it('ignores a late response from an older filter query', async () => {
    await open();
    const oldRequest = deferred<{ items: AdminSupplier[]; nextCursor: string | null }>();
    const newRequest = deferred<{ items: AdminSupplier[]; nextCursor: string | null }>();
    api.listSuppliers.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    page.setStatus('inactive');
    page.setStatus('active');
    newRequest.resolve({ items: [supplier('new-query')], nextCursor: null });
    await flushPromises();
    oldRequest.resolve({ items: [supplier('old-query')], nextCursor: null });
    await flushPromises();
    expect(page.rows().map(row => row.id)).toEqual(['new-query']);
  });

  it('fences pending requests when the authenticated account revision changes', async () => {
    await open();
    const oldAccount = deferred<{ items: AdminSupplier[]; nextCursor: string | null }>();
    api.listSuppliers.mockReturnValueOnce(oldAccount.promise).mockResolvedValueOnce({ items: [supplier('new-account')], nextCursor: null });
    page.setStatus('inactive');
    revision.set(2);
    fixture.detectChanges();
    await settle();
    oldAccount.resolve({ items: [supplier('old-account')], nextCursor: null });
    await flushPromises();
    expect(api.listSuppliers).toHaveBeenLastCalledWith(null, {});
    expect(page.rows().map(row => row.id)).toEqual(['new-account']);
  });

  it('fences an in-flight request on route departure', async () => {
    await open();
    const pending = deferred<{ items: AdminSupplier[]; nextCursor: string | null }>();
    api.listSuppliers.mockReturnValueOnce(pending.promise);
    page.setStatus('inactive');
    await TestBed.inject(Router).navigateByUrl('/elsewhere');
    pending.resolve({ items: [supplier('stale-route')], nextCursor: null });
    await flushPromises();
    expect(page.rows()).toEqual([]);
  });

  it('cancels a pending debounce when leaving the route and after destruction', async () => {
    await open();
    vi.useFakeTimers();
    const before = api.listSuppliers.mock.calls.length;
    page.setNamePrefix('Canceled');
    await TestBed.inject(Router).navigateByUrl('/elsewhere');
    await vi.advanceTimersByTimeAsync(300);
    expect(api.listSuppliers).toHaveBeenCalledTimes(before);

    const destroyed = TestBed.createComponent(AdminSuppliersPage);
    destroyed.detectChanges();
    await destroyed.whenStable();
    vi.useFakeTimers();
    const pageBeforeDestroy = api.listSuppliers.mock.calls.length;
    destroyed.componentInstance.setNamePrefix('Destroyed');
    destroyed.destroy();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.listSuppliers).toHaveBeenCalledTimes(pageBeforeDestroy);
  });
});

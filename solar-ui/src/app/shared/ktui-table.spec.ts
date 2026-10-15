import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KTDataTable } from '@keenthemes/ktui/components/datatable';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KtuiTable, KtuiTableColumn } from './ktui-table';

let destroyedCells = 0;
@Component({ selector: 'app-cell-probe', template: '' })
class CellProbe {
  constructor() { inject(DestroyRef).onDestroy(() => destroyedCells++); }
}
interface Row { id: string; name: string }
@Component({
  imports: [KtuiTable, KtuiTableColumn, CellProbe],
  template: `
    <app-ktui-table [rows]="rows()" [rowKey]="key" label="Test records" [busy]="busy()">
      <ng-template solarTableColumn="name" [solarTableColumnOf]="rows()" header="Product" width="70%" let-row>
        <app-cell-probe /> <span>{{ row.name }}</span>
      </ng-template>
      <ng-template solarTableColumn="actions" [solarTableColumnOf]="rows()" header="Actions" width="30%" let-row>
        <button [disabled]="busy()" (click)="selected.set(row.id)">{{ caption() }}</button>
      </ng-template>
    </app-ktui-table>
  `,
})
class TableHost {
  readonly rows = signal<Row[]>([{ id: 'one', name: 'First product' }]);
  readonly key = (row: Row) => row.id;
  readonly busy = signal(false);
  readonly caption = signal('Select');
  readonly selected = signal('');
}

describe('KTUI API-batch table adapter', () => {
  let fixture: ComponentFixture<TableHost>;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await Promise.resolve();
  };
  const root = () => fixture.nativeElement.querySelector('[data-kt-datatable]') as HTMLElement;
  const cells = () => fixture.nativeElement.querySelectorAll('tbody td');

  beforeEach(async () => {
    destroyedCells = 0;
    TestBed.configureTestingModule({ imports: [TableHost] });
    fixture = TestBed.createComponent(TableHost);
    await settle();
  });
  afterEach(() => fixture.destroy());

  it('uses the actual KTUI renderer and displays every supplied row without a second pagination layer', async () => {
    fixture.componentInstance.rows.set(Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: 'Product ' + i })));
    await settle();
    expect(root().classList.contains('datatable-initialized')).toBe(true);
    expect(KTDataTable.getInstance(root())).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(25);
    expect(cells()[0].dataset.label).toBe('Product');
    expect(fixture.nativeElement.querySelector('[data-kt-datatable-pagination]')).toBeNull();
    expect([...fixture.nativeElement.querySelectorAll('th')].every((th: HTMLElement) => th.getAttribute('data-kt-datatable-column-sort') === 'false')).toBe(true);
  });

  it('retains Angular handlers and reactive cell state without replacing the vendor instance', async () => {
    const instance = KTDataTable.getInstance(root());
    fixture.componentInstance.caption.set('Choose');
    fixture.componentInstance.busy.set(true);
    await settle();
    let button = fixture.nativeElement.querySelector('tbody button') as HTMLButtonElement;
    expect(button.textContent).toBe('Choose');
    expect(button.disabled).toBe(true);
    expect(KTDataTable.getInstance(root())).toBe(instance);
    fixture.componentInstance.busy.set(false);
    await settle();
    button.click();
    expect(fixture.componentInstance.selected()).toBe('one');
  });

  it('escapes product text rather than passing it through vendor HTML strings', async () => {
    fixture.componentInstance.rows.set([{ id: 'unsafe', name: '<img src=x onerror=alert(1)>' }]);
    await settle();
    expect(cells()[0].textContent).toContain('<img src=x onerror=alert(1)>');
    expect(fixture.nativeElement.querySelector('tbody img')).toBeNull();
  });

  it('disposes old instances and Angular cells on replacement, empty results and destruction', async () => {
    const oldRoot = root();
    fixture.componentInstance.rows.set([{ id: 'two', name: 'Replacement' }]);
    await settle();
    expect(KTDataTable.getInstance(oldRoot)).toBeFalsy();
    expect(destroyedCells).toBe(1);
    expect(cells()[0].textContent).not.toContain('First product');
    const currentRoot = root();
    fixture.componentInstance.rows.set([]);
    await settle();
    expect(KTDataTable.getInstance(currentRoot)).toBeFalsy();
    expect(destroyedCells).toBe(2);
    expect(cells()).toHaveLength(1);
    expect(cells()[0].textContent).toBe('No records found.');
    const emptyRoot = root();
    fixture.destroy();
    expect(KTDataTable.getInstance(emptyRoot)).toBeFalsy();
  });
});

import { DOCUMENT } from '@angular/common';
import {
  ApplicationRef, Component, DestroyRef, Directive, ElementRef, EmbeddedViewRef,
  TemplateRef, ViewEncapsulation, afterRenderEffect, contentChildren, inject, input,
  untracked, viewChild,
} from '@angular/core';
import { KTDataTable, type KTDataTableConfigInterface } from '@keenthemes/ktui/components/datatable';

interface CellContext<T> { $implicit: T }

/** Typed Angular cells hosted by KTUI's supported column render callback. */
@Directive({ selector: 'ng-template[solarTableColumn]' })
export class KtuiTableColumn<T> {
  readonly solarTableColumn = input.required<string>();
  readonly solarTableColumnOf = input.required<readonly T[]>();
  readonly header = input.required<string>();
  readonly width = input<string>();
  readonly template = inject<TemplateRef<CellContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(_: KtuiTableColumn<T>, context: unknown): context is CellContext<T> {
    return true;
  }
}

let nextTableId = 0;

/**
 * KTUI renders the current API result; it does not fetch, filter or page records.
 * Caller-owned cursor controls stay outside the vendor's total-based paginator.
 */
@Component({
  selector: 'app-ktui-table',
  template: `<div #mount class="solar-ktui-table" role="region" tabindex="0"
    [attr.aria-label]="label()" [attr.aria-busy]="busy()"></div>`,
  styleUrl: './ktui-table.css',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'solar-ktui-table-host' },
})
export class KtuiTable<T> {
  readonly rows = input.required<readonly T[]>();
  readonly rowKey = input.required<(row: T) => string>();
  readonly label = input.required<string>();
  readonly busy = input(false);
  readonly emptyTemplate = input<TemplateRef<unknown>>();
  readonly emptyMessage = input('No records found.');
  private readonly columns = contentChildren(KtuiTableColumn);
  private readonly mount = viewChild.required<ElementRef<HTMLDivElement>>('mount');
  private readonly document = inject(DOCUMENT);
  private readonly app = inject(ApplicationRef);
  private readonly namespace = `solar-api-table-${nextTableId++}`;
  private instance: KTDataTable<Record<string, string>> | null = null;
  private readonly views: EmbeddedViewRef<unknown>[] = [];

  constructor() {
    afterRenderEffect(() => {
      const mount = this.mount().nativeElement;
      const rows = this.rows();
      const key = this.rowKey();
      const columns = this.columns();
      const label = this.label();
      const empty = this.emptyTemplate();
      const message = this.emptyMessage();
      // Cell expressions keep their own Angular signal dependencies, not the
      // adapter's render effect (otherwise a menu state would rebuild the list).
      untracked(() => this.render(mount, rows, key, columns, label, empty, message));
    });
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  private dispose(): void {
    const instance = this.instance;
    this.instance = null;
    instance?.dispose();
    // KTUI finalizes its synchronous local draw in a microtask. Clean up again
    // after that tick if Angular replaced/destroyed it during initialization.
    if (instance) queueMicrotask(() => instance.dispose());
    for (const view of this.views.splice(0)) {
      this.app.detachView(view);
      view.destroy();
    }
  }

  private nodes<C>(template: TemplateRef<C>, context: C): DocumentFragment {
    const view = template.createEmbeddedView(context);
    this.views.push(view as EmbeddedViewRef<unknown>);
    this.app.attachView(view);
    view.detectChanges();
    const fragment = this.document.createDocumentFragment();
    fragment.append(...view.rootNodes);
    return fragment;
  }

  private render(
    mount: HTMLElement, rows: readonly T[], rowKey: (row: T) => string,
    columns: readonly KtuiTableColumn<unknown>[], label: string,
    empty: TemplateRef<unknown> | undefined, message: string,
  ): void {
    this.dispose();
    mount.replaceChildren();
    if (!columns.length) return;

    // KTUI's documented local input is a table skeleton. Only index tokens are
    // seeded; product values never pass through the vendor's HTML-string path.
    const root = this.document.createElement('div');
    const table = this.document.createElement('table');
    table.className = 'kt-table text-sm';
    table.setAttribute('data-kt-datatable-table', 'true');
    table.setAttribute('aria-label', label);
    const head = table.createTHead().insertRow();
    const seed = table.createTBody();
    const configColumns: NonNullable<KTDataTableConfigInterface['columns']> = {};

    columns.forEach((column, index) => {
      // Safe generated keys avoid object-key collisions or markup-derived keys.
      const key = `column${index}`;
      const th = this.document.createElement('th');
      th.scope = 'col';
      th.textContent = column.header();
      th.setAttribute('data-kt-datatable-column', key);
      th.setAttribute('data-kt-datatable-column-sort', 'false');
      head.append(th);
      configColumns[key] = {
        title: column.header(), width: column.width(),
        render: token => {
          const row = rows[Number(token)];
          return this.nodes(column.template, { $implicit: row });
        },
        createdCell: (cell, token, _data, row) => {
          cell.dataset['label'] = column.header();
          row.dataset['rowId'] = rowKey(rows[Number(token)]);
        },
      };
    });
    rows.forEach((_, index) => {
      const row = seed.insertRow();
      for (const column of columns) row.insertCell().textContent = String(index);
    });
    root.append(table);
    mount.append(root);
    this.instance = new KTDataTable<Record<string, string>>(root, {
      columns: configColumns, tableLayout: 'fixed', stateSave: false,
      stateNamespace: this.namespace,
      // This is the supplied batch length, not a fabricated collection total.
      // No size/info/pagination elements are mounted; don't slice a batch twice.
      pageSize: Math.max(1, rows.length), pageSizes: [Math.max(1, rows.length)],
      infoEmpty: '',
    });
    if (!rows.length) {
      const cell = table.tBodies[0]?.rows[0]?.cells[0];
      if (cell) {
        cell.classList.add('solar-table-empty');
        if (empty) cell.append(this.nodes(empty, {}));
        else cell.textContent = message;
      }
    }
  }
}

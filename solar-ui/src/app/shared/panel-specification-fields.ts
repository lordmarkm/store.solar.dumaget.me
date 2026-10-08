import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PANEL_SPECIFICATION_FIELDS, panelSpecificationErrors, type PanelSpecificationKey, type PanelSpecifications } from '../core/panel-specifications';

@Component({
  selector: 'app-panel-specification-fields',
  imports: [FormsModule],
  template: `
    <section class="border-t border-border pt-5" [attr.aria-labelledby]="prefix() + '-heading'">
      <h2 [id]="prefix() + '-heading'" class="text-lg font-semibold">Panel specifications</h2>
      <p class="mt-2 text-sm text-secondary-foreground">Optional manufacturer details. Include units exactly as documented; leave unknown values blank. Brand is entered above. These are display values, not sizing calculations.</p>
      <div class="mt-5 grid gap-5 sm:grid-cols-2">
        @for (field of fields; track field.key) {
          <div [class.sm:col-span-2]="field.key === 'warranty' || field.key === 'standardTestConditions'">
            <label [for]="prefix() + '-' + field.key" class="mb-2 block text-xs font-medium">{{ field.label }}</label>
            @if (field.key === 'warranty' || field.key === 'standardTestConditions') {
              <textarea [id]="prefix() + '-' + field.key" class="kt-input min-h-24 w-full" [maxlength]="field.max"
                [ngModelOptions]="{ standalone: true }" [ngModel]="value()[field.key] ?? ''" (ngModelChange)="change(field.key, $event)"
                [attr.aria-invalid]="attempted() && errors()[field.key] ? 'true' : null"
                [attr.aria-describedby]="prefix() + '-' + field.key + '-hint' + (attempted() && errors()[field.key] ? ' ' + prefix() + '-' + field.key + '-error' : '')"></textarea>
            } @else {
              <input [id]="prefix() + '-' + field.key" type="text" class="kt-input w-full" [maxlength]="field.max"
                [ngModelOptions]="{ standalone: true }" [ngModel]="value()[field.key] ?? ''" (ngModelChange)="change(field.key, $event)"
                [attr.aria-invalid]="attempted() && errors()[field.key] ? 'true' : null"
                [attr.aria-describedby]="prefix() + '-' + field.key + '-hint' + (attempted() && errors()[field.key] ? ' ' + prefix() + '-' + field.key + '-error' : '')" />
            }
            <p [id]="prefix() + '-' + field.key + '-hint'" class="mt-1 text-xs text-secondary-foreground">{{ field.hint }}</p>
            @if (attempted() && errors()[field.key]; as error) { <p [id]="prefix() + '-' + field.key + '-error'" class="mt-1 text-xs text-danger" role="alert">{{ error }}</p> }
          </div>
        }
      </div>
    </section>
  `,
})
export class PanelSpecificationFields {
  readonly value = input<PanelSpecifications>({});
  readonly attempted = input(false);
  readonly prefix = input.required<string>();
  readonly changed = output<PanelSpecifications>();
  readonly fields = PANEL_SPECIFICATION_FIELDS;
  readonly errors = computed(() => panelSpecificationErrors(this.value()));
  change(key: PanelSpecificationKey, value: string): void { this.changed.emit({ ...this.value(), [key]: value }); }
}

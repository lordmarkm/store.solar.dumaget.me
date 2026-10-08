import { Component, inject } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { Tooltip } from './tooltip';

@Component({
  selector: 'app-theme-toggle',
  imports: [Tooltip],
  template: `
    <app-tooltip [label]="theme.dark() ? 'Switch to light theme' : 'Switch to dark theme'">
      <button type="button" class="kt-btn kt-btn-sm kt-btn-icon kt-btn-light" (click)="theme.toggle()"
        [attr.aria-label]="theme.dark() ? 'Switch to light theme' : 'Switch to dark theme'"
        [attr.title]="theme.dark() ? 'Switch to light theme' : 'Switch to dark theme'">
        <i class="ki-outline ki-screen text-lg" aria-hidden="true"></i>
      </button>
    </app-tooltip>
  `,
})
export class ThemeToggle { readonly theme = inject(ThemeService); }

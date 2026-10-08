import { Component } from '@angular/core';

@Component({
  selector: 'app-brand',
  host: { class: 'flex min-w-0 items-center' },
  template: `
    <span class="brand-mark" aria-hidden="true">☼</span>
    <span class="kt-menu-title min-w-0 flex-col items-start">
      <strong class="brand-name">Dumaget.me</strong>
      <small class="brand-solar">Solar</small>
    </span>
  `,
  styles: `
    :host { gap: .65rem; }
    /* Match solar.dumaget.me's header mark, independently of KTUI's route palette. */
    .brand-mark {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      background: #c7e86b;
      color: #0e4433;
      font: 400 1.45rem 'DM Sans Variable', system-ui, sans-serif;
    }
    .brand-name {
      display: block;
      white-space: nowrap;
      color: var(--foreground);
      font: 700 1rem/1 'Space Grotesk Variable', sans-serif;
    }
    .brand-solar {
      display: block;
      margin-top: .2rem;
      color: #166b4f;
      font: 700 .72rem/1 'DM Sans Variable', system-ui, sans-serif;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    :host-context(.dark) .brand-solar { color: #96d9b9; }
  `,
})
export class Brand {}

import { Component, input } from '@angular/core';
import { ProductVisual } from '../core/models';
import type { ProductImage } from '../core/product-images';

@Component({
  selector: 'app-product-visual',
  host: { class: 'block' },
  template: `
    @if (images()?.[imageIndex()]; as image) {
      <img class="h-full w-full object-contain" [src]="variant() === 'thumb' ? image.thumbnailUrl : image.url" [alt]="alt()" loading="lazy" />
    } @else {
    <svg viewBox="0 0 260 170" class="h-full w-full" aria-hidden="true">
      <ellipse cx="130" cy="145" rx="75" ry="9" fill="currentColor" opacity=".06"/>
      @switch (kind()) {
        @case ('panel') {
          <path d="m63 33 110-9 33 109-110 10Z" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>
          <path d="m69 37 100-8 29 99-100 9Z" fill="#193e70"/>
          <g stroke="#7ea2ca" stroke-width="1.3"><path d="m94 35 29 100m-4-102 29 100m-4-103 29 100M76 61l100-8m-93 32 100-8m-94 32 101-8"/></g>
          <path d="m101 143-5 8m97-19 9 9" stroke="#94a3b8" stroke-width="3"/>
        }
        @case ('inverter') {
          <rect x="80" y="26" width="96" height="118" rx="9" fill="#e2e8f0" stroke="#94a3b8"/>
          <path d="M166 28h10v113h-10" fill="#cbd5e1"/>
          <rect x="93" y="45" width="61" height="30" rx="5" fill="#223a57"/>
          <rect x="101" y="52" width="29" height="14" rx="2" fill="#8cc8bc"/>
          <circle cx="144" cy="60" r="4" fill="#1379f0"/>
          <g stroke="#94a3b8" stroke-width="2"><path d="M99 97h50m-50 8h50m-50 8h50m-50 8h50"/></g>
          <path d="M106 144v6m45-6v6" stroke="#64748b" stroke-width="5"/>
        }
        @case ('battery') {
          <rect x="88" y="20" width="88" height="123" rx="9" fill="#e2e8f0" stroke="#94a3b8"/>
          <rect x="98" y="33" width="65" height="44" rx="5" fill="#223a57"/>
          <rect x="109" y="44" width="24" height="16" rx="2" fill="#8cc8bc"/>
          <g fill="#1379f0"><circle cx="147" cy="46" r="3"/><circle cx="147" cy="58" r="3"/></g>
          <path d="m132 91-12 16h9l-2 13 13-18h-10Z" fill="#1379f0"/>
          <path d="M98 141h68" stroke="#94a3b8" stroke-width="4"/>
        }
        @case ('rail') {
          <g stroke="#94a3b8" stroke-width="2"><path d="m44 112 143-65 23 10-144 66Z" fill="#cbd5e1"/><path d="m44 112 22 11v11l-22-11Z" fill="#94a3b8"/><path d="m66 123 144-66v12L66 134Z" fill="#e2e8f0"/><path d="m43 82 132-60 17 8L60 90Z" fill="#e2e8f0"/></g>
          <path d="m69 77 10 5v16l-10-4Zm94-43 10 5v16l-10-4Z" fill="#64748b"/>
        }
        @case ('combiner') {
          <rect x="77" y="29" width="106" height="105" rx="8" fill="#e2e8f0" stroke="#94a3b8"/>
          <rect x="88" y="41" width="84" height="73" rx="4" fill="#becbd7"/>
          <g fill="#f8fafc" stroke="#94a3b8"><rect x="95" y="51" width="18" height="47" rx="2"/><rect x="117" y="51" width="18" height="47" rx="2"/><rect x="139" y="51" width="24" height="47" rx="2"/></g>
          <path d="M99 66h10m12 0h10m13 0h14" stroke="#1379f0" stroke-width="4"/>
          <path d="M96 134v10m22-10v10m23-10v10m23-10v10" stroke="#64748b" stroke-width="6"/>
        }
      }
    </svg>
    }
  `,
})
export class ProductVisualComponent {
  readonly kind = input.required<ProductVisual>();
  readonly images = input<ProductImage[] | undefined>(undefined);
  readonly imageIndex = input(0);
  readonly variant = input<'detail' | 'thumb'>('detail');
  readonly alt = input('Product illustration');
}

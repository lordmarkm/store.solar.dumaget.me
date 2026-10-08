import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { NoticeService } from './core/notice.service';
import { ThemeService } from './core/theme.service';
import { AuthNavigationService } from './core/auth-navigation.service';
import { PublicCatalogService } from './core/public-catalog.service';
import { ProjectService } from './core/project.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <a class="skip-link" href="#main-content" (click)="skipToContent($event)">Skip to content</a>
    <router-outlet />
    <div class="fixed bottom-5 end-5 z-50 max-w-[calc(100vw-2.5rem)]" role="status" aria-live="polite">
      @if (notice.message()) {
        <div class="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-sm shadow-lg">
          <i class="ki-outline ki-check-circle text-xl text-primary" aria-hidden="true"></i>
          {{ notice.message() }}
        </div>
      }
    </div>
  `,
})
export class App {
  readonly notice = inject(NoticeService);
  private readonly theme = inject(ThemeService);
  private readonly authNavigation = inject(AuthNavigationService);
  private readonly document = inject(DOCUMENT);
  constructor() {
    const catalog = inject(PublicCatalogService);
    const projects = inject(ProjectService);
    projects.ensureGuestLists();
    const references = [...(projects.currentGuestList()?.items.map(i => i.product.productId) ?? []),
      ...projects.projects().flatMap(p => p.bom.items.flatMap(i => i.kind === 'store-product' ? [i.product.productId] : []))];
    void catalog.hydrate(references);
  }
  skipToContent(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main-content')?.focus();
  }
}

import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `<main id="main-content" tabindex="-1" class="page-width py-24"><p class="eyebrow">404</p><h1 class="page-title mt-3">This page couldn't be found.</h1><p class="mt-3 text-secondary-foreground">Return to the catalog to continue.</p><a routerLink="/catalog" class="kt-btn kt-btn-primary mt-6">Back to catalog</a></main>`,
})
export class NotFound {}

import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSessionService } from '../../core/auth-session.service';

@Component({
  selector: 'app-goodbye',
  imports: [RouterLink],
  template: `
    <section class="kt-card mx-auto max-w-xl p-6 text-center sm:p-8" aria-labelledby="goodbye-title">
      <p class="eyebrow mb-3">See you again</p>
      <h1 id="goodbye-title" class="page-title">Goodbye!</h1>
      @if (auth.status() === 'signed-out') {
        <p class="mt-4 text-sm leading-6 text-muted-foreground">You’re signed out. Thanks for visiting Dumaget.me Solar.</p>
      } @else {
        <p class="mt-4 text-sm leading-6 text-muted-foreground">Thanks for visiting Dumaget.me Solar.</p>
      }
      <a routerLink="/" class="kt-btn kt-btn-primary mx-auto mt-6">Back to home</a>
    </section>
  `,
})
export class GoodbyePage {
  readonly auth = inject(AuthSessionService);
}

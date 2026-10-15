import { ApplicationConfig, inject } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { AUTH_DRIVER, AuthSessionService } from './core/auth-session.service';
import { CUSTOMER_SESSION } from './core/customer-access.service';
import { createFirebaseAuthDriver } from './core/firebase-auth.driver';
import { STOREFRONT_AUTH_ENABLED } from './core/firebase-config';
import { PLANNING_PRODUCTS } from './core/product-source';
import { PublicCatalogService } from './core/public-catalog.service';
import { ACCOUNT_PROJECT_STORE, AccountProjectService } from './core/account-project.service';

export const appConfig: ApplicationConfig = {
  providers: [
    // ng-gallery 12 (shared with the main site) uses legacy animation triggers.
    // Load its compatibility renderer only when needed and disable motion.
    provideAnimationsAsync('noop'),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })),
    { provide: AUTH_DRIVER, useFactory: () => STOREFRONT_AUTH_ENABLED ? createFirebaseAuthDriver() : null },
    { provide: CUSTOMER_SESSION, useFactory: () => inject(AuthSessionService).session },
    { provide: PLANNING_PRODUCTS, useFactory: () => inject(PublicCatalogService).products },
    { provide: ACCOUNT_PROJECT_STORE, useFactory: () => inject(AccountProjectService) },
  ],
};

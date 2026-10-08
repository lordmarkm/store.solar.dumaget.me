import { ApplicationConfig, inject } from '@angular/core';
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
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })),
    { provide: AUTH_DRIVER, useFactory: () => STOREFRONT_AUTH_ENABLED ? createFirebaseAuthDriver() : null },
    { provide: CUSTOMER_SESSION, useFactory: () => inject(AuthSessionService).session },
    { provide: PLANNING_PRODUCTS, useFactory: () => inject(PublicCatalogService).products },
    { provide: ACCOUNT_PROJECT_STORE, useFactory: () => inject(AccountProjectService) },
  ],
};

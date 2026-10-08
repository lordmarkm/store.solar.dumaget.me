import { Routes } from '@angular/router';
import { routes } from '../../app.routes';
import { leaveProductEditorGuard, productPreviewGuard } from './product-preview.guard';

/** Test-only routes for retired fixture components; never imported by the app. */
export const legacyProductRoutes: Routes = routes.map(route => route.children?.some(child => child.path === 'admin/products')
  ? { ...route, children: route.children.map(child => child.path === 'admin/products/new'
    ? { ...child, canActivate: [productPreviewGuard], canDeactivate: [leaveProductEditorGuard], loadComponent: () => import('./product-editor').then(m => m.ProductEditorPage) }
    : child.path === 'admin/products'
      ? { ...child, loadComponent: () => import('./products').then(m => m.ProductsPage) }
      : child) }
  : route);

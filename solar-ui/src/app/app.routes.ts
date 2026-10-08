import { Routes } from '@angular/router';
import { customerGuard } from './core/customer.guard';
import { leaveAdminEditorGuard } from './core/admin-editor.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'catalog' },
  { path: 'bom', pathMatch: 'full', redirectTo: 'draft' },
  {
    path: '', data: { appearance: 'public' }, loadComponent: () => import('./shared/shopping-shell').then(m => m.ShoppingShell),
    children: [
      { path: 'catalog', title: 'Trade catalog · Dumaget.me Solar', loadComponent: () => import('./features/catalog/catalog').then(m => m.Catalog) },
      { path: 'draft', title: 'Cart · Dumaget.me Solar', loadComponent: () => import('./features/bom/bom').then(m => m.Bom) },
      { path: 'sign-in', title: 'Sign in · Dumaget.me Solar', loadComponent: () => import('./features/sign-in/sign-in').then(m => m.SignInPage) },
      { path: 'goodbye', title: 'Goodbye · Dumaget.me Solar', loadComponent: () => import('./features/sign-in/goodbye').then(m => m.GoodbyePage) },
    ],
  },
  {
    path: 'my', canActivate: [customerGuard], canActivateChild: [customerGuard], data: { appearance: 'public' }, loadComponent: () => import('./shared/customer-shell').then(m => m.CustomerShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'projects' },
      { path: 'projects', title: 'My projects · Dumaget.me Solar', loadComponent: () => import('./features/projects/projects').then(m => m.Projects) },
      { path: 'projects/:projectId/bom', title: 'Project BOM · Dumaget.me Solar', loadComponent: () => import('./features/projects/project-bom').then(m => m.ProjectBomPage) },
      { path: 'projects/:projectId', title: 'Project overview · Dumaget.me Solar', loadComponent: () => import('./features/projects/project-overview').then(m => m.ProjectOverview) },
      { path: 'favorites', title: 'Favorites · Dumaget.me Solar', data: { heading: 'Favorites', description: 'A place for equipment you want to revisit.' }, loadComponent: () => import('./shared/customer-placeholder').then(m => m.CustomerPlaceholder) },
      { path: 'profile', title: 'Profile · Dumaget.me Solar', data: { heading: 'Profile', description: 'Your contact and company information will live here.' }, loadComponent: () => import('./shared/customer-placeholder').then(m => m.CustomerPlaceholder) },
      { path: 'settings', title: 'Account settings · Dumaget.me Solar', data: { heading: 'Account settings', description: 'Your account preferences and security controls will live here.' }, loadComponent: () => import('./shared/customer-placeholder').then(m => m.CustomerPlaceholder) },
    ],
  },
  {
    path: '', data: { appearance: 'workspace' }, loadComponent: () => import('./shared/workspace-shell').then(m => m.WorkspaceShell),
    children: [
      { path: 'admin', pathMatch: 'full', redirectTo: 'admin/products' },
      { path: 'admin/products/new', title: 'New product · Dumaget.me Solar', canDeactivate: [leaveAdminEditorGuard], loadComponent: () => import('./features/admin-catalog/admin-product-create').then(m => m.AdminProductCreatePage) },
      { path: 'admin/products/:id/edit', title: 'Edit product · Dumaget.me Solar', canDeactivate: [leaveAdminEditorGuard], loadComponent: () => import('./features/admin-catalog/admin-product-editor').then(m => m.AdminProductEditorPage) },
      { path: 'admin/products', title: 'Products · Dumaget.me Solar', loadComponent: () => import('./features/admin-catalog/admin-products').then(m => m.AdminProductsPage) },
      { path: 'admin/inventory', title: 'Inventory · Dumaget.me Solar', loadComponent: () => import('./features/inventory/inventory').then(m => m.Inventory) },
      { path: 'admin/suppliers/new', title: 'New supplier · Dumaget.me Solar', canDeactivate: [leaveAdminEditorGuard], loadComponent: () => import('./features/admin-catalog/admin-supplier-create').then(m => m.AdminSupplierCreatePage) },
      { path: 'admin/suppliers/:id/edit', title: 'Edit supplier · Dumaget.me Solar', canDeactivate: [leaveAdminEditorGuard], loadComponent: () => import('./features/admin-catalog/admin-supplier-editor').then(m => m.AdminSupplierEditorPage) },
      { path: 'admin/suppliers', title: 'Suppliers · Dumaget.me Solar', loadComponent: () => import('./features/admin-catalog/admin-suppliers').then(m => m.AdminSuppliersPage) },
    ],
  },
  { path: '**', data: { appearance: 'public' }, title: 'Page not found · Dumaget.me Solar', loadComponent: () => import('./shared/not-found').then(m => m.NotFound) },
];

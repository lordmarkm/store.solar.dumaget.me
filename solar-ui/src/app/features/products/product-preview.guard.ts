import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import type { ProductEditorPage } from './product-editor';
import { PRODUCT_PREVIEW_ENABLED } from './product-preview.store';

export const productPreviewGuard: CanActivateFn = () => inject(PRODUCT_PREVIEW_ENABLED)
  ? true : inject(Router).createUrlTree(['/admin/products']);
export const leaveProductEditorGuard: CanDeactivateFn<ProductEditorPage> = editor => editor.canLeave();

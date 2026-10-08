import { inject, Injectable, InjectionToken, isDevMode, signal } from '@angular/core';
import { PRODUCTS } from '../../core/demo-data';
import {
  NewProductInput, normalizePreviewSku, parsePreviewPrice, PreviewProductDraft,
  ProductInputErrors, PreviewProductUnit, validateProductInput,
} from './product-draft';
import type { Category } from '../../core/models';

/** Development sandbox only. Neither a permission grant nor connected persistence. */
export const PRODUCT_PREVIEW_ENABLED = new InjectionToken<boolean>('PRODUCT_PREVIEW_ENABLED', {
  providedIn: 'root', factory: () => isDevMode(),
});
export type CreatePreviewResult =
  | { readonly ok: true; readonly draft: PreviewProductDraft }
  | { readonly ok: false; readonly message: string; readonly errors?: ProductInputErrors };

@Injectable({ providedIn: 'root' })
export class ProductPreviewStore {
  readonly enabled = inject(PRODUCT_PREVIEW_ENABLED);
  private readonly records = signal<readonly PreviewProductDraft[]>([]);
  readonly drafts = this.records.asReadonly();
  private readonly requests = new Map<string, { fingerprint: string; draft: PreviewProductDraft }>();

  existingSkus(): readonly string[] { return [...PRODUCTS.map(product => product.sku), ...this.drafts().map(draft => draft.sku)]; }
  create(input: NewProductInput, requestId: string): CreatePreviewResult {
    if (!this.enabled) return { ok: false, message: 'Product draft creation is only available in the development preview.' };
    if (!requestId || requestId.length > 80) return { ok: false, message: 'The draft request is invalid. Open a new product editor and try again.' };
    const price = parsePreviewPrice(input.priceText);
    const normalized = {
      sku: normalizePreviewSku(input.sku), name: input.name.trim(), brand: input.brand.trim(),
      category: input.category || null, unitCode: input.unitCode || null,
      description: input.description.trim(), basePrice: price,
    };
    // Include raw validated price text to distinguish an invalid retry from a valid unpriced one.
    const fingerprint = JSON.stringify({ ...normalized, priceText: input.priceText.trim() });
    const prior = this.requests.get(requestId);
    if (prior) return prior.fingerprint === fingerprint
      ? { ok: true, draft: prior.draft }
      : { ok: false, message: 'This request was already used for a different draft. Open a new editor.' };
    const errors = validateProductInput(input, this.existingSkus());
    if (Object.keys(errors).length) return { ok: false, message: 'Review the highlighted fields. No draft was saved.', errors };
    try {
      const timestamp = new Date().toISOString();
      const draft: PreviewProductDraft = Object.freeze({
        ...normalized, category: normalized.category as Category | null,
        unitCode: normalized.unitCode as PreviewProductUnit | null,
        basePrice: price ? Object.freeze(price) : null,
        id: `admin-preview-${crypto.randomUUID()}`, schemaVersion: 1, state: 'draft',
        createdAt: timestamp, updatedAt: timestamp,
      });
      this.records.update(records => [...records, draft]);
      this.requests.set(requestId, { fingerprint, draft });
      return { ok: true, draft };
    } catch {
      return { ok: false, message: 'The preview draft could not be created. Your form has been retained; try again.' };
    }
  }
}

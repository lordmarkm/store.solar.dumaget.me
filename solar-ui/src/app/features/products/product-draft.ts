import type { Category, Money } from '../../core/models';
import { CATEGORIES } from '../../core/demo-data';

export const PREVIEW_UNITS = ['unit', 'panel', 'kit'] as const;
export type PreviewProductUnit = typeof PREVIEW_UNITS[number];

/** Form strings stay separate from the saved, JSON-safe development draft. */
export interface NewProductInput {
  readonly sku: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly unitCode: string;
  readonly description: string;
  readonly priceText: string;
}
export interface PreviewProductDraft {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly state: 'draft';
  readonly sku: string;
  readonly name: string;
  readonly brand: string;
  readonly category: Category | null;
  readonly unitCode: PreviewProductUnit | null;
  readonly description: string;
  readonly basePrice: Money | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export type ProductInputErrors = Partial<Record<keyof NewProductInput, string>>;
export function emptyProductInput(): NewProductInput {
  return { sku: '', name: '', brand: '', category: '', unitCode: '', description: '', priceText: '' };
}
export function normalizePreviewSku(sku: string): string { return sku.trim().toUpperCase(); }

/** Exact decimal conversion; empty is unpriced, not free. No float-peso storage. */
export function parsePreviewPrice(value: string): Money | null {
  const text = value.trim();
  if (!text || !/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amountMinor) ? { currency: 'PHP', amountMinor } : null;
}

export function validateProductInput(input: NewProductInput, existingSkus: readonly string[]): ProductInputErrors {
  const errors: ProductInputErrors = {};
  const sku = normalizePreviewSku(input.sku);
  if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku)) errors.sku = 'Enter a SKU of 1–64 letters, numbers, dots, hyphens or underscores.';
  else if (existingSkus.some(existing => normalizePreviewSku(existing) === sku)) errors.sku = 'This SKU already exists in the sample catalog or preview drafts.';
  if (!input.name.trim() || input.name.trim().length > 160) errors.name = 'Enter a product name of 1–160 characters.';
  if (input.brand.trim().length > 80) errors.brand = 'Keep the brand to 80 characters or fewer.';
  if (input.category && !CATEGORIES.includes(input.category as Category)) errors.category = 'Choose a listed category or leave it unset.';
  if (input.unitCode && !PREVIEW_UNITS.includes(input.unitCode as PreviewProductUnit)) errors.unitCode = 'Choose a listed sellable unit or leave it unset.';
  if (input.description.trim().length > 4000) errors.description = 'Keep the description to 4,000 characters or fewer.';
  if (input.priceText.trim() && !parsePreviewPrice(input.priceText)) errors.priceText = 'Enter a non-negative PHP amount with at most two decimal places, without commas.';
  return errors;
}

export function productListReturnUrl(value: string | null): string {
  return value && value.length <= 2000 && /^\/admin\/products(?:\?[^#]*)?$/.test(value)
    ? value : '/admin/products';
}

import { BomItem, BomComponentCategory, BomComponentProtectionType, FreeTextBomItem, isBomComponentCategory, isValidFreeTextProtectionMetadata, isPlanningQuantity, Product, ProductReference } from './models';
import { unitPrice } from './pricing';

export interface PendingProduct { readonly product: ProductReference; readonly quantity: number }
export interface FreeTextInput { readonly title: string; readonly description: string; readonly unit: string; readonly quantity: number; readonly notes: string; readonly componentCategory?: BomComponentCategory; readonly componentProtectionType?: BomComponentProtectionType; readonly amperage?: number }
export type FreeTextErrors = Partial<Record<keyof FreeTextInput, string>>;
export function validateFreeText(input: FreeTextInput): FreeTextErrors {
  const errors: FreeTextErrors = {};
  if (input.componentCategory !== undefined && !isBomComponentCategory(input.componentCategory)) errors.componentCategory = 'Choose a valid component category.';
  if (!isValidFreeTextProtectionMetadata(input)) {
    if (input.componentProtectionType !== undefined && (input.componentProtectionType !== 'ATS' || !['ATS', 'Protection'].includes(input.componentCategory ?? ''))) errors.componentProtectionType = 'Choose a matching component type.';
    if (input.amperage !== undefined || input.componentProtectionType === 'ATS' || input.componentCategory === 'ATS') errors.amperage = 'Enter a finite ATS amperage greater than 0.';
  }
  if (!input.title?.trim() || input.title.trim().length > 240) errors.title = 'Enter an item name (1-240 characters).';
  if (!input.unit?.trim() || input.unit.trim().length > 80) errors.unit = 'Enter a unit (1-80 characters).';
  if (!isPlanningQuantity(input.quantity)) errors.quantity = 'Enter a positive safe whole quantity.';
  if (typeof input.description !== 'string' || input.description.length > 2000) errors.description = 'Use no more than 2000 characters.';
  if (typeof input.notes !== 'string' || input.notes.length > 2000) errors.notes = 'Use no more than 2000 characters.';
  return errors;
}
export function resolveProduct(reference: ProductReference, products: readonly Product[] = []): Product | undefined {
  return products.find(product => product.id === reference.productId && reference.variantId === null && product.unit === reference.unitCode);
}
export function validPendingProduct(pending: PendingProduct, products: readonly Product[] = []): boolean {
  return !!pending?.product && isPlanningQuantity(pending.quantity) && !!resolveProduct(pending.product, products);
}
export function pendingProduct(product: Product, quantity = 1): PendingProduct {
  return { product: { productId: product.id, variantId: null, unitCode: product.unit }, quantity };
}
export function freeTextInput(item?: FreeTextBomItem): FreeTextInput {
  return { title: item?.title ?? '', description: item?.description ?? '', unit: item?.unit ?? '', quantity: item?.quantity ?? 1, notes: item?.notes ?? '', ...(item?.componentCategory ? { componentCategory: item.componentCategory } : {}), ...(item?.componentProtectionType ? { componentProtectionType: item.componentProtectionType } : {}), ...(item?.amperage !== undefined ? { amperage: item.amperage } : {}) };
}
export interface ProjectBomRow { readonly item: BomItem; readonly title: string; readonly unit: string; readonly product?: Product; readonly unitPrice: number | null; readonly total: number | null; readonly pricing: string; readonly specification?: string }
export function projectBomRow(item: BomItem, products: readonly Product[] = []): ProjectBomRow {
  if (item.kind === 'store-product') {
    const product = resolveProduct(item.product, products);
    const price = product ? product.source === 'published' ? product.price : unitPrice(product, item.quantity) : null;
    const total = price === null ? null : price * item.quantity;
    return { item, product, title: product?.name ?? 'Unavailable product', unit: item.product.unitCode, unitPrice: price, total: total !== null && Number.isSafeInteger(Math.round(total * 100)) ? total : null, pricing: product ? product.source === 'published' ? 'Current published catalog price · tax unspecified' : 'Current sample store price · VAT included' : 'Unavailable · pricing unknown' };
  }
  const price = item.estimate.kind === 'manual-estimate' ? item.estimate.unitPrice.amountMinor / 100 : null;
  const total = price === null ? null : price * item.quantity;
  return { item, title: item.title, unit: item.unit, unitPrice: price, total: total !== null && Number.isSafeInteger(Math.round(total * 100)) ? total : null, pricing: price === null ? 'Unpriced requirement · not a store offer' : 'Existing manual estimate · tax unspecified', ...(item.componentProtectionType === 'ATS' && item.amperage !== undefined ? { specification: `ATS · ${item.amperage} A` } : {}) };
}
/** Protect spreadsheet consumers from formula interpretation while preserving user-authored descriptions. */
export function projectBomCsv(items: readonly BomItem[], products: readonly Product[] = []): string {
  const rows: (string | number)[][] = [['Type', 'SKU', 'Item', 'Description', 'Quantity', 'Unit', 'Unit price PHP', 'Line total PHP', 'Pricing provenance', 'Notes']];
  for (const item of items) {
    const row = projectBomRow(item, products);
    rows.push([item.kind, row.product?.sku ?? '', row.title, item.kind === 'free-text' ? item.description : row.product?.description ?? '', item.quantity, row.unit, row.unitPrice ?? '', row.total ?? '', row.pricing, item.notes ?? '']);
  }
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = String(value);
    const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}

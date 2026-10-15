/** Shared selectable catalog vocabulary. Legacy Protection is read-only metadata. */
export const PRODUCT_CATEGORIES = ['Panels', 'Inverters', 'Batteries', 'Mounting', 'Circuit breakers', 'Surge Protection Device', 'ATS', 'PV Isolator', 'MCCB'] as const;
export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === 'string' && (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

export function legacyProductCategory(category: unknown, protectionType?: unknown): unknown {
  if (category === 'Other') return null;
  if (category !== 'Protection') return category;
  return protectionType === 'MCB' ? 'Circuit breakers' : protectionType === 'ATS' ? 'ATS' : null;
}

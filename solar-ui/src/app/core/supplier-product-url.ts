const SHOPEE_HOST = /(?:^|\.)shopee\.ph$/i;

export function supplierProductUrlError(value: unknown, supplierName?: string | null): string | null {
  const requiresShopeeUrl = supplierName?.trim().toLowerCase() === 'shopee';
  if (typeof value !== 'string') return 'Enter a valid HTTPS supplier product URL.';
  if (value.length > 2048 || /\p{Cc}/u.test(value)) return 'Use an HTTPS URL of at most 2,048 characters without control characters.';
  const trimmed = value.trim();
  if (!trimmed) return requiresShopeeUrl ? 'Enter a Shopee product URL.' : null;
  if (/\s|\\/u.test(trimmed)) return 'Use an HTTPS URL without internal whitespace or backslashes.';
  for (const character of trimmed) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return 'Use a URL without unpaired Unicode surrogates.';
  }
  try {
    if (!/^https:\/\//i.test(trimmed)) return 'Enter a valid HTTPS supplier product URL.';
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) return 'Use HTTPS without credentials or a nondefault port.';
    if (requiresShopeeUrl && !SHOPEE_HOST.test(url.hostname)) return 'Use a Shopee link on shopee.ph or one of its subdomains.';
  } catch {
    return 'Enter a valid HTTPS supplier product URL.';
  }
  return null;
}

export function normalizeSupplierProductUrl(value: string): string {
  return value.trim();
}

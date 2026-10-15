/** Only implemented public/customer routes; never an external URL or encoded redirect. */
export function safeCustomerReturnUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[%\\\s]/.test(value)) return '/catalog';
  return /^\/(?:catalog|draft|my(?:\/(?:projects(?:\/[a-zA-Z0-9_-]+(?:\/bom)?)?|favorites|profile|settings))?)(?:[?#][a-zA-Z0-9_=&.#/-]*)?$/.test(value) ? value : '/catalog';
}

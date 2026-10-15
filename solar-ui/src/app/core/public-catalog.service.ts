import { computed, inject, Injectable, signal } from '@angular/core';
import { Product, ProductReference, Category, ProductVisual } from './models';
import { PRODUCT_CATEGORIES } from './product-categories';
import { STORE_API_FETCH } from './store-api.service';
import { validPanelSpecifications, type PanelSpecifications } from './panel-specifications';
import { validProductImages, type ProductImage } from './product-images';
import { validProtectionFields, type McbSpecifications, type AtsSpecifications, type ProtectionType } from './mcb-specifications';

export interface PublishedProduct {
  id: string; schemaVersion: 1; version: number; publishedAt: string; sku: string; name: string; brand: string;
  category: Category | null; unitCode: 'unit' | 'panel' | 'kit'; description: string; amountMinor: number; currency: 'PHP';
  panelSpecifications?: PanelSpecifications | null;
  protectionType?: ProtectionType | null;
  mcbSpecifications?: McbSpecifications | null;
  atsSpecifications?: AtsSpecifications | null;
  images?: ProductImage[];
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CATEGORIES = PRODUCT_CATEGORIES;
const VISUALS: Record<Category, ProductVisual> = { Panels: 'panel', Inverters: 'inverter', Batteries: 'battery', Mounting: 'rail', 'Circuit breakers': 'combiner', 'Surge Protection Device': 'combiner', ATS: 'combiner', 'PV Isolator': 'combiner', MCCB: 'combiner' };
const FIELDS = ['id', 'schemaVersion', 'version', 'publishedAt', 'sku', 'name', 'brand', 'category', 'unitCode', 'description', 'amountMinor', 'currency'];
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown, max: number, multiline = false): v is string => typeof v === 'string' && !!v && v === v.trim() && v.length <= max
  && !(multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(v);
export function parsePublishedProduct(v: unknown): PublishedProduct {
  if (!record(v) || !exact(v, [...FIELDS, ...(Object.hasOwn(v, 'panelSpecifications') ? ['panelSpecifications'] : []), ...(Object.hasOwn(v, 'protectionType') ? ['protectionType'] : []), ...(Object.hasOwn(v, 'mcbSpecifications') ? ['mcbSpecifications'] : []), ...(Object.hasOwn(v, 'atsSpecifications') ? ['atsSpecifications'] : []), ...(Object.hasOwn(v, 'images') ? ['images'] : [])])
    || Object.hasOwn(v, 'panelSpecifications') && (!validPanelSpecifications(v['panelSpecifications'], true) || v['panelSpecifications'] !== null && v['category'] !== 'Panels')
    || !validProtectionFields(v, true)
    || Object.hasOwn(v, 'images') && !validProductImages(v['images'])
    || typeof v['id'] !== 'string' || !UUID.test(v['id'])
    || v['schemaVersion'] !== 1 || !Number.isSafeInteger(v['version']) || (v['version'] as number) < 1 || (v['version'] as number) >= Number.MAX_SAFE_INTEGER
    || typeof v['publishedAt'] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v['publishedAt'])
    || !Number.isFinite(Date.parse(v['publishedAt'])) || new Date(v['publishedAt']).toISOString() !== v['publishedAt']
    || !text(v['sku'], 64) || !/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(v['sku'])
    || !text(v['name'], 160) || !text(v['brand'], 80) || !text(v['description'], 4000, true)
    || !(v['category'] === null || CATEGORIES.includes(v['category'] as Category)) || !['unit', 'panel', 'kit'].includes(v['unitCode'] as string)
    || v['currency'] !== 'PHP' || !Number.isSafeInteger(v['amountMinor']) || (v['amountMinor'] as number) < 0 || (v['amountMinor'] as number) > 99_999_999_999_999) {
    throw new Error('Public catalog returned an invalid record.');
  }
  return v as unknown as PublishedProduct;
}
export function publishedView(product: PublishedProduct): Product {
  const mcb = product.mcbSpecifications;
  const ats = product.atsSpecifications;
  return { id: product.id, sku: product.sku, name: product.name, brand: product.brand, category: product.category,
    description: product.description, spec: mcb ? `${mcb.amperage} A · ${mcb.type}` : ats ? `${ats.amperage} A` : product.protectionType === 'ATS' ? 'Amperage not specified' : product.panelSpecifications?.ratedMaximumPower || 'Specifications not configured',
    secondarySpec: mcb ? 'Miniature circuit breaker' : product.protectionType === 'ATS' ? 'ATS' : product.panelSpecifications?.dimensions || 'Illustrative category artwork',
    ...(Object.hasOwn(product, 'panelSpecifications') ? { panelSpecifications: product.panelSpecifications } : {}),
    ...(Object.hasOwn(product, 'protectionType') ? { protectionType: product.protectionType } : {}),
    ...(Object.hasOwn(product, 'mcbSpecifications') ? { mcbSpecifications: product.mcbSpecifications } : {}),
    ...(Object.hasOwn(product, 'atsSpecifications') ? { atsSpecifications: product.atsSpecifications } : {}),
    ...(Object.hasOwn(product, 'images') ? { images: product.images } : {}),
    price: product.amountMinor / 100, amountMinor: product.amountMinor, publishedVersion: product.version, source: 'published',
    stock: 0, unit: product.unitCode, depot: '', supplierId: '', visual: product.category ? VISUALS[product.category] : 'combiner', tiers: [] };
}

/** Anonymous, on-demand, bounded public reads. Never reads private masters or falls back to fixtures. */
@Injectable({ providedIn: 'root' })
export class PublicCatalogService {
  private readonly fetcher = inject(STORE_API_FETCH);
  readonly items = signal<readonly Product[]>([]);
  private readonly referenced = signal<readonly Product[]>([]);
  readonly products = computed(() => {
    const values = new Map(this.referenced().map(p => [p.id, p]));
    this.items().forEach(p => values.set(p.id, p));
    return [...values.values()];
  });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly nextCursor = signal<string | null>(null);
  private generation = 0;
  private started = false;
  private references: string[] = [];
  private readonly resolving = new Set<string>();

  ensureLoaded(): void { if (!this.started) void this.refresh(); }
  resolve(reference: ProductReference): Product | undefined {
    return this.products().find(p => p.id === reference.productId && reference.variantId === null && p.unit === reference.unitCode);
  }
  async refresh(): Promise<void> {
    if (this.loading()) return;
    this.started = true; this.generation++; this.items.set([]); this.referenced.set([]); this.nextCursor.set(null);
    await this.page(null);
    await this.hydrate(this.references);
  }
  async loadMore(): Promise<void> { if (!this.loading() && this.nextCursor()) await this.page(this.nextCursor()); }
  /** Independent bounded picker page; does not replace storefront/BOM reference caches. */
  async categoryPage(category: Category, cursor: string | null = null, protectionType?: 'ATS'): Promise<{ items: readonly Product[]; nextCursor: string | null }> {
    if (!CATEGORIES.includes(category) || protectionType !== undefined && (protectionType !== 'ATS' || category !== 'ATS') || cursor !== null && !/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) throw new Error('Invalid component selection.');
    const query = new URLSearchParams({ category, limit: '10', ...(cursor ? { cursor } : {}) });
    const value = await this.request('/api/v1/catalog/products?' + query);
    if (!record(value) || !exact(value, ['items', 'nextCursor']) || !Array.isArray(value['items']) || value['items'].length > 10
      || !(value['nextCursor'] === null || typeof value['nextCursor'] === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value['nextCursor']))) throw new Error('Invalid component page.');
    const items = value['items'].map(item => publishedView(parsePublishedProduct(item)));
    if (items.some((item, index) => item.category !== category || protectionType !== undefined && item.protectionType !== protectionType || index > 0 && item.id <= items[index - 1].id)
      || value['nextCursor'] !== null && items.length !== 10) throw new Error('Invalid component page.');
    return { items, nextCursor: value['nextCursor'] as string | null };
  }
  async hydrate(ids: readonly string[], recheck = false): Promise<void> {
    // Prioritize the current page/BOM rather than letting earlier accounts' public
    // references permanently consume the bounded cache. No private data is cached.
    const requested = [...new Set(ids.filter(id => UUID.test(id)))].slice(0, 200);
    this.references = [...new Set([...requested, ...this.references])].slice(0, 200);
    this.referenced.update(rows => rows.filter(product => this.references.includes(product.id)));
    const missing = requested.filter(id => (recheck || !this.products().some(p => p.id === id)) && !this.resolving.has(id));
    // Twenty exact document reads per HTTP request avoids exhausting the shared
    // per-process rate limit when a cart contains more than one catalog page.
    for (let start = 0; start < missing.length; start += 20) {
      const ids = missing.slice(start, start + 20);
      const generation = this.generation;
      ids.forEach(id => this.resolving.add(id));
      try {
        const value = await this.request('/api/v1/catalog/references', { ids });
        if (!record(value) || !exact(value, ['items']) || !Array.isArray(value['items']) || value['items'].length > ids.length) throw new Error('Invalid catalog references.');
        const products = value['items'].map(p => publishedView(parsePublishedProduct(p)));
        if (new Set(products.map(p => p.id)).size !== products.length || products.some(p => !ids.includes(p.id))) throw new Error('Invalid catalog references.');
        if (generation === this.generation) {
          this.referenced.update(rows => [...rows.filter(p => !ids.includes(p.id)), ...products]
            .filter(product => this.references.includes(product.id)));
          if (recheck) {
            const byId = new Map(products.map(product => [product.id, product]));
            this.items.update(rows => rows.flatMap(product => ids.includes(product.id)
              ? byId.has(product.id) ? [byId.get(product.id)!] : [] : [product]));
          }
        }
      } catch { /* Retain original references as unpriced/unavailable; no writes. */ }
      finally { ids.forEach(id => this.resolving.delete(id)); }
    }
  }
  async checkProduct(id: string): Promise<Product> {
    if (!UUID.test(id)) throw new Error('This product is unavailable.');
    const generation = this.generation;
    this.resolving.add(id);
    try {
      const response = await this.request('/api/v1/catalog/products/' + id);
      if (!record(response) || !exact(response, ['product'])) throw new Error('Public catalog returned an invalid response.');
      const parsed = parsePublishedProduct(response['product']);
      if (parsed.id !== id) throw new Error('Public catalog returned a different product.');
      if (generation !== this.generation) throw new Error('Catalog changed. Try again.');
      const product = publishedView(parsed);
      this.referenced.update(rows => [...rows.filter(p => p.id !== id), product]);
      this.items.update(rows => rows.map(p => p.id === id ? product : p));
      return product;
    } catch (error) {
      if (generation === this.generation) {
        this.referenced.update(rows => rows.filter(p => p.id !== id));
        this.items.update(rows => rows.filter(p => p.id !== id));
      }
      throw error;
    } finally { this.resolving.delete(id); }
  }
  private async page(cursor: string | null): Promise<void> {
    const generation = this.generation;
    this.loading.set(true); this.error.set(null);
    try {
      const value = await this.request('/api/v1/catalog/products' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      if (!record(value) || !exact(value, ['items', 'nextCursor']) || !Array.isArray(value['items']) || value['items'].length > 50
        || !(value['nextCursor'] === null || typeof value['nextCursor'] === 'string' && UUID.test(value['nextCursor']))) throw new Error('Public catalog returned an invalid page.');
      const products = value['items'].map(p => publishedView(parsePublishedProduct(p)));
      if (new Set(products.map(p => p.id)).size !== products.length
        || products.some((p, i) => i > 0 && p.id <= products[i - 1].id)
        || cursor !== null && products.some(p => p.id <= cursor)
        || value['nextCursor'] !== null && (products.length !== 50 || value['nextCursor'] !== products.at(-1)?.id)) throw new Error('Public catalog returned an invalid page.');
      if (generation !== this.generation) return;
      this.items.update(rows => cursor ? [...rows, ...products] : products);
      this.nextCursor.set(value['nextCursor']);
    } catch {
      if (generation === this.generation) this.error.set('Unable to load published products. Try again.');
    } finally { if (generation === this.generation) this.loading.set(false); }
  }
  private async request(path: string, body?: { ids: string[] }): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Catalog request timed out.')); }, 10_000);
    });
    try {
      const response = await Promise.race([this.fetcher(path, { method: body ? 'POST' : 'GET', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
        credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal }), deadline]);
      if (!response.ok) throw new Error(response.status === 404 ? 'This product is no longer available.' : 'Catalog is temporarily unavailable.');
      return await Promise.race([response.json(), deadline]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}

import type { PanelSpecifications } from './panel-specifications';
import type { ProductCategory } from './product-categories';
import type { ProductImage } from './product-images';
import type { McbSpecifications, AtsSpecifications, ProtectionType } from './mcb-specifications';
export type { ProductImage } from './product-images';
export type { McbSpecifications } from './mcb-specifications';
export type { ProtectionType } from './mcb-specifications';
export type { AtsSpecifications } from './mcb-specifications';
export type { PanelSpecifications, PanelSpecificationKey } from './panel-specifications';
export type Category = ProductCategory;
export type ProductVisual = 'panel' | 'inverter' | 'battery' | 'rail' | 'combiner';
export interface PriceTier { quantity: number; unitPrice: number; label: string }
export interface Product {
  /** Published records have no configured inventory, tax or tiers. */
  source?: 'published'; amountMinor?: number; publishedVersion?: number;
  panelSpecifications?: PanelSpecifications | null;
  protectionType?: ProtectionType | null;
  mcbSpecifications?: McbSpecifications | null;
  atsSpecifications?: AtsSpecifications | null;
  images?: ProductImage[];
  id: string; sku: string; name: string; brand: string; category: Category | null;
  description: string; spec: string; secondarySpec: string; price: number;
  stock: number; unit: string; depot: string; supplierId: string;
  visual: ProductVisual; tiers: readonly PriceTier[];
}
export interface Supplier {
  id: string; name: string; region: string; category: string; leadDays: number;
  orderUnit: string; initials: string;
}
export interface DraftItem { productId: string; quantity: number }
export interface BomLine { product: Product; quantity: number; unitPrice: number; total: number }

// Planned customer DTOs. Existing demo models above remain backward compatible.
export * from './models/shared.models';
export * from './models/catalog.models';
export * from './models/project.models';
export * from './models/purchase-order.models';
export * from './models/builder.models';

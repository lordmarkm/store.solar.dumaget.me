import type { PanelSpecifications } from './panel-specifications';
import type { ProductImage } from './product-images';
/** Private admin DTOs, not customer catalog projections or PO snapshots. */
export interface SupplierCreateInput {
  requestId: string;
  name: string;
  region: string;
  description: string;
  website: string;
  email: string;
  phone: string;
}
export interface AdminSupplier extends Omit<SupplierCreateInput, 'requestId'> {
  id: string;
  schemaVersion: 1;
  version: number;
  status: 'active' | 'inactive';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface ProductCreateInput {
  requestId: string;
  sku: string;
  name: string;
  brand: string;
  category: 'Panels' | 'Inverters' | 'Batteries' | 'Mounting' | 'Protection' | null;
  unitCode: 'unit' | 'panel' | 'kit' | null;
  description: string;
  amountMinor: number | null;
  supplierId: string;
  panelSpecifications?: PanelSpecifications | null;
  images?: ProductImage[];
}
export interface AdminProduct extends Omit<ProductCreateInput, 'requestId'> {
  id: string;
  schemaVersion: 1;
  version: number;
  state: 'draft' | 'published';
  publishedVersion?: number;
  currency: 'PHP';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductUpdateInput extends ProductCreateInput {
  expectedVersion: number;
}

export interface ProductPublicationInput {
  requestId: string;
  expectedVersion: number;
}
export interface AdminPage<T> { items: T[]; nextCursor: string | null }
export interface SupplierUpdateInput extends SupplierCreateInput { expectedVersion: number }
export interface SupplierStatusInput extends ProductPublicationInput { status: 'active' | 'inactive' }
export interface ProductListFilters { skuPrefix?: string; brand?: string; category?: string; supplierId?: string }

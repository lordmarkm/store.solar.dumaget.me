import { Product } from './models';

export function unitPrice(product: Product, quantity: number): number {
  return product.tiers.reduce((price, tier) => quantity >= tier.quantity ? Math.min(price, tier.unitPrice) : price, product.price);
}
export function includedVat(total: number): number { return Math.round((total - total / 1.12) * 100) / 100; }

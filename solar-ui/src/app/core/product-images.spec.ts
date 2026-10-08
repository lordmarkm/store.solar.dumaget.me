import { describe, expect, it } from 'vitest';
import { isProductImage, validProductImages, type ProductImage } from './product-images';

const id = 'a'.repeat(64);
const image: ProductImage = {
  id,
  url: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${id}/detail.webp`,
  thumbnailUrl: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${id}/thumb.webp`,
  width: 1600, height: 1200,
};

describe('product image DTO contract', () => {
  it('accepts the exact public bucket descriptor and bounded unique image lists', () => {
    expect(isProductImage(image)).toBe(true);
    expect(validProductImages([image])).toBe(true);
    expect(validProductImages([])).toBe(true);
    expect(validProductImages(Array.from({ length: 6 }, (_, index) => ({
      ...image, id: String(index).padStart(64, '0'),
      url: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${String(index).padStart(64, '0')}/detail.webp`,
      thumbnailUrl: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${String(index).padStart(64, '0')}/thumb.webp`,
    })))).toBe(true);
  });

  it('rejects wrong hashes, foreign URLs, invalid dimensions, duplicate IDs, and over-limit lists', () => {
    expect(isProductImage({ ...image, id: id.toUpperCase() })).toBe(false);
    expect(isProductImage({ ...image, url: image.thumbnailUrl })).toBe(false);
    expect(isProductImage({ ...image, width: 1601 })).toBe(false);
    expect(isProductImage({ ...image, height: 0 })).toBe(false);
    expect(validProductImages([image, image])).toBe(false);
    expect(validProductImages(Array.from({ length: 7 }, (_, index) => ({
      ...image, id: String(index).padStart(64, '0'),
      url: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${String(index).padStart(64, '0')}/detail.webp`,
      thumbnailUrl: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${String(index).padStart(64, '0')}/thumb.webp`,
    })))).toBe(false);
  });
});

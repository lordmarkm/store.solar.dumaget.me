export interface ProductImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
}

const IMAGE_ID = /^[a-f0-9]{64}$/;
const IMAGE_BASE = 'https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/';

export function isProductImage(value: unknown): value is ProductImage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const image = value as Record<string, unknown>;
  return Object.keys(image).length === 5 && ['id', 'url', 'thumbnailUrl', 'width', 'height'].every(key => Object.hasOwn(image, key))
    && typeof image['id'] === 'string' && IMAGE_ID.test(image['id'])
    && image['url'] === `${IMAGE_BASE}${image['id']}/detail.webp`
    && image['thumbnailUrl'] === `${IMAGE_BASE}${image['id']}/thumb.webp`
    && Number.isInteger(image['width']) && (image['width'] as number) >= 1 && (image['width'] as number) <= 1600
    && Number.isInteger(image['height']) && (image['height'] as number) >= 1 && (image['height'] as number) <= 1600;
}

export function validProductImages(value: unknown): value is ProductImage[] {
  return Array.isArray(value) && value.length <= 6 && value.every(isProductImage)
    && new Set(value.map(image => image.id)).size === value.length;
}

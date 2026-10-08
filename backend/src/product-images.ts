import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { OutputInfo } from 'sharp';
import type { getStorage } from 'firebase-admin/storage';
import { ApiError } from './errors.js';

export const IMAGE_BUCKET = 'dumaget-me-solar-store-images-dev';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 6;
export interface ProductImage {
  id: string; url: string; thumbnailUrl: string; width: number; height: number;
}
export type ImageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;
export interface ProductImageStore {
  upload(bytes: Buffer, contentType: string): Promise<ProductImage>;
  validate(images: readonly ProductImage[]): Promise<void>;
}
export function imageDescriptor(id: string, width: number, height: number): ProductImage {
  const base = 'https://storage.googleapis.com/' + IMAGE_BUCKET + '/products/' + id;
  return { id, url: base + '/detail.webp', thumbnailUrl: base + '/thumb.webp', width, height };
}
function invalid(): never {
  throw new ApiError(400, 'INVALID_PRODUCT_IMAGES', 'Use up to six uploaded product images.');
}
export function parseProductImages(value: unknown): ProductImage[] {
  if (!Array.isArray(value) || value.length > MAX_PRODUCT_IMAGES) invalid();
  const result: ProductImage[] = [];
  for (const image of value) {
    if (typeof image !== 'object' || image === null || Array.isArray(image)
      || Object.keys(image).length !== 5 || !['id', 'url', 'thumbnailUrl', 'width', 'height'].every(key => Object.hasOwn(image, key))) invalid();
    const { id, url, thumbnailUrl, width, height } = image as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)
      || typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > 1600
      || typeof height !== 'number' || !Number.isInteger(height) || height < 1 || height > 1600) invalid();
    const expected = imageDescriptor(id, width, height);
    if (url !== expected.url || thumbnailUrl !== expected.thumbnailUrl || result.some(item => item.id === id)) invalid();
    result.push(expected);
  }
  return result;
}

/** Public product pictures only; never place credentials or private documents in this bucket. */
export class CloudProductImageStore implements ProductImageStore {
  private active = 0;
  constructor(private readonly bucket: () => ImageBucket,
    private readonly lifecycle?: { beginUpload(image: ProductImage): Promise<void>; finishUpload(image: ProductImage): Promise<void> }) {}

  async upload(bytes: Buffer, contentType: string): Promise<ProductImage> {
    const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
    if (!formats[contentType] || !Buffer.isBuffer(bytes) || !bytes.length)
      throw new ApiError(400, 'INVALID_IMAGE', 'Upload a JPEG, PNG or WebP picture.');
    if (bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'IMAGE_TOO_LARGE', 'Pictures must be 5 MiB or smaller.');
    if (this.active >= 2) throw new ApiError(429, 'IMAGE_BUSY', 'Image processing is busy. Try again shortly.');
    this.active++;
    try {
      let detail: { data: Buffer; info: OutputInfo };
      let thumb: Buffer;
      try {
        const source = sharp(bytes, { limitInputPixels: 24_000_000, failOn: 'warning' });
        const metadata = await source.metadata();
        if (metadata.format !== formats[contentType] || (metadata.pages ?? 1) !== 1) throw new Error('format');
        // Default sharp output drops EXIF/location and other source metadata.
        detail = await source.clone().rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 }).toBuffer({ resolveWithObject: true });
        thumb = await sharp(detail.data).resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 75, effort: 4 }).toBuffer();
        if (detail.data.length > MAX_IMAGE_BYTES || thumb.length > MAX_IMAGE_BYTES) throw new Error('output-size');
      } catch {
        throw new ApiError(400, 'INVALID_IMAGE', 'Use a valid single-frame JPEG, PNG or WebP picture under 24 megapixels.');
      }
      // Pipeline version + source bytes make retries/deduplication immutable and deterministic.
      const id = createHash('sha256').update('solar-product-image-v1\0').update(bytes).digest('hex');
      const image = imageDescriptor(id, detail.info.width, detail.info.height);
      try {
        await this.lifecycle?.beginUpload(image);
        const bucket = this.bucket();
        for (const [variant, data] of [['thumb', thumb], ['detail', detail.data]] as const) {
          try {
            await bucket.file('products/' + id + '/' + variant + '.webp').save(data, {
              resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
              metadata: { contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable',
                metadata: { pipelineVersion: '1', width: String(image.width), height: String(image.height) } },
            });
          } catch (error) {
            // A concurrent identical upload may have created the same immutable object.
            if (!(typeof error === 'object' && error !== null && 'code' in error && Number(error.code) === 412)) throw error;
          }
        }
        await this.validate([image]);
        await this.lifecycle?.finishUpload(image);
        return image;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'Picture storage is temporarily unavailable. Retry the upload.');
      }
    } finally { this.active--; }
  }
  async validate(raw: readonly ProductImage[]): Promise<void> {
    const images = parseProductImages(raw);
    if (!images.length) return;
    try {
      const bucket = this.bucket();
      for (const image of images) {
        for (const variant of ['thumb', 'detail']) {
          const [metadata] = await bucket.file('products/' + image.id + '/' + variant + '.webp').getMetadata();
          if (metadata.contentType !== 'image/webp' || metadata.metadata?.['pipelineVersion'] !== '1'
            || metadata.metadata?.['width'] !== String(image.width) || metadata.metadata?.['height'] !== String(image.height)) {
            throw new ApiError(400, 'INVALID_PRODUCT_IMAGES', 'Upload the picture again before saving this product.');
          }
        }
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && Number(error.code) === 404)
        throw new ApiError(400, 'INVALID_PRODUCT_IMAGES', 'Upload the picture before attaching it to a product.');
      throw new ApiError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'Picture storage is temporarily unavailable.');
    }
  }
}

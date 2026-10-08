import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { ApiError } from '../src/errors.js';
import { CloudProductImageStore, IMAGE_BUCKET, MAX_IMAGE_BYTES, imageDescriptor, parseProductImages } from '../src/product-images.js';
import type { ImageBucket } from '../src/product-images.js';

const id = 'a'.repeat(64);
const image = imageDescriptor(id, 120, 80);
function parserError(value: unknown): void {
  assert.throws(() => parseProductImages(value), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_PRODUCT_IMAGES');
}
async function apiError(action: () => Promise<unknown>, status: number, code: string): Promise<void> {
  await assert.rejects(action(), (error: unknown) => error instanceof ApiError && error.statusCode === status && error.code === code);
}
type Stored = { bytes: Buffer; metadata: { contentType: string; cacheControl: string; metadata: Record<string, string> } };
function fakeBucket(options: { saveError?: Error; metadataError?: Error } = {}) {
  const objects = new Map<string, Stored>();
  const saves: string[] = [];
  const bucket = { file(name: string) { return {
    async save(bytes: Buffer, opts: { metadata: Stored['metadata'] }) {
      saves.push(name);
      if (options.saveError) throw options.saveError;
      if (objects.has(name)) throw Object.assign(new Error('precondition failed'), { code: 412 });
      objects.set(name, { bytes, metadata: opts.metadata });
    },
    async getMetadata() {
      if (options.metadataError) throw options.metadataError;
      const saved = objects.get(name);
      if (!saved) throw Object.assign(new Error('not found'), { code: 404 });
      return [{ ...saved.metadata, metadata: saved.metadata.metadata }];
    },
  }; } };
  return { bucket: bucket as unknown as ImageBucket, objects, saves };
}
async function source(format: 'png' | 'jpeg' | 'webp', width = 120, height = 80): Promise<Buffer> {
  const pipeline = sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 70 } } });
  return format === 'png' ? pipeline.png().toBuffer() : format === 'jpeg' ? pipeline.jpeg().toBuffer() : pipeline.webp().toBuffer();
}

test('product image metadata parser requires canonical bounded unique descriptors', () => {
  assert.deepEqual(parseProductImages([image]), [image]);
  assert.deepEqual(parseProductImages([]), []);
  for (const value of [null, {}, [null], [image, image], Array(7).fill(image), [{ ...image, id: 'A'.repeat(64) }],
    [{ ...image, width: 0 }], [{ ...image, height: 1601 }], [{ ...image, width: 1.5 }],
    [{ ...image, url: `https://${IMAGE_BUCKET}/products/${id}/detail.webp?x=1` }],
    [{ ...image, thumbnailUrl: 'https://attacker.example/thumb.webp' }], [{ ...image, extra: true }]]) parserError(value);
});

test('real PNG JPEG and WebP buffers become immutable WebP detail and thumbnail objects', async () => {
  for (const [format, mime] of [['png', 'image/png'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp']] as const) {
    const storage = fakeBucket();
    const result = await new CloudProductImageStore(() => storage.bucket).upload(await source(format), mime);
    assert.equal(result.width, 120); assert.equal(result.height, 80);
    assert.deepEqual([...storage.objects.keys()].sort(), [`products/${result.id}/detail.webp`, `products/${result.id}/thumb.webp`]);
    for (const object of storage.objects.values()) {
      assert.equal(object.metadata.contentType, 'image/webp');
      assert.equal(object.metadata.cacheControl, 'public,max-age=31536000,immutable');
      assert.equal(object.metadata.metadata.pipelineVersion, '1');
      assert.equal((await sharp(object.bytes).metadata()).format, 'webp');
    }
  }
});

test('same source retries deduplicate immutable creates and tolerate 412 preconditions', async () => {
  const storage = fakeBucket(); const store = new CloudProductImageStore(() => storage.bucket); const bytes = await source('png');
  const first = await store.upload(bytes, 'image/png');
  assert.deepEqual(await store.upload(bytes, 'image/png'), first);
  assert.equal(storage.objects.size, 2); assert.equal(storage.saves.length, 4);
});

test('normalizes orientation, bounds both sizes and strips embedded source metadata', async () => {
  const bytes = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#306848' } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.ok((await sharp(bytes).metadata()).exif);
  const storage = fakeBucket();
  const result = await new CloudProductImageStore(() => storage.bucket).upload(bytes, 'image/jpeg');
  const detail = await sharp(storage.objects.get('products/' + result.id + '/detail.webp')!.bytes).metadata();
  const thumb = await sharp(storage.objects.get('products/' + result.id + '/thumb.webp')!.bytes).metadata();
  assert.equal(result.width, detail.width);
  assert.equal(result.height, detail.height);
  assert.equal(detail.height, 1600);
  assert.ok(detail.width! < detail.height!);
  assert.equal(thumb.height, 400);
  assert.ok(thumb.width! <= 400);
  for (const metadata of [detail, thumb]) {
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal(metadata.xmp, undefined);
  }
});

test('processing concurrency is bounded and released after completion', async () => {
  const storage = fakeBucket();
  const store = new CloudProductImageStore(() => storage.bucket);
  const bytes = await source('png');
  const first = store.upload(bytes, 'image/png');
  const second = store.upload(bytes, 'image/png');
  await apiError(() => store.upload(bytes, 'image/png'), 429, 'IMAGE_BUSY');
  await Promise.all([first, second]);
  await store.upload(bytes, 'image/png');
});

test('rejects SVG GIF MIME mismatch truncation oversized input and over-limit pixels', async () => {
  const storage = fakeBucket();
  const store = new CloudProductImageStore(() => storage.bucket);
  const png = await source('png'); const jpeg = await source('jpeg'); const webp = await source('webp');
  for (const [bytes, mime] of [[Buffer.from('<svg/>'), 'image/png'], [Buffer.from('GIF89a'), 'image/gif'],
    [png, 'image/jpeg'], [jpeg, 'image/png'], [webp, 'image/jpeg'], [png.subarray(0, Math.floor(png.length / 2)), 'image/png']] as const)
    await apiError(() => store.upload(bytes, mime), 400, 'INVALID_IMAGE');
  await apiError(() => store.upload(png, 'image/svg+xml'), 400, 'INVALID_IMAGE');
  await apiError(() => store.upload(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png'), 413, 'IMAGE_TOO_LARGE');
  await apiError(async () => store.upload(await source('png', 4900, 4900), 'image/png'), 400, 'INVALID_IMAGE');
});

test('rejects an actual two-frame GIF despite an allowed request MIME', async () => {
  const header = Buffer.from('47494638396101000100800000ffffff000000', 'hex');
  const frame = Buffer.from('21f904000a0000002c0000000001000100000202440100', 'hex');
  const animated = Buffer.concat([header, frame, frame, Buffer.from([0x3b])]);
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  await apiError(() => new CloudProductImageStore(() => fakeBucket().bucket).upload(animated, 'image/png'), 400, 'INVALID_IMAGE');
});

test('sanitizes storage errors and validates object existence metadata dimensions and canonical URLs', async () => {
  const secret = 'private-bucket-token-should-not-leak';
  const unavailable = new CloudProductImageStore(() => fakeBucket({ saveError: new Error(secret) }).bucket);
  await assert.rejects(unavailable.upload(await source('png'), 'image/png'), (error: unknown) => error instanceof ApiError
    && error.statusCode === 503 && error.code === 'IMAGE_STORAGE_UNAVAILABLE' && !error.message.includes(secret));
  const missing = new CloudProductImageStore(() => fakeBucket().bucket);
  await apiError(() => missing.validate([image]), 400, 'INVALID_PRODUCT_IMAGES');
  const storage = fakeBucket(); const store = new CloudProductImageStore(() => storage.bucket);
  const uploaded = await store.upload(await source('png'), 'image/png'); await store.validate([uploaded]);
  const detailKey = `products/${uploaded.id}/detail.webp`; const detail = storage.objects.get(detailKey)!;
  storage.objects.set(detailKey, { ...detail, metadata: { ...detail.metadata, contentType: 'image/png' } });
  await apiError(() => store.validate([uploaded]), 400, 'INVALID_PRODUCT_IMAGES');
  const badDimensions = { ...uploaded, width: uploaded.width + 1 };
  await apiError(() => store.validate([badDimensions]), 400, 'INVALID_PRODUCT_IMAGES');
  const badUrl = { ...uploaded, url: 'https://attacker.example/image.webp' };
  await apiError(() => store.validate([badUrl]), 400, 'INVALID_PRODUCT_IMAGES');
  const badMeta = fakeBucket({ metadataError: new Error(secret) });
  await assert.rejects(new CloudProductImageStore(() => badMeta.bucket).validate([image]), (error: unknown) => error instanceof ApiError
    && error.statusCode === 503 && error.code === 'IMAGE_STORAGE_UNAVAILABLE' && !error.message.includes(secret));
});

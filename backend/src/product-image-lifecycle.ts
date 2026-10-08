import { randomUUID } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { ApiError } from './errors.js';
import { parseProductImages, type ProductImage, type ImageBucket } from './product-images.js';

const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
/** Every attach and delete touches the same Firestore ledger; GCS is not transactional. */
export class ProductImageLifecycle {
  constructor(private readonly database: () => Firestore, private readonly bucket: () => ImageBucket,
    private readonly now = () => Date.now()) {}

  async beginUpload(image: ProductImage): Promise<void> {
    parseProductImages([image]);
    const ref = this.database().collection('productImageAssets').doc(image.id);
    await this.database().runTransaction(async tx => {
      const saved = await tx.get(ref), data = saved.data();
      if (saved.exists && data?.['state'] === 'deleting') throw new ApiError(409, 'IMAGE_CLEANUP_BUSY', 'Picture cleanup is in progress. Retry this upload shortly.');
      if (saved.exists) this.validateAsset(data, image.id);
      tx.set(ref, { image, state: 'active', retained: data?.['retained'] === true,
        touch: (data?.['touch'] ?? 0) + 1, leaseUntil: this.now() + LEASE_MS, nextAt: this.now() + ORPHAN_GRACE_MS });
    }, { maxAttempts: 3 });
  }
  async finishUpload(image: ProductImage): Promise<void> {
    const ref = this.database().collection('productImageAssets').doc(image.id);
    await this.database().runTransaction(async tx => {
      const saved = await tx.get(ref), data = saved.data();
      this.validateAsset(data, image.id);
      if (data!['state'] !== 'active') throw new ApiError(409, 'IMAGE_CLEANUP_BUSY', 'Upload the picture again.');
      tx.update(ref, { leaseUntil: 0, touch: data!['touch'] + 1 });
    }, { maxAttempts: 3 });
  }
  /** Must be invoked inside the product transaction, before its first write. */
  async stage(tx: Transaction, before: readonly ProductImage[], after: readonly ProductImage[],
    beforePublic: readonly ProductImage[] = [], afterPublic: readonly ProductImage[] = []): Promise<string[]> {
    const all = new Map([...before, ...beforePublic, ...after, ...afterPublic].map(image => [image.id, image]));
    const attached = new Set([...after, ...afterPublic].map(image => image.id));
    const changes = [];
    for (const image of all.values()) {
      parseProductImages([image]);
      const ref = this.database().collection('productImageAssets').doc(image.id);
      const saved = await tx.get(ref), data = saved.data();
      if (saved.exists) this.validateAsset(data, image.id);
      if (attached.has(image.id) && saved.exists && data?.['state'] !== 'active')
        throw new ApiError(409, 'IMAGE_CLEANUP_BUSY', 'Picture was removed from storage. Upload it again before saving.');
      changes.push({ ref, image, data, attached: attached.has(image.id) });
    }
    // Caller has completed ALL entity reads before calling this method.
    for (const change of changes) {
      tx.set(change.ref, { image: change.image, state: change.data?.['state'] ?? 'active',
        retained: change.data?.['retained'] === true, touch: (change.data?.['touch'] ?? 0) + 1,
        leaseUntil: change.data?.['leaseUntil'] ?? 0,
        ...(change.attached ? {} : { nextAt: this.now() }),
        ...(change.data?.['claim'] ? { claim: change.data['claim'] } : {}) });
    }
    return changes.filter(change => !change.attached).map(change => change.image.id);
  }
  /** Opportunistic, bounded, no paid scheduler. Failure must never turn a committed Save into a failed Save. */
  async sweep(priorityIds: readonly string[] = []): Promise<void> {
    try {
      for (const id of new Set(priorityIds.slice(0, 12))) {
        try { await this.remove(id); } catch { /* Persistent ledger retries on a later Save. */ }
      }
      const page = await this.database().collection('productImageAssets').where('nextAt', '<=', this.now()).orderBy('nextAt').limit(6).get();
      for (const doc of page.docs) {
        try { await this.remove(doc.id); } catch { /* Ledger remains pending for the next admin Save/cleanup request. */ }
      }
    } catch { /* Storage outage: confirmed catalog writes still succeed. */ }
  }
  private validateAsset(data: Record<string, any> | undefined, id: string): void {
    if (!data || !['active', 'deleting', 'deleted'].includes(data['state']) || typeof data['retained'] !== 'boolean'
      || !Number.isSafeInteger(data['touch']) || data['touch'] < 0 || !Number.isSafeInteger(data['leaseUntil'])
      || data['leaseUntil'] < 0 || data['nextAt'] !== undefined && (!Number.isSafeInteger(data['nextAt']) || data['nextAt'] < 0)
      || data['claim'] !== undefined && typeof data['claim'] !== 'string')
      throw new ApiError(503, 'IMAGE_LEDGER_INVALID', 'Image retention data needs review.');
    if (parseProductImages([data['image']])[0]!.id !== id) throw new ApiError(503, 'IMAGE_LEDGER_INVALID', 'Image retention data needs review.');
  }
  private async remove(id: string): Promise<void> {
    const db = this.database(), ref = db.collection('productImageAssets').doc(id);
    const claim = randomUUID();
    const image = await db.runTransaction(async tx => {
      const saved = await tx.get(ref), data = saved.data();
      this.validateAsset(data, id);
      if (data!['retained'] || data!['state'] === 'deleted' || data!['leaseUntil'] > this.now()
        || data!['nextAt'] === undefined || data!['nextAt'] > this.now()) return null;
      const descriptor = parseProductImages([data!['image']])[0]!;
      // Covers legacy masters/projections too; no full collection scan or client-selected object path.
      const privateRefs = await tx.get(db.collection('products').where('images', 'array-contains', descriptor).limit(1));
      const publicRefs = await tx.get(db.collection('publishedProducts').where('images', 'array-contains', descriptor).limit(1));
      // Future locked POs MUST create an immutable hold in this collection in their locking transaction.
      const hold = await tx.get(db.collection('productImageRetentions').doc(id));
      if (!privateRefs.empty || !publicRefs.empty || hold.exists) {
        tx.set(ref, { image: descriptor, state: 'active', retained: data!['retained'], touch: data!['touch'] + 1, leaseUntil: 0 });
        return null;
      }
      tx.set(ref, { ...data, state: 'deleting', claim, leaseUntil: this.now() + LEASE_MS, nextAt: this.now() + LEASE_MS,
        touch: data!['touch'] + 1 });
      return descriptor;
    }, { maxAttempts: 3 });
    if (!image) return;
    // Asset remains tombstoned across partial failure; attach/upload is fenced until both variants are gone.
    for (const variant of ['thumb', 'detail']) {
      const file = this.bucket().file('products/' + id + '/' + variant + '.webp');
      try {
        const [metadata] = await file.getMetadata();
        if (metadata.contentType !== 'image/webp' || metadata.metadata?.['pipelineVersion'] !== '1'
          || metadata.metadata?.['width'] !== String(image.width) || metadata.metadata?.['height'] !== String(image.height)
          || !metadata.generation || !/^\d+$/.test(String(metadata.generation))) throw new Error('unsafe-object');
        await file.delete({ ifGenerationMatch: metadata.generation });
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && Number(error.code) === 404)) throw error;
      }
    }
    await db.runTransaction(async tx => {
      const saved = await tx.get(ref), data = saved.data();
      this.validateAsset(data, id);
      if (data!['state'] !== 'deleting' || data!['claim'] !== claim) return;
      tx.set(ref, { image, state: 'deleted', retained: false, touch: data!['touch'] + 1, leaseUntil: 0 });
    }, { maxAttempts: 3 });
  }
}

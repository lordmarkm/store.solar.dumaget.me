import { createHash, randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import type { Firestore, Query } from 'firebase-admin/firestore';
import type { VerifiedIdentity } from './auth.js';
import { actorDisplayName } from './auth.js';
import { ApiError } from './errors.js';
import { object, exact, uuid, parseProductId, parseProductRecord } from './admin-catalog.js';
import type { AdminCatalogRepository, AdminPage } from './admin-catalog.js';
import { productPageCursor } from './admin-catalog.repository.js';
import { INVENTORY_PAGE_SIZE, MOVEMENT_PAGE_SIZE, clean, stock, stockStatus, movementDelta, parseLocationInput, parseLocationUpdate, parseStockInput, parseCountInput, parseTransferInput, parseSettingsInput, parseSettings, parseInventoryQuery, parseLocation, parseBalance, parseMovement } from './inventory.js';
import type { InventoryRepository, InventoryLocation, InventoryBalance, InventoryRow, InventoryMovement, LocationInput, LocationUpdateInput, StockInput, StockResult, CountInput, TransferInput, TransferResult, SettingsInput, InventorySettings, InventoryFilters } from './inventory.js';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const inventoryPoolId = (productId: string, locationId: string) => parseProductId(productId) + '_' + parseProductId(locationId);

/** Physical stock only. No supplier promises, PO allocation or public projection. */
export class FirestoreInventoryRepository implements InventoryRepository {
  constructor(private readonly database: () => Firestore, private readonly catalog: AdminCatalogRepository, private readonly now = () => new Date(),
    private readonly resolveActorNames?: (uids: readonly string[]) => Promise<ReadonlyMap<string, string>>) {}
  private sanitize(error: unknown): ApiError {
    return error instanceof ApiError ? error : new ApiError(503, 'INVENTORY_UNAVAILABLE', 'Inventory is temporarily unavailable.');
  }
  private actor(identity: VerifiedIdentity): string { return clean(identity.uid, 128); }
  async locations(cursor: string | null): Promise<AdminPage<InventoryLocation>> {
    try {
      if (cursor !== null && !uuid(cursor)) throw new ApiError(400, 'INVALID_CURSOR', 'Invalid page cursor.');
      let query = this.database().collection('inventoryLocations').orderBy(FieldPath.documentId()).limit(51);
      if (cursor) query = query.startAfter(cursor.toLowerCase());
      const page = await query.get(), visible = page.docs.slice(0, 50);
      return { items: visible.map(doc => parseLocation(doc.data(), doc.id)), nextCursor: page.docs.length > 50 ? visible.at(-1)!.id : null };
    } catch (error) { throw this.sanitize(error); }
  }
  createLocation(actor: VerifiedIdentity, input: LocationInput): Promise<InventoryLocation> { return this.saveLocation(actor, null, parseLocationInput(input)); }
  updateLocation(actor: VerifiedIdentity, id: string, input: LocationUpdateInput): Promise<InventoryLocation> { return this.saveLocation(actor, parseProductId(id), parseLocationUpdate(input)); }
  private async saveLocation(identity: VerifiedIdentity, existingId: string | null, input: LocationInput | LocationUpdateInput): Promise<InventoryLocation> {
    try {
      const actorUid = this.actor(identity), db = this.database(), at = this.now().toISOString(), id = existingId ?? randomUUID();
      const ref = db.collection('inventoryLocations').doc(id);
      const receipt = db.collection('inventoryRequests').doc(hash(actorUid) + '-' + input.requestId);
      const payloadHash = hash(JSON.stringify({ operation: 'location', existingId, input }));
      return await db.runTransaction(async tx => {
        const previous = await tx.get(receipt);
        if (previous.exists) {
          const data = previous.data();
          if (!object(data) || data['actorUid'] !== actorUid || data['payloadHash'] !== payloadHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Request ID already used for different details.');
          const result = parseLocation(data['location'], String((data['location'] as InventoryLocation)?.id));
          const latest = await tx.get(db.collection('inventoryLocations').doc(result.id));
          if (!latest.exists || parseLocation(latest.data(), result.id).version !== result.version) throw new ApiError(409, 'LOCATION_CHANGED', 'Location changed. Reload.');
          return result;
        }
        const saved = await tx.get(ref);
        let location: InventoryLocation;
        if (existingId) {
          if (!saved.exists) throw new ApiError(404, 'LOCATION_NOT_FOUND', 'Location not found.');
          const current = parseLocation(saved.data(), id), edit = input as LocationUpdateInput;
          if (current.version !== edit.expectedVersion || current.version >= Number.MAX_SAFE_INTEGER - 1) throw new ApiError(409, 'LOCATION_CHANGED', 'Location changed. Reload.');
          location = { ...current, name: edit.name, notes: edit.notes, status: edit.status, version: current.version + 1, updatedAt: at };
        } else {
          const create = input as LocationInput;
          const key = db.collection('inventoryLocationCodes').doc(create.code);
          if ((await tx.get(key)).exists) throw new ApiError(409, 'LOCATION_CODE_EXISTS', 'This location code already exists.');
          location = { id, schemaVersion: 1, code: create.code, name: create.name, notes: create.notes, status: 'active', version: 1, createdAt: at, updatedAt: at, createdBy: actorUid };
          tx.create(key, { locationId: id });
        }
        const result = parseLocation(location, id);
        tx.set(ref, result);
        tx.create(receipt, { schemaVersion: 1, actorUid, payloadHash, location: result });
        tx.create(db.collection('inventoryLocationAudit').doc(hash(actorUid) + '-' + input.requestId), { schemaVersion: 1, actorUid, at, requestId: input.requestId, location: result });
        return result;
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }
  async list(rawLocationId: string, cursor: string | null, rawFilters: InventoryFilters): Promise<AdminPage<InventoryRow>> {
    try {
      const locationId = parseProductId(rawLocationId), db = this.database();
      const location = await db.collection('inventoryLocations').doc(locationId).get();
      if (!location.exists) throw new ApiError(404, 'LOCATION_NOT_FOUND', 'Location not found.');
      parseLocation(location.data(), locationId);
      const { filters: parsed } = parseInventoryQuery(rawFilters), { stockStatus: status, ...filters } = parsed;
      const scope = hash(JSON.stringify({ locationId, filters, status }));
      let anchor = cursor;
      if (status && cursor) {
        let data: unknown;
        try { data = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { throw new ApiError(400, 'INVALID_CURSOR', 'Invalid inventory cursor.'); }
        if (!object(data) || !exact(data, ['q', 'c']) || data['q'] !== scope || typeof data['c'] !== 'string'
          || !/^[A-Za-z0-9_-]{1,512}$/.test(data['c'])) throw new ApiError(400, 'INVALID_CURSOR', 'Cursor does not match this inventory query.');
        anchor = data['c'];
      }
      const items: InventoryRow[] = [];
      // Bounded join BEFORE collecting the visible page. No projection fan-out,
      // whole-collection fetch, offset, or page-local frontend stock filtering.
      for (let batch = 0; batch < (status ? 5 : 1); batch++) {
        const page = await this.catalog.products(anchor, filters, INVENTORY_PAGE_SIZE);
        if (page.items.length > INVENTORY_PAGE_SIZE) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Stored inventory needs review.');
        const records = page.items.length ? await db.getAll(...page.items.flatMap(product => {
          const pool = inventoryPoolId(product.id, locationId);
          return [db.collection('inventoryBalances').doc(pool), db.collection('inventorySettings').doc(pool)];
        })) : [];
        for (let index = 0; index < page.items.length; index++) {
          const product = page.items[index]!, saved = records[index * 2], config = records[index * 2 + 1];
          const balance = saved?.exists ? parseBalance(saved.data(), product.id, locationId) : null;
          const settings = config?.exists ? parseSettings(config.data(), product.id, locationId) : null;
          if (balance && balance.unitCode !== product.unitCode) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Recorded stock unit needs review.');
          const row: InventoryRow = { product, balance, settings, stockStatus: stockStatus(balance, settings) };
          if (!status || row.stockStatus === status) items.push(row);
          if (items.length === INVENTORY_PAGE_SIZE) {
            const more = index < page.items.length - 1 || !!page.nextCursor;
            return { items, nextCursor: more ? (status ? Buffer.from(JSON.stringify({ q: scope,
              c: productPageCursor(filters, INVENTORY_PAGE_SIZE, product) })).toString('base64url') : page.nextCursor) : null };
          }
        }
        anchor = page.nextCursor;
        if (!anchor) return { items, nextCursor: null };
      }
      // Sparse filters may return a short/empty page with continuation at the
      // 50-candidate budget. This is not a claim that there are no later matches.
      return { items, nextCursor: anchor ? (status ? Buffer.from(JSON.stringify({ q: scope, c: anchor })).toString('base64url') : anchor) : null };
    } catch (error) { throw this.sanitize(error); }
  }
  async row(rawProductId: string, rawLocationId: string): Promise<InventoryRow> {
    try {
      const productId = parseProductId(rawProductId), locationId = parseProductId(rawLocationId), db = this.database();
      const pool = inventoryPoolId(productId, locationId);
      const [productDoc, locationDoc, balanceDoc, settingsDoc] = await db.getAll(db.collection('products').doc(productId),
        db.collection('inventoryLocations').doc(locationId), db.collection('inventoryBalances').doc(pool), db.collection('inventorySettings').doc(pool));
      if (!productDoc?.exists || !locationDoc?.exists) throw new ApiError(404, 'INVENTORY_REFERENCE_NOT_FOUND', 'Product or location not found.');
      const product = parseProductRecord(productDoc.data(), productId); parseLocation(locationDoc.data(), locationId);
      const balance = balanceDoc?.exists ? parseBalance(balanceDoc.data(), productId, locationId) : null;
      const settings = settingsDoc?.exists ? parseSettings(settingsDoc.data(), productId, locationId) : null;
      if (balance && balance.unitCode !== product.unitCode) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Recorded stock unit needs review.');
      return { product, balance, settings, stockStatus: stockStatus(balance, settings) };
    } catch (error) { throw this.sanitize(error); }
  }
  async movements(rawProductId: string, rawLocationId: string, cursor: string | null): Promise<AdminPage<InventoryMovement>> {
    try {
      const productId = parseProductId(rawProductId), locationId = parseProductId(rawLocationId);
      const fingerprint = hash(inventoryPoolId(productId, locationId));
      let query: Query = this.database().collection('inventoryBalances').doc(inventoryPoolId(productId, locationId))
        .collection('movements').orderBy('version', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(MOVEMENT_PAGE_SIZE + 1);
      if (cursor !== null) {
        let data: unknown;
        try {
          if (!/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) throw new Error();
          data = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        } catch { throw new ApiError(400, 'INVALID_CURSOR', 'Invalid page cursor.'); }
        if (!object(data) || !exact(data, ['pool', 'version', 'id']) || data['pool'] !== fingerprint || !uuid(data['id'])
          || !Number.isSafeInteger(data['version']) || Number(data['version']) < 1) throw new ApiError(400, 'INVALID_CURSOR', 'Cursor does not match this stock pool.');
        query = query.startAfter(data['version'], data['id']);
      }
      const page = await query.get(), visible = page.docs.slice(0, MOVEMENT_PAGE_SIZE);
      const items = visible.map(doc => { const movement = parseMovement(doc.data(), productId, locationId);
        if (movement.id !== doc.id) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Stored inventory needs review.'); return movement; });
      const last = items.at(-1);
      const missing = [...new Set(items.filter(item => !item.actorName).map(item => item.actorUid))];
      if (missing.length && this.resolveActorNames) {
        try {
          const names = await this.resolveActorNames(missing);
          for (let index = 0; index < items.length; index++) {
            const item = items[index]!, name = actorDisplayName(names.get(item.actorUid), item.actorUid);
            if (!item.actorName && name) items[index] = { ...item, actorName: name };
          }
        } catch { /* Missing/deleted accounts or Auth outages never erase history. */ }
      }
      return { items, nextCursor: page.docs.length > MOVEMENT_PAGE_SIZE && last ? Buffer.from(JSON.stringify({ pool: fingerprint, version: last.version, id: last.id })).toString('base64url') : null };
    } catch (error) { throw this.sanitize(error); }
  }
  async settings(identity: VerifiedIdentity, rawProductId: string, rawLocationId: string, rawInput: SettingsInput): Promise<InventorySettings> {
    try {
      const input = parseSettingsInput(rawInput), productId = parseProductId(rawProductId), locationId = parseProductId(rawLocationId);
      const db = this.database(), actorUid = this.actor(identity), at = this.now().toISOString(), poolId = inventoryPoolId(productId, locationId);
      const ref = db.collection('inventorySettings').doc(poolId), receiptId = hash(actorUid) + '-' + input.requestId;
      const receipt = db.collection('inventoryRequests').doc(receiptId), payloadHash = hash(JSON.stringify({ operation: 'settings', productId, locationId, input }));
      return await db.runTransaction(async tx => {
        const previous = await tx.get(receipt), saved = await tx.get(ref);
        if (previous.exists) {
          const data = previous.data();
          if (!object(data) || data['actorUid'] !== actorUid || data['payloadHash'] !== payloadHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Request ID already used.');
          const result = parseSettings(data['settings'], productId, locationId);
          if (!saved.exists || parseSettings(saved.data(), productId, locationId).version !== result.version) throw new ApiError(409, 'INVENTORY_CHANGED', 'Threshold changed. Reload.');
          return result;
        }
        const current = saved.exists ? parseSettings(saved.data(), productId, locationId) : null;
        if ((current?.version ?? null) !== input.expectedVersion || (current?.version ?? 0) >= Number.MAX_SAFE_INTEGER - 1) throw new ApiError(409, 'INVENTORY_CHANGED', 'Threshold changed. Reload.');
        const productDoc = await tx.get(db.collection('products').doc(productId)), locationDoc = await tx.get(db.collection('inventoryLocations').doc(locationId));
        const unitRef = db.collection('inventoryProductUnits').doc(productId), unitLock = await tx.get(unitRef);
        if (!productDoc.exists || !locationDoc.exists) throw new ApiError(404, 'INVENTORY_REFERENCE_NOT_FOUND', 'Product or location not found.');
        const product = parseProductRecord(productDoc.data(), productId); parseLocation(locationDoc.data(), locationId);
        if (product.version !== input.expectedProductVersion) throw new ApiError(409, 'PRODUCT_CHANGED', 'Product changed. Reload before configuring a threshold.');
        if (!product.unitCode) throw new ApiError(400, 'STOCK_UNIT_REQUIRED', 'Set the product unit before configuring a threshold.');
        if (unitLock.exists && (!object(unitLock.data()) || !exact(unitLock.data()!, ['schemaVersion', 'unitCode'])
          || unitLock.get('schemaVersion') !== 1 || unitLock.get('unitCode') !== product.unitCode)) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Recorded unit needs review.');
        const result = parseSettings({ schemaVersion: 1, productId, locationId, reorderPoint: input.reorderPoint,
          version: (current?.version ?? 0) + 1, updatedAt: at, updatedBy: actorUid }, productId, locationId);
        tx.set(ref, result);
        if (!unitLock.exists) tx.create(unitRef, { schemaVersion: 1, unitCode: product.unitCode });
        tx.create(receipt, { schemaVersion: 1, actorUid, payloadHash, settings: result });
        tx.create(db.collection('inventorySettingsAudit').doc(receiptId), { schemaVersion: 1, actorUid, at, requestId: input.requestId, settings: result });
        return result;
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }
  async transfer(identity: VerifiedIdentity, rawProductId: string, rawSourceId: string, rawInput: TransferInput): Promise<TransferResult> {
    try {
      const input = parseTransferInput(rawInput), productId = parseProductId(rawProductId), sourceId = parseProductId(rawSourceId), destinationId = input.destinationLocationId;
      if (sourceId === destinationId) throw new ApiError(400, 'INVALID_TRANSFER', 'Choose a different destination.');
      const db = this.database(), actorUid = this.actor(identity), at = this.now().toISOString();
      if (Date.parse(input.observedAt) > Date.parse(at) + 300_000) throw new ApiError(400, 'OBSERVATION_IN_FUTURE', 'Observation date cannot be in the future.');
      const sourceRef = db.collection('inventoryBalances').doc(inventoryPoolId(productId, sourceId));
      const destinationRef = db.collection('inventoryBalances').doc(inventoryPoolId(productId, destinationId));
      const receiptId = hash(actorUid) + '-' + input.requestId, receipt = db.collection('inventoryRequests').doc(receiptId);
      const payloadHash = hash(JSON.stringify({ operation: 'transfer', productId, sourceId, input }));
      return await db.runTransaction(async tx => {
        const previous = await tx.get(receipt), sourceDoc = await tx.get(sourceRef), destinationDoc = await tx.get(destinationRef);
        if (previous.exists) {
          const data = previous.data();
          if (!object(data) || data['actorUid'] !== actorUid || data['payloadHash'] !== payloadHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Request ID already used.');
          if (!object(data['result']) || !exact(data['result'], ['source', 'destination'])) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Stored transfer needs review.');
          const result = data['result'] as unknown as TransferResult;
          for (const [entry, locationId, saved] of [[result.source, sourceId, sourceDoc], [result.destination, destinationId, destinationDoc]] as const) {
            if (!object(entry) || !exact(entry, ['balance', 'movement'])) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Stored transfer needs review.');
            const balance = parseBalance(entry.balance, productId, locationId), movement = parseMovement(entry.movement, productId, locationId);
            if (balance.version !== movement.version || balance.onHand !== movement.onHandAfter || movement.transferId !== input.requestId
              || movement.quantity !== input.quantity || movement.reason !== input.reason || movement.observedAt !== input.observedAt
              || balance.unitCode !== movement.unitCode || balance.updatedAt !== movement.createdAt || balance.observedAt !== movement.observedAt
              || movement.actorUid !== actorUid || balance.updatedBy !== actorUid) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Stored transfer needs review.');
            if (!saved.exists || parseBalance(saved.data(), productId, locationId).version !== balance.version) throw new ApiError(409, 'INVENTORY_CHANGED', 'Stock changed after this transfer. Reload.');
          }
          if (result.source.movement.kind !== 'transfer-out' || result.destination.movement.kind !== 'transfer-in'
            || result.source.movement.otherLocationId !== destinationId || result.destination.movement.otherLocationId !== sourceId
            || result.source.balance.unitCode !== result.destination.balance.unitCode
            || result.source.movement.createdAt !== result.destination.movement.createdAt
            || result.source.movement.delta + result.destination.movement.delta !== 0) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Stored transfer needs review.');
          return result;
        }
        if (!sourceDoc.exists || !destinationDoc.exists) throw new ApiError(409, 'OPENING_BALANCE_REQUIRED', 'Record an opening count at both locations before transferring.');
        const source = parseBalance(sourceDoc.data(), productId, sourceId), destination = parseBalance(destinationDoc.data(), productId, destinationId);
        const productDoc = await tx.get(db.collection('products').doc(productId)), fromDoc = await tx.get(db.collection('inventoryLocations').doc(sourceId)),
          toDoc = await tx.get(db.collection('inventoryLocations').doc(destinationId));
        const unitRef = db.collection('inventoryProductUnits').doc(productId), unitLock = await tx.get(unitRef);
        if (!productDoc.exists || !fromDoc.exists || !toDoc.exists) throw new ApiError(404, 'INVENTORY_REFERENCE_NOT_FOUND', 'Product or location not found.');
        const product = parseProductRecord(productDoc.data(), productId), from = parseLocation(fromDoc.data(), sourceId), to = parseLocation(toDoc.data(), destinationId);
        if (from.status !== 'active' || to.status !== 'active') throw new ApiError(409, 'LOCATION_INACTIVE', 'Both locations must be active.');
        if (product.version !== input.expectedProductVersion || source.version !== input.expectedSourceVersion || destination.version !== input.expectedDestinationVersion
          || source.version >= Number.MAX_SAFE_INTEGER - 1 || destination.version >= Number.MAX_SAFE_INTEGER - 1) throw new ApiError(409, 'INVENTORY_CHANGED', 'Stock or product changed. Reload.');
        if (!product.unitCode || source.unitCode !== product.unitCode || destination.unitCode !== product.unitCode
          || unitLock.exists && (!object(unitLock.data()) || !exact(unitLock.data()!, ['schemaVersion', 'unitCode'])
            || unitLock.get('schemaVersion') !== 1 || unitLock.get('unitCode') !== product.unitCode)) throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Recorded stock units need review.');
        if (!stock(source.onHand - input.quantity) || !stock(destination.onHand + input.quantity)) throw new ApiError(409, 'INVALID_STOCK_BALANCE', 'Insufficient stock or destination exceeds the supported limit.');
        const entry = (current: InventoryBalance, locationId: string, otherLocationId: string, kind: 'transfer-in' | 'transfer-out'): StockResult => {
          const delta = movementDelta({ kind, quantity: input.quantity });
          const balance = parseBalance({ ...current, onHand: current.onHand + delta, version: current.version + 1,
            updatedAt: at, observedAt: input.observedAt, updatedBy: actorUid }, productId, locationId);
          const movement = parseMovement({ id: input.requestId, schemaVersion: 1, productId, locationId, unitCode: current.unitCode,
            kind, quantity: input.quantity, delta, onHandBefore: current.onHand, onHandAfter: balance.onHand, version: balance.version,
            reason: input.reason, observedAt: input.observedAt, createdAt: at, actorUid,
            ...(actorDisplayName(identity.displayName, actorUid) ? { actorName: actorDisplayName(identity.displayName, actorUid)! } : {}),
            transferId: input.requestId, otherLocationId }, productId, locationId);
          return { balance, movement };
        };
        const result: TransferResult = { source: entry(source, sourceId, destinationId, 'transfer-out'), destination: entry(destination, destinationId, sourceId, 'transfer-in') };
        tx.set(sourceRef, result.source.balance); tx.set(destinationRef, result.destination.balance);
        tx.create(sourceRef.collection('movements').doc(input.requestId), result.source.movement);
        tx.create(destinationRef.collection('movements').doc(input.requestId), result.destination.movement);
        if (!unitLock.exists) tx.create(unitRef, { schemaVersion: 1, unitCode: product.unitCode });
        tx.create(receipt, { schemaVersion: 1, actorUid, payloadHash, result });
        tx.create(db.collection('inventoryTransfers').doc(receiptId), { schemaVersion: 1, productId, sourceId, destinationId, actorUid, at, input });
        return result;
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }
  adjust(identity: VerifiedIdentity, productId: string, locationId: string, input: StockInput): Promise<StockResult> {
    return this.applyStock(identity, productId, locationId, parseStockInput(input), 'stock');
  }
  count(identity: VerifiedIdentity, productId: string, locationId: string, rawInput: CountInput): Promise<StockResult> {
    const { countedQuantity, ...input } = parseCountInput(rawInput);
    return this.applyStock(identity, productId, locationId, { ...input, kind: 'count', quantity: countedQuantity }, 'count');
  }
  private async applyStock(identity: VerifiedIdentity, rawProductId: string, rawLocationId: string,
    input: StockInput | (Omit<StockInput, 'kind'> & { kind: 'count' }), operation: 'stock' | 'count'): Promise<StockResult> {
    try {
      const productId = parseProductId(rawProductId), locationId = parseProductId(rawLocationId);
      const actorUid = this.actor(identity), db = this.database(), at = this.now().toISOString();
      if (Date.parse(input.observedAt) > Date.parse(at) + 300_000) throw new ApiError(400, 'OBSERVATION_IN_FUTURE', 'Observation date cannot be in the future.');
      const pool = db.collection('inventoryBalances').doc(inventoryPoolId(productId, locationId));
      const receipt = db.collection('inventoryRequests').doc(hash(actorUid) + '-' + input.requestId);
      const payloadHash = hash(JSON.stringify({ operation, productId, locationId, input }));
      return await db.runTransaction(async tx => {
        const previous = await tx.get(receipt), saved = await tx.get(pool);
        if (previous.exists) {
          const data = previous.data();
          if (!object(data) || data['actorUid'] !== actorUid || data['payloadHash'] !== payloadHash || !object(data['result']))
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Request ID already used for different details.');
          const balance = parseBalance(data['result']['balance'], productId, locationId);
          const movement = parseMovement(data['result']['movement'], productId, locationId);
          if (movement.id !== input.requestId || balance.version !== movement.version || balance.onHand !== movement.onHandAfter
            || balance.unitCode !== movement.unitCode || balance.updatedBy !== actorUid || movement.actorUid !== actorUid
            || balance.updatedAt !== movement.createdAt || balance.observedAt !== movement.observedAt)
            throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Stored inventory needs review.');
          if (!saved.exists || parseBalance(saved.data(), productId, locationId).version !== balance.version)
            throw new ApiError(409, 'INVENTORY_CHANGED', 'Stock changed after this operation. Reload.');
          return { balance, movement };
        }
        const productDoc = await tx.get(db.collection('products').doc(productId)), locationDoc = await tx.get(db.collection('inventoryLocations').doc(locationId));
        const unitRef = db.collection('inventoryProductUnits').doc(productId);
        const unitLock = await tx.get(unitRef);
        if (!productDoc.exists || !locationDoc.exists) throw new ApiError(404, 'INVENTORY_REFERENCE_NOT_FOUND', 'Product or location not found.');
        const product = parseProductRecord(productDoc.data(), productId), location = parseLocation(locationDoc.data(), locationId);
        if (product.version !== input.expectedProductVersion) throw new ApiError(409, 'PRODUCT_CHANGED', 'Product changed. Reload before recording stock.');
        if (location.status !== 'active') throw new ApiError(409, 'LOCATION_INACTIVE', 'Reactivate the location before recording stock movements.');
        if (!product.unitCode) throw new ApiError(400, 'STOCK_UNIT_REQUIRED', 'Set the product unit before recording stock.');
        if (unitLock.exists && (!object(unitLock.data()) || !exact(unitLock.data()!, ['schemaVersion', 'unitCode'])
          || unitLock.get('schemaVersion') !== 1 || unitLock.get('unitCode') !== product.unitCode))
          throw new ApiError(503, 'INVENTORY_DATA_INVALID', 'Recorded stock unit needs review.');
        const current = saved.exists ? parseBalance(saved.data(), productId, locationId) : null;
        if (input.kind === 'count' ? (current?.version ?? null) !== input.expectedVersion
          : input.kind === 'opening' ? current !== null : current === null || current.version !== input.expectedVersion)
          throw new ApiError(409, 'INVENTORY_CHANGED', 'Stock changed or its opening balance is missing. Reload.');
        if (current && (current.unitCode !== product.unitCode || current.version >= Number.MAX_SAFE_INTEGER - 1))
          throw new ApiError(409, 'STOCK_UNIT_CHANGED', 'Stock unit or version needs review.');
        const delta = input.kind === 'count' ? input.quantity - (current?.onHand ?? 0) : movementDelta(input), onHand = (current?.onHand ?? 0) + delta;
        if (!stock(onHand)) throw new ApiError(409, 'INVALID_STOCK_BALANCE', 'This movement would make stock negative or exceed the supported limit.');
        const balance = parseBalance({ schemaVersion: 1, productId, locationId, unitCode: product.unitCode, onHand,
          version: (current?.version ?? 0) + 1, updatedAt: at, observedAt: input.observedAt, updatedBy: actorUid }, productId, locationId);
        const movement = parseMovement({ id: input.requestId, schemaVersion: 1, productId, locationId, unitCode: product.unitCode,
          kind: input.kind, quantity: input.quantity, delta, onHandBefore: current?.onHand ?? null, onHandAfter: onHand, version: balance.version,
          reason: input.reason, observedAt: input.observedAt, createdAt: at, actorUid,
          ...(actorDisplayName(identity.displayName, actorUid) ? { actorName: actorDisplayName(identity.displayName, actorUid)! } : {}) }, productId, locationId);
        tx.set(pool, balance);
        // First-stock/unit-edit races meet at one stable read/write lock document.
        if (!unitLock.exists) tx.create(unitRef, { schemaVersion: 1, unitCode: product.unitCode });
        tx.create(pool.collection('movements').doc(input.requestId), movement);
        tx.create(receipt, { schemaVersion: 1, actorUid, payloadHash, result: { balance, movement } });
        return { balance, movement };
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }
}

import type { InventoryLocation, InventoryMovement, InventoryRow } from './inventory.models';

type CsvCell = string | number | null;

/** Serialize CSV cells with spreadsheet formula protection for text values. */
export function safeCSV(rows: readonly (readonly CsvCell[])[]): string {
  const serialized = rows.map(row => row.map(cell => {
    if (cell === null) return '';
    const value = typeof cell === 'number' ? String(cell) : protectSpreadsheetText(cell);
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(','));
  return `\uFEFF${serialized.join('\r\n')}`;
}

function protectSpreadsheetText(value: string): string {
  return /^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(value)
    || /^[\s]*[\u0000-\u001f\u007f]/.test(value) ? `'${value}` : value;
}

export function inventoryRowsCsv(rows: readonly InventoryRow[], location: InventoryLocation): string {
  const header: CsvCell[] = [
    'sku', 'productName', 'locationCode', 'locationName',
    'stockStatus', 'unitCode', 'onHand', 'balanceVersion', 'observedAt', 'updatedAt', 'updatedByName', 'reorderPoint', 'settingsVersion',
  ];
  const records = rows.map(({ product, balance, settings, stockStatus }): CsvCell[] => [
    product.sku, product.name, location.code, location.name,
    stockStatus ?? (balance ? 'known' : 'unknown'), balance?.unitCode ?? product.unitCode ?? 'unknown',
    balance?.onHand ?? null, balance?.version ?? null, balance?.observedAt ?? null,
    balance?.updatedAt ?? null,
    // Balance responses have no display-name projection yet; never expose the internal updating-admin UID here.
    balance ? 'Name unavailable' : null,
    settings?.reorderPoint ?? null, settings?.version ?? null,
  ]);
  return safeCSV([header, ...records]);
}

export function inventoryMovementsCsv(
  moves: readonly InventoryMovement[], product: { id: string; sku: string; name: string }, location: InventoryLocation,
  locations: readonly InventoryLocation[] = [],
): string {
  const header: CsvCell[] = [
    'schemaVersion', 'productSku', 'productName',
    'locationCode', 'locationName', 'unitCode', 'kind', 'quantity', 'delta',
    'onHandBefore', 'onHandAfter', 'version', 'reason', 'observedAt', 'createdAt', 'actorName', 'otherLocationCode', 'otherLocationName',
  ];
  const records = moves.map(move => [
    move.schemaVersion, product.sku, product.name,
    location.code, location.name, move.unitCode, move.kind, move.quantity,
    move.delta, move.onHandBefore, move.onHandAfter, move.version, move.reason,
    move.observedAt, move.createdAt, move.actorName && move.actorName !== move.actorUid ? move.actorName : 'Name unavailable',
    move.otherLocationId ? locations.find(candidate => candidate.id === move.otherLocationId)?.code ?? 'Location unavailable' : null,
    move.otherLocationId ? locations.find(candidate => candidate.id === move.otherLocationId)?.name ?? 'Location unavailable' : null,
  ] satisfies CsvCell[]);
  return safeCSV([header, ...records]);
}

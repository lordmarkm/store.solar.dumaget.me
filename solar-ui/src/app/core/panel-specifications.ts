/** Manufacturer-supplied display values, not numbers for sizing calculations. */
export const PANEL_SPECIFICATION_FIELDS = [
  { key: 'productCode', label: 'Product code', hint: 'Manufacturer model / product code', max: 200 },
  { key: 'eanCode', label: 'EAN code', hint: 'Keep any leading zeroes', max: 200 },
  { key: 'lightColor', label: 'Light color', hint: 'Manufacturer value, or None if applicable', max: 200 },
  { key: 'cable', label: 'Cable', hint: 'Cross-section and length, with units', max: 200 },
  { key: 'ratedMaximumPower', label: 'Rated maximum power', hint: 'Include Wp', max: 200 },
  { key: 'shortCircuitCurrentTolerance', label: 'Short circuit current tolerance', hint: 'Manufacturer value, with A or tolerance units', max: 200 },
  { key: 'openCircuitVoltageTolerance', label: 'Open circuit voltage tolerance', hint: 'Manufacturer value, with V or tolerance units', max: 200 },
  { key: 'ipRating', label: 'IP rating', hint: 'Manufacturer ingress protection rating', max: 200 },
  { key: 'dimensions', label: 'Size of product', hint: 'Length × width × thickness, with mm', max: 200 },
  { key: 'standardTestConditions', label: 'Standard test conditions', hint: 'Air mass, irradiance and cell temperature, with units', max: 500 },
  { key: 'safetyClass', label: 'Safety class', hint: 'Manufacturer safety class', max: 200 },
  { key: 'maxSystemVoltage', label: 'Max system voltage', hint: 'Include V', max: 200 },
  { key: 'grossWeight', label: 'Gross weight', hint: 'Include kg; verify decimal separator', max: 200 },
  { key: 'netWeight', label: 'Net weight', hint: 'Include kg; verify decimal separator', max: 200 },
  { key: 'warranty', label: 'Warranty', hint: 'Product warranty and output-performance terms', max: 1000 },
] as const;
export type PanelSpecificationKey = typeof PANEL_SPECIFICATION_FIELDS[number]['key'];
export type PanelSpecifications = Partial<Record<PanelSpecificationKey, string>>;

export function panelSpecificationErrors(value: PanelSpecifications): Partial<Record<PanelSpecificationKey, string>> {
  const errors: Partial<Record<PanelSpecificationKey, string>> = {};
  for (const field of PANEL_SPECIFICATION_FIELDS) {
    const entry = value[field.key];
    const multiline = field.key === 'standardTestConditions' || field.key === 'warranty';
    if (entry !== undefined && (typeof entry !== 'string' || entry.length > field.max
      || (multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(entry))) {
      errors[field.key] = `Use at most ${field.max} characters without unsupported control characters.`;
    }
  }
  return errors;
}

export function validPanelSpecifications(value: unknown, canonical = false): value is PanelSpecifications | null {
  if (value === null) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const fields: readonly string[] = PANEL_SPECIFICATION_FIELDS.map(field => field.key);
  if (Object.keys(value).some(key => !fields.includes(key))) return false;
  const specs = value as PanelSpecifications;
  return Object.keys(panelSpecificationErrors(specs)).length === 0
    && Object.values(specs).every(entry => typeof entry === 'string' && (!canonical || entry === entry.trim()));
}

export function normalizePanelSpecifications(value: PanelSpecifications): PanelSpecifications {
  return Object.fromEntries(PANEL_SPECIFICATION_FIELDS.flatMap(field => {
    const entry = value[field.key];
    return entry === undefined ? [] : [[field.key, entry.trim()]];
  }));
}

/** Omission preserves legacy shape; explicit null clears a previously saved map. */
export function panelSpecificationPayload(category: string, value: PanelSpecifications, previouslySaved = false): { panelSpecifications?: PanelSpecifications | null } {
  const specs = Object.fromEntries(Object.entries(normalizePanelSpecifications(value)).filter(([, entry]) => !!entry));
  if (category === 'Panels' && Object.keys(specs).length) return { panelSpecifications: specs };
  return previouslySaved ? { panelSpecifications: null } : {};
}

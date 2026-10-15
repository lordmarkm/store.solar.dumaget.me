export interface McbSpecifications {
  type: 'AC' | 'DC';
  amperage: number;
}

export type ProtectionType = 'MCB' | 'ATS';

export interface AtsSpecifications {
  amperage: number;
}

export function parseMcbAmperage(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const amperage = Number(text);
  return Number.isFinite(amperage) && amperage > 0 && amperage <= Number.MAX_SAFE_INTEGER ? amperage : null;
}

export function validMcbSpecifications(value: unknown): value is McbSpecifications {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return Object.keys(fields).length === 2 && Object.hasOwn(fields, 'type') && Object.hasOwn(fields, 'amperage')
    && (fields['type'] === 'AC' || fields['type'] === 'DC')
    && typeof fields['amperage'] === 'number' && Number.isFinite(fields['amperage'])
    && fields['amperage'] > 0 && fields['amperage'] <= Number.MAX_SAFE_INTEGER;
}

export function validAtsSpecifications(value: unknown): value is AtsSpecifications {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return Object.keys(fields).length === 1 && Object.hasOwn(fields, 'amperage')
    && typeof fields['amperage'] === 'number' && Number.isFinite(fields['amperage'])
    && fields['amperage'] > 0 && fields['amperage'] <= Number.MAX_SAFE_INTEGER;
}

export const parseAtsAmperage = parseMcbAmperage;

export function validProtectionFields(value: Record<string, unknown>, allowLegacyAts = false): boolean {
  const hasType = Object.hasOwn(value, 'protectionType');
  const hasSpecifications = Object.hasOwn(value, 'mcbSpecifications');
  const protectionType = value['protectionType'];
  const specifications = value['mcbSpecifications'];
  const hasAtsSpecifications = Object.hasOwn(value, 'atsSpecifications');
  const atsSpecifications = value['atsSpecifications'];
  if (hasType && protectionType !== null && protectionType !== 'MCB' && protectionType !== 'ATS') return false;
  if (hasSpecifications && specifications !== null && !validMcbSpecifications(specifications)) return false;
  if (hasAtsSpecifications && atsSpecifications !== null && !validAtsSpecifications(atsSpecifications)) return false;
  const category = value['category'];
  if (category === 'Circuit breakers' || allowLegacyAts && category === 'Protection' && protectionType === 'MCB') {
    return (protectionType == null || protectionType === 'MCB') && hasSpecifications && validMcbSpecifications(specifications) && atsSpecifications == null;
  }
  if (category === 'ATS' || allowLegacyAts && category === 'Protection' && protectionType === 'ATS') {
    return (protectionType == null || protectionType === 'ATS') && specifications == null
      && (validAtsSpecifications(atsSpecifications) || allowLegacyAts && (!hasAtsSpecifications || atsSpecifications === null));
  }
  if (atsSpecifications != null || specifications != null) return false;
  return protectionType == null && specifications == null && (category !== 'Protection' || allowLegacyAts);
}

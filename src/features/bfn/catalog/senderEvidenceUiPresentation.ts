import type {
  SenderExtensionJsonValue,
  SenderRawPointRecord,
} from '../../modeling/catalog/sender/v1_2';

export interface SenderRawInputPresentation {
  primary: string;
  secondary?: string;
}

export type SenderKineticModelPresentation = 'michaelisMenten' | 'substrateInhibition' | 'reported';

export interface SenderKineticParameterPresentation {
  key: string;
  symbol: string;
  value: string | null;
  unit: string | null;
  error: string | null;
}

const KINETIC_MODEL_PRESENTATION: Readonly<Record<string, SenderKineticModelPresentation>> = {
  reported_michaelis_menten: 'michaelisMenten',
  reported_partial_substrate_inhibition: 'substrateInhibition',
};

const PARAMETER_SYMBOLS: Readonly<Record<string, string>> = {
  Km: 'Kₘ',
  kcat: 'kcat',
  kcat_over_Km: 'kcat/Kₘ',
};

export function presentSenderRawInput(
  point: Pick<SenderRawPointRecord, 'input_value' | 'input_unit' | 'input_label' | 'input_name'>,
): SenderRawInputPresentation {
  const label = nonEmpty(point.input_label);
  if (point.input_value !== null) {
    const primary = joinScientificUnit(formatScientificNumber(point.input_value), point.input_unit);
    return label && label !== primary ? { primary, secondary: label } : { primary };
  }
  return { primary: label ?? point.input_name };
}

export function presentSenderKineticModel(modelType: string): SenderKineticModelPresentation {
  return KINETIC_MODEL_PRESENTATION[modelType] ?? 'reported';
}

export function presentSenderKineticParameters(
  parameterJson: Readonly<Record<string, SenderExtensionJsonValue>>,
): readonly SenderKineticParameterPresentation[] {
  return Object.entries(parameterJson).map(([key, rawValue]) => {
    const record = isJsonRecord(rawValue) ? rawValue : null;
    return {
      key,
      symbol: PARAMETER_SYMBOLS[key] ?? key,
      value: formatJsonPrimitive(record ? record.value : rawValue),
      unit: presentScientificUnit(typeof record?.unit === 'string' ? record.unit : null),
      error: formatJsonPrimitive(record?.error),
    };
  });
}

function isJsonRecord(
  value: SenderExtensionJsonValue,
): value is Readonly<Record<string, SenderExtensionJsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatJsonPrimitive(value: SenderExtensionJsonValue | undefined): string | null {
  if (typeof value === 'number') return formatScientificNumber(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  return null;
}

function formatScientificNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumSignificantDigits: 6,
    useGrouping: false,
  }).format(value);
}

function joinScientificUnit(value: string, unit: string | null): string {
  return unit ? value + ' ' + presentScientificUnit(unit) : value;
}

function presentScientificUnit(unit: string | null): string | null {
  return unit?.replaceAll('^-1', '⁻¹') ?? null;
}

function nonEmpty(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

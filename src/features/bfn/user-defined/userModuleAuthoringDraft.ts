import type { BfnEvidenceGrade, BfnProject, BfnQuantityType, BfnUnit } from '../types';
import type {
  UserDefinedFunctionalModuleDraft,
  UserModuleAuthorableModelFamily,
  UserModuleParameterDraft,
} from './userModuleContract';

export type UserModuleAuthoringEntityMode = 'existing' | 'new';
export type UserModuleAuthoringUncertainty =
  'not_recorded' | 'none' | 'parameter_interval_envelope';

export interface UserModuleAuthoringParameter {
  readonly value: string;
  readonly lower: string;
  readonly upper: string;
}

export interface UserModuleAuthoringInput {
  readonly key: number;
  readonly name: string;
  readonly entityMode: UserModuleAuthoringEntityMode;
  readonly existingEntityId: string;
  readonly newEntityName: string;
  readonly quantityType: BfnQuantityType;
  readonly unit: BfnUnit;
  readonly minimum: string;
  readonly maximum: string;
  readonly effect: 'activation' | 'repression';
  readonly k: UserModuleAuthoringParameter;
  readonly n: UserModuleAuthoringParameter;
  readonly weight: UserModuleAuthoringParameter;
}

export interface UserModuleAuthoringOutput {
  readonly name: string;
  readonly entityMode: UserModuleAuthoringEntityMode;
  readonly existingEntityId: string;
  readonly newEntityName: string;
  readonly quantityType: BfnQuantityType;
  readonly unit: BfnUnit;
}

export interface UserModuleAuthoringContext {
  readonly hostSpecies: string;
  readonly hostStrain: string;
  readonly medium: string;
  readonly temperatureCelsius: string;
  readonly ph: string;
}

export interface UserModuleAuthoringState {
  readonly name: string;
  readonly description: string;
  readonly family: UserModuleAuthorableModelFamily;
  readonly inputs: readonly UserModuleAuthoringInput[];
  readonly output: UserModuleAuthoringOutput;
  readonly hillK: UserModuleAuthoringParameter;
  readonly hillN: UserModuleAuthoringParameter;
  readonly minimumOutput: UserModuleAuthoringParameter;
  readonly maximumOutput: UserModuleAuthoringParameter;
  readonly linearScale: UserModuleAuthoringParameter;
  readonly linearIntercept: UserModuleAuthoringParameter;
  readonly independentBasal: UserModuleAuthoringParameter;
  readonly independentMaximum: UserModuleAuthoringParameter;
  readonly aggregation: 'bounded_sum' | 'multiplicative';
  readonly context: UserModuleAuthoringContext;
  readonly evidenceBasis: BfnEvidenceGrade;
  readonly provenanceKind: 'dataset' | 'publication' | 'repository_record' | 'user_note';
  readonly provenanceReference: string;
  readonly uncertainty: UserModuleAuthoringUncertainty;
}

export type UserModuleAuthoringIssueCode =
  | 'module_name_required'
  | 'port_name_required'
  | 'entity_required'
  | 'number_required'
  | 'k_positive'
  | 'n_positive'
  | 'output_bounds'
  | 'range_bounds'
  | 'linear_unit_mismatch'
  | 'context_specific'
  | 'context_number_invalid'
  | 'context_ph_invalid'
  | 'provenance_required'
  | 'parameter_interval_required';

export interface UserModuleAuthoringIssue {
  readonly field: string;
  readonly code: UserModuleAuthoringIssueCode;
}

export type BuildUserModuleDraftResult =
  | { readonly ok: true; readonly draft: UserDefinedFunctionalModuleDraft }
  | { readonly ok: false; readonly issues: readonly UserModuleAuthoringIssue[] };

const provenanceRequired = new Set<BfnEvidenceGrade>([
  'measured_single_context',
  'measured_multiple_contexts',
  'externally_validated',
  'fitted_from_published_data',
]);

const contextPlaceholders = new Set(['unknown', 'n/a', 'not recorded', 'unspecified']);

export function createInitialUserModuleAuthoringState(
  project: BfnProject,
): UserModuleAuthoringState {
  const existingEntityId = collectExistingEntityIds(project)[0] ?? '';
  return {
    name: '',
    description: '',
    family: 'hill_activation',
    inputs: [createUserModuleAuthoringInput(1, existingEntityId)],
    output: {
      name: '',
      entityMode: 'new',
      existingEntityId,
      newEntityName: '',
      quantityType: 'activity',
      unit: 'dimensionless',
    },
    hillK: parameter('10'),
    hillN: parameter('2'),
    minimumOutput: parameter('0'),
    maximumOutput: parameter('1'),
    linearScale: parameter('1'),
    linearIntercept: parameter('0'),
    independentBasal: parameter('0'),
    independentMaximum: parameter('1'),
    aggregation: 'bounded_sum',
    context: {
      hostSpecies: '',
      hostStrain: '',
      medium: '',
      temperatureCelsius: '',
      ph: '',
    },
    evidenceBasis: 'proposed_unbuilt_design',
    provenanceKind: 'publication',
    provenanceReference: '',
    uncertainty: 'not_recorded',
  };
}

export function createUserModuleAuthoringInput(
  key: number,
  existingEntityId: string,
): UserModuleAuthoringInput {
  return {
    key,
    name: '',
    entityMode: 'existing',
    existingEntityId,
    newEntityName: '',
    quantityType: 'concentration',
    unit: 'nM',
    minimum: '0',
    maximum: '100',
    effect: 'activation',
    k: parameter('10'),
    n: parameter('2'),
    weight: parameter('0.5'),
  };
}

export function collectExistingEntityIds(project: BfnProject): string[] {
  const ids = new Set<string>();
  for (const entity of project.registry.entities) ids.add(entity.id);
  for (const source of project.network.inputSources) ids.add(source.outputPort.entity);
  for (const module of project.network.modules) {
    for (const port of [...module.inputPorts, ...module.outputPorts]) ids.add(port.entity);
  }
  for (const monitor of project.network.outputMonitors) ids.add(monitor.inputPort.entity);
  return [...ids];
}

export function buildUserDefinedModuleDraft(
  state: UserModuleAuthoringState,
  project: BfnProject,
): BuildUserModuleDraftResult {
  const issues: UserModuleAuthoringIssue[] = [];
  if (!hasText(state.name)) issues.push(issue('name', 'module_name_required'));

  const activeInputs =
    state.family === 'independent_inputs' ? state.inputs : state.inputs.slice(0, 1);
  if (state.family === 'independent_inputs' && activeInputs.length < 2) {
    issues.push(issue('inputs', 'port_name_required'));
  }
  const moduleId = deriveAvailableModuleId(state.name, project, activeInputs.length);
  const inputPorts = activeInputs.map((input, index) => {
    const prefix = `inputs.${input.key}`;
    if (!hasText(input.name)) issues.push(issue(`${prefix}.name`, 'port_name_required'));
    const entity = resolveEntity(
      input.entityMode,
      input.existingEntityId,
      input.newEntityName,
      `${moduleId}.entity.input.${index + 1}`,
      project,
      `${prefix}.entity`,
      issues,
    );
    const minimum = requiredNumber(input.minimum, `${prefix}.minimum`, issues);
    const maximum = requiredNumber(input.maximum, `${prefix}.maximum`, issues);
    if (minimum !== null && maximum !== null && maximum <= minimum) {
      issues.push(issue(`${prefix}.range`, 'range_bounds'));
    }
    return {
      id: `${moduleId}.port.input.${index + 1}`,
      name: input.name,
      entity,
      quantityType: input.quantityType,
      unit: input.unit,
      direction: 'input' as const,
      minimum,
      maximum,
    };
  });

  if (!hasText(state.output.name)) issues.push(issue('output.name', 'port_name_required'));
  const outputEntity = resolveEntity(
    state.output.entityMode,
    state.output.existingEntityId,
    state.output.newEntityName,
    `${moduleId}.entity.output.1`,
    project,
    'output.entity',
    issues,
  );
  const outputPort = {
    id: `${moduleId}.port.output.1`,
    name: state.output.name,
    entity: outputEntity,
    quantityType: state.output.quantityType,
    unit: state.output.unit,
    direction: 'output' as const,
  };

  if (
    state.family === 'linear_transfer' &&
    activeInputs[0] &&
    activeInputs[0].unit !== state.output.unit
  ) {
    issues.push(issue('model.linear.units', 'linear_unit_mismatch'));
  }

  const context = buildContext(state.context, issues);
  const provenance = provenanceRequired.has(state.evidenceBasis)
    ? hasText(state.provenanceReference)
      ? [
          {
            id: `${moduleId}.source.1`,
            kind: state.provenanceKind,
            reference: state.provenanceReference,
          },
        ]
      : []
    : [];
  if (provenanceRequired.has(state.evidenceBasis) && provenance.length === 0) {
    issues.push(issue('evidence.provenance', 'provenance_required'));
  }

  const model = buildModel(state, inputPorts, outputPort.id, issues);
  const materializedOutputEntity = outputPort.entity;
  if (issues.length > 0 || !model || !context || materializedOutputEntity === null) {
    return { ok: false, issues: uniqueIssues(issues) };
  }

  const materializedInputPorts: UserDefinedFunctionalModuleDraft['ports'][number][] = [];
  const validityDomains: UserDefinedFunctionalModuleDraft['validityDomains'][number][] = [];
  for (const port of inputPorts) {
    if (port.entity === null || port.minimum === null || port.maximum === null) {
      return { ok: false, issues: uniqueIssues(issues) };
    }
    materializedInputPorts.push({
      id: port.id,
      name: port.name,
      entity: port.entity,
      quantityType: port.quantityType,
      unit: port.unit,
      direction: port.direction,
    });
    validityDomains.push({
      portId: port.id,
      minimum: port.minimum,
      maximum: port.maximum,
      unit: port.unit,
    });
  }

  return {
    ok: true,
    draft: {
      id: moduleId,
      origin: 'user_defined',
      name: state.name,
      description: hasText(state.description) ? state.description : null,
      ports: [
        ...materializedInputPorts,
        {
          id: outputPort.id,
          name: outputPort.name,
          entity: materializedOutputEntity,
          quantityType: outputPort.quantityType,
          unit: outputPort.unit,
          direction: outputPort.direction,
        },
      ],
      model,
      validityDomains,
      context,
      uncertainty:
        state.uncertainty === 'parameter_interval_envelope'
          ? { state: 'reported', method: 'parameter_interval_envelope' }
          : { state: state.uncertainty },
      evidence: { basis: state.evidenceBasis, provenance },
      implementation: { state: 'unspecified', implementationIds: [] },
    },
  };
}

function buildModel(
  state: UserModuleAuthoringState,
  inputs: readonly {
    readonly id: string;
    readonly unit: BfnUnit;
  }[],
  outputPortId: string,
  issues: UserModuleAuthoringIssue[],
): UserDefinedFunctionalModuleDraft['model'] | null {
  const inputPortIds = inputs.map((input) => input.id);
  const outputPortIds = [outputPortId];
  const interval = state.uncertainty === 'parameter_interval_envelope';
  if (state.family === 'hill_activation' || state.family === 'hill_repression') {
    const input = inputs[0];
    if (!input) return null;
    const k = buildParameter(state.hillK, input.unit, 'model.k', interval, issues);
    const n = buildParameter(state.hillN, 'dimensionless', 'model.n', interval, issues);
    const ymin = buildParameter(
      state.minimumOutput,
      state.output.unit,
      'model.minimumOutput',
      interval,
      issues,
    );
    const ymax = buildParameter(
      state.maximumOutput,
      state.output.unit,
      'model.maximumOutput',
      interval,
      issues,
    );
    if (k && k.value <= 0) issues.push(issue('model.k', 'k_positive'));
    if (n && n.value <= 0) issues.push(issue('model.n', 'n_positive'));
    if (ymin && ymax && ymax.value < ymin.value) {
      issues.push(issue('model.outputBounds', 'output_bounds'));
    }
    if (!k || !n || !ymin || !ymax) return null;
    return {
      family: state.family,
      inputPortIds,
      outputPortIds,
      parameters: { k, n, ymin, ymax },
    };
  }
  if (state.family === 'linear_transfer') {
    const scale = buildParameter(
      state.linearScale,
      'dimensionless',
      'model.linearScale',
      interval,
      issues,
    );
    const intercept = buildParameter(
      state.linearIntercept,
      state.output.unit,
      'model.linearIntercept',
      interval,
      issues,
    );
    if (!scale || !intercept) return null;
    return {
      family: 'linear_transfer',
      inputPortIds,
      outputPortIds,
      parameters: { scale, intercept },
    };
  }

  const basal = buildParameter(
    state.independentBasal,
    state.output.unit,
    'model.independentBasal',
    interval,
    issues,
  );
  const outputMaximum = buildParameter(
    state.independentMaximum,
    state.output.unit,
    'model.independentMaximum',
    interval,
    issues,
  );
  if (basal && outputMaximum && outputMaximum.value < basal.value) {
    issues.push(issue('model.outputBounds', 'output_bounds'));
  }
  const terms = state.inputs.slice(0, inputs.length).map((input, index) => {
    const modelInput = inputs[index];
    if (!modelInput) return null;
    const prefix = `inputs.${input.key}`;
    const k = buildParameter(input.k, input.unit, `${prefix}.k`, interval, issues);
    const n = buildParameter(input.n, 'dimensionless', `${prefix}.n`, interval, issues);
    const weight = buildParameter(
      input.weight,
      'dimensionless',
      `${prefix}.weight`,
      interval,
      issues,
    );
    if (k && k.value <= 0) issues.push(issue(`${prefix}.k`, 'k_positive'));
    if (n && n.value <= 0) issues.push(issue(`${prefix}.n`, 'n_positive'));
    if (!k || !n || !weight) return null;
    return { inputPortId: modelInput.id, mode: input.effect, k, n, weight };
  });
  if (!basal || !outputMaximum || terms.some((term) => term === null)) return null;
  return {
    family: 'independent_inputs',
    inputPortIds,
    outputPortIds,
    parameters: { basal, outputMaximum },
    terms: terms.filter((term) => term !== null),
    aggregation: state.aggregation,
    interactionAssumption: 'independent_unverified',
  };
}

function buildParameter(
  source: UserModuleAuthoringParameter,
  unit: BfnUnit,
  field: string,
  intervalRequired: boolean,
  issues: UserModuleAuthoringIssue[],
): UserModuleParameterDraft | null {
  const value = requiredNumber(source.value, field, issues);
  if (value === null) return null;
  if (!intervalRequired) return { value, unit };
  const lower = optionalFiniteNumber(source.lower);
  const upper = optionalFiniteNumber(source.upper);
  if (lower === null || upper === null || lower > value || value > upper) {
    issues.push(issue('uncertainty', 'parameter_interval_required'));
    return { value, unit };
  }
  return { value, unit, interval95: [lower, upper] };
}

function buildContext(
  source: UserModuleAuthoringContext,
  issues: UserModuleAuthoringIssue[],
): UserDefinedFunctionalModuleDraft['context'] | null {
  const rawValues: readonly string[] = [
    source.hostSpecies,
    source.hostStrain,
    source.medium,
    source.temperatureCelsius,
    source.ph,
  ];
  if (rawValues.every((value) => value.trim().length === 0)) return { state: 'not_recorded' };

  const facts: {
    hostSpecies?: string;
    hostStrain?: string;
    medium?: string;
    temperatureCelsius?: number;
    ph?: number;
  } = {};
  for (const [field, value] of [
    ['hostSpecies', source.hostSpecies],
    ['hostStrain', source.hostStrain],
    ['medium', source.medium],
  ] as const) {
    if (value.length === 0) continue;
    const normalized = value.trim();
    if (!normalized || contextPlaceholders.has(normalized.toLowerCase())) {
      issues.push(issue(`context.${field}`, 'context_specific'));
    } else {
      facts[field] = normalized;
    }
  }
  if (source.temperatureCelsius.length > 0) {
    const temperature = optionalFiniteNumber(source.temperatureCelsius);
    if (temperature === null)
      issues.push(issue('context.temperatureCelsius', 'context_number_invalid'));
    else facts.temperatureCelsius = temperature;
  }
  if (source.ph.length > 0) {
    const ph = optionalFiniteNumber(source.ph);
    if (ph === null || ph < 0 || ph > 14) issues.push(issue('context.ph', 'context_ph_invalid'));
    else facts.ph = ph;
  }
  return { state: 'defined', facts };
}

function resolveEntity(
  mode: UserModuleAuthoringEntityMode,
  existingId: string,
  newName: string,
  generatedId: string,
  project: BfnProject,
  field: string,
  issues: UserModuleAuthoringIssue[],
): { readonly id: string; readonly displayName: string } | null {
  if (mode === 'new') {
    if (!hasText(newName)) {
      issues.push(issue(field, 'entity_required'));
      return null;
    }
    return { id: generatedId, displayName: newName };
  }
  if (!hasText(existingId) || !collectExistingEntityIds(project).includes(existingId)) {
    issues.push(issue(field, 'entity_required'));
    return null;
  }
  return { id: existingId, displayName: existingEntityName(project, existingId) };
}

function existingEntityName(project: BfnProject, id: string): string {
  const registry = project.registry.entities.find((entity) => entity.id === id);
  if (registry) return registry.displayName;
  for (const source of project.network.inputSources) {
    if (source.outputPort.entity === id) return source.outputPort.displayName?.en ?? id;
  }
  for (const module of project.network.modules) {
    const port = [...module.inputPorts, ...module.outputPorts].find((item) => item.entity === id);
    if (port) return port.displayName?.en ?? id;
  }
  const monitor = project.network.outputMonitors.find((item) => item.inputPort.entity === id);
  return monitor?.inputPort.displayName?.en ?? id;
}

function deriveAvailableModuleId(name: string, project: BfnProject, inputCount: number): string {
  const normalized = name.trim().normalize('NFKD').toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  const stem = slug || `module-${stableTextHash(normalized || 'module')}`;
  const existing = collectDefinedIds(project);
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const candidate = `user.module.${stem}${suffix === 1 ? '' : `-${suffix}`}`;
    const proposed = [
      candidate,
      `${candidate}.model.static.v1`,
      `${candidate}.domain.v1`,
      `${candidate}.context.v1`,
      ...Array.from(
        { length: inputCount },
        (_value, index) => `${candidate}.port.input.${index + 1}`,
      ),
      `${candidate}.port.output.1`,
      `${candidate}.provenance.1`,
    ];
    if (proposed.every((id) => !existing.has(id))) return candidate;
  }
  return `user.module.${stem}-unavailable`;
}

function collectDefinedIds(value: unknown, ids = new Set<string>()): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectDefinedIds(item, ids);
    return ids;
  }
  if (!isRecord(value)) return ids;
  if (typeof value.id === 'string') ids.add(value.id);
  for (const child of Object.values(value)) collectDefinedIds(child, ids);
  return ids;
}

function stableTextHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function requiredNumber(
  value: string,
  field: string,
  issues: UserModuleAuthoringIssue[],
): number | null {
  const parsed = optionalFiniteNumber(value);
  if (parsed === null) issues.push(issue(field, 'number_required'));
  return parsed;
}

function optionalFiniteNumber(value: string): number | null {
  if (!hasText(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parameter(value: string): UserModuleAuthoringParameter {
  return { value, lower: '', upper: '' };
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function issue(field: string, code: UserModuleAuthoringIssueCode): UserModuleAuthoringIssue {
  return { field, code };
}

function uniqueIssues(issues: readonly UserModuleAuthoringIssue[]): UserModuleAuthoringIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.field}:${item.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

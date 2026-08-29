import type { AhlHslComponentCatalogRelease } from '../../v2/releaseTypes';
import { isFixedConditionTimeCourse } from './senderEvidencePresentation';
import type {
  SenderEvidenceExtension,
  SenderFunctionParameterRecord,
  SenderOutputRecord,
  SenderRawPointRecord,
} from './senderExtensionTypes';

export type BfnSenderRuntimeAdmissionReason =
  | 'execution_not_authorized'
  | 'missing_sender_component'
  | 'missing_output_signal'
  | 'missing_output_quantity'
  | 'unsupported_output_quantity'
  | 'unsupported_output_unit'
  | 'output_not_directly_measured'
  | 'missing_input_definition'
  | 'missing_input_domain'
  | 'fixed_condition_only'
  | 'discrete_construct_comparison'
  | 'endpoint_only'
  | 'time_course_not_input_response'
  | 'missing_executable_model'
  | 'missing_required_parameter'
  | 'missing_model_validation'
  | 'missing_parameter_context'
  | 'missing_provenance'
  | 'enzyme_kinetics_scope_mismatch'
  | 'effective_pair_only'
  | 'decomposition_prohibited'
  | 'non_detection_only';

export interface BfnSenderRuntimeOutputPort {
  entityId: string;
  quantityType: 'concentration' | 'production_rate';
  unit: 'M' | 'mM' | 'uM' | 'nM' | 'pM' | 'nM/h' | 'uM/h';
}

export interface BfnSenderRuntimeAdmission {
  admitted: boolean;
  reasons: readonly BfnSenderRuntimeAdmissionReason[];
  outputPort: BfnSenderRuntimeOutputPort | null;
}

export interface BfnSenderRuntimeAdmissionInput {
  output: SenderOutputRecord;
  senderComponentResolved: boolean;
  outputSignalResolved: boolean;
  parameterContextResolved: boolean;
  provenanceResolved: boolean;
  rawPoints: readonly SenderRawPointRecord[];
  functionParameters: readonly SenderFunctionParameterRecord[];
}

export interface BfnSenderRuntimeAdmissionAssessment {
  senderOutputId: string;
  admission: BfnSenderRuntimeAdmission;
}

const CONCENTRATION_UNITS = new Set(['M', 'mM', 'uM', 'nM', 'pM']);
const PRODUCTION_RATE_UNITS = new Set(['nM/h', 'uM/h']);

export function assessBfnSenderRuntimeAdmission(
  input: BfnSenderRuntimeAdmissionInput,
): BfnSenderRuntimeAdmission {
  const { output } = input;
  const reasons: BfnSenderRuntimeAdmissionReason[] = [];
  const add = (reason: BfnSenderRuntimeAdmissionReason): void => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (!input.senderComponentResolved) add('missing_sender_component');
  if (output.output_signal_id === null || !input.outputSignalResolved) add('missing_output_signal');
  const outputPort = runtimeOutputPort(output);
  if (!output.output_definition.kind) add('missing_output_quantity');
  else if (
    output.output_definition.kind !== 'extracellular_concentration' &&
    output.output_definition.kind !== 'production_rate'
  )
    add('unsupported_output_quantity');
  else if (outputPort === null) add('unsupported_output_unit');
  if (!output.measurement.direct_signal_measurement) add('output_not_directly_measured');

  const inputDefinition = output.input_definition;
  if (
    inputDefinition.name.trim().length === 0 ||
    inputDefinition.unit === null ||
    inputDefinition.unit.trim().length === 0
  )
    add('missing_input_definition');
  const [inputMinimum, inputMaximum] = inputDefinition.working_range;
  if (
    inputMinimum === null ||
    inputMaximum === null ||
    !Number.isFinite(inputMinimum) ||
    !Number.isFinite(inputMaximum) ||
    inputMaximum <= inputMinimum
  )
    add('missing_input_domain');
  if (inputDefinition.kind === 'constitutive_endpoint') add('fixed_condition_only');
  if (inputDefinition.kind === 'discrete_construct') add('discrete_construct_comparison');

  const executableModel = hasExecutableModel(input);
  if (!executableModel) add('missing_executable_model');
  if (requiresMissingParameter(input)) add('missing_required_parameter');
  if (requiresModelValidation(input)) add('missing_model_validation');
  if (
    !executableModel &&
    (output.output_definition.kind === 'extracellular_concentration' ||
      output.model.model_type === 'endpoint_constant')
  )
    add('endpoint_only');
  if (isFixedConditionTimeCourse(output)) add('time_course_not_input_response');
  if (input.functionParameters.length > 0 || inputDefinition.kind === 'substrate_concentration')
    add('enzyme_kinetics_scope_mismatch');

  if (!input.parameterContextResolved) add('missing_parameter_context');
  if (output.source_ids.length === 0 || !input.provenanceResolved) add('missing_provenance');
  if (!output.numerical_execution_allowed) add('execution_not_authorized');
  if (output.decomposition_prohibited) add('decomposition_prohibited');
  if (output.software_status === 'effective_pair_only') add('effective_pair_only');
  if (
    input.rawPoints.length > 0 &&
    input.rawPoints.every((point) => point.detection_status === 'ND')
  )
    add('non_detection_only');

  return Object.freeze({
    admitted: reasons.length === 0,
    reasons: Object.freeze(reasons),
    outputPort: reasons.length === 0 ? outputPort : null,
  });
}

export function assessSenderExtensionRuntimeAdmissions(
  extension: SenderEvidenceExtension,
  base: AhlHslComponentCatalogRelease,
): readonly BfnSenderRuntimeAdmissionAssessment[] {
  const componentIds = new Set([
    ...base.components.filter((item) => item.component_type === 'sender').map((item) => item.id),
    ...extension.componentsDocument.new_sender_components.map((item) => item.id),
  ]);
  const signalIds = new Set([
    ...base.signals.map((item) => item.id),
    ...extension.componentsDocument.new_signals.map((item) => item.id),
  ]);
  const contextIds = new Set([
    ...base.parameter_contexts.map((item) => item.id),
    ...extension.componentsDocument.new_parameter_contexts.map((item) => item.id),
  ]);
  const sourceIds = new Set([
    ...base.sources.map((item) => item.source_id),
    ...extension.sources.map((item) => item.source_id),
  ]);
  return Object.freeze(
    extension.outputsDocument.sender_outputs.map((output) => ({
      senderOutputId: output.id,
      admission: assessBfnSenderRuntimeAdmission({
        output,
        senderComponentResolved: componentIds.has(output.sender_component_id),
        outputSignalResolved:
          output.output_signal_id !== null && signalIds.has(output.output_signal_id),
        parameterContextResolved: contextIds.has(output.parameter_context_id),
        provenanceResolved: output.source_ids.every((sourceId) => sourceIds.has(sourceId)),
        rawPoints: extension.rawPoints.filter((point) => point.sender_output_id === output.id),
        functionParameters: extension.functionParameters.filter(
          (parameter) => parameter.sender_output_id === output.id,
        ),
      }),
    })),
  );
}

function runtimeOutputPort(output: SenderOutputRecord): BfnSenderRuntimeOutputPort | null {
  const signalId = output.output_signal_id;
  const unit = output.output_definition.unit;
  if (signalId === null || unit === null) return null;
  if (
    output.output_definition.kind === 'extracellular_concentration' &&
    CONCENTRATION_UNITS.has(unit)
  )
    return {
      entityId: signalId,
      quantityType: 'concentration',
      unit: unit as BfnSenderRuntimeOutputPort['unit'],
    };
  if (output.output_definition.kind === 'production_rate' && PRODUCTION_RATE_UNITS.has(unit))
    return {
      entityId: signalId,
      quantityType: 'production_rate',
      unit: unit as BfnSenderRuntimeOutputPort['unit'],
    };
  return null;
}

function hasExecutableModel(input: BfnSenderRuntimeAdmissionInput): boolean {
  const { output, rawPoints } = input;
  if (output.model.model_type === 'lookup_table') {
    const quantifiedInputs = new Set(
      rawPoints
        .filter(
          (point) =>
            point.detection_status === 'quantified' &&
            point.input_value !== null &&
            point.output_value !== null,
        )
        .map((point) => point.input_value),
    );
    return quantifiedInputs.size >= 3;
  }
  if (output.model.model_type === 'reported')
    return (
      output.model.formula !== null &&
      output.model.formula.trim().length > 0 &&
      Object.keys(output.model.parameters).length > 0
    );
  return false;
}

function requiresMissingParameter(input: BfnSenderRuntimeAdmissionInput): boolean {
  if (input.output.model.model_type !== 'reported') return false;
  if (Object.keys(input.output.model.parameters).length === 0) return true;
  return input.output.missing_fields.some((field) => {
    const normalized = field.toLocaleLowerCase();
    return normalized.includes('parameter') || normalized.includes('enzyme_concentration');
  });
}

function requiresModelValidation(input: BfnSenderRuntimeAdmissionInput): boolean {
  if (input.output.model.model_type !== 'reported') return false;
  return input.output.model.r_squared === null || input.output.model.rmse === null;
}

import type {
  SenderEvidenceScope,
  SenderFunctionParameterRecord,
  SenderOutputRecord,
  SenderRawPointRecord,
} from './senderExtensionTypes';

export function senderEvidenceScopes(
  output: SenderOutputRecord,
  rawPoints: readonly SenderRawPointRecord[],
  functionParameters: readonly SenderFunctionParameterRecord[],
): readonly SenderEvidenceScope[] {
  const scopes: SenderEvidenceScope[] = [];
  if (output.software_status === 'effective_pair_only') scopes.push('effective_pair_only');
  if (functionParameters.length > 0) scopes.push('enzyme_kinetics');
  if (isFixedConditionTimeCourse(output)) scopes.push('fixed_condition_time_course');
  if (output.output_definition.kind === 'production_rate') scopes.push('production_rate');
  if (output.output_definition.kind === 'extracellular_concentration')
    scopes.push('endpoint_concentration');
  if (rawPoints.some((point) => point.detection_status === 'ND')) scopes.push('non_detection');
  if (scopes.length === 0) scopes.push('other_quantitative_evidence');
  return Object.freeze(scopes);
}

export function isFixedConditionTimeCourse(output: SenderOutputRecord): boolean {
  if (output.input_definition.kind !== 'constitutive_endpoint') return false;
  const evidenceText = [
    output.output_definition.timepoint,
    output.output_definition.steady_state_definition,
    ...output.notes,
  ]
    .filter((value): value is string => value !== null)
    .join(' ')
    .toLocaleLowerCase();
  return evidenceText.includes('time-course') || evidenceText.includes('time course');
}

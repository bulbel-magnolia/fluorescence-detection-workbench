export interface CatalogRuntimeDemoWhitelistEntry {
  readonly id: string;
  readonly demoImplementation: string;
  readonly modelType: string;
}

/**
 * Explicit release admission for the 20 numerically executable receiver demos.
 * A runtime_demo status alone never grants execution admission.
 */
export const AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST: readonly CatalogRuntimeDemoWhitelistEntry[] =
  Object.freeze([
    Object.freeze({
      id: 'resp.kylilis2018.rhl.c4',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.rhl.3oc6',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.rhl.3oc8',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.rhl.3oc12',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.rhl.pc',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.lux.3oc6',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.lux.3oc8',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.lux.3oc12',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.lux.3ohc14',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.lux.pc',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.tra.3oc6',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.tra.3oc8',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.tra.3oc12',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.las.c4',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.las.3oc8',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.las.3oc12',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.cin.3oc12',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.cin.3ohc14',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.kylilis2018.rpa.3oc6',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      modelType: 'four_parameter_logistic',
    }),
    Object.freeze({
      id: 'resp.shong2013.esar-wt-pesar.3oc6',
      demoImplementation: 'hill_derepression_n_fixed_1_then_within_context_normalization',
      modelType: 'hill_equation_n_fixed_1',
    }),
  ]);

export const CATALOG_RELEASE_RUNTIME_DEMO_WHITELIST =
  AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST;

export interface RuntimeDemoResponseExecutionMetadata {
  readonly id: string;
  readonly demoImplementation: unknown;
  readonly modelType: unknown;
  readonly numericalExecutionAllowed: unknown;
  readonly normalizedDemoOnly: unknown;
  readonly fixedWeightCandidate: unknown;
}

export function matchesAhlHslRuntimeDemoWhitelist(
  value: RuntimeDemoResponseExecutionMetadata,
): boolean {
  const expected = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.find(
    (entry) => entry.id === value.id,
  );
  return (
    expected !== undefined &&
    value.demoImplementation === expected.demoImplementation &&
    value.modelType === expected.modelType &&
    value.numericalExecutionAllowed === true &&
    value.normalizedDemoOnly === true &&
    value.fixedWeightCandidate === false
  );
}

export function isAhlHslRuntimeDemoResponseExecutable(
  value: RuntimeDemoResponseExecutionMetadata & { readonly softwareStatus: unknown },
): boolean {
  return value.softwareStatus === 'runtime_demo' && matchesAhlHslRuntimeDemoWhitelist(value);
}

export function getAhlHslRuntimeDemoWhitelistEntry(
  responseId: string,
): CatalogRuntimeDemoWhitelistEntry | undefined {
  return AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.find((entry) => entry.id === responseId);
}

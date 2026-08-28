import { resolveEffectiveBfnModel } from '../modelResolution';
import type { BfnFunctionalModule, BfnModelVariant, BfnProject } from '../types';
import type {
  BfnTemporalCapability,
  BfnTemporalEvidenceTier,
  BfnTemporalExecutionMode,
  BfnTemporalResolutionBasis,
} from './temporalTypes';

function temporalEvidenceTier(model: BfnModelVariant | null): BfnTemporalEvidenceTier {
  if (model?.mode === 'static' && model.catalogReference !== undefined) {
    return 't0_steady_state';
  }
  return 'not_recorded';
}

function executionContract(
  project: BfnProject,
  model: BfnModelVariant | null,
): readonly [BfnTemporalExecutionMode, BfnTemporalResolutionBasis] {
  if (model === null) return ['unsupported', 'no-executable-model'];
  if (project.network.mode === 'static') return ['steady_state', 'active-static'];
  return model.mode === 'dynamic'
    ? ['stateful_dynamic', 'active-dynamic']
    : ['quasi_static', 'dynamic-static-fallback'];
}

export function resolveBfnModuleTemporalCapability(
  project: BfnProject,
  module: BfnFunctionalModule,
): BfnTemporalCapability {
  const model = resolveEffectiveBfnModel(project, module);
  const [executionMode, resolutionBasis] = executionContract(project, model);

  return Object.freeze({
    executionMode,
    evidenceTier: temporalEvidenceTier(model),
    selectedModelId: model?.id ?? null,
    selectedModelMode: model?.mode ?? null,
    resolutionBasis,
  });
}

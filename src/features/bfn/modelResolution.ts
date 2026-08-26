import type { BfnFunctionalModule, BfnModelVariant, BfnNetworkMode, BfnProject } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function activeModelForModule(
  module: BfnFunctionalModule,
  mode: BfnNetworkMode,
): BfnModelVariant | null {
  if (
    !isRecord(module) ||
    !isRecord(module.activeModelIds) ||
    !Array.isArray(module.modelVariants)
  ) {
    return null;
  }
  const modelId = mode === 'static' ? module.activeModelIds.static : module.activeModelIds.dynamic;
  if (typeof modelId !== 'string' || modelId.length === 0) return null;
  return (
    module.modelVariants.find(
      (model) => isRecord(model) && model.id === modelId && model.mode === mode,
    ) ?? null
  );
}

export function resolveEffectiveBfnModel(
  project: BfnProject,
  module: BfnFunctionalModule,
): BfnModelVariant | null {
  const direct = activeModelForModule(module, project.network.mode);
  if (direct) return direct;
  return project.network.mode === 'dynamic' ? activeModelForModule(module, 'static') : null;
}

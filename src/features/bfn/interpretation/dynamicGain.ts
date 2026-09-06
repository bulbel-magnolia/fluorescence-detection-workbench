import type { BfnIdealEdge, BfnProject, BfnUnit } from '../types';
import { convertUnit } from '../unitSystem';
import { resolveBfnPort } from '../validation';
import {
  bfnComplexAdd,
  bfnComplexMagnitude,
  bfnComplexMultiply,
  bfnComplexPhaseDegrees,
  bfnComplexScale,
  isFiniteBfnComplex,
  isZeroBfnComplex,
  type BfnComplex,
} from './complexMath';
import type { BfnLocalDifferentialGainV1 } from './interpretationTypes';
import { calculateBfnNetworkInfluence } from './networkInfluence';
import { bfnNetworkGainUnit } from './networkInfluenceTypes';
import { assessBfnDynamicGainRequest } from './dynamicGainValidation';
import type {
  BfnDynamicGainAdmissionV1,
  BfnDynamicGainCalculationIssueV1,
  BfnDynamicGainCalculationV1,
  BfnDynamicGainRequestV1,
  BfnDynamicGainUnavailableReasonV1,
  BfnDynamicGainValueV1,
  BfnDynamicModuleInputTransferV1,
  BfnDynamicModuleTransferV1,
  BfnDynamicPhaseV1,
  BfnDynamicSourceGainV1,
  BfnResolvedDynamicGainModuleV1,
} from './dynamicGainTypes';

type DynamicSensitivity =
  | {
      readonly availability: 'available';
      readonly complex: BfnComplex;
    }
  | {
      readonly availability: 'unavailable';
      readonly reason: BfnDynamicGainUnavailableReasonV1;
    };

interface DynamicSignal {
  readonly unit: BfnUnit;
  readonly sensitivities: ReadonlyMap<string, DynamicSensitivity>;
}

function signalKey(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`;
}

function complex(re: number, im: number): BfnComplex {
  return Object.freeze({ re, im });
}

function availableSensitivity(value: BfnComplex): DynamicSensitivity {
  return isFiniteBfnComplex(value)
    ? Object.freeze({ availability: 'available', complex: value })
    : Object.freeze({ availability: 'unavailable', reason: 'complex_non_finite' });
}

function unavailableSensitivity(reason: BfnDynamicGainUnavailableReasonV1): DynamicSensitivity {
  return Object.freeze({ availability: 'unavailable', reason });
}

function failedCalculation(
  admission: BfnDynamicGainAdmissionV1,
  networkInfluence: BfnDynamicGainCalculationV1['networkInfluence'],
  calculationIssue: BfnDynamicGainCalculationIssueV1 | null,
): BfnDynamicGainCalculationV1 {
  return Object.freeze({ ok: false, admission, networkInfluence, calculationIssue });
}

function relevantIncomingEdge(
  project: BfnProject,
  relevantEdgeIds: ReadonlySet<string>,
  nodeId: string,
  portId: string,
): BfnIdealEdge | null {
  return (
    project.network.edges.find(
      (edge) =>
        edge.enabled &&
        relevantEdgeIds.has(edge.id) &&
        edge.target.nodeId === nodeId &&
        edge.target.portId === portId,
    ) ?? null
  );
}

function propagateAcrossEdge(
  project: BfnProject,
  edge: BfnIdealEdge,
  source: DynamicSignal,
): DynamicSignal | null {
  const sourcePort = resolveBfnPort(project, edge.source);
  const targetPort = resolveBfnPort(project, edge.target);
  if (!sourcePort || !targetPort) return null;
  try {
    const unitCoordinateScale =
      convertUnit(1, sourcePort.port.unit, targetPort.port.unit) -
      convertUnit(0, sourcePort.port.unit, targetPort.port.unit);
    if (!Number.isFinite(unitCoordinateScale)) return null;
    const sensitivities = new Map<string, DynamicSensitivity>();
    for (const [sourceId, sensitivity] of source.sensitivities) {
      sensitivities.set(
        sourceId,
        sensitivity.availability === 'available'
          ? availableSensitivity(bfnComplexScale(sensitivity.complex, unitCoordinateScale))
          : sensitivity,
      );
    }
    return Object.freeze({ unit: targetPort.port.unit, sensitivities });
  } catch {
    return null;
  }
}

function localTransfer(
  localGain: BfnLocalDifferentialGainV1,
  module: BfnResolvedDynamicGainModuleV1,
  angularFrequencyRadPerHour: number,
): DynamicSensitivity {
  if (localGain.availability === 'unavailable') {
    return unavailableSensitivity(localGain.reason);
  }
  if (localGain.value === 0) {
    return availableSensitivity(complex(0, 0));
  }
  if (module.dynamicKind === 'quasi_static') {
    return availableSensitivity(complex(localGain.value, 0));
  }
  if (!module.dynamicModel) {
    return unavailableSensitivity('complex_non_finite');
  }
  const omegaTau = angularFrequencyRadPerHour * module.dynamicModel.tauHours;
  const denominator = 1 + omegaTau ** 2;
  return availableSensitivity(
    complex(localGain.value / denominator, (-localGain.value * omegaTau) / denominator),
  );
}

function combineModuleSensitivity(
  sourceId: string,
  inputs: readonly {
    readonly signal: DynamicSignal;
    readonly transfer: DynamicSensitivity;
  }[],
): DynamicSensitivity {
  let sum = complex(0, 0);
  for (const input of inputs) {
    const upstream =
      input.signal.sensitivities.get(sourceId) ?? availableSensitivity(complex(0, 0));
    if (upstream.availability === 'available' && isZeroBfnComplex(upstream.complex)) continue;
    if (input.transfer.availability === 'available' && isZeroBfnComplex(input.transfer.complex)) {
      continue;
    }
    if (input.transfer.availability === 'unavailable') {
      return unavailableSensitivity(input.transfer.reason);
    }
    if (upstream.availability === 'unavailable') {
      return unavailableSensitivity(upstream.reason);
    }
    sum = bfnComplexAdd(sum, bfnComplexMultiply(input.transfer.complex, upstream.complex));
    if (!isFiniteBfnComplex(sum)) return unavailableSensitivity('complex_non_finite');
  }
  return availableSensitivity(sum);
}

function dynamicGainValue(
  sensitivity: DynamicSensitivity,
  outputUnit: BfnUnit,
  inputUnit: BfnUnit,
): BfnDynamicGainValueV1 {
  const unit = bfnNetworkGainUnit(outputUnit, inputUnit);
  if (sensitivity.availability === 'unavailable') {
    return Object.freeze({ availability: 'unavailable', reason: sensitivity.reason, unit });
  }
  const magnitude = bfnComplexMagnitude(sensitivity.complex);
  return Number.isFinite(magnitude)
    ? Object.freeze({
        availability: 'available',
        complex: sensitivity.complex,
        magnitude,
        unit,
      })
    : Object.freeze({ availability: 'unavailable', reason: 'complex_non_finite', unit });
}

function dynamicPhase(gain: BfnDynamicGainValueV1): BfnDynamicPhaseV1 {
  if (gain.availability === 'unavailable') {
    return Object.freeze({
      availability: 'unavailable',
      reason:
        gain.reason === 'complex_non_finite' ? 'complex_non_finite' : 'derivative_unavailable',
    });
  }
  if (isZeroBfnComplex(gain.complex)) {
    return Object.freeze({ availability: 'unavailable', reason: 'zero_magnitude' });
  }
  return Object.freeze({
    availability: 'available',
    degrees: bfnComplexPhaseDegrees(gain.complex),
  });
}

function moduleById<T extends { readonly moduleId: string }>(
  modules: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(modules.map((module) => [module.moduleId, module] as const));
}

function incompleteLocalDynamicLinearization(
  moduleInterpretations: Extract<
    BfnDynamicGainCalculationV1['networkInfluence'],
    { readonly ok: true }
  >['result']['moduleInterpretations'],
): Extract<
  BfnDynamicGainCalculationIssueV1,
  { readonly code: 'incomplete_local_dynamic_linearization' }
> | null {
  for (const interpretation of moduleInterpretations) {
    for (const input of interpretation.localInfluence.perInput) {
      if (input.localDifferentialGain.availability === 'unavailable') {
        return Object.freeze({
          code: 'incomplete_local_dynamic_linearization',
          moduleId: interpretation.moduleId,
          inputPortId: input.portId,
          reason: input.localDifferentialGain.reason,
        });
      }
    }
  }
  return null;
}

/** Pure periodic small-signal gain over the admitted dynamic target closure. */
export function calculateBfnDynamicGain(
  project: BfnProject,
  request: BfnDynamicGainRequestV1,
): BfnDynamicGainCalculationV1 {
  const admission = assessBfnDynamicGainRequest(project, request);
  if (admission.status === 'unsupported' || !admission.target) {
    return failedCalculation(admission, null, null);
  }

  const networkInfluence = calculateBfnNetworkInfluence(project, {
    contractVersion: '1.0',
    scope: 'network_static_output',
    outputMonitorId: request.outputMonitorId,
    operatingPoint: request.operatingPoint,
  });
  if (!networkInfluence.ok) {
    return failedCalculation(admission, networkInfluence, null);
  }

  const incompleteLinearization = incompleteLocalDynamicLinearization(
    networkInfluence.result.moduleInterpretations,
  );
  if (incompleteLinearization) {
    return failedCalculation(admission, networkInfluence, incompleteLinearization);
  }

  const target = admission.target.baselineTarget;
  const relevantEdgeIds = new Set(target.relevantEdgeIds);
  const dynamicByModule = moduleById(admission.target.modules);
  const localByModule = moduleById(networkInfluence.result.moduleInterpretations);
  const requestBySource = new Map(
    request.operatingPoint.map((input) => [input.inputSourceId, input] as const),
  );
  const externalSourceIds = target.inputSources.map((source) => source.inputSourceId);
  const angularFrequencyRadPerHour = (2 * Math.PI) / request.perturbation.periodHours;
  const signals = new Map<string, DynamicSignal>();

  for (const sourceTarget of target.inputSources) {
    const sensitivities = new Map<string, DynamicSensitivity>();
    for (const sourceId of externalSourceIds) {
      sensitivities.set(
        sourceId,
        availableSensitivity(complex(sourceId === sourceTarget.inputSourceId ? 1 : 0, 0)),
      );
    }
    signals.set(
      signalKey(sourceTarget.inputSourceId, sourceTarget.outputPortId),
      Object.freeze({ unit: sourceTarget.unit, sensitivities }),
    );
  }

  const moduleTransfers: BfnDynamicModuleTransferV1[] = [];
  for (const moduleTarget of target.moduleTargets) {
    const dynamicModule = dynamicByModule.get(moduleTarget.moduleId);
    const local = localByModule.get(moduleTarget.moduleId)?.localInfluence;
    if (!dynamicModule || !local) {
      return failedCalculation(admission, networkInfluence, {
        code: 'dynamic_model_resolution_failed',
        subjectId: moduleTarget.moduleId,
      });
    }
    const localByPort = new Map(local.perInput.map((input) => [input.portId, input] as const));
    const propagatedInputs: Array<{
      readonly portId: string;
      readonly signal: DynamicSignal;
      readonly transfer: DynamicSensitivity;
      readonly inputTransfer: BfnDynamicModuleInputTransferV1;
    }> = [];
    for (const inputPort of moduleTarget.inputPorts) {
      const edge = relevantIncomingEdge(
        project,
        relevantEdgeIds,
        moduleTarget.moduleId,
        inputPort.portId,
      );
      const sourceSignal = edge
        ? signals.get(signalKey(edge.source.nodeId, edge.source.portId))
        : null;
      const signal = edge && sourceSignal ? propagateAcrossEdge(project, edge, sourceSignal) : null;
      const localInput = localByPort.get(inputPort.portId);
      if (!edge || !signal || !localInput) {
        return failedCalculation(admission, networkInfluence, {
          code: 'dynamic_propagation_failed',
          subjectId: inputPort.portId,
        });
      }
      const transfer = localTransfer(
        localInput.localDifferentialGain,
        dynamicModule,
        angularFrequencyRadPerHour,
      );
      const gain = dynamicGainValue(transfer, moduleTarget.outputUnit, inputPort.unit);
      propagatedInputs.push({
        portId: inputPort.portId,
        signal,
        transfer,
        inputTransfer: Object.freeze({
          inputPortId: inputPort.portId,
          operatingValue: localInput.operatingValue,
          operatingUnit: localInput.operatingUnit,
          localStaticGain: localInput.localDifferentialGain,
          dynamicGain: gain,
          phase: dynamicPhase(gain),
        }),
      });
    }

    const sensitivities = new Map<string, DynamicSensitivity>();
    for (const sourceId of externalSourceIds) {
      sensitivities.set(sourceId, combineModuleSensitivity(sourceId, propagatedInputs));
    }
    signals.set(
      signalKey(moduleTarget.moduleId, moduleTarget.outputPortId),
      Object.freeze({ unit: moduleTarget.outputUnit, sensitivities }),
    );
    moduleTransfers.push(
      Object.freeze({
        ...dynamicModule,
        inputs: Object.freeze(propagatedInputs.map((input) => input.inputTransfer)),
      }),
    );
  }

  const monitorEdge = relevantIncomingEdge(
    project,
    relevantEdgeIds,
    target.outputMonitorId,
    target.outputPortId,
  );
  const upstreamOutput = monitorEdge
    ? signals.get(signalKey(monitorEdge.source.nodeId, monitorEdge.source.portId))
    : null;
  const monitored =
    monitorEdge && upstreamOutput
      ? propagateAcrossEdge(project, monitorEdge, upstreamOutput)
      : null;
  if (!monitored) {
    return failedCalculation(admission, networkInfluence, {
      code: 'dynamic_propagation_failed',
      subjectId: target.outputPortId,
    });
  }

  const orderedOperatingPoint = target.inputSources.map((source) => {
    const input = requestBySource.get(source.inputSourceId)!;
    return Object.freeze({ ...input });
  });
  const dcBySource = new Map(
    networkInfluence.result.perSource.map(
      (source) => [source.inputSourceId, source.totalDifferentialGain] as const,
    ),
  );
  const perSource: BfnDynamicSourceGainV1[] = [];
  for (const [index, source] of target.inputSources.entries()) {
    const input = orderedOperatingPoint[index]!;
    const dcGain = dcBySource.get(source.inputSourceId);
    if (!dcGain) {
      return failedCalculation(admission, networkInfluence, {
        code: 'dynamic_propagation_failed',
        subjectId: source.inputSourceId,
      });
    }
    const gain = dynamicGainValue(
      monitored.sensitivities.get(source.inputSourceId) ?? availableSensitivity(complex(0, 0)),
      target.outputUnit,
      source.unit,
    );
    perSource.push(
      Object.freeze({
        inputSourceId: source.inputSourceId,
        operatingValue: input.value,
        operatingUnit: input.unit,
        dcGain,
        dynamicGain: gain,
        phase: dynamicPhase(gain),
      }),
    );
  }

  const result = Object.freeze({
    contractVersion: '1.0' as const,
    scope: 'network_dynamic_periodic_gain' as const,
    target: admission.target,
    operatingPoint: Object.freeze(orderedOperatingPoint),
    perturbationPeriodHours: request.perturbation.periodHours,
    angularFrequencyRadPerHour,
    baselineOutput: Object.freeze({
      value: networkInfluence.result.outputAtOperatingPoint.value,
      unit: networkInfluence.result.outputAtOperatingPoint.unit,
    }),
    perSource: Object.freeze(perSource),
    moduleTransfers: Object.freeze(moduleTransfers),
    applicability: networkInfluence.result.applicability,
    contextApplicability: networkInfluence.result.contextApplicability,
    persistence: 'ephemeral' as const,
  });
  return Object.freeze({ ok: true, admission, networkInfluence, result });
}

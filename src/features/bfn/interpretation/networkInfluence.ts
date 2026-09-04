import type { BfnIdealEdge, BfnProject, BfnUnit } from '../types';
import { convertUnit, isBfnUnit } from '../unitSystem';
import { resolveBfnPort } from '../validation';
import type {
  BfnLocalDifferentialGainV1,
  BfnLocalInfluenceRequestV1,
  BfnLogElasticityV1,
} from './interpretationTypes';
import { calculateBfnLocalInfluence } from './localInfluence';
import { createBfnNetworkInterpretationContextSnapshot } from './networkInfluenceContext';
import type {
  BfnNetworkInfluenceAdmissionV1,
  BfnNetworkInfluenceCalculationIssueV1,
  BfnNetworkInfluenceCalculationV1,
  BfnNetworkInfluenceDirectionV1,
  BfnNetworkInfluenceRequestV1,
  BfnNetworkSensitivityResolutionV1,
  BfnResolvedNetworkInfluenceTargetV1,
} from './networkInfluenceTypes';
import { bfnNetworkGainUnit } from './networkInfluenceTypes';
import { assessBfnNetworkInfluenceRequest } from './networkInfluenceValidation';

type UnavailableReason = Extract<
  BfnLocalDifferentialGainV1,
  { readonly availability: 'unavailable' }
>['reason'];

interface PropagatedSignal {
  readonly value: number;
  readonly unit: BfnUnit;
  readonly sensitivities: ReadonlyMap<string, BfnNetworkSensitivityResolutionV1>;
}

function signalKey(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`;
}

function availableSensitivity(value: number): BfnNetworkSensitivityResolutionV1 {
  return Number.isFinite(value)
    ? Object.freeze({ availability: 'available', value })
    : Object.freeze({ availability: 'unavailable', reason: 'derivative_non_finite' });
}

function unavailableSensitivity(reason: UnavailableReason): BfnNetworkSensitivityResolutionV1 {
  return Object.freeze({ availability: 'unavailable', reason });
}

function failedCalculation(
  admission: BfnNetworkInfluenceAdmissionV1,
  calculationIssue: BfnNetworkInfluenceCalculationIssueV1 | null,
): BfnNetworkInfluenceCalculationV1 {
  return Object.freeze({ ok: false, admission, calculationIssue });
}

function relevantIncomingEdge(
  project: BfnProject,
  target: BfnResolvedNetworkInfluenceTargetV1,
  nodeId: string,
  portId: string,
): BfnIdealEdge | null {
  const relevantIds = new Set(target.relevantEdgeIds);
  return (
    project.network.edges.find(
      (edge) =>
        edge.enabled &&
        relevantIds.has(edge.id) &&
        edge.target.nodeId === nodeId &&
        edge.target.portId === portId,
    ) ?? null
  );
}

function propagateAcrossEdge(
  project: BfnProject,
  edge: BfnIdealEdge,
  source: PropagatedSignal,
): PropagatedSignal | null {
  const sourcePort = resolveBfnPort(project, edge.source);
  const targetPort = resolveBfnPort(project, edge.target);
  if (!sourcePort || !targetPort) return null;
  try {
    const value = convertUnit(source.value, sourcePort.port.unit, targetPort.port.unit);
    const unitCoordinateScale =
      convertUnit(1, sourcePort.port.unit, targetPort.port.unit) -
      convertUnit(0, sourcePort.port.unit, targetPort.port.unit);
    if (!Number.isFinite(value) || !Number.isFinite(unitCoordinateScale)) return null;
    const sensitivities = new Map<string, BfnNetworkSensitivityResolutionV1>();
    for (const [sourceId, sensitivity] of source.sensitivities) {
      sensitivities.set(
        sourceId,
        sensitivity.availability === 'available'
          ? availableSensitivity(unitCoordinateScale * sensitivity.value)
          : sensitivity,
      );
    }
    return Object.freeze({
      value,
      unit: targetPort.port.unit,
      sensitivities,
    });
  } catch {
    return null;
  }
}

function combineModuleSensitivity(
  sourceId: string,
  localInputs: readonly {
    readonly gain: BfnLocalDifferentialGainV1;
    readonly signal: PropagatedSignal;
  }[],
): BfnNetworkSensitivityResolutionV1 {
  let sum = 0;
  for (const input of localInputs) {
    const upstream = input.signal.sensitivities.get(sourceId) ?? availableSensitivity(0);
    if (upstream.availability === 'available' && upstream.value === 0) continue;
    if (input.gain.availability === 'unavailable') {
      return unavailableSensitivity(input.gain.reason);
    }
    if (input.gain.value === 0) continue;
    if (upstream.availability === 'unavailable') {
      return unavailableSensitivity(upstream.reason);
    }
    const contribution = input.gain.value * upstream.value;
    if (!Number.isFinite(contribution)) return unavailableSensitivity('derivative_non_finite');
    sum += contribution;
    if (!Number.isFinite(sum)) return unavailableSensitivity('derivative_non_finite');
  }
  return availableSensitivity(sum);
}

function totalGain(
  sensitivity: BfnNetworkSensitivityResolutionV1,
  outputUnit: BfnUnit,
  inputUnit: BfnUnit,
): BfnLocalDifferentialGainV1 {
  const unit = bfnNetworkGainUnit(outputUnit, inputUnit);
  return sensitivity.availability === 'available'
    ? Object.freeze({ availability: 'available', value: sensitivity.value, unit })
    : Object.freeze({ availability: 'unavailable', reason: sensitivity.reason, unit });
}

function logElasticity(
  input: number,
  output: number,
  gain: BfnLocalDifferentialGainV1,
): BfnLogElasticityV1 {
  if (gain.availability === 'unavailable') {
    return Object.freeze({
      availability: 'unavailable',
      reason: 'derivative_unavailable',
      unit: 'dimensionless',
    });
  }
  if (input <= 0) {
    return Object.freeze({
      availability: 'unavailable',
      reason: 'input_not_positive',
      unit: 'dimensionless',
    });
  }
  if (output <= 0) {
    return Object.freeze({
      availability: 'unavailable',
      reason: 'output_not_positive',
      unit: 'dimensionless',
    });
  }
  const value = (input / output) * gain.value;
  return Number.isFinite(value)
    ? Object.freeze({ availability: 'available', value, unit: 'dimensionless' })
    : Object.freeze({
        availability: 'unavailable',
        reason: 'derivative_unavailable',
        unit: 'dimensionless',
      });
}

function direction(gain: BfnLocalDifferentialGainV1): BfnNetworkInfluenceDirectionV1 {
  if (gain.availability === 'unavailable') return 'unavailable';
  if (gain.value > 0) return 'enhancing';
  if (gain.value < 0) return 'inhibiting';
  return 'no_local_change';
}

function outsideDomainIssue(
  moduleId: string,
  request: BfnLocalInfluenceRequestV1,
  admission: ReturnType<typeof calculateBfnLocalInfluence>['admission'],
): BfnNetworkInfluenceCalculationIssueV1 | null {
  const issue = admission.issues.find((candidate) => candidate.code === 'outside_validity_domain');
  if (!issue) return null;
  const input = request.operatingPoint.find((candidate) => candidate.portId === issue.subjectId);
  const minimum = issue.details?.minimum;
  const maximum = issue.details?.maximum;
  const rangeUnit = issue.details?.rangeUnit;
  if (
    !input ||
    typeof minimum !== 'number' ||
    typeof maximum !== 'number' ||
    !isBfnUnit(rangeUnit)
  ) {
    return null;
  }
  return Object.freeze({
    code: 'outside_recorded_domain',
    moduleId,
    inputPortId: issue.subjectId,
    currentValue: input.value,
    currentUnit: input.unit,
    minimum,
    maximum,
    rangeUnit,
  });
}

/**
 * Pure forward sensitivity propagation over the admitted target-scoped DAG.
 * Unit conversion changes numeric coordinates; it never adds an Edge gain.
 */
export function calculateBfnNetworkInfluence(
  project: BfnProject,
  request: BfnNetworkInfluenceRequestV1,
): BfnNetworkInfluenceCalculationV1 {
  const admission = assessBfnNetworkInfluenceRequest(project, request);
  if (admission.status === 'unsupported' || !admission.target) {
    return failedCalculation(admission, null);
  }
  const target = admission.target;
  const requestBySource = new Map(
    request.operatingPoint.map((input) => [input.inputSourceId, input] as const),
  );
  const externalSourceIds = target.inputSources.map((source) => source.inputSourceId);
  const signals = new Map<string, PropagatedSignal>();

  for (const sourceTarget of target.inputSources) {
    const input = requestBySource.get(sourceTarget.inputSourceId)!;
    const sensitivities = new Map<string, BfnNetworkSensitivityResolutionV1>();
    for (const sourceId of externalSourceIds) {
      sensitivities.set(
        sourceId,
        availableSensitivity(sourceId === sourceTarget.inputSourceId ? 1 : 0),
      );
    }
    signals.set(
      signalKey(sourceTarget.inputSourceId, sourceTarget.outputPortId),
      Object.freeze({ value: input.value, unit: input.unit, sensitivities }),
    );
  }

  const moduleInterpretations: Array<{
    readonly moduleId: string;
    readonly localInfluence: Extract<
      ReturnType<typeof calculateBfnLocalInfluence>,
      { ok: true }
    >['result'];
  }> = [];
  let applicability: 'within_recorded_domain' | 'applicability_not_recorded' =
    'within_recorded_domain';

  for (const moduleTarget of target.moduleTargets) {
    const propagatedInputs: Array<{ portId: string; signal: PropagatedSignal }> = [];
    for (const inputPort of moduleTarget.inputPorts) {
      const edge = relevantIncomingEdge(project, target, moduleTarget.moduleId, inputPort.portId);
      if (!edge) {
        return failedCalculation(admission, {
          code: 'unit_conversion_failed',
          subjectId: inputPort.portId,
        });
      }
      const sourceSignal = signals.get(signalKey(edge.source.nodeId, edge.source.portId));
      if (!sourceSignal) {
        return failedCalculation(admission, {
          code: 'unit_conversion_failed',
          subjectId: edge.id,
        });
      }
      const signal = propagateAcrossEdge(project, edge, sourceSignal);
      if (!signal) {
        return failedCalculation(admission, {
          code: 'unit_conversion_failed',
          subjectId: edge.id,
        });
      }
      propagatedInputs.push({ portId: inputPort.portId, signal });
    }

    const localRequest: BfnLocalInfluenceRequestV1 = {
      contractVersion: '1.0',
      scope: 'module_static_response',
      moduleId: moduleTarget.moduleId,
      outputPortId: moduleTarget.outputPortId,
      operatingPoint: propagatedInputs.map(({ portId, signal }) => ({
        portId,
        value: signal.value,
        unit: signal.unit,
      })),
    };
    const local = calculateBfnLocalInfluence(project, localRequest);
    if (!local.ok) {
      return failedCalculation(
        admission,
        outsideDomainIssue(moduleTarget.moduleId, localRequest, local.admission) ?? {
          code: 'module_calculation_failed',
          moduleId: moduleTarget.moduleId,
        },
      );
    }
    if (local.result.applicability === 'applicability_not_recorded') {
      applicability = 'applicability_not_recorded';
    }
    const localByPort = new Map(
      local.result.perInput.map((input) => [input.portId, input] as const),
    );
    const localInputs = propagatedInputs.map(({ portId, signal }) => ({
      signal,
      gain: localByPort.get(portId)!.localDifferentialGain,
    }));
    const sensitivities = new Map<string, BfnNetworkSensitivityResolutionV1>();
    for (const sourceId of externalSourceIds) {
      sensitivities.set(sourceId, combineModuleSensitivity(sourceId, localInputs));
    }
    signals.set(
      signalKey(moduleTarget.moduleId, moduleTarget.outputPortId),
      Object.freeze({
        value: local.result.outputAtOperatingPoint.value,
        unit: moduleTarget.outputUnit,
        sensitivities,
      }),
    );
    moduleInterpretations.push(
      Object.freeze({ moduleId: moduleTarget.moduleId, localInfluence: local.result }),
    );
  }

  const monitorEdge = relevantIncomingEdge(
    project,
    target,
    target.outputMonitorId,
    target.outputPortId,
  );
  if (!monitorEdge) {
    return failedCalculation(admission, {
      code: 'unit_conversion_failed',
      subjectId: target.outputPortId,
    });
  }
  const upstreamOutput = signals.get(
    signalKey(monitorEdge.source.nodeId, monitorEdge.source.portId),
  );
  const monitored = upstreamOutput
    ? propagateAcrossEdge(project, monitorEdge, upstreamOutput)
    : null;
  if (!monitored) {
    return failedCalculation(admission, {
      code: 'unit_conversion_failed',
      subjectId: monitorEdge.id,
    });
  }
  if (!Number.isFinite(monitored.value)) {
    return failedCalculation(admission, {
      code: 'output_non_finite',
      subjectId: target.outputMonitorId,
    });
  }

  const orderedOperatingPoint = target.inputSources.map((source) => {
    const input = requestBySource.get(source.inputSourceId)!;
    return Object.freeze({ ...input });
  });
  const perSource = target.inputSources.map((source, index) => {
    const input = orderedOperatingPoint[index]!;
    const gain = totalGain(
      monitored.sensitivities.get(source.inputSourceId) ?? availableSensitivity(0),
      target.outputUnit,
      source.unit,
    );
    return Object.freeze({
      inputSourceId: source.inputSourceId,
      operatingValue: input.value,
      operatingUnit: input.unit,
      totalDifferentialGain: gain,
      logElasticity: logElasticity(input.value, monitored.value, gain),
      direction: direction(gain),
    });
  });

  const result = Object.freeze({
    contractVersion: '1.0' as const,
    scope: 'network_static_output' as const,
    target,
    operatingPoint: Object.freeze(orderedOperatingPoint),
    outputAtOperatingPoint: Object.freeze({ value: monitored.value, unit: target.outputUnit }),
    perSource: Object.freeze(perSource),
    applicability,
    contextApplicability: createBfnNetworkInterpretationContextSnapshot(project, target),
    moduleInterpretations: Object.freeze(moduleInterpretations),
    persistence: 'ephemeral' as const,
  });
  return Object.freeze({ ok: true, admission, result });
}

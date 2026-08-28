import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { createBfnProvenanceRows } from './chartExport';
import { resolveBfnResultSignals } from './resultSignals';
import {
  countBfnTemporalEvidence,
  countBfnTemporalExecution,
  summarizeBfnContextApplicability,
} from './runInterpretation';
import type { BfnSimulationResult } from './types';

export interface BfnRunProvenanceProps {
  result: BfnSimulationResult;
}

const uncertaintyMethodKeys: Record<
  BfnSimulationResult['uncertaintyMethod'],
  'bfn.results.provenance.parameterIntervalEnvelope'
> = {
  parameter_interval_envelope: 'bfn.results.provenance.parameterIntervalEnvelope',
};

const experimentalValidityKeys: Record<
  BfnSimulationResult['experimentalValidity'],
  'bfn.results.provenance.notValidated'
> = {
  not_validated: 'bfn.results.provenance.notValidated',
};

function compactSummary(entries: ReadonlyArray<readonly [number, string]>): string {
  return entries
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${label} ${count}`)
    .join(' · ');
}

function temporalExecutionSummary(result: BfnSimulationResult, t: TFunction): string {
  if (!result.temporalSnapshot) return t('bfn.temporal.notRecorded');
  const counts = countBfnTemporalExecution(result.temporalSnapshot);
  return (
    compactSummary([
      [counts.steadyState, t('bfn.temporal.modes.steady_state')],
      [counts.quasiStatic, t('bfn.temporal.modes.quasi_static')],
      [counts.statefulDynamic, t('bfn.temporal.modes.stateful_dynamic')],
      [counts.unsupported, t('bfn.temporal.modes.unsupported')],
    ]) || t('bfn.temporal.noReachableModules')
  );
}

function temporalEvidenceSummary(result: BfnSimulationResult, t: TFunction): string {
  if (!result.temporalSnapshot) return t('bfn.temporal.notRecorded');
  const counts = countBfnTemporalEvidence(result.temporalSnapshot);
  return (
    compactSummary([
      [counts.t0SteadyState, t('bfn.temporal.evidenceTiers.t0_steady_state')],
      [counts.t1TimeResolved, t('bfn.temporal.evidenceTiers.t1_time_resolved')],
      [
        counts.t2PhenomenologicalDynamic,
        t('bfn.temporal.evidenceTiers.t2_phenomenological_dynamic'),
      ],
      [counts.t3MechanisticDynamic, t('bfn.temporal.evidenceTiers.t3_mechanistic_dynamic')],
      [counts.notRecorded, t('bfn.temporal.evidenceTiers.not_recorded')],
    ]) || t('bfn.temporal.noReachableModules')
  );
}

function contextApplicabilitySummary(result: BfnSimulationResult, t: TFunction): string {
  if (!result.contextApplicabilitySnapshot) return t('bfn.compatibility.contextNotRecorded');
  return t(
    `bfn.compatibility.contextSummaries.${summarizeBfnContextApplicability(
      result.contextApplicabilitySnapshot,
    )}`,
  );
}

export function BfnRunProvenance({ result }: BfnRunProvenanceProps) {
  const { t } = useTranslation();
  const provenance = Object.fromEntries(
    createBfnProvenanceRows({ result }).map((row) => [row.key, row.value]),
  );
  const signals = resolveBfnResultSignals(result, t);
  const hasPrimaryInputRange = result.points.some((point) =>
    Number.isFinite(point.inputs[result.primaryInputSourceId]),
  );
  const hasTimeRange = result.points.some((point) => Number.isFinite(point.timeHours));
  const annValue = !result.annApproximation
    ? t('bfn.results.provenance.notAvailable')
    : result.annApproximation.status === 'accepted'
      ? t('bfn.results.provenance.annAccepted')
      : t('bfn.results.provenance.annRejected');
  const rows = [
    ['runId', result.id],
    ['completedAt', result.completedAt],
    ['engineVersion', result.engineVersion],
    ['mode', t(`bfn.modes.${result.mode}`)],
    ['networkId', result.networkId],
    ['primaryInputSourceId', result.primaryInputSourceId],
    ['outputMonitorId', result.outputMonitorId],
    ['primaryInputSignal', signals.input.label],
    ['primaryInputUnit', signals.input.unitLabel],
    ['outputSignal', signals.output.label],
    ['outputUnit', signals.output.unitLabel],
    [
      'primaryInputRange',
      hasPrimaryInputRange
        ? (provenance.primary_input_range ?? t('bfn.results.provenance.notAvailable'))
        : t('bfn.results.provenance.notAvailable'),
    ],
    [
      'timeRangeHours',
      hasTimeRange
        ? (provenance.time_range_hours ?? t('bfn.results.provenance.notAvailable'))
        : t('bfn.results.provenance.notAvailable'),
    ],
    [
      'modelVersions',
      result.modelVersions.length
        ? result.modelVersions.join(' · ')
        : t('bfn.results.provenance.notAvailable'),
    ],
    [
      'contextIds',
      result.contextIds.length
        ? result.contextIds.join(' · ')
        : t('bfn.results.provenance.notAvailable'),
    ],
    ['temporalExecutionSummary', temporalExecutionSummary(result, t)],
    ['temporalEvidenceSummary', temporalEvidenceSummary(result, t)],
    ['contextApplicabilitySummary', contextApplicabilitySummary(result, t)],
    ['uncertaintyMethod', t(uncertaintyMethodKeys[result.uncertaintyMethod])],
    [
      'extrapolated',
      t(result.extrapolated ? 'bfn.results.provenance.yes' : 'bfn.results.provenance.no'),
    ],
    ['isDemo', t(result.isDemo ? 'bfn.results.provenance.yes' : 'bfn.results.provenance.no')],
    ['experimentalValidity', t(experimentalValidityKeys[result.experimentalValidity])],
    ['annApproximation', annValue],
  ] as const;

  return (
    <details className="bfn-run-provenance">
      <summary>{t('bfn.results.provenance.title')}</summary>
      <dl>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{t(`bfn.results.provenance.${key}`)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {result.temporalSnapshot ? (
        <details className="bfn-run-provenance__temporal-modules">
          <summary>{t('bfn.results.provenance.temporalModuleDetails')}</summary>
          <table>
            <thead>
              <tr>
                <th>{t('bfn.results.provenance.module')}</th>
                <th>{t('bfn.results.provenance.model')}</th>
                <th>{t('bfn.results.provenance.timeHandling')}</th>
                <th>{t('bfn.results.provenance.temporalEvidence')}</th>
              </tr>
            </thead>
            <tbody>
              {result.temporalSnapshot.modules.map((module) => (
                <tr key={module.moduleId}>
                  <td>{module.moduleId}</td>
                  <td>{module.selectedModelId ?? t('bfn.results.provenance.notAvailable')}</td>
                  <td>{t(`bfn.temporal.modes.${module.executionMode}`)}</td>
                  <td>{t(`bfn.temporal.evidenceTiers.${module.evidenceTier}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
      {!signals.complete ? (
        <p className="bfn-run-provenance__notice">
          {t('bfn.results.signals.legacySemanticsUnavailable')}
        </p>
      ) : null}
    </details>
  );
}

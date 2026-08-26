import { useTranslation } from 'react-i18next';
import { createBfnProvenanceRows } from './chartExport';
import { resolveBfnResultSignals } from './resultSignals';
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
      {!signals.complete ? (
        <p className="bfn-run-provenance__notice">
          {t('bfn.results.signals.legacySemanticsUnavailable')}
        </p>
      ) : null}
    </details>
  );
}

import { useTranslation } from 'react-i18next';
import { createBfnProvenanceRows } from './chartExport';
import type { BfnSimulationResult } from './types';

export interface BfnRunProvenanceProps {
  result: BfnSimulationResult;
}

export function BfnRunProvenance({ result }: BfnRunProvenanceProps) {
  const { t } = useTranslation();
  const provenance = Object.fromEntries(
    createBfnProvenanceRows({ result }).map((row) => [row.key, row.value]),
  );
  const annValue = !result.annApproximation
    ? t('bfn.results.provenance.notAvailable')
    : result.annApproximation.status === 'accepted'
      ? t('bfn.results.provenance.annAccepted')
      : t('bfn.results.provenance.annRejected');
  const rows = [
    ['runId', result.id],
    ['completedAt', result.completedAt],
    ['engineVersion', result.engineVersion],
    ['mode', result.mode],
    ['networkId', result.networkId],
    ['primaryInputSourceId', result.primaryInputSourceId],
    ['outputMonitorId', result.outputMonitorId],
    ['primaryInputRange', provenance.primary_input_range ?? t('bfn.results.provenance.notAvailable')],
    ['timeRangeHours', provenance.time_range_hours ?? t('bfn.results.provenance.notAvailable')],
    ['modelVersions', result.modelVersions.length ? result.modelVersions.join(' · ') : t('bfn.results.provenance.notAvailable')],
    ['contextIds', result.contextIds.length ? result.contextIds.join(' · ') : t('bfn.results.provenance.notAvailable')],
    ['uncertaintyMethod', t('bfn.results.provenance.parameterIntervalEnvelope')],
    ['extrapolated', t(result.extrapolated ? 'bfn.results.provenance.yes' : 'bfn.results.provenance.no')],
    ['isDemo', t(result.isDemo ? 'bfn.results.provenance.yes' : 'bfn.results.provenance.no')],
    ['experimentalValidity', t('bfn.results.provenance.notValidated')],
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
    </details>
  );
}

import { useTranslation } from 'react-i18next';
import { assessBfnPortCompatibility } from './compatibility/portCompatibility';
import type { BfnIntegratedContextApplicabilityAssessment } from './compatibility/contextIntegration';
import { bfnUnitLabel } from './presentation';
import type { BfnPort } from './types';

export interface BfnConnectionAssessmentProps {
  sourcePort: BfnPort;
  targetPort: BfnPort;
  context: BfnIntegratedContextApplicabilityAssessment;
  compact?: boolean;
}

function contextValue(value: string | number | null): string {
  if (value === null) return '—';
  return String(value);
}

export function BfnConnectionAssessment({
  sourcePort,
  targetPort,
  context,
  compact = false,
}: BfnConnectionAssessmentProps) {
  const { t } = useTranslation();
  const signal = assessBfnPortCompatibility(sourcePort, targetPort);
  const rateToConcentration =
    sourcePort.quantityType === 'production_rate' && targetPort.quantityType === 'concentration';
  return (
    <div className="bfn-connection-assessment" data-compact={compact}>
      <section data-signal-state={signal.state}>
        <header>{t('bfn.compatibility.signalTitle')}</header>
        <strong>
          {signal.state === 'compatible'
            ? t('bfn.compatibility.canDirectlyConnect')
            : t('bfn.compatibility.signalIncompatible')}
        </strong>
        {signal.state === 'compatible' && signal.requiresUnitNormalization ? (
          <p data-unit-normalization="true">
            {t('bfn.compatibility.unitNormalization', {
              source: bfnUnitLabel(sourcePort.unit, t),
              target: bfnUnitLabel(targetPort.unit, t),
            })}
          </p>
        ) : null}
        {rateToConcentration ? <p>{t('bfn.compatibility.rateToConcentration')}</p> : null}
        {signal.state === 'incompatible' && !rateToConcentration ? (
          <p>{t('bfn.compatibility.signalMismatchBoundary')}</p>
        ) : null}
      </section>
      <section data-context-state={context.overall}>
        <header>{t('bfn.compatibility.contextTitle')}</header>
        <strong>{t(`bfn.compatibility.contextStates.${context.overall}`)}</strong>
        <p>{t(`bfn.compatibility.contextBoundaries.${context.overall}`)}</p>
        {context.checks.length > 0 ? (
          <details>
            <summary>{t('bfn.compatibility.fieldDetails')}</summary>
            <dl>
              {context.checks.map((check) => (
                <div key={check.field} data-check-state={check.state}>
                  <dt>{t(`bfn.compatibility.fields.${check.field}`)}</dt>
                  <dd>
                    <span>{t(`bfn.compatibility.checkStates.${check.state}`)}</span>
                    <small>
                      {contextValue(check.evidenceValue)} → {contextValue(check.projectValue)}
                    </small>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </section>
    </div>
  );
}

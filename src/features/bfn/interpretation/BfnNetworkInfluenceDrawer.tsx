import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import {
  bfnEntityLabel,
  bfnEvidenceTone,
  bfnNodeDisplayName,
  bfnPortPrimaryLabel,
  bfnQuantityLabel,
  bfnUnitLabel,
} from '../presentation';
import type { BfnInputSource, BfnOutputMonitor, BfnProject } from '../types';
import type { BfnLocalDifferentialGainV1, BfnLogElasticityV1 } from './interpretationTypes';
import { calculateBfnNetworkInfluence } from './networkInfluence';
import { bfnNetworkInfluencePrefill } from './networkInfluencePresentation';
import type {
  BfnNetworkInfluenceCalculationV1,
  BfnNetworkInfluenceRequestV1,
  BfnResolvedNetworkInfluenceTargetV1,
} from './networkInfluenceTypes';

interface BfnNetworkInfluenceDrawerProps {
  project: BfnProject;
  monitor: BfnOutputMonitor;
  target: BfnResolvedNetworkInfluenceTargetV1;
  onClose: () => void;
}

interface AnalysisField {
  readonly source: BfnInputSource;
  readonly rawValue: string;
  readonly value: number | null;
  readonly valid: boolean;
}

function projectEntityLabel(project: BfnProject, entityId: string, t: (key: string) => string) {
  return (
    project.registry.entities.find((entity) => entity.id === entityId)?.displayName ??
    bfnEntityLabel(entityId, t)
  );
}

function gainReasonKey(gain: BfnLocalDifferentialGainV1): string | null {
  if (gain.availability === 'available') return null;
  if (gain.reason === 'derivative_not_unique') return 'notUnique';
  if (gain.reason === 'derivative_non_finite') return 'nonFinite';
  return 'unavailable';
}

function elasticityReasonKey(elasticity: BfnLogElasticityV1): string | null {
  if (elasticity.availability === 'available') return null;
  if (elasticity.reason === 'input_not_positive') return 'inputNotPositive';
  if (elasticity.reason === 'output_not_positive') return 'outputNotPositive';
  return 'gainUnavailable';
}

export function BfnNetworkInfluenceDrawer({
  project,
  monitor,
  target,
  onClose,
}: BfnNetworkInfluenceDrawerProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const titleId = useId();
  const purposeId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [values, setValues] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(
      target.inputSources.map((input) => {
        const prefill = bfnNetworkInfluencePrefill(project, input.inputSourceId);
        return [input.inputSourceId, prefill === null ? '' : String(prefill)];
      }),
    ),
  );
  const [calculation, setCalculation] = useState<BfnNetworkInfluenceCalculationV1 | null>(null);
  const fields = useMemo<readonly AnalysisField[]>(
    () =>
      target.inputSources.flatMap((targetSource) => {
        const source = project.network.inputSources.find(
          (candidate) => candidate.id === targetSource.inputSourceId,
        );
        if (!source) return [];
        const rawValue = values[source.id] ?? '';
        const parsed = rawValue.trim().length > 0 ? Number(rawValue) : null;
        return [
          {
            source,
            rawValue,
            value: parsed,
            valid: parsed !== null && Number.isFinite(parsed) && parsed >= 0,
          },
        ];
      }),
    [project.network.inputSources, target.inputSources, values],
  );
  const ready =
    fields.length === target.inputSources.length && fields.every((field) => field.valid);
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language, { maximumSignificantDigits: 6 }),
    [language],
  );
  const signedNumberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(language, {
        maximumSignificantDigits: 6,
        signDisplay: 'exceptZero',
      }),
    [language],
  );

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), summary, [tabindex]:not([tabindex=-1])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const analyze = (event: FormEvent): void => {
    event.preventDefault();
    if (!ready) return;
    const request: BfnNetworkInfluenceRequestV1 = {
      contractVersion: '1.0',
      scope: 'network_static_output',
      outputMonitorId: monitor.id,
      operatingPoint: fields.map((field) => ({
        inputSourceId: field.source.id,
        value: field.value ?? 0,
        unit: field.source.outputPort.unit,
      })),
    };
    setCalculation(calculateBfnNetworkInfluence(project, request));
  };

  const result = calculation?.ok ? calculation.result : null;
  const outside =
    calculation &&
    !calculation.ok &&
    calculation.calculationIssue?.code === 'outside_recorded_domain'
      ? calculation.calculationIssue
      : null;
  const outsideModule = outside
    ? (project.network.modules.find((module) => module.id === outside.moduleId) ?? null)
    : null;
  const outsidePort =
    outsideModule && outside
      ? (outsideModule.inputPorts.find((port) => port.id === outside.inputPortId) ?? null)
      : null;

  return (
    <div className="bfn-drawer-layer bfn-network-influence-layer">
      <button
        className="bfn-drawer-scrim"
        type="button"
        aria-label={t('bfn.networkInfluence.close')}
        onClick={onClose}
      />
      <aside
        className="bfn-drawer bfn-local-influence bfn-network-influence"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={purposeId}
        onKeyDown={handleKeyDown}
      >
        <header className="bfn-drawer__header">
          <div>
            <span>{t('bfn.networkInfluence.kicker')}</span>
            <h2 id={titleId}>{t('bfn.networkInfluence.title')}</h2>
          </div>
          <button
            ref={closeRef}
            className="bfn-drawer__close"
            type="button"
            aria-label={t('bfn.networkInfluence.close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <form className="bfn-local-influence__body" onSubmit={analyze}>
          <p id={purposeId} className="bfn-local-influence__purpose">
            {t('bfn.networkInfluence.purpose')}
          </p>
          <section className="bfn-local-influence__section">
            <h3>{t('bfn.networkInfluence.object.title')}</h3>
            <dl className="bfn-local-influence__properties">
              <div>
                <dt>{t('bfn.networkInfluence.object.output')}</dt>
                <dd title={bfnNodeDisplayName(monitor, language, t)}>
                  {bfnNodeDisplayName(monitor, language, t)}
                </dd>
              </div>
              <div>
                <dt>{t('bfn.networkInfluence.object.signal')}</dt>
                <dd>
                  {bfnPortPrimaryLabel(monitor.inputPort, t, language)}
                  <small>
                    {bfnQuantityLabel(monitor.inputPort.quantityType, t)} ·{' '}
                    {bfnUnitLabel(monitor.inputPort.unit, t)}
                  </small>
                </dd>
              </div>
            </dl>
            {target.includesFirstOrderSteadyState ? (
              <p className="bfn-local-influence__boundary-note">
                <Icon name="info" size={14} />
                <span>{t('bfn.networkInfluence.firstOrder')}</span>
              </p>
            ) : null}
            {target.directTransmission ? (
              <p className="bfn-local-influence__boundary-note">
                <Icon name="info" size={14} />
                <span>{t('bfn.networkInfluence.directTransmission')}</span>
              </p>
            ) : null}
          </section>
          <section className="bfn-local-influence__section">
            <h3>{t('bfn.networkInfluence.conditions.title')}</h3>
            <div className="bfn-local-influence__table-scroll">
              <table className="bfn-local-influence__table bfn-local-influence__conditions">
                <thead>
                  <tr>
                    <th>{t('bfn.networkInfluence.conditions.input')}</th>
                    <th>{t('bfn.networkInfluence.conditions.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => {
                    const inputId = `bfn-network-influence-${field.source.id}`;
                    const errorId = `${inputId}-error`;
                    const invalid = field.rawValue.trim().length > 0 && !field.valid;
                    return (
                      <tr key={field.source.id}>
                        <th scope="row" title={bfnNodeDisplayName(field.source, language, t)}>
                          {bfnNodeDisplayName(field.source, language, t)}
                          <small>
                            {projectEntityLabel(project, field.source.outputPort.entity, t)}
                          </small>
                        </th>
                        <td>
                          <label className="visually-hidden" htmlFor={inputId}>
                            {t('bfn.networkInfluence.conditions.valueFor', {
                              input: bfnNodeDisplayName(field.source, language, t),
                            })}
                          </label>
                          <div className="bfn-local-influence__value-control">
                            <input
                              id={inputId}
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              value={field.rawValue}
                              aria-invalid={invalid || undefined}
                              aria-describedby={invalid ? errorId : undefined}
                              onChange={(event) => {
                                const value = event.target.value;
                                setValues((current) => ({
                                  ...current,
                                  [field.source.id]: value,
                                }));
                                setCalculation(null);
                              }}
                            />
                            <span>{bfnUnitLabel(field.source.outputPort.unit, t)}</span>
                          </div>
                          {invalid ? (
                            <small id={errorId} className="bfn-local-influence__field-error">
                              {t('bfn.networkInfluence.conditions.invalidValue')}
                            </small>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="bfn-local-influence__command">
              <p>{t('bfn.networkInfluence.conditions.requirement')}</p>
              <Button
                type="submit"
                variant="primary"
                leadingIcon={<Icon name="pulse" size={15} />}
                disabled={!ready}
                {...(!ready
                  ? { disabledReason: t('bfn.networkInfluence.conditions.incomplete') }
                  : {})}
              >
                {t('bfn.networkInfluence.analyze')}
              </Button>
            </div>
          </section>

          {outside ? (
            <section className="bfn-local-influence__message" data-tone="warning" role="status">
              <Icon name="warning" size={16} />
              <div>
                <strong>{t('bfn.networkInfluence.outside.title')}</strong>
                <p>{t('bfn.networkInfluence.outside.description')}</p>
                <ul>
                  <li>
                    {t('bfn.networkInfluence.outside.range', {
                      module: outsideModule
                        ? bfnNodeDisplayName(outsideModule, language, t)
                        : t('bfn.networkInfluence.object.module'),
                      input: outsidePort
                        ? bfnPortPrimaryLabel(outsidePort, t, language)
                        : t('bfn.networkInfluence.conditions.input'),
                      current: numberFormatter.format(outside.currentValue),
                      currentUnit: bfnUnitLabel(outside.currentUnit, t),
                      minimum: numberFormatter.format(outside.minimum),
                      maximum: numberFormatter.format(outside.maximum),
                      rangeUnit: bfnUnitLabel(outside.rangeUnit, t),
                    })}
                  </li>
                </ul>
              </div>
            </section>
          ) : calculation && !calculation.ok ? (
            <section className="bfn-local-influence__message" data-tone="warning" role="status">
              <Icon name="warning" size={16} />
              <div>
                <strong>{t('bfn.networkInfluence.failure.title')}</strong>
                <p>{t('bfn.networkInfluence.failure.description')}</p>
              </div>
            </section>
          ) : null}

          {result ? (
            <section
              className="bfn-local-influence__results"
              aria-label={t('bfn.networkInfluence.results.title')}
            >
              <header>
                <h3>{t('bfn.networkInfluence.results.title')}</h3>
                <span>{t('bfn.networkInfluence.results.scopeLabel')}</span>
              </header>
              <div className="bfn-local-influence__current-output">
                <span>{t('bfn.networkInfluence.results.currentOutput')}</span>
                <strong>
                  {numberFormatter.format(result.outputAtOperatingPoint.value)}
                  <small>{bfnUnitLabel(result.outputAtOperatingPoint.unit, t)}</small>
                </strong>
                <small>{projectEntityLabel(project, monitor.inputPort.entity, t)}</small>
              </div>
              <div className="bfn-local-influence__table-scroll">
                <table className="bfn-local-influence__table bfn-local-influence__result-table">
                  <thead>
                    <tr>
                      <th>{t('bfn.networkInfluence.results.input')}</th>
                      <th>{t('bfn.networkInfluence.results.direction')}</th>
                      <th>{t('bfn.networkInfluence.results.gain')}</th>
                      <th>{t('bfn.networkInfluence.results.sensitivity')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.perSource.map((influence) => {
                      const source = project.network.inputSources.find(
                        (candidate) => candidate.id === influence.inputSourceId,
                      );
                      const gainReason = gainReasonKey(influence.totalDifferentialGain);
                      const elasticityReason = elasticityReasonKey(influence.logElasticity);
                      return (
                        <tr key={influence.inputSourceId}>
                          <th
                            scope="row"
                            title={source ? bfnNodeDisplayName(source, language, t) : ''}
                          >
                            {source
                              ? bfnNodeDisplayName(source, language, t)
                              : t('bfn.networkInfluence.conditions.input')}
                            <small>
                              {numberFormatter.format(influence.operatingValue)}{' '}
                              {bfnUnitLabel(influence.operatingUnit, t)}
                            </small>
                          </th>
                          <td data-direction={influence.direction}>
                            {t('bfn.networkInfluence.directions.' + influence.direction)}
                          </td>
                          <td className="bfn-local-influence__numeric">
                            {influence.totalDifferentialGain.availability === 'available' ? (
                              <>
                                {signedNumberFormatter.format(
                                  influence.totalDifferentialGain.value,
                                )}
                                <small>
                                  {bfnUnitLabel(influence.totalDifferentialGain.unit.outputUnit, t)}{' '}
                                  /{' '}
                                  {bfnUnitLabel(influence.totalDifferentialGain.unit.inputUnit, t)}
                                </small>
                              </>
                            ) : (
                              <>
                                {t('bfn.networkInfluence.unavailable')}
                                {gainReason ? (
                                  <small>
                                    {t('bfn.networkInfluence.gainReasons.' + gainReason)}
                                  </small>
                                ) : null}
                              </>
                            )}
                          </td>
                          <td className="bfn-local-influence__numeric">
                            {influence.logElasticity.availability === 'available' ? (
                              signedNumberFormatter.format(influence.logElasticity.value)
                            ) : (
                              <>
                                {t('bfn.networkInfluence.sensitivityUnavailable')}
                                {elasticityReason ? (
                                  <small>
                                    {t(
                                      'bfn.networkInfluence.elasticityReasons.' + elasticityReason,
                                    )}
                                  </small>
                                ) : null}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <section
                className="bfn-local-influence__applicability"
                data-state={result.applicability}
              >
                <strong>{t('bfn.networkInfluence.applicability.title')}</strong>
                <p>
                  {t(
                    result.applicability === 'within_recorded_domain'
                      ? 'bfn.networkInfluence.applicability.within'
                      : 'bfn.networkInfluence.applicability.notRecorded',
                  )}
                </p>
              </section>
              <details className="bfn-network-influence__details">
                <summary>{t('bfn.networkInfluence.modelBasis.title')}</summary>
                <p>{t('bfn.networkInfluence.modelBasis.description')}</p>
                {result.moduleInterpretations.length ? (
                  <div className="bfn-local-influence__table-scroll">
                    <table className="bfn-local-influence__table bfn-network-influence__basis-table">
                      <thead>
                        <tr>
                          <th>{t('bfn.networkInfluence.modelBasis.module')}</th>
                          <th>{t('bfn.networkInfluence.modelBasis.evidence')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.moduleInterpretations.map((interpretation) => {
                          const module = project.network.modules.find(
                            (candidate) => candidate.id === interpretation.moduleId,
                          );
                          const evidence =
                            interpretation.localInfluence.target.evidence.evidenceGrade;
                          return (
                            <tr key={interpretation.moduleId}>
                              <th scope="row">
                                {module
                                  ? bfnNodeDisplayName(module, language, t)
                                  : t('bfn.networkInfluence.object.module')}
                              </th>
                              <td>
                                <span data-evidence-tone={bfnEvidenceTone(evidence)}>
                                  {t('bfn.evidence.' + evidence)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>{t('bfn.networkInfluence.modelBasis.direct')}</p>
                )}
                <p>{t('bfn.networkInfluence.modelBasis.nominal')}</p>
              </details>
            </section>
          ) : null}
        </form>
      </aside>
    </div>
  );
}

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
import { calculateBfnDynamicGain } from './dynamicGain';
import { bfnDynamicGainPrefill } from './dynamicGainPresentation';
import type {
  BfnDynamicGainCalculationV1,
  BfnDynamicGainRequestV1,
  BfnDynamicGainValueV1,
  BfnDynamicPhaseV1,
  BfnResolvedDynamicGainTargetV1,
} from './dynamicGainTypes';

interface BfnDynamicGainDrawerProps {
  project: BfnProject;
  monitor: BfnOutputMonitor;
  target: BfnResolvedDynamicGainTargetV1;
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

function gainReasonKey(gain: BfnDynamicGainValueV1): string | null {
  if (gain.availability === 'available') return null;
  if (gain.reason === 'derivative_not_unique') return 'notUnique';
  if (gain.reason === 'complex_non_finite' || gain.reason === 'derivative_non_finite')
    return 'nonFinite';
  return 'unavailable';
}

function phaseLabel(
  phase: BfnDynamicPhaseV1,
  formatter: Intl.NumberFormat,
  t: (key: string) => string,
): string {
  if (phase.availability === 'available') return `${formatter.format(phase.degrees)} deg`;
  if (phase.reason === 'zero_magnitude') return t('bfn.dynamicGain.phaseReasons.zero');
  if (phase.reason === 'complex_non_finite') return t('bfn.dynamicGain.phaseReasons.nonFinite');
  return t('bfn.dynamicGain.phaseReasons.unavailable');
}

export function BfnDynamicGainDrawer({
  project,
  monitor,
  target,
  onClose,
}: BfnDynamicGainDrawerProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const titleId = useId();
  const purposeId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [period, setPeriod] = useState('');
  const [values, setValues] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(
      target.baselineTarget.inputSources.map((input) => {
        const prefill = bfnDynamicGainPrefill(project, input.inputSourceId);
        return [input.inputSourceId, prefill === null ? '' : String(prefill)];
      }),
    ),
  );
  const [calculation, setCalculation] = useState<BfnDynamicGainCalculationV1 | null>(null);
  const fields = useMemo<readonly AnalysisField[]>(
    () =>
      target.baselineTarget.inputSources.flatMap((targetSource) => {
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
    [project.network.inputSources, target.baselineTarget.inputSources, values],
  );
  const parsedPeriod = period.trim().length > 0 ? Number(period) : null;
  const periodValid = parsedPeriod !== null && Number.isFinite(parsedPeriod) && parsedPeriod > 0;
  const ready =
    fields.length === target.baselineTarget.inputSources.length &&
    fields.every((field) => field.valid) &&
    periodValid;
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language, { maximumSignificantDigits: 6 }),
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

  const clearCalculation = (): void => setCalculation(null);

  const analyze = (event: FormEvent): void => {
    event.preventDefault();
    if (!ready || parsedPeriod === null) return;
    const request: BfnDynamicGainRequestV1 = {
      contractVersion: '1.0',
      scope: 'network_dynamic_periodic_gain',
      outputMonitorId: monitor.id,
      operatingPoint: fields.map((field) => ({
        inputSourceId: field.source.id,
        value: field.value ?? 0,
        unit: field.source.outputPort.unit,
      })),
      perturbation: { periodHours: parsedPeriod },
    };
    setCalculation(calculateBfnDynamicGain(project, request));
  };

  const result = calculation?.ok ? calculation.result : null;
  const outside =
    calculation &&
    !calculation.ok &&
    calculation.networkInfluence &&
    !calculation.networkInfluence.ok &&
    calculation.networkInfluence.calculationIssue?.code === 'outside_recorded_domain'
      ? calculation.networkInfluence.calculationIssue
      : null;
  const outsideModule = outside
    ? (project.network.modules.find((module) => module.id === outside.moduleId) ?? null)
    : null;
  const outsidePort =
    outsideModule && outside
      ? (outsideModule.inputPorts.find((port) => port.id === outside.inputPortId) ?? null)
      : null;

  return (
    <div className="bfn-drawer-layer bfn-dynamic-gain-layer">
      <button
        className="bfn-drawer-scrim"
        type="button"
        aria-label={t('bfn.dynamicGain.close')}
        onClick={onClose}
      />
      <aside
        className="bfn-drawer bfn-local-influence bfn-network-influence bfn-dynamic-gain"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={purposeId}
        onKeyDown={handleKeyDown}
      >
        <header className="bfn-drawer__header">
          <div>
            <span>{t('bfn.dynamicGain.kicker')}</span>
            <h2 id={titleId}>{t('bfn.dynamicGain.title')}</h2>
          </div>
          <button
            ref={closeRef}
            className="bfn-drawer__close"
            type="button"
            aria-label={t('bfn.dynamicGain.close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <form className="bfn-local-influence__body" onSubmit={analyze}>
          <p id={purposeId} className="bfn-local-influence__purpose">
            {t('bfn.dynamicGain.purpose')}
          </p>
          <section className="bfn-local-influence__section">
            <h3>{t('bfn.dynamicGain.object.title')}</h3>
            <dl className="bfn-local-influence__properties">
              <div>
                <dt>{t('bfn.dynamicGain.object.output')}</dt>
                <dd title={bfnNodeDisplayName(monitor, language, t)}>
                  {bfnNodeDisplayName(monitor, language, t)}
                </dd>
              </div>
              <div>
                <dt>{t('bfn.dynamicGain.object.signal')}</dt>
                <dd>
                  {bfnPortPrimaryLabel(monitor.inputPort, t, language)}
                  <small>
                    {bfnQuantityLabel(monitor.inputPort.quantityType, t)} ·{' '}
                    {bfnUnitLabel(monitor.inputPort.unit, t)}
                  </small>
                </dd>
              </div>
            </dl>
          </section>

          <section className="bfn-local-influence__section">
            <h3>{t('bfn.dynamicGain.conditions.title')}</h3>
            <label className="bfn-local-influence__standalone-field">
              <span>{t('bfn.dynamicGain.conditions.period')}</span>
              <div className="bfn-local-influence__value-control">
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={period}
                  aria-label={t('bfn.dynamicGain.conditions.period')}
                  aria-invalid={period.trim().length > 0 && !periodValid ? true : undefined}
                  onChange={(event) => {
                    setPeriod(event.target.value);
                    clearCalculation();
                  }}
                />
                <span>{t('bfn.dynamicGain.conditions.hours')}</span>
              </div>
            </label>
            <div className="bfn-local-influence__table-scroll">
              <table className="bfn-local-influence__table bfn-local-influence__conditions">
                <thead>
                  <tr>
                    <th>{t('bfn.dynamicGain.conditions.input')}</th>
                    <th>{t('bfn.dynamicGain.conditions.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => {
                    const inputId = `bfn-dynamic-gain-${field.source.id}`;
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
                            {t('bfn.dynamicGain.conditions.valueFor', {
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
                              onChange={(event) => {
                                setValues((current) => ({
                                  ...current,
                                  [field.source.id]: event.target.value,
                                }));
                                clearCalculation();
                              }}
                            />
                            <span>{bfnUnitLabel(field.source.outputPort.unit, t)}</span>
                          </div>
                          {invalid ? (
                            <small className="bfn-local-influence__field-error">
                              {t('bfn.dynamicGain.conditions.invalidValue')}
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
              <p>{t('bfn.dynamicGain.conditions.requirement')}</p>
              <Button
                type="submit"
                variant="primary"
                leadingIcon={<Icon name="pulse" size={15} />}
                disabled={!ready}
                {...(!ready ? { disabledReason: t('bfn.dynamicGain.conditions.incomplete') } : {})}
              >
                {t('bfn.dynamicGain.analyze')}
              </Button>
            </div>
          </section>

          {outside ? (
            <section className="bfn-local-influence__message" data-tone="warning" role="status">
              <Icon name="warning" size={16} />
              <div>
                <strong>{t('bfn.dynamicGain.outside.title')}</strong>
                <p>{t('bfn.dynamicGain.outside.description')}</p>
                <ul>
                  <li>
                    {t('bfn.dynamicGain.outside.range', {
                      module: outsideModule
                        ? bfnNodeDisplayName(outsideModule, language, t)
                        : t('bfn.dynamicGain.object.module'),
                      input: outsidePort
                        ? bfnPortPrimaryLabel(outsidePort, t, language)
                        : t('bfn.dynamicGain.conditions.input'),
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
                <strong>{t('bfn.dynamicGain.failure.title')}</strong>
                <p>{t('bfn.dynamicGain.failure.description')}</p>
              </div>
            </section>
          ) : null}

          {result ? (
            <section
              className="bfn-local-influence__results"
              aria-label={t('bfn.dynamicGain.results.title')}
            >
              <header>
                <h3>{t('bfn.dynamicGain.results.title')}</h3>
                <span>{t('bfn.dynamicGain.results.scopeLabel')}</span>
              </header>
              <div className="bfn-local-influence__current-output">
                <span>{t('bfn.dynamicGain.results.baselineOutput')}</span>
                <strong>
                  {numberFormatter.format(result.baselineOutput.value)}
                  <small>{bfnUnitLabel(result.baselineOutput.unit, t)}</small>
                </strong>
                <small>{projectEntityLabel(project, monitor.inputPort.entity, t)}</small>
              </div>
              <div className="bfn-local-influence__table-scroll">
                <table className="bfn-local-influence__table bfn-local-influence__result-table">
                  <thead>
                    <tr>
                      <th>{t('bfn.dynamicGain.results.input')}</th>
                      <th>{t('bfn.dynamicGain.results.gain')}</th>
                      <th>{t('bfn.dynamicGain.results.phase')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.perSource.map((entry) => {
                      const source = project.network.inputSources.find(
                        (candidate) => candidate.id === entry.inputSourceId,
                      );
                      const gainReason = gainReasonKey(entry.dynamicGain);
                      return (
                        <tr key={entry.inputSourceId}>
                          <th
                            scope="row"
                            title={source ? bfnNodeDisplayName(source, language, t) : ''}
                          >
                            {source
                              ? bfnNodeDisplayName(source, language, t)
                              : t('bfn.dynamicGain.conditions.input')}
                            <small>
                              {numberFormatter.format(entry.operatingValue)}{' '}
                              {bfnUnitLabel(entry.operatingUnit, t)}
                            </small>
                          </th>
                          <td className="bfn-local-influence__numeric">
                            {entry.dynamicGain.availability === 'available' ? (
                              <>
                                {numberFormatter.format(entry.dynamicGain.magnitude)}
                                <small>
                                  {bfnUnitLabel(entry.dynamicGain.unit.outputUnit, t)} /{' '}
                                  {bfnUnitLabel(entry.dynamicGain.unit.inputUnit, t)}
                                </small>
                              </>
                            ) : (
                              <>
                                {t('bfn.dynamicGain.unavailable')}
                                {gainReason ? (
                                  <small>{t('bfn.dynamicGain.gainReasons.' + gainReason)}</small>
                                ) : null}
                              </>
                            )}
                          </td>
                          <td className="bfn-local-influence__numeric">
                            {phaseLabel(entry.phase, numberFormatter, t)}
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
                <strong>{t('bfn.dynamicGain.applicability.title')}</strong>
                <p>
                  {t(
                    result.applicability === 'within_recorded_domain'
                      ? 'bfn.dynamicGain.applicability.within'
                      : 'bfn.dynamicGain.applicability.notRecorded',
                  )}
                </p>
              </section>
              {result.contextApplicability.summary === 'mismatch_present' ? (
                <section className="bfn-local-influence__applicability" data-state="context-caveat">
                  <strong>{t('bfn.dynamicGain.context.title')}</strong>
                  <p>{t('bfn.dynamicGain.context.mismatch')}</p>
                </section>
              ) : result.contextApplicability.summary === 'uncertain_or_unavailable' ? (
                <section className="bfn-local-influence__applicability" data-state="context-caveat">
                  <strong>{t('bfn.dynamicGain.context.title')}</strong>
                  <p>{t('bfn.dynamicGain.context.uncertain')}</p>
                </section>
              ) : null}
              <details className="bfn-network-influence__details">
                <summary>{t('bfn.dynamicGain.modelBasis.title')}</summary>
                <p>{t('bfn.dynamicGain.modelBasis.description')}</p>
                {result.moduleTransfers.length ? (
                  <div className="bfn-local-influence__table-scroll">
                    <table className="bfn-local-influence__table bfn-network-influence__basis-table">
                      <thead>
                        <tr>
                          <th>{t('bfn.dynamicGain.modelBasis.module')}</th>
                          <th>{t('bfn.dynamicGain.modelBasis.kind')}</th>
                          <th>{t('bfn.dynamicGain.modelBasis.evidence')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.moduleTransfers.map((transfer) => {
                          const module = project.network.modules.find(
                            (candidate) => candidate.id === transfer.moduleId,
                          );
                          return (
                            <tr key={transfer.moduleId}>
                              <th scope="row">
                                {module
                                  ? bfnNodeDisplayName(module, language, t)
                                  : t('bfn.dynamicGain.object.module')}
                              </th>
                              <td>
                                {t('bfn.dynamicGain.modelBasis.kinds.' + transfer.dynamicKind)}
                              </td>
                              <td>
                                <span
                                  data-evidence-tone={bfnEvidenceTone(
                                    transfer.analysisEvidence.evidenceGrade,
                                  )}
                                >
                                  {t('bfn.evidence.' + transfer.analysisEvidence.evidenceGrade)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>{t('bfn.dynamicGain.modelBasis.direct')}</p>
                )}
                <p>{t('bfn.dynamicGain.modelBasis.nominal')}</p>
              </details>
            </section>
          ) : null}
        </form>
      </aside>
    </div>
  );
}

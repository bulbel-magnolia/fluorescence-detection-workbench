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
import type { BfnFunctionalModule, BfnPort, BfnProject, BfnValidityDomainRange } from '../types';
import type {
  BfnLocalDifferentialGainV1,
  BfnLocalInfluenceCalculationV1,
  BfnLocalInfluenceRequestV1,
  BfnLogElasticityV1,
  BfnResolvedLocalInfluenceTargetV1,
} from './interpretationTypes';
import { calculateBfnLocalInfluence } from './localInfluence';
import { bfnLocalInfluenceDirection } from './localInfluencePresentation';

interface BfnLocalInfluenceDrawerProps {
  project: BfnProject;
  module: BfnFunctionalModule;
  target: BfnResolvedLocalInfluenceTargetV1;
  onClose: () => void;
}

interface AnalysisField {
  readonly port: BfnPort;
  readonly rawValue: string;
  readonly value: number | null;
  readonly valid: boolean;
  readonly range: BfnValidityDomainRange | null;
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

export function BfnLocalInfluenceDrawer({
  project,
  module,
  target,
  onClose,
}: BfnLocalInfluenceDrawerProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const titleId = useId();
  const purposeId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [values, setValues] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(target.inputPorts.map((input) => [input.portId, ''])),
  );
  const [calculation, setCalculation] = useState<BfnLocalInfluenceCalculationV1 | null>(null);
  const domain =
    project.registry.validityDomains.find(({ id }) => id === target.validityDomainId) ?? null;
  const outputPort =
    module.outputPorts.find(({ id }) => id === target.outputPortId) ??
    module.outputPorts[0] ??
    null;
  const fields = useMemo<readonly AnalysisField[]>(
    () =>
      target.inputPorts.flatMap((targetInput) => {
        const port = module.inputPorts.find(({ id }) => id === targetInput.portId);
        if (!port) return [];
        const rawValue = values[port.id] ?? '';
        const parsed = rawValue.trim().length > 0 ? Number(rawValue) : null;
        return [
          {
            port,
            rawValue,
            value: parsed,
            valid: parsed !== null && Number.isFinite(parsed) && parsed >= 0,
            range: domain?.inputRanges.find(({ portId }) => portId === port.id) ?? null,
          },
        ];
      }),
    [domain, module.inputPorts, target.inputPorts, values],
  );
  const ready = fields.length === target.inputPorts.length && fields.every((field) => field.valid);
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
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex=-1])',
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
    if (!ready || !outputPort) return;
    const request: BfnLocalInfluenceRequestV1 = {
      contractVersion: '1.0',
      scope: 'module_static_response',
      moduleId: module.id,
      outputPortId: outputPort.id,
      operatingPoint: fields.map((field) => ({
        portId: field.port.id,
        value: field.value ?? 0,
        unit: field.port.unit,
      })),
    };
    setCalculation(calculateBfnLocalInfluence(project, request));
  };

  const outsideIssues =
    calculation && !calculation.ok
      ? calculation.admission.issues.filter((issue) => issue.code === 'outside_validity_domain')
      : [];
  const result = calculation?.ok ? calculation.result : null;
  return (
    <div className="bfn-drawer-layer bfn-local-influence-layer">
      <button
        className="bfn-drawer-scrim"
        type="button"
        aria-label={t('bfn.localInfluence.close')}
        onClick={onClose}
      />
      <aside
        className="bfn-drawer bfn-local-influence"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={purposeId}
        onKeyDown={handleKeyDown}
      >
        <header className="bfn-drawer__header">
          <div>
            <span>{t('bfn.localInfluence.kicker')}</span>
            <h2 id={titleId}>{t('bfn.localInfluence.title')}</h2>
          </div>
          <button
            ref={closeRef}
            className="bfn-drawer__close"
            type="button"
            aria-label={t('bfn.localInfluence.close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <form className="bfn-local-influence__body" onSubmit={analyze}>
          <p id={purposeId} className="bfn-local-influence__purpose">
            {t('bfn.localInfluence.purpose')}
          </p>
          <section className="bfn-local-influence__section">
            <h3>{t('bfn.localInfluence.object.title')}</h3>
            <dl className="bfn-local-influence__properties">
              <div>
                <dt>{t('bfn.localInfluence.object.module')}</dt>
                <dd title={bfnNodeDisplayName(module, language, t)}>
                  {bfnNodeDisplayName(module, language, t)}
                </dd>
              </div>
              <div>
                <dt>{t('bfn.localInfluence.object.output')}</dt>
                <dd>
                  {outputPort
                    ? projectEntityLabel(project, outputPort.entity, t)
                    : t('bfn.localInfluence.unavailable')}
                  {outputPort ? (
                    <small>
                      {bfnQuantityLabel(outputPort.quantityType, t)} ·{' '}
                      {bfnUnitLabel(outputPort.unit, t)}
                    </small>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>{t('bfn.localInfluence.object.response')}</dt>
                <dd>{t('bfn.localInfluence.families.' + target.responseFamily)}</dd>
              </div>
            </dl>
            {target.interpretationBasis === 'first_order_steady_state_static_response' ? (
              <p className="bfn-local-influence__boundary-note">
                <Icon name="info" size={14} />
                <span>{t('bfn.localInfluence.firstOrder')}</span>
              </p>
            ) : null}
          </section>

          <section className="bfn-local-influence__section">
            <h3>{t('bfn.localInfluence.conditions.title')}</h3>
            <div className="bfn-local-influence__table-scroll">
              <table className="bfn-local-influence__table bfn-local-influence__conditions">
                <thead>
                  <tr>
                    <th>{t('bfn.localInfluence.conditions.input')}</th>
                    <th>{t('bfn.localInfluence.conditions.value')}</th>
                    <th>{t('bfn.localInfluence.conditions.range')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => {
                    const inputId = 'bfn-local-influence-' + field.port.id;
                    const errorId = inputId + '-error';
                    const invalid = field.rawValue.trim().length > 0 && !field.valid;
                    return (
                      <tr key={field.port.id}>
                        <th scope="row" title={bfnPortPrimaryLabel(field.port, t, language)}>
                          {bfnPortPrimaryLabel(field.port, t, language)}
                          <small>{projectEntityLabel(project, field.port.entity, t)}</small>
                        </th>
                        <td>
                          <label className="visually-hidden" htmlFor={inputId}>
                            {t('bfn.localInfluence.conditions.valueFor', {
                              input: bfnPortPrimaryLabel(field.port, t, language),
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
                                setValues((current) => ({ ...current, [field.port.id]: value }));
                                setCalculation(null);
                              }}
                            />
                            <span>{bfnUnitLabel(field.port.unit, t)}</span>
                          </div>
                          {invalid ? (
                            <small id={errorId} className="bfn-local-influence__field-error">
                              {t('bfn.localInfluence.conditions.invalidValue')}
                            </small>
                          ) : null}
                        </td>
                        <td className="bfn-local-influence__range">
                          {field.range
                            ? t('bfn.localInfluence.conditions.rangeValue', {
                                minimum: numberFormatter.format(field.range.minimum),
                                maximum: numberFormatter.format(field.range.maximum),
                                unit: bfnUnitLabel(field.range.unit, t),
                              })
                            : t('bfn.localInfluence.notRecorded')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="bfn-local-influence__command">
              <p>{t('bfn.localInfluence.conditions.requirement')}</p>
              <Button
                type="submit"
                variant="primary"
                leadingIcon={<Icon name="pulse" size={15} />}
                disabled={!ready || !outputPort}
                {...(!ready
                  ? { disabledReason: t('bfn.localInfluence.conditions.incomplete') }
                  : {})}
              >
                {t('bfn.localInfluence.analyze')}
              </Button>
            </div>
          </section>

          {outsideIssues.length ? (
            <section className="bfn-local-influence__message" data-tone="warning" role="status">
              <Icon name="warning" size={16} />
              <div>
                <strong>{t('bfn.localInfluence.outside.title')}</strong>
                <p>{t('bfn.localInfluence.outside.description')}</p>
                <ul>
                  {outsideIssues.map((issue) => {
                    const port = module.inputPorts.find(({ id }) => id === issue.subjectId);
                    return (
                      <li key={issue.subjectId}>
                        {t('bfn.localInfluence.outside.range', {
                          input: port
                            ? bfnPortPrimaryLabel(port, t, language)
                            : t('bfn.localInfluence.conditions.input'),
                          minimum: issue.details?.minimum,
                          maximum: issue.details?.maximum,
                          unit:
                            typeof issue.details?.rangeUnit === 'string'
                              ? bfnUnitLabel(issue.details.rangeUnit, t)
                              : '',
                        })}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ) : calculation && !calculation.ok ? (
            <section className="bfn-local-influence__message" data-tone="warning" role="status">
              <Icon name="warning" size={16} />
              <div>
                <strong>{t('bfn.localInfluence.failure.title')}</strong>
                <p>{t('bfn.localInfluence.failure.description')}</p>
              </div>
            </section>
          ) : null}

          {result && outputPort ? (
            <section
              className="bfn-local-influence__results"
              aria-label={t('bfn.localInfluence.results.title')}
            >
              <header>
                <h3>{t('bfn.localInfluence.results.title')}</h3>
                <span>{t('bfn.localInfluence.results.firstOrderLabel')}</span>
              </header>
              <div className="bfn-local-influence__current-output">
                <span>{t('bfn.localInfluence.results.currentOutput')}</span>
                <strong>
                  {numberFormatter.format(result.outputAtOperatingPoint.value)}
                  <small>{bfnUnitLabel(result.outputAtOperatingPoint.unit, t)}</small>
                </strong>
                <small>{projectEntityLabel(project, outputPort.entity, t)}</small>
              </div>
              <div className="bfn-local-influence__table-scroll">
                <table className="bfn-local-influence__table bfn-local-influence__result-table">
                  <thead>
                    <tr>
                      <th>{t('bfn.localInfluence.results.input')}</th>
                      <th>{t('bfn.localInfluence.results.direction')}</th>
                      <th>{t('bfn.localInfluence.results.gain')}</th>
                      <th>{t('bfn.localInfluence.results.sensitivity')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.perInput.map((influence) => {
                      const port = module.inputPorts.find(({ id }) => id === influence.portId);
                      const direction = bfnLocalInfluenceDirection(influence.localDifferentialGain);
                      const gainReason = gainReasonKey(influence.localDifferentialGain);
                      const elasticityReason = elasticityReasonKey(influence.logElasticity);
                      return (
                        <tr key={influence.portId}>
                          <th
                            scope="row"
                            title={port ? bfnPortPrimaryLabel(port, t, language) : ''}
                          >
                            {port
                              ? bfnPortPrimaryLabel(port, t, language)
                              : t('bfn.localInfluence.conditions.input')}
                            <small>
                              {numberFormatter.format(influence.operatingValue)}{' '}
                              {bfnUnitLabel(influence.operatingUnit, t)}
                            </small>
                          </th>
                          <td data-direction={direction}>
                            {t('bfn.localInfluence.directions.' + direction)}
                          </td>
                          <td className="bfn-local-influence__numeric">
                            {influence.localDifferentialGain.availability === 'available' ? (
                              <>
                                {signedNumberFormatter.format(
                                  influence.localDifferentialGain.value,
                                )}
                                <small>
                                  {bfnUnitLabel(influence.localDifferentialGain.unit.outputUnit, t)}{' '}
                                  /{' '}
                                  {bfnUnitLabel(influence.localDifferentialGain.unit.inputUnit, t)}
                                </small>
                              </>
                            ) : (
                              <>
                                {t('bfn.localInfluence.unavailable')}
                                {gainReason ? (
                                  <small>{t('bfn.localInfluence.gainReasons.' + gainReason)}</small>
                                ) : null}
                              </>
                            )}
                          </td>
                          <td className="bfn-local-influence__numeric">
                            {influence.logElasticity.availability === 'available' ? (
                              signedNumberFormatter.format(influence.logElasticity.value)
                            ) : (
                              <>
                                {t('bfn.localInfluence.sensitivityUnavailable')}
                                {elasticityReason ? (
                                  <small>
                                    {t('bfn.localInfluence.elasticityReasons.' + elasticityReason)}
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
                <strong>{t('bfn.localInfluence.applicability.title')}</strong>
                <p>
                  {t(
                    result.applicability === 'within_recorded_domain'
                      ? 'bfn.localInfluence.applicability.within'
                      : 'bfn.localInfluence.applicability.notRecorded',
                  )}
                </p>
              </section>
              <section className="bfn-local-influence__model-basis">
                <h3>{t('bfn.localInfluence.modelBasis.title')}</h3>
                <div
                  className="bfn-evidence-banner"
                  data-evidence-tone={bfnEvidenceTone(result.target.evidence.evidenceGrade)}
                >
                  <strong>{t('bfn.evidence.' + result.target.evidence.evidenceGrade)}</strong>
                </div>
                <p>{t('bfn.localInfluence.modelBasis.nominal')}</p>
              </section>
            </section>
          ) : null}
        </form>
      </aside>
    </div>
  );
}

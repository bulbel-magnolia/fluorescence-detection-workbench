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
import { calculateBfnLocalAnnApproximation } from './localAnnApproximation';
import { bfnLocalAnnApproximationPrefill } from './localAnnApproximationPresentation';
import type {
  BfnLocalAnnApproximationCalculationV1,
  BfnLocalAnnApproximationIssueV1,
  BfnLocalAnnApproximationRequestV1,
  BfnLocalAnnApproximationResultV1,
} from './localAnnApproximationTypes';
import type { BfnResolvedNetworkInfluenceTargetV1 } from './networkInfluenceTypes';

export type BfnLocalAnnCanvasMode = 'biological' | 'approximation';

interface BfnLocalAnnApproximationDrawerProps {
  project: BfnProject;
  monitor: BfnOutputMonitor;
  target: BfnResolvedNetworkInfluenceTargetV1;
  canvasMode: BfnLocalAnnCanvasMode;
  onCanvasModeChange: (mode: BfnLocalAnnCanvasMode) => void;
  onResultChange: (result: BfnLocalAnnApproximationResultV1 | null) => void;
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

function localFailureKey(issue: BfnLocalAnnApproximationIssueV1 | null): string {
  if (!issue) return 'generic';
  if (issue.code === 'incomplete_local_linearization') {
    if (issue.reason === 'derivative_not_unique') return 'notUnique';
    if (issue.reason === 'derivative_non_finite') return 'nonFinite';
    if (issue.reason === 'derivative_does_not_exist') return 'notDifferentiable';
    return 'unsupportedDerivative';
  }
  if (issue.code === 'incomplete_network_linearization') return 'incompleteNetwork';
  return 'generic';
}

export function BfnLocalAnnApproximationDrawer({
  project,
  monitor,
  target,
  canvasMode,
  onCanvasModeChange,
  onResultChange,
  onClose,
}: BfnLocalAnnApproximationDrawerProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const titleId = useId();
  const purposeId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [values, setValues] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(
      target.inputSources.map((input) => {
        const prefill = bfnLocalAnnApproximationPrefill(project, input.inputSourceId);
        return [input.inputSourceId, prefill === null ? '' : String(prefill)];
      }),
    ),
  );
  const [calculation, setCalculation] = useState<BfnLocalAnnApproximationCalculationV1 | null>(
    null,
  );
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

  const clearResult = (): void => {
    setCalculation(null);
    onResultChange(null);
    onCanvasModeChange('biological');
  };

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

  const generate = (event: FormEvent): void => {
    event.preventDefault();
    if (!ready) return;
    const request: BfnLocalAnnApproximationRequestV1 = {
      contractVersion: '1.0',
      scope: 'network_local_ann_approximation',
      outputMonitorId: monitor.id,
      operatingPoint: fields.map((field) => ({
        inputSourceId: field.source.id,
        value: field.value ?? 0,
        unit: field.source.outputPort.unit,
      })),
    };
    const next = calculateBfnLocalAnnApproximation(project, request);
    setCalculation(next);
    if (next.ok) {
      onResultChange(next.result);
      onCanvasModeChange('approximation');
    } else {
      onResultChange(null);
      onCanvasModeChange('biological');
    }
  };

  const result = calculation?.ok ? calculation.result : null;
  const networkFailure = calculation && !calculation.ok ? calculation.networkInfluence : null;
  const outside =
    networkFailure &&
    !networkFailure.ok &&
    networkFailure.calculationIssue?.code === 'outside_recorded_domain'
      ? networkFailure.calculationIssue
      : null;
  const outsideModule = outside
    ? (project.network.modules.find((module) => module.id === outside.moduleId) ?? null)
    : null;
  const outsidePort =
    outsideModule && outside
      ? (outsideModule.inputPorts.find((port) => port.id === outside.inputPortId) ?? null)
      : null;
  const issue = calculation && !calculation.ok ? calculation.issue : null;
  const issueModule =
    issue?.code === 'incomplete_local_linearization'
      ? (project.network.modules.find((module) => module.id === issue.moduleId) ?? null)
      : null;
  const issueSource =
    issue?.code === 'incomplete_network_linearization'
      ? (project.network.inputSources.find((source) => source.id === issue.inputSourceId) ?? null)
      : null;

  return (
    <div className="bfn-drawer-layer bfn-local-ann-layer">
      <button
        className="bfn-drawer-scrim"
        type="button"
        aria-label={t('bfn.localAnn.close')}
        onClick={onClose}
      />
      <aside
        className="bfn-drawer bfn-local-influence bfn-local-ann"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={purposeId}
        onKeyDown={handleKeyDown}
      >
        <header className="bfn-drawer__header">
          <div>
            <span>{t('bfn.localAnn.kicker')}</span>
            <h2 id={titleId}>{t('bfn.localAnn.title')}</h2>
          </div>
          <button
            ref={closeRef}
            className="bfn-drawer__close"
            type="button"
            aria-label={t('bfn.localAnn.close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <form className="bfn-local-influence__body" onSubmit={generate}>
          <p id={purposeId} className="bfn-local-influence__purpose">
            {t('bfn.localAnn.purpose')}
          </p>
          <section className="bfn-local-influence__section">
            <h3>{t('bfn.localAnn.object.title')}</h3>
            <dl className="bfn-local-influence__properties">
              <div>
                <dt>{t('bfn.localAnn.object.output')}</dt>
                <dd title={bfnNodeDisplayName(monitor, language, t)}>
                  {bfnNodeDisplayName(monitor, language, t)}
                </dd>
              </div>
              <div>
                <dt>{t('bfn.localAnn.object.signal')}</dt>
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
                <span>{t('bfn.localAnn.firstOrder')}</span>
              </p>
            ) : null}
          </section>

          <section className="bfn-local-influence__section">
            <h3>{t('bfn.localAnn.conditions.title')}</h3>
            <div className="bfn-local-influence__table-scroll">
              <table className="bfn-local-influence__table bfn-local-influence__conditions">
                <thead>
                  <tr>
                    <th>{t('bfn.localAnn.conditions.input')}</th>
                    <th>{t('bfn.localAnn.conditions.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => {
                    const inputId = `bfn-local-ann-${field.source.id}`;
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
                            {t('bfn.localAnn.conditions.valueFor', {
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
                                setValues((current) => ({ ...current, [field.source.id]: value }));
                                clearResult();
                              }}
                            />
                            <span>{bfnUnitLabel(field.source.outputPort.unit, t)}</span>
                          </div>
                          {invalid ? (
                            <small id={errorId} className="bfn-local-influence__field-error">
                              {t('bfn.localAnn.conditions.invalidValue')}
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
              <p>{t('bfn.localAnn.conditions.requirement')}</p>
              <Button
                type="submit"
                variant="primary"
                leadingIcon={<Icon name="pulse" size={15} />}
                disabled={!ready}
                {...(!ready ? { disabledReason: t('bfn.localAnn.conditions.incomplete') } : {})}
              >
                {t('bfn.localAnn.generate')}
              </Button>
            </div>
          </section>

          {outside ? (
            <section className="bfn-local-influence__message" data-tone="warning" role="status">
              <Icon name="warning" size={16} />
              <div>
                <strong>{t('bfn.localAnn.outside.title')}</strong>
                <p>{t('bfn.localAnn.outside.description')}</p>
                <ul>
                  <li>
                    {t('bfn.localAnn.outside.range', {
                      module: outsideModule
                        ? bfnNodeDisplayName(outsideModule, language, t)
                        : t('bfn.localAnn.object.module'),
                      input: outsidePort
                        ? bfnPortPrimaryLabel(outsidePort, t, language)
                        : t('bfn.localAnn.conditions.input'),
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
                <strong>{t('bfn.localAnn.failure.title')}</strong>
                <p>{t(`bfn.localAnn.failure.${localFailureKey(issue)}`)}</p>
                {issueModule ? (
                  <small>
                    {t('bfn.localAnn.failure.module', {
                      module: bfnNodeDisplayName(issueModule, language, t),
                    })}
                  </small>
                ) : issueSource ? (
                  <small>
                    {t('bfn.localAnn.failure.input', {
                      input: bfnNodeDisplayName(issueSource, language, t),
                    })}
                  </small>
                ) : null}
              </div>
            </section>
          ) : null}

          {result ? (
            <section
              className="bfn-local-influence__results bfn-local-ann__results"
              aria-label={t('bfn.localAnn.results.title')}
            >
              <header>
                <h3>{t('bfn.localAnn.results.title')}</h3>
                <span>{t('bfn.localAnn.results.scopeLabel')}</span>
              </header>

              <div
                className="bfn-local-ann__view-switch"
                role="group"
                aria-label={t('bfn.localAnn.view.label')}
              >
                <button
                  type="button"
                  aria-pressed={canvasMode === 'biological'}
                  onClick={() => onCanvasModeChange('biological')}
                >
                  {t('bfn.localAnn.view.biological')}
                </button>
                <button
                  type="button"
                  aria-pressed={canvasMode === 'approximation'}
                  onClick={() => onCanvasModeChange('approximation')}
                >
                  {t('bfn.localAnn.view.approximation')}
                </button>
              </div>

              <p className="bfn-local-ann__local-boundary">
                <Icon name="info" size={15} />
                <span>{t('bfn.localAnn.results.localBoundary')}</span>
              </p>

              <div className="bfn-local-ann__summary">
                <div>
                  <span>{t('bfn.localAnn.results.currentOutput')}</span>
                  <strong>{numberFormatter.format(result.outputAtOperatingPoint.value)}</strong>
                  <small>{bfnUnitLabel(result.outputAtOperatingPoint.unit, t)}</small>
                </div>
                <div>
                  <span>{t('bfn.localAnn.results.bias')}</span>
                  <strong>
                    {signedNumberFormatter.format(result.networkApproximation.bias.value)}
                  </strong>
                  <small>{bfnUnitLabel(result.networkApproximation.bias.unit, t)}</small>
                </div>
              </div>

              <section className="bfn-local-ann__network-weights">
                <h4>{t('bfn.localAnn.results.networkWeights')}</h4>
                <div className="bfn-local-influence__table-scroll">
                  <table className="bfn-local-influence__table">
                    <thead>
                      <tr>
                        <th>{t('bfn.localAnn.results.input')}</th>
                        <th>{t('bfn.localAnn.results.operatingValue')}</th>
                        <th>{t('bfn.localAnn.results.weight')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.networkApproximation.sourceWeights.map((sourceWeight) => {
                        const source = project.network.inputSources.find(
                          (candidate) => candidate.id === sourceWeight.inputSourceId,
                        );
                        return (
                          <tr key={sourceWeight.inputSourceId}>
                            <th scope="row">
                              {source
                                ? bfnNodeDisplayName(source, language, t)
                                : t('bfn.localAnn.conditions.input')}
                            </th>
                            <td className="bfn-local-influence__numeric">
                              {numberFormatter.format(sourceWeight.operatingValue)}
                              <small>{bfnUnitLabel(sourceWeight.operatingUnit, t)}</small>
                            </td>
                            <td className="bfn-local-influence__numeric">
                              {signedNumberFormatter.format(sourceWeight.weight.value)}
                              <small>
                                {bfnUnitLabel(sourceWeight.weight.unit.outputUnit, t)} /{' '}
                                {bfnUnitLabel(sourceWeight.weight.unit.inputUnit, t)}
                              </small>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section
                className="bfn-local-influence__applicability"
                data-state={result.applicability}
              >
                <strong>{t('bfn.localAnn.applicability.title')}</strong>
                <p>
                  {t(
                    result.applicability === 'within_recorded_domain'
                      ? 'bfn.localAnn.applicability.within'
                      : 'bfn.localAnn.applicability.notRecorded',
                  )}
                </p>
              </section>
              {result.contextApplicability.summary === 'mismatch_present' ? (
                <section className="bfn-local-influence__applicability" data-state="context-caveat">
                  <strong>{t('bfn.localAnn.context.title')}</strong>
                  <p>{t('bfn.localAnn.context.mismatch')}</p>
                </section>
              ) : result.contextApplicability.summary === 'uncertain_or_unavailable' ? (
                <section className="bfn-local-influence__applicability" data-state="context-caveat">
                  <strong>{t('bfn.localAnn.context.title')}</strong>
                  <p>{t('bfn.localAnn.context.uncertain')}</p>
                </section>
              ) : null}

              {target.directTransmission ? (
                <p className="bfn-local-influence__boundary-note">
                  <Icon name="info" size={14} />
                  <span>{t('bfn.localAnn.directTransmission')}</span>
                </p>
              ) : result.moduleApproximations.length ? (
                <section className="bfn-local-ann__modules">
                  <h4>{t('bfn.localAnn.modules.title')}</h4>
                  <div className="bfn-local-influence__table-scroll">
                    <table className="bfn-local-influence__table bfn-local-ann__module-table">
                      <thead>
                        <tr>
                          <th>{t('bfn.localAnn.modules.module')}</th>
                          <th>{t('bfn.localAnn.modules.input')}</th>
                          <th>{t('bfn.localAnn.modules.operatingValue')}</th>
                          <th>{t('bfn.localAnn.modules.weight')}</th>
                          <th>{t('bfn.localAnn.modules.bias')}</th>
                          <th>{t('bfn.localAnn.modules.currentOutput')}</th>
                        </tr>
                      </thead>
                      {result.moduleApproximations.map((approximation) => {
                        const module = project.network.modules.find(
                          (candidate) => candidate.id === approximation.moduleId,
                        );
                        const moduleLabel = module
                          ? bfnNodeDisplayName(module, language, t)
                          : t('bfn.localAnn.object.module');
                        return (
                          <tbody key={approximation.moduleId}>
                            {approximation.inputWeights.map((inputWeight, index) => {
                              const port = module?.inputPorts.find(
                                (candidate) => candidate.id === inputWeight.inputPortId,
                              );
                              return (
                                <tr key={inputWeight.inputPortId}>
                                  {index === 0 ? (
                                    <th
                                      scope="rowgroup"
                                      rowSpan={approximation.inputWeights.length}
                                    >
                                      {moduleLabel}
                                    </th>
                                  ) : null}
                                  <th scope="row">
                                    {port
                                      ? bfnPortPrimaryLabel(port, t, language)
                                      : t('bfn.localAnn.modules.input')}
                                  </th>
                                  <td className="bfn-local-influence__numeric">
                                    {numberFormatter.format(inputWeight.operatingValue)}
                                    <small>{bfnUnitLabel(inputWeight.operatingUnit, t)}</small>
                                  </td>
                                  <td className="bfn-local-influence__numeric">
                                    {signedNumberFormatter.format(inputWeight.weight.value)}
                                    <small>
                                      {bfnUnitLabel(inputWeight.weight.unit.outputUnit, t)} /{' '}
                                      {bfnUnitLabel(inputWeight.weight.unit.inputUnit, t)}
                                    </small>
                                  </td>
                                  {index === 0 ? (
                                    <>
                                      <td
                                        className="bfn-local-influence__numeric"
                                        rowSpan={approximation.inputWeights.length}
                                      >
                                        {signedNumberFormatter.format(approximation.bias.value)}
                                        <small>{bfnUnitLabel(approximation.bias.unit, t)}</small>
                                      </td>
                                      <td
                                        className="bfn-local-influence__numeric"
                                        rowSpan={approximation.inputWeights.length}
                                      >
                                        {numberFormatter.format(
                                          approximation.outputAtOperatingPoint.value,
                                        )}
                                        <small>
                                          {bfnUnitLabel(
                                            approximation.outputAtOperatingPoint.unit,
                                            t,
                                          )}
                                        </small>
                                      </td>
                                    </>
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        );
                      })}
                    </table>
                  </div>
                </section>
              ) : null}

              <details className="bfn-local-ann__basis">
                <summary>{t('bfn.localAnn.analysisBasis.title')}</summary>
                <p>{t('bfn.localAnn.analysisBasis.description')}</p>
                {result.moduleApproximations.length ? (
                  <div className="bfn-local-influence__table-scroll">
                    <table className="bfn-local-influence__table">
                      <thead>
                        <tr>
                          <th>{t('bfn.localAnn.analysisBasis.module')}</th>
                          <th>{t('bfn.localAnn.analysisBasis.response')}</th>
                          <th>{t('bfn.localAnn.analysisBasis.evidence')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.moduleApproximations.map((approximation) => {
                          const module = project.network.modules.find(
                            (candidate) => candidate.id === approximation.moduleId,
                          );
                          return (
                            <tr key={approximation.moduleId}>
                              <th scope="row">
                                {module
                                  ? bfnNodeDisplayName(module, language, t)
                                  : t('bfn.localAnn.object.module')}
                              </th>
                              <td>
                                {t(
                                  `bfn.localAnn.modules.basis.${approximation.interpretationBasis}`,
                                )}
                                <small>{approximation.staticModelVersion}</small>
                              </td>
                              <td>
                                <span
                                  data-evidence-tone={bfnEvidenceTone(
                                    approximation.evidence.evidenceGrade,
                                  )}
                                >
                                  {t('bfn.evidence.' + approximation.evidence.evidenceGrade)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>{t('bfn.localAnn.analysisBasis.direct')}</p>
                )}
                <p>{t('bfn.localAnn.analysisBasis.nominal')}</p>
              </details>
            </section>
          ) : null}
        </form>
      </aside>
    </div>
  );
}

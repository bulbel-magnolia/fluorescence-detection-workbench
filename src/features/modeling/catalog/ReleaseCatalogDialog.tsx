import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';
import type { LiteratureCandidateReference } from './catalogTypes';
import {
  filterReleaseCatalogComponents,
  getReleaseCatalogFilterOptions,
  type ReleaseCatalogLanguage,
  type ReleaseCatalogPresentation,
  type ReleaseCatalogUsageStatus,
  type ReleaseComponentView,
  type ReleaseResponseVariantView,
  type ReleaseSignalView,
} from './releaseCatalogPresentation';
import './release-catalog.css';

export interface ReleaseCatalogDialogProps {
  open: boolean;
  presentation: ReleaseCatalogPresentation | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
  selectedNodeName?: string;
  selectedReference?: LiteratureCandidateReference;
  unavailableMessage?: string;
  onClose: () => void;
  onApply: (responseView: ReleaseResponseVariantView) => void;
  onAttachCitation: (componentView: ReleaseComponentView) => void;
  onDetach: () => void;
}

interface Filters {
  query: string;
  usageStatus: ReleaseCatalogUsageStatus | 'all';
  inputMolecule: string;
  host: string;
}

const EMPTY_FILTERS: Filters = {
  query: '',
  usageStatus: 'all',
  inputMolecule: 'all',
  host: 'all',
};

function currentLanguage(value: string | undefined): ReleaseCatalogLanguage {
  return value === 'en-US' ? 'en-US' : 'zh-CN';
}

function signalName(signal: ReleaseSignalView, language: ReleaseCatalogLanguage): string {
  return language === 'zh-CN' ? signal.names.zh : signal.names.en;
}

function componentName(
  component: ReleaseComponentView,
  language: ReleaseCatalogLanguage,
): string {
  return language === 'zh-CN' ? component.names.zh : component.names.en;
}

function formatScientific(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 10000)) {
    return value.toExponential(3);
  }
  return String(Number(value.toPrecision(5)));
}

function isFocusable(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  const closedDetails = element.closest('details:not([open])');
  return !closedDetails || (element.tagName === 'SUMMARY' && element.parentElement === closedDetails);
}

export function ReleaseCatalogDialog({
  open,
  presentation,
  triggerRef,
  selectedNodeName,
  selectedReference,
  unavailableMessage,
  onClose,
  onApply,
  onAttachCitation,
  onDetach,
}: ReleaseCatalogDialogProps): JSX.Element | null {
  const { t, i18n } = useTranslation();
  const language = currentLanguage(i18n.resolvedLanguage ?? i18n.language);
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setFilters(EMPTY_FILTERS);
    setSelectedComponentId(null);
    setSelectedResponseId(null);
  }, [open]);

  const filterOptions = useMemo(
    () => (presentation ? getReleaseCatalogFilterOptions(presentation) : null),
    [presentation],
  );
  const results = useMemo(
    () =>
      presentation
        ? filterReleaseCatalogComponents(presentation, {
            query: filters.query,
            usageStatus: filters.usageStatus,
            ...(filters.inputMolecule === 'all'
              ? {}
              : { inputMolecule: filters.inputMolecule }),
            ...(filters.host === 'all' ? {} : { host: filters.host }),
          })
        : [],
    [filters, presentation],
  );
  const selectedComponent =
    presentation?.components.find((item) => item.id === selectedComponentId) ?? null;
  const responses = useMemo(
    () =>
      selectedComponent
        ? [...selectedComponent.responseVariants].sort(
            (left, right) => Number(right.runnable) - Number(left.runnable),
          )
        : [],
    [selectedComponent],
  );
  const selectedResponse =
    responses.find((item) => item.id === selectedResponseId) ?? null;

  useEffect(() => {
    if (!open || results.length === 0) {
      setSelectedComponentId(null);
      return;
    }
    if (!results.some((item) => item.id === selectedComponentId))
      setSelectedComponentId(results[0]!.id);
  }, [open, results, selectedComponentId]);

  useEffect(() => {
    if (responses.length === 0) {
      setSelectedResponseId(null);
      return;
    }
    if (!responses.some((item) => item.id === selectedResponseId))
      setSelectedResponseId(
        responses.find((item) => item.runnable)?.id ?? responses[0]!.id,
      );
  }, [responses, selectedResponseId]);

  useEffect(() => {
    if (!open) return undefined;
    headingRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary,[tabindex]:not([tabindex=-1])',
        ),
      ).filter(isFocusable);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open, triggerRef]);

  if (!open) return null;

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(
      resultListRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-release-component-button]',
      ) ?? [],
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % buttons.length
            : (current - 1 + buttons.length) % buttons.length;
    buttons[index]!.click();
    buttons[index]!.focus();
  };

  return createPortal(
    <div className="release-catalog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="release-catalog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-catalog-title"
        aria-describedby="release-catalog-description"
      >
        <DialogHeader
          presentation={presentation}
          selectedNodeName={selectedNodeName}
          headingRef={headingRef}
          onClose={onClose}
        />
        {!presentation ? (
          <div className="release-catalog-unavailable" role="status">
            <Icon name="warning" size={24} />
            <strong>{t('modeling.releaseCatalog.unavailableTitle')}</strong>
            <p>{unavailableMessage ?? t('modeling.releaseCatalog.unavailableMessage')}</p>
          </div>
        ) : (
          <>
            <FilterBar
              filters={filters}
              language={language}
              options={filterOptions!}
              onChange={setFilters}
            />
            <div className="release-catalog-dialog__body">
              <ResultList
                results={results}
                language={language}
                selectedId={selectedComponentId}
                resultListRef={resultListRef}
                onSelect={setSelectedComponentId}
                onKeyDown={handleListKeyDown}
              />
              <ComponentDetail
                component={selectedComponent}
                responses={responses}
                selectedResponseId={selectedResponseId}
                language={language}
                onSelectResponse={setSelectedResponseId}
              />
            </div>
            <ActionBar
              component={selectedComponent}
              response={selectedResponse}
              selectedNodeName={selectedNodeName}
              selectedReference={selectedReference}
              onApply={onApply}
              onAttachCitation={onAttachCitation}
              onDetach={onDetach}
            />
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}

function DialogHeader({
  presentation,
  selectedNodeName,
  headingRef,
  onClose,
}: {
  presentation: ReleaseCatalogPresentation | null;
  selectedNodeName: string | undefined;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <header className="release-catalog-dialog__header">
      <div>
        <p className="panel-kicker">{t('modeling.releaseCatalog.kicker')}</p>
        <h2 id="release-catalog-title" ref={headingRef} tabIndex={-1}>
          {t('modeling.releaseCatalog.title')}
        </h2>
        <p id="release-catalog-description">
          {selectedNodeName
            ? t('modeling.releaseCatalog.forNode', { node: selectedNodeName })
            : t('modeling.releaseCatalog.description')}
        </p>
        {presentation ? (
          <span className="release-catalog-dialog__release">
            {t('modeling.releaseCatalog.releaseSummary', {
              version: presentation.catalog.releaseManifest.releaseVersion,
              components: presentation.components.length,
              responses: presentation.responseVariants.length,
              runnable: presentation.responseVariants.filter((response) => response.runnable)
                .length,
            })}
          </span>
        ) : null}
      </div>
      <button
        className="dialog-close"
        type="button"
        aria-label={t('modeling.releaseCatalog.close')}
        onClick={onClose}
      >
        ×
      </button>
    </header>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly FilterOption[];
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterBar(props: {
  filters: Filters;
  language: ReleaseCatalogLanguage;
  options: ReturnType<typeof getReleaseCatalogFilterOptions>;
  onChange: (filters: Filters) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { filters, language, options, onChange } = props;
  const all = { value: 'all', label: t('modeling.releaseCatalog.all') };
  const clearFilters = (): void => onChange(EMPTY_FILTERS);
  return (
    <section className="release-catalog-filters" aria-label={t('modeling.releaseCatalog.filters')}>
      <input
        aria-label={t('modeling.releaseCatalog.search')}
        placeholder={t('modeling.releaseCatalog.searchPlaceholder')}
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
      />
      <FilterSelect
        label={t('modeling.releaseCatalog.statusFilter')}
        value={filters.usageStatus}
        options={[all, ...options.usageStatuses.map((status) => ({
          value: status,
          label: t(`modeling.releaseCatalog.statuses.${status}`),
        }))]}
        onChange={(value) =>
          onChange({ ...filters, usageStatus: value as Filters['usageStatus'] })
        }
      />
      <FilterSelect
        label={t('modeling.releaseCatalog.inputFilter')}
        value={filters.inputMolecule}
        options={[all, ...options.inputMolecules.map((signal) => ({
          value: signal.id,
          label: signalName(signal, language),
        }))]}
        onChange={(value) => onChange({ ...filters, inputMolecule: value })}
      />
      <FilterSelect
        label={t('modeling.releaseCatalog.hostFilter')}
        value={filters.host}
        options={[all, ...options.hosts.map((host) => ({ value: host, label: host }))]}
        onChange={(value) => onChange({ ...filters, host: value })}
      />
      <button className="button button--secondary" type="button" onClick={clearFilters}>
        {t('modeling.releaseCatalog.clearFilters')}
      </button>
    </section>
  );
}

function ResultList({
  results,
  language,
  selectedId,
  resultListRef,
  onSelect,
  onKeyDown,
}: {
  results: readonly ReleaseComponentView[];
  language: ReleaseCatalogLanguage;
  selectedId: string | null;
  resultListRef: RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <section
      className="release-catalog-results"
      aria-labelledby="release-catalog-results-title"
    >
      <header>
        <h3 id="release-catalog-results-title">
          {t('modeling.releaseCatalog.resultList')}
        </h3>
        <span>{t('modeling.releaseCatalog.resultCount', { count: results.length })}</span>
      </header>
      <div
        ref={resultListRef}
        className="release-catalog-results__list"
        role="listbox"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {results.length === 0 ? (
          <div className="release-catalog-empty" role="status">
            <strong>{t('modeling.releaseCatalog.noResults')}</strong>
            <span>{t('modeling.releaseCatalog.noResultsHint')}</span>
          </div>
        ) : (
          results.map((component) => {
            const runnableCount = component.responseVariants.filter(
              (response) => response.runnable,
            ).length;
            return (
              <button
                key={component.id}
                type="button"
                role="option"
                aria-selected={component.id === selectedId}
                className={
                  component.id === selectedId
                    ? 'release-catalog-result is-selected'
                    : 'release-catalog-result'
                }
                data-release-component-button
                onClick={() => onSelect(component.id)}
              >
                <span className="release-catalog-result__topline">
                  <span className={'status-chip status-chip--' + component.usageStatus}>
                    {t('modeling.releaseCatalog.statuses.' + component.usageStatus)}
                  </span>
                  <span>{t('modeling.releaseCatalog.' + component.role)}</span>
                </span>
                <strong>{componentName(component, language)}</strong>
                <code>{component.id}</code>
                <span className="release-catalog-result__signals">
                  {component.inputMolecules.length > 0
                    ? component.inputMolecules
                        .map((signal) => signalName(signal, language))
                        .join(' · ')
                    : t('modeling.releaseCatalog.noInput')}
                </span>
                <span className="release-catalog-result__meta">
                  {t('modeling.releaseCatalog.runnableCount', {
                    runnable: runnableCount,
                    total: component.responseVariants.length,
                  })}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function ComponentDetail({
  component,
  responses,
  selectedResponseId,
  language,
  onSelectResponse,
}: {
  component: ReleaseComponentView | null;
  responses: readonly ReleaseResponseVariantView[];
  selectedResponseId: string | null;
  language: ReleaseCatalogLanguage;
  onSelectResponse: (id: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  if (!component) {
    return (
      <section className="release-catalog-detail release-catalog-empty" role="status">
        <strong>{t('modeling.releaseCatalog.selectCandidate')}</strong>
      </section>
    );
  }
  const selectedResponse =
    responses.find((response) => response.id === selectedResponseId) ?? null;
  return (
    <section className="release-catalog-detail" aria-labelledby="release-component-title">
      <header className="release-catalog-detail__header">
        <div>
          <span className={'status-chip status-chip--' + component.usageStatus}>
            {t('modeling.releaseCatalog.statuses.' + component.usageStatus)}
          </span>
          <h3 id="release-component-title">{componentName(component, language)}</h3>
          <code>{component.id}</code>
        </div>
        <span className="release-catalog-detail__role">
          {t('modeling.releaseCatalog.' + component.role)}
        </span>
      </header>

      <dl className="release-catalog-facts">
        <div>
          <dt>{t('modeling.releaseCatalog.host')}</dt>
          <dd>
            {[component.hostSpecies, component.hostStrain].filter(Boolean).join(' · ') ||
              t('modeling.releaseCatalog.unknown')}
          </dd>
        </div>
        <div>
          <dt>{t('modeling.releaseCatalog.inputMolecule')}</dt>
          <dd>
            {component.inputMolecules.length > 0
              ? component.inputMolecules
                  .map((signal) => signalName(signal, language))
                  .join(' · ')
              : t('modeling.releaseCatalog.noInput')}
          </dd>
        </div>
        <div>
          <dt>{t('modeling.releaseCatalog.outputMolecule')}</dt>
          <dd>
            {component.outputMolecules.length > 0
              ? component.outputMolecules
                  .map((signal) => signalName(signal, language))
                  .join(' · ')
              : t('modeling.releaseCatalog.unknown')}
          </dd>
        </div>
      </dl>

      <div className="release-response-section">
        <div className="release-response-section__heading">
          <div>
            <h4>{t('modeling.releaseCatalog.responses')}</h4>
            <p>{t('modeling.releaseCatalog.responsesHelp')}</p>
          </div>
          <span>{t('modeling.releaseCatalog.responseCount', { count: responses.length })}</span>
        </div>
        {responses.length === 0 ? (
          <p className="release-catalog-muted">{t('modeling.releaseCatalog.noResponses')}</p>
        ) : (
          <div className="release-response-options" role="radiogroup">
            {responses.map((response) => (
              <label
                key={response.id}
                className={
                  response.id === selectedResponseId
                    ? 'release-response-option is-selected'
                    : 'release-response-option'
                }
              >
                <input
                  type="radio"
                  name="release-response"
                  checked={response.id === selectedResponseId}
                  onChange={() => onSelectResponse(response.id)}
                />
                <span>
                  <strong>
                    {signalName(response.inputMolecule, language)}
                    {' → '}
                    {response.outputMolecule
                      ? signalName(response.outputMolecule, language)
                      : t('modeling.releaseCatalog.notReported')}
                  </strong>
                  <code>{response.id}</code>
                </span>
                <span
                  className={
                    response.runnable
                      ? 'response-availability is-runnable'
                      : 'response-availability'
                  }
                >
                  {response.runnable
                    ? t('modeling.releaseCatalog.runnable')
                    : t('modeling.releaseCatalog.statuses.' + response.usageStatus)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {selectedResponse ? (
        <ResponseDetails response={selectedResponse} language={language} />
      ) : null}

      <details className="release-catalog-disclosure">
        <summary>{t('modeling.releaseCatalog.evidenceTitle')}</summary>
        <dl className="release-catalog-facts">
          <div>
            <dt>{t('modeling.releaseCatalog.sequenceStatus')}</dt>
            <dd>{component.sequenceStatus || t('modeling.releaseCatalog.unknown')}</dd>
          </div>
          <div>
            <dt>{t('modeling.releaseCatalog.sequenceReference')}</dt>
            <dd>{component.sequenceReference || t('modeling.releaseCatalog.unknown')}</dd>
          </div>
        </dl>
        <ul>
          {(component.evidenceGaps.length > 0
            ? component.evidenceGaps
            : [t('modeling.releaseCatalog.noEvidenceGaps')]
          ).map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      </details>

      {component.observedPairs.length > 0 ? (
        <details className="release-catalog-disclosure">
          <summary>
            {t('modeling.releaseCatalog.pairsTitle', {
              count: component.observedPairs.length,
            })}
          </summary>
          <p className="release-boundary-note">
            {t('modeling.releaseCatalog.pairBoundary')}
          </p>
          <ul>
            {component.observedPairs.map((pair) => (
              <li key={pair.id}>
                <code>{pair.id}</code>
                <span>{pair.observedEffect || pair.responseClass}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {component.compatibilityRelations.length > 0 ? (
        <details className="release-catalog-disclosure">
          <summary>
            {t('modeling.releaseCatalog.compatibilityTitle', {
              count: component.compatibilityRelations.length,
            })}
          </summary>
          <p className="release-boundary-note">
            {t('modeling.releaseCatalog.compatibilityBoundary')}
          </p>
          <ul>
            {component.compatibilityRelations.map((relation) => (
              <li key={relation.id}>
                <code>{relation.id}</code>
                <span>{relation.qualitativeOutcome || relation.relationType}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function ResponseDetails({
  response,
  language,
}: {
  response: ReleaseResponseVariantView;
  language: ReleaseCatalogLanguage;
}): JSX.Element {
  const { t } = useTranslation();
  const sourceResponse = response.response.sourceResponse;
  const workingRange = sourceResponse?.workingRange;
  const context = response.parameterContext;
  return (
    <article className="release-response-detail">
      <header>
        <h4>{t('modeling.releaseCatalog.responseDetails')}</h4>
        <span className={response.runnable ? 'is-runnable' : undefined}>
          {response.runnable
            ? t('modeling.releaseCatalog.runnable')
            : t('modeling.releaseCatalog.statuses.' + response.usageStatus)}
        </span>
      </header>
      <p className="release-boundary-note">
        {response.runnable
          ? t('modeling.releaseCatalog.runnableBoundary')
          : t('modeling.releaseCatalog.notRunnableBoundary')}
      </p>
      <dl className="release-catalog-facts release-catalog-facts--response">
        <div>
          <dt>{t('modeling.releaseCatalog.inputMolecule')}</dt>
          <dd>{signalName(response.inputMolecule, language)}</dd>
        </div>
        <div>
          <dt>{t('modeling.releaseCatalog.outputMolecule')}</dt>
          <dd>
            {response.outputMolecule
              ? signalName(response.outputMolecule, language)
              : t('modeling.releaseCatalog.unknown')}
          </dd>
        </div>
        <div>
          <dt>{t('modeling.releaseCatalog.direction')}</dt>
          <dd>{sourceResponse?.direction || t('modeling.releaseCatalog.unknown')}</dd>
        </div>
        <div>
          <dt>{t('modeling.releaseCatalog.model')}</dt>
          <dd>{sourceResponse?.modelType || t('modeling.releaseCatalog.unknown')}</dd>
        </div>
        <div>
          <dt>{t('modeling.releaseCatalog.ec50')}</dt>
          <dd>
            {formatScientific(sourceResponse?.ec50)}
            {sourceResponse?.ec50Unit ? ' ' + sourceResponse.ec50Unit : ''}
          </dd>
        </div>
        <div>
          <dt>{t('modeling.releaseCatalog.hill')}</dt>
          <dd>{formatScientific(sourceResponse?.hillCoefficient)}</dd>
        </div>
        <div>
          <dt>{t('modeling.releaseCatalog.range')}</dt>
          <dd>
            {workingRange
              ? formatScientific(workingRange.min) +
                ' – ' +
                formatScientific(workingRange.max) +
                (workingRange.unit ? ' ' + workingRange.unit : '')
              : t('modeling.releaseCatalog.unknown')}
          </dd>
        </div>
        <div>
          <dt>{t('modeling.releaseCatalog.context')}</dt>
          <dd>
            {[context.hostSpecies, context.hostStrain].filter(Boolean).join(' · ') ||
              context.id}
          </dd>
        </div>
      </dl>
      <div className="release-source-list">
        <h5>{t('modeling.releaseCatalog.sourcesTitle')}</h5>
        {response.sources.map((source) => {
          const sourceUrl =
            source.primaryUrl ??
            (source.doi
              ? 'https://doi.org/' + source.doi
              : source.pmid
                ? 'https://pubmed.ncbi.nlm.nih.gov/' + source.pmid
                : null);
          return sourceUrl ? (
            <a
              key={source.id}
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              title={t('modeling.releaseCatalog.openSource')}
            >
              <span>{source.title}</span>
              <small>
                {[source.authors, source.year].filter(Boolean).join(' · ')}
              </small>
            </a>
          ) : (
            <span key={source.id}>
              <span>{source.title}</span>
              <small>
                {[source.authors, source.year].filter(Boolean).join(' · ')}
              </small>
            </span>
          );
        })}
      </div>
    </article>
  );
}

function ActionBar({
  component,
  response,
  selectedNodeName,
  selectedReference,
  onApply,
  onAttachCitation,
  onDetach,
}: {
  component: ReleaseComponentView | null;
  response: ReleaseResponseVariantView | null;
  selectedNodeName: string | undefined;
  selectedReference: LiteratureCandidateReference | undefined;
  onApply: (responseView: ReleaseResponseVariantView) => void;
  onAttachCitation: (componentView: ReleaseComponentView) => void;
  onDetach: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <footer className="release-catalog-actions">
      <p>{t('modeling.releaseCatalog.publicBoundary')}</p>
      <div>
        {selectedReference ? (
          <button className="button button--secondary" type="button" onClick={onDetach}>
            {t('modeling.releaseCatalog.detachCitation')}
          </button>
        ) : (
          <button
            className="button button--secondary"
            type="button"
            disabled={!selectedNodeName || !component}
            onClick={() => {
              if (component) onAttachCitation(component);
            }}
          >
            {t('modeling.releaseCatalog.attachCitation')}
          </button>
        )}
        <button
          className="button button--primary release-catalog-actions__primary"
          type="button"
          disabled={!response?.runnable}
          onClick={() => {
            if (response?.runnable) onApply(response);
          }}
        >
          {t('modeling.releaseCatalog.applyToNetwork')}
        </button>
      </div>
    </footer>
  );
}

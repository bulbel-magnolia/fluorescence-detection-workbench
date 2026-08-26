import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import {
  loadReleaseCatalogPresentation,
  type ReleaseCatalogLanguage,
  type ReleaseCatalogPresentation,
} from '../../modeling/catalog/releaseCatalogPresentation';
import { bfnModuleCatalog, createCatalogModule, type BfnCatalogModuleId } from '../fixtures';
import { resolveEffectiveBfnModel } from '../modelResolution';
import { bfnEvidenceTone, bfnModuleFlowLabel } from '../presentation';
import type { BfnProject } from '../types';
import {
  bfnCatalogSignalDisplayName,
  buildBfnCatalogDiscoveryModel,
  queryBfnCatalogDiscovery,
  type BfnCatalogDiscoveryGroup,
  type BfnCatalogDiscoveryModel,
  type BfnCatalogDiscoveryQueryResult,
  type BfnCatalogDiscoveryResponse,
  type BfnCatalogDiscoveryStatus,
  type BfnCatalogDiscoveryStatusFilter,
} from './catalogDiscovery';

interface BfnCatalogDiscoveryDrawerProps {
  project: BfnProject;
  onClose: () => void;
  onAddBuiltInModule: (catalogId: BfnCatalogModuleId) => void;
  presentationLoader?: () => ReleaseCatalogPresentation;
}

type SelectedEntry =
  { kind: 'response'; groupId: string; responseId: string } | { kind: 'sender'; groupId: string };

export function BfnCatalogDiscoveryDrawer({
  project,
  onClose,
  onAddBuiltInModule,
  presentationLoader = loadReleaseCatalogPresentation,
}: BfnCatalogDiscoveryDrawerProps) {
  const { i18n } = useTranslation();
  const language = releaseLanguage(i18n.resolvedLanguage ?? i18n.language);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<BfnCatalogDiscoveryStatusFilter | 'all'>('all');
  const [inputSignalId, setInputSignalId] = useState('all');
  const [host, setHost] = useState('all');
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [autoCollapsedGroupId, setAutoCollapsedGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedEntry | null>(null);
  const loadResult = useMemo(() => {
    try {
      return { model: buildBfnCatalogDiscoveryModel(presentationLoader()), error: false } as const;
    } catch {
      return { model: null, error: true } as const;
    }
  }, [presentationLoader]);
  const result = useMemo(
    () =>
      loadResult.model
        ? queryBfnCatalogDiscovery(loadResult.model, { query, status, inputSignalId, host })
        : null,
    [host, inputSignalId, loadResult.model, query, status],
  );
  const singleGroupId = result?.componentCount === 1 ? (result.groups[0]?.id ?? null) : null;

  useEffect(() => searchRef.current?.focus(), []);
  useEffect(() => setAutoCollapsedGroupId(null), [singleGroupId]);

  const hasActiveFilters =
    query.trim().length > 0 || status !== 'all' || inputSignalId !== 'all' || host !== 'all';
  const clearDiscovery = (): void => {
    setQuery('');
    setStatus('all');
    setInputSignalId('all');
    setHost('all');
    setExpandedGroups(new Set());
    setSelected(null);
    searchRef.current?.focus();
  };
  const isExpanded = (groupId: string): boolean =>
    expandedGroups.has(groupId) || (singleGroupId === groupId && autoCollapsedGroupId !== groupId);
  const toggleGroup = (group: BfnCatalogDiscoveryGroup): void => {
    if (group.role === 'sender') setSelected({ kind: 'sender', groupId: group.id });
    if (
      singleGroupId === group.id &&
      !expandedGroups.has(group.id) &&
      autoCollapsedGroupId !== group.id
    ) {
      setAutoCollapsedGroupId(group.id);
      return;
    }
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(group.id)) next.delete(group.id);
      else next.add(group.id);
      return next;
    });
  };

  return (
    <DiscoveryDrawerSurface
      project={project}
      onClose={onClose}
      onAddBuiltInModule={onAddBuiltInModule}
      language={language}
      searchRef={searchRef}
      model={loadResult.model}
      result={result}
      query={query}
      status={status}
      inputSignalId={inputSignalId}
      host={host}
      hasActiveFilters={hasActiveFilters}
      selected={selected}
      isExpanded={isExpanded}
      onToggleGroup={toggleGroup}
      onSelect={setSelected}
      onQueryChange={setQuery}
      onStatusChange={setStatus}
      onInputSignalChange={setInputSignalId}
      onHostChange={setHost}
      onClear={clearDiscovery}
    />
  );
}

interface DiscoveryDrawerSurfaceProps {
  project: BfnProject;
  onClose: () => void;
  onAddBuiltInModule: (catalogId: BfnCatalogModuleId) => void;
  language: ReleaseCatalogLanguage;
  searchRef: RefObject<HTMLInputElement | null>;
  model: BfnCatalogDiscoveryModel | null;
  result: BfnCatalogDiscoveryQueryResult | null;
  query: string;
  status: BfnCatalogDiscoveryStatusFilter | 'all';
  inputSignalId: string;
  host: string;
  hasActiveFilters: boolean;
  selected: SelectedEntry | null;
  isExpanded: (groupId: string) => boolean;
  onToggleGroup: (group: BfnCatalogDiscoveryGroup) => void;
  onSelect: (entry: SelectedEntry) => void;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: BfnCatalogDiscoveryStatusFilter | 'all') => void;
  onInputSignalChange: (value: string) => void;
  onHostChange: (value: string) => void;
  onClear: () => void;
}

function DiscoveryDrawerSurface(props: DiscoveryDrawerSurfaceProps) {
  const { t } = useTranslation();
  return (
    <div className="bfn-drawer-layer">
      <button
        className="bfn-drawer-scrim"
        type="button"
        aria-label={t('bfn.drawers.closeModulePicker')}
        onClick={props.onClose}
      />
      <aside
        className="bfn-drawer bfn-catalog-discovery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bfn-catalog-discovery-title"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          props.onClose();
        }}
      >
        <DiscoveryDrawerHeader onClose={props.onClose} />
        <div className="bfn-catalog-discovery__body">
          <BuiltInModuleDisclosure project={props.project} onAdd={props.onAddBuiltInModule} />
          <DiscoveryCatalogBody {...props} />
        </div>
        <footer className="bfn-catalog-discovery__footer">
          <Icon name="file" size={14} />
          <span>{t('bfn.catalogDiscovery.readOnlyBoundary')}</span>
        </footer>
      </aside>
    </div>
  );
}

function DiscoveryDrawerHeader({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="bfn-drawer__header bfn-catalog-discovery__header">
      <div>
        <span>{t('bfn.catalogDiscovery.kicker')}</span>
        <h2 id="bfn-catalog-discovery-title">{t('bfn.catalogDiscovery.title')}</h2>
      </div>
      <button
        className="bfn-drawer__close"
        type="button"
        aria-label={t('bfn.drawers.closeModulePicker')}
        onClick={onClose}
      >
        ×
      </button>
    </header>
  );
}

function DiscoveryCatalogBody(props: DiscoveryDrawerSurfaceProps) {
  const { t } = useTranslation();
  if (!props.model || !props.result)
    return (
      <div className="bfn-catalog-load-error" role="alert">
        <Icon name="warning" size={18} />
        <div>
          <strong>{t('bfn.catalogDiscovery.loadError')}</strong>
          <p>{t('bfn.catalogDiscovery.loadErrorHint')}</p>
        </div>
      </div>
    );

  return (
    <>
      <CatalogControls {...props} model={props.model} result={props.result} />
      <DiscoveryResults {...props} result={props.result} />
    </>
  );
}

function DiscoveryResults(
  props: DiscoveryDrawerSurfaceProps & { result: BfnCatalogDiscoveryQueryResult },
) {
  const { t } = useTranslation();
  if (props.result.groups.length === 0)
    return (
      <div className="bfn-catalog-empty" role="status">
        <Icon name="scan" size={20} />
        <p>{t('bfn.catalogDiscovery.empty')}</p>
        <button type="button" onClick={props.onClear}>
          {t('bfn.catalogDiscovery.clearFilters')}
        </button>
      </div>
    );
  return (
    <div className="bfn-catalog-groups">
      {props.result.groups.map((group) => (
        <DiscoveryGroup
          key={group.id}
          group={group}
          language={props.language}
          expanded={props.isExpanded(group.id)}
          selected={props.selected}
          onToggle={() => props.onToggleGroup(group)}
          onSelect={props.onSelect}
        />
      ))}
    </div>
  );
}

function CatalogControls(
  props: DiscoveryDrawerSurfaceProps & {
    model: BfnCatalogDiscoveryModel;
    result: BfnCatalogDiscoveryQueryResult;
  },
) {
  const { t } = useTranslation();
  return (
    <>
      <section
        className="bfn-catalog-release-summary"
        aria-label={t('bfn.catalogDiscovery.releaseSummary')}
      >
        <strong>AHL/HSL V{props.model.catalogVersion}</strong>
        <span>
          {t('bfn.catalogDiscovery.totalCounts', {
            components: props.model.counts.components,
            responses: props.model.counts.responses,
            runnable: props.model.counts.runnableResponses,
          })}
        </span>
      </section>
      <CatalogSearch {...props} />
      <CatalogFilters {...props} />
      <div className="bfn-catalog-results-summary" aria-live="polite">
        <span>
          {t('bfn.catalogDiscovery.visibleCounts', {
            components: props.result.componentCount,
            responses: props.result.responseCount,
          })}
        </span>
        {props.hasActiveFilters ? (
          <button type="button" onClick={props.onClear}>
            {t('bfn.catalogDiscovery.clearFilters')}
          </button>
        ) : null}
      </div>
    </>
  );
}

function CatalogSearch(props: DiscoveryDrawerSurfaceProps) {
  const { t } = useTranslation();
  return (
    <div className="bfn-catalog-discovery__search">
      <Icon name="scan" size={15} />
      <label htmlFor="bfn-catalog-discovery-search" className="visually-hidden">
        {t('bfn.catalogDiscovery.searchLabel')}
      </label>
      <input
        ref={props.searchRef}
        id="bfn-catalog-discovery-search"
        type="search"
        value={props.query}
        placeholder={t('bfn.catalogDiscovery.searchPlaceholder')}
        onChange={(event) => props.onQueryChange(event.target.value)}
      />
      {props.query ? (
        <button
          type="button"
          aria-label={t('bfn.catalogDiscovery.clearSearch')}
          onClick={() => props.onQueryChange('')}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function CatalogFilters(props: DiscoveryDrawerSurfaceProps & { model: BfnCatalogDiscoveryModel }) {
  const { t } = useTranslation();
  return (
    <div className="bfn-catalog-filters" aria-label={t('bfn.catalogDiscovery.filters')}>
      <StatusFilter {...props} />
      <InputSignalFilter {...props} />
      <HostFilter {...props} />
    </div>
  );
}

function StatusFilter(props: DiscoveryDrawerSurfaceProps & { model: BfnCatalogDiscoveryModel }) {
  const { t } = useTranslation();
  return (
    <label>
      <span>{t('bfn.catalogDiscovery.statusFilter')}</span>
      <select
        value={props.status}
        aria-label={t('bfn.catalogDiscovery.statusFilter')}
        onChange={(event) =>
          props.onStatusChange(event.target.value as BfnCatalogDiscoveryStatusFilter | 'all')
        }
      >
        <option value="all">{t('bfn.catalogDiscovery.all')}</option>
        {props.model.filterOptions.statuses.map((option) => (
          <option key={option} value={option}>
            {statusLabel(option, t)}
          </option>
        ))}
      </select>
    </label>
  );
}

function InputSignalFilter(
  props: DiscoveryDrawerSurfaceProps & { model: BfnCatalogDiscoveryModel },
) {
  const { t } = useTranslation();
  return (
    <label>
      <span>{t('bfn.catalogDiscovery.inputFilter')}</span>
      <select
        value={props.inputSignalId}
        aria-label={t('bfn.catalogDiscovery.inputFilter')}
        onChange={(event) => props.onInputSignalChange(event.target.value)}
      >
        <option value="all">{t('bfn.catalogDiscovery.all')}</option>
        {props.model.filterOptions.inputSignals.map((signal) => (
          <option key={signal.id} value={signal.id}>
            {bfnCatalogSignalDisplayName(signal.names, signal.abbreviations, props.language)}
          </option>
        ))}
      </select>
    </label>
  );
}

function HostFilter(props: DiscoveryDrawerSurfaceProps & { model: BfnCatalogDiscoveryModel }) {
  const { t } = useTranslation();
  return (
    <label>
      <span>{t('bfn.catalogDiscovery.hostFilter')}</span>
      <select
        value={props.host}
        aria-label={t('bfn.catalogDiscovery.hostFilter')}
        onChange={(event) => props.onHostChange(event.target.value)}
      >
        <option value="all">{t('bfn.catalogDiscovery.all')}</option>
        {props.model.filterOptions.hosts.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

interface DiscoveryGroupProps {
  group: BfnCatalogDiscoveryGroup;
  language: ReleaseCatalogLanguage;
  expanded: boolean;
  selected: SelectedEntry | null;
  onToggle: () => void;
  onSelect: (entry: SelectedEntry) => void;
}

function DiscoveryGroup(props: DiscoveryGroupProps) {
  const { t } = useTranslation();
  const panelId = `bfn-catalog-group-${props.group.id.replace(/[^a-z0-9-]/giu, '-')}`;
  return (
    <section className="bfn-catalog-group" data-role={props.group.role}>
      <button
        className="bfn-catalog-group__trigger"
        type="button"
        aria-expanded={props.expanded}
        aria-controls={panelId}
        onClick={props.onToggle}
      >
        <span className="bfn-catalog-group__chevron" aria-hidden="true" />
        <span className="bfn-catalog-group__identity">
          <strong>{localizedName(props.group.names, props.language)}</strong>
          <small>{groupSummary(props.group, t)}</small>
        </span>
      </button>
      {props.expanded ? (
        <div id={panelId} className="bfn-catalog-group__content">
          {props.group.role === 'sender' ? (
            <SenderEntry {...props} />
          ) : props.group.responses.length === 0 ? (
            <p className="bfn-catalog-no-response">
              {t('bfn.catalogDiscovery.noReceiverResponse')}
            </p>
          ) : (
            <ReceiverEntries {...props} />
          )}
        </div>
      ) : null}
    </section>
  );
}

function SenderEntry(props: DiscoveryGroupProps) {
  const { t } = useTranslation();
  const selected = props.selected?.kind === 'sender' && props.selected.groupId === props.group.id;
  return (
    <>
      <button
        className="bfn-catalog-sender-row"
        type="button"
        aria-pressed={selected}
        onClick={() => props.onSelect({ kind: 'sender', groupId: props.group.id })}
      >
        <span>{t('bfn.catalogDiscovery.noSenderFunction')}</span>
        <small>{hostLine(props.group.hostSpecies, props.group.hostStrain, t)}</small>
      </button>
      {selected ? <SenderPreview group={props.group} language={props.language} /> : null}
    </>
  );
}

function ReceiverEntries(props: DiscoveryGroupProps) {
  return props.group.responses.map((response) => (
    <ResponseEntry key={response.id} {...props} response={response} />
  ));
}

function ResponseEntry(props: DiscoveryGroupProps & { response: BfnCatalogDiscoveryResponse }) {
  const { t } = useTranslation();
  const selected =
    props.selected?.kind === 'response' &&
    props.selected.groupId === props.group.id &&
    props.selected.responseId === props.response.id;
  return (
    <div className="bfn-catalog-response-entry">
      <button
        className="bfn-catalog-response-row"
        type="button"
        aria-pressed={selected}
        onClick={() =>
          props.onSelect({
            kind: 'response',
            groupId: props.group.id,
            responseId: props.response.id,
          })
        }
      >
        <span className="bfn-catalog-response-row__identity">
          <strong>
            {bfnCatalogSignalDisplayName(
              props.response.inputSignalNames,
              props.response.inputSignalAbbreviations,
              props.language,
            )}
            <span aria-hidden="true"> → </span>
            {t('bfn.catalogDiscovery.normalizedOutput')}
          </strong>
          <small>{hostLine(props.response.hostSpecies, props.response.hostStrain, t)}</small>
        </span>
        <StatusLabel status={props.response.status} />
      </button>
      {selected ? (
        <ResponsePreview group={props.group} response={props.response} language={props.language} />
      ) : null}
    </div>
  );
}

function ResponsePreview({
  group,
  response,
  language,
}: {
  group: BfnCatalogDiscoveryGroup;
  response: BfnCatalogDiscoveryResponse;
  language: ReleaseCatalogLanguage;
}) {
  const { t } = useTranslation();
  return (
    <section className="bfn-catalog-preview" aria-label={t('bfn.catalogDiscovery.previewLabel')}>
      <dl>
        <PreviewFact
          label={t('bfn.catalogDiscovery.component')}
          value={localizedName(group.names, language)}
        />
        <PreviewFact
          label={t('bfn.catalogDiscovery.function')}
          value={`${bfnCatalogSignalDisplayName(
            response.inputSignalNames,
            response.inputSignalAbbreviations,
            language,
          )} → ${t('bfn.catalogDiscovery.normalizedOutput')}`}
        />
        <PreviewFact
          label={t('bfn.catalogDiscovery.status')}
          value={statusLabel(response.status, t)}
        />
        {response.hostSpecies ? (
          <PreviewFact label={t('bfn.catalogDiscovery.host')} value={response.hostSpecies} />
        ) : null}
        {response.hostStrain ? (
          <PreviewFact label={t('bfn.catalogDiscovery.strain')} value={response.hostStrain} />
        ) : null}
        {response.modelSummary ? (
          <PreviewFact
            label={t('bfn.catalogDiscovery.model')}
            value={t('bfn.catalogDiscovery.hillResponse')}
          />
        ) : null}
        <PreviewFact
          label={t('bfn.catalogDiscovery.source')}
          value={sourceLabel(response.source, t)}
        />
      </dl>
      <AdditionalSources count={response.additionalSourceCount} />
    </section>
  );
}

function SenderPreview({
  group,
  language,
}: {
  group: BfnCatalogDiscoveryGroup;
  language: ReleaseCatalogLanguage;
}) {
  const { t } = useTranslation();
  return (
    <section className="bfn-catalog-preview" aria-label={t('bfn.catalogDiscovery.previewLabel')}>
      <dl>
        <PreviewFact
          label={t('bfn.catalogDiscovery.component')}
          value={localizedName(group.names, language)}
        />
        <PreviewFact
          label={t('bfn.catalogDiscovery.type')}
          value={t('bfn.catalogDiscovery.sender')}
        />
        <PreviewFact
          label={t('bfn.catalogDiscovery.numericStatus')}
          value={t('bfn.catalogDiscovery.noSenderFunction')}
        />
        {group.regulatorOrEnzyme ? (
          <PreviewFact label={t('bfn.catalogDiscovery.enzyme')} value={group.regulatorOrEnzyme} />
        ) : null}
        {group.aliases.length > 0 ? (
          <PreviewFact
            label={t('bfn.catalogDiscovery.aliases')}
            value={group.aliases.join(' · ')}
          />
        ) : null}
        {group.hostSpecies ? (
          <PreviewFact label={t('bfn.catalogDiscovery.host')} value={group.hostSpecies} />
        ) : null}
        {group.hostStrain ? (
          <PreviewFact label={t('bfn.catalogDiscovery.strain')} value={group.hostStrain} />
        ) : null}
        <PreviewFact
          label={t('bfn.catalogDiscovery.source')}
          value={sourceLabel(group.source, t)}
        />
      </dl>
      <AdditionalSources count={group.additionalSourceCount} />
      <p className="bfn-catalog-preview__boundary">{t('bfn.catalogDiscovery.senderBoundary')}</p>
    </section>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AdditionalSources({ count }: { count: number }) {
  const { t } = useTranslation();
  return count > 0 ? <p>{t('bfn.catalogDiscovery.additionalSources', { count })}</p> : null;
}

function StatusLabel({ status }: { status: BfnCatalogDiscoveryStatus }) {
  const { t } = useTranslation();
  return (
    <span className="bfn-catalog-status" data-status={status}>
      {statusLabel(status, t)}
    </span>
  );
}

function BuiltInModuleDisclosure({
  project,
  onAdd,
}: {
  project: BfnProject;
  onAdd: (catalogId: BfnCatalogModuleId) => void;
}) {
  const { t } = useTranslation();
  return (
    <details className="bfn-built-in-modules">
      <summary>
        <span>{t('bfn.catalogDiscovery.builtInModules')}</span>
        <small>{t('bfn.catalogDiscovery.builtInHint')}</small>
      </summary>
      <div className="bfn-module-catalog">
        {bfnModuleCatalog.map((entry) => (
          <BuiltInModuleRow key={entry.id} entry={entry} project={project} onAdd={onAdd} />
        ))}
      </div>
    </details>
  );
}

function BuiltInModuleRow({
  entry,
  project,
  onAdd,
}: {
  entry: (typeof bfnModuleCatalog)[number];
  project: BfnProject;
  onAdd: (catalogId: BfnCatalogModuleId) => void;
}) {
  const { t } = useTranslation();
  const previewModule = createCatalogModule(entry.id, 'catalog-preview');
  const previewModel = resolveEffectiveBfnModel(project, previewModule);
  const relatedDatasets = previewModel
    ? project.registry.datasets.filter((dataset) =>
        previewModel.sourceDatasetIds.includes(dataset.id),
      )
    : [];
  return (
    <article className="bfn-module-row">
      <div className="bfn-module-row__identity">
        <h3>{t(entry.labelKey)}</h3>
        <p className="bfn-module-catalog__flow">{bfnModuleFlowLabel(previewModule, t)}</p>
        <p>{t(entry.descriptionKey)}</p>
      </div>
      <dl>
        <div>
          <dt>{t('bfn.registry.modelBasis')}</dt>
          <dd>
            <span
              className="bfn-evidence-label"
              data-evidence-tone={
                previewModel ? bfnEvidenceTone(previewModel.evidenceGrade) : 'warning'
              }
            >
              {previewModel
                ? t(`bfn.evidence.${previewModel.evidenceGrade}`)
                : t(entry.evidenceKey)}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t('bfn.registry.linkedData')}</dt>
          <dd>
            {relatedDatasets.length
              ? relatedDatasets.map((dataset) => t(dataset.labelKey)).join(' · ')
              : t('bfn.registry.notLinkedDataset')}
          </dd>
        </div>
      </dl>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<Icon name="plus" size={14} />}
        onClick={() => onAdd(entry.id)}
      >
        {t('bfn.registry.addToCanvas')}
      </Button>
    </article>
  );
}

function releaseLanguage(language: string): ReleaseCatalogLanguage {
  return language.toLocaleLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

function localizedName(
  names: { en: string; zh: string },
  language: ReleaseCatalogLanguage,
): string {
  return language === 'zh-CN' ? names.zh : names.en;
}

function statusLabel(status: BfnCatalogDiscoveryStatus, t: TFunction): string {
  return t(`bfn.catalogDiscovery.statuses.${status}`);
}

function groupSummary(group: BfnCatalogDiscoveryGroup, t: TFunction): string {
  return group.role === 'sender'
    ? `${t('bfn.catalogDiscovery.sender')} · ${t('bfn.catalogDiscovery.noSenderFunction')}`
    : `${t('bfn.catalogDiscovery.receiver')} · ${t('bfn.catalogDiscovery.responseCount', {
        count: group.responses.length,
      })}`;
}

function hostLine(species: string | null, strain: string | null, t: TFunction): string {
  return [species, strain].filter(Boolean).join(' · ') || t('bfn.catalogDiscovery.notRecorded');
}

function sourceLabel(
  source: { authors: string; year: number | null } | null,
  t: TFunction,
): string {
  if (!source) return t('bfn.catalogDiscovery.notRecorded');
  return [source.authors, source.year].filter((value) => value !== null).join(' · ');
}

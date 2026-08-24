import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogIndex } from './catalogIndex';
import {
  CATALOG_NETWORK_ROLES,
  CATALOG_PARAMETER_STATUSES,
  getCatalogInputMolecules,
  getCatalogOutputMolecules,
} from './catalogPresentation';
import type {
  CatalogEntityType,
  CatalogParameterStatus,
  CatalogSearchFilters,
  CatalogValue,
  EvidenceGrade,
  SequenceStatus,
} from './catalogTypes';

export interface CatalogFilterBarProps {
  value: CatalogSearchFilters;
  index: CatalogIndex;
  resultCount: number;
  onChange: (next: CatalogSearchFilters) => void;
  onClear: () => void;
  advancedOpen?: boolean;
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function knownText(value: CatalogValue<string>): string | null {
  return value.state === 'known' ? value.value : null;
}

export function CatalogFilterBar({
  value,
  index,
  resultCount,
  onChange,
  onClear,
  advancedOpen = false,
}: CatalogFilterBarProps): JSX.Element {
  const { t } = useTranslation();
  const hosts = unique(
    index.entries
      .map((entry) => knownText(entry.context.host))
      .filter((host): host is string => host !== null),
  );
  const strains = unique(
    index.entries
      .map((entry) => knownText(entry.context.strain))
      .filter((strain): strain is string => strain !== null),
  );
  const entityTypes = unique(index.entries.map((entry) => entry.entityType));
  const evidenceGrades = unique(index.entries.map((entry) => entry.evidence.grade));
  const sequenceStatuses = unique(index.entries.map((entry) => entry.sequence.status));
  const inputMolecules = unique(index.entries.flatMap(getCatalogInputMolecules));
  const outputMolecules = unique(index.entries.flatMap(getCatalogOutputMolecules));
  const activeFilterCount =
    Number(value.query.trim().length > 0) +
    [
      value.networkRole ?? 'all',
      value.inputMolecule ?? 'all',
      value.outputMolecule ?? 'all',
      value.parameterStatus ?? 'all',
      value.entityType,
      value.host,
      value.strain,
      value.evidenceGrade,
      value.sequenceStatus,
    ].filter((filter) => filter !== 'all').length;

  const update = <Key extends keyof CatalogSearchFilters>(
    key: Key,
    nextValue: CatalogSearchFilters[Key],
  ): void => onChange({ ...value, [key]: nextValue });

  return (
    <section className="catalog-filter-bar" aria-label={t('modeling.catalog.filters')}>
      <div className="catalog-filter-bar__primary">
        <label className="catalog-filter-bar__search">
          <span>{t('modeling.catalog.search')}</span>
          <input
            type="search"
            value={value.query}
            placeholder={t('modeling.catalog.searchPlaceholder')}
            onChange={(event) => update('query', event.target.value)}
          />
        </label>
        <div className="catalog-filter-bar__grid catalog-filter-bar__grid--primary">
          <FilterSelect
            label={t('modeling.catalog.networkRoleFilter')}
            value={value.networkRole ?? 'all'}
            options={CATALOG_NETWORK_ROLES.map((option) => ({
              value: option,
              label: t(`modeling.catalog.networkRoles.${option}`),
            }))}
            onChange={(next) => update('networkRole', next as CatalogSearchFilters['networkRole'])}
          />
          <FilterSelect
            label={t('modeling.catalog.inputMoleculeFilter')}
            value={value.inputMolecule ?? 'all'}
            options={inputMolecules.map((option) => ({ value: option, label: option }))}
            onChange={(next) => update('inputMolecule', next)}
          />
          <FilterSelect
            label={t('modeling.catalog.outputMoleculeFilter')}
            value={value.outputMolecule ?? 'all'}
            options={outputMolecules.map((option) => ({ value: option, label: option }))}
            onChange={(next) => update('outputMolecule', next)}
          />
          <FilterSelect
            label={t('modeling.catalog.parameterStatusFilter')}
            value={value.parameterStatus ?? 'all'}
            options={CATALOG_PARAMETER_STATUSES.map((option) => ({
              value: option,
              label: t(`modeling.catalog.parameterStatuses.${option}`),
            }))}
            onChange={(next) => update('parameterStatus', next as CatalogParameterStatus | 'all')}
          />
        </div>
      </div>
      <details className="catalog-filter-bar__advanced" open={advancedOpen}>
        <summary>{t('modeling.catalog.advancedFilters')}</summary>
        <div className="catalog-filter-bar__grid catalog-filter-bar__grid--advanced">
          <FilterSelect
            label={t('modeling.catalog.hostFilter')}
            value={value.host}
            options={hosts.map((option) => ({ value: option, label: option }))}
            onChange={(next) => update('host', next)}
          />
          <FilterSelect
            label={t('modeling.catalog.strainFilter')}
            value={value.strain}
            options={strains.map((option) => ({ value: option, label: option }))}
            onChange={(next) => update('strain', next)}
          />
          <FilterSelect
            label={t('modeling.catalog.evidenceFilter')}
            value={value.evidenceGrade}
            options={evidenceGrades.map((option) => ({
              value: option,
              label: `${t(`modeling.catalog.evidenceGrades.${option}`)} · ${t(
                `modeling.catalog.evidenceGradeDescriptions.${option}`,
              )}`,
            }))}
            onChange={(next) => update('evidenceGrade', next as EvidenceGrade | 'all')}
          />
          <FilterSelect
            label={t('modeling.catalog.sequenceFilter')}
            value={value.sequenceStatus}
            options={sequenceStatuses.map((option) => ({
              value: option,
              label: t(`modeling.catalog.sequenceStatuses.${option}`),
            }))}
            onChange={(next) => update('sequenceStatus', next as SequenceStatus | 'all')}
          />
          <FilterSelect
            label={t('modeling.catalog.entityFilter')}
            value={value.entityType}
            options={entityTypes.map((option) => ({
              value: option,
              label: t(`modeling.catalog.entityTypes.${option}`),
            }))}
            onChange={(next) => update('entityType', next as CatalogEntityType | 'all')}
          />
        </div>
      </details>
      <footer className="catalog-filter-bar__summary">
        <span>{t('modeling.catalog.filterSummary', { count: activeFilterCount })}</span>
        <output aria-live="polite">
          {t('modeling.catalog.resultCount', { count: resultCount })}
        </output>
        <button className="button button--ghost" type="button" onClick={onClear}>
          {t('modeling.catalog.clearFilters')}
        </button>
      </footer>
    </section>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">{t('modeling.catalog.all')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

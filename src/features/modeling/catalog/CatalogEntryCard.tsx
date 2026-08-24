import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';
import {
  getCatalogInputMolecules,
  getCatalogNetworkRoles,
  getCatalogOutputMolecules,
  getCatalogParameterStatus,
} from './catalogPresentation';
import type { CatalogEntry, CatalogSignal } from './catalogTypes';

export interface CatalogEntryCardProps {
  entry: CatalogEntry;
  selected: boolean;
  onSelect: (entryId: string) => void;
}

export function CatalogEntryCard({
  entry,
  selected,
  onSelect,
}: CatalogEntryCardProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const localizedName = i18n.resolvedLanguage?.startsWith('zh') ? entry.name.zh : entry.name.en;
  const parameterStatus = getCatalogParameterStatus(entry);
  const networkRoles = getCatalogNetworkRoles(entry);
  const inputLabels = getCatalogInputMolecules(entry);
  const outputLabels = getCatalogOutputMolecules(entry);
  const host =
    entry.context.host.state === 'known' ? entry.context.host.value : t('modeling.catalog.unknown');
  const statusIcon = entry.evidence.reviewStatus === 'passed' ? 'check' : 'warning';

  return (
    <article role="listitem" className={`catalog-entry-card${selected ? ' is-selected' : ''}`}>
      <button
        type="button"
        data-catalog-entry-button
        data-entry-id={entry.id}
        aria-pressed={selected}
        aria-label={t('modeling.catalog.cardLabel', { name: localizedName, id: entry.id })}
        onClick={() => onSelect(entry.id)}
      >
        <span className="catalog-entry-card__icon" aria-hidden="true">
          <Icon name="network" size={18} />
        </span>
        <span className="catalog-entry-card__content">
          <strong title={localizedName}>{localizedName}</strong>
          <code title={entry.id}>{entry.id}</code>
          <span className="catalog-entry-card__flow">
            <span>
              <small>{t('modeling.catalog.inputSignals')}</small>
              <span>
                {formatSignalLabels(
                  entry.signals.inputs,
                  inputLabels,
                  t('modeling.catalog.unknown'),
                )}
              </span>
            </span>
            <Icon name="arrow" size={13} />
            <span>
              <small>{t('modeling.catalog.networkFunction')}</small>
              <span>
                {networkRoles.map((role) => t(`modeling.catalog.networkRoles.${role}`)).join(' / ')}
              </span>
            </span>
            <Icon name="arrow" size={13} />
            <span>
              <small>{t('modeling.catalog.outputSignals')}</small>
              <span>
                {formatSignalLabels(
                  entry.signals.outputs,
                  outputLabels,
                  t('modeling.catalog.unknown'),
                )}
              </span>
            </span>
          </span>
          <span className="catalog-entry-card__context">
            {t('modeling.catalog.contextFields.host')}: {host}
          </span>
        </span>
        <span className="catalog-entry-card__status catalog-status-text">
          <span className={`catalog-parameter-status catalog-parameter-status--${parameterStatus}`}>
            <Icon name="flask" size={13} />
            {t(`modeling.catalog.parameterStatuses.${parameterStatus}`)}
          </span>
          <span className="catalog-parameter-reason">
            {t(`modeling.catalog.parameterStatusReasons.${parameterStatus}`)}
          </span>
          <span>
            <Icon name={statusIcon} size={13} />
            {t(`modeling.catalog.reviewStatuses.${entry.evidence.reviewStatus}`)}
          </span>
          <span title={t(`modeling.catalog.evidenceGradeDescriptions.${entry.evidence.grade}`)}>
            <Icon name="file" size={13} />
            {t('modeling.catalog.evidenceGradeValue', { grade: entry.evidence.grade })}:{' '}
            {t(`modeling.catalog.evidenceGradeDescriptions.${entry.evidence.grade}`)}
          </span>
          <span>
            {networkRoles.map((role) => t(`modeling.catalog.networkRoles.${role}`)).join(' / ')}
          </span>
        </span>
      </button>
      {entry.name.aliases.length > 0 ? (
        <details className="catalog-entry-card__aliases">
          <summary>{t('modeling.catalog.aliases')}</summary>
          <span title={entry.name.aliases.join(', ')}>{entry.name.aliases.join(', ')}</span>
        </details>
      ) : null}
    </article>
  );
}

function formatSignalLabels(
  signals: CatalogSignal[] | { state: 'unknown' },
  labels: string[],
  unknownLabel: string,
): string {
  if (!Array.isArray(signals)) return unknownLabel;
  return labels.length > 0 ? labels.join(', ') : unknownLabel;
}

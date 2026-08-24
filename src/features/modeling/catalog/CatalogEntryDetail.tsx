import type { JSX, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';
import {
  assessCatalogApplication,
  createLiteratureCandidateReference,
  getCatalogNetworkRoles,
  getCatalogParameterStatus,
} from './catalogPresentation';
import type {
  CatalogApplicationAssessment,
  CatalogEntry,
  CatalogNetworkRole,
  CatalogNodeKind,
  CatalogSignal,
  CatalogValue,
  LiteratureCandidateReference,
  UnknownValue,
} from './catalogTypes';

export interface CatalogEntryDetailProps {
  entry: CatalogEntry | null;
  selectedNodeKind?: CatalogNodeKind;
  selectedNetworkRole?: CatalogNetworkRole;
  canAttach: boolean;
  attachedReference?: LiteratureCandidateReference;
  onApply?: (entry: CatalogEntry, assessment: CatalogApplicationAssessment) => void;
  onAttachReference?: (reference: LiteratureCandidateReference) => void;
  /** Legacy alias retained while the host page migrates. */
  onAttach?: (reference: LiteratureCandidateReference) => void;
  onDetach: () => void;
  targetNetworkRole?: CatalogNetworkRole | null;
  onTargetNetworkRoleChange?: (role: CatalogNetworkRole | null) => void;
}

export function formatCatalogValue<T>(value: CatalogValue<T>, unknownLabel: string): string {
  if (value.state === 'known') return String(value.value);
  return unknownLabel;
}

export function CatalogEntryDetail({
  entry,
  selectedNodeKind,
  selectedNetworkRole,
  canAttach,
  attachedReference,
  onApply,
  onAttachReference,
  onAttach,
  onDetach,
  targetNetworkRole,
  onTargetNetworkRoleChange,
}: CatalogEntryDetailProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const unknownLabel = t('modeling.catalog.unknown');
  const localizedName = entry
    ? i18n.resolvedLanguage?.startsWith('zh')
      ? entry.name.zh
      : entry.name.en
    : null;
  const nodeKindCompatible =
    selectedNodeKind === undefined ||
    entry?.modeling.compatibleNodeKinds.includes(selectedNodeKind) === true;
  const networkRoleCompatible =
    selectedNetworkRole === undefined ||
    (entry !== null && getCatalogNetworkRoles(entry).includes(selectedNetworkRole));
  const parameterStatus = entry ? getCatalogParameterStatus(entry) : null;
  const compatibleNetworkRoles = entry ? getCatalogNetworkRoles(entry) : [];
  const applicationAssessment = entry
    ? assessCatalogApplication(entry, targetNetworkRole, { canApply: canAttach })
    : null;
  const attachEnabled =
    entry !== null &&
    entry.evidence.reviewStatus === 'passed' &&
    canAttach &&
    (selectedNodeKind !== undefined || selectedNetworkRole !== undefined) &&
    nodeKindCompatible &&
    networkRoleCompatible;
  const applyEnabled = Boolean(applicationAssessment?.allowed && nodeKindCompatible && onApply);

  const applyToNetwork = (): void => {
    if (!entry || !applicationAssessment || !applyEnabled || !onApply) return;
    onApply(entry, applicationAssessment);
  };

  const attachReference = (): void => {
    if (!entry || !localizedName || !attachEnabled) return;
    const callback = onAttachReference ?? onAttach;
    callback?.(createLiteratureCandidateReference(entry, localizedName));
  };

  return (
    <section className="catalog-entry-detail" aria-label={t('modeling.catalog.details')}>
      {attachedReference ? (
        <aside className="catalog-attached-reference" aria-label={t('modeling.catalog.attached')}>
          <div>
            <span>{t('modeling.catalog.attached')}</span>
            <strong>{attachedReference.displayNameSnapshot}</strong>
            <code>{attachedReference.entryId}</code>
          </div>
          <button className="button button--ghost" type="button" onClick={onDetach}>
            <Icon name="trash" size={14} />
            {t('modeling.catalog.detach')}
          </button>
        </aside>
      ) : null}

      {entry ? (
        <>
          <header className="catalog-entry-detail__header">
            <div>
              <p className="catalog-status-text">
                {compatibleNetworkRoles
                  .map((role) => t(`modeling.catalog.networkRoles.${role}`))
                  .join(' / ')}
              </p>
              <h3>{localizedName}</h3>
              <code title={entry.id}>{entry.id}</code>
            </div>
            <div className="catalog-entry-detail__status catalog-status-text">
              <span className="catalog-parameter-status">
                {parameterStatus
                  ? t(`modeling.catalog.parameterStatuses.${parameterStatus}`)
                  : null}
              </span>
              <span>{t(`modeling.catalog.reviewStatuses.${entry.evidence.reviewStatus}`)}</span>
              <span title={t(`modeling.catalog.evidenceGradeDescriptions.${entry.evidence.grade}`)}>
                {t('modeling.catalog.evidenceGradeValue', { grade: entry.evidence.grade })}:{' '}
                {t(`modeling.catalog.evidenceGradeDescriptions.${entry.evidence.grade}`)}
              </span>
            </div>
          </header>

          <p className="catalog-public-boundary">
            <Icon name="warning" size={15} />
            {t('modeling.catalog.publicEvidenceBoundary')}
          </p>
          <div className="catalog-application-target">
            <label>
              <span>{t('modeling.catalog.targetNetworkRole')}</span>
              <select
                value={targetNetworkRole ?? 'all'}
                onChange={(event) =>
                  onTargetNetworkRoleChange?.(
                    event.target.value === 'all'
                      ? null
                      : (event.target.value as CatalogNetworkRole),
                  )
                }
              >
                <option value="all">{t('modeling.catalog.chooseNetworkRole')}</option>
                <option value="input">{t('modeling.catalog.networkRoles.input')}</option>
                <option value="processing">{t('modeling.catalog.networkRoles.processing')}</option>
                <option value="output">{t('modeling.catalog.networkRoles.output')}</option>
              </select>
            </label>
            <p className="catalog-parameter-reason">
              {parameterStatus
                ? t(`modeling.catalog.parameterStatusReasons.${parameterStatus}`)
                : null}
            </p>
          </div>

          <div className="catalog-signal-grid">
            <SignalTable
              title={t('modeling.catalog.inputSignals')}
              signals={entry.signals.inputs}
              unknownLabel={unknownLabel}
            />
            <SignalTable
              title={t('modeling.catalog.outputSignals')}
              signals={entry.signals.outputs}
              unknownLabel={unknownLabel}
            />
          </div>

          <details className="catalog-source-disclosure">
            <summary>{t('modeling.catalog.sourceEvidenceDetails')}</summary>
            <p className="catalog-source-disclosure__note">
              {t('modeling.catalog.sourceEvidenceLanguageNote')}
            </p>
            <section className="catalog-detail-section">
              <h4>{t('modeling.catalog.mechanism')}</h4>
              <p>{entry.mechanism.summary}</p>
              <ol>
                {entry.mechanism.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>

            <section className="catalog-detail-section">
              <h4>{t('modeling.catalog.context')}</h4>
              <dl className="catalog-context-list">
                {(
                  [
                    'host',
                    'strain',
                    'vector',
                    'culture',
                    'temperature',
                    'induction',
                    'growthPhase',
                    'readout',
                    'other',
                  ] as const
                ).map((key) => (
                  <div key={key}>
                    <dt>{t(`modeling.catalog.contextFields.${key}`)}</dt>
                    <dd className={entry.context[key].state === 'unknown' ? 'catalog-unknown' : ''}>
                      {formatCatalogValue(entry.context[key], unknownLabel)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="catalog-detail-section catalog-evidence-boundary">
              <h4>{t('modeling.catalog.evidenceBoundary')}</h4>
              <p>{entry.evidence.scope}</p>
              <p className="catalog-status-text">
                {t('modeling.catalog.directInEColi')}:{' '}
                {t(entry.evidence.directInEColi ? 'modeling.catalog.yes' : 'modeling.catalog.no')}
              </p>
              {entry.evidence.boundaryNotes.map((note) => (
                <p className="catalog-boundary" key={note}>
                  <Icon name="warning" size={14} />
                  {note}
                </p>
              ))}
            </section>

            <section className="catalog-detail-section">
              <h4>{t('modeling.catalog.observations')}</h4>
              {Array.isArray(entry.quantitativeObservations) ? (
                <div className="catalog-observation-list">
                  {entry.quantitativeObservations.map((observation) => (
                    <section
                      className="catalog-observation"
                      aria-label={t('modeling.catalog.sourceObservation')}
                      key={`${observation.sourceRef}-${observation.metric}`}
                    >
                      <span className="catalog-observation__label">
                        {t('modeling.catalog.sourceObservation')}
                      </span>
                      <div className="catalog-observation__reading">
                        <strong>{observation.metric}</strong>
                        <span>{formatCatalogValue(observation.value, unknownLabel)}</span>
                        <span>{formatCatalogValue(observation.unit, unknownLabel)}</span>
                      </div>
                      <dl className="catalog-observation__context">
                        <ValueRow label={t('modeling.catalog.sourceReference')}>
                          <code>{observation.sourceRef}</code>
                        </ValueRow>
                        {(['host', 'strain', 'vector', 'culture'] as const).map((key) => (
                          <ValueRow key={key} label={t(`modeling.catalog.contextFields.${key}`)}>
                            <span
                              className={
                                observation.context[key].state === 'unknown'
                                  ? 'catalog-unknown'
                                  : undefined
                              }
                            >
                              {formatCatalogValue(observation.context[key], unknownLabel)}
                            </span>
                          </ValueRow>
                        ))}
                      </dl>
                      <small>{observation.originalMeaning}</small>
                      <div className="catalog-observation__transferability">
                        <strong>{t('modeling.catalog.transferability')}</strong>
                        <p>{observation.transferability}</p>
                      </div>
                      <small className="catalog-boundary">
                        {t('modeling.catalog.notModelParameter')}
                      </small>
                    </section>
                  ))}
                </div>
              ) : (
                <UnknownText value={entry.quantitativeObservations} unknownLabel={unknownLabel} />
              )}
            </section>
          </details>

          <section className="catalog-detail-section">
            <h4>{t('modeling.catalog.literature')}</h4>
            <div className="catalog-literature-list">
              {entry.literature.map((source) => (
                <article key={source.id}>
                  <h5>{source.title}</h5>
                  <p>{source.authors}</p>
                  <dl>
                    <ValueRow label={t('modeling.catalog.sourceId')}>
                      <LongValue value={source.id} />
                    </ValueRow>
                    <ValueRow label={t('modeling.catalog.doi')}>
                      {source.doi.state === 'known' ? (
                        <LongValue
                          value={source.doi.value}
                          href={`https://doi.org/${source.doi.value}`}
                        />
                      ) : (
                        <span className="catalog-unknown">
                          {formatCatalogValue(source.doi, unknownLabel)}
                        </span>
                      )}
                    </ValueRow>
                    <ValueRow label={t('modeling.catalog.pmid')}>
                      {source.pmid.state === 'known' ? (
                        <LongValue
                          value={source.pmid.value}
                          href={`https://pubmed.ncbi.nlm.nih.gov/${source.pmid.value}/`}
                        />
                      ) : (
                        <span className="catalog-unknown">
                          {formatCatalogValue(source.pmid, unknownLabel)}
                        </span>
                      )}
                    </ValueRow>
                    <ValueRow label={t('modeling.catalog.url')}>
                      <LongValue value={source.url} href={source.url} />
                    </ValueRow>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="catalog-detail-section">
            <h4>{t('modeling.catalog.sequence')}</h4>
            <p className="catalog-status-text">
              {t(`modeling.catalog.sequenceStatuses.${entry.sequence.status}`)}
            </p>
            <p
              className="catalog-sequence-overall"
              data-complete={entry.sequence.isCompleteSingleSequence ? 'true' : 'false'}
            >
              <Icon
                name={entry.sequence.isCompleteSingleSequence ? 'check' : 'warning'}
                size={14}
              />
              {t(
                entry.sequence.isCompleteSingleSequence
                  ? 'modeling.catalog.completeSingleSequenceEntry'
                  : 'modeling.catalog.notCompleteSingleSequenceEntry',
              )}
            </p>
            {Array.isArray(entry.sequence.records) ? (
              <div className="catalog-sequence-list">
                {entry.sequence.records.map((record) => (
                  <article key={`${record.kind}-${record.accession}`}>
                    <span>{record.kind}</span>
                    <strong>{t(`modeling.catalog.sequenceTypes.${record.sequenceType}`)}</strong>
                    <LongValue value={record.accession} />
                    <small>
                      {record.complete
                        ? t('modeling.catalog.completeSequence')
                        : t('modeling.catalog.partialSequence')}
                    </small>
                    <dl className="catalog-sequence-record__metadata">
                      <ValueRow label={t('modeling.catalog.sourceReference')}>
                        <code>{record.sourceRef}</code>
                      </ValueRow>
                      <ValueRow label={t('modeling.catalog.sequenceVersion')}>
                        <span
                          className={record.version.state === 'unknown' ? 'catalog-unknown' : ''}
                        >
                          {formatCatalogValue(record.version, unknownLabel)}
                        </span>
                      </ValueRow>
                      <ValueRow label={t('modeling.catalog.sequenceOrientation')}>
                        {t(`modeling.catalog.orientations.${record.orientation}`)}
                      </ValueRow>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <UnknownText value={entry.sequence.records} unknownLabel={unknownLabel} />
            )}
          </section>

          <section className="catalog-detail-section">
            <h4>{t('modeling.catalog.modelingBoundary')}</h4>
            <p>{t(`modeling.catalog.modelingCompatibilities.${entry.modeling.compatibility}`)}</p>
            <div className="catalog-compatible-kinds catalog-status-text">
              {compatibleNetworkRoles.map((role) => (
                <span key={role}>{t(`modeling.catalog.networkRoles.${role}`)}</span>
              ))}
            </div>
            <div className="catalog-modeling-requirements">
              <PublicRequirement
                title={t('modeling.catalog.measurementPlan')}
                description={t('modeling.catalog.measurementPlanSummary', {
                  count: entry.modeling.requiredMeasurements.length,
                })}
              />
              <PublicRequirement
                title={t('modeling.catalog.calibrationPlan')}
                description={t('modeling.catalog.calibrationPlanSummary', {
                  count: entry.modeling.calibrationRequirements.length,
                })}
              />
              <PublicRequirement
                title={t('modeling.catalog.parameterInferenceBoundary')}
                description={t('modeling.catalog.noAutomaticParameterInference')}
                warning
              />
            </div>
          </section>
        </>
      ) : (
        <div className="catalog-detail-empty">
          <Icon name="flask" size={24} />
          <p>{t('modeling.catalog.selectCandidate')}</p>
        </div>
      )}

      <footer className="catalog-entry-detail__actions">
        <div aria-live="polite">
          {!entry
            ? t('modeling.catalog.selectCandidate')
            : entry.evidence.reviewStatus !== 'passed'
              ? t('modeling.catalog.reviewRequired')
              : !targetNetworkRole
                ? t('modeling.catalog.selectTargetNetworkRole')
                : !nodeKindCompatible
                  ? t('modeling.catalog.incompatibleNodeKind')
                  : applicationAssessment
                    ? t(`modeling.catalog.applicationReasons.${applicationAssessment.reason}`)
                    : t('modeling.catalog.selectCandidate')}
        </div>
        <div className="catalog-entry-detail__action-buttons">
          <button
            className="button button--primary"
            type="button"
            disabled={!applyEnabled}
            onClick={applyToNetwork}
          >
            <Icon name="network" size={15} />
            {t('modeling.catalog.applyToNetwork')}
          </button>
          <button
            className="button button--ghost"
            type="button"
            disabled={!attachEnabled || (!onAttachReference && !onAttach)}
            onClick={attachReference}
          >
            <Icon name="link" size={15} />
            {t('modeling.catalog.attach')}
          </button>
        </div>
      </footer>
    </section>
  );
}

interface SignalTableProps {
  title: string;
  signals: CatalogSignal[] | UnknownValue;
  unknownLabel: string;
}

function SignalTable({ title, signals, unknownLabel }: SignalTableProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className="catalog-signal-table">
      <h4>{title}</h4>
      {Array.isArray(signals) ? (
        <table>
          <thead>
            <tr>
              <th>{t('modeling.catalog.signal')}</th>
              <th>{t('modeling.catalog.direction')}</th>
              <th>{t('modeling.catalog.unit')}</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => (
              <tr key={signal.id}>
                <td>{formatCatalogValue(signal.name, unknownLabel)}</td>
                <td>
                  <span className="catalog-signal-direction" data-direction={signal.direction}>
                    <Icon
                      name={
                        signal.direction === 'positive' || signal.direction === 'negative'
                          ? 'arrow'
                          : signal.direction === 'mixed'
                            ? 'network'
                            : 'warning'
                      }
                      size={13}
                    />
                    {t(`modeling.catalog.effectDirections.${signal.direction}`)}
                  </span>
                </td>
                <td>{formatCatalogValue(signal.unit, unknownLabel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <UnknownText value={signals} unknownLabel={unknownLabel} />
      )}
    </section>
  );
}

function UnknownText({
  value,
  unknownLabel,
}: {
  value: UnknownValue;
  unknownLabel: string;
}): JSX.Element {
  return <p className="catalog-unknown">{formatCatalogValue(value, unknownLabel)}</p>;
}

function ValueRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PublicRequirement({
  title,
  description,
  warning = false,
}: {
  title: string;
  description: string;
  warning?: boolean;
}): JSX.Element {
  return (
    <section
      className={
        warning ? 'catalog-requirement catalog-requirement--warning' : 'catalog-requirement'
      }
    >
      <h5>{title}</h5>
      <p>{description}</p>
    </section>
  );
}

function LongValue({ value, href }: { value: string; href?: string }): JSX.Element {
  const { t } = useTranslation();
  const content = href ? (
    <a href={href} target="_blank" rel="noreferrer" title={value}>
      {value}
    </a>
  ) : (
    <code title={value}>{value}</code>
  );
  return (
    <div className="catalog-long-value">
      <span className="catalog-value--long">{content}</span>
      <details className="catalog-value-disclosure">
        <summary>{t('modeling.catalog.showFullValue')}</summary>
        {content}
      </details>
    </div>
  );
}

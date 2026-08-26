import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';
import type {
  ReleaseCatalogLanguage,
  ReleaseCatalogLocalizedName,
} from '../../modeling/catalog/releaseCatalogPresentation';
import type {
  BfnCatalogComponentDetail,
  BfnCatalogDetail,
  BfnCatalogDetailCompatibility,
  BfnCatalogDetailContext,
  BfnCatalogDetailObservedPair,
  BfnCatalogDetailSource,
  BfnCatalogResponseDetail,
} from './catalogDetail';
import type { BfnProject } from '../types';
import { BfnCatalogInstantiationPanel } from './BfnCatalogInstantiationPanel';

interface BfnCatalogDetailViewProps {
  detail: BfnCatalogDetail;
  language: ReleaseCatalogLanguage;
  project: BfnProject;
  onBack: () => void;
  onInstantiate: (responseId: string, createInputSource: boolean) => void;
}

export function BfnCatalogDetailView({
  detail,
  language,
  project,
  onBack,
  onInstantiate,
}: BfnCatalogDetailViewProps) {
  const { t } = useTranslation();
  const componentName = localized(detail.component.displayNames, language);
  const catalogName = localized(detail.component.names, language);
  return (
    <article
      className="bfn-catalog-detail"
      aria-label={t('bfn.catalogDetail.detailLabel', { name: componentName })}
    >
      <button className="bfn-catalog-detail__back" type="button" onClick={onBack}>
        <Icon name="arrow" size={14} />
        <span>{t('bfn.catalogDetail.back')}</span>
      </button>

      <header className="bfn-catalog-detail__summary">
        <div className="bfn-catalog-detail__identity">
          <span>
            {t(
              detail.kind === 'response'
                ? 'bfn.catalogDetail.responseKicker'
                : 'bfn.catalogDetail.componentKicker',
            )}
          </span>
          <h2>{componentName}</h2>
          {catalogName !== componentName ? <p>{catalogName}</p> : null}
        </div>
        {detail.kind === 'response' ? (
          <p className="bfn-catalog-detail__flow">
            <strong>{localized(detail.inputSignalNames, language)}</strong>
            <span aria-hidden="true"> → </span>
            <strong>{t('bfn.catalogDiscovery.normalizedOutput')}</strong>
          </p>
        ) : null}
        <div className="bfn-catalog-detail__status-line">
          <span className="bfn-catalog-status" data-status={detail.status}>
            {t(`bfn.catalogDiscovery.statuses.${detail.status}`)}
          </span>
          <span>{contextSummary(detail.context, t)}</span>
        </div>
        <p className="bfn-catalog-detail__source-summary">
          {t('bfn.catalogDetail.sourceSummary', {
            source: sourceSummary(detail.sources[0] ?? null, t),
          })}
        </p>
        <p className="bfn-catalog-detail__boundary">
          {t(`bfn.catalogDetail.statusDescriptions.${detail.status}`)}
        </p>
      </header>

      {detail.kind === 'response' && detail.canAddToNetwork ? (
        <BfnCatalogInstantiationPanel
          detail={detail}
          project={project}
          language={language}
          onInstantiate={onInstantiate}
        />
      ) : null}

      {detail.kind === 'response' ? (
        <ResponseDetailSections detail={detail} language={language} />
      ) : (
        <ComponentCapability detail={detail} />
      )}

      <ContextSection context={detail.context} />
      <ComponentSection detail={detail.component} />
      <SourcesSection sources={detail.sources} />
      <ObservedPairsSection pairs={detail.observedPairs} language={language} />
      <CompatibilitySection entries={detail.compatibility} language={language} />
      <AdvancedSection detail={detail} />
    </article>
  );
}

function ResponseDetailSections({
  detail,
  language,
}: {
  detail: BfnCatalogResponseDetail;
  language: ReleaseCatalogLanguage;
}) {
  const { t } = useTranslation();
  const model = detail.runtimeModel;
  return (
    <>
      {model ? (
        <DetailSection
          title={t('bfn.catalogDetail.runtimeModel.title')}
          tone="accent"
          description={t('bfn.catalogDetail.runtimeModel.description')}
        >
          <PropertyList
            rows={[
              [
                t('bfn.catalogDetail.runtimeModel.responseModel'),
                t('bfn.catalogDetail.runtimeModel.hillResponse'),
              ],
              [t('bfn.catalogDetail.runtimeModel.input'), localized(model.inputNames, language)],
              [
                t('bfn.catalogDetail.runtimeModel.output'),
                t('bfn.catalogDiscovery.normalizedOutput'),
              ],
              [t('bfn.catalogDetail.runtimeModel.minimum'), '0'],
              [t('bfn.catalogDetail.runtimeModel.maximum'), '1'],
              [
                t('bfn.catalogDetail.runtimeModel.halfResponse'),
                formatMeasurement(model.halfResponseConcentration, model.halfResponseUnit),
              ],
              [
                t('bfn.catalogDetail.runtimeModel.hillCoefficient'),
                formatNumber(model.hillCoefficient),
              ],
              [
                t('bfn.catalogDetail.runtimeModel.workingRange'),
                formatRange(
                  model.workingRange.min,
                  model.workingRange.max,
                  model.workingRange.unit,
                ),
              ],
              [
                t('bfn.catalogDetail.runtimeModel.biologicalDirection'),
                t(`bfn.catalogDetail.runtimeModel.directions.${model.biologicalDirection}`),
              ],
            ]}
          />
          {model.biologicalDirection === 'derepression' ? (
            <p className="bfn-catalog-detail__note">
              {t('bfn.catalogDetail.runtimeModel.derepressionExplanation')}
            </p>
          ) : null}
          <p className="bfn-catalog-detail__boundary">
            {t('bfn.catalogDetail.runtimeModel.validationBoundary')}
          </p>
        </DetailSection>
      ) : null}

      {detail.status === 'qualitative-only' ? (
        <DetailSection
          title={t('bfn.catalogDetail.qualitative.title')}
          description={t('bfn.catalogDetail.qualitative.description')}
        >
          <PropertyList
            rows={[
              [
                t('bfn.catalogDetail.qualitative.observation'),
                detail.sourceResponse?.notes ?? notRecorded(t),
              ],
              [
                t('bfn.catalogDetail.qualitative.evidenceLocation'),
                detail.advanced.evidenceLocation ?? notRecorded(t),
              ],
            ]}
          />
          <p className="bfn-catalog-detail__boundary">
            {t('bfn.catalogDetail.qualitative.numericBoundary')}
          </p>
        </DetailSection>
      ) : (
        <SourceResponseSection detail={detail} />
      )}
    </>
  );
}

function SourceResponseSection({ detail }: { detail: BfnCatalogResponseDetail }) {
  const { t } = useTranslation();
  const source = detail.sourceResponse;
  if (!source) return null;
  const nonRunnable = detail.runtimeModel === null;
  const rows: Array<readonly [string, string]> = [
    [t('bfn.catalogDetail.sourceParameters.reportedModel'), reportedModel(source.modelType, t)],
    [t('bfn.catalogDetail.sourceParameters.basal'), formatNullableNumber(source.basal, t)],
    [t('bfn.catalogDetail.sourceParameters.maximum'), formatNullableNumber(source.maximum, t)],
    [
      t('bfn.catalogDetail.sourceParameters.ec50'),
      formatNullableMeasurement(source.ec50, source.ec50Unit, t),
    ],
    [
      t('bfn.catalogDetail.sourceParameters.hillCoefficient'),
      formatNullableNumber(source.hillCoefficient, t),
    ],
    [
      t('bfn.catalogDetail.sourceParameters.workingRange'),
      source.workingRange
        ? formatRange(
            source.workingRange.min,
            source.workingRange.max,
            source.workingRange.unit ?? source.ec50Unit ?? '',
          )
        : notRecorded(t),
    ],
  ];
  if (source.approximateValue) {
    rows.push([
      t('bfn.catalogDetail.sourceParameters.approximation'),
      source.approximationQualifier ?? t('bfn.catalogDetail.sourceParameters.approximate'),
    ]);
  }
  if (source.reportedParameterSymbol) {
    rows.push([
      t('bfn.catalogDetail.sourceParameters.reportedSymbol'),
      source.reportedParameterSymbol,
    ]);
  }
  return (
    <DetailSection
      title={t('bfn.catalogDetail.sourceParameters.title')}
      description={
        nonRunnable
          ? t('bfn.catalogDetail.sourceParameters.nonRunnableDescription')
          : t('bfn.catalogDetail.sourceParameters.description')
      }
    >
      <PropertyList rows={rows} />
      {detail.runtimeModel ? (
        <p className="bfn-catalog-detail__note">
          {t('bfn.catalogDetail.sourceParameters.normalizationExplanation')}
        </p>
      ) : null}
    </DetailSection>
  );
}

function ComponentCapability({ detail }: { detail: BfnCatalogComponentDetail }) {
  const { t } = useTranslation();
  const sender = detail.currentNumericCapability === 'no-quantitative-sender-function';
  return (
    <DetailSection
      title={t('bfn.catalogDetail.numericCapability')}
      description={t(
        sender ? 'bfn.catalogDetail.senderBoundary' : 'bfn.catalogDetail.referenceBoundary',
      )}
    >
      <PropertyList
        rows={[
          [
            t('bfn.catalogDetail.currentCapability'),
            t(
              sender
                ? 'bfn.catalogDiscovery.noSenderFunction'
                : 'bfn.catalogDiscovery.statuses.reference-only',
            ),
          ],
        ]}
      />
    </DetailSection>
  );
}

function ContextSection({ context }: { context: BfnCatalogDetailContext | null }) {
  const { t } = useTranslation();
  const rows: Array<readonly [string, string]> = context
    ? [
        [t('bfn.catalogDetail.context.host'), valueOrMissing(context.hostSpecies, t)],
        [t('bfn.catalogDetail.context.strain'), valueOrMissing(context.hostStrain, t)],
        [t('bfn.catalogDetail.context.vector'), valueOrMissing(context.vectorSystem, t)],
        [t('bfn.catalogDetail.context.promoter'), valueOrMissing(context.promoterConfiguration, t)],
        [t('bfn.catalogDetail.context.reporter'), valueOrMissing(context.reporter, t)],
        [t('bfn.catalogDetail.context.medium'), valueOrMissing(context.cultureMedium, t)],
        [t('bfn.catalogDetail.context.temperature'), valueOrMissing(context.temperature, t)],
        [t('bfn.catalogDetail.context.induction'), valueOrMissing(context.inductionConditions, t)],
        [t('bfn.catalogDetail.context.exposure'), valueOrMissing(context.exposureTime, t)],
        [t('bfn.catalogDetail.context.platform'), valueOrMissing(context.measurementPlatform, t)],
        [t('bfn.catalogDetail.context.unit'), valueOrMissing(context.measurementUnit, t)],
        [
          t('bfn.catalogDetail.context.normalization'),
          valueOrMissing(context.normalizationMethod, t),
        ],
        [
          t('bfn.catalogDetail.context.background'),
          valueOrMissing(context.backgroundSubtraction, t),
        ],
        [
          t('bfn.catalogDetail.context.biologicalReplicates'),
          countOrMissing(context.biologicalReplicates, t),
        ],
        [
          t('bfn.catalogDetail.context.technicalReplicates'),
          countOrMissing(context.technicalReplicates, t),
        ],
      ]
    : [];
  return (
    <DetailSection title={t('bfn.catalogDetail.context.title')}>
      {context ? <PropertyList rows={rows} /> : <p>{notRecorded(t)}</p>}
      {context?.measurementDetails ? (
        <details className="bfn-catalog-detail__nested">
          <summary>{t('bfn.catalogDetail.context.measurementDetails')}</summary>
          <PropertyList rows={objectRows(context.measurementDetails, t)} />
        </details>
      ) : null}
    </DetailSection>
  );
}

function ComponentSection({ detail }: { detail: BfnCatalogDetail['component'] }) {
  const { t } = useTranslation();
  const sequenceBoundary = detail.sequenceReference
    ? detail.sequenceMetadata?.sequence_checksum_sha256
      ? t('bfn.catalogDetail.component.sequenceChecksumRecorded')
      : t('bfn.catalogDetail.component.sequenceReferenceOnly')
    : notRecorded(t);
  return (
    <DetailSection title={t('bfn.catalogDetail.component.title')}>
      <PropertyList
        rows={[
          [t('bfn.catalogDetail.component.regulator'), valueOrMissing(detail.regulatorOrEnzyme, t)],
          [t('bfn.catalogDetail.component.promoter'), valueOrMissing(detail.promoter, t)],
          [t('bfn.catalogDetail.component.reporter'), valueOrMissing(detail.reporter, t)],
          [t('bfn.catalogDetail.component.vector'), valueOrMissing(detail.vectorOrBackbone, t)],
          [
            t('bfn.catalogDetail.component.copyNumber'),
            valueOrMissing(detail.copyNumberContext, t),
          ],
          [
            t('bfn.catalogDetail.component.expression'),
            valueOrMissing(detail.expressionConfiguration, t),
          ],
          [
            t('bfn.catalogDetail.component.inputDescription'),
            valueOrMissing(detail.inputDescription, t),
          ],
          [
            t('bfn.catalogDetail.component.outputDescription'),
            valueOrMissing(detail.outputDescription, t),
          ],
          [
            t('bfn.catalogDetail.component.sequenceStatus'),
            t(`bfn.catalogDetail.component.sequenceStatuses.${detail.sequenceStatus}`, {
              defaultValue: detail.sequenceStatus.replaceAll('_', ' '),
            }),
          ],
          [
            t('bfn.catalogDetail.component.sequenceSource'),
            valueOrMissing(detail.sequenceReference, t),
          ],
          [t('bfn.catalogDetail.component.sequenceVerification'), sequenceBoundary],
          [
            t('bfn.catalogDetail.component.constructionStatus'),
            t(
              detail.constructionReady
                ? 'bfn.catalogDetail.component.constructionReady'
                : 'bfn.catalogDetail.component.constructionIncomplete',
            ),
          ],
          [
            t('bfn.catalogDetail.component.evidenceGaps'),
            detail.evidenceGaps.length ? detail.evidenceGaps.join(' · ') : notRecorded(t),
          ],
        ]}
      />
      {detail.sequenceMetadata ? (
        <details className="bfn-catalog-detail__nested">
          <summary>{t('bfn.catalogDetail.component.sequenceMetadata')}</summary>
          <PropertyList
            rows={[
              [
                t('bfn.catalogDetail.component.sequenceSourceType'),
                valueOrMissing(detail.sequenceMetadata.sequence_source_type, t),
              ],
              [
                t('bfn.catalogDetail.component.sequenceAccession'),
                releaseValueOrMissing(detail.sequenceMetadata.sequence_accession, t),
              ],
              [
                t('bfn.catalogDetail.component.sequenceRepository'),
                valueOrMissing(detail.sequenceMetadata.sequence_repository_url, t),
              ],
              [
                t('bfn.catalogDetail.component.sequenceLength'),
                detail.sequenceMetadata.sequence_length_bp === null
                  ? notRecorded(t)
                  : `${detail.sequenceMetadata.sequence_length_bp} bp`,
              ],
              [
                t('bfn.catalogDetail.component.sequenceRetrieved'),
                valueOrMissing(detail.sequenceMetadata.sequence_retrieval_date, t),
              ],
              [
                t('bfn.catalogDetail.component.sequenceVerificationStatus'),
                valueOrMissing(detail.sequenceMetadata.sequence_verification_status, t),
              ],
              [
                t('bfn.catalogDetail.component.assemblyContext'),
                valueOrMissing(detail.sequenceMetadata.assembly_context, t),
              ],
              [
                t('bfn.catalogDetail.component.missingSequenceElements'),
                detail.sequenceMetadata.missing_sequence_elements.length
                  ? detail.sequenceMetadata.missing_sequence_elements.join(' · ')
                  : notRecorded(t),
              ],
            ]}
          />
        </details>
      ) : null}
    </DetailSection>
  );
}

function SourcesSection({ sources }: { sources: readonly BfnCatalogDetailSource[] }) {
  const { t } = useTranslation();
  return (
    <DetailSection title={t('bfn.catalogDetail.sources.title')}>
      {sources.length ? (
        <div className="bfn-catalog-detail__sources">
          {sources.map((source) => (
            <article key={source.id}>
              <header>
                <strong>{sourceSummary(source, t)}</strong>
                {source.primary ? <span>{t('bfn.catalogDetail.sources.primary')}</span> : null}
              </header>
              <p>{source.title}</p>
              <dl>
                {source.journalOrRepository ? (
                  <div>
                    <dt>{t('bfn.catalogDetail.sources.publication')}</dt>
                    <dd>{source.journalOrRepository}</dd>
                  </div>
                ) : null}
                {source.doi ? (
                  <div>
                    <dt>DOI</dt>
                    <dd>{source.doi}</dd>
                  </div>
                ) : null}
                {source.pmid ? (
                  <div>
                    <dt>PMID</dt>
                    <dd>{source.pmid}</dd>
                  </div>
                ) : null}
                {source.pmcid ? (
                  <div>
                    <dt>PMCID</dt>
                    <dd>{source.pmcid}</dd>
                  </div>
                ) : null}
              </dl>
              {source.primaryUrl ? (
                <a href={source.primaryUrl} target="_blank" rel="noreferrer noopener">
                  {t('bfn.catalogDetail.sources.open')}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p>{notRecorded(t)}</p>
      )}
    </DetailSection>
  );
}

function ObservedPairsSection({
  pairs,
  language,
}: {
  pairs: readonly BfnCatalogDetailObservedPair[];
  language: ReleaseCatalogLanguage;
}) {
  const { t } = useTranslation();
  if (!pairs.length) return null;
  return (
    <DetailSection
      title={t('bfn.catalogDetail.pairs.title')}
      description={t('bfn.catalogDetail.pairs.boundary')}
    >
      <div className="bfn-catalog-detail__evidence-list">
        {pairs.map((pair) => (
          <article key={pair.id}>
            <strong>
              {pair.senderNames ? localized(pair.senderNames, language) : notRecorded(t)}
              <span aria-hidden="true"> + </span>
              {pair.receiverNames ? localized(pair.receiverNames, language) : notRecorded(t)}
            </strong>
            <PropertyList
              rows={[
                [t('bfn.catalogDetail.pairs.observation'), pair.observedEffect],
                [t('bfn.catalogDetail.pairs.responseClass'), pair.responseClass],
                [t('bfn.catalogDetail.pairs.condition'), valueOrMissing(pair.condition, t)],
                [t('bfn.catalogDetail.pairs.source'), sourceListSummary(pair.sources, t)],
                [
                  t('bfn.catalogDetail.pairs.evidenceLocation'),
                  valueOrMissing(pair.evidenceLocation, t),
                ],
                [
                  t('bfn.catalogDetail.pairs.notes'),
                  pair.notes.length ? pair.notes.join(' · ') : notRecorded(t),
                ],
              ]}
            />
          </article>
        ))}
      </div>
    </DetailSection>
  );
}

function CompatibilitySection({
  entries,
  language,
}: {
  entries: readonly BfnCatalogDetailCompatibility[];
  language: ReleaseCatalogLanguage;
}) {
  const { t } = useTranslation();
  if (!entries.length) return null;
  return (
    <DetailSection
      title={t('bfn.catalogDetail.compatibility.title')}
      description={t('bfn.catalogDetail.compatibility.boundary')}
    >
      <div className="bfn-catalog-detail__evidence-list">
        {entries.map((entry) => (
          <article key={entry.id}>
            <strong>
              {entry.inputNames ? localized(entry.inputNames, language) : notRecorded(t)}
            </strong>
            <PropertyList
              rows={[
                [t('bfn.catalogDetail.compatibility.relation'), entry.relationType],
                [t('bfn.catalogDetail.compatibility.outcome'), entry.qualitativeOutcome],
                [t('bfn.catalogDetail.compatibility.context'), contextSummary(entry.context, t)],
                [t('bfn.catalogDetail.compatibility.source'), sourceListSummary(entry.sources, t)],
                [
                  t('bfn.catalogDetail.compatibility.evidenceLocation'),
                  valueOrMissing(entry.evidenceLocation, t),
                ],
                [
                  t('bfn.catalogDetail.compatibility.notes'),
                  entry.notes.length ? entry.notes.join(' · ') : notRecorded(t),
                ],
              ]}
            />
          </article>
        ))}
      </div>
    </DetailSection>
  );
}

function AdvancedSection({ detail }: { detail: BfnCatalogDetail }) {
  const { t } = useTranslation();
  const identityRows: Array<readonly [string, string]> =
    detail.kind === 'response'
      ? [
          [t('bfn.catalogDetail.advanced.responseRecord'), detail.advanced.responseId],
          [t('bfn.catalogDetail.advanced.contextRecord'), detail.advanced.parameterContextId],
          [
            t('bfn.catalogDetail.advanced.evidenceLocation'),
            valueOrMissing(detail.advanced.evidenceLocation, t),
          ],
          [
            t('bfn.catalogDetail.advanced.qualityLevel'),
            valueOrMissing(detail.advanced.qualityLevel, t),
          ],
          [
            t('bfn.catalogDetail.advanced.revisionStatus'),
            valueOrMissing(detail.advanced.revisionStatus, t),
          ],
          [
            t('bfn.catalogDetail.advanced.lastVerified'),
            valueOrMissing(detail.advanced.lastVerifiedAt, t),
          ],
        ]
      : [
          [t('bfn.catalogDetail.advanced.revisionStatus'), detail.component.revisionStatus],
          [t('bfn.catalogDetail.advanced.lastVerified'), detail.component.lastVerifiedAt],
        ];
  return (
    <details className="bfn-catalog-detail__advanced">
      <summary>{t('bfn.catalogDetail.advanced.title')}</summary>
      <PropertyList
        rows={[
          [t('bfn.catalogDetail.advanced.catalogVersion'), detail.catalogVersion],
          [t('bfn.catalogDetail.advanced.componentRecord'), detail.component.id],
          ...identityRows,
        ]}
      />
      {detail.kind === 'response' &&
      detail.status === 'qualitative-only' &&
      detail.sourceResponse ? (
        <details className="bfn-catalog-detail__nested">
          <summary>{t('bfn.catalogDetail.advanced.auditParameters')}</summary>
          <PropertyList
            rows={[
              [
                t('bfn.catalogDetail.sourceParameters.basal'),
                formatNullableNumber(detail.sourceResponse.basal, t),
              ],
              [
                t('bfn.catalogDetail.sourceParameters.maximum'),
                formatNullableNumber(detail.sourceResponse.maximum, t),
              ],
              [
                t('bfn.catalogDetail.sourceParameters.ec50'),
                formatNullableMeasurement(
                  detail.sourceResponse.ec50,
                  detail.sourceResponse.ec50Unit,
                  t,
                ),
              ],
              [
                t('bfn.catalogDetail.sourceParameters.hillCoefficient'),
                formatNullableNumber(detail.sourceResponse.hillCoefficient, t),
              ],
            ]}
          />
          <p className="bfn-catalog-detail__boundary">
            {t('bfn.catalogDetail.qualitative.numericBoundary')}
          </p>
        </details>
      ) : null}
    </details>
  );
}

function DetailSection({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description?: string;
  tone?: 'accent';
  children: React.ReactNode;
}) {
  return (
    <section className="bfn-catalog-detail__section" data-tone={tone}>
      <header>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function PropertyList({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="bfn-catalog-detail__properties">
      {rows.map(([label, value], index) => (
        <div key={`${label}-${index}`}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function localized(names: ReleaseCatalogLocalizedName, language: ReleaseCatalogLanguage): string {
  return language === 'zh-CN' ? names.zh : names.en;
}

type Translate = ReturnType<typeof useTranslation>['t'];

function contextSummary(context: BfnCatalogDetailContext | null, t: Translate): string {
  if (!context) return notRecorded(t);
  return [context.hostSpecies, context.hostStrain].filter(Boolean).join(' · ') || notRecorded(t);
}

function sourceSummary(source: BfnCatalogDetailSource | null, t: Translate): string {
  if (!source) return notRecorded(t);
  return [source.authors, source.year].filter((value) => value !== null).join(' · ');
}

function sourceListSummary(sources: readonly BfnCatalogDetailSource[], t: Translate): string {
  return sources.length
    ? sources.map((source) => sourceSummary(source, t)).join(' · ')
    : notRecorded(t);
}

function notRecorded(t: Translate): string {
  return t('bfn.catalogDiscovery.notRecorded');
}

function valueOrMissing(value: string | null, t: Translate): string {
  return value && value.trim().length > 0 ? value : notRecorded(t);
}

function releaseValueOrMissing(value: unknown, t: Translate): string {
  if (value === null || value === undefined || value === '') return notRecorded(t);
  if (Array.isArray(value)) {
    return value.length
      ? value.map((entry) => releaseValueOrMissing(entry, t)).join(' · ')
      : notRecorded(t);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return notRecorded(t);
}

function countOrMissing(value: number | null, t: Translate): string {
  return value === null ? notRecorded(t) : String(value);
}

function formatNumber(value: number): string {
  const text = String(value);
  const match = /^(-?\d+(?:\.\d+)?)e([+-]?\d+)$/iu.exec(text);
  return match ? `${match[1]} × 10${superscript(Number(match[2]))}` : text;
}

function superscript(value: number): string {
  const digits: Record<string, string> = {
    '-': '⁻',
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  return String(value)
    .split('')
    .map((character) => digits[character] ?? character)
    .join('');
}

function formatMeasurement(value: number, unit: string): string {
  return `${formatNumber(value)} ${unit}`.trim();
}

function formatNullableNumber(value: number | null, t: Translate): string {
  return value === null ? notRecorded(t) : formatNumber(value);
}

function formatNullableMeasurement(
  value: number | null,
  unit: string | null,
  t: Translate,
): string {
  return value === null ? notRecorded(t) : formatMeasurement(value, unit ?? '');
}

function formatRange(minimum: number, maximum: number, unit: string): string {
  return `${formatNumber(minimum)}–${formatNumber(maximum)} ${unit}`.trim();
}

function reportedModel(value: string, t: Translate): string {
  if (value === 'four_parameter_logistic') return t('bfn.catalogDetail.sourceParameters.fourPl');
  if (value === 'hill_equation_n_fixed_1') return t('bfn.catalogDetail.sourceParameters.hillN1');
  return value.replaceAll('_', ' ');
}

function objectRows(
  value: Readonly<Record<string, unknown>>,
  t: Translate,
): Array<readonly [string, string]> {
  return Object.entries(value).map(([key, entry]) => [
    key.replaceAll('_', ' '),
    releaseValueOrMissing(entry, t),
  ]);
}

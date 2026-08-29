import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';
import type {
  ReleaseCatalogLanguage,
  ReleaseCatalogLocalizedName,
} from '../../modeling/catalog/releaseCatalogPresentation';
import type {
  SenderExtensionJsonValue,
  SenderRawPointRecord,
  SenderSourceRecord,
} from '../../modeling/catalog/sender/v1_2';
import type { BfnSemanticPresentation } from '../semantic/semanticPresentation';
import type { BfnCatalogSenderOutputDetail } from './catalogDetail';

interface Props {
  detail: BfnCatalogSenderOutputDetail;
  semantic: BfnSemanticPresentation | undefined;
  language: ReleaseCatalogLanguage;
  onBack: () => void;
}

type DetailRow = readonly [string, string | number | null | undefined];

export function BfnSenderEvidenceDetailView({ detail, semantic, language, onBack }: Props) {
  const { t } = useTranslation();
  const componentName = localized(detail.component.displayNames, language);
  const outputName = detail.outputSignal
    ? localized(detail.outputSignal.names, language)
    : t('bfn.senderEvidence.notResolved');
  const source = detail.sources[0];
  return (
    <article
      className="bfn-catalog-detail bfn-sender-evidence-detail"
      data-catalog-kind="sender-evidence"
      aria-label={t('bfn.senderEvidence.detailLabel', { name: componentName })}
    >
      <button className="bfn-catalog-detail__back" type="button" onClick={onBack}>
        <Icon name="arrow" size={14} />
        <span>{t('bfn.catalogDetail.back')}</span>
      </button>
      <header className="bfn-catalog-detail__summary bfn-sender-evidence-detail__summary">
        <div className="bfn-catalog-detail__identity">
          <span>{t('bfn.senderEvidence.kicker')}</span>
          <h2>{componentName}</h2>
        </div>
        <p className="bfn-catalog-detail__flow">
          <strong>{detail.output.input_definition.name}</strong>
          <span aria-hidden="true"> → </span>
          <strong>{outputName}</strong>
        </p>
        <div className="bfn-catalog-detail__status-line">
          <span className="bfn-catalog-status" data-status={detail.status}>
            {t('bfn.catalogDiscovery.statuses.' + detail.status)}
          </span>
          <span className="bfn-sender-evidence-badge">
            {t('bfn.senderEvidence.evidenceAvailable')}
          </span>
          <span>
            {detail.evidenceScopes
              .map((scope) => t('bfn.senderEvidence.scopes.' + scope))
              .join(' · ')}
          </span>
        </div>
        {source ? (
          <p className="bfn-catalog-detail__source-summary">
            {t('bfn.catalogDetail.sourceSummary', {
              source: [source.authors, source.year].join(' · '),
            })}
          </p>
        ) : null}
        <p className="bfn-catalog-detail__boundary">
          {t('bfn.senderEvidence.presentationBoundary')}
        </p>
      </header>
      <RuntimeSection detail={detail} />
      <SemanticSection semantic={semantic} />
      <DefinitionSection detail={detail} language={language} />
      <MeasurementSection detail={detail} />
      <ContextSection detail={detail} />
      <RawSection detail={detail} />
      <FunctionSection detail={detail} />
      {detail.output.decomposition_prohibited ? <PairBoundary /> : null}
      <ComponentSection detail={detail} />
      <SourcesSection sources={detail.sources} />
      <AdvancedSection detail={detail} />
    </article>
  );
}

function RuntimeSection({ detail }: { detail: BfnCatalogSenderOutputDetail }) {
  const { t } = useTranslation();
  return (
    <section
      className="bfn-sender-runtime"
      data-admitted={String(detail.runtimeAdmission.admitted)}
    >
      <header>
        <span>{t('bfn.senderEvidence.runtime.kicker')}</span>
        <h3>
          {t(
            detail.runtimeAdmission.admitted
              ? 'bfn.senderEvidence.runtime.admitted'
              : 'bfn.senderEvidence.runtime.unavailable',
          )}
        </h3>
      </header>
      <p>
        {t(
          detail.runtimeAdmission.admitted
            ? 'bfn.senderEvidence.runtime.admittedDescription'
            : 'bfn.senderEvidence.runtime.unavailableDescription',
        )}
      </p>
      {detail.runtimeAdmission.reasons.length ? (
        <ul>
          {detail.runtimeAdmission.reasons.map((reason) => (
            <li key={reason}>{t('bfn.senderEvidence.runtime.reasons.' + reason)}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SemanticSection({ semantic }: { semantic: BfnSemanticPresentation | undefined }) {
  const { t } = useTranslation();
  const resolved = semantic?.status === 'resolved';
  return (
    <Section title={t('bfn.semantic.classificationTitle')}>
      <PropertyList
        rows={[
          [
            t('bfn.semantic.functionalFamily'),
            resolved ? semantic.functionalFamilies[0]?.label : t('bfn.semantic.unavailable'),
          ],
          [
            t('bfn.semantic.biologicalFamily'),
            resolved ? semantic.biologicalFamilies[0]?.label : t('bfn.semantic.unavailable'),
          ],
        ]}
      />
    </Section>
  );
}

function DefinitionSection({
  detail,
  language,
}: {
  detail: BfnCatalogSenderOutputDetail;
  language: ReleaseCatalogLanguage;
}) {
  const { t } = useTranslation();
  const input = detail.output.input_definition;
  const output = detail.output.output_definition;
  return (
    <Section
      title={t('bfn.senderEvidence.definition.title')}
      description={t('bfn.senderEvidence.definition.description')}
    >
      <PropertyList
        rows={[
          [t('bfn.senderEvidence.definition.inputName'), input.name],
          [t('bfn.senderEvidence.definition.inputKind'), enumText(t, 'inputKinds', input.kind)],
          [t('bfn.senderEvidence.definition.inputUnit'), input.unit],
          [
            t('bfn.senderEvidence.definition.inputRange'),
            formatRange(input.working_range[0], input.working_range[1], input.unit),
          ],
          [
            t('bfn.senderEvidence.definition.outputSignal'),
            detail.outputSignal ? localized(detail.outputSignal.names, language) : null,
          ],
          [
            t('bfn.senderEvidence.definition.outputQuantity'),
            enumText(t, 'outputQuantities', output.kind),
          ],
          [t('bfn.senderEvidence.definition.outputUnit'), output.unit],
          [t('bfn.senderEvidence.definition.compartment'), output.compartment],
          [t('bfn.senderEvidence.definition.normalization'), output.normalization_basis],
          [t('bfn.senderEvidence.definition.timepoint'), output.timepoint],
          [t('bfn.senderEvidence.definition.steadyState'), output.steady_state_definition],
          [t('bfn.senderEvidence.definition.evidenceGrade'), detail.output.evidence_quality],
        ]}
      />
      {detail.evidenceScopes.includes('fixed_condition_time_course') ? (
        <p className="bfn-catalog-detail__note">
          {t('bfn.senderEvidence.boundaries.fixedTimeCourse')}
        </p>
      ) : null}
      {detail.evidenceScopes.includes('production_rate') ? (
        <p className="bfn-catalog-detail__note">
          {t('bfn.senderEvidence.boundaries.productionRate')}
        </p>
      ) : null}
    </Section>
  );
}

function MeasurementSection({ detail }: { detail: BfnCatalogSenderOutputDetail }) {
  const { t } = useTranslation();
  const value = detail.output.measurement;
  return (
    <Section title={t('bfn.senderEvidence.measurement.title')}>
      <PropertyList
        rows={[
          [t('bfn.senderEvidence.measurement.method'), value.method],
          [t('bfn.senderEvidence.measurement.instrument'), value.instrument],
          [t('bfn.senderEvidence.measurement.standard'), value.standard],
          [t('bfn.senderEvidence.measurement.internalStandard'), value.internal_standard],
          [
            t('bfn.senderEvidence.measurement.calibration'),
            yesNo(value.calibration_curve_reported, t),
          ],
          [t('bfn.senderEvidence.measurement.direct'), yesNo(value.direct_signal_measurement, t)],
          [t('bfn.senderEvidence.measurement.lod'), formatJson(value.lod)],
          [t('bfn.senderEvidence.measurement.loq'), formatJson(value.loq)],
        ]}
      />
    </Section>
  );
}

function ContextSection({ detail }: { detail: BfnCatalogSenderOutputDetail }) {
  const { t } = useTranslation();
  const value = detail.context;
  return (
    <Section title={t('bfn.catalogDetail.context.title')}>
      <PropertyList
        rows={[
          [t('bfn.catalogDetail.context.host'), value.hostSpecies],
          [t('bfn.catalogDetail.context.strain'), value.hostStrain],
          [t('bfn.catalogDetail.context.vector'), value.vectorSystem],
          [t('bfn.catalogDetail.context.promoter'), value.promoterConfiguration],
          [t('bfn.catalogDetail.context.reporter'), value.reporter],
          [t('bfn.catalogDetail.context.medium'), value.cultureMedium],
          [t('bfn.catalogDetail.context.temperature'), value.temperature],
          [t('bfn.catalogDetail.context.induction'), value.inductionConditions],
          [t('bfn.catalogDetail.context.exposure'), value.exposureTime],
          [t('bfn.catalogDetail.context.platform'), value.measurementPlatform],
          [t('bfn.catalogDetail.context.unit'), value.measurementUnit],
          [t('bfn.catalogDetail.context.normalization'), value.normalizationMethod],
          [t('bfn.catalogDetail.context.background'), value.backgroundSubtraction],
          [t('bfn.catalogDetail.context.biologicalReplicates'), value.biologicalReplicates],
          [t('bfn.catalogDetail.context.technicalReplicates'), value.technicalReplicates],
          [
            t('bfn.catalogDetail.context.measurementDetails'),
            value.measurementDetails ? JSON.stringify(value.measurementDetails) : null,
          ],
        ]}
      />
    </Section>
  );
}

function RawSection({ detail }: { detail: BfnCatalogSenderOutputDetail }) {
  const { t } = useTranslation();
  if (!detail.rawPoints.length) return null;
  const columns = rawColumns(t).filter((column) => column.visible(detail.rawPoints));
  return (
    <Section
      title={t('bfn.senderEvidence.raw.title')}
      description={t('bfn.senderEvidence.raw.description')}
    >
      <div className="bfn-sender-table-wrap" tabIndex={0}>
        <table className="bfn-sender-evidence-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.id}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.rawPoints.map((point) => (
              <tr key={point.raw_point_id}>
                {columns.map((column) => (
                  <td key={column.id}>{column.value(point, t)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail.evidenceScopes.includes('non_detection') ? (
        <p className="bfn-catalog-detail__boundary">
          {t('bfn.senderEvidence.boundaries.nonDetection')}
        </p>
      ) : null}
    </Section>
  );
}

interface RawColumn {
  id: string;
  label: string;
  visible: (points: readonly SenderRawPointRecord[]) => boolean;
  value: (point: SenderRawPointRecord, t: TFunction) => string;
}

function rawColumns(t: TFunction): RawColumn[] {
  const any = (
    points: readonly SenderRawPointRecord[],
    test: (point: SenderRawPointRecord) => boolean,
  ): boolean => points.some(test);
  return [
    {
      id: 'input',
      label: t('bfn.senderEvidence.raw.input'),
      visible: () => true,
      value: (point) =>
        point.input_label ??
        (point.input_value === null
          ? point.input_name
          : joinUnit(formatNumber(point.input_value), point.input_unit)),
    },
    {
      id: 'output',
      label: t('bfn.senderEvidence.raw.output'),
      visible: () => true,
      value: (point, translate) => {
        if (point.detection_status === 'ND') return translate('bfn.senderEvidence.raw.nd');
        if (point.detection_status === 'reported_range')
          return joinUnit(
            String(point.output_lower_bound) + '–' + String(point.output_upper_bound),
            point.output_unit,
          );
        return joinUnit(formatNumber(point.output_value), point.output_unit);
      },
    },
    {
      id: 'time',
      label: t('bfn.senderEvidence.raw.time'),
      visible: (points) => any(points, (point) => point.timepoint_h !== null),
      value: (point) => joinUnit(formatNumber(point.timepoint_h), 'h'),
    },
    {
      id: 'replicate',
      label: t('bfn.senderEvidence.raw.replicates'),
      visible: (points) =>
        any(points, (point) => point.replicate_count !== null || point.replicate_index !== null),
      value: (point) =>
        point.replicate_count !== null
          ? String(point.replicate_count)
          : formatNumber(point.replicate_index),
    },
    {
      id: 'error',
      label: t('bfn.senderEvidence.raw.error'),
      visible: (points) => any(points, (point) => point.error_value !== null),
      value: (point) =>
        [point.error_type, formatNumber(point.error_value)].filter(Boolean).join(' '),
    },
    {
      id: 'status',
      label: t('bfn.senderEvidence.raw.status'),
      visible: () => true,
      value: (point, translate) =>
        translate('bfn.senderEvidence.detectionStatuses.' + point.detection_status),
    },
    {
      id: 'location',
      label: t('bfn.senderEvidence.raw.location'),
      visible: (points) => any(points, (point) => point.evidence_location.length > 0),
      value: (point) => point.evidence_location,
    },
  ];
}

function FunctionSection({ detail }: { detail: BfnCatalogSenderOutputDetail }) {
  const { t } = useTranslation();
  if (!detail.functionParameters.length) return null;
  return (
    <Section
      title={t('bfn.senderEvidence.functions.title')}
      description={t('bfn.senderEvidence.functions.description')}
    >
      <p className="bfn-catalog-detail__boundary">{t('bfn.senderEvidence.boundaries.cellFree')}</p>
      <div className="bfn-catalog-detail__evidence-list">
        {detail.functionParameters.map((value) => (
          <article key={value.sender_output_id + value.source_id}>
            <strong>{value.model_type}</strong>
            <PropertyList
              rows={[
                [t('bfn.senderEvidence.functions.formula'), value.formula],
                [
                  t('bfn.senderEvidence.functions.parameters'),
                  JSON.stringify(value.parameter_json),
                ],
                [
                  t('bfn.senderEvidence.functions.inputRange'),
                  formatRange(value.valid_input_min, value.valid_input_max, value.input_unit),
                ],
                [
                  t('bfn.senderEvidence.functions.outputRange'),
                  formatRange(value.valid_output_min, value.valid_output_max, value.output_unit),
                ],
                [t('bfn.senderEvidence.functions.fitMethod'), value.fit_method],
                [t('bfn.senderEvidence.functions.reportedOrRefit'), value.reported_or_refit],
                [t('bfn.senderEvidence.functions.location'), value.evidence_location],
                [t('bfn.senderEvidence.functions.runtime'), yesNo(value.runtime_allowed, t)],
              ]}
            />
          </article>
        ))}
      </div>
    </Section>
  );
}

function PairBoundary() {
  const { t } = useTranslation();
  return (
    <Section title={t('bfn.senderEvidence.pair.title')}>
      <p className="bfn-catalog-detail__boundary">
        {t('bfn.senderEvidence.boundaries.effectivePair')}
      </p>
    </Section>
  );
}

function ComponentSection({ detail }: { detail: BfnCatalogSenderOutputDetail }) {
  const { t } = useTranslation();
  const value = detail.component;
  return (
    <Section title={t('bfn.catalogDetail.component.title')}>
      <PropertyList
        rows={[
          [t('bfn.catalogDetail.component.regulator'), value.regulatorOrEnzyme],
          [t('bfn.catalogDetail.component.promoter'), value.promoter],
          [t('bfn.catalogDetail.component.reporter'), value.reporter],
          [t('bfn.catalogDetail.component.vector'), value.vectorOrBackbone],
          [t('bfn.catalogDetail.component.copyNumber'), value.copyNumberContext],
          [t('bfn.catalogDetail.component.expression'), value.expressionConfiguration],
          [t('bfn.catalogDetail.component.inputDescription'), value.inputDescription],
          [t('bfn.catalogDetail.component.outputDescription'), value.outputDescription],
          [t('bfn.catalogDetail.component.sequenceStatus'), value.sequenceStatus],
          [t('bfn.catalogDetail.component.sequenceSource'), value.sequenceReference],
          [t('bfn.catalogDetail.component.evidenceGaps'), value.evidenceGaps.join(' · ')],
        ]}
      />
    </Section>
  );
}

function SourcesSection({ sources }: { sources: readonly SenderSourceRecord[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t('bfn.catalogDetail.sources.title')}>
      <div className="bfn-catalog-detail__sources">
        {sources.map((source) => (
          <article key={source.source_id}>
            <header>
              <strong>{source.authors}</strong>
              <span>{source.year}</span>
            </header>
            <p>{source.title}</p>
            <PropertyList
              rows={[
                [t('bfn.catalogDetail.sources.publication'), source.journal],
                [t('bfn.senderEvidence.sources.doi'), source.doi],
                [t('bfn.senderEvidence.sources.pmid'), source.pmid],
                [t('bfn.senderEvidence.sources.pmcid'), source.pmcid],
                [t('bfn.senderEvidence.sources.type'), source.source_type],
                [t('bfn.senderEvidence.sources.location'), source.verified_location],
              ]}
            />
            <SourceLinks source={source} />
          </article>
        ))}
      </div>
    </Section>
  );
}

function SourceLinks({ source }: { source: SenderSourceRecord }) {
  const { t } = useTranslation();
  const links = [
    source.primary_url ? [source.primary_url, t('bfn.senderEvidence.sources.primaryUrl')] : null,
    source.supplementary_url
      ? [source.supplementary_url, t('bfn.senderEvidence.sources.supplement')]
      : null,
    source.data_repository_url
      ? [source.data_repository_url, t('bfn.senderEvidence.sources.repository')]
      : null,
    source.doi ? ['https://doi.org/' + source.doi, t('bfn.senderEvidence.sources.openDoi')] : null,
  ]
    .filter((value): value is string[] => value !== null)
    .filter(
      (value, index, values) =>
        values.findIndex((candidate) => candidate[0] === value[0]) === index,
    );
  if (!links.length) return null;
  return (
    <div className="bfn-sender-source-links">
      {links.map(([href, label]) => (
        <a key={href} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      ))}
    </div>
  );
}

function AdvancedSection({ detail }: { detail: BfnCatalogSenderOutputDetail }) {
  const { t } = useTranslation();
  return (
    <details className="bfn-catalog-detail__advanced">
      <summary>{t('bfn.catalogDetail.advanced.title')}</summary>
      <PropertyList
        rows={[
          [t('bfn.senderEvidence.advanced.baseRelease'), detail.catalogVersion],
          [
            t('bfn.senderEvidence.advanced.extensionRelease'),
            detail.extensionName + ' · V' + detail.extensionVersion,
          ],
          [t('bfn.senderEvidence.advanced.outputId'), detail.senderOutputId],
          [t('bfn.senderEvidence.advanced.componentId'), detail.component.id],
          [t('bfn.senderEvidence.advanced.contextId'), detail.context.id],
          [t('bfn.senderEvidence.advanced.signalId'), detail.output.output_signal_id],
          [t('bfn.senderEvidence.advanced.sourceIds'), detail.output.source_ids.join(' · ')],
          [t('bfn.senderEvidence.advanced.evidenceLocation'), detail.output.evidence_location],
          [t('bfn.senderEvidence.advanced.lastVerified'), detail.output.last_verified_at],
          [
            t('bfn.senderEvidence.advanced.reasonCodes'),
            detail.runtimeAdmission.reasons.join(' · '),
          ],
        ]}
      />
      {detail.evidenceTrace.length ? (
        <details className="bfn-catalog-detail__nested">
          <summary>
            {t('bfn.senderEvidence.trace.title', { count: detail.evidenceTrace.length })}
          </summary>
          <div className="bfn-catalog-detail__evidence-list">
            {detail.evidenceTrace.map((trace) => (
              <article key={trace.trace_id}>
                <strong>{trace.field_path}</strong>
                <PropertyList
                  rows={[
                    [t('bfn.senderEvidence.trace.value'), trace.value_summary],
                    [t('bfn.senderEvidence.trace.source'), trace.source_id],
                    [t('bfn.senderEvidence.trace.location'), trace.evidence_location],
                    [t('bfn.senderEvidence.trace.type'), trace.evidence_type],
                    [t('bfn.senderEvidence.trace.method'), trace.verification_method],
                  ]}
                />
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </details>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bfn-catalog-detail__section">
      <header>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function PropertyList({ rows }: { rows: readonly DetailRow[] }) {
  const visible = rows.filter(
    ([, value]) => value !== null && value !== undefined && String(value).trim().length > 0,
  );
  return (
    <dl className="bfn-catalog-detail__properties">
      {visible.map(([label, value]) => (
        <div key={label}>
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

function enumText(t: TFunction, group: string, value: string): string {
  return t('bfn.senderEvidence.' + group + '.' + value);
}

function yesNo(value: boolean, t: TFunction): string {
  return t(value ? 'bfn.senderEvidence.yes' : 'bfn.senderEvidence.no');
}

function formatRange(
  minimum: number | null,
  maximum: number | null,
  unit: string | null,
): string | null {
  if (minimum === null && maximum === null) return null;
  if (minimum === maximum) return joinUnit(formatNumber(minimum), unit);
  return joinUnit(formatNumber(minimum) + '–' + formatNumber(maximum), unit);
}

function formatNumber(value: number | null): string {
  return value === null
    ? ''
    : new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 }).format(value);
}

function joinUnit(value: string, unit: string | null): string {
  return unit ? value + ' ' + unit : value;
}

function formatJson(value: SenderExtensionJsonValue): string | null {
  if (value === null) return null;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

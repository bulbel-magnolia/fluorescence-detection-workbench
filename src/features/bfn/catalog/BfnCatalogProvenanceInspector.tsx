import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import type { ReleaseCatalogLanguage } from '../../modeling/catalog/releaseCatalogPresentation';
import type { BfnFunctionalModule, BfnModelVariant, BfnProject } from '../types';
import type { BfnCatalogDetailTarget } from './catalogDetail';
import {
  bfnCatalogProvenanceSourceLabel,
  resolveBfnCatalogProvenance,
  type BfnCatalogCanonicalProvenance,
  type BfnCatalogRecordedReference,
} from './catalogProvenance';

interface BfnCatalogProvenanceInspectorProps {
  project: BfnProject;
  module: BfnFunctionalModule;
  model: BfnModelVariant;
  onOpenCatalogDetail: (target: BfnCatalogDetailTarget) => void;
}

export function BfnCatalogProvenanceInspector({
  project,
  module,
  model,
  onOpenCatalogDetail,
}: BfnCatalogProvenanceInspectorProps) {
  const { t, i18n } = useTranslation();
  const language = releaseLanguage(i18n.resolvedLanguage ?? i18n.language);
  const provenance = resolveBfnCatalogProvenance(project, module, model);
  if (!provenance) return null;

  const canonical = provenance.canonical;
  return (
    <section
      className="bfn-inspector-block bfn-catalog-provenance"
      data-provenance-status={provenance.status}
      aria-label={t('bfn.catalogProvenance.title')}
    >
      <header>
        <strong>{t('bfn.catalogProvenance.title')}</strong>
        <span className="bfn-catalog-provenance__status">
          {t(`bfn.catalogProvenance.statuses.${provenance.status}`)}
        </span>
      </header>
      <p className="bfn-catalog-provenance__description">
        {t(`bfn.catalogProvenance.descriptions.${provenance.status}`)}
      </p>

      {provenance.status === 'matched' && canonical ? (
        <MatchedSourceFacts canonical={canonical} language={language} />
      ) : null}

      {canonical ? (
        <Button
          className="bfn-catalog-provenance__action"
          size="sm"
          variant="secondary"
          leadingIcon={<Icon name="file" size={14} />}
          onClick={() => onOpenCatalogDetail(canonical.detailTarget)}
        >
          {t(
            provenance.status === 'matched'
              ? 'bfn.catalogProvenance.viewDetail'
              : 'bfn.catalogProvenance.viewCanonicalDetail',
          )}
        </Button>
      ) : null}

      {provenance.status === 'matched' ? (
        <p className="bfn-catalog-provenance__boundary">
          <Icon name="info" size={13} />
          <span>{t('bfn.catalogProvenance.matchBoundary')}</span>
        </p>
      ) : null}

      <AdvancedProvenance
        recorded={provenance.recordedReference}
        canonical={canonical}
        language={language}
      />
    </section>
  );
}

function MatchedSourceFacts({
  canonical,
  language,
}: {
  canonical: BfnCatalogCanonicalProvenance;
  language: ReleaseCatalogLanguage;
}) {
  const { t } = useTranslation();
  const source = canonical.primarySource;
  return (
    <dl className="bfn-catalog-provenance__facts">
      <ProvenanceFact
        label={t('bfn.catalogProvenance.catalog')}
        value={t('bfn.catalogProvenance.catalogValue', { version: canonical.catalogVersion })}
      />
      <ProvenanceFact
        label={t('bfn.catalogProvenance.component')}
        value={localized(canonical.componentNames, language)}
      />
      <ProvenanceFact
        label={t('bfn.catalogProvenance.input')}
        value={localized(canonical.inputSignalNames, language)}
      />
      <ProvenanceFact
        label={t('bfn.catalogProvenance.context')}
        value={contextLabel(canonical, t('bfn.catalogProvenance.notRecorded'))}
      />
      <ProvenanceFact
        label={t('bfn.catalogProvenance.source')}
        value={
          source ? bfnCatalogProvenanceSourceLabel(source) : t('bfn.catalogProvenance.notRecorded')
        }
        {...(canonical.sourceCount > 1
          ? {
              secondary: t('bfn.catalogProvenance.additionalSources', {
                count: canonical.sourceCount - 1,
              }),
            }
          : {})}
      />
    </dl>
  );
}

function ProvenanceFact({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        {secondary ? <small>{secondary}</small> : null}
      </dd>
    </div>
  );
}

function AdvancedProvenance({
  recorded,
  canonical,
  language,
}: {
  recorded: BfnCatalogRecordedReference;
  canonical: BfnCatalogCanonicalProvenance | null;
  language: ReleaseCatalogLanguage;
}) {
  const { t } = useTranslation();
  const missing = t('bfn.catalogProvenance.notRecorded');
  return (
    <details className="bfn-catalog-provenance__advanced">
      <summary>{t('bfn.catalogProvenance.advanced.title')}</summary>
      <dl>
        <ProvenanceFact
          label={t('bfn.catalogProvenance.advanced.catalogVersion')}
          value={recorded.releaseVersion ?? canonical?.catalogVersion ?? missing}
        />
        <ProvenanceFact
          label={t('bfn.catalogProvenance.advanced.responseRecord')}
          value={recorded.responseId ?? canonical?.responseId ?? missing}
        />
        <ProvenanceFact
          label={t('bfn.catalogProvenance.advanced.componentRecord')}
          value={recorded.componentId ?? missing}
        />
        <ProvenanceFact
          label={t('bfn.catalogProvenance.advanced.contextRecord')}
          value={recorded.parameterContextId ?? canonical?.parameterContextId ?? missing}
        />
        <ProvenanceFact
          label={t('bfn.catalogProvenance.advanced.sourceRecords')}
          value={recorded.sourceIds.length ? recorded.sourceIds.join(' · ') : missing}
        />
        {canonical?.outputSignalNames ? (
          <ProvenanceFact
            label={t('bfn.catalogProvenance.advanced.outputSemantics')}
            value={localized(canonical.outputSignalNames, language)}
          />
        ) : null}
      </dl>
    </details>
  );
}

function contextLabel(canonical: BfnCatalogCanonicalProvenance, fallback: string): string {
  if (!canonical.context) return fallback;
  return (
    [canonical.context.hostSpecies, canonical.context.hostStrain].filter(Boolean).join(' · ') ||
    fallback
  );
}

function localized(value: { en: string; zh: string }, language: ReleaseCatalogLanguage): string {
  return language === 'zh-CN' ? value.zh : value.en;
}

function releaseLanguage(language: string): ReleaseCatalogLanguage {
  return language.toLocaleLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

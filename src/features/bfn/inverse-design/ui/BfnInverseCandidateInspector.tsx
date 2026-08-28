import { useTranslation } from 'react-i18next';
import { Button } from '../../../../components/Button';
import type {
  BfnCatalogInverseCandidateResult,
  BfnCatalogInverseCriterionResult,
  BfnCatalogInverseTarget,
} from '../catalogInverseDesignTypes';
import type {
  ReleaseCatalogLanguage,
  ReleaseCatalogPresentation,
} from '../../../modeling/catalog/releaseCatalogPresentation';
import {
  catalogInverseCriterionLabelKey,
  catalogInverseExclusionReasonLabelKey,
  catalogInverseStatusLabelKey,
  resolveCatalogInverseResponsePresentation,
  type BfnCatalogInverseResponsePresentation,
} from './catalogInverseDesignPresentation';
import type { BfnCatalogInverseResultSelection } from './catalogInverseDesignUiTypes';
import {
  formatConcentration,
  type BfnCatalogInverseConcentrationUnit,
} from './catalogInverseDesignUnits';
import { BfnInverseResponseChart } from './BfnInverseResponseChart';

interface BfnInverseCandidateInspectorProps {
  selection: BfnCatalogInverseResultSelection | null;
  target: BfnCatalogInverseTarget | null;
  presentation: ReleaseCatalogPresentation;
  language: ReleaseCatalogLanguage;
  concentrationUnit: BfnCatalogInverseConcentrationUnit;
  onOpenCatalogDetail?: ((responseId: string) => void) | undefined;
}

export function BfnInverseCandidateInspector({
  selection,
  target,
  presentation,
  language,
  concentrationUnit,
  onOpenCatalogDetail,
}: BfnInverseCandidateInspectorProps) {
  const { t } = useTranslation();

  if (selection === null || target === null) {
    return (
      <section className="bfn-inverse-pane-empty bfn-inverse-pane-empty--inspector">
        <strong>{t('bfn.inverseDesign.inspector.empty')}</strong>
      </section>
    );
  }

  const responseId =
    selection.kind === 'candidate' ? selection.result.responseId : selection.responseId;
  const response = resolveCatalogInverseResponsePresentation(presentation, responseId, language);

  if (selection.kind === 'unavailable') {
    return (
      <section className="bfn-inverse-inspector-content">
        <CandidateHeading
          componentName={response.componentName}
          variantName={response.variantName}
          status="not-applicable"
        />
        <div className="bfn-inverse-unavailable-note" role="note">
          <strong>{t('bfn.inverseDesign.inspector.noEvaluation')}</strong>
          <p>{t(catalogInverseExclusionReasonLabelKey('trust-unavailable'))}</p>
        </div>
        <EvidenceSummary
          response={response}
          candidate={null}
          language={language}
          concentrationUnit={concentrationUnit}
          onOpenCatalogDetail={onOpenCatalogDetail}
        />
      </section>
    );
  }

  const candidate = selection.result;
  return (
    <section className="bfn-inverse-inspector-content">
      <CandidateHeading
        componentName={response.componentName}
        variantName={response.variantName}
        status={candidate.status}
      />

      {candidate.status === 'not-applicable' ? (
        <div className="bfn-inverse-unavailable-note" role="note">
          <strong>{t('bfn.inverseDesign.inspector.noEvaluation')}</strong>
          <ul>
            {candidate.exclusionReasons.map((reason) => (
              <li key={reason}>{t(catalogInverseExclusionReasonLabelKey(reason))}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <section className="bfn-inverse-inspector-section">
            <h3>{t('bfn.inverseDesign.inspector.responseCurve')}</h3>
            <BfnInverseResponseChart
              curves={[
                {
                  id: candidate.responseId,
                  label: response.componentName,
                  points: candidate.evaluation.curve,
                },
              ]}
              target={target}
              concentrationUnit={concentrationUnit}
              locale={language}
              ariaLabel={t('bfn.inverseDesign.inspector.curveAriaLabel')}
            />
          </section>
          <section className="bfn-inverse-inspector-section">
            <h3>{t('bfn.inverseDesign.inspector.criteriaTitle')}</h3>
            <table
              className="bfn-inverse-criteria-table"
              aria-label={t('bfn.inverseDesign.inspector.criteriaTable')}
            >
              <thead>
                <tr>
                  <th>{t('bfn.inverseDesign.inspector.criterion')}</th>
                  <th>{t('bfn.inverseDesign.inspector.observed')}</th>
                  <th>{t('bfn.inverseDesign.inspector.required')}</th>
                  <th>{t('bfn.inverseDesign.inspector.outcome')}</th>
                </tr>
              </thead>
              <tbody>
                {candidate.criteria.map((criterion) => (
                  <tr key={criterion.kind} data-passed={criterion.passed}>
                    <th>{t(catalogInverseCriterionLabelKey(criterion.kind))}</th>
                    <td>{criterionObserved(criterion, concentrationUnit, language)}</td>
                    <td>{criterionRequirement(criterion, concentrationUnit, language)}</td>
                    <td>
                      {criterion.passed
                        ? t('bfn.inverseDesign.inspector.passed')
                        : t('bfn.inverseDesign.inspector.notMet')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className="bfn-inverse-inspector-section">
        <h3>{t('bfn.inverseDesign.inspector.modelTitle')}</h3>
        <dl className="bfn-inverse-model-grid">
          <ModelFact
            label={t('bfn.inverseDesign.inspector.ec50')}
            value={formatConcentration(candidate.model.ec50M, concentrationUnit, language)}
          />
          <ModelFact
            label={t('bfn.inverseDesign.inspector.hill')}
            value={formatNumber(candidate.model.hillCoefficient)}
          />
        </dl>
      </section>
      <EvidenceSummary
        response={response}
        candidate={candidate}
        language={language}
        concentrationUnit={concentrationUnit}
        onOpenCatalogDetail={onOpenCatalogDetail}
      />
    </section>
  );
}

function EvidenceSummary({
  response,
  candidate,
  language,
  concentrationUnit,
  onOpenCatalogDetail,
}: {
  response: BfnCatalogInverseResponsePresentation;
  candidate: BfnCatalogInverseCandidateResult | null;
  language: ReleaseCatalogLanguage;
  concentrationUnit: BfnCatalogInverseConcentrationUnit;
  onOpenCatalogDetail?: ((responseId: string) => void) | undefined;
}) {
  const { t } = useTranslation();
  const notRecorded = t('bfn.inverseDesign.common.notRecorded');
  const hostSpecies = candidate?.context.hostSpecies ?? response.hostSpecies;
  const hostStrain = candidate?.context.hostStrain ?? response.hostStrain;
  return (
    <section className="bfn-inverse-inspector-section bfn-inverse-evidence-summary">
      <h3>{t('bfn.inverseDesign.inspector.evidenceTitle')}</h3>
      <dl className="bfn-inverse-model-grid">
        <ModelFact
          label={t('bfn.inverseDesign.inspector.primarySource')}
          value={response.sourceSummary ?? notRecorded}
        />
        <ModelFact
          label={t('bfn.inverseDesign.inspector.hostStrain')}
          value={contextLabel(hostSpecies, hostStrain, notRecorded)}
        />
        <ModelFact
          label={t('bfn.inverseDesign.inspector.workingRange')}
          value={
            candidate
              ? `${formatConcentration(candidate.model.workingRangeM.minimum, concentrationUnit, language)} – ${formatConcentration(candidate.model.workingRangeM.maximum, concentrationUnit, language)}`
              : notRecorded
          }
        />
        <ModelFact
          label={t('bfn.inverseDesign.inspector.mechanism')}
          value={
            candidate
              ? t(`bfn.inverseDesign.direction.${candidate.biologicalDirection}`)
              : notRecorded
          }
        />
      </dl>
      {onOpenCatalogDetail ? (
        <Button
          className="bfn-inverse-evidence-summary__action"
          size="sm"
          variant="secondary"
          aria-label={t('bfn.inverseDesign.inspector.evidenceActionAria', {
            name: `${response.componentName} · ${response.variantName}`,
          })}
          onClick={() => onOpenCatalogDetail(response.responseId)}
        >
          {t('bfn.inverseDesign.inspector.evidenceAction')}
        </Button>
      ) : null}
    </section>
  );
}

function CandidateHeading({
  componentName,
  variantName,
  status,
}: {
  componentName: string;
  variantName: string;
  status: BfnCatalogInverseCandidateResult['status'];
}) {
  const { t } = useTranslation();
  return (
    <header className="bfn-inverse-candidate-heading">
      <div>
        <p>{variantName}</p>
        <h2>{componentName}</h2>
      </div>
      <span className="bfn-inverse-status" data-status={status}>
        {t(catalogInverseStatusLabelKey(status))}
      </span>
    </header>
  );
}

function ModelFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function criterionObserved(
  criterion: BfnCatalogInverseCriterionResult,
  unit: BfnCatalogInverseConcentrationUnit,
  language: ReleaseCatalogLanguage,
): string {
  if (criterion.kind === 'ec50-range')
    return formatConcentration(criterion.actualM, unit, language);
  if (criterion.kind === 'hill-range') return formatNumber(criterion.actual);
  return formatNumber(criterion.actual);
}

function criterionRequirement(
  criterion: BfnCatalogInverseCriterionResult,
  unit: BfnCatalogInverseConcentrationUnit,
  language: ReleaseCatalogLanguage,
): string {
  if (criterion.kind === 'low-response-maximum')
    return `≤ ${formatNumber(criterion.requiredMaximum)}`;
  if (criterion.kind === 'high-response-minimum')
    return `≥ ${formatNumber(criterion.requiredMinimum)}`;
  if (criterion.kind === 'ec50-range')
    return `${formatConcentration(criterion.requiredRangeM.minimum, unit, language)} – ${formatConcentration(criterion.requiredRangeM.maximum, unit, language)}`;
  return `${formatNumber(criterion.requiredRange.minimum)} – ${formatNumber(criterion.requiredRange.maximum)}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

function contextLabel(host: string | null, strain: string | null, fallback: string): string {
  return [host, strain].filter((value): value is string => value !== null).join(' · ') || fallback;
}

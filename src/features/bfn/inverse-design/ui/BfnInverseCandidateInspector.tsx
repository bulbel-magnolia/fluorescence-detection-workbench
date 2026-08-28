import { useTranslation } from 'react-i18next';
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
}

export function BfnInverseCandidateInspector({
  selection,
  target,
  presentation,
  language,
  concentrationUnit,
}: BfnInverseCandidateInspectorProps) {
  const { t } = useTranslation();

  if (selection === null || target === null) {
    return (
      <section className='bfn-inverse-pane-empty bfn-inverse-pane-empty--inspector'>
        <strong>{t('bfn.inverseDesign.inspector.empty')}</strong>
        <p>{t('bfn.inverseDesign.inspector.emptyHint')}</p>
      </section>
    );
  }

  const responseId = selection.kind === 'candidate' ? selection.result.responseId : selection.responseId;
  const response = resolveCatalogInverseResponsePresentation(presentation, responseId, language);

  if (selection.kind === 'unavailable') {
    return (
      <section className='bfn-inverse-inspector-content'>
        <CandidateHeading
          componentName={response.componentName}
          variantName={response.variantName}
          status='not-applicable'
        />
        <div className='bfn-inverse-unavailable-note' role='note'>
          <strong>{t('bfn.inverseDesign.inspector.noEvaluation')}</strong>
          <p>{t(catalogInverseExclusionReasonLabelKey('trust-unavailable'))}</p>
        </div>
      </section>
    );
  }

  const candidate = selection.result;
  return (
    <section className='bfn-inverse-inspector-content'>
      <CandidateHeading
        componentName={response.componentName}
        variantName={response.variantName}
        status={candidate.status}
      />
      <dl className='bfn-inverse-identity-meta'>
        <div>
          <dt>{t('bfn.inverseDesign.inspector.source')}</dt>
          <dd>{response.sourceSummary ?? t('bfn.inverseDesign.common.notRecorded')}</dd>
        </div>
        <div>
          <dt>{t('bfn.inverseDesign.inspector.context')}</dt>
          <dd>{contextLabel(response.hostSpecies, response.hostStrain, t('bfn.inverseDesign.common.notRecorded'))}</dd>
        </div>
      </dl>

      {candidate.status === 'not-applicable' ? (
        <div className='bfn-inverse-unavailable-note' role='note'>
          <strong>{t('bfn.inverseDesign.inspector.noEvaluation')}</strong>
          <ul>
            {candidate.exclusionReasons.map((reason) => (
              <li key={reason}>{t(catalogInverseExclusionReasonLabelKey(reason))}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <section className='bfn-inverse-inspector-section'>
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
          <section className='bfn-inverse-inspector-section'>
            <h3>{t('bfn.inverseDesign.inspector.criteriaTitle')}</h3>
            <table className='bfn-inverse-criteria-table' aria-label={t('bfn.inverseDesign.inspector.criteriaTable')}>
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

      <section className='bfn-inverse-inspector-section'>
        <h3>{t('bfn.inverseDesign.inspector.modelTitle')}</h3>
        <dl className='bfn-inverse-model-grid'>
          <ModelFact
            label={t('bfn.inverseDesign.inspector.ec50')}
            value={formatConcentration(candidate.model.ec50M, concentrationUnit, language)}
          />
          <ModelFact
            label={t('bfn.inverseDesign.inspector.hill')}
            value={formatNumber(candidate.model.hillCoefficient)}
          />
          <ModelFact
            label={t('bfn.inverseDesign.inspector.workingRange')}
            value={`${formatConcentration(candidate.model.workingRangeM.minimum, concentrationUnit, language)} – ${formatConcentration(candidate.model.workingRangeM.maximum, concentrationUnit, language)}`}
          />
          <ModelFact
            label={t('bfn.inverseDesign.inspector.mechanism')}
            value={t(`bfn.inverseDesign.direction.${candidate.biologicalDirection}`)}
          />
          <ModelFact
            label={t('bfn.inverseDesign.target.host')}
            value={candidate.context.hostSpecies ?? t('bfn.inverseDesign.common.notRecorded')}
          />
          <ModelFact
            label={t('bfn.inverseDesign.target.strain')}
            value={candidate.context.hostStrain ?? t('bfn.inverseDesign.common.notRecorded')}
          />
        </dl>
      </section>
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
    <header className='bfn-inverse-candidate-heading'>
      <div>
        <p>{variantName}</p>
        <h2>{componentName}</h2>
      </div>
      <span className='bfn-inverse-status' data-status={status}>
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
  if (criterion.kind === 'ec50-range') return formatConcentration(criterion.actualM, unit, language);
  if (criterion.kind === 'hill-range') return formatNumber(criterion.actual);
  return formatNumber(criterion.actual);
}

function criterionRequirement(
  criterion: BfnCatalogInverseCriterionResult,
  unit: BfnCatalogInverseConcentrationUnit,
  language: ReleaseCatalogLanguage,
): string {
  if (criterion.kind === 'low-response-maximum') return `≤ ${formatNumber(criterion.requiredMaximum)}`;
  if (criterion.kind === 'high-response-minimum') return `≥ ${formatNumber(criterion.requiredMinimum)}`;
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

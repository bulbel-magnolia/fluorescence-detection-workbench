import { useTranslation } from 'react-i18next';
import type {
  BfnCatalogInverseCandidateResult,
  BfnCatalogInverseNotApplicableResult,
  BfnCatalogInverseTarget,
} from '../catalogInverseDesignTypes';
import type {
  ReleaseCatalogLanguage,
  ReleaseCatalogPresentation,
} from '../../../modeling/catalog/releaseCatalogPresentation';
import { resolveCatalogInverseResponsePresentation } from './catalogInverseDesignPresentation';
import {
  formatConcentration,
  type BfnCatalogInverseConcentrationUnit,
} from './catalogInverseDesignUnits';
import { BfnInverseResponseChart } from './BfnInverseResponseChart';

export type BfnCatalogInverseComparableResult = Exclude<
  BfnCatalogInverseCandidateResult,
  BfnCatalogInverseNotApplicableResult
>;

interface BfnInverseComparisonViewProps {
  candidates: readonly BfnCatalogInverseComparableResult[];
  target: BfnCatalogInverseTarget;
  presentation: ReleaseCatalogPresentation;
  language: ReleaseCatalogLanguage;
  concentrationUnit: BfnCatalogInverseConcentrationUnit;
  onOpenCatalogDetail?: ((responseId: string) => void) | undefined;
}

export function BfnInverseComparisonView({
  candidates,
  target,
  presentation,
  language,
  concentrationUnit,
  onOpenCatalogDetail,
}: BfnInverseComparisonViewProps) {
  const { t } = useTranslation();
  const identities = candidates.map((candidate) =>
    resolveCatalogInverseResponsePresentation(presentation, candidate.responseId, language),
  );
  const contextsDiffer =
    new Set(candidates.map((candidate) => candidate.parameterContextId)).size > 1;

  return (
    <section className="bfn-inverse-comparison">
      {contextsDiffer ? (
        <p className="bfn-inverse-context-warning" role="note">
          {t('bfn.inverseDesign.comparison.contextWarning')}
        </p>
      ) : null}
      <section className="bfn-inverse-inspector-section">
        <h3>{t('bfn.inverseDesign.comparison.curves')}</h3>
        <BfnInverseResponseChart
          curves={candidates.map((candidate, index) => ({
            id: candidate.responseId,
            label: identities[index]?.componentName ?? '',
            points: candidate.evaluation.curve,
          }))}
          target={target}
          concentrationUnit={concentrationUnit}
          locale={language}
          ariaLabel={t('bfn.inverseDesign.comparison.curveAriaLabel')}
        />
      </section>
      <section className="bfn-inverse-inspector-section">
        <h3>{t('bfn.inverseDesign.comparison.parameters')}</h3>
        <div className="bfn-inverse-comparison-table-wrap">
          <table
            className="bfn-inverse-comparison-table"
            aria-label={t('bfn.inverseDesign.comparison.tableAriaLabel')}
          >
            <thead>
              <tr>
                <th>{t('bfn.inverseDesign.comparison.property')}</th>
                {identities.map((identity) => (
                  <th key={identity.responseId}>
                    <strong>{identity.componentName}</strong>
                    <span>{identity.variantName}</span>
                    {onOpenCatalogDetail ? (
                      <button
                        className="bfn-inverse-evidence-link"
                        type="button"
                        aria-label={t('bfn.inverseDesign.comparison.evidenceAria', {
                          name: `${identity.componentName} · ${identity.variantName}`,
                        })}
                        onClick={() => onOpenCatalogDetail(identity.responseId)}
                      >
                        {t('bfn.inverseDesign.comparison.evidence')}
                      </button>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <ComparisonRow
                label={t('bfn.inverseDesign.comparison.lowResponse')}
                values={candidates.map((candidate) =>
                  formatNumber(candidate.evaluation.lowResponse),
                )}
              />
              <ComparisonRow
                label={t('bfn.inverseDesign.comparison.highResponse')}
                values={candidates.map((candidate) =>
                  formatNumber(candidate.evaluation.highResponse),
                )}
              />
              <ComparisonRow
                label={t('bfn.inverseDesign.inspector.ec50')}
                values={candidates.map((candidate) =>
                  formatConcentration(candidate.model.ec50M, concentrationUnit, language),
                )}
              />
              <ComparisonRow
                label={t('bfn.inverseDesign.inspector.hill')}
                values={candidates.map((candidate) =>
                  formatNumber(candidate.model.hillCoefficient),
                )}
              />
              <ComparisonRow
                label={t('bfn.inverseDesign.inspector.workingRange')}
                values={candidates.map(
                  (candidate) =>
                    `${formatConcentration(candidate.model.workingRangeM.minimum, concentrationUnit, language)} – ${formatConcentration(candidate.model.workingRangeM.maximum, concentrationUnit, language)}`,
                )}
              />
              <ComparisonRow
                label={t('bfn.inverseDesign.inspector.mechanism')}
                values={candidates.map((candidate) =>
                  t(`bfn.inverseDesign.direction.${candidate.biologicalDirection}`),
                )}
              />
              <ComparisonRow
                label={t('bfn.inverseDesign.target.host')}
                values={candidates.map(
                  (candidate) =>
                    candidate.context.hostSpecies ?? t('bfn.inverseDesign.common.notRecorded'),
                )}
              />
              <ComparisonRow
                label={t('bfn.inverseDesign.target.strain')}
                values={candidates.map(
                  (candidate) =>
                    candidate.context.hostStrain ?? t('bfn.inverseDesign.common.notRecorded'),
                )}
              />
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function ComparisonRow({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <tr>
      <th>{label}</th>
      {values.map((value, index) => (
        <td key={`${label}-${index}`}>{value}</td>
      ))}
    </tr>
  );
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

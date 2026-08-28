import { useTranslation } from 'react-i18next';
import type {
  BfnCatalogInverseCandidateResult,
  BfnCatalogInverseSearchResult,
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
import {
  catalogInverseSelectionId,
  type BfnCatalogInverseResultSelection,
} from './catalogInverseDesignUiTypes';

interface BfnInverseResultListProps {
  result: BfnCatalogInverseSearchResult | null;
  presentation: ReleaseCatalogPresentation;
  language: ReleaseCatalogLanguage;
  selected: BfnCatalogInverseResultSelection | null;
  comparisonIds: readonly string[];
  onSelect: (selection: BfnCatalogInverseResultSelection) => void;
  onToggleComparison: (responseId: string) => void;
}

export function BfnInverseResultList({
  result,
  presentation,
  language,
  selected,
  comparisonIds,
  onSelect,
  onToggleComparison,
}: BfnInverseResultListProps) {
  const { t } = useTranslation();
  const selectedId = selected === null ? null : catalogInverseSelectionId(selected);
  const unavailable = result
    ? result.unavailableResponseIds
        .filter(
          (responseId) =>
            !result.notApplicable.some((candidate) => candidate.responseId === responseId),
        )
        .map(
          (responseId): BfnCatalogInverseResultSelection => ({ kind: 'unavailable', responseId }),
        )
    : [];
  const notApplicable: readonly BfnCatalogInverseResultSelection[] = result
    ? [
        ...result.notApplicable.map(
          (candidate): BfnCatalogInverseResultSelection => ({ kind: 'candidate', result: candidate }),
        ),
        ...unavailable,
      ]
    : [];

  return (
    <section className='bfn-catalog-inverse__results' aria-labelledby='bfn-inverse-results-title'>
      <header className='bfn-catalog-inverse__pane-header bfn-catalog-inverse__pane-header--row'>
        <div>
          <p>{t('bfn.inverseDesign.results.kicker')}</p>
          <h2 id='bfn-inverse-results-title'>{t('bfn.inverseDesign.results.title')}</h2>
        </div>
        {result ? (
          <span className='bfn-inverse-result-total'>
            {t('bfn.inverseDesign.results.searchedCount', {
              count: result.searchedResponseCount,
            })}
          </span>
        ) : null}
      </header>

      {result === null ? (
        <section className='bfn-inverse-pane-empty'>
          <strong>{t('bfn.inverseDesign.results.empty')}</strong>
          <p>{t('bfn.inverseDesign.results.emptyHint')}</p>
        </section>
      ) : (
        <div className='bfn-inverse-result-groups'>
          <ResultGroup
            status='matched'
            title={t('bfn.inverseDesign.results.matched')}
            selections={result.matched.map((candidate) => ({
              kind: 'candidate' as const,
              result: candidate,
            }))}
            presentation={presentation}
            language={language}
            selectedId={selectedId}
            comparisonIds={comparisonIds}
            onSelect={onSelect}
            onToggleComparison={onToggleComparison}
          />
          <ResultGroup
            status='near-match'
            title={t('bfn.inverseDesign.results.nearMatches')}
            selections={result.nearMatches.map((candidate) => ({
              kind: 'candidate' as const,
              result: candidate,
            }))}
            presentation={presentation}
            language={language}
            selectedId={selectedId}
            comparisonIds={comparisonIds}
            onSelect={onSelect}
            onToggleComparison={onToggleComparison}
          />
          <ResultGroup
            status='not-applicable'
            title={t('bfn.inverseDesign.results.notApplicable')}
            selections={notApplicable}
            presentation={presentation}
            language={language}
            selectedId={selectedId}
            comparisonIds={comparisonIds}
            onSelect={onSelect}
            onToggleComparison={onToggleComparison}
          />
        </div>
      )}
    </section>
  );
}

interface ResultGroupProps {
  status: BfnCatalogInverseCandidateResult['status'];
  title: string;
  selections: readonly BfnCatalogInverseResultSelection[];
  presentation: ReleaseCatalogPresentation;
  language: ReleaseCatalogLanguage;
  selectedId: string | null;
  comparisonIds: readonly string[];
  onSelect: (selection: BfnCatalogInverseResultSelection) => void;
  onToggleComparison: (responseId: string) => void;
}

function ResultGroup({
  status,
  title,
  selections,
  presentation,
  language,
  selectedId,
  comparisonIds,
  onSelect,
  onToggleComparison,
}: ResultGroupProps) {
  const { t } = useTranslation();
  return (
    <details className='bfn-inverse-result-group' open={status !== 'not-applicable'}>
      <summary>
        <h2>{title}</h2>
        <span>{selections.length}</span>
      </summary>
      <div className='bfn-inverse-result-list'>
        {selections.length === 0 ? (
          <p className='bfn-inverse-group-empty'>{t('bfn.inverseDesign.results.groupEmpty')}</p>
        ) : (
          selections.map((selection) => {
            const responseId = catalogInverseSelectionId(selection);
            const comparable =
              selection.kind === 'candidate' && selection.result.status !== 'not-applicable';
            const checked = comparisonIds.includes(responseId);
            const compareDisabled = comparable && comparisonIds.length >= 3 && !checked;
            const resolved = safelyResolveResponse(presentation, responseId, language, t);
            return (
              <article
                className='bfn-inverse-result-row'
                data-status={status}
                data-selected={selectedId === responseId || undefined}
                key={responseId}
              >
                <button
                  type='button'
                  className='bfn-inverse-result-row__select'
                  aria-label={t('bfn.inverseDesign.actions.inspectCandidate')}
                  onClick={() => onSelect(selection)}
                >
                  <span className='bfn-inverse-result-row__identity'>
                    <strong>{resolved.componentName}</strong>
                    <span>{resolved.variantName}</span>
                  </span>
                  <span className='bfn-inverse-status' data-status={status}>
                    {t(catalogInverseStatusLabelKey(status))}
                  </span>
                  <small>
                    {resultSummary(selection, t)}
                    {resolved.hostStrain ? ` · ${resolved.hostStrain}` : ''}
                  </small>
                </button>
                {comparable ? (
                  <label className='bfn-inverse-compare-check'>
                    <input
                      type='checkbox'
                      checked={checked}
                      disabled={compareDisabled}
                      aria-label={t('bfn.inverseDesign.actions.addComparison')}
                      onChange={() => onToggleComparison(responseId)}
                    />
                    <span>{t('bfn.inverseDesign.actions.addComparison')}</span>
                  </label>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </details>
  );
}

function resultSummary(
  selection: BfnCatalogInverseResultSelection,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (selection.kind === 'unavailable')
    return t(catalogInverseExclusionReasonLabelKey('trust-unavailable'));
  if (selection.result.status === 'not-applicable') {
    return selection.result.exclusionReasons
      .map((reason) => t(catalogInverseExclusionReasonLabelKey(reason)))
      .join(' · ');
  }
  const failed = selection.result.criteria.filter((criterion) => !criterion.passed);
  return failed.length === 0
    ? t('bfn.inverseDesign.results.allCriteriaMet')
    : failed.map((criterion) => t(catalogInverseCriterionLabelKey(criterion.kind))).join(' · ');
}

function safelyResolveResponse(
  presentation: ReleaseCatalogPresentation,
  responseId: string,
  language: ReleaseCatalogLanguage,
  t: ReturnType<typeof useTranslation>['t'],
): BfnCatalogInverseResponsePresentation {
  try {
    return resolveCatalogInverseResponsePresentation(presentation, responseId, language);
  } catch {
    return {
      responseId,
      componentName: t('bfn.inverseDesign.results.unavailableComponent'),
      variantName: t('bfn.inverseDesign.results.unavailableVariant'),
      sourceSummary: null,
      hostSpecies: null,
      hostStrain: null,
    };
  }
}

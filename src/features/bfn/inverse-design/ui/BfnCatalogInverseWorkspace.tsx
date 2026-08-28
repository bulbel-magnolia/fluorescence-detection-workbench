import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../components/Button';
import {
  loadReleaseCatalogPresentation,
  type ReleaseCatalogLanguage,
  type ReleaseCatalogPresentation,
} from '../../../modeling/catalog/releaseCatalogPresentation';
import { runCatalogInverseDesign } from '../catalogInverseDesignEvaluation';
import { buildCatalogInverseSearchSpace } from '../catalogInverseDesignSpace';
import type {
  BfnCatalogInverseSearchResult,
  BfnCatalogInverseSearchSpace,
} from '../catalogInverseDesignTypes';
import { validateCatalogInverseTarget } from '../catalogInverseDesignValidation';
import { BfnInverseCandidateInspector } from './BfnInverseCandidateInspector';
import {
  BfnInverseComparisonView,
  type BfnCatalogInverseComparableResult,
} from './BfnInverseComparisonView';
import { BfnInverseResultList } from './BfnInverseResultList';
import { BfnInverseTargetPanel } from './BfnInverseTargetPanel';
import {
  buildCatalogInverseTargetFromDraft,
  catalogInverseScientificTargetsEqual,
  changeCatalogInverseDraftSignal,
  changeCatalogInverseDraftUnit,
  createInitialCatalogInverseTargetDraft,
} from './catalogInverseDesignTargetDraft';
import type { BfnCatalogInverseResultSelection } from './catalogInverseDesignUiTypes';
import { chooseReadableConcentrationUnit } from './catalogInverseDesignUnits';
import './bfn-catalog-inverse.css';

export interface BfnCatalogInverseWorkspaceProps {
  buildSearchSpace?: () => BfnCatalogInverseSearchSpace;
}

interface CatalogInverseResources {
  searchSpace: BfnCatalogInverseSearchSpace | null;
  presentation: ReleaseCatalogPresentation | null;
  failed: boolean;
}

type InspectorMode = 'single' | 'comparison';

export function BfnCatalogInverseWorkspace({
  buildSearchSpace,
}: BfnCatalogInverseWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const searchSpaceBuilder = buildSearchSpace ?? buildCatalogInverseSearchSpace;
  const [resources, setResources] = useState<CatalogInverseResources>(() =>
    loadResources(searchSpaceBuilder),
  );
  const [draft, setDraft] = useState(createInitialCatalogInverseTargetDraft);
  const [result, setResult] = useState<BfnCatalogInverseSearchResult | null>(null);
  const [selected, setSelected] = useState<BfnCatalogInverseResultSelection | null>(null);
  const [comparisonIds, setComparisonIds] = useState<readonly string[]>([]);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>('single');
  const [submitted, setSubmitted] = useState(false);
  const [releaseFailure, setReleaseFailure] = useState(false);
  const language: ReleaseCatalogLanguage = i18n.resolvedLanguage?.startsWith('en')
    ? 'en-US'
    : 'zh-CN';
  const currentTarget = useMemo(() => buildCatalogInverseTargetFromDraft(draft), [draft]);
  const validation = useMemo(
    () =>
      currentTarget === null || resources.searchSpace === null
        ? null
        : validateCatalogInverseTarget(currentTarget, {
            searchableSignals: resources.searchSpace.searchableSignals,
            contextOptions: resources.searchSpace.contextOptions,
          }),
    [currentTarget, resources.searchSpace],
  );
  const visibleIssues =
    validation?.issues.filter((issue) => issue.severity === 'warning' || submitted) ?? [];
  const stale =
    result !== null && !catalogInverseScientificTargetsEqual(currentTarget, result.target);
  const comparableResults = useMemo(() => {
    if (result === null) return [];
    const byId = new Map(
      [...result.matched, ...result.nearMatches].map((candidate) => [
        candidate.responseId,
        candidate,
      ]),
    );
    return comparisonIds
      .map((responseId) => byId.get(responseId))
      .filter((candidate): candidate is BfnCatalogInverseComparableResult =>
        candidate !== undefined,
      );
  }, [comparisonIds, result]);
  const comparisonAvailable = comparableResults.length >= 2;
  const effectiveInspectorMode = comparisonAvailable ? inspectorMode : 'single';

  const retryResources = () => {
    const next = loadResources(searchSpaceBuilder);
    setResources(next);
    setReleaseFailure(next.failed);
  };

  const search = () => {
    setSubmitted(true);
    setReleaseFailure(false);
    const target = buildCatalogInverseTargetFromDraft(draft);
    if (target === null) return;

    let freshResources: CatalogInverseResources;
    try {
      freshResources = {
        searchSpace: searchSpaceBuilder(),
        presentation: loadReleaseCatalogPresentation(),
        failed: false,
      };
    } catch {
      setReleaseFailure(true);
      return;
    }
    if (freshResources.searchSpace === null) return;
    setResources(freshResources);
    const checked = validateCatalogInverseTarget(target, {
      searchableSignals: freshResources.searchSpace.searchableSignals,
      contextOptions: freshResources.searchSpace.contextOptions,
    });
    if (!checked.valid) return;

    try {
      const nextResult = runCatalogInverseDesign(freshResources.searchSpace, checked.target);
      setResult(nextResult);
      setSelected(null);
      setComparisonIds([]);
      setInspectorMode('single');
      setSubmitted(false);
    } catch {
      setReleaseFailure(true);
    }
  };

  if (resources.failed || resources.searchSpace === null || resources.presentation === null) {
    return (
      <section className='bfn-catalog-inverse bfn-catalog-inverse--error'>
        <div className='bfn-catalog-inverse__load-error' role='alert'>
          <h1>{t('bfn.inverseDesign.errors.releaseUnavailable')}</h1>
          <p>{t('bfn.inverseDesign.errors.releaseUnavailableHint')}</p>
          <Button variant='secondary' onClick={retryResources}>
            {t('bfn.inverseDesign.actions.retry')}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className='bfn-catalog-inverse' data-testid='catalog-inverse-workspace'>
      {stale || releaseFailure ? (
        <div
          className='bfn-catalog-inverse__statebar'
          data-tone={releaseFailure ? 'error' : 'warning'}
          role={releaseFailure ? 'alert' : 'status'}
        >
          <div>
            <strong>
              {releaseFailure
                ? t('bfn.inverseDesign.errors.releaseUnavailable')
                : t('bfn.inverseDesign.stale.title')}
            </strong>
            <span>
              {releaseFailure
                ? t('bfn.inverseDesign.errors.releaseUnavailableHint')
                : t('bfn.inverseDesign.stale.description')}
            </span>
          </div>
          <Button size='sm' variant='secondary' onClick={search}>
            {releaseFailure
              ? t('bfn.inverseDesign.actions.retry')
              : t('bfn.inverseDesign.actions.research')}
          </Button>
        </div>
      ) : null}
      <div className='bfn-catalog-inverse__layout'>
        <BfnInverseTargetPanel
          draft={draft}
          searchSpace={resources.searchSpace}
          presentation={resources.presentation}
          language={language}
          issues={visibleIssues}
          incompleteSubmitted={submitted && currentTarget === null}
          onDraftChange={setDraft}
          onSignalChange={(signalId) => {
            const unit =
              signalId === null
                ? draft.concentrationUnit
                : chooseReadableConcentrationUnit(
                    resources.searchSpace!.candidates
                      .filter((candidate) => candidate.inputSignalId === signalId)
                      .map((candidate) => candidate.model.ec50M),
                  );
            setDraft((current) => changeCatalogInverseDraftSignal(current, signalId, unit));
          }}
          onUnitChange={(unit) =>
            setDraft((current) => changeCatalogInverseDraftUnit(current, unit))
          }
          onSearch={search}
        />
        <BfnInverseResultList
          result={result}
          presentation={resources.presentation}
          language={language}
          selected={selected}
          comparisonIds={comparisonIds}
          onSelect={(selection) => {
            setSelected(selection);
            setInspectorMode('single');
          }}
          onToggleComparison={(responseId) =>
            setComparisonIds((current) =>
              current.includes(responseId)
                ? current.filter((candidateId) => candidateId !== responseId)
                : current.length < 3
                  ? [...current, responseId]
                  : current,
            )
          }
        />
        <aside className='bfn-catalog-inverse__inspector' aria-labelledby='bfn-inverse-inspector-title'>
          <header className='bfn-catalog-inverse__pane-header bfn-catalog-inverse__pane-header--row'>
            <div>
              <p>{t('bfn.inverseDesign.inspector.kicker')}</p>
              <h2 id='bfn-inverse-inspector-title'>{t('bfn.inverseDesign.inspector.title')}</h2>
            </div>
            {comparisonAvailable ? (
              <div
                className='bfn-inverse-inspector-tabs'
                role='tablist'
                aria-label={t('bfn.inverseDesign.inspector.viewMode')}
              >
                <button
                  type='button'
                  role='tab'
                  aria-selected={effectiveInspectorMode === 'single'}
                  onClick={() => setInspectorMode('single')}
                >
                  {t('bfn.inverseDesign.inspector.singleView')}
                </button>
                <button
                  type='button'
                  role='tab'
                  aria-selected={effectiveInspectorMode === 'comparison'}
                  onClick={() => setInspectorMode('comparison')}
                >
                  {t('bfn.inverseDesign.inspector.comparisonView')}
                </button>
              </div>
            ) : null}
          </header>
          {effectiveInspectorMode === 'comparison' && result ? (
            <BfnInverseComparisonView
              candidates={comparableResults}
              target={result.target}
              presentation={resources.presentation}
              language={language}
              concentrationUnit={draft.concentrationUnit}
            />
          ) : (
            <BfnInverseCandidateInspector
              selection={selected}
              target={result?.target ?? null}
              presentation={resources.presentation}
              language={language}
              concentrationUnit={draft.concentrationUnit}
            />
          )}
        </aside>
      </div>
    </section>
  );
}

function loadResources(builder: () => BfnCatalogInverseSearchSpace): CatalogInverseResources {
  try {
    return {
      searchSpace: builder(),
      presentation: loadReleaseCatalogPresentation(),
      failed: false,
    };
  } catch {
    return { searchSpace: null, presentation: null, failed: true };
  }
}

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import './catalog-ui.css';
import { Icon } from '../../../components/Icon';
import { CatalogEntryCard } from './CatalogEntryCard';
import { CatalogEntryDetail } from './CatalogEntryDetail';
import { CatalogFilterBar } from './CatalogFilterBar';
import { getCatalogNetworkRoles, networkRoleForNodeKind } from './catalogPresentation';
import type { CatalogIndex } from './catalogIndex';
import { searchCatalog } from './catalogIndex';
import type {
  CatalogApplicationAssessment,
  CatalogEntry,
  CatalogNetworkRole,
  CatalogNodeKind,
  CatalogSearchFilters,
  LiteratureCandidateReference,
} from './catalogTypes';

export interface EvidenceCatalogDialogProps {
  open: boolean;
  index: CatalogIndex | null;
  unavailableMessage?: string;
  selectedNodeName?: string;
  selectedNodeKind?: CatalogNodeKind;
  selectedNetworkRole?: CatalogNetworkRole;
  selectedReference?: LiteratureCandidateReference;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  /** Primary action. The host may create a new node or update an existing one. */
  onApply?: (entry: CatalogEntry, assessment: CatalogApplicationAssessment) => void;
  /** Secondary provenance-only action. */
  onAttachReference?: (reference: LiteratureCandidateReference) => void;
  /** Legacy alias retained while the host page migrates. */
  onAttach?: (reference: LiteratureCandidateReference) => void;
  onDetach: () => void;
  targetNetworkRole?: CatalogNetworkRole | null;
  onTargetNetworkRoleChange?: (role: CatalogNetworkRole | null) => void;
}

function initialFilters(selectedNodeKind?: CatalogNodeKind): CatalogSearchFilters {
  return {
    query: '',
    nodeKind: selectedNodeKind ?? 'all',
    networkRole: 'all',
    inputMolecule: 'all',
    outputMolecule: 'all',
    parameterStatus: 'all',
    category: 'all',
    entityType: 'all',
    host: 'all',
    strain: 'all',
    evidenceGrade: 'all',
    sequenceStatus: 'all',
    modelingCompatibility: 'all',
  };
}

function isDialogFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  const closedDetails = element.closest('details:not([open])');
  if (!closedDetails) return true;
  return element.tagName === 'SUMMARY' && element.parentElement === closedDetails;
}

export function EvidenceCatalogDialog({
  open,
  index,
  selectedNodeName,
  selectedNodeKind,
  selectedNetworkRole,
  selectedReference,
  triggerRef,
  onClose,
  onApply,
  onAttachReference,
  onAttach,
  onDetach,
  targetNetworkRole,
  onTargetNetworkRoleChange,
}: EvidenceCatalogDialogProps): JSX.Element | null {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [filters, setFilters] = useState<CatalogSearchFilters>(() =>
    initialFilters(selectedNodeKind),
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [localTargetNetworkRole, setLocalTargetNetworkRole] = useState<CatalogNetworkRole | null>(
    'processing',
  );
  const effectiveTargetNetworkRole =
    targetNetworkRole === undefined ? localTargetNetworkRole : targetNetworkRole;

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setFilters(initialFilters(selectedNodeKind));
    setSelectedEntryId(null);
    setLocalTargetNetworkRole(targetNetworkRole ?? 'processing');
  }, [open, selectedNodeKind, targetNetworkRole]);

  const results = useMemo(() => (index ? searchCatalog(index, filters) : []), [filters, index]);
  const selectedEntry = selectedEntryId ? (index?.byId.get(selectedEntryId) ?? null) : null;

  useEffect(() => {
    if (!open || results.length === 0) {
      setSelectedEntryId(null);
      return;
    }
    if (!selectedEntryId || !results.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(results[0]!.id);
    }
  }, [open, results, selectedEntryId]);

  useEffect(() => {
    if (!open || targetNetworkRole !== undefined || !selectedEntry) return;
    const compatibleRoles = getCatalogNetworkRoles(selectedEntry);
    if (localTargetNetworkRole !== null && compatibleRoles.includes(localTargetNetworkRole)) {
      return;
    }
    setLocalTargetNetworkRole(compatibleRoles[0] ?? 'processing');
  }, [localTargetNetworkRole, open, selectedEntry, targetNetworkRole]);

  useEffect(() => {
    if (!open) return undefined;
    headingRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(isDialogFocusable);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === headingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [open, triggerRef]);

  if (!open) return null;

  const unsupportedVersion = Boolean(
    selectedReference &&
    index &&
    (selectedReference.catalogId !== index.catalogId ||
      selectedReference.catalogVersion !== index.catalogVersion),
  );
  const historicalUnavailable = Boolean(
    selectedReference && index && !index.byId.has(selectedReference.entryId),
  );
  const description = selectedNodeName
    ? t('modeling.catalog.dialogForNode', { node: selectedNodeName })
    : t('modeling.catalog.dialogDescription');

  const handleFiltersChange = (nextFilters: CatalogSearchFilters): void => {
    const selectedRole = selectedNodeKind ? networkRoleForNodeKind(selectedNodeKind) : null;
    const resetDerivedRole =
      nextFilters.nodeKind === 'all' &&
      filters.nodeKind !== 'all' &&
      selectedRole !== null &&
      filters.networkRole === selectedRole;
    setFilters(resetDerivedRole ? { ...nextFilters, networkRole: 'all' } : nextFilters);
  };
  const handleTargetRoleChange = (role: CatalogNetworkRole | null): void => {
    if (targetNetworkRole === undefined) setLocalTargetNetworkRole(role);
    onTargetNetworkRoleChange?.(role);
  };

  const handleApply = (entry: CatalogEntry, assessment: CatalogApplicationAssessment): void => {
    onApply?.(entry, assessment);
  };

  const handleAttachReference = (reference: LiteratureCandidateReference): void => {
    (onAttachReference ?? onAttach)?.(reference);
  };

  const handleResultKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const cards = Array.from(
      resultListRef.current?.querySelectorAll<HTMLButtonElement>('[data-catalog-entry-button]') ??
        [],
    );
    if (cards.length === 0) return;
    event.preventDefault();
    const current = Math.max(0, cards.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? cards.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % cards.length
            : (current - 1 + cards.length) % cards.length;
    const next = cards[nextIndex]!;
    next.click();
    next.focus();
  };

  return (
    <div className="dialog-backdrop evidence-catalog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="evidence-catalog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-catalog-dialog-title"
        aria-describedby="evidence-catalog-dialog-description"
        data-catalog-unavailable={index === null}
      >
        <header className="evidence-catalog-dialog__header">
          <div>
            <p className="panel-kicker">{t('modeling.catalog.dialogKicker')}</p>
            <h2 id="evidence-catalog-dialog-title" ref={headingRef} tabIndex={-1}>
              {t('modeling.catalog.dialogTitle')}
            </h2>
            <p id="evidence-catalog-dialog-description">{description}</p>
            <span className="visually-hidden">{t('modeling.catalog.focusInstructions')}</span>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label={t('modeling.catalog.close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {unsupportedVersion ? (
          <div className="catalog-dialog-state catalog-dialog-state--warning" role="status">
            <Icon name="warning" size={16} />
            <span>{t('modeling.catalog.unsupportedVersion')}</span>
          </div>
        ) : null}
        {historicalUnavailable ? (
          <div className="catalog-dialog-state" role="status">
            <Icon name="history" size={16} />
            <span>
              {t('modeling.catalog.historicalUnavailable')}: {selectedReference?.entryId}
            </span>
          </div>
        ) : null}

        {!index ? (
          <div className="catalog-unavailable" role="status">
            <Icon name="warning" size={24} />
            <strong>{t('modeling.catalog.catalogUnavailable')}</strong>
            <p>{t('modeling.catalog.catalogUnavailableNext')}</p>
          </div>
        ) : (
          <>
            <CatalogFilterBar
              value={filters}
              index={index}
              resultCount={results.length}
              onChange={handleFiltersChange}
              onClear={() => setFilters(initialFilters(selectedNodeKind))}
              advancedOpen={selectedNodeKind !== undefined || selectedNetworkRole !== undefined}
            />
            <div className="evidence-catalog-dialog__body">
              <div className="catalog-results-pane">
                <div className="catalog-results-pane__heading">
                  <strong>{t('modeling.catalog.results')}</strong>
                  <span aria-live="polite">
                    {t('modeling.catalog.resultCount', { count: results.length })}
                  </span>
                </div>
                <div
                  ref={resultListRef}
                  className="catalog-entry-list"
                  role="list"
                  aria-label={t('modeling.catalog.resultList')}
                  onKeyDown={handleResultKeyDown}
                >
                  {results.length > 0 ? (
                    results.map((entry) => (
                      <CatalogEntryCard
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedEntryId}
                        onSelect={setSelectedEntryId}
                      />
                    ))
                  ) : (
                    <div className="catalog-no-results" role="status">
                      <Icon name="scan" size={22} />
                      <strong>{t('modeling.catalog.noResults')}</strong>
                      <span>{t('modeling.catalog.noResultsReason')}</span>
                    </div>
                  )}
                </div>
              </div>
              <CatalogEntryDetail
                entry={selectedEntry}
                canAttach={!unsupportedVersion}
                onApply={handleApply}
                onAttachReference={handleAttachReference}
                onDetach={onDetach}
                targetNetworkRole={effectiveTargetNetworkRole}
                onTargetNetworkRoleChange={handleTargetRoleChange}
                {...(selectedNodeKind ? { selectedNodeKind } : {})}
                {...(selectedNetworkRole ? { selectedNetworkRole } : {})}
                {...(selectedReference ? { attachedReference: selectedReference } : {})}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

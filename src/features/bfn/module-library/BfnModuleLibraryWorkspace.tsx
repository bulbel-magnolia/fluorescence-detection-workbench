import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Icon } from '../../../components/Icon';
import { bfnQuantityLabel, bfnUnitLabel } from '../presentation';
import type { BfnProject } from '../types';
import { BfnModuleScientificSummary } from './BfnModuleScientificSummary';
import {
  createModuleLibraryScientificPresentation,
  type ModuleLibraryScientificPresentation,
} from './moduleLibraryPresentation';
import type { BfnModuleLibraryRepository } from './moduleLibraryTypes';
import type {
  BfnModuleTemplateMetadata,
  BfnModuleTemplateVersionV1,
  BfnTemplateEntityBindingDecisions,
  BfnTemplateEntityPolicy,
  BfnTemplateInstantiationOptions,
  BfnTemplateInstantiationResult,
  BfnTemplateEntitySlotV1,
} from './template';
import {
  buildEntityBindingDecisions,
  buildReusableModuleCaptureAvailability,
  createModuleInstanceIdCandidate,
  createTemplateIdCandidate,
  instantiationFailureKind,
  listProjectEntityChoices,
  repositoryFailureKind,
  type EntityBindingFormValue,
  type ModuleLibraryCaptureFailureKind,
  type ModuleLibraryInstantiationFailureKind,
  type ModuleLibraryRepositoryFailureKind as BfnModuleLibraryRepositoryFailureKind,
  type ProjectEntityChoice,
  type ReusableModuleEntityChoice,
} from './moduleLibraryWorkflow';

export type BfnModuleLibraryInitialView =
  { readonly kind: 'browse' } | { readonly kind: 'save'; readonly moduleId: string };

interface BfnModuleLibraryWorkspaceProps {
  project: BfnProject;
  repository: BfnModuleLibraryRepository | null;
  initialView: BfnModuleLibraryInitialView;
  onBack: () => void;
  onInstantiate: (
    version: BfnModuleTemplateVersionV1,
    bindings: BfnTemplateEntityBindingDecisions,
    options: BfnTemplateInstantiationOptions,
  ) => BfnTemplateInstantiationResult;
  clock?: () => string;
}

type LibraryLoadState = 'loading' | 'ready' | 'error';
type BusyAction = 'save' | 'metadata' | 'delete' | 'add' | null;

interface LibraryFeedback {
  readonly kind: 'success' | 'neutral';
  readonly text: string;
}

export function BfnModuleLibraryWorkspace({
  project,
  repository,
  initialView,
  onBack,
  onInstantiate,
  clock,
}: BfnModuleLibraryWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const now = useCallback(() => clock?.() ?? new Date().toISOString(), [clock]);
  const [view, setView] = useState<BfnModuleLibraryInitialView>(initialView);
  const [loadState, setLoadState] = useState<LibraryLoadState>('loading');
  const [loadFailure, setLoadFailure] = useState<BfnModuleLibraryRepositoryFailureKind | null>(
    null,
  );
  const [templates, setTemplates] = useState<readonly BfnModuleTemplateMetadata[]>([]);
  const [latestByTemplate, setLatestByTemplate] = useState<
    Readonly<Record<string, BfnModuleTemplateVersionV1>>
  >({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [versions, setVersions] = useState<readonly BfnModuleTemplateVersionV1[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [operationFailure, setOperationFailure] = useState<
    BfnModuleLibraryRepositoryFailureKind | ModuleLibraryInstantiationFailureKind | null
  >(null);
  const [feedback, setFeedback] = useState<LibraryFeedback | null>(null);
  const [metadataEditing, setMetadataEditing] = useState(false);
  const [metadataName, setMetadataName] = useState('');
  const [metadataDescription, setMetadataDescription] = useState('');
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [bindingValues, setBindingValues] = useState<
    Readonly<Record<string, EntityBindingFormValue | undefined>>
  >({});
  const preferredSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!repository) {
      setLoadState('error');
      setLoadFailure('unavailable');
      return undefined;
    }
    setLoadState('loading');
    setLoadFailure(null);
    void repository
      .listTemplates()
      .then(async (metadata) => {
        const latestPairs = await Promise.all(
          metadata.map(async (entry) => {
            const version = await repository.getVersion(
              entry.id + ':version:' + entry.latestRevision,
            );
            return [entry.id, version] as const;
          }),
        );
        if (cancelled) return;
        if (latestPairs.some((entry) => entry[1] === null)) {
          setLoadFailure('corrupt');
          setLoadState('error');
          return;
        }
        const latest = Object.fromEntries(
          latestPairs.filter(
            (entry): entry is readonly [string, BfnModuleTemplateVersionV1] => entry[1] !== null,
          ),
        );
        setTemplates(metadata);
        setLatestByTemplate(latest);
        setSelectedTemplateId((current) => {
          const preferred = preferredSelectionRef.current;
          preferredSelectionRef.current = null;
          if (preferred && metadata.some((entry) => entry.id === preferred)) return preferred;
          if (current && metadata.some((entry) => entry.id === current)) return current;
          return metadata[0]?.id ?? null;
        });
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadFailure(repositoryFailureKind(error));
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, repository]);

  useEffect(() => {
    let cancelled = false;
    if (!repository || !selectedTemplateId || loadState !== 'ready') {
      setVersions([]);
      setSelectedVersionId(null);
      return undefined;
    }
    setVersionsLoading(true);
    void repository
      .listVersions(selectedTemplateId)
      .then((loaded) => {
        if (cancelled) return;
        setVersions(loaded);
        setSelectedVersionId((current) =>
          current && loaded.some((version) => version.id === current)
            ? current
            : (loaded[0]?.id ?? null),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOperationFailure(repositoryFailureKind(error));
        setVersions([]);
        setSelectedVersionId(null);
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadState, reloadToken, repository, selectedTemplateId]);

  const selectedMetadata = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;

  useEffect(() => {
    if (!selectedMetadata) {
      setMetadataName('');
      setMetadataDescription('');
      setMetadataEditing(false);
      return;
    }
    setMetadataName(selectedMetadata.name);
    setMetadataDescription(selectedMetadata.description ?? '');
    setMetadataEditing(false);
  }, [selectedMetadata]);

  useEffect(() => {
    setBindingValues({});
    setOperationFailure(null);
  }, [selectedVersionId, selectedTemplateId]);

  const refresh = (preferredTemplateId?: string): void => {
    if (preferredTemplateId) preferredSelectionRef.current = preferredTemplateId;
    setReloadToken((value) => value + 1);
  };

  const showBrowseView = (preferredTemplateId?: string, nextFeedback?: LibraryFeedback): void => {
    if (nextFeedback) setFeedback(nextFeedback);
    setView({ kind: 'browse' });
    setOperationFailure(null);
    refresh(preferredTemplateId);
  };

  if (loadState === 'error') {
    const corruption = loadFailure === 'corrupt';
    return (
      <div className="bfn-module-library-state" role="alert">
        <Icon name="warning" size={18} />
        <div>
          <h3>{t('bfn.moduleLibrary.errors.loadTitle')}</h3>
          <p>
            {t(
              corruption
                ? 'bfn.moduleLibrary.errors.corrupt'
                : 'bfn.moduleLibrary.errors.' + (loadFailure ?? 'unavailable'),
            )}
          </p>
          {corruption ? <p>{t('bfn.moduleLibrary.errors.noAutomaticRepair')}</p> : null}
          <div className="bfn-module-library-state__actions">
            <Button size="sm" variant="secondary" onClick={onBack}>
              {t('bfn.moduleLibrary.actions.back')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              {t('bfn.moduleLibrary.actions.retry')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'loading') {
    return (
      <div className="bfn-module-library-state" role="status">
        <div className="bfn-workspace-gate__spinner" aria-hidden="true" />
        <p>{t('bfn.moduleLibrary.loading')}</p>
      </div>
    );
  }

  return (
    <div className="bfn-module-library-workspace">
      <div className="bfn-module-library-workspace__toolbar">
        <button type="button" onClick={onBack}>
          <Icon name="arrow" size={14} />
          {t('bfn.moduleLibrary.actions.back')}
        </button>
        {view.kind === 'save' ? (
          <span>{t('bfn.moduleLibrary.save.reviewHint')}</span>
        ) : (
          <span>{t('bfn.moduleLibrary.browseHint')}</span>
        )}
      </div>
      {feedback ? (
        <div className="bfn-module-library-feedback" data-kind={feedback.kind} role="status">
          <Icon name={feedback.kind === 'success' ? 'check' : 'info'} size={15} />
          <span>{feedback.text}</span>
        </div>
      ) : null}
      {operationFailure ? (
        <div className="bfn-module-library-feedback" data-kind="error" role="alert">
          <Icon name="warning" size={15} />
          <span>{t('bfn.moduleLibrary.errors.' + operationFailure)}</span>
        </div>
      ) : null}

      {view.kind === 'save' ? (
        <SaveModuleView
          project={project}
          moduleId={view.moduleId}
          templates={templates}
          latestByTemplate={latestByTemplate}
          repository={repository}
          busy={busyAction === 'save'}
          language={i18n.resolvedLanguage ?? i18n.language}
          now={now}
          onBusyChange={(busy) => setBusyAction(busy ? 'save' : null)}
          onFailure={setOperationFailure}
          onSaved={showBrowseView}
        />
      ) : (
        <MyModulesView
          project={project}
          repository={repository}
          templates={templates}
          latestByTemplate={latestByTemplate}
          selectedMetadata={selectedMetadata}
          selectedVersion={selectedVersion}
          versions={versions}
          versionsLoading={versionsLoading}
          busyAction={busyAction}
          metadataEditing={metadataEditing}
          metadataName={metadataName}
          metadataDescription={metadataDescription}
          bindingValues={bindingValues}
          language={i18n.resolvedLanguage ?? i18n.language}
          now={now}
          onSelectTemplate={(templateId) => {
            setSelectedTemplateId(templateId);
            setSelectedVersionId(null);
            setFeedback(null);
            setOperationFailure(null);
          }}
          onSelectVersion={setSelectedVersionId}
          onMetadataEditingChange={setMetadataEditing}
          onMetadataNameChange={setMetadataName}
          onMetadataDescriptionChange={setMetadataDescription}
          onBindingValuesChange={setBindingValues}
          onBusyChange={setBusyAction}
          onFailure={setOperationFailure}
          onFeedback={setFeedback}
          onRefresh={refresh}
          onDeleteRequest={() => setDeleteRequested(true)}
          onInstantiate={onInstantiate}
        />
      )}

      <ConfirmDialog
        open={deleteRequested && selectedMetadata !== null}
        title={t('bfn.moduleLibrary.delete.title', { name: selectedMetadata?.name ?? '' })}
        description={t('bfn.moduleLibrary.delete.description')}
        impactItems={[
          t('bfn.moduleLibrary.delete.allVersions', {
            count: selectedMetadata?.latestRevision ?? 0,
          }),
          t('bfn.moduleLibrary.delete.projectCopiesStay'),
        ]}
        recoverability={t('bfn.moduleLibrary.delete.recoverability')}
        confirmLabel={t('bfn.moduleLibrary.delete.confirm')}
        cancelLabel={t('bfn.moduleLibrary.delete.cancel')}
        onCancel={() => setDeleteRequested(false)}
        onConfirm={() => {
          if (!repository || !selectedMetadata) return;
          setDeleteRequested(false);
          setBusyAction('delete');
          setOperationFailure(null);
          void repository
            .deleteTemplate(selectedMetadata.id)
            .then(() => {
              setSelectedTemplateId(null);
              setSelectedVersionId(null);
              setFeedback({
                kind: 'success',
                text: t('bfn.moduleLibrary.feedback.deleted', { name: selectedMetadata.name }),
              });
              refresh();
            })
            .catch((error: unknown) => setOperationFailure(repositoryFailureKind(error)))
            .finally(() => setBusyAction(null));
        }}
      />
    </div>
  );
}

interface SaveModuleViewProps {
  project: BfnProject;
  moduleId: string;
  templates: readonly BfnModuleTemplateMetadata[];
  latestByTemplate: Readonly<Record<string, BfnModuleTemplateVersionV1>>;
  repository: BfnModuleLibraryRepository | null;
  busy: boolean;
  language: string;
  now: () => string;
  onBusyChange: (busy: boolean) => void;
  onFailure: (failure: BfnModuleLibraryRepositoryFailureKind | null) => void;
  onSaved: (templateId?: string, feedback?: LibraryFeedback) => void;
}

function SaveModuleView(props: SaveModuleViewProps) {
  const { t } = useTranslation();
  const initial = useMemo(
    () => buildReusableModuleCaptureAvailability(props.project, props.moduleId),
    [props.moduleId, props.project],
  );
  const [saveMode, setSaveMode] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState(
    initial.supported ? (initial.module.authoring?.name ?? t('bfn.moduleLibrary.untitled')) : '',
  );
  const [description, setDescription] = useState(
    initial.supported ? (initial.module.authoring?.description ?? '') : '',
  );
  const [note, setNote] = useState('');
  const [targetTemplateId, setTargetTemplateId] = useState('');
  const [entityPolicies, setEntityPolicies] = useState<
    Readonly<Record<string, BfnTemplateEntityPolicy>>
  >(initial.supported ? initial.entityPolicies : {});
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const availability = useMemo(
    () => buildReusableModuleCaptureAvailability(props.project, props.moduleId, entityPolicies),
    [entityPolicies, props.moduleId, props.project],
  );
  const targetMetadata =
    props.templates.find((template) => template.id === targetTemplateId) ?? null;
  const targetVersion = targetTemplateId
    ? (props.latestByTemplate[targetTemplateId] ?? null)
    : null;

  if (!availability.supported) {
    return (
      <div className="bfn-module-library-state" role="alert">
        <Icon name="warning" size={18} />
        <div>
          <h3>{t('bfn.moduleLibrary.save.unavailableTitle')}</h3>
          <p>{t(captureFailureKey(availability.failureKind))}</p>
        </div>
      </div>
    );
  }

  const save = async (): Promise<void> => {
    if (!props.repository) return;
    const timestamp = props.now();
    setValidationMessage(null);
    props.onFailure(null);
    props.onBusyChange(true);
    try {
      if (saveMode === 'new') {
        if (name.trim().length === 0) {
          setValidationMessage(t('bfn.moduleLibrary.validation.nameRequired'));
          return;
        }
        const creation = await props.repository.createTemplate({
          templateId: createTemplateIdCandidate(name, timestamp),
          name: name.trim(),
          description: trimmedOrNull(description),
          createdAt: timestamp,
          note: trimmedOrNull(note),
          initialPayload: availability.payload,
        });
        props.onSaved(creation.metadata.id, {
          kind: 'success',
          text: t('bfn.moduleLibrary.feedback.created', {
            name: creation.metadata.name,
            revision: creation.version.revision,
          }),
        });
      } else {
        if (!targetTemplateId || !targetMetadata) {
          setValidationMessage(t('bfn.moduleLibrary.validation.targetRequired'));
          return;
        }
        const saved = await props.repository.saveScientificRevision({
          templateId: targetTemplateId,
          payload: availability.payload,
          createdAt: timestamp,
          note: trimmedOrNull(note),
        });
        props.onSaved(saved.metadata.id, {
          kind: saved.created ? 'success' : 'neutral',
          text: t(
            saved.created
              ? 'bfn.moduleLibrary.feedback.versionCreated'
              : 'bfn.moduleLibrary.feedback.sameScience',
            { name: saved.metadata.name, revision: saved.version.revision },
          ),
        });
      }
    } catch (error) {
      props.onFailure(repositoryFailureKind(error));
    } finally {
      props.onBusyChange(false);
    }
  };

  return (
    <div className="bfn-module-library-save">
      <header className="bfn-module-library-save__identity">
        <span>{t('bfn.moduleLibrary.save.kicker')}</span>
        <h3>{availability.module.authoring?.name ?? t('bfn.moduleLibrary.untitled')}</h3>
        <p>
          {availability.module.authoring?.description ??
            t('bfn.moduleLibrary.save.defaultDescription')}
        </p>
      </header>

      <fieldset className="bfn-module-library-choice-group">
        <legend>{t('bfn.moduleLibrary.save.destination')}</legend>
        <label>
          <input
            type="radio"
            name="module-library-save-mode"
            checked={saveMode === 'new'}
            onChange={() => {
              setSaveMode('new');
              setValidationMessage(null);
            }}
          />
          <span>
            <strong>{t('bfn.moduleLibrary.save.asNew')}</strong>
            <small>{t('bfn.moduleLibrary.save.asNewHint')}</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="module-library-save-mode"
            checked={saveMode === 'existing'}
            onChange={() => {
              setSaveMode('existing');
              setValidationMessage(null);
            }}
          />
          <span>
            <strong>{t('bfn.moduleLibrary.save.asVersion')}</strong>
            <small>{t('bfn.moduleLibrary.save.asVersionHint')}</small>
          </span>
        </label>
      </fieldset>

      {saveMode === 'new' ? (
        <section className="bfn-module-library-form-section">
          <h3>{t('bfn.moduleLibrary.sections.libraryDetails')}</h3>
          <div className="bfn-module-library-form-grid">
            <label>
              <span>{t('bfn.moduleLibrary.fields.name')}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>{t('bfn.moduleLibrary.fields.description')}</span>
              <textarea
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
        </section>
      ) : (
        <section className="bfn-module-library-form-section">
          <h3>{t('bfn.moduleLibrary.save.chooseTarget')}</h3>
          <label className="bfn-module-library-field">
            <span>{t('bfn.moduleLibrary.fields.savedModule')}</span>
            <select
              value={targetTemplateId}
              onChange={(event) => {
                setTargetTemplateId(event.target.value);
                setValidationMessage(null);
              }}
            >
              <option value="">{t('bfn.moduleLibrary.save.chooseTargetPlaceholder')}</option>
              {props.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · v{template.latestRevision}
                </option>
              ))}
            </select>
          </label>
          {targetMetadata && targetVersion ? (
            <SaveVersionTargetSummary
              metadata={targetMetadata}
              version={targetVersion}
              language={props.language}
            />
          ) : null}
        </section>
      )}

      <section className="bfn-module-library-form-section">
        <h3>{t('bfn.moduleLibrary.sections.entityHandling')}</h3>
        <div className="bfn-module-library-entity-list">
          {availability.entityChoices.map((choice) => (
            <CaptureEntityRow
              key={choice.sourceEntityId}
              choice={choice}
              selectedPolicy={availability.entityPolicies[choice.sourceEntityId]}
              onPolicyChange={(policy) =>
                setEntityPolicies((current) => ({
                  ...current,
                  [choice.sourceEntityId]: policy,
                }))
              }
            />
          ))}
        </div>
      </section>

      <BfnModuleScientificSummary payload={availability.payload} />

      <section className="bfn-module-library-form-section">
        <h3>{t('bfn.moduleLibrary.sections.versionNote')}</h3>
        <label className="bfn-module-library-field">
          <span>{t('bfn.moduleLibrary.fields.versionNote')}</span>
          <input
            value={note}
            placeholder={t('bfn.moduleLibrary.save.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </section>

      {validationMessage ? (
        <p className="bfn-module-library-form-error" role="alert">
          {validationMessage}
        </p>
      ) : null}
      <footer className="bfn-module-library-actions">
        <Button
          variant="primary"
          loading={props.busy}
          loadingLabel={t('bfn.moduleLibrary.actions.saving')}
          onClick={() => void save()}
        >
          {saveMode === 'new'
            ? t('bfn.moduleLibrary.actions.saveNew')
            : t('bfn.moduleLibrary.actions.saveVersion')}
        </Button>
      </footer>
    </div>
  );
}

function CaptureEntityRow({
  choice,
  selectedPolicy,
  onPolicyChange,
}: {
  choice: ReusableModuleEntityChoice;
  selectedPolicy: BfnTemplateEntityPolicy | undefined;
  onPolicyChange: (policy: BfnTemplateEntityPolicy) => void;
}) {
  const { t } = useTranslation();
  const name = choice.displayName ?? t('bfn.moduleLibrary.unknownEntity');
  const requirement = requirementSummary(choice.requirements, t);
  if (!choice.userSelectable) {
    return (
      <article className="bfn-module-library-entity-row">
        <div>
          <strong>{name}</strong>
          <small>{requirement}</small>
        </div>
        <p>
          {t(
            choice.handling === 'recognized-standard'
              ? 'bfn.moduleLibrary.entities.recognized'
              : 'bfn.moduleLibrary.entities.shared',
          )}
        </p>
      </article>
    );
  }
  return (
    <fieldset className="bfn-module-library-entity-row">
      <legend>{name}</legend>
      <small>{requirement}</small>
      <p>{t('bfn.moduleLibrary.entities.private')}</p>
      <div className="bfn-module-library-inline-options">
        <label>
          <input
            type="radio"
            name={'capture-entity-' + choice.sourceEntityId}
            checked={selectedPolicy === 'embedded'}
            onChange={() => onPolicyChange('embedded')}
          />
          {t('bfn.moduleLibrary.entities.travelWithModule')}
        </label>
        <label>
          <input
            type="radio"
            name={'capture-entity-' + choice.sourceEntityId}
            checked={selectedPolicy === 'slot'}
            onChange={() => onPolicyChange('slot')}
          />
          {t('bfn.moduleLibrary.entities.confirmWhenAdding')}
        </label>
      </div>
    </fieldset>
  );
}

function SaveVersionTargetSummary({
  metadata,
  version,
  language,
}: {
  metadata: BfnModuleTemplateMetadata;
  version: BfnModuleTemplateVersionV1;
  language: string;
}) {
  const { t } = useTranslation();
  const presentation = createModuleLibraryScientificPresentation(version.payload, t, language);
  return (
    <div className="bfn-module-library-target-summary">
      <strong>{metadata.name}</strong>
      <span>
        {t('bfn.moduleLibrary.versionLabel', { revision: metadata.latestRevision })} ·{' '}
        {presentation.modelName}
      </span>
      <small>{portFlowSummary(presentation, t)}</small>
    </div>
  );
}

interface MyModulesViewProps {
  project: BfnProject;
  repository: BfnModuleLibraryRepository | null;
  templates: readonly BfnModuleTemplateMetadata[];
  latestByTemplate: Readonly<Record<string, BfnModuleTemplateVersionV1>>;
  selectedMetadata: BfnModuleTemplateMetadata | null;
  selectedVersion: BfnModuleTemplateVersionV1 | null;
  versions: readonly BfnModuleTemplateVersionV1[];
  versionsLoading: boolean;
  busyAction: BusyAction;
  metadataEditing: boolean;
  metadataName: string;
  metadataDescription: string;
  bindingValues: Readonly<Record<string, EntityBindingFormValue | undefined>>;
  language: string;
  now: () => string;
  onSelectTemplate: (templateId: string) => void;
  onSelectVersion: (versionId: string) => void;
  onMetadataEditingChange: (editing: boolean) => void;
  onMetadataNameChange: (name: string) => void;
  onMetadataDescriptionChange: (description: string) => void;
  onBindingValuesChange: (
    values: Readonly<Record<string, EntityBindingFormValue | undefined>>,
  ) => void;
  onBusyChange: (action: BusyAction) => void;
  onFailure: (
    failure: BfnModuleLibraryRepositoryFailureKind | ModuleLibraryInstantiationFailureKind | null,
  ) => void;
  onFeedback: (feedback: LibraryFeedback | null) => void;
  onRefresh: (preferredTemplateId?: string) => void;
  onDeleteRequest: () => void;
  onInstantiate: BfnModuleLibraryWorkspaceProps['onInstantiate'];
}

function MyModulesView(props: MyModulesViewProps) {
  const { t } = useTranslation();
  if (props.templates.length === 0) {
    return (
      <div className="bfn-module-library-empty">
        <Icon name="file" size={22} />
        <h3>{t('bfn.moduleLibrary.empty.title')}</h3>
        <p>{t('bfn.moduleLibrary.empty.description')}</p>
      </div>
    );
  }

  return (
    <div className="bfn-module-library-browser">
      <section className="bfn-module-library-list" aria-labelledby="bfn-module-library-list-title">
        <header>
          <h3 id="bfn-module-library-list-title">{t('bfn.moduleLibrary.listTitle')}</h3>
          <span>{t('bfn.moduleLibrary.savedCount', { count: props.templates.length })}</span>
        </header>
        <div className="bfn-module-library-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('bfn.moduleLibrary.columns.name')}</th>
                <th>{t('bfn.moduleLibrary.columns.type')}</th>
                <th>{t('bfn.moduleLibrary.columns.latestVersion')}</th>
                <th>{t('bfn.moduleLibrary.columns.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {props.templates.map((metadata) => {
                const version = props.latestByTemplate[metadata.id];
                const presentation = version
                  ? createModuleLibraryScientificPresentation(version.payload, t, props.language)
                  : null;
                return (
                  <tr
                    key={metadata.id}
                    data-selected={metadata.id === props.selectedMetadata?.id || undefined}
                  >
                    <td>
                      <button type="button" onClick={() => props.onSelectTemplate(metadata.id)}>
                        <strong>{metadata.name}</strong>
                        <small>
                          {metadata.description ?? t('bfn.moduleLibrary.noDescription')}
                        </small>
                      </button>
                    </td>
                    <td>{presentation?.moduleType ?? t('bfn.moduleLibrary.unavailable')}</td>
                    <td>
                      {t('bfn.moduleLibrary.versionLabel', { revision: metadata.latestRevision })}
                    </td>
                    <td>{formatLibraryDate(metadata.updatedAt, props.language)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ModuleLibraryInspector {...props} />
    </div>
  );
}

function ModuleLibraryInspector(props: MyModulesViewProps) {
  const { t } = useTranslation();
  const metadata = props.selectedMetadata;
  const version = props.selectedVersion;
  if (!metadata || !version) {
    return (
      <aside className="bfn-module-library-inspector">
        <div className="bfn-module-library-state" role="status">
          {props.versionsLoading ? (
            <>
              <div className="bfn-workspace-gate__spinner" aria-hidden="true" />
              <p>{t('bfn.moduleLibrary.loadingVersion')}</p>
            </>
          ) : (
            <p>{t('bfn.moduleLibrary.selectOne')}</p>
          )}
        </div>
      </aside>
    );
  }

  const slots = version.payload.entities.filter(
    (entity): entity is BfnTemplateEntitySlotV1 => entity.mode === 'slot',
  );
  const projectEntities = listProjectEntityChoices(props.project);
  const saveMetadata = async (): Promise<void> => {
    if (!props.repository) return;
    if (props.metadataName.trim().length === 0) {
      props.onFailure('invalid');
      return;
    }
    props.onBusyChange('metadata');
    props.onFailure(null);
    try {
      await props.repository.updateMetadata({
        templateId: metadata.id,
        name: props.metadataName.trim(),
        description: trimmedOrNull(props.metadataDescription),
        updatedAt: props.now(),
      });
      props.onMetadataEditingChange(false);
      props.onFeedback({
        kind: 'success',
        text: t('bfn.moduleLibrary.feedback.metadataUpdated'),
      });
      props.onRefresh(metadata.id);
    } catch (error) {
      props.onFailure(repositoryFailureKind(error));
    } finally {
      props.onBusyChange(null);
    }
  };

  const addToProject = (): void => {
    const decisions = buildEntityBindingDecisions(
      slots.map((slot) => slot.key),
      props.bindingValues,
    );
    if (!decisions) {
      props.onFailure('incomplete');
      return;
    }
    const instanceId = createModuleInstanceIdCandidate(metadata.name, props.now(), props.project);
    if (!instanceId) {
      props.onFailure('collision');
      return;
    }
    props.onBusyChange('add');
    props.onFailure(null);
    const result = props.onInstantiate(version, decisions, {
      instanceId,
      instanceName: metadata.name,
      instanceDescription: metadata.description,
    });
    if (!result.ok) {
      props.onFailure(instantiationFailureKind(result.issues));
      props.onBusyChange(null);
    }
  };

  return (
    <aside className="bfn-module-library-inspector" aria-label={t('bfn.moduleLibrary.detailTitle')}>
      <header className="bfn-module-library-inspector__header">
        <span>{t('bfn.moduleLibrary.detailKicker')}</span>
        {props.metadataEditing ? (
          <div className="bfn-module-library-form-grid">
            <label>
              <span>{t('bfn.moduleLibrary.fields.name')}</span>
              <input
                value={props.metadataName}
                onChange={(event) => props.onMetadataNameChange(event.target.value)}
              />
            </label>
            <label>
              <span>{t('bfn.moduleLibrary.fields.description')}</span>
              <textarea
                rows={2}
                value={props.metadataDescription}
                onChange={(event) => props.onMetadataDescriptionChange(event.target.value)}
              />
            </label>
            <div className="bfn-module-library-actions">
              <Button
                size="sm"
                variant="primary"
                loading={props.busyAction === 'metadata'}
                onClick={() => void saveMetadata()}
              >
                {t('bfn.moduleLibrary.actions.saveDetails')}
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                onClick={() => {
                  props.onMetadataNameChange(metadata.name);
                  props.onMetadataDescriptionChange(metadata.description ?? '');
                  props.onMetadataEditingChange(false);
                }}
              >
                {t('bfn.moduleLibrary.actions.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h3>{metadata.name}</h3>
              <Button
                size="sm"
                variant="tertiary"
                onClick={() => props.onMetadataEditingChange(true)}
              >
                {t('bfn.moduleLibrary.actions.editDetails')}
              </Button>
            </div>
            <p>{metadata.description ?? t('bfn.moduleLibrary.noDescription')}</p>
          </>
        )}
      </header>

      <section className="bfn-module-library-version-control">
        <label>
          <span>{t('bfn.moduleLibrary.sections.moduleVersion')}</span>
          <select
            value={version.id}
            onChange={(event) => props.onSelectVersion(event.target.value)}
          >
            {props.versions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {t(
                  candidate.revision === metadata.latestRevision
                    ? 'bfn.moduleLibrary.versions.latest'
                    : 'bfn.moduleLibrary.versions.historical',
                  { revision: candidate.revision },
                )}
              </option>
            ))}
          </select>
        </label>
        <small>
          {t('bfn.moduleLibrary.fields.savedAt')}:{' '}
          {formatLibraryDate(version.createdAt, props.language)}
        </small>
        <p>{version.note ?? t('bfn.moduleLibrary.notRecorded')}</p>
      </section>

      <BfnModuleScientificSummary payload={version.payload} />

      <section className="bfn-module-library-form-section">
        <h3>{t('bfn.moduleLibrary.sections.entityHandling')}</h3>
        <AutomaticEntitySummary version={version} />
        {slots.length > 0 ? (
          <>
            <p>{t('bfn.moduleLibrary.entities.confirmIntro')}</p>
            <div className="bfn-module-library-entity-list">
              {slots.map((slot) => (
                <EntityConfirmationRow
                  key={slot.key}
                  slot={slot}
                  choices={projectEntities}
                  value={props.bindingValues[slot.key]}
                  onChange={(value) =>
                    props.onBindingValuesChange({
                      ...props.bindingValues,
                      [slot.key]: value,
                    })
                  }
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="bfn-module-library-add-boundary">
        <h3>{t('bfn.moduleLibrary.add.title')}</h3>
        <p>{t('bfn.moduleLibrary.add.copyBoundary')}</p>
        <p>{t('bfn.moduleLibrary.add.graphBoundary')}</p>
        <Button
          variant="primary"
          leadingIcon={<Icon name="plus" size={15} />}
          loading={props.busyAction === 'add'}
          disabled={
            slots.length > 0 &&
            buildEntityBindingDecisions(
              slots.map((slot) => slot.key),
              props.bindingValues,
            ) === null
          }
          {...(slots.length > 0
            ? { disabledReason: t('bfn.moduleLibrary.add.confirmEntitiesFirst') }
            : {})}
          onClick={addToProject}
        >
          {t('bfn.moduleLibrary.actions.addToProject')}
        </Button>
      </section>

      <footer className="bfn-module-library-danger-zone">
        <Button
          size="sm"
          variant="danger"
          leadingIcon={<Icon name="trash" size={14} />}
          disabled={props.busyAction !== null}
          onClick={props.onDeleteRequest}
        >
          {t('bfn.moduleLibrary.actions.deleteModule')}
        </Button>
      </footer>
    </aside>
  );
}

function AutomaticEntitySummary({ version }: { version: BfnModuleTemplateVersionV1 }) {
  const { t } = useTranslation();
  const automatic = version.payload.entities.filter((entity) => entity.mode !== 'slot');
  if (automatic.length === 0) return null;
  return (
    <div className="bfn-module-library-automatic-entities">
      <strong>{t('bfn.moduleLibrary.entities.addRecognized')}</strong>
      <ul>
        {automatic.map((entity) => (
          <li key={entity.key}>
            {entity.displayName}{' '}
            <span>
              {t(
                entity.mode === 'canonical'
                  ? 'bfn.moduleLibrary.entities.recognized'
                  : 'bfn.moduleLibrary.entities.addPrivate',
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntityConfirmationRow({
  slot,
  choices,
  value,
  onChange,
}: {
  slot: BfnTemplateEntitySlotV1;
  choices: readonly ProjectEntityChoice[];
  value: EntityBindingFormValue | undefined;
  onChange: (value: EntityBindingFormValue) => void;
}) {
  const { t } = useTranslation();
  const current: EntityBindingFormValue = value ?? {
    mode: 'create',
    targetEntityId: '',
    confirmed: false,
  };
  return (
    <fieldset className="bfn-module-library-entity-confirmation">
      <legend>{safeSlotName(slot, t)}</legend>
      <small>{requirementSummary(slot.requirements, t)}</small>
      <div className="bfn-module-library-inline-options">
        <label>
          <input
            type="radio"
            name={'entity-binding-' + slot.key}
            checked={current.mode === 'create'}
            onChange={() => onChange({ ...current, mode: 'create', targetEntityId: '' })}
          />
          {t('bfn.moduleLibrary.entities.createInProject')}
        </label>
        <label>
          <input
            type="radio"
            name={'entity-binding-' + slot.key}
            checked={current.mode === 'existing'}
            onChange={() => onChange({ ...current, mode: 'existing' })}
          />
          {t('bfn.moduleLibrary.entities.useExisting')}
        </label>
      </div>
      {current.mode === 'existing' ? (
        <label>
          <span>{t('bfn.moduleLibrary.entities.chooseExisting')}</span>
          <select
            value={current.targetEntityId}
            onChange={(event) =>
              onChange({ ...current, targetEntityId: event.target.value, confirmed: false })
            }
          >
            <option value="">{t('bfn.moduleLibrary.entities.chooseExistingPlaceholder')}</option>
            {choices.map((choice) => (
              <option key={choice.entityId} value={choice.entityId}>
                {choice.displayName ?? t('bfn.moduleLibrary.unknownEntity')} ·{' '}
                {requirementSummary(choice.requirements, t)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="bfn-module-library-identity-confirmation">
        <input
          type="checkbox"
          checked={current.confirmed}
          onChange={(event) => onChange({ ...current, confirmed: event.target.checked })}
        />
        {t('bfn.moduleLibrary.entities.identityConfirmation', {
          entity: safeSlotName(slot, t),
        })}
      </label>
      <p>{t('bfn.moduleLibrary.entities.distinctRequired')}</p>
    </fieldset>
  );
}

function requirementSummary(
  requirements: readonly {
    direction: 'input' | 'output';
    quantityType: string;
    unit: string;
  }[],
  t: TFunction,
): string {
  if (requirements.length === 0) return t('bfn.moduleLibrary.notRecorded');
  return requirements
    .map(
      (requirement) =>
        t('bfn.moduleLibrary.portDirections.' + requirement.direction) +
        ' · ' +
        bfnQuantityLabel(requirement.quantityType, t) +
        ' · ' +
        bfnUnitLabel(requirement.unit, t),
    )
    .join('; ');
}

function safeSlotName(slot: BfnTemplateEntitySlotV1, t: TFunction): string {
  return slot.displayName === slot.sourceEntityId
    ? t('bfn.moduleLibrary.unknownEntity')
    : slot.displayName;
}

function portFlowSummary(presentation: ModuleLibraryScientificPresentation, t: TFunction): string {
  return t('bfn.moduleLibrary.flow', {
    inputs: presentation.ports.filter((port) => port.direction === 'input').length,
    outputs: presentation.ports.filter((port) => port.direction === 'output').length,
  });
}

function captureFailureKey(kind: ModuleLibraryCaptureFailureKind): string {
  return 'bfn.moduleLibrary.captureFailures.' + kind;
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatLibraryDate(value: string, language: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(timestamp));
}

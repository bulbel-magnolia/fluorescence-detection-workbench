import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Icon } from '../../../components/Icon';
import type { BfnProject } from '../types';
import { summarizeBfnProject } from './workspaceTypes';
import type { BfnWorkspaceProjectMetadata, BfnWorkspaceVersionListItem } from './workspaceTypes';

interface BfnProjectCenterProps {
  open: boolean;
  projects: readonly BfnWorkspaceProjectMetadata[];
  activeProject: BfnWorkspaceProjectMetadata;
  draft: BfnProject;
  versions: readonly BfnWorkspaceVersionListItem[];
  runCount: number;
  busy?: boolean;
  onClose: () => void;
  onSwitch: (projectId: string) => Promise<void>;
  onCreateBlank: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onRename: (projectId: string, name: string) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
  onSaveVersion: (name?: string, note?: string) => Promise<void>;
  onRestore: (versionId: string) => Promise<void>;
}

type Confirmation =
  | { kind: 'delete'; project: BfnWorkspaceProjectMetadata }
  | { kind: 'restore'; version: BfnWorkspaceVersionListItem };

function formatDate(value: string, language: string): string {
  return new Date(value).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
}

export function BfnProjectCenter({
  open,
  projects,
  activeProject,
  draft,
  versions,
  runCount,
  busy = false,
  onClose,
  onSwitch,
  onCreateBlank,
  onDuplicate,
  onRename,
  onDelete,
  onSaveVersion,
  onRestore,
}: BfnProjectCenterProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [versionFormOpen, setVersionFormOpen] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const summary = summarizeBfnProject(draft);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || confirmation) return;
      event.preventDefault();
      if (versionFormOpen) {
        setVersionFormOpen(false);
        setVersionName('');
        setVersionNote('');
        return;
      }
      if (renamingId) {
        setRenamingId(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [confirmation, onClose, open, renamingId, versionFormOpen]);

  if (!open) return null;

  const startRename = (project: BfnWorkspaceProjectMetadata): void => {
    setRenamingId(project.id);
    setRenameValue(project.name);
  };

  const commitRename = async (): Promise<void> => {
    if (!renamingId || !renameValue.trim()) return;
    await onRename(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  const commitVersion = async (): Promise<void> => {
    try {
      await onSaveVersion(versionName || undefined, versionNote || undefined);
    } catch {
      return;
    }
    setVersionFormOpen(false);
    setVersionName('');
    setVersionNote('');
  };

  const confirmationCopy =
    confirmation?.kind === 'delete'
      ? {
          title: t('bfn.workspace.delete.title'),
          description: t('bfn.workspace.delete.description', {
            name: confirmation.project.name,
          }),
          recoverability: t('bfn.workspace.delete.recoverability'),
          confirmLabel: t('bfn.workspace.delete.confirm'),
        }
      : {
          title: t('bfn.workspace.restore.title', {
            revision: confirmation?.version.revision ?? 0,
          }),
          description: t('bfn.workspace.restore.description', {
            revision: confirmation?.version.revision ?? 0,
          }),
          recoverability: t('bfn.workspace.restore.recoverability'),
          confirmLabel: t('bfn.workspace.restore.confirm'),
        };

  return (
    <div className="bfn-drawer-layer bfn-project-center-layer">
      <button
        className="bfn-drawer-scrim"
        type="button"
        aria-label={t('bfn.workspace.close')}
        onClick={onClose}
      />
      <aside
        className="bfn-drawer bfn-project-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="bfn-drawer__header bfn-project-center__header">
          <div>
            <span>{t('bfn.workspace.kicker')}</span>
            <h2 id={titleId}>{t('bfn.workspace.title')}</h2>
          </div>
          <button
            ref={closeRef}
            className="bfn-drawer__close"
            type="button"
            aria-label={t('bfn.workspace.close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="bfn-project-center__body">
          <section className="bfn-project-list" aria-label={t('bfn.workspace.projects.label')}>
            <header>
              <strong>{t('bfn.workspace.projects.title')}</strong>
              <span>{projects.length}</span>
            </header>
            <div className="bfn-project-list__actions">
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<Icon name="plus" size={14} />}
                disabled={busy}
                onClick={() => void onCreateBlank()}
              >
                {t('bfn.workspace.projects.newBlank')}
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                disabled={busy}
                onClick={() => void onDuplicate()}
              >
                {t('bfn.workspace.projects.duplicate')}
              </Button>
            </div>
            <div className="bfn-project-list__items">
              {projects.map((project) => (
                <article key={project.id} data-active={project.id === activeProject.id}>
                  {renamingId === project.id ? (
                    <form
                      className="bfn-project-rename"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void commitRename();
                      }}
                    >
                      <label className="visually-hidden" htmlFor={`rename-${project.id}`}>
                        {t('bfn.workspace.projects.renameLabel')}
                      </label>
                      <input
                        id={`rename-${project.id}`}
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                      />
                      <button type="submit" disabled={!renameValue.trim() || busy}>
                        {t('bfn.workspace.projects.saveName')}
                      </button>
                      <button type="button" onClick={() => setRenamingId(null)}>
                        {t('bfn.workspace.cancel')}
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        className="bfn-project-list__select"
                        type="button"
                        aria-current={project.id === activeProject.id ? 'true' : undefined}
                        disabled={busy}
                        onClick={() => void onSwitch(project.id)}
                      >
                        <strong>{project.name}</strong>
                        <small>{formatDate(project.lastOpenedAt, i18n.language)}</small>
                      </button>
                      <div className="bfn-project-list__row-actions">
                        <button
                          type="button"
                          aria-label={t('bfn.workspace.projects.renameAria', {
                            name: project.name,
                          })}
                          onClick={() => startRename(project)}
                        >
                          {t('bfn.workspace.projects.rename')}
                        </button>
                        <button
                          type="button"
                          className="danger-text-button"
                          disabled={projects.length === 1 || busy}
                          aria-label={t('bfn.workspace.projects.deleteAria', {
                            name: project.name,
                          })}
                          onClick={() => setConfirmation({ kind: 'delete', project })}
                        >
                          {t('bfn.workspace.projects.delete')}
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="bfn-project-history" aria-label={t('bfn.workspace.history.label')}>
            <header className="bfn-project-history__identity">
              <div>
                <span>{t('bfn.workspace.history.currentProject')}</span>
                <h3>{activeProject.name}</h3>
              </div>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || versionFormOpen}
                onClick={() => setVersionFormOpen(true)}
              >
                {t('bfn.workspace.versions.save')}
              </Button>
            </header>

            <article className="bfn-current-draft">
              <div>
                <strong>{t('bfn.workspace.draft.title')}</strong>
                <span>{t('bfn.workspace.draft.autosaved')}</span>
              </div>
              <dl>
                <div>
                  <dt>{t('bfn.workspace.summary.inputs')}</dt>
                  <dd>{summary.inputCount}</dd>
                </div>
                <div>
                  <dt>{t('bfn.workspace.summary.modules')}</dt>
                  <dd>{summary.moduleCount}</dd>
                </div>
                <div>
                  <dt>{t('bfn.workspace.summary.outputs')}</dt>
                  <dd>{summary.outputCount}</dd>
                </div>
                <div>
                  <dt>{t('bfn.workspace.summary.mode')}</dt>
                  <dd>{t(`bfn.modes.${summary.mode}`)}</dd>
                </div>
              </dl>
              <small>
                {t('bfn.workspace.draft.updated', {
                  time: formatDate(activeProject.draftUpdatedAt, i18n.language),
                })}
                {' · '}
                {t('bfn.workspace.draft.runs', { count: runCount })}
              </small>
            </article>

            {versionFormOpen ? (
              <form
                className="bfn-version-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void commitVersion();
                }}
              >
                <header>
                  <strong>{t('bfn.workspace.versions.formTitle')}</strong>
                  <span>
                    {t('bfn.workspace.versions.formMeta', {
                      revision: activeProject.nextRevision,
                    })}
                  </span>
                </header>
                <label>
                  <span>{t('bfn.workspace.versions.name')}</span>
                  <input
                    autoFocus
                    value={versionName}
                    maxLength={80}
                    placeholder={t('bfn.workspace.versions.namePlaceholder')}
                    onChange={(event) => setVersionName(event.target.value)}
                  />
                </label>
                <label>
                  <span>{t('bfn.workspace.versions.note')}</span>
                  <textarea
                    value={versionNote}
                    maxLength={400}
                    rows={3}
                    placeholder={t('bfn.workspace.versions.notePlaceholder')}
                    onChange={(event) => setVersionNote(event.target.value)}
                  />
                </label>
                <div>
                  <Button
                    type="button"
                    variant="tertiary"
                    onClick={() => setVersionFormOpen(false)}
                  >
                    {t('bfn.workspace.cancel')}
                  </Button>
                  <Button type="submit" variant="primary" disabled={busy}>
                    {t('bfn.workspace.versions.confirmSave')}
                  </Button>
                </div>
              </form>
            ) : null}

            <div className="bfn-version-history">
              <header>
                <strong>{t('bfn.workspace.versions.title')}</strong>
                <span>{versions.length}</span>
              </header>
              {versions.length ? (
                <ol>
                  {versions.map((version) => (
                    <li key={version.id}>
                      <div className="bfn-version-history__revision">
                        <strong>
                          {t('bfn.workspace.versions.revision', { revision: version.revision })}
                        </strong>
                        <span>{formatDate(version.createdAt, i18n.language)}</span>
                      </div>
                      {version.name ? <h4>{version.name}</h4> : null}
                      {version.note ? <p>{version.note}</p> : null}
                      <small>
                        {t('bfn.workspace.versions.summary', {
                          inputs: version.summary.inputCount,
                          modules: version.summary.moduleCount,
                          outputs: version.summary.outputCount,
                          mode: t(`bfn.modes.${version.summary.mode}`),
                        })}
                      </small>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={t('bfn.workspace.versions.restoreAria', {
                          revision: version.revision,
                        })}
                        onClick={() => setConfirmation({ kind: 'restore', version })}
                      >
                        {t('bfn.workspace.versions.restore')}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="bfn-version-history__empty">
                  <Icon name="history" size={18} />
                  <p>{t('bfn.workspace.versions.empty')}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmation !== null}
        title={confirmationCopy.title}
        description={confirmationCopy.description}
        recoverability={confirmationCopy.recoverability}
        confirmLabel={confirmationCopy.confirmLabel}
        cancelLabel={t('bfn.workspace.cancel')}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const action = confirmation;
          setConfirmation(null);
          if (action?.kind === 'delete') void onDelete(action.project.id);
          if (action?.kind === 'restore') void onRestore(action.version.id);
        }}
      />
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { InlineStatus } from '../../components/InlineStatus';
import { MetadataLabel } from '../../components/MetadataLabel';

export type BfnPrimaryWorkspace = 'design' | 'inverse';
export type BfnSaveStatus = 'saving' | 'saved' | 'error';

interface BfnProjectToolbarProps {
  projectName: string;
  networkName: string;
  workspace: BfnPrimaryWorkspace;
  saveStatus: BfnSaveStatus;
  onWorkspaceChange: (workspace: BfnPrimaryWorkspace) => void;
  onImport: () => void;
  onExport: () => void;
  onReset: () => void;
}

const workspaces: BfnPrimaryWorkspace[] = ['design', 'inverse'];

export function BfnProjectToolbar({
  projectName,
  networkName,
  workspace,
  saveStatus,
  onWorkspaceChange,
  onImport,
  onExport,
  onReset,
}: BfnProjectToolbarProps) {
  const { t } = useTranslation();
  const saveLabel =
    saveStatus === 'saving'
      ? t('bfn.project.saving')
      : saveStatus === 'saved'
        ? t('bfn.project.autoSaved')
        : t('bfn.project.saveFailed');

  return (
    <header className="bfn-project-toolbar">
      <div className="bfn-project-toolbar__identity">
        <h1 title={projectName}>{projectName}</h1>
        <span className="bfn-project-toolbar__separator" aria-hidden="true">
          /
        </span>
        <strong title={networkName}>{networkName}</strong>
      </div>
      <div className="bfn-project-toolbar__status">
        <MetadataLabel
          label={t('bfn.status.demoLabel')}
          accessibleLabel={t('bfn.status.demoProject')}
          tone="warning"
        />
        <span className="visually-hidden" aria-hidden="true">
          {t('bfn.status.demoProject')}
        </span>
        <InlineStatus
          label={saveLabel}
          tone={saveStatus === 'error' ? 'danger' : saveStatus === 'saving' ? 'accent' : 'success'}
          announce
        />
      </div>
      <nav className="bfn-workspace-tabs" role="tablist" aria-label={t('bfn.workflow.label')}>
        {workspaces.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={workspace === candidate}
            className={workspace === candidate ? 'is-active' : ''}
            onClick={() => onWorkspaceChange(candidate)}
          >
            {t(`bfn.workflow.${candidate}.title`)}
          </button>
        ))}
      </nav>
      <div className="bfn-project-toolbar__actions">
        <Button
          size="sm"
          variant="tertiary"
          leadingIcon={<Icon name="import" size={15} />}
          onClick={onImport}
        >
          {t('bfn.actions.import')}
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          leadingIcon={<Icon name="export" size={15} />}
          onClick={onExport}
        >
          {t('bfn.actions.export')}
        </Button>
        <details className="bfn-more-actions">
          <summary aria-label={t('bfn.actions.more')}>···</summary>
          <button className="danger-text-button" type="button" onClick={onReset}>
            <Icon name="reset" size={15} />
            {t('bfn.actions.reset')}
          </button>
        </details>
      </div>
    </header>
  );
}

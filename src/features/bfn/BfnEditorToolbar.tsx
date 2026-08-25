import { useTranslation } from 'react-i18next';

interface BfnEditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function BfnEditorToolbar({ canUndo, canRedo, onUndo, onRedo }: BfnEditorToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="bfn-editor-toolbar" role="toolbar" aria-label={t('bfn.history.toolbar')}>
      <button
        type="button"
        disabled={!canUndo}
        aria-label={t('bfn.history.undo')}
        title={`${t('bfn.history.undo')} · Ctrl+Z`}
        onClick={onUndo}
      >
        <span aria-hidden="true">↶</span>
        {t('bfn.history.undo')}
      </button>
      <button
        type="button"
        disabled={!canRedo}
        aria-label={t('bfn.history.redo')}
        title={`${t('bfn.history.redo')} · Ctrl+Y / Ctrl+Shift+Z`}
        onClick={onRedo}
      >
        <span aria-hidden="true">↷</span>
        {t('bfn.history.redo')}
      </button>
    </div>
  );
}

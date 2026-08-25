export type BfnEditorShortcut = 'undo' | 'redo' | 'delete-selection';

export function isBfnEditorOverlayOpen(root: ParentNode = document): boolean {
  return root.querySelector('[aria-modal=true]') !== null;
}

export function isBfnEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || (target.contentEditable ?? '').toLowerCase() === 'true')
  );
}

export function bfnEditorShortcut(event: KeyboardEvent): BfnEditorShortcut | null {
  if (isBfnEditableTarget(event.target) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey && key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (event.ctrlKey && !event.shiftKey && key === 'y') return 'redo';
  if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'Delete') {
    return 'delete-selection';
  }
  return null;
}

import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bfnEditorShortcut } from './editorShortcuts';

function shortcutFrom(target: HTMLElement, init: KeyboardEventInit) {
  let shortcut: ReturnType<typeof bfnEditorShortcut> = null;
  target.addEventListener('keydown', (event) => {
    shortcut = bfnEditorShortcut(event);
  });
  fireEvent.keyDown(target, init);
  return shortcut;
}

describe('BFN editor shortcuts', () => {
  it('maps Windows undo, redo, and delete shortcuts', () => {
    const target = document.createElement('div');
    expect(shortcutFrom(target, { key: 'z', ctrlKey: true })).toBe('undo');
    expect(shortcutFrom(target, { key: 'y', ctrlKey: true })).toBe('redo');
    expect(shortcutFrom(target, { key: 'Z', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(shortcutFrom(target, { key: 'Delete' })).toBe('delete-selection');
  });

  it.each(['input', 'textarea', 'select'])('protects focused %s controls', (tagName) => {
    const target = document.createElement(tagName);
    expect(shortcutFrom(target, { key: 'z', ctrlKey: true })).toBeNull();
    expect(shortcutFrom(target, { key: 'Delete' })).toBeNull();
  });

  it('protects contenteditable fields', () => {
    const target = document.createElement('div');
    target.contentEditable = 'true';
    expect(shortcutFrom(target, { key: 'Delete' })).toBeNull();
  });
});

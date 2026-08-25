export interface BfnClipboardEnvironment {
  writeText?: (text: string) => Promise<void> | void;
  write?: (items: readonly unknown[]) => Promise<void> | void;
  createClipboardItem?: (items: Record<string, Blob>) => unknown;
  supportsMimeType?: (mimeType: string) => boolean;
  fallbackWriteText?: (text: string) => boolean;
}

export interface BfnClipboardCapabilities {
  text: boolean;
  textFallback: boolean;
  imagePng: boolean;
}

export type BfnClipboardResult =
  | { status: 'success'; operation: 'text' | 'image'; method: 'async-clipboard' | 'text-fallback' }
  | { status: 'unsupported'; operation: 'text' | 'image'; reason: 'text-copy-unsupported' | 'image-png-copy-unsupported' }
  | { status: 'failure'; operation: 'text' | 'image'; message: string };

function asyncClipboard(): Clipboard | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.clipboard;
}

function defaultWriteText(text: string): Promise<void> {
  const clipboard = asyncClipboard();
  if (!clipboard || typeof clipboard.writeText !== 'function') return Promise.reject(new Error('Text clipboard write is unavailable.'));
  return clipboard.writeText(text);
}

function defaultWrite(items: readonly unknown[]): Promise<void> {
  const clipboard = asyncClipboard();
  if (!clipboard || typeof clipboard.write !== 'function') return Promise.reject(new Error('Image clipboard write is unavailable.'));
  return clipboard.write(items as ClipboardItems);
}

function defaultCreateClipboardItem(items: Record<string, Blob>): ClipboardItem {
  if (typeof ClipboardItem === 'undefined') throw new Error('ClipboardItem is unavailable.');
  return new ClipboardItem(items);
}

function defaultSupportsMimeType(mimeType: string): boolean {
  if (typeof ClipboardItem === 'undefined') return false;
  const supports = (ClipboardItem as typeof ClipboardItem & { supports?: (type: string) => boolean }).supports;
  return typeof supports === 'function' ? supports.call(ClipboardItem, mimeType) : mimeType === 'image/png';
}

function defaultFallbackWriteText(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  try {
    document.body?.appendChild(textarea);
    textarea.select();
    return document.execCommand('copy');
  } finally {
    try {
      textarea.remove();
    } catch {
      try {
        textarea.parentNode?.removeChild(textarea);
      } catch {
        // Cleanup is best effort; the copy result is still reported by the caller.
      }
    }
  }
}

function resolveEnvironment(environment?: BfnClipboardEnvironment): Required<Pick<BfnClipboardEnvironment, 'writeText' | 'write' | 'createClipboardItem' | 'supportsMimeType' | 'fallbackWriteText'>> {
  return {
    writeText: environment?.writeText ?? defaultWriteText,
    write: environment?.write ?? defaultWrite,
    createClipboardItem: environment?.createClipboardItem ?? defaultCreateClipboardItem,
    supportsMimeType: environment?.supportsMimeType ?? defaultSupportsMimeType,
    fallbackWriteText: environment?.fallbackWriteText ?? defaultFallbackWriteText,
  };
}

export function getBfnClipboardCapabilities(environment?: BfnClipboardEnvironment): BfnClipboardCapabilities {
  const resolved = resolveEnvironment(environment);
  const explicit = environment !== undefined;
  const hasText = explicit ? typeof environment.writeText === 'function' : typeof asyncClipboard()?.writeText === 'function';
  const hasFallback = explicit ? typeof environment.fallbackWriteText === 'function' : typeof document !== 'undefined' && typeof document.execCommand === 'function';
  const hasImageWrite = explicit ? typeof environment.write === 'function' : typeof asyncClipboard()?.write === 'function';
  const hasItem = explicit ? typeof environment.createClipboardItem === 'function' : typeof ClipboardItem !== 'undefined';
  let hasMime = false;
  if (hasItem) {
    try {
      hasMime = resolved.supportsMimeType('image/png') === true;
    } catch {
      hasMime = false;
    }
  }
  return {
    text: hasText,
    textFallback: hasFallback,
    imagePng: hasImageWrite && hasItem && hasMime,
  };
}

function failureMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : typeof error === 'string' && error.length > 0 ? error : fallback;
}

function runFallbackText(text: string, fallbackWriteText: (value: string) => boolean): BfnClipboardResult {
  try {
    const copied = fallbackWriteText(text);
    if (copied !== true) {
      return {
        status: 'failure',
        operation: 'text',
        message: 'Text fallback did not complete the copy operation.',
      };
    }
    return { status: 'success', operation: 'text', method: 'text-fallback' };
  } catch (error) {
    return { status: 'failure', operation: 'text', message: failureMessage(error, 'Text fallback failed.') };
  }
}

export async function copyBfnText(text: string, environment?: BfnClipboardEnvironment): Promise<BfnClipboardResult> {
  const resolved = resolveEnvironment(environment);
  const hasAsync = typeof environment === 'object' && environment !== undefined
    ? typeof environment.writeText === 'function'
    : typeof asyncClipboard()?.writeText === 'function';
  const hasFallback = typeof environment === 'object' && environment !== undefined
    ? typeof environment.fallbackWriteText === 'function'
    : typeof document !== 'undefined' && typeof document.execCommand === 'function';
  if (hasAsync) {
    try {
      await resolved.writeText(text);
      return { status: 'success', operation: 'text', method: 'async-clipboard' };
    } catch (error) {
      if (hasFallback) return runFallbackText(text, resolved.fallbackWriteText);
      return { status: 'failure', operation: 'text', message: failureMessage(error, 'Text clipboard write failed.') };
    }
  }
  if (hasFallback) return runFallbackText(text, resolved.fallbackWriteText);
  return { status: 'unsupported', operation: 'text', reason: 'text-copy-unsupported' };
}

export async function copyBfnPng(blob: Blob, environment?: BfnClipboardEnvironment): Promise<BfnClipboardResult> {
  const resolved = resolveEnvironment(environment);
  const capabilities = getBfnClipboardCapabilities(environment);
  if (!capabilities.imagePng) {
    return { status: 'unsupported', operation: 'image', reason: 'image-png-copy-unsupported' };
  }
  try {
    const item = resolved.createClipboardItem({ 'image/png': blob });
    await resolved.write([item]);
    return { status: 'success', operation: 'image', method: 'async-clipboard' };
  } catch (error) {
    return { status: 'failure', operation: 'image', message: failureMessage(error, 'Image clipboard write failed.') };
  }
}

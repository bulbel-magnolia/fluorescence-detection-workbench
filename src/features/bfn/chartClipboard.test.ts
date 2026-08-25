import { describe, expect, it, vi } from 'vitest';
import {
  copyBfnPng,
  copyBfnText,
  getBfnClipboardCapabilities,
  type BfnClipboardEnvironment,
} from './chartClipboard';

describe('BFN clipboard capability and copy operations', () => {
  it('uses async writeText when it is available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const environment: BfnClipboardEnvironment = { writeText };

    expect(getBfnClipboardCapabilities(environment)).toEqual({
      text: true,
      textFallback: false,
      imagePng: false,
    });
    await expect(copyBfnText('a\tb', environment)).resolves.toEqual({
      status: 'success',
      operation: 'text',
      method: 'async-clipboard',
    });
    expect(writeText).toHaveBeenCalledWith('a\tb');
  });

  it('falls back to a synchronous text copy path when async clipboard is unavailable or rejects', async () => {
    const fallbackWriteText = vi.fn(() => true);
    const environment: BfnClipboardEnvironment = {
      writeText: vi.fn(() => Promise.reject(new Error('permission denied'))),
      fallbackWriteText,
    };

    await expect(copyBfnText('raw\tdata', environment)).resolves.toEqual({
      status: 'success',
      operation: 'text',
      method: 'text-fallback',
    });
    expect(fallbackWriteText).toHaveBeenCalledWith('raw\tdata');
  });

  it('returns explicit unsupported and failure states without claiming success', async () => {
    await expect(copyBfnText('x', {})).resolves.toEqual({
      status: 'unsupported',
      operation: 'text',
      reason: 'text-copy-unsupported',
    });
    await expect(copyBfnText('x', { writeText: vi.fn(() => Promise.reject(new Error('blocked'))) }))
      .resolves.toMatchObject({ status: 'failure', operation: 'text', message: 'blocked' });
    await expect(copyBfnText('x', { fallbackWriteText: () => false })).resolves.toEqual({
      status: 'failure',
      operation: 'text',
      message: 'Text fallback did not complete the copy operation.',
    });
  });

  it('copies image/png only when write, ClipboardItem, and MIME support are all present', async () => {
    const item = { kind: 'clipboard-item' };
    const createClipboardItem = vi.fn(() => item);
    const write = vi.fn(() => Promise.resolve());
    const environment: BfnClipboardEnvironment = {
      write,
      createClipboardItem,
      supportsMimeType: (type) => type === 'image/png',
    };
    const png = new Blob(['png'], { type: 'image/png' });

    expect(getBfnClipboardCapabilities(environment).imagePng).toBe(true);
    await expect(copyBfnPng(png, environment)).resolves.toEqual({
      status: 'success',
      operation: 'image',
      method: 'async-clipboard',
    });
    expect(createClipboardItem).toHaveBeenCalledWith({ 'image/png': png });
    expect(write).toHaveBeenCalledWith([item]);
  });

  it('reports unsupported image copy when image/png is not supported', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    const partial: BfnClipboardEnvironment = {
      write: vi.fn(() => Promise.resolve()),
      createClipboardItem: (items) => items,
      supportsMimeType: () => false,
    };

    expect(getBfnClipboardCapabilities(partial).imagePng).toBe(false);
    await expect(copyBfnPng(png, partial)).resolves.toEqual({
      status: 'unsupported',
      operation: 'image',
      reason: 'image-png-copy-unsupported',
    });
  });

  it('degrades a throwing image MIME capability probe to an explicit unsupported result', async () => {
    const environment: BfnClipboardEnvironment = {
      write: vi.fn(() => Promise.resolve()),
      createClipboardItem: (items) => items,
      supportsMimeType: () => {
        throw new Error('capability probe failed');
      },
    };
    const png = new Blob(['png'], { type: 'image/png' });

    expect(getBfnClipboardCapabilities(environment).imagePng).toBe(false);
    await expect(copyBfnPng(png, environment)).resolves.toEqual({
      status: 'unsupported',
      operation: 'image',
      reason: 'image-png-copy-unsupported',
    });
  });

  it('returns a failure when the image clipboard write rejects', async () => {
    const environment: BfnClipboardEnvironment = {
      write: vi.fn(() => Promise.reject(new Error('image blocked'))),
      createClipboardItem: (items) => items,
      supportsMimeType: () => true,
    };

    await expect(copyBfnPng(new Blob(['png'], { type: 'image/png' }), environment)).resolves.toEqual({
      status: 'failure',
      operation: 'image',
      message: 'image blocked',
    });
  });

  it('does not treat an undefined synchronous fallback result as success', async () => {
    await expect(copyBfnText('x', { fallbackWriteText: (() => undefined) as unknown as (text: string) => boolean })).resolves.toEqual({
      status: 'failure',
      operation: 'text',
      message: 'Text fallback did not complete the copy operation.',
    });
  });

  it('removes the temporary textarea when the default fallback selection throws', async () => {
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => true) });
    const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select').mockImplementation(() => {
      throw new Error('selection failed');
    });
    const before = document.querySelectorAll('textarea').length;

    try {
      await expect(copyBfnText('x')).resolves.toMatchObject({
        status: 'failure',
        operation: 'text',
        message: 'selection failed',
      });
      expect(document.querySelectorAll('textarea')).toHaveLength(before);
    } finally {
      select.mockRestore();
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (execCommandDescriptor) Object.defineProperty(document, 'execCommand', execCommandDescriptor);
      else Reflect.deleteProperty(document, 'execCommand');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { loadAhlHslCatalogRelease } from '../../v2/catalogReleaseLoader';
import { cloneBundledSenderExtensionSourcePackage } from './senderExtensionLoader';
import { validateSenderEvidenceExtensionSourcePackage } from './senderExtensionValidator';

describe('Sender Evidence Extension V1.2 fail-closed validation', () => {
  const base = loadAhlHslCatalogRelease().release;

  it('rejects duplicate IDs', () => {
    const input = cloneBundledSenderExtensionSourcePackage();
    const document = record(input.componentsDocument);
    const signals = array(document.new_signals);
    record(signals[1]).id = record(signals[0]).id;
    const result = validateSenderEvidenceExtensionSourcePackage(input, base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === 'duplicate-id')).toBe(true);
  });

  it('rejects a broken foreign key', () => {
    const input = cloneBundledSenderExtensionSourcePackage();
    const document = record(input.outputsDocument);
    record(array(document.sender_outputs)[0]).sender_component_id = 'send.missing.v1';
    const result = validateSenderEvidenceExtensionSourcePackage(input, base);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.some((error) => error.code === 'unknown-reference')).toBe(true);
  });

  it('rejects an attempted frozen V1.1 ID overwrite', () => {
    const input = cloneBundledSenderExtensionSourcePackage();
    const document = record(input.componentsDocument);
    record(array(document.new_sender_components)[0]).id = base.components[0]?.id;
    const result = validateSenderEvidenceExtensionSourcePackage(input, base);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.some((error) => error.code === 'base-overwrite')).toBe(true);
  });

  it('rejects mutation of a reused V1.1 source citation', () => {
    const input = cloneBundledSenderExtensionSourcePackage();
    input.sourcesCsv = input.sourcesCsv.replace(
      'Characterization of diverse homoserine lactone synthases in Escherichia coli',
      'Changed title',
    );
    const result = validateSenderEvidenceExtensionSourcePackage(input, base);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.some((error) => error.code === 'base-source-overwrite')).toBe(true);
  });
});

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected mutable object fixture.');
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected mutable array fixture.');
  return value;
}

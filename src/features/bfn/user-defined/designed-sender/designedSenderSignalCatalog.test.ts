import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTrustedAhlHslCatalogRelease } from '../../../modeling/catalog/v2/catalogReleaseLoader';
import { getDesignedSenderSignalCatalog } from './designedSenderSignalCatalog';

describe('Designed Sender trusted signal identity projection', () => {
  it('projects only immutable AHL/HSL identity fields with exact canonical BFN entities', () => {
    const trusted = getTrustedAhlHslCatalogRelease();
    const projected = getDesignedSenderSignalCatalog();
    const expected = trusted.release.signals
      .filter((signal) => signal.id.startsWith('ahl.'))
      .map((signal) => ({
        catalogSignalId: signal.id,
        entityId: signal.canonical_name,
        displayName: signal.canonical_name,
      }));

    expect(projected).toEqual(expected);
    expect(projected).toHaveLength(26);
    expect(projected.every((identity) => identity.entityId.trim().length > 0)).toBe(true);
    expect(projected.every((identity) => Object.keys(identity).length === 3)).toBe(true);
    expect(projected.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(projected)).toBe(true);
  });

  it('is deterministic and cannot be mutated by consumers', () => {
    const first = getDesignedSenderSignalCatalog();
    const second = getDesignedSenderSignalCatalog();

    expect(first).toEqual(second);
    expect(() =>
      (first as unknown as { catalogSignalId: string }[]).push({ catalogSignalId: 'spoofed' }),
    ).toThrow();
    expect(() => {
      (first[0] as { entityId: string }).entityId = 'spoofed';
    }).toThrow();
    expect(getDesignedSenderSignalCatalog()).toEqual(second);
  });

  it('keeps Designed Sender production code outside Sender V1.2 and admission dependencies', () => {
    const directory = resolve(process.cwd(), 'src/features/bfn/user-defined/designed-sender');
    const productionSource = readdirSync(directory, { encoding: 'utf8', recursive: true })
      .filter(
        (name) =>
          (name.endsWith('.ts') || name.endsWith('.tsx')) &&
          !name.includes('.test.') &&
          !name.includes('.spec.'),
      )
      .map((name) => readFileSync(resolve(directory, name), 'utf8'))
      .join('\n');
    const projectionSource = readFileSync(
      resolve(directory, 'designedSenderSignalCatalog.ts'),
      'utf8',
    );

    expect(productionSource).not.toMatch(
      /modeling\/catalog\/sender\/v1_2|senderRuntimeAdmission|senderExtensionLoader|sender_evidence_trace|catalogBfnAdapter|catalogDiscovery|receiverResponseEvaluator|\/simulation|\/ontology/i,
    );
    expect(projectionSource).not.toMatch(
      /receiver_responses|sender_outputs|source_ids|responseIds|ec50|hill_coefficient|working_range/i,
    );
  });
});

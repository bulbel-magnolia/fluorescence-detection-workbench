import { describe, expect, it } from 'vitest';
import type { HistoryRecord } from '../../domain/types';
import { createDemoHistoryRecord } from '../history/demoHistoryRecord';
import {
  DEMO_QUALITY_TARGET_MAPPING,
  firstUsableReference,
  networkValidationOptions,
  reverseTargetOptions,
} from './detectionMappingRegistry';

function fixtureRecord(): HistoryRecord {
  return createDemoHistoryRecord({
    recordId: 'history-fixture',
    sampleId: 'DEMO-FIXTURE',
    now: '2026-08-03T00:00:00.000Z',
  });
}

describe('detection mapping registry', () => {
  it('offers the version-pinned development mapping only to bundled demo records', () => {
    const record = fixtureRecord();
    const options = reverseTargetOptions(record);

    expect(options).toHaveLength(1);
    expect(options[0]?.mapping).toEqual(DEMO_QUALITY_TARGET_MAPPING);
    expect(firstUsableReference(options)).toMatchObject({
      mode: 'reverse-target',
      recordId: record.id,
      mappingStatus: 'normalized-demo',
      isDemo: true,
    });
  });

  it('rejects a real or differently versioned record instead of guessing a mapping', () => {
    const record = fixtureRecord();
    const incompatible: HistoryRecord = {
      ...record,
      isDemo: false,
    };

    expect(reverseTargetOptions(incompatible)).toEqual([]);
  });

  it('creates a validation reference tied to one explicit network', () => {
    const reference = firstUsableReference(
      networkValidationOptions(fixtureRecord(), 'known-network-1'),
    );

    expect(reference).toMatchObject({
      mode: 'network-validation',
      networkId: 'known-network-1',
      mappingStatus: 'normalized-demo',
    });
  });
});

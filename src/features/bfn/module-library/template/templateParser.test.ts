import { describe, expect, it } from 'vitest';
import {
  BFN_MODULE_TEMPLATE_SCHEMA_INVALID,
  isBfnModuleTemplateMetadata,
  isBfnModuleTemplateVersionV1,
  parseBfnModuleTemplateMetadata,
  parseBfnModuleTemplateVersion,
} from './templateParser';
import { createBfnModuleTemplatePayloadSignature } from './templateSignature';
import type { BfnReusableModulePayloadV1 } from './templateTypes';
import {
  captureAccumulatorFixture,
  captureFirstOrderFixture,
  captureStaticFixture,
  FIXTURE_TIME,
  versionForPayload,
} from './templateTestFixtures';

describe('BFN-MODULE-TEMPLATE 1.0 strict parser', () => {
  it.each([
    ['static', captureStaticFixture],
    ['first_order', captureFirstOrderFixture],
    ['accumulator', captureAccumulatorFixture],
  ] as const)('accepts a valid %s immutable version', (_moduleClass, payloadFactory) => {
    const version = versionForPayload(payloadFactory());
    const parsed = parseBfnModuleTemplateVersion(version);

    expect(isBfnModuleTemplateVersionV1(version)).toBe(true);
    expect(parsed).toEqual(version);
    expect(parsed).not.toBe(version);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.payload)).toBe(true);
    expect(Object.isFrozen(parsed.payload.ports)).toBe(true);
  });

  it.each([
    ['unknown schema', (value: Record<string, unknown>) => (value.schema = 'OTHER')],
    ['unknown version', (value: Record<string, unknown>) => (value.schemaVersion = '2.0')],
    ['blank version ID', (value: Record<string, unknown>) => (value.id = ' ')],
    ['blank template ID', (value: Record<string, unknown>) => (value.templateId = ' ')],
    ['noncanonical version ID', (value: Record<string, unknown>) => (value.id = 'version-1')],
    ['nonpositive revision', (value: Record<string, unknown>) => (value.revision = 0)],
    ['fractional revision', (value: Record<string, unknown>) => (value.revision = 1.5)],
    ['invalid timestamp', (value: Record<string, unknown>) => (value.createdAt = 'not-a-time')],
    ['signature mismatch', (value: Record<string, unknown>) => (value.payloadSignature = 'forged')],
  ])('rejects %s with the stable schema error', (_label, mutate) => {
    const candidate: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    mutate(record(candidate));

    expect(isBfnModuleTemplateVersionV1(candidate)).toBe(false);
    try {
      parseBfnModuleTemplateVersion(candidate);
      throw new Error('Expected malformed version rejection.');
    } catch (error) {
      expect(error).toMatchObject({ code: BFN_MODULE_TEMPLATE_SCHEMA_INVALID });
      expect(error).toHaveProperty('message', BFN_MODULE_TEMPLATE_SCHEMA_INVALID);
    }
  });

  it('rejects unknown module classes and model families without fallback', () => {
    const unknownClass: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    record(record(unknownClass).payload).moduleClass = 'designed_sender';
    const unknownFamily: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    const familyPayload = record(record(unknownFamily).payload);
    record(record(familyPayload.models).static).family = 'arbitrary_formula';

    expect(isBfnModuleTemplateVersionV1(unknownClass)).toBe(false);
    expect(isBfnModuleTemplateVersionV1(unknownFamily)).toBe(false);
  });

  it('rejects unknown Entity modes, duplicate keys, and unresolved local references', () => {
    const unknownMode: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    record(array(record(record(unknownMode).payload).entities)[0]).mode = 'shared_guess';

    const duplicateKey: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    const duplicateEntities = array(record(record(duplicateKey).payload).entities);
    record(duplicateEntities[1]).key = record(duplicateEntities[0]).key;
    resign(duplicateKey);

    const missingReference: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    const missingPayload = record(record(missingReference).payload);
    record(record(record(missingPayload.models).static).response).inputPortKey = 'port.missing';

    expect(isBfnModuleTemplateVersionV1(unknownMode)).toBe(false);
    expect(isBfnModuleTemplateVersionV1(duplicateKey)).toBe(false);
    expect(isBfnModuleTemplateVersionV1(missingReference)).toBe(false);
  });

  it('rejects nonfinite parameters and invalid confidence intervals', () => {
    const nonfinite: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    const nonfinitePayload = record(record(nonfinite).payload);
    record(record(record(record(nonfinitePayload.models).static).response).k).value = Infinity;

    const interval: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    const intervalPayload = record(record(interval).payload);
    record(record(record(record(intervalPayload.models).static).response).k).interval95 = [14, 10];
    resign(interval);

    expect(isBfnModuleTemplateVersionV1(nonfinite)).toBe(false);
    expect(isBfnModuleTemplateVersionV1(interval)).toBe(false);
  });

  it('rejects invalid tau and initial states in dynamic payloads', () => {
    const badTau: unknown = structuredClone(versionForPayload(captureFirstOrderFixture()));
    const tauModel = record(record(record(record(badTau).payload).models).dynamic);
    record(tauModel.tau).value = -1;
    resign(badTau);

    const firstOrderState: unknown = structuredClone(versionForPayload(captureFirstOrderFixture()));
    record(record(record(record(firstOrderState).payload).models).dynamic).initialState = NaN;

    const accumulatorState: unknown = structuredClone(
      versionForPayload(captureAccumulatorFixture()),
    );
    record(record(record(record(accumulatorState).payload).models).dynamic).initialState = -0.1;
    resign(accumulatorState);

    expect(isBfnModuleTemplateVersionV1(badTau)).toBe(false);
    expect(isBfnModuleTemplateVersionV1(firstOrderState)).toBe(false);
    expect(isBfnModuleTemplateVersionV1(accumulatorState)).toBe(false);
  });

  it('rejects dataset fields and unknown payload properties', () => {
    const candidate: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    const payload = record(record(candidate).payload);
    record(record(payload.models).static).sourceDatasetIds = ['dataset.external'];

    expect(isBfnModuleTemplateVersionV1(candidate)).toBe(false);
  });

  it.each(['catalogId', 'entityId', 'displayName'] as const)(
    'rejects a forged canonical %s even when the payload is re-signed',
    (field) => {
      const candidate: unknown = structuredClone(versionForPayload(captureAccumulatorFixture()));
      const entities = array(record(record(candidate).payload).entities);
      const canonical = record(entities[0]);
      canonical[field] = `${String(canonical[field])}.forged`;
      resign(candidate);

      expect(isBfnModuleTemplateVersionV1(candidate)).toBe(false);
      expect(() => parseBfnModuleTemplateVersion(candidate)).toThrowError(
        BFN_MODULE_TEMPLATE_SCHEMA_INVALID,
      );
    },
  );

  it.each([
    [
      'wrong Port direction',
      (payload: Record<string, unknown>) => (record(array(payload.ports)[0]).direction = 'output'),
    ],
    ['missing Provenance', (payload: Record<string, unknown>) => (payload.provenance = [])],
    [
      'missing Implementation',
      (payload: Record<string, unknown>) => (payload.implementations = []),
    ],
    [
      'malformed Context',
      (payload: Record<string, unknown>) => (record(array(payload.contexts)[0]).ph = 15),
    ],
    [
      'malformed ValidityDomain',
      (payload: Record<string, unknown>) =>
        (record(array(record(array(payload.validityDomains)[0]).inputRanges)[0]).maximum = 0),
    ],
  ])('rejects %s after validating local scientific structure', (_label, mutate) => {
    const candidate: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    mutate(record(record(candidate).payload));
    resign(candidate);

    expect(isBfnModuleTemplateVersionV1(candidate)).toBe(false);
  });

  it('rejects inherited objects and accessors without invoking a getter', () => {
    const inherited: unknown = Object.create({ inherited: true });
    Object.assign(record(inherited), versionForPayload(captureStaticFixture()));
    const accessor: unknown = structuredClone(versionForPayload(captureStaticFixture()));
    let invoked = false;
    Object.defineProperty(accessor, 'schema', {
      enumerable: true,
      get() {
        invoked = true;
        throw new Error('getter must not execute');
      },
    });

    expect(isBfnModuleTemplateVersionV1(inherited)).toBe(false);
    expect(isBfnModuleTemplateVersionV1(accessor)).toBe(false);
    expect(invoked).toBe(false);
  });
});

describe('template metadata contract', () => {
  it('accepts metadata while keeping it separate from scientific versions', () => {
    const metadata = {
      id: 'template.fixture',
      name: 'Reusable sensor',
      description: null,
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
      latestRevision: 1,
    };
    expect(isBfnModuleTemplateMetadata(metadata)).toBe(true);
    expect(parseBfnModuleTemplateMetadata(metadata)).toEqual(metadata);
  });

  it('rejects invalid latest revisions and timestamps', () => {
    expect(
      isBfnModuleTemplateMetadata({
        id: 'template.fixture',
        name: 'Reusable sensor',
        description: null,
        createdAt: FIXTURE_TIME,
        updatedAt: 'invalid',
        latestRevision: 0,
      }),
    ).toBe(false);
  });
});

function resign(value: unknown): void {
  const root = record(value);
  root.payloadSignature = createBfnModuleTemplatePayloadSignature(
    root.payload as BfnReusableModulePayloadV1,
  );
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected record fixture.');
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected array fixture.');
  return value;
}

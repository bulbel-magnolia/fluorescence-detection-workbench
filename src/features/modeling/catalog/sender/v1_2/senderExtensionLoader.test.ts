import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAhlHslCatalogRelease } from '../../v2/catalogReleaseLoader';
import {
  SENDER_EXTENSION_EXPECTED_COUNTS,
  SENDER_EXTENSION_RELEASE_IDENTITY,
  SENDER_EXTENSION_SOURCE_FILES,
} from './senderExtensionManifest';
import { loadSenderEvidenceExtension } from './senderExtensionLoader';

const sourceDirectory = join(
  process.cwd(),
  'src/features/modeling/catalog/sender/v1_2/data/source',
);

describe('Sender Evidence Extension V1.2 loader', () => {
  const base = loadAhlHslCatalogRelease().release;
  const extension = loadSenderEvidenceExtension();

  it('loads the real incremental release and its immutable base identity', () => {
    expect(extension.componentsDocument.release_metadata).toMatchObject({
      release_name: SENDER_EXTENSION_RELEASE_IDENTITY.releaseName,
      version: SENDER_EXTENSION_RELEASE_IDENTITY.version,
      release_type: 'incremental_extension',
      base_release: SENDER_EXTENSION_RELEASE_IDENTITY.baseRelease,
      base_sha256: SENDER_EXTENSION_RELEASE_IDENTITY.baseSha256,
      base_records_immutable: true,
    });
    expect(extension.outputsDocument.release_metadata).toMatchObject({
      release_name: SENDER_EXTENSION_RELEASE_IDENTITY.outputsReleaseName,
      runtime_quantitative_count: 0,
      runtime_demo_count: 0,
    });
  });

  it('retains the inspected package counts without merging records into V1.1', () => {
    expect(extension.componentsDocument.new_signals).toHaveLength(
      SENDER_EXTENSION_EXPECTED_COUNTS.newSignals,
    );
    expect(extension.componentsDocument.new_sender_components).toHaveLength(
      SENDER_EXTENSION_EXPECTED_COUNTS.newComponents,
    );
    expect(extension.componentsDocument.new_parameter_contexts).toHaveLength(
      SENDER_EXTENSION_EXPECTED_COUNTS.newParameterContexts,
    );
    expect(extension.componentsDocument.existing_v1_1_sender_component_links).toHaveLength(
      SENDER_EXTENSION_EXPECTED_COUNTS.existingV1_1ComponentLinks,
    );
    expect(extension.outputsDocument.sender_outputs).toHaveLength(53);
    expect(extension.rawPoints).toHaveLength(60);
    expect(extension.functionParameters).toHaveLength(5);
    expect(extension.sources).toHaveLength(21);
    expect(extension.rejectedCandidates).toHaveLength(18);
    expect(extension.evidenceTrace).toHaveLength(6127);
    expect(base.sender_outputs).toHaveLength(0);
  });

  it('preserves every inspected source file byte-for-byte against the inventory', () => {
    expect(SENDER_EXTENSION_SOURCE_FILES).toHaveLength(12);
    expect(new Set(SENDER_EXTENSION_SOURCE_FILES.map((file) => file.name))).toHaveProperty(
      'size',
      12,
    );
    for (const file of SENDER_EXTENSION_SOURCE_FILES) {
      const bytes = readFileSync(join(sourceDirectory, file.name));
      expect(bytes.byteLength, file.name).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex').toUpperCase(), file.name).toBe(
        file.sha256,
      );
    }
  });

  it('deep-freezes documents, records, nested model evidence, and parsed tables', () => {
    const output = extension.outputsDocument.sender_outputs[0];
    expect(Object.isFrozen(extension)).toBe(true);
    expect(Object.isFrozen(extension.componentsDocument)).toBe(true);
    expect(Object.isFrozen(extension.outputsDocument.sender_outputs)).toBe(true);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output?.model)).toBe(true);
    expect(Object.isFrozen(extension.rawPoints)).toBe(true);
    expect(Object.isFrozen(extension.evidenceTrace[0])).toBe(true);
  });

  it('preserves scientific nulls and never converts ND to zero', () => {
    const nd = extension.rawPoints.find((point) => point.detection_status === 'ND');
    const ranged = extension.rawPoints.find((point) => point.detection_status === 'reported_range');
    const pair = extension.outputsDocument.sender_outputs.find(
      (output) => output.software_status === 'effective_pair_only',
    );
    const kinetic = extension.functionParameters[0];
    expect(nd?.output_value).toBeNull();
    expect(nd?.output_lower_bound).toBeNull();
    expect(nd?.output_upper_bound).toBeNull();
    expect(ranged?.output_value).toBeNull();
    expect(ranged?.output_lower_bound).toEqual(expect.any(Number));
    expect(ranged?.output_upper_bound).toEqual(expect.any(Number));
    expect(pair?.output_signal_id).toBeNull();
    expect(pair?.measurement.lod).toBeNull();
    expect(kinetic?.r_squared).toBeNull();
    expect(kinetic?.rmse).toBeNull();
    expect(kinetic?.data_point_count).toBeNull();
  });

  it('exactly resolves representative component, context, source, raw point, and trace IDs', () => {
    const outputId = 'sout.vanaalst2025.aaa063.cepi.v1.c8hsl.v1';
    const output = extension.outputsDocument.sender_outputs.find((item) => item.id === outputId);
    expect(output).toMatchObject({
      sender_component_id: 'send.vanaalst2025.aaa063.cepi.v1',
      output_signal_id: 'ahl.c8.stereo-unspecified',
      parameter_context_id: 'ctx.vanaalst2025.scer-fedbatch.48h',
    });
    expect(
      extension.componentsDocument.new_sender_components.find(
        (item) => item.id === output?.sender_component_id,
      )?.regulator_or_enzyme,
    ).toBe('CepI');
    expect(
      extension.componentsDocument.new_parameter_contexts.find(
        (item) => item.id === output?.parameter_context_id,
      )?.host_species,
    ).toBe('Saccharomyces cerevisiae');
    expect(extension.rawPoints.filter((point) => point.sender_output_id === outputId)).toHaveLength(
      4,
    );
    expect(
      extension.sources.find((source) => source.source_id === 'src.vanaalst2025.paper')?.doi,
    ).toBeTruthy();
    expect(
      extension.evidenceTrace.some(
        (trace) => trace.record_id === outputId && trace.field_path === 'output_signal_id',
      ),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { loadEvidenceCatalog } from './catalogLoader';
import { searchCatalog } from './catalogIndex';
import {
  assessCatalogApplication,
  getCatalogInputMolecules,
  getCatalogNetworkRoles,
  getCatalogOutputMolecules,
  getCatalogParameterStatus,
} from './catalogPresentation';

describe('catalog presentation assessment', () => {
  const loaded = loadEvidenceCatalog();

  it('keeps current source observations out of quantitative availability', () => {
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    for (const entry of loaded.index.entries) {
      expect(getCatalogParameterStatus(entry)).toBe('parameterizable-after-calibration');
    }
  });

  it('derives input and output molecules without inventing unknown values', () => {
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    const cadr = loaded.index.byId.get('sensor.cadr');
    expect(cadr).toBeDefined();
    if (!cadr) return;
    expect(getCatalogInputMolecules(cadr)).toContain('Cd(II), supplied as CdSO4');
    expect(getCatalogOutputMolecules(cadr)).toContain(
      'Preg-regulated gfp transcription and GFP fluorescence',
    );
  });

  it('filters by network role, molecule, and parameter availability independently', () => {
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    const baseFilters = {
      query: '',
      nodeKind: 'all' as const,
      category: 'all' as const,
      entityType: 'all' as const,
      host: 'all',
      strain: 'all',
      evidenceGrade: 'all' as const,
      sequenceStatus: 'all' as const,
      modelingCompatibility: 'all' as const,
    };
    const cadr = loaded.index.byId.get('sensor.cadr');
    expect(cadr).toBeDefined();
    if (!cadr) return;
    expect(
      searchCatalog(loaded.index, {
        ...baseFilters,
        networkRole: 'processing',
        inputMolecule: 'Cd(II), supplied as CdSO4',
        parameterStatus: 'parameterizable-after-calibration',
      }),
    ).toContain(cadr);
    expect(
      searchCatalog(loaded.index, {
        ...baseFilters,
        networkRole: 'output',
        inputMolecule: 'Cd(II), supplied as CdSO4',
      }),
    ).not.toContain(cadr);
  });

  it('uses the network role as an explicit application target', () => {
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    const cadr = loaded.index.byId.get('sensor.cadr');
    expect(cadr).toBeDefined();
    if (!cadr) return;
    expect(getCatalogNetworkRoles(cadr)).toEqual(['processing']);
    const assessment = assessCatalogApplication(cadr, 'processing');
    expect(assessment).toMatchObject({
      targetNetworkRole: 'processing',
      applicationMode: 'calibration',
      allowed: true,
      reason: 'requires-calibration',
      parameterStatus: 'parameterizable-after-calibration',
    });
    expect(assessCatalogApplication(cadr, 'input').reason).toBe('incompatible-network-role');
    expect(assessCatalogApplication(cadr, null).reason).toBe('no-target-role');
  });

  it('supports explicit demo gating without treating demo data as quantitative', () => {
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    const entry = loaded.index.entries[0]!;
    const demoEntry = {
      ...entry,
      modeling: { ...entry.modeling, compatibility: 'normalized-demo-only' as const },
    };
    expect(assessCatalogApplication(demoEntry, 'processing')).toMatchObject({
      applicationMode: 'demo',
      allowed: true,
      reason: 'demo-only',
      parameterStatus: 'normalized-demo-only',
    });
    expect(
      assessCatalogApplication(demoEntry, 'processing', { requestedMode: 'quantitative' }).allowed,
    ).toBe(false);
  });
});

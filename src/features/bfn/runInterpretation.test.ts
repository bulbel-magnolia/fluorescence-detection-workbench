import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import {
  bfnTemporalExecutionSummariesDiffer,
  interpretBfnDynamicTimeHandling,
  summarizeBfnContextApplicability,
} from './runInterpretation';
import { runBfnSimulation } from './simulation';

describe('BFN run snapshot interpretation', () => {
  it('classifies all-quasi, mixed, all-stateful, and legacy dynamic runs from snapshots only', () => {
    const allQuasiProject = createDemoBfnProject();
    allQuasiProject.network.mode = 'dynamic';
    for (const module of allQuasiProject.network.modules) {
      const staticModelId = module.activeModelIds.static;
      if (staticModelId === undefined) throw new Error('Expected paired demo model.');
      module.activeModelIds = { static: staticModelId };
    }
    const allQuasi = runBfnSimulation(allQuasiProject);
    expect(interpretBfnDynamicTimeHandling(allQuasi)).toBe('all_quasi_static');

    const mixedProject = createDemoBfnProject();
    mixedProject.network.mode = 'dynamic';
    const reporter = mixedProject.network.modules[1]!;
    const reporterStaticModelId = reporter.activeModelIds.static;
    if (reporterStaticModelId === undefined) throw new Error('Expected paired demo model.');
    reporter.activeModelIds = { static: reporterStaticModelId };
    expect(interpretBfnDynamicTimeHandling(runBfnSimulation(mixedProject))).toBe(
      'mixed_quasi_static',
    );

    const statefulProject = createDemoBfnProject();
    statefulProject.network.mode = 'dynamic';
    const stateful = runBfnSimulation(statefulProject);
    expect(interpretBfnDynamicTimeHandling(stateful)).toBe('all_stateful_dynamic');

    delete stateful.temporalSnapshot;
    expect(interpretBfnDynamicTimeHandling(stateful)).toBe('not_recorded');
  });

  it('uses the required context summary precedence without scores', () => {
    expect(
      summarizeBfnContextApplicability({
        scope: 'output_reachable_module_edges',
        edges: [],
      }),
    ).toBe('no_comparable_module_context');
    expect(
      summarizeBfnContextApplicability({
        scope: 'output_reachable_module_edges',
        edges: [{ edgeId: 'a', state: 'matched' }],
      }),
    ).toBe('consistent');
    expect(
      summarizeBfnContextApplicability({
        scope: 'output_reachable_module_edges',
        edges: [
          { edgeId: 'a', state: 'matched' },
          { edgeId: 'b', state: 'unavailable' },
        ],
      }),
    ).toBe('partially_unverified');
    expect(
      summarizeBfnContextApplicability({
        scope: 'output_reachable_module_edges',
        edges: [
          { edgeId: 'a', state: 'uncertain' },
          { edgeId: 'b', state: 'mismatched' },
        ],
      }),
    ).toBe('known_differences');
  });

  it('reports a nonblocking temporal comparison difference and incomplete legacy information', () => {
    const currentProject = createDemoBfnProject();
    currentProject.network.mode = 'dynamic';
    const current = runBfnSimulation(currentProject);
    const comparisonProject = createDemoBfnProject();
    comparisonProject.network.mode = 'dynamic';
    for (const module of comparisonProject.network.modules) {
      const staticModelId = module.activeModelIds.static;
      if (staticModelId === undefined) throw new Error('Expected paired demo model.');
      module.activeModelIds = { static: staticModelId };
    }
    const comparison = runBfnSimulation(comparisonProject);

    expect(bfnTemporalExecutionSummariesDiffer(current, comparison)).toBe(true);
    delete comparison.temporalSnapshot;
    expect(bfnTemporalExecutionSummariesDiffer(current, comparison)).toBeNull();
  });
});

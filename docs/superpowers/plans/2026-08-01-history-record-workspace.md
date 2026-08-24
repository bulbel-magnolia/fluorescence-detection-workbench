# Detection Record Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Windows detection-record page around truthful multi-channel curves, richer record summaries, useful empty-state actions, and readable bilingual layouts.

**Architecture:** Keep `HistoryRecord` and persistence schema unchanged. Add a pure presentation adapter that converts analyzed records or HC-08D raw frames into chart series and summaries, render those series through a history-specific SVG component, and let `HistoryPage` own filtering, signal-mode, channel-visibility, and selection state. Demo seeding stays in the application-state layer so the page never writes persistence directly.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, i18next, inline SVG, Vitest 4, React Testing Library, CSS.

**Source design:** `docs/superpowers/specs/2026-08-01-history-network-workbench-design.md`

---

### Task 1: Add a pure history presentation adapter

**Files:**
- Create: `src/features/history/historyPresentation.ts`
- Create: `src/features/history/historyPresentation.test.ts`

- [ ] **Step 1: Write failing adapter tests for analyzed and raw records**

Create `src/features/history/historyPresentation.test.ts` with explicit analyzed and HC-08D fixtures:

```ts
import { describe, expect, it } from 'vitest';
import type { HistoryRecord } from '../../domain/types';
import {
  buildHistoryPresentation,
  downsampleHistoryPoints,
  findNearestHistoryValues,
} from './historyPresentation';

const analyzedRecord: HistoryRecord = {
  id: 'record-analysis',
  sampleId: 'SAMPLE-ANALYSIS',
  createdAt: '2026-08-01T08:00:00.000Z',
  origin: 'json-import',
  isDemo: true,
  resultStatus: 'OK',
  qualityGrade: 'A-DEMO',
  syncState: 'local-only',
  result: {
    schemaVersion: 1,
    sessionId: 'session-analysis',
    sampleId: 'SAMPLE-ANALYSIS',
    mode: 'three_channel',
    resultStatus: 'OK',
    channels: {
      channel1: {
        channelId: 'channel1',
        sampleCount: 2,
        summaryMethod: 'latest',
        summaryCorrectedSignal: 28,
        signalUnit: 'a.u.',
        concentration: null,
        concentrationUnit: 'demo-unit',
        concentrationStatus: 'OK',
        calibrationModel: 'linear',
        calibrationIsDemo: true,
        warnings: [],
        curve: [
          { sequence: 0, timestamp: '2026-08-01T08:00:00.000Z', elapsedMs: 0, rawSignal: 30, background: 10, correctedSignal: 20, unit: 'a.u.' },
          { sequence: 1, timestamp: '2026-08-01T08:00:01.000Z', elapsedMs: 1000, rawSignal: 40, background: 12, correctedSignal: 28, unit: 'a.u.' },
        ],
      },
    },
    quality: { status: 'NOT_EVALUATED', score: null, grade: null, suggestion: '', isDemo: true },
    protocolVersion: 'PROTO-DEMO-0.2',
    algorithmVersion: 'ANALYSIS-DEMO-0.1',
    calibrationVersion: 'CAL-DEMO-0.1',
    isDemo: true,
    disclaimer: 'Demonstration data',
  },
};

const rawRecord: HistoryRecord = {
  id: 'record-raw',
  sampleId: 'HC08D-001',
  createdAt: '2026-08-01T09:00:00.000Z',
  origin: 'real-live',
  isDemo: false,
  resultStatus: 'RAW_ONLY',
  qualityGrade: null,
  syncState: 'local-only',
  result: {
    schemaVersion: 1,
    sessionId: 'session-raw',
    sampleId: 'HC08D-001',
    resultStatus: 'RAW_ONLY',
    frames: [
      { sequence: 0, receivedAt: '2026-08-01T09:00:00.000Z', elapsedMs: 0, signal480: 10, signal515: 20, signal555: 30, clearSignal: 40, saturatedFields: [], rawLine: '480:10,515:20,555:30,CLR:40' },
      { sequence: 1, receivedAt: '2026-08-01T09:00:01.000Z', elapsedMs: 1000, signal480: 15, signal515: 25, signal555: 35, clearSignal: 45, saturatedFields: ['CLR'], rawLine: '480:15,515:25,555:35,CLR:45' },
    ],
    protocolVersion: 'HC08D-ASCII-DRAFT-0.2',
    algorithmVersion: null,
    calibrationVersion: null,
    isDemo: false,
    disclaimer: 'Raw hardware data',
  },
};

describe('history presentation', () => {
  it('exposes saved analyzed values without recalculating them', () => {
    const view = buildHistoryPresentation(analyzedRecord, 'corrected');
    expect(view.availableModes).toEqual(['corrected', 'raw', 'background']);
    expect(view.correctionConfigured).toBe(true);
    expect(view.series[0]?.points.map((point) => point.value)).toEqual([20, 28]);
    expect(view.summary).toMatchObject({ sampleCount: 2, durationMs: 1000, peakValue: 28, latestValue: 28 });
  });

  it('exposes only four real HC-08D raw channels', () => {
    const view = buildHistoryPresentation(rawRecord, 'corrected');
    expect(view.availableModes).toEqual(['raw']);
    expect(view.activeMode).toBe('raw');
    expect(view.correctionConfigured).toBe(false);
    expect(view.series.map((series) => series.id)).toEqual(['signal480', 'signal515', 'signal555', 'clearSignal']);
    expect(view.series.at(-1)?.points.map((point) => point.value)).toEqual([40, 45]);
    expect(view.summary.saturationCount).toBe(1);
  });

  it('uses full-resolution values for hover while limiting path points', () => {
    const points = Array.from({ length: 1001 }, (_, sequence) => ({ elapsedMs: sequence, sequence, value: sequence }));
    expect(downsampleHistoryPoints(points, 100)).toHaveLength(100);
    expect(findNearestHistoryValues([{ id: 'channel1', labelKey: 'channels.channel1', color: '#00f5ff', points }], 499.6)[0]?.value).toBe(500);
  });
});
```

- [ ] **Step 2: Run the adapter tests and verify the module is missing**

Run:

```powershell
npm test -- src/features/history/historyPresentation.test.ts
```

Expected: FAIL because `historyPresentation.ts` does not exist.

- [ ] **Step 3: Implement record-to-series mapping, summaries, downsampling, and hover lookup**

Create `src/features/history/historyPresentation.ts` with these public types and functions:

```ts
import type { ChannelId, HistoryRecord } from '../../domain/types';

export type HistorySignalMode = 'corrected' | 'raw' | 'background';
export type HistorySeriesId = ChannelId | 'signal480' | 'signal515' | 'signal555' | 'clearSignal';

export interface HistoryPoint {
  elapsedMs: number;
  sequence: number;
  value: number;
}

export interface HistorySeries {
  id: HistorySeriesId;
  labelKey: string;
  color: string;
  points: HistoryPoint[];
}

export interface HistoryPresentation {
  activeMode: HistorySignalMode;
  availableModes: HistorySignalMode[];
  correctionConfigured: boolean;
  series: HistorySeries[];
  summary: {
    sampleCount: number;
    durationMs: number;
    peakValue: number | null;
    latestValue: number | null;
    saturationCount: number;
  };
}

const analyzedChannels: Array<{ id: ChannelId; labelKey: string; color: string }> = [
  { id: 'channel1', labelKey: 'channels.channel1', color: '#00f5ff' },
  { id: 'channel2', labelKey: 'channels.channel2', color: '#ff4fa3' },
  { id: 'channel3', labelKey: 'channels.channel3', color: '#ffc247' },
];

const hardwareChannels = [
  { id: 'signal480', labelKey: 'detection.signal480', color: '#00f5ff' },
  { id: 'signal515', labelKey: 'detection.signal515', color: '#ff4fa3' },
  { id: 'signal555', labelKey: 'detection.signal555', color: '#ffc247' },
  { id: 'clearSignal', labelKey: 'detection.clearSignal', color: '#8c6cff' },
] as const;

export function downsampleHistoryPoints(points: HistoryPoint[], limit = 600): HistoryPoint[] {
  if (points.length <= limit) return points;
  const lastIndex = points.length - 1;
  return Array.from({ length: limit }, (_, index) => points[Math.round((index / (limit - 1)) * lastIndex)]!);
}

export function findNearestHistoryValues(series: HistorySeries[], elapsedMs: number): Array<{ id: HistorySeriesId; labelKey: string; color: string; value: number }> {
  return series.flatMap((item) => {
    if (item.points.length === 0) return [];
    const point = item.points.reduce((nearest, candidate) => Math.abs(candidate.elapsedMs - elapsedMs) < Math.abs(nearest.elapsedMs - elapsedMs) ? candidate : nearest);
    return [{ id: item.id, labelKey: item.labelKey, color: item.color, value: point.value }];
  });
}

export function buildHistoryPresentation(record: HistoryRecord, requestedMode: HistorySignalMode): HistoryPresentation {
  const isRaw = record.result.resultStatus === 'RAW_ONLY';
  const isError = record.result.resultStatus === 'ERROR';
  const availableModes: HistorySignalMode[] = isRaw ? ['raw'] : isError ? [] : ['corrected', 'raw', 'background'];
  const activeMode = availableModes.includes(requestedMode) ? requestedMode : (availableModes[0] ?? 'raw');

  const series: HistorySeries[] = isRaw
    ? hardwareChannels.map((channel) => ({
        ...channel,
        points: record.result.frames.map((frame) => ({
          elapsedMs: frame.elapsedMs,
          sequence: frame.sequence,
          value: frame[channel.id],
        })),
      }))
    : isError
      ? []
      : analyzedChannels.flatMap((channel) => {
          const analyzed = record.result.channels[channel.id];
          if (!analyzed) return [];
          return [{
            ...channel,
            points: analyzed.curve.map((sample) => ({
              elapsedMs: sample.elapsedMs,
              sequence: sample.sequence,
              value: activeMode === 'raw' ? sample.rawSignal : activeMode === 'background' ? sample.background : sample.correctedSignal,
            })),
          }];
        });

  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const latestValues = series.flatMap((item) => item.points.at(-1)?.value ?? []);
  const sampleCount = isRaw ? record.result.frames.length : Math.max(0, ...series.map((item) => item.points.length));
  const durationMs = Math.max(0, ...series.flatMap((item) => item.points.map((point) => point.elapsedMs)));
  return {
    activeMode,
    availableModes,
    correctionConfigured: !isRaw && !isError,
    series,
    summary: {
      sampleCount,
      durationMs,
      peakValue: values.length ? Math.max(...values) : null,
      latestValue: latestValues.length ? Math.max(...latestValues) : null,
      saturationCount: isRaw ? record.result.frames.filter((frame) => frame.saturatedFields.length > 0).length : 0,
    },
  };
}
```

- [ ] **Step 4: Run the adapter tests**

Run: `npm test -- src/features/history/historyPresentation.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit the presentation adapter**

```powershell
git add src/features/history/historyPresentation.ts src/features/history/historyPresentation.test.ts
git commit -m "feat(history): add truthful record presentation adapter"
```

### Task 2: Add a deterministic demonstration-record action

**Files:**
- Create: `src/features/analysis/demoAnalysisInput.ts`
- Create: `src/features/history/demoHistoryRecord.ts`
- Create: `src/features/history/demoHistoryRecord.test.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/store/appStore.hc08d.test.ts`

- [ ] **Step 1: Write failing tests for a clearly labeled demo record and store insertion**

Add `src/features/history/demoHistoryRecord.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDemoHistoryRecord } from './demoHistoryRecord';

describe('demo history record', () => {
  it('creates deterministic analyzed curves with an explicit Demo boundary', () => {
    const record = createDemoHistoryRecord({
      now: '2026-08-01T10:00:00.000Z',
      recordId: 'record-demo',
      sessionId: 'session-demo',
      sampleId: 'DEMO-HISTORY-001',
    });
    expect(record).toMatchObject({ id: 'record-demo', sampleId: 'DEMO-HISTORY-001', origin: 'demo-live', isDemo: true });
    expect(record.result.resultStatus).not.toBe('RAW_ONLY');
    if (record.result.resultStatus === 'OK' || record.result.resultStatus === 'PARTIAL') {
      expect(record.result.channels.channel1?.curve).toHaveLength(61);
      expect(record.result.disclaimer).not.toHaveLength(0);
    }
  });
});
```

Extend the existing app-store test setup with a test that clears `history`, calls `loadDemoHistoryRecord()`, and expects one `demo-live` record both in state and after `hydrateHistory()`.

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `npm test -- src/features/history/demoHistoryRecord.test.ts src/store/appStore.hc08d.test.ts`

Expected: FAIL because the factory and action do not exist.

- [ ] **Step 3: Extract the existing Demo analysis-input builder**

Move the current private `demoAnalysisInput` implementation from `src/store/appStore.ts` into `src/features/analysis/demoAnalysisInput.ts` and export it as:

```ts
export function createDemoAnalysisInput(
  sessionId: string,
  sampleId: string,
  samples: Record<ChannelId, FluorescenceSample[]>,
): AnalysisInput
```

Keep the current protocol, algorithm, calibration, slopes, ranges, grades, and explicit `isDemo: true` values unchanged. Replace the store call with `createDemoAnalysisInput(...)` so acquisition behavior remains identical.

- [ ] **Step 4: Implement the deterministic record factory**

Create `src/features/history/demoHistoryRecord.ts`. Generate 61 points at 200 ms intervals, a background near 22 a.u., and smooth channel-specific illustrative responses; then pass those samples through `analyze(createDemoAnalysisInput(...))`. Accept injected IDs and time exactly as shown in the test. Export `DemoHistoryRecord = HistoryRecord & { result: AnalysisResult }`, and return that type with `origin: 'demo-live'`, `isDemo: true`, `syncState: 'local-only'`, and the analysis result.

Use this deterministic signal expression for each channel:

```ts
const responseScale = { channel1: 72, channel2: 94, channel3: 56 }[channelId];
const background = 22 + Math.sin(sequence / 6) * 0.8;
const correctedSignal = responseScale * (1 - Math.exp(-elapsedMs / 3200)) + Math.sin(sequence / 4) * 1.1;
const rawSignal = background + Math.max(0, correctedSignal);
```

Every generated `FluorescenceSample` must keep `unit: 'a.u.'` and an ISO timestamp derived from the injected `now` value.

- [ ] **Step 5: Add `loadDemoHistoryRecord` to the Zustand application API**

Add this signature to `AppState`:

```ts
loadDemoHistoryRecord: () => Promise<void>;
```

Implement it beside `hydrateHistory`:

```ts
loadDemoHistoryRecord: async () => {
  const record = createDemoHistoryRecord();
  try {
    await getHistoryRepository().upsert(record);
    set((state) => ({
      latestResult: record.result,
      latestRecord: record,
      history: [record, ...state.history],
      syncPendingCount: state.syncPendingCount + 1,
    }));
  } catch (error) {
    set({
      lastError: {
        code: 'PERSISTENCE_FAILED',
        message: error instanceof Error ? error.message : 'Persistence failed.',
      },
    });
  }
},
```

- [ ] **Step 6: Run the focused tests**

Run: `npm test -- src/features/history/demoHistoryRecord.test.ts src/store/appStore.hc08d.test.ts`

Expected: PASS; existing HC-08D disconnect/history assertions remain unchanged.

- [ ] **Step 7: Commit Demo record support**

```powershell
git add src/features/analysis/demoAnalysisInput.ts src/features/history/demoHistoryRecord.ts src/features/history/demoHistoryRecord.test.ts src/store/appStore.ts src/store/appStore.hc08d.test.ts
git commit -m "feat(history): add labeled demonstration record"
```

### Task 3: Build the interactive history curve component

**Files:**
- Create: `src/components/HistorySignalChart.tsx`
- Create: `src/components/HistorySignalChart.test.tsx`

- [ ] **Step 1: Write failing component tests**

Test these behaviors with a two-series fixture:

```ts
it('toggles individual channels without deleting their data', async () => {
  const user = userEvent.setup();
  render(<HistorySignalChart series={series} visibleIds={new Set(series.map((item) => item.id))} onToggle={onToggle} />);
  await user.click(screen.getByRole('button', { name: '通道 1' }));
  expect(onToggle).toHaveBeenCalledWith('channel1');
});

it('shows full-resolution nearest values on pointer hover', () => {
  render(<HistorySignalChart series={series} visibleIds={new Set(series.map((item) => item.id))} onToggle={() => undefined} />);
  const chart = screen.getByRole('img', { name: '检测信号曲线' });
  vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 900, height: 330, right: 900, bottom: 330, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.pointerMove(chart, { clientX: 450, clientY: 100 });
  expect(screen.getByRole('status')).toHaveTextContent('0.5 s');
});
```

Import `../i18n`, `userEvent`, `fireEvent`, the adapter types, and Vitest helpers explicitly.

- [ ] **Step 2: Run the component test and verify it fails**

Run: `npm test -- src/components/HistorySignalChart.test.tsx`

Expected: FAIL because `HistorySignalChart` does not exist.

- [ ] **Step 3: Implement the chart**

Create an SVG component with these exact props:

```ts
interface HistorySignalChartProps {
  series: HistorySeries[];
  visibleIds: ReadonlySet<HistorySeriesId>;
  onToggle: (id: HistorySeriesId) => void;
}
```

Implementation requirements:

- Use a `900 × 330` viewBox and `{ top: 24, right: 28, bottom: 38, left: 62 }` inset.
- Build SVG paths from `downsampleHistoryPoints(item.points)`.
- Compute X and Y domains from visible series only, with a minimum Y maximum of `1`.
- Render six horizontal and seven vertical grid ticks.
- Render one `aria-pressed` legend button per available series; the button calls `onToggle(id)`.
- On pointer movement, map the pointer X coordinate into elapsed milliseconds and call `findNearestHistoryValues` on full-resolution visible series.
- Render a vertical crosshair and a `role="status"` tooltip listing elapsed seconds plus each visible channel value in a.u.
- Clear hover state on pointer leave.
- Render `history.noCurveData` when no visible series has points.

- [ ] **Step 4: Run the chart tests**

Run: `npm test -- src/components/HistorySignalChart.test.tsx`

Expected: PASS, including channel toggle and hover tooltip.

- [ ] **Step 5: Commit the chart component**

```powershell
git add src/components/HistorySignalChart.tsx src/components/HistorySignalChart.test.tsx
git commit -m "feat(history): add interactive record curves"
```

### Task 4: Rebuild `HistoryPage` and its bilingual copy

**Files:**
- Create: `src/pages/HistoryPage.test.tsx`
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/en-US.ts`

- [ ] **Step 1: Write failing page tests for analyzed, raw, and empty states**

Create `src/pages/HistoryPage.test.tsx` and reset `useAppStore` plus i18n before every test. Cover:

1. An analyzed fixture shows the curve, three signal-mode buttons, core metrics, and all saved channel controls.
2. A `RAW_ONLY` fixture shows `480 nm`, `515 nm`, `555 nm`, and `CLR`; it shows “未配置背景校正” and does not render background/corrected mode buttons.
3. Empty history shows “载入演示记录” and “导入检测文件”; clicking them calls `loadDemoHistoryRecord` or `setSection('import')`.
4. A long sample ID appears in a single-line element with the full value in its `title` attribute.
5. Switching i18n to `en-US` renders “Detection records”, “Load demonstration record”, and “Import detection file”.

- [ ] **Step 2: Run the page tests and verify the old page fails the new expectations**

Run: `npm test -- src/pages/HistoryPage.test.tsx`

Expected: FAIL because the curve workspace and empty-state actions are not present.

- [ ] **Step 3: Replace the page state and derived presentation**

Add state for `signalMode` and visible series IDs, derive the selected record and presentation, and reset incompatible modes when selection changes:

```ts
const [signalMode, setSignalMode] = useState<HistorySignalMode>('corrected');
const [visibleSeriesIds, setVisibleSeriesIds] = useState<Set<HistorySeriesId>>(new Set());
const presentation = useMemo(
  () => (selected ? buildHistoryPresentation(selected, signalMode) : null),
  [selected, signalMode],
);

useEffect(() => {
  if (!presentation) return;
  if (presentation.activeMode !== signalMode) setSignalMode(presentation.activeMode);
  setVisibleSeriesIds(new Set(presentation.series.map((series) => series.id)));
}, [selected?.id, presentation?.activeMode]);
```

Keep exports routed through `exportRecord`. Read `loadModelingProject()` once on page mount and show its model name only when `recordReference.recordId === selected.id`.

- [ ] **Step 4: Replace the page information architecture**

Use this component hierarchy and class contract:

```tsx
<div className="history-workspace">
  <main className="panel history-browser">
    <div className="history-toolbar">...</div>
    <div className="history-record-list" role="listbox">...</div>
    {!filtered.length ? <div className="history-empty-actions">...</div> : null}
  </main>
  <section key={selected.id} className="history-detail">
    <header className="panel history-detail__header">...</header>
    <dl className="history-metrics">...</dl>
    <div className="history-mode-switch" role="group">...</div>
    <HistorySignalChart series={presentation.series} visibleIds={visibleSeriesIds} onToggle={toggleSeries} />
    <section className="panel history-channel-summary">...</section>
    <details className="panel history-record-metadata">...</details>
    <div className="history-export-actions">...</div>
  </section>
</div>
```

Record rows must show sample ID, formatted date/time, origin, result status, and a compact peak summary. Use `title={record.sampleId}` on the non-wrapping sample ID. The details area must show duration, sample count, peak, latest value, record type, and correction state.

For `RAW_ONLY`, render only the adapter's real four-channel series and `history.correctionNotConfigured`. For analysis errors, keep `TechnicalDetails` behind the existing expandable control. Do not render zero-valued substitute curves.

- [ ] **Step 5: Add exact Chinese and English translation keys**

Add matching keys under both `history` objects:

```ts
curveTitle: '检测信号曲线',
signalMode: '信号类型',
modeCorrected: '校正信号',
modeRaw: '原始信号',
modeBackground: '背景值',
correctionConfigured: '已配置背景校正',
correctionNotConfigured: '未配置背景校正',
sampleCount: '数据点数',
peakValue: '最高峰值',
latestValue: '最新值',
recordType: '记录类型',
noCurveData: '当前记录没有可显示的曲线数据',
loadDemoRecord: '载入演示记录',
importDetectionFile: '导入检测文件',
linkedDesign: '关联网络设计',
notLinkedToDesign: '未关联网络设计',
showChannel: '显示或隐藏 {{channel}}',
```

English values:

```ts
curveTitle: 'Detection signal curves',
signalMode: 'Signal type',
modeCorrected: 'Corrected signal',
modeRaw: 'Raw signal',
modeBackground: 'Background',
correctionConfigured: 'Background correction configured',
correctionNotConfigured: 'Background correction not configured',
sampleCount: 'Data points',
peakValue: 'Highest peak',
latestValue: 'Latest value',
recordType: 'Record type',
noCurveData: 'This record has no curve data to display',
loadDemoRecord: 'Load demonstration record',
importDetectionFile: 'Import detection file',
linkedDesign: 'Linked network design',
notLinkedToDesign: 'No linked network design',
showChannel: 'Show or hide {{channel}}',
```

- [ ] **Step 6: Run the page and adapter tests**

Run:

```powershell
npm test -- src/pages/HistoryPage.test.tsx src/components/HistorySignalChart.test.tsx src/features/history/historyPresentation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the page behavior and copy**

```powershell
git add src/pages/HistoryPage.tsx src/pages/HistoryPage.test.tsx src/i18n/locales/zh-CN.ts src/i18n/locales/en-US.ts
git commit -m "feat(history): rebuild record review workspace"
```

### Task 5: Apply the history layout, readability, and final validation

**Files:**
- Modify: `src/theme/cyber-scientific.css`
- Modify: `src/theme/contrast.test.ts`
- Modify: `docs/testing.md`

- [ ] **Step 1: Add a failing CSS contract test**

Extend `src/theme/contrast.test.ts` to assert that the history stylesheet contains non-wrapping record IDs, a minimum 14 px record body size, and a two-column layout where the details region is wider than the browser region. Keep the existing color contrast tests intact.

- [ ] **Step 2: Run the contrast test and verify it fails**

Run: `npm test -- src/theme/contrast.test.ts`

Expected: FAIL until the new history selectors exist.

- [ ] **Step 3: Add the cyber-scientific history styles**

Add a dedicated block to `src/theme/cyber-scientific.css` using these layout contracts:

```css
.history-workspace { display: grid; grid-template-columns: minmax(300px, 0.34fr) minmax(620px, 0.66fr); gap: 16px; align-items: start; }
.history-browser { min-width: 0; min-height: 620px; overflow: hidden; }
.history-record-list { max-height: 720px; overflow: auto; padding: 8px; }
.history-record-row { display: grid; grid-template-columns: 6px minmax(0, 1fr) auto; gap: 12px; min-height: 86px; padding: 12px; }
.history-record-row__sample { overflow: hidden; color: var(--ink-900); font-size: 14px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.history-record-row__meta { color: var(--ink-600); font-size: 13px; line-height: 1.45; }
.history-detail { display: grid; min-width: 0; gap: 14px; }
.history-detail > * { animation: history-detail-enter 180ms var(--ease-ui) both; }
@keyframes history-detail-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.history-metrics { display: grid; grid-template-columns: repeat(6, minmax(110px, 1fr)); gap: 1px; }
.history-mode-switch, .history-chart__legend { display: flex; flex-wrap: wrap; gap: 8px; }
.history-chart { min-height: 430px; padding: 18px; }
.history-chart__stage { position: relative; min-height: 330px; overflow: hidden; }
.history-chart text, .history-chart__tooltip, .history-mode-switch button, .history-chart__legend button { font-size: 13px; }
.history-chart__tooltip { position: absolute; z-index: 3; min-width: 180px; padding: 10px 12px; color: var(--ink-900); background: rgb(3 15 25 / 96%); border: 1px solid rgb(0 245 255 / 35%); pointer-events: none; }
.history-export-actions { display: flex; justify-content: flex-end; gap: 10px; }
```

Add `white-space: nowrap` to mode buttons, export buttons, statuses, short metric labels, and toolbar actions. At `max-width: 1180px`, stack `.history-workspace` to one column while keeping every control label intact. Ensure all history body copy is at least 14 px and supporting copy is at least 13 px.

- [ ] **Step 4: Document the new test coverage**

Add a “Detection record workspace” subsection to `docs/testing.md` covering analyzed curves, HC-08D raw-only truthfulness, display-only downsampling, hover lookup, Demo seeding, empty actions, i18n, and responsive layout.

- [ ] **Step 5: Run the complete history and quality checks**

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Expected: all commands exit 0. The full test run must preserve existing BLE, persistence, import, analysis, and modeling tests.

- [ ] **Step 6: Run the Windows desktop build**

Run: `npm run tauri -- build`

Expected: exit 0 and produce a Windows desktop bundle. If the local Rust/Windows toolchain prevents the build, record the exact command and exact error without weakening any checks.

- [ ] **Step 7: Perform manual bilingual checks**

Check analyzed, HC-08D raw, analysis-error, and empty states in Chinese and English. Verify channel toggles, modes, hover values, exports, long sample IDs, narrow-window stacking, dark-theme contrast, and reduced-motion behavior.

- [ ] **Step 8: Commit styles, tests, and documentation**

```powershell
git add src/theme/cyber-scientific.css src/theme/contrast.test.ts docs/testing.md
git commit -m "style(history): improve record readability and layout"
```

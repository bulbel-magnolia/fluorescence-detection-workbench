import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readCss = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const tokens = readCss('src/theme/tokens.css');
const desktopCss = readCss('src/theme/scientific-desktop.css');
const workbenchCss = readCss('src/features/bfn/bfn-workbench.css');
const canvasCss = readCss('src/features/bfn/bfn-canvas.css');
const inspectorCss = readCss('src/features/bfn/bfn-inspector.css');
const resultsCss = readCss('src/features/bfn/bfn-results.css');
const bfnCss = [workbenchCss, canvasCss, inspectorCss, resultsCss].join('\n');

describe('scientific desktop visual semantics', () => {
  it('defines one canonical semantic token contract for both themes', () => {
    for (const token of [
      '--ui-bg-app',
      '--ui-bg-pane',
      '--ui-bg-canvas',
      '--ui-bg-hover',
      '--ui-bg-selected',
      '--ui-border-subtle',
      '--ui-border-default',
      '--ui-border-strong',
      '--ui-text-primary',
      '--ui-text-secondary',
      '--ui-text-muted',
      '--ui-accent',
      '--ui-accent-subtle',
      '--ui-success',
      '--ui-warning',
      '--ui-error',
      '--ui-signal',
      '--ui-radius-sm',
      '--ui-radius-md',
      '--ui-divider',
    ]) {
      expect(tokens).toContain(token);
    }
    expect(tokens).toContain(":root[data-theme='dark']");
    expect(desktopCss).not.toMatch(/translate[XY]\(/);
  });

  it('keeps the modeling page fixed while each pane owns its scrolling', () => {
    expect(workbenchCss).toMatch(
      /\.page--bfn\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(workbenchCss).toMatch(/\.bfn-network-index__list\s*\{[\s\S]*?overflow-y:\s*auto;/);
    expect(canvasCss).toMatch(/\.bfn-canvas\s*\{[\s\S]*?overflow:\s*auto;/);
    expect(inspectorCss).toMatch(/\.bfn-inspector__body\s*\{[\s\S]*?overflow-y:\s*auto;/);
    expect(resultsCss).toMatch(
      /\.bfn-result-panel\[data-open='true'\]\s*\{[\s\S]*?height:\s*min\(320px,\s*42vh\);/,
    );
  });

  it('uses one outer workbench boundary with internal toolbar and dock dividers', () => {
    expect(workbenchCss).toMatch(
      /\.bfn-workbench-surface\s*\{[\s\S]*?border:\s*var\(--ui-divider\);[\s\S]*?border-radius:\s*var\(--ui-radius-xs\);/,
    );
    expect(workbenchCss).toMatch(
      /\.bfn-project-toolbar\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;/,
    );
    expect(workbenchCss).toMatch(
      /\.bfn-run-toolbar\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-top:\s*var\(--ui-divider\);[\s\S]*?border-radius:\s*0;/,
    );
    expect(resultsCss).toMatch(
      /\.bfn-result-panel\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-top:\s*var\(--ui-divider\);[\s\S]*?border-radius:\s*0;/,
    );
  });

  it('separates selection, connection compatibility, status, and scientific signal colors', () => {
    const selectedNode = canvasCss.match(
      /\.bfn-canvas-node\[data-selected='true'\]\s*\{([^}]*)\}/,
    )?.[1];
    const selectedIndex = workbenchCss.match(
      /\.bfn-network-index__list button\[data-selected='true'\]\s*\{([^}]*)\}/,
    )?.[1];

    expect(selectedNode).toContain('var(--ui-accent)');
    expect(selectedNode).not.toContain('var(--ui-success)');
    expect(selectedNode).not.toContain('var(--ui-signal)');
    expect(selectedIndex).toContain('var(--ui-accent)');
    expect(canvasCss).toMatch(/data-connection-state='compatible'[\s\S]*var\(--ui-success\)/);
    expect(resultsCss).toMatch(/\.bfn-chart__line\s*\{[\s\S]*stroke:\s*var\(--ui-signal\)/);
  });

  it('uses readable type, flat diagram elements, and an engineering grid', () => {
    expect(bfnCss).not.toMatch(/font-size:\s*(8|9)px/);
    expect(canvasCss).toMatch(/\.bfn-canvas__grid\s*\{[\s\S]*background-size:\s*20px 20px;/);
    expect(canvasCss).toMatch(
      /\.bfn-canvas__grid::after\s*\{[\s\S]*background-size:\s*100px 100px;/,
    );
    expect(canvasCss).not.toMatch(/radial-gradient/);
    expect(canvasCss).not.toMatch(/drop-shadow/);
    expect(canvasCss).not.toMatch(/translateY\(-1px\)/);
    expect(canvasCss).toMatch(
      /\.bfn-canvas-node\s*\{[\s\S]*border-radius:\s*var\(--ui-radius-sm\);/,
    );
    expect(inspectorCss).toContain('.bfn-property-grid');
    expect(workbenchCss).toMatch(/\.bfn-network-workspace\s*\{[\s\S]*?border-radius:\s*0;/);
  });

  it('extends the same flat desktop language to shared application pages', () => {
    expect(desktopCss).toMatch(
      /\.desktop-surface\s*\{[\s\S]*?background:\s*var\(--ui-bg-pane\);[\s\S]*?border:\s*var\(--ui-divider\);/,
    );
    expect(desktopCss).toMatch(
      /:root\[data-theme='light'\] \.page-viewport,[\s\S]*background-image:\s*none;/,
    );
    expect(desktopCss).toMatch(
      /:root \.page--overview \.overview-hero\s*\{[\s\S]*background:\s*var\(--ui-bg-pane\);[\s\S]*box-shadow:\s*none;/,
    );
    expect(desktopCss).toMatch(
      /\.settings-grid \.settings-card\s*\{[\s\S]*min-height:\s*134px;[\s\S]*border-radius:\s*0;/,
    );
    expect(desktopCss).toMatch(
      /\.page--history \.history-record-row:hover\s*\{[\s\S]*transform:\s*none;/,
    );
  });
});

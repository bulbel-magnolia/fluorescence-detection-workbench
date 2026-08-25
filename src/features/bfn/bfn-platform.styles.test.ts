import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/features/bfn/bfn-platform.css'), 'utf8');
const polishCss = css.slice(css.indexOf('/* Fixed workbench frame'));

describe('BFN workbench visual semantics', () => {
  it('keeps the modeling page fixed while each work area owns its scrolling', () => {
    expect(polishCss).toMatch(/\.page--bfn\s*\{[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/);
    expect(polishCss).toMatch(/\.bfn-network-index__list\s*\{[\s\S]*?overflow-y: auto;/);
    expect(polishCss).toMatch(/\.bfn-canvas\s*\{[\s\S]*?overflow: auto;/);
    expect(polishCss).toMatch(/\.bfn-inspector__body\s*\{[\s\S]*?overflow-y: auto;/);
    expect(polishCss).toMatch(
      /\.bfn-result-panel\[data-open='true'\]\s*\{[\s\S]*?height: min\(320px, 42vh\);/,
    );
  });

  it('separates editor selection from compatibility and scientific signal colors', () => {
    const selectedNode = polishCss.match(
      /\.bfn-canvas-node\[data-selected='true'\]\s*\{([^}]*)\}/,
    )?.[1];
    const selectedIndex = polishCss.match(
      /\.bfn-network-index__list button\[data-selected='true'\]\s*\{([^}]*)\}/,
    )?.[1];

    expect(selectedNode).toContain('var(--bfn-selection)');
    expect(selectedNode).not.toContain('var(--bfn-signal)');
    expect(selectedIndex).toContain('var(--bfn-selection)');
    expect(css).toContain("[data-connection-state='compatible']");
    expect(css).toContain('#27875e');
    expect(css).toContain('.bfn-chart__line');
    expect(css).toContain('stroke: var(--bfn-signal)');
  });
});

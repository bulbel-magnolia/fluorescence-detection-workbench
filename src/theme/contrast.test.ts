import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(resolve('src/theme/cyber-scientific.css'), 'utf8');
const darkTheme = stylesheet.slice(0, stylesheet.indexOf(":root[data-theme='light']"));

function cssVariable(name: string): string {
  const match = darkTheme.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`Missing CSS variable --${name}`);
  return match[1]!;
}

function selectorColor(selector: string, property: 'color' | 'fill' | 'background'): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = darkTheme.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`, 'i'));
  const ruleBody = rule?.[1];
  if (!ruleBody) throw new Error(`Missing CSS rule for ${selector}`);
  const match = ruleBody.match(new RegExp(`${property}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`Missing ${property} for ${selector}`);
  return match[1]!;
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Invalid color ${hex}`);
  const linear = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const red = linear(channels[0]!);
  const green = linear(channels[1]!);
  const blue = linear(channels[2]!);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('dark-theme text contrast', () => {
  it('keeps tertiary text readable on dark scientific panels', () => {
    expect(contrast(cssVariable('ink-500'), cssVariable('surface'))).toBeGreaterThanOrEqual(7);
    expect(contrast(cssVariable('ink-600'), cssVariable('surface'))).toBeGreaterThanOrEqual(7);
  });

  it('keeps empty-chart labels readable on the light plotting surface', () => {
    const chartText = selectorColor(":root[data-theme='dark'] .chart-stage text", 'fill');
    expect(contrast(chartText, '#fbfcfa')).toBeGreaterThanOrEqual(4.5);
  });

  it('uses dark text on the active light-cyan channel control', () => {
    const selector = ":root[data-theme='dark'] .channel-switch button.is-active";
    expect(
      contrast(selectorColor(selector, 'color'), selectorColor(selector, 'background')),
    ).toBeGreaterThanOrEqual(7);
  });
});

describe('record and modeling readability contracts', () => {
  it('keeps record identifiers and controls readable without abrupt wrapping', () => {
    expect(stylesheet).toMatch(
      /\.history-record-row__sample\s*\{[^}]*font-size:\s*14px[^}]*white-space:\s*nowrap/s,
    );
    expect(stylesheet).toMatch(
      /\.history-record-row\s*\{[^}]*min-height:\s*86px[^}]*font-size:\s*14px/s,
    );
    expect(stylesheet).toMatch(
      /\.history-signal-controls button[^}]*\{[^}]*white-space:\s*nowrap/s,
    );
  });

  it('gives record detail more width than the record browser', () => {
    expect(stylesheet).toMatch(
      /\.history-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(300px,\s*0\.34fr\)\s*minmax\(620px,\s*0\.66fr\)/s,
    );
  });

  it('keeps modeling commands and canvas labels legible', () => {
    expect(stylesheet).toMatch(
      /\.modeling-node-command,[\s\S]*?\.icon-text-button\s*\{[^}]*font-size:\s*14px[^}]*white-space:\s*nowrap/s,
    );
    expect(stylesheet).toMatch(/\.model-node__name\s*\{[^}]*font-size:\s*14px/s);
    expect(stylesheet).toMatch(/\.model-node__kind\s*\{[^}]*font-size:\s*13px/s);
    expect(stylesheet).toMatch(/\.model-edge text\s*\{[^}]*font-size:\s*13px/s);
  });

  it('removes the obsolete form-based connection dock', () => {
    expect(stylesheet).not.toContain('.modeling-connection-dock');
  });

  it('keeps the evidence catalog readable, keyboard-visible, and motion-safe', () => {
    expect(stylesheet).toMatch(
      /\.evidence-catalog-dialog\s*\{[^}]*display:\s*flex[^}]*width:\s*min\(1180px,\s*100%\)/s,
    );
    expect(stylesheet).toMatch(/\.catalog-entry-detail\s*\{[^}]*font-size:\s*1[34]px/s);
    expect(stylesheet).toMatch(/\.catalog-filter-bar\s*\{[^}]*font-size:\s*1[34]px/s);
    expect(stylesheet).toMatch(/\.catalog-observation small[^}]*\{[^}]*font-size:\s*13px/s);
    expect(stylesheet).toMatch(/\.catalog-entry-card:focus-visible/);
    expect(stylesheet).toMatch(/\.catalog-filter-bar :focus-visible/);
    expect(stylesheet).toMatch(/\.evidence-catalog-dialog :focus-visible/);
    expect(stylesheet).toMatch(/\.catalog-value-disclosure\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    expect(stylesheet).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.evidence-catalog-dialog \*/,
    );
    expect(stylesheet).toMatch(/\.catalog-status-text/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*1060px\)/);
    expect(stylesheet).toMatch(
      /:root\[data-theme='light'\] \.catalog-observation[\s\S]*?background:\s*#fff/,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='light'\] \.catalog-unknown[\s\S]*?color:\s*#6b4b00/,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='light'\] \.catalog-attached-reference span[\s\S]*?color:\s*#006b80/,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='light'\] \.catalog-attached-reference code[\s\S]*?color:\s*#3f5f6c/,
    );
    expect(stylesheet).toMatch(/\.evidence-catalog-dialog \.button[\s\S]*?font-size:\s*13px/);
  });
});

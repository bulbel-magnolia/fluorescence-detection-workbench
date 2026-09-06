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
  return (
    0.2126 * linear(channels[0]!) + 0.7152 * linear(channels[1]!) + 0.0722 * linear(channels[2]!)
  );
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('fluorescence application visual contracts', () => {
  it('keeps tertiary text readable on dark scientific panels', () => {
    expect(contrast(cssVariable('ink-500'), cssVariable('surface'))).toBeGreaterThanOrEqual(7);
    expect(contrast(cssVariable('ink-600'), cssVariable('surface'))).toBeGreaterThanOrEqual(7);
  });

  it('keeps chart labels readable on the light plotting surface', () => {
    const chartText = selectorColor(":root[data-theme='dark'] .chart-stage text", 'fill');
    expect(contrast(chartText, '#fbfcfa')).toBeGreaterThanOrEqual(4.5);
  });

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
});

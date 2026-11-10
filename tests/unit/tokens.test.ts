import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Design-token guard rails (UI spec §2): (1) raw colour values live only in the @theme block;
 * (2) the key foreground/background pairs meet WCAG 2.2 AA, computed from the real CSS values.
 */
const srcDir = join(import.meta.dirname, '..', '..', 'src');
const cssPath = join(srcDir, 'styles', 'index.css');
const css = readFileSync(cssPath, 'utf8');

function themeBlock(source: string): string {
  const start = source.indexOf('@theme {');
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unterminated @theme block');
}

/** `--color-*` tokens resolved to hex (follows `var(--color-x)` aliases). */
function colorTokens(): Map<string, string> {
  const raw = new Map<string, string>();
  for (const match of themeBlock(css).matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    raw.set(match[1] ?? '', (match[2] ?? '').trim());
  }
  const resolve = (name: string, depth = 0): string => {
    const value = raw.get(name);
    if (value === undefined || depth > 5) throw new Error(`Unresolvable token: ${name}`);
    const alias = /^var\(--color-([a-z0-9-]+)\)$/.exec(value);
    return alias ? resolve(alias[1] ?? '', depth + 1) : value;
  };
  return new Map([...raw.keys()].map((name) => [name, resolve(name)]));
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const tokens = colorTokens();
const color = (name: string): string => {
  const value = tokens.get(name);
  if (!value) throw new Error(`Missing token: ${name}`);
  return value;
};

describe('colour tokens exist', () => {
  it.each([
    'canvas',
    'surface',
    'surface-muted',
    'hover',
    'fg',
    'fg-muted',
    'fg-subtle',
    'line',
    'line-strong',
    'input',
    'primary',
    'primary-hover',
    'primary-active',
    'primary-fg',
    'accent',
    'ring',
    'success',
    'success-soft',
    'warning',
    'warning-soft',
    'danger',
    'danger-soft',
    'danger-solid',
    'danger-solid-hover',
    'neutral',
    'neutral-soft',
    'pink-50',
    'pink-500',
    'pink-600',
  ])('--color-%s', (name) => {
    expect(color(name)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('matches the approved brand values', () => {
    expect(color('pink-500')).toBe('#e85d9e');
    expect(color('pink-400')).toBe('#f472b6');
    expect(color('pink-50')).toBe('#fdf2f8');
    expect(color('primary')).toBe('#c7357a'); // solid button
    expect(color('primary-hover')).toBe('#a82a66');
    expect(color('fg')).toBe('#18181b');
    expect(color('input')).toBe('#8b8b94'); // R-01
  });
});

describe('WCAG 2.2 AA contrast of the real token values', () => {
  // [description, foreground token, background token, minimum ratio]
  const pairs: readonly (readonly [string, string, string, number])[] = [
    ['body text on canvas', 'fg', 'canvas', 4.5],
    ['secondary text on canvas', 'fg-muted', 'canvas', 4.5],
    ['secondary text on pink-50 (table header, banners)', 'fg-muted', 'pink-50', 4.5],
    ['secondary text on hover tint', 'fg-muted', 'hover', 4.5],
    ['secondary text on muted surface', 'fg-muted', 'surface-muted', 4.5],
    ['placeholder text on white', 'fg-subtle', 'canvas', 4.5],
    ['primary button text', 'primary-fg', 'primary', 4.5],
    ['primary button text (hover)', 'primary-fg', 'primary-hover', 4.5],
    ['primary button text (pressed)', 'primary-fg', 'primary-active', 4.5],
    ['link / ghost text on white', 'primary', 'canvas', 4.5],
    ['active nav text on pink-50', 'pink-700', 'pink-50', 4.5],
    ['select/menu highlight text on pink-50', 'pink-900', 'pink-50', 4.5],
    ['pink badge text on pink-100', 'pink-800', 'pink-100', 4.5],
    ['avatar initials on pink-100', 'pink-700', 'pink-100', 4.5],
    ['selected tab text on white', 'pink-700', 'canvas', 4.5],
    ['success badge', 'success', 'success-soft', 4.5],
    ['warning badge / offline banner', 'warning', 'warning-soft', 4.5],
    ['danger badge / alerts', 'danger', 'danger-soft', 4.5],
    ['neutral badge', 'neutral', 'neutral-soft', 4.5],
    ['destructive button text', 'primary-fg', 'danger-solid', 4.5],
    ['destructive button text (hover)', 'primary-fg', 'danger-solid-hover', 4.5],
    ['error text on white', 'danger', 'canvas', 4.5],
    // Non-text contrast (WCAG 1.4.11): 3:1
    ['focus ring on white', 'ring', 'canvas', 3],
    ['accent (progress fill, indicator) on white', 'accent', 'canvas', 3],
    ['form-control border on white (R-01)', 'input', 'canvas', 3],
    ['logo tile glyph (white on accent)', 'primary-fg', 'accent', 3],
  ];

  it.each(pairs)('%s', (_description, foreground, background, minimum) => {
    const ratio = contrast(color(foreground), color(background));
    expect(ratio, `${foreground} on ${background} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      minimum,
    );
  });

  it('documents why pink-500 and fg-subtle-on-tint are not allowed for text', () => {
    // These pairings FAIL 4.5:1 by design; the spec forbids them (UI §2.3).
    expect(contrast(color('primary-fg'), color('pink-500'))).toBeLessThan(4.5);
    expect(contrast(color('fg-subtle'), color('pink-50'))).toBeLessThan(4.5);
  });
});

describe('no raw colour values outside the @theme block', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx|css)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [full] : [];
    });
  }

  it('finds hex colours only in src/styles/index.css, and only inside @theme', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const text = readFileSync(file, 'utf8');
      const scanned = file === cssPath ? text.replace(themeBlock(text), '') : text;
      for (const match of scanned.matchAll(
        /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g,
      )) {
        offenders.push(`${relative(srcDir, file)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

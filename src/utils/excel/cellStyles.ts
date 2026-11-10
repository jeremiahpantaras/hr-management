import { bumpCount } from '@/utils/excel/xlsxPatch';

/**
 * Cell styling for SheetJS Community Edition output, which cannot write styles. A style here is a
 * font + optional solid fill + optional thin border + alignment; `patchStylesWith` appends the
 * matching entries to `xl/styles.xml` and returns each style's `cellXfs` index, and `applyCellStyles`
 * writes the `s="…"` attribute onto the cells of a worksheet. Both are pure string → string
 * transforms, unit-tested on the XML.
 */

export interface FontSpec {
  readonly size: number;
  readonly bold?: boolean;
  /** `AARRGGBB`. */
  readonly color: string;
}

export interface StyleSpec {
  readonly font: FontSpec;
  /** Solid fill, `AARRGGBB`. */
  readonly fill?: string;
  readonly border?: boolean;
  readonly horizontal: 'left' | 'center';
  readonly wrap?: boolean;
}

const BORDER =
  '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right>' +
  '<top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>';

function baseCount(xml: string, tag: string): number {
  const match = new RegExp(`<${tag} count="(\\d+)"`).exec(xml);
  if (!match) throw new Error(`styles.xml has no <${tag}>`);
  return Number(match[1]);
}

const fontXml = (font: FontSpec): string =>
  `<font>${font.bold ? '<b/>' : ''}<sz val="${String(font.size)}"/><color rgb="${font.color}"/><name val="Calibri"/><family val="2"/></font>`;
const fillXml = (rgb: string): string =>
  `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;

/** Appends the styles; `index[name]` is the `s` value to use on a cell. */
export function patchStylesWith(
  xml: string,
  specs: Readonly<Record<string, StyleSpec>>,
): { readonly xml: string; readonly index: Readonly<Record<string, number>> } {
  const fontBase = baseCount(xml, 'fonts');
  const fillBase = baseCount(xml, 'fills');
  const borderBase = baseCount(xml, 'borders');
  const xfBase = baseCount(xml, 'cellXfs');

  const fonts: string[] = [];
  const fills: string[] = [];
  const xfs: string[] = [];
  const index: Record<string, number> = {};

  for (const [name, spec] of Object.entries(specs)) {
    const font = fontXml(spec.font);
    let fontIndex = fonts.indexOf(font);
    if (fontIndex < 0) fontIndex = fonts.push(font) - 1;

    let fillId = 0;
    if (spec.fill !== undefined) {
      const fill = fillXml(spec.fill);
      let fillIndex = fills.indexOf(fill);
      if (fillIndex < 0) fillIndex = fills.push(fill) - 1;
      fillId = fillBase + fillIndex;
    }
    const borderId = spec.border === true ? borderBase : 0;
    const alignment = `<alignment horizontal="${spec.horizontal}" vertical="center"${spec.wrap === true ? ' wrapText="1"' : ''}/>`;
    index[name] =
      xfBase +
      xfs.push(
        `<xf numFmtId="0" fontId="${String(fontBase + fontIndex)}" fillId="${String(fillId)}" borderId="${String(borderId)}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alignment}</xf>`,
      ) -
      1;
  }

  let out = bumpCount(xml, 'fonts', fonts.join(''), fonts.length);
  out = bumpCount(out, 'fills', fills.join(''), fills.length);
  out = bumpCount(out, 'borders', BORDER, 1);
  out = bumpCount(out, 'cellXfs', xfs.join(''), xfs.length);
  return { xml: out, index };
}

/** `A` → 0, `B` → 1, `AA` → 26. */
export function columnIndex(letters: string): number {
  let value = 0;
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64);
  return value - 1;
}

/** Sets (or replaces) the `s` attribute of every `<c>` the callback returns a style for. */
export function applyCellStyles(
  xml: string,
  styleFor: (row: number, column: number) => number | undefined,
): string {
  return xml.replace(
    /<c r="([A-Z]+)(\d+)"([^>]*?)(\/?)>/g,
    (whole, letters, rowText, rest, close) => {
      const style = styleFor(Number(rowText) - 1, columnIndex(letters as string));
      if (style === undefined) return whole;
      const attrs = (rest as string).replace(/\s+s="\d+"/, '');
      return `<c r="${letters as string}${rowText as string}" s="${String(style)}"${attrs}${close as string}>`;
    },
  );
}

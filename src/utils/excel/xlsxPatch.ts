import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * SheetJS Community Edition cannot write page setup (paper size, orientation, fit-to-width), frozen
 * panes, styled header cells or data-validation lists. A `.xlsx` is a zip of XML, and SheetJS's output
 * is regular, so this module inserts exactly those elements at their schema-correct positions
 * (ECMA-376 `CT_Worksheet` order: sheetPr · dimension · sheetViews · cols · sheetData · autoFilter ·
 * dataValidations · printOptions · pageMargins · pageSetup · headerFooter · ignoredErrors).
 * Every function is a pure string → string transform, unit-tested on the XML.
 */

export type PaperSize = 'LETTER' | 'A4';
export type Orientation = 'landscape' | 'portrait';

/** SpreadsheetML `paperSize` codes (ECMA-376 §18.18.50): 1 = Letter (8.5×11 in), 9 = A4 (210×297 mm). */
export const PAPER_CODES: Record<PaperSize, number> = { LETTER: 1, A4: 9 };
export const PAPER_LABELS: Record<PaperSize, string> = { LETTER: 'Letter', A4: 'A4' };

export interface PrintLayout {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
  /** Left / right footer text (the centre is always "Page x of y"). */
  readonly footerLeft: string;
  readonly footerRight: string;
}

export interface SheetOptions {
  /** Style row 1 as a header and freeze it. */
  readonly header: boolean;
  /** A dropdown list for a cell range (e.g. employment status in the template). */
  readonly list?: { readonly sqref: string; readonly items: readonly string[] };
  /** Zero-based column indexes to format as text (keeps IDs like 0042 intact). */
  readonly textColumns?: readonly number[];
}

/** Style ids appended to `cellXfs` by `patchStylesXml`. */
export const HEADER_STYLE = 1;
export const TEXT_STYLE = 2;

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Excel header/footer codes use `&`; `&8` sets the font size. Text is escaped for XML. */
export function footerCode(layout: PrintLayout): string {
  const clean = (value: string) => escapeXml(value.replace(/&/g, '&&'));
  return `&amp;L&amp;8${clean(layout.footerLeft)}&amp;C&amp;8Page &amp;P of &amp;N&amp;R&amp;8${clean(layout.footerRight)}`;
}

function bumpCount(xml: string, tag: string, add: string, extra: number): string {
  const open = new RegExp(`<${tag} count="(\\d+)"([^>]*)>`);
  const match = open.exec(xml);
  if (!match) throw new Error(`styles.xml has no <${tag}>`);
  const next = Number(match[1]) + extra;
  const replaced = xml.replace(open, `<${tag} count="${String(next)}"${match[2] ?? ''}>`);
  return replaced.replace(`</${tag}>`, `${add}</${tag}>`);
}

/** Appends the header and text styles. Their indexes are `HEADER_STYLE` and `TEXT_STYLE`. */
export function patchStylesXml(xml: string): string {
  let out = xml;
  out = bumpCount(
    out,
    'fonts',
    '<font><b/><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
    1,
  );
  out = bumpCount(
    out,
    'fills',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFCE7F3"/><bgColor indexed="64"/></patternFill></fill>',
    1,
  );
  out = bumpCount(
    out,
    'borders',
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFC7357A"/></bottom><diagonal/></border>',
    1,
  );
  out = bumpCount(
    out,
    'cellXfs',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
    2,
  );
  return out;
}

export function patchWorksheetXml(xml: string, layout: PrintLayout, options: SheetOptions): string {
  let out = xml;

  // 1. fit-to-page switch: sheetPr must be the FIRST child of <worksheet>
  out = out.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');

  if (options.header) {
    // 2. freeze the header row
    out = out.replace(
      /<sheetViews>[\s\S]*?<\/sheetViews>/,
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>',
    );
    // 3. style row 1 and give it a little height
    out = out.replace(
      /<row r="1"([^>]*)>([\s\S]*?)<\/row>/,
      (_match, attrs: string, cells: string) => {
        const styled = cells.replace(/<c /g, `<c s="${String(HEADER_STYLE)}" `);
        return `<row r="1"${attrs} ht="24" customHeight="1">${styled}</row>`;
      },
    );
  }

  // text-formatted columns (the <col> element takes a `style` attribute)
  for (const column of options.textColumns ?? []) {
    const index = String(column + 1);
    out = out.replace(
      new RegExp(`<col min="${index}" max="${index}"`),
      `<col min="${index}" max="${index}" style="${String(TEXT_STYLE)}"`,
    );
  }

  // 4. dropdown list (before printOptions, per the schema order)
  const margins =
    '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';
  const hasMargins = out.includes('<pageMargins');
  const tail = out.includes('<ignoredErrors') ? '<ignoredErrors' : '</worksheet>';
  const before: string[] = [];
  if (options.list) {
    const formula = escapeXml(options.list.items.join(','));
    before.push(
      `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Employment status" error="Choose one of the listed statuses." sqref="${options.list.sqref}"><formula1>"${formula}"</formula1></dataValidation></dataValidations>`,
    );
  }
  before.push('<printOptions horizontalCentered="1"/>');
  const after =
    `<pageSetup paperSize="${String(PAPER_CODES[layout.paper])}" orientation="${layout.orientation}" fitToWidth="1" fitToHeight="0"/>` +
    `<headerFooter><oddFooter>${footerCode(layout)}</oddFooter></headerFooter>`;

  if (hasMargins) {
    out = out.replace(/<pageMargins[^>]*\/>/, (m) => `${before.join('')}${m}${after}`);
  } else {
    out = out.replace(tail, `${before.join('')}${margins}${after}${tail}`);
  }
  return out;
}

/**
 * Applies the print layout to every sheet of a workbook written by SheetJS. Only the sheets named in
 * `headerSheets` (zero-based) get the header style, frozen row and text columns.
 */
export function applyPrintLayout(
  bytes: Uint8Array,
  layout: PrintLayout,
  sheetOptions: readonly SheetOptions[],
): Uint8Array {
  const files = unzipSync(bytes);
  const stylesPath = 'xl/styles.xml';
  const styles = files[stylesPath];
  if (!styles) throw new Error('Not a workbook written by SheetJS: no xl/styles.xml');
  files[stylesPath] = strToU8(patchStylesXml(strFromU8(styles)));

  sheetOptions.forEach((options, index) => {
    const path = `xl/worksheets/sheet${String(index + 1)}.xml`;
    const sheet = files[path];
    if (!sheet) throw new Error(`Missing ${path}`);
    files[path] = strToU8(patchWorksheetXml(strFromU8(sheet), layout, options));
  });
  return zipSync(files, { level: 6 });
}

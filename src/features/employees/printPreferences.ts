import type { Orientation, PaperSize } from '@/utils/excel/xlsxPatch';

const KEY = 'hr.employeeExport.print';

export interface PrintPreferences {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
}

export const DEFAULT_PRINT: PrintPreferences = { paper: 'A4', orientation: 'landscape' };

/** The last paper size / orientation used — a per-viewer convenience; works without storage. */
export function loadPrintPreferences(): PrintPreferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_PRINT;
    const parsed = JSON.parse(raw) as Partial<PrintPreferences>;
    return {
      paper:
        parsed.paper === 'LETTER' || parsed.paper === 'A4' ? parsed.paper : DEFAULT_PRINT.paper,
      orientation:
        parsed.orientation === 'portrait' || parsed.orientation === 'landscape'
          ? parsed.orientation
          : DEFAULT_PRINT.orientation,
    };
  } catch {
    return DEFAULT_PRINT;
  }
}

export function savePrintPreferences(preferences: PrintPreferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // storage blocked or full: the choice simply isn't remembered
  }
}

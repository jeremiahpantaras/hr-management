import type { Orientation, PaperSize } from '@/utils/excel/xlsxPatch';

/** Each export remembers its own choice (employees and the leave credits report). */
export const EMPLOYEE_EXPORT_KEY = 'hr.employeeExport.print';
export const REPORT_EXPORT_KEY = 'hr.leaveReport.print';
export const HISTORY_EXPORT_KEY = 'hr.leaveHistory.print';

export interface PrintPreferences {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
}

export const DEFAULT_PRINT: PrintPreferences = { paper: 'A4', orientation: 'landscape' };

/** The last paper size / orientation used — a per-viewer convenience; works without storage. */
export function loadPrintPreferences(
  key: string = EMPLOYEE_EXPORT_KEY,
  fallback: PrintPreferences = DEFAULT_PRINT,
): PrintPreferences {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Partial<PrintPreferences>;
    return {
      paper: parsed.paper === 'LETTER' || parsed.paper === 'A4' ? parsed.paper : fallback.paper,
      orientation:
        parsed.orientation === 'portrait' || parsed.orientation === 'landscape'
          ? parsed.orientation
          : fallback.orientation,
    };
  } catch {
    return fallback;
  }
}

export function savePrintPreferences(
  preferences: PrintPreferences,
  key: string = EMPLOYEE_EXPORT_KEY,
): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    // storage blocked or full: the choice simply isn't remembered
  }
}

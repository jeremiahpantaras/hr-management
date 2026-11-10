import { PAPER_LABELS, type PaperSize } from '@/utils/excel/xlsxPatch';

/** Keeps only `[A-Za-z0-9._-]` so a title can never produce an unsafe file name. */
export function sanitizeFilePart(value: string, fallback = 'report'): string {
  const cleaned = value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^[.-]+|[.-]+$/g, '');
  return cleaned === '' ? fallback : cleaned;
}

/** `BAGO-PLANT-LEAVE-CREDITS-AS-OF-AUGUST-2026_A4.xlsx` */
export function leaveCreditsFileName(heading: string, paper: PaperSize): string {
  return `${sanitizeFilePart(heading, 'Leave-Credits')}_${PAPER_LABELS[paper]}.xlsx`;
}

/**
 * Shared look of text-like form controls: 40px (44px on touch); 16px text below 640px prevents
 * iOS zoom-on-focus (UI spec §3). The boundary uses `border-input` (≥3:1, refinement R-01).
 */
export const controlClasses = [
  'w-full rounded-control border border-input bg-surface px-3 text-base text-fg sm:text-sm',
  'transition-colors duration-150 ease-standard',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle',
  'aria-invalid:border-danger',
];

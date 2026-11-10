import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { LEAVE_YEAR_UI_MIN, parseYearParam } from '@/utils/years';

/**
 * The selected leave year lives in the URL as `?year=` so pages are shareable and Back restores
 * it (Architecture §4.3). Defaults to the current year; invalid values fall back silently.
 */
export function useYearParam(
  minYear: number = LEAVE_YEAR_UI_MIN,
): readonly [year: number, setYear: (year: number) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentYear = new Date().getFullYear();
  const raw = searchParams.get('year');
  const year = useMemo(
    () => parseYearParam(raw, currentYear, minYear),
    [raw, currentYear, minYear],
  );

  const setYear = useCallback(
    (next: number) => {
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          params.set('year', String(next));
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [year, setYear] as const;
}

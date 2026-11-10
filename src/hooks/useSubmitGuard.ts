import { useCallback, useRef, useState } from 'react';

interface SubmitGuard<TArgs extends unknown[], TResult> {
  /** Runs the action unless one is already in flight; a duplicate call resolves to `undefined`. */
  readonly run: (...args: TArgs) => Promise<TResult | undefined>;
  /** True while the action is running — use it to disable controls and show a spinner. */
  readonly pending: boolean;
}

/**
 * Duplicate-submission guard (D-05, FR-LU-07): at most one submission in flight. A synchronous
 * ref closes the gap between two clicks in the same tick, which React state alone cannot.
 */
export function useSubmitGuard<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): SubmitGuard<TArgs, TResult> {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      try {
        return await action(...args);
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending };
}

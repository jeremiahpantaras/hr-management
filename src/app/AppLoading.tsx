import { LoadingState } from '@/components/feedback/LoadingState';

/** Shown while the first lazy route module loads (React Router's initial hydration). */
export function AppLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <LoadingState label="Loading application…" />
    </div>
  );
}

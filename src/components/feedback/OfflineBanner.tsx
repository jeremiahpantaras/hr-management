import { WifiOff } from 'lucide-react';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/** Persistent notice while offline — leave transactions cannot be saved without a connection. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning/20 bg-warning-soft px-4 py-2 text-sm text-warning"
    >
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      <span>You&apos;re offline. Changes can&apos;t be saved until you reconnect.</span>
    </div>
  );
}

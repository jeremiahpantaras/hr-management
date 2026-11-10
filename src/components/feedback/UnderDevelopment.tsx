import { Construction } from 'lucide-react';

import { EmptyState } from '@/components/feedback/EmptyState';
import { Card } from '@/components/ui/card';

interface UnderDevelopmentProps {
  /** Implementation phase that delivers this screen (planning/IMPLEMENTATION_ROADMAP.md). */
  readonly phase: number;
  readonly feature: string;
}

/** Phase 1 placeholder body for routes whose functionality arrives in a later phase. */
export function UnderDevelopment({ phase, feature }: UnderDevelopmentProps) {
  return (
    <Card>
      <EmptyState
        icon={Construction}
        title="Under development"
        description={`${feature} arrives in Phase ${String(phase)} of the implementation plan.`}
      />
    </Card>
  );
}

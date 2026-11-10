import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <main id="main-content" className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <EmptyState
        icon={FileQuestion}
        title="Page not found"
        titleAs="h1"
        description="The page you're looking for doesn't exist or has moved."
        action={
          <Button asChild>
            <Link to="/">Back to dashboard</Link>
          </Button>
        }
      />
    </main>
  );
}

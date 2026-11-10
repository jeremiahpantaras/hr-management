import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { ErrorState } from '@/components/feedback/ErrorState';
import { Button } from '@/components/ui/button';

function reload(): void {
  window.location.reload();
}

function FullPageError({ message }: { readonly message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md">
        <ErrorState titleAs="h1" message={message} />
        <div className="flex justify-center">
          <Button onClick={reload}>Reload page</Button>
        </div>
      </div>
    </main>
  );
}

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly failed: boolean;
}

/** Last-resort boundary around the whole app. Shows no stack traces or raw error text. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Name and component stack only — never messages, which could contain personal data.
    console.error('Unhandled UI error:', error.name, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.failed ? (
      <FullPageError message="An unexpected error occurred. Reloading the page usually fixes it." />
    ) : (
      this.props.children
    );
  }
}

/** Router `errorElement`: errors thrown while loading or rendering a route. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? 'The page could not be loaded.'
    : 'An unexpected error occurred while showing this page.';
  return <FullPageError message={message} />;
}

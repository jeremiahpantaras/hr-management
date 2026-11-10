import { useState } from 'react';
import { RouterProvider } from 'react-router';

import { AppProviders } from '@/app/providers/AppProviders';
import { createAppRouter } from '@/app/router';
import type { EnvResult } from '@/lib/env';

interface AppProps {
  readonly env: EnvResult;
}

interface ConfigErrorScreenProps {
  readonly invalidKeys: readonly string[];
}

function ConfigErrorScreen({ invalidKeys }: ConfigErrorScreenProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 p-6">
      <div
        role="alert"
        className="rounded-card border border-danger/30 bg-danger-soft p-5 text-danger"
      >
        <h1 className="text-section">Configuration error</h1>
        <p className="mt-2">
          The application is missing or has invalid configuration for the following environment
          variables:
        </p>
        <ul className="mt-2 list-disc pl-5 font-mono text-caption">
          {invalidKeys.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
        <p className="mt-3">
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in the values, and restart
          the dev server.
        </p>
      </div>
    </main>
  );
}

function AppRouter() {
  // Created once per mount; a data router must not be recreated on every render.
  const [router] = useState(createAppRouter);
  return <RouterProvider router={router} />;
}

/** Root: an invalid environment shows the Configuration error screen instead of the app. */
export function App({ env }: AppProps) {
  if (!env.ok) {
    return <ConfigErrorScreen invalidKeys={env.invalidKeys} />;
  }

  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { envResult } from '@/lib/env';
import { getFirebase } from '@/lib/firebase';

import '../styles/index.css';

// Initialize Firebase once at startup when the configuration is valid. This only builds the
// SDK objects (and points them at the emulators in development); it makes no network calls.
if (envResult.ok) {
  getFirebase();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App env={envResult} />
  </StrictMode>,
);

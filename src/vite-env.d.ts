// Typed access to the Vite environment variables this app reads (see src/lib/env.ts).
// Only the four public Firebase web-config values and the emulator flag use the VITE_ prefix;
// anything with that prefix is inlined into the public browser bundle.
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

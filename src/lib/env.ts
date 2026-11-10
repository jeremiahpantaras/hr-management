import { z } from 'zod';

/**
 * Validated, typed access to the build-time environment (planning/FIREBASE_SECURITY_PLAN.md §3).
 *
 * Only public Firebase *web app* config belongs here. Service-account credentials must never
 * be placed in a VITE_* variable: Vite inlines every VITE_* variable into the browser bundle.
 */
const envSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().trim().min(1),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().trim().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().trim().min(1),
  VITE_FIREBASE_APP_ID: z.string().trim().min(1),
  VITE_USE_FIREBASE_EMULATORS: z.enum(['true', 'false']).default('false'),
});

export interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
}

export interface AppEnv {
  readonly firebase: FirebaseWebConfig;
  readonly useEmulators: boolean;
}

export type EnvResult =
  | { readonly ok: true; readonly env: AppEnv }
  /** `invalidKeys` lists variable NAMES only — values are never echoed. */
  | { readonly ok: false; readonly invalidKeys: readonly string[] };

export function parseEnv(raw: Readonly<Record<string, unknown>>): EnvResult {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const invalidKeys = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return { ok: false, invalidKeys };
  }

  const data = parsed.data;
  return {
    ok: true,
    env: {
      firebase: {
        apiKey: data.VITE_FIREBASE_API_KEY,
        authDomain: data.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: data.VITE_FIREBASE_PROJECT_ID,
        appId: data.VITE_FIREBASE_APP_ID,
      },
      useEmulators: data.VITE_USE_FIREBASE_EMULATORS === 'true',
    },
  };
}

/** The environment this build was started with, validated once at module load. */
export const envResult: EnvResult = parseEnv(import.meta.env);

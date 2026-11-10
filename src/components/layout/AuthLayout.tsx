import type { ReactNode } from 'react';

import { BrandMark } from '@/components/layout/BrandMark';

/** Centered 400px card on white with one very soft pink wash — for pre-login screens. */
export function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-linear-to-b from-pink-50 to-canvas to-60% px-4 py-10">
      <main id="main-content" className="flex w-full max-w-100 flex-col gap-6">
        <BrandMark className="justify-center" />
        <div className="rounded-card border bg-surface p-6 shadow-card sm:p-8">{children}</div>
      </main>
    </div>
  );
}

/** First focusable element: lets keyboard users jump past the navigation (WCAG 2.4.1). */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
    >
      Skip to main content
    </a>
  );
}

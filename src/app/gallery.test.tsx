import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ComponentGallery } from '@/app/dev/ComponentGallery';
import { TooltipProvider } from '@/components/ui/tooltip';

describe('dev component gallery', () => {
  it('renders every design-system component without throwing', () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <ComponentGallery />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Component gallery' }),
    ).toBeInTheDocument();
    // One heading per section: guards against a section silently failing to render.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(10);
  });
});

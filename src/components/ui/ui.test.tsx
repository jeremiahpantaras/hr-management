import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { StatusBadge } from '@/components/data/StatusBadge';
import { FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

describe('Button', () => {
  it('fires onClick and defaults to type="button" (never submits a form by accident)', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('while loading: is disabled, aria-busy, and ignores clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('uses pink-600 (primary) for solid buttons, never the lighter accent pink', () => {
    render(<Button>Go</Button>);
    const classes = screen.getByRole('button').className;
    expect(classes).toContain('bg-primary');
    expect(classes).not.toContain('bg-accent');
    expect(classes).not.toContain('pink-500');
  });

  it('asChild styles a router Link as a button', () => {
    render(
      <MemoryRouter>
        <Button asChild>
          <Link to="/employees">Employees</Link>
        </Button>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Employees' });
    expect(link).toHaveAttribute('href', '/employees');
    expect(link.className).toContain('bg-primary');
  });
});

describe('FormField accessibility wiring (UI spec §9)', () => {
  it('links label, helper text and error to the control', () => {
    render(
      <FormField
        label="Employee ID"
        required
        helper="Letters and numbers."
        error="This employee ID is already in use."
      >
        {(control) => <Input {...control} />}
      </FormField>,
    );

    const input = screen.getByLabelText(/Employee ID/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription(
      'This employee ID is already in use. Letters and numbers.',
    );
    // The asterisk is decorative; the requirement is announced as text.
    expect(screen.getByText('(required)')).toHaveClass('sr-only');
  });

  it('is not marked invalid and has no description when there is nothing to say', () => {
    render(<FormField label="Remarks">{(control) => <Input {...control} />}</FormField>);
    const input = screen.getByLabelText('Remarks');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('StatusBadge', () => {
  it('always renders text, with a decorative icon for status tones', () => {
    const { container } = render(<StatusBadge tone="danger">Depleted</StatusBadge>);
    expect(screen.getByText('Depleted')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('can hide the default icon', () => {
    const { container } = render(
      <StatusBadge tone="warning" icon={false}>
        Reversal
      </StatusBadge>,
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('Skeleton and Spinner', () => {
  it('Skeleton is hidden from assistive technology', () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('Spinner announces only when given a label', () => {
    const { rerender } = render(<Spinner />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<Spinner label="Loading records" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading records');
  });
});

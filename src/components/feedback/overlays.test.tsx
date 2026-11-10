import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeCombobox } from '@/components/data/EmployeeCombobox';
import { FilterDropdown } from '@/components/data/FilterDropdown';
import { YearSelect } from '@/components/data/YearSelect';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { DateRangeField } from '@/components/form/DateRangeField';
import { DaysField } from '@/components/form/DaysField';

describe('ConfirmDialog (UI spec §10)', () => {
  const baseProps = {
    title: 'Archive Juan Dela Cruz?',
    description: 'Their leave history is kept.',
    confirmLabel: 'Archive employee',
  };

  it('is a labelled, described dialog', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
        {...baseProps}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Archive Juan Dela Cruz?' });
    expect(dialog).toHaveAccessibleDescription('Their leave history is kept.');
  });

  it('destructive tone starts focus on Cancel so Enter cannot destroy by accident', async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
        tone="destructive"
        {...baseProps}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });
  });

  it('confirm runs the action and then closes', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Archive employee' }));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cannot be dismissed or double-submitted while the action is pending', async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'Archive employee' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archive employee' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Archive employee' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('stays open when the action fails, so the caller can report and retry', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network'));
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Archive employee' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive employee' })).not.toHaveAttribute(
        'aria-busy',
      );
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Esc closes it when nothing is pending', async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={onOpenChange} onConfirm={() => undefined} {...baseProps} />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('YearSelect / FilterDropdown / EmployeeCombobox', () => {
  it('YearSelect lists currentYear+1 down to 2020 and reports the choice as a number', async () => {
    const onChange = vi.fn();
    render(<YearSelect value={2026} onChange={onChange} currentYear={2026} />);
    const trigger = screen.getByRole('combobox', { name: 'Leave year' });
    expect(trigger).toHaveTextContent('2026');
    await userEvent.click(trigger);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['2027', '2026', '2025', '2024', '2023', '2022', '2021', '2020']);
    await userEvent.click(screen.getByRole('option', { name: '2025' }));
    expect(onChange).toHaveBeenCalledWith(2025);
  });

  it('FilterDropdown maps "All" to an empty string', async () => {
    const onChange = vi.fn();
    render(
      <FilterDropdown
        label="Status"
        value="regular"
        onChange={onChange}
        options={[
          { value: 'regular', label: 'Regular' },
          { value: 'probationary', label: 'Probationary' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'All' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('EmployeeCombobox filters by name or Employee ID and selects', async () => {
    const employees = [
      { id: 'e1', fullName: 'Juan Dela Cruz', employeeNumber: 'EMP-0042' },
      { id: 'e2', fullName: 'Ana Reyes', employeeNumber: 'EMP-0043' },
    ];
    function Harness() {
      const [value, setValue] = useState<string | null>(null);
      return <EmployeeCombobox employees={employees} value={value} onChange={setValue} />;
    }
    render(<Harness />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Select an employee');
    expect(trigger).toHaveAttribute('aria-controls');
    await userEvent.click(trigger);
    await userEvent.type(screen.getByRole('combobox', { name: 'Search employees' }), '0043');
    expect(screen.queryByText('Juan Dela Cruz')).toBeNull();
    await userEvent.click(screen.getByRole('option', { name: /Ana Reyes/ }));
    expect(screen.getByRole('combobox')).toHaveTextContent('Ana Reyes (EMP-0043)');
  });

  it('EmployeeCombobox shows an empty message when nothing matches', async () => {
    render(<EmployeeCombobox employees={[]} value={null} onChange={() => undefined} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByText('No employee found.')).toBeInTheDocument();
  });
});

describe('DaysField / DateRangeField', () => {
  it('DaysField guides to half-day steps with a decimal keypad', () => {
    render(<DaysField label="Days to deduct" required />);
    const input = screen.getByLabelText(/Days to deduct/);
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('step', '0.5');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('min', '0.5');
    expect(input).toBeRequired();
  });

  it('DateRangeField bounds both dates to the leave year (no cross-year records)', () => {
    render(
      <DateRangeField
        year={2026}
        from="2026-02-10"
        to="2026-02-11"
        onFromChange={() => undefined}
        onToChange={() => undefined}
        required
      />,
    );
    const from = screen.getByLabelText(/Date from/);
    const to = screen.getByLabelText(/Date to/);
    expect(from).toHaveAttribute('min', '2026-01-01');
    expect(from).toHaveAttribute('max', '2026-12-31');
    expect(to).toHaveAttribute('min', '2026-02-10'); // cannot end before it starts
    expect(to).toHaveAttribute('max', '2026-12-31');
  });
});

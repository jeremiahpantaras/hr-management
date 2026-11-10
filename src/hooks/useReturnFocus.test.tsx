import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

/** Modals opened by application state (no Radix Trigger) must still return focus to the opener. */
function Harness({ onCloseAutoFocus }: { readonly onCloseAutoFocus?: (event: Event) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open it
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('focus returns to the control that opened a modal (WCAG 2.4.3)', () => {
  it('Dialog: Escape → focus is back on the opener', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await userEvent.click(opener);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('Dialog: the Close button works the same way', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await userEvent.click(opener);
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it("a caller's own onCloseAutoFocus that prevents default takes precedence", async () => {
    const handler = vi.fn((event: Event) => {
      event.preventDefault();
    });
    render(<Harness onCloseAutoFocus={handler} />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await userEvent.click(opener);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(handler).toHaveBeenCalled();
    });
    expect(opener).not.toHaveFocus();
  });

  it('ConfirmDialog returns focus to the button that opened it', async () => {
    function Confirm() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Archive…
          </button>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Sure?"
            description="d"
            confirmLabel="Yes"
            onConfirm={() => undefined}
          />
        </>
      );
    }
    render(<Confirm />);
    const opener = screen.getByRole('button', { name: 'Archive…' });
    await userEvent.click(opener);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('Sheet (the mobile navigation drawer) returns focus to its menu button', async () => {
    function Drawer() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Menu
          </button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="left">
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Links</SheetDescription>
            </SheetContent>
          </Sheet>
        </>
      );
    }
    render(<Drawer />);
    const opener = screen.getByRole('button', { name: 'Menu' });
    await userEvent.click(opener);
    await screen.findByRole('dialog', { name: 'Navigation' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });
});

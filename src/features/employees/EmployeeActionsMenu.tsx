import { Archive, ArchiveRestore, Eye, MoreHorizontal, Pencil } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Employee } from '@/types/models';

interface EmployeeActionsMenuProps {
  readonly employee: Employee;
  readonly onEdit: (employee: Employee) => void;
  readonly onArchive: (employee: Employee) => void;
  readonly onRestore: (employee: Employee) => void;
}

/**
 * Row actions. There is deliberately NO delete (FR-EMP-09). Allocate-credits and record-usage
 * shortcuts are added by the phases that build those features.
 */
export function EmployeeActionsMenu({
  employee,
  onEdit,
  onArchive,
  onRestore,
}: EmployeeActionsMenuProps) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${employee.fullName}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild>
            <Link to={`/employees/${employee.id}`}>
              <Eye aria-hidden="true" />
              View
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onEdit(employee);
            }}
          >
            <Pencil aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {employee.isArchived ? (
            <DropdownMenuItem
              onSelect={() => {
                onRestore(employee);
              }}
            >
              <ArchiveRestore aria-hidden="true" />
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              destructive
              onSelect={() => {
                onArchive(employee);
              }}
            >
              <Archive aria-hidden="true" />
              Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

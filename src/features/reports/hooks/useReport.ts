import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { AppError } from '@/domain/errors';
import { buildReport, type ReportFilters, type ReportModel } from '@/domain/report';
import { useAuth } from '@/features/auth/useAuth';
import { employeeKeys } from '@/features/employees/hooks/useEmployees';
import { leaveTypeKeys } from '@/features/leave-types/hooks/useLeaveTypes';
import { listEmployees } from '@/services/employees.service';
import { listLeaveTypes } from '@/services/leaveTypes.service';
import { loadReportSource } from '@/services/reports.service';
import type { Employee, LeaveType } from '@/types/models';

/**
 * Preview = load the year, join current master data, reconcile, and build the report model. The
 * employee and leave-type lists come from the shared cache (fetched if not there yet).
 */
export function useGenerateReport(): UseMutationResult<ReportModel, Error, ReportFilters> {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (filters: ReportFilters): Promise<ReportModel> => {
      if (profile === null) throw new AppError('PERMISSION_DENIED');
      const [employees, leaveTypes, source] = await Promise.all([
        queryClient.ensureQueryData<Employee[]>({
          queryKey: employeeKeys.all,
          queryFn: listEmployees,
        }),
        queryClient.ensureQueryData<LeaveType[]>({
          queryKey: leaveTypeKeys.all,
          queryFn: listLeaveTypes,
        }),
        loadReportSource(filters.year, filters.employeeId),
      ]);
      return buildReport({
        filters,
        employees,
        leaveTypes,
        balances: source.balances,
        ledger: source.ledger,
        generatedAt: new Date(),
        generatedBy: profile.fullName,
      });
    },
  });
}

/**
 * Downloads the workbook. SheetJS is a heavy library, so it is loaded with a dynamic `import()`
 * only when the user actually exports (NFR-PERF-04, verified against the build output).
 */
export function useExportReport(): UseMutationResult<
  string,
  Error,
  { readonly report: ReportModel; readonly employeeNumber: string | null }
> {
  return useMutation({
    mutationFn: async ({ report, employeeNumber }) => {
      const { downloadReport } = await import('@/utils/excel/exportReport');
      return downloadReport(report, employeeNumber);
    },
  });
}

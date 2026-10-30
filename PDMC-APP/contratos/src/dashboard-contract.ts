import type { TransferType } from "./transferencias/classification";
export type Transfer = { id: string; date: string; biller: string; store: string; status: string; comment: string; type:TransferType; units: number; reported: boolean; reportKind?: "SIN_INCONSISTENCIAS"|"CON_INCONSISTENCIAS"|null };
export type PendingReport = { id: string; date: string; exportDate?: string; deadline?: string; daysOverdue?: number | null; biller: string; store: string; units: number; comment: string; type:TransferType };
/** porExportar: transferencias Abiertas o Aprobadas; la tienda las podrá reportar cuando lleguen a Exportada. */
export type StoreRow = { name: string; total: number; exported: number; reported: number; pending: number; porExportar: number; units: number; compliance: number };
export type Biller = { name: string; transfers: number; units: number; errors: number; errorUnits: number; affectedTransfers: number; resolved: number; errorPct: number };
export type ErrorCase = { date: string; store: string; transfer: string; quantity: number; reason: string; resolved?: boolean; observation?: string };
export type Negative = { code: string; brand: string; name: string; system: number; physical: string; warehouse: string; reason: string; verdict: string; related?: string; resolved?: boolean; adjustment?: string; status?: string; reference?: string; size?: string; brandCode?: string; category?: string; line?: string; queryDate?: string; present?: boolean };
export type DashboardData = {
  operationalStoreNames: readonly string[];
  allowedBillers?: readonly string[];
  snapshot: { generatedAt: string; exportDateColumnAvailable: boolean };
  aggregates: { totalTransfers: number; exported: number; reported: number; unresolvedInconsistencies: number; unresolvedNegatives: number; negativeUnits: number; realBillingCases: number; realBillingUnits: number };
  transfers: readonly Transfer[]; pendingReports: readonly PendingReport[]; stores: readonly StoreRow[];
  billers: readonly Biller[]; errorCases: readonly ErrorCase[];
  negatives: readonly Negative[]; negativeHistory: readonly unknown[];
};

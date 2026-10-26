// Base vacia para las secciones que aun no tienen fuente PostgreSQL propia.
// Los datos operativos se completan en el servidor desde la base de PDMC.
export const dashboardData = {
  operationalStoreNames: [],
  snapshot: {generatedAt:"",exportDateColumnAvailable:false},
  aggregates: {
    totalTransfers:0,exported:0,reported:0,
    unresolvedInconsistencies:0,unresolvedNegatives:0,negativeUnits:0,
    realBillingCases:0,realBillingUnits:0,
  },
  transfers:[],pendingReports:[],stores:[],billers:[],errorCases:[],
  negatives:[],negativeHistory:[],
} as const;

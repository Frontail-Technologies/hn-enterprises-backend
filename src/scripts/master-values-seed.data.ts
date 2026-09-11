import type { MasterValueCategory } from "@modules/masters/masters.types";

/**
 * Canonical production master-value seed data (§3 of the bulk-toolbar /
 * invoice / master-data brief). Values were collected by auditing what the
 * app already depends on - not invented - see the comment above each
 * category for where it came from:
 *
 * - paymentTypes: the exact list already intended by the old
 *   scripts/seed-payment-modes.ts (now superseded by this file).
 * - connectionTypes: frontend/mobile `ConnectionType` type union and the
 *   still-referenced `connectionTypeOptions` (frontend/src/features/customers/config/customer-options.ts).
 * - houseTypes / schemes: real values observed in sample-customers-25.csv
 *   (Independent House, Apartment, Shop / Normal, PMUY).
 * - documentCategories: string literals actual business logic already
 *   matches against (CustomerEvidenceReports.tsx, dashboard-stats.service.ts,
 *   report-templates.service.ts, customer-register-columns.ts).
 * - materialCategories / meterTypes: the app has no hardcoded reference list
 *   for these two, so they're named to match the customer field-group
 *   sections that already exist verbatim (GI/Isolation/Fittings/MDPE) and the
 *   standard domestic gas-meter "G" sizing already referenced once
 *   (report-templates.service.ts's "RECHEM G-1.6"). These two are the
 *   weakest-evidenced categories - review/extend via the Masters admin
 *   screen as real business values surface.
 */
export const MASTER_VALUES_SEED: Record<MasterValueCategory, string[]> = {
  payment_types: ["Cash", "UPI", "Bank Transfer", "NEFT", "Cheque", "Other"],
  connection_types: ["Domestic", "Commercial", "Industrial"],
  house_types: ["Independent House", "Apartment", "Shop"],
  schemes: ["Normal", "PMUY"],
  document_categories: [
    "ID / Address Proof",
    "LMC / Site Evidence",
    "Meter Photo",
    "Customer Photo",
    "GI Evidence",
    "GC Evidence",
    "GC Report",
    "Payment Receipt",
    "Other",
  ],
  material_categories: [
    "GI Pipes & Fittings",
    "Isolation Valves & Regulators",
    "Fittings & Accessories",
    "MDPE Fittings",
    "Meters & Accessories",
    "Other",
  ],
  meter_types: ["G1.6", "G2.5", "G4", "G6"],
};

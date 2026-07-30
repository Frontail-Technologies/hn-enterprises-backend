import { and, eq } from "drizzle-orm";
import { getDb } from "@db";
import {
  customerLmcPipeRecords,
  customers,
  importBatches,
  importRows,
  projectSites,
  projects,
} from "@db/schema";
import { mapRows, normalizeKey, normalizeText, readSheetRows } from "./master-import.mapper";
import type {
  ConfirmImportResult,
  ImportPreviewProjectGroup,
  ImportPreviewSiteGroup,
  ImportPreviewSummary,
  NormalizedImportRow,
  NormalizedLmcPipeRecord,
} from "./master-import.types";

type ExistingProject = typeof projects.$inferSelect;
type ExistingSite = typeof projectSites.$inferSelect;
type ExistingCustomer = typeof customers.$inferSelect;
type Db = ReturnType<typeof getDb>;
type DbPipeStatus = "not_started" | "in_progress" | "laying_completed" | "testing_pending" | "testing_completed" | "purging_completed" | "not_required" | "on_hold";

const ADMIN_ROLES = ["super_admin", "admin"] as const;

function assertAdmin(role: string) {
  if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
    throw new Error("Only admin users can import master sheets");
  }
}

export const masterImportService = {
  async preview(file: File, user: { id: string; role: string }) {
    assertAdmin(user.role);

    const rawRows = await readSheetRows(file);
    const rows = await matchRows(mapRows(rawRows));
    const summary = buildSummary(file.name, rows);

    const db = getDb();
    const [batch] = await db
      .insert(importBatches)
      .values({
        fileName: file.name,
        summary,
        createdBy: user.id,
      })
      .returning({ id: importBatches.id });

    if (!batch) {
      throw new Error("Unable to create import preview batch");
    }

    if (rows.length) {
      await db.insert(importRows).values(
        rows.map((row) => ({
          batchId: batch.id,
          rowNumber: row.rowNumber,
          status: getRowStatus(row),
          rawData: row.rawData,
          normalizedData: serializeNormalizedRow(row),
          issues: [...row.issues, ...row.warnings],
          matchedProjectId: row.matchedProjectId,
          matchedSiteId: row.matchedSiteId,
          importedCustomerId: row.existingCustomerId,
        })),
      );
    }

    return {
      ...summary,
      batchId: batch.id,
    } satisfies ImportPreviewSummary;
  },

  async getBatch(batchId: string, user: { role: string }) {
    assertAdmin(user.role);

    const db = getDb();
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error("Import batch not found");
    }

    return {
      ...batch.summary,
      batchId: batch.id,
      status: batch.status,
    };
  },

  async confirm(batchId: string, user: { id: string; role: string }): Promise<ConfirmImportResult> {
    assertAdmin(user.role);

    const db = getDb();
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error("Import batch not found");
    }

    if (batch.status !== "previewed") {
      throw new Error("Only previewed import batches can be confirmed");
    }

    const storedRows = await db
      .select()
      .from(importRows)
      .where(eq(importRows.batchId, batchId));

    const rows = storedRows.map((row) => row.normalizedData as unknown as NormalizedImportRow);

    return db.transaction(async (tx) => {
      let projectsCreated = 0;
      let sitesCreated = 0;
      let customersCreated = 0;
      let rowsRejected = 0;
      const projectIdByKey = new Map<string, string>();
      const siteIdByKey = new Map<string, string>();

      for (const row of rows) {
        if (row.issues.length || row.existingCustomerId) {
          rowsRejected += 1;
          await tx
            .update(importRows)
            .set({ status: "rejected" })
            .where(and(eq(importRows.batchId, batchId), eq(importRows.rowNumber, row.rowNumber)));
          continue;
        }

        const projectKey = getProjectKey(row);
        let projectId = row.matchedProjectId ?? projectIdByKey.get(projectKey);

        if (!projectId) {
          const [insertedProject] = await tx
            .insert(projects)
            .values({
              name: row.projectName,
              normalizedName: normalizeKey(row.projectName),
              code: row.projectCode || null,
              normalizedCode: row.projectCode ? normalizeKey(row.projectCode) : null,
              city: row.city || null,
              normalizedCity: row.city ? normalizeKey(row.city) : null,
              importedSource: row.rawData,
              createdBy: user.id,
              updatedBy: user.id,
            })
            .returning({ id: projects.id });

          if (!insertedProject) throw new Error("Unable to create project during import");
          projectId = insertedProject.id;
          projectsCreated += 1;
          projectIdByKey.set(projectKey, projectId);
        }

        const siteKey = getSiteKey(projectKey, row);
        let siteId = row.matchedSiteId ?? siteIdByKey.get(siteKey);

        if (!siteId) {
          const [insertedSite] = await tx
            .insert(projectSites)
            .values({
              projectId,
              name: row.siteName,
              normalizedName: normalizeKey(row.siteName),
              code: row.siteCode || null,
              normalizedCode: row.siteCode ? normalizeKey(row.siteCode) : null,
              city: row.city || null,
              normalizedCity: row.city ? normalizeKey(row.city) : null,
              address: row.siteAddress || row.fullAddress || null,
              supervisorName: row.supervisorName || null,
              importedSource: row.rawData,
              createdBy: user.id,
              updatedBy: user.id,
            })
            .returning({ id: projectSites.id });

          if (!insertedSite) throw new Error("Unable to create site during import");
          siteId = insertedSite.id;
          sitesCreated += 1;
          siteIdByKey.set(siteKey, siteId);
        }

        const [insertedCustomer] = await tx
          .insert(customers)
          .values({
            projectId,
            siteId,
            trBpNumber: row.trBpNumber,
            normalizedTrBpNumber: normalizeKey(row.trBpNumber),
            mobileNumber: row.mobileNumber || null,
            customerName: row.customerName,
            normalizedCustomerName: normalizeKey(row.customerName),
            fullAddress: row.fullAddress || null,
            city: row.city || null,
            connectionType: row.connectionType || null,
            houseType: row.houseType || null,
            scheme: row.scheme || null,
            plumberName: row.plumberName || null,
            supervisorName: row.supervisorName || null,
            giReportNumber: row.giReportNumber || null,
            gcReportNumber: row.gcReportNumber || null,
            conversionReportNumber: row.conversionReportNumber || null,
            status: mapCustomerStatus(row.customerStatus),
            survey: emptyToNull(row.survey),
            giMeasurements: emptyToNull(row.giMeasurements),
            valvesRegulators: emptyToNull(row.valvesRegulators),
            fittingsAccessories: emptyToNull(row.fittingsAccessories),
            lmcPipelineWork: emptyToNull(row.lmcPipelineWork),
            mdpeFittings: emptyToNull(row.mdpeFittings),
            commissioningConversion: emptyToNull(row.commissioningConversion),
            billingCompletion: emptyToNull(row.billingCompletion),
            customFields: emptyToNull(row.customFields),
            importedFields: row.rawData,
            createdBy: user.id,
            updatedBy: user.id,
          })
          .returning({ id: customers.id });

        if (!insertedCustomer) throw new Error("Unable to create customer during import");
        customersCreated += 1;

        await insertPipeRecords(tx, insertedCustomer.id, row.lmcPipeRecords, user.id);

        await tx
          .update(importRows)
          .set({ status: "imported", importedCustomerId: insertedCustomer.id })
          .where(and(eq(importRows.batchId, batchId), eq(importRows.rowNumber, row.rowNumber)));
      }

      await tx
        .update(importBatches)
        .set({
          status: "confirmed",
          confirmedBy: user.id,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(importBatches.id, batchId));

      return {
        batchId,
        projectsCreated,
        sitesCreated,
        customersCreated,
        rowsRejected,
      };
    });
  },
};

async function matchRows(rows: NormalizedImportRow[]) {
  const db = getDb();
  const [existingProjects, existingSites, existingCustomers] = await Promise.all([
    db.select().from(projects),
    db.select().from(projectSites),
    db.select().from(customers),
  ]);

  const projectsByCode = new Map<string, ExistingProject>();
  const projectsByNameCity = new Map<string, ExistingProject>();
  const sitesByProjectCode = new Map<string, ExistingSite>();
  const sitesByProjectName = new Map<string, ExistingSite>();
  const customersByTrBp = new Map<string, ExistingCustomer>();

  for (const project of existingProjects) {
    if (project.normalizedCode) projectsByCode.set(project.normalizedCode, project);
    projectsByNameCity.set(`${project.normalizedName}::${project.normalizedCity ?? ""}`, project);
  }

  for (const site of existingSites) {
    if (site.normalizedCode) sitesByProjectCode.set(`${site.projectId}::${site.normalizedCode}`, site);
    sitesByProjectName.set(`${site.projectId}::${site.normalizedName}`, site);
  }

  for (const customer of existingCustomers) {
    customersByTrBp.set(customer.normalizedTrBpNumber, customer);
  }

  return rows.map((row) => {
    const project = row.projectCode
      ? projectsByCode.get(normalizeKey(row.projectCode))
      : projectsByNameCity.get(`${normalizeKey(row.projectName)}::${normalizeKey(row.city)}`);

    if (project) {
      row.matchedProjectId = project.id;
      const site = row.siteCode
        ? sitesByProjectCode.get(`${project.id}::${normalizeKey(row.siteCode)}`)
        : sitesByProjectName.get(`${project.id}::${normalizeKey(row.siteName)}`);

      if (site) row.matchedSiteId = site.id;
    }

    const customer = row.trBpNumber ? customersByTrBp.get(normalizeKey(row.trBpNumber)) : null;
    if (customer) {
      row.existingCustomerId = customer.id;
      row.issues.push("Customer already exists with this BP/TR number");
    }

    return row;
  });
}

function buildSummary(fileName: string, rows: NormalizedImportRow[]): ImportPreviewSummary {
  const groups = new Map<string, ImportPreviewProjectGroup>();
  let duplicateCustomers = 0;

  for (const row of rows) {
    if (row.existingCustomerId) duplicateCustomers += 1;

    const projectKey = getProjectKey(row);
    const projectGroup = getOrCreateProjectGroup(groups, projectKey, row);
    const siteKey = getSiteKey(projectKey, row);
    const siteGroup = getOrCreateSiteGroup(projectGroup, siteKey, row);

    projectGroup.customerCount += 1;
    siteGroup.customerCount += 1;

    if (!row.issues.length) {
      projectGroup.validCustomerCount += 1;
      siteGroup.validCustomerCount += 1;
    } else {
      projectGroup.issueCount += 1;
      siteGroup.issueCount += 1;
    }
  }

  const projectGroups = Array.from(groups.values()).map((group) => ({
    ...group,
    siteCount: group.sites.length,
  }));
  const siteGroups = projectGroups.flatMap((group) => group.sites);

  return {
    fileName,
    totals: {
      rows: rows.length,
      validRows: rows.filter((row) => !row.issues.length && !row.warnings.length).length,
      warningRows: rows.filter((row) => !row.issues.length && row.warnings.length).length,
      invalidRows: rows.filter((row) => row.issues.length).length,
      projects: projectGroups.length,
      newProjects: projectGroups.filter((group) => group.status === "new").length,
      matchedProjects: projectGroups.filter((group) => group.status === "matched").length,
      sites: siteGroups.length,
      newSites: siteGroups.filter((group) => group.status === "new").length,
      matchedSites: siteGroups.filter((group) => group.status === "matched").length,
      customers: rows.length,
      duplicateCustomers,
    },
    groups: projectGroups,
    issues: rows
      .filter((row) => row.issues.length || row.warnings.length)
      .map((row) => ({
        rowNumber: row.rowNumber,
        customerName: row.customerName,
        trBpNumber: row.trBpNumber,
        projectName: row.projectName,
        siteName: row.siteName,
        issues: row.issues,
        warnings: row.warnings,
      })),
  };
}

function getOrCreateProjectGroup(
  groups: Map<string, ImportPreviewProjectGroup>,
  key: string,
  row: NormalizedImportRow,
) {
  const existing = groups.get(key);
  if (existing) return existing;

  const group: ImportPreviewProjectGroup = {
    key,
    projectName: row.projectName || "-",
    projectCode: row.projectCode,
    city: row.city,
    status: row.matchedProjectId ? "matched" : "new",
    matchedProjectId: row.matchedProjectId,
    siteCount: 0,
    customerCount: 0,
    validCustomerCount: 0,
    issueCount: 0,
    sites: [],
  };

  groups.set(key, group);
  return group;
}

function getOrCreateSiteGroup(
  projectGroup: ImportPreviewProjectGroup,
  key: string,
  row: NormalizedImportRow,
) {
  const existing = projectGroup.sites.find((site) => site.key === key);
  if (existing) return existing;

  const site: ImportPreviewSiteGroup = {
    key,
    siteName: row.siteName || "-",
    siteCode: row.siteCode,
    city: row.city,
    status: row.matchedSiteId ? "matched" : "new",
    matchedSiteId: row.matchedSiteId,
    customerCount: 0,
    validCustomerCount: 0,
    issueCount: 0,
  };

  projectGroup.sites.push(site);
  return site;
}

function getProjectKey(row: NormalizedImportRow) {
  return row.projectCode
    ? `code:${normalizeKey(row.projectCode)}`
    : `name:${normalizeKey(row.projectName)}::${normalizeKey(row.city)}`;
}

function getSiteKey(projectKey: string, row: NormalizedImportRow) {
  return row.siteCode
    ? `${projectKey}::code:${normalizeKey(row.siteCode)}`
    : `${projectKey}::name:${normalizeKey(row.siteName)}`;
}

function getRowStatus(row: NormalizedImportRow): "valid" | "warning" | "invalid" {
  if (row.issues.length) return "invalid";
  if (row.warnings.length) return "warning";
  return "valid";
}

function serializeNormalizedRow(row: NormalizedImportRow): Record<string, unknown> {
  return {
    ...row,
    rawData: row.rawData,
  };
}

function mapCustomerStatus(status: string): "active" | "inactive" | "on_hold" | "archived" {
  const normalized = normalizeKey(status);
  if (normalized === "inactive") return "inactive";
  if (normalized === "onhold" || normalized === "hold") return "on_hold";
  if (normalized === "archived") return "archived";
  return "active";
}

function emptyToNull<T extends Record<string, unknown>>(value: T) {
  return Object.keys(value).length ? value : null;
}

async function insertPipeRecords(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  customerId: string,
  pipeRecords: NormalizedLmcPipeRecord[],
  userId: string,
) {
  const validPipeRecords = pipeRecords.filter((record) =>
    Object.entries(record).some(([key, value]) => key !== "pipeSize" && normalizeText(value)),
  );

  if (!validPipeRecords.length) return;

  await tx.insert(customerLmcPipeRecords).values(
    validPipeRecords.map((record) => ({
      customerId,
      pipeSize: record.pipeSize,
      lengthMetres: record.lengthMetres || null,
      layingDate: parseDate(record.layingDate),
      testingDate: parseDate(record.testingDate),
      purgingDate: parseDate(record.purgingDate),
      layingStatus: mapPipeStatus(record.layingStatus),
      testingStatus: mapPipeStatus(record.testingStatus),
      purgingStatus: mapPipeStatus(record.purgingStatus),
      jointFittingDetails: record.jointFittingDetails || null,
      remarks: record.remarks || null,
      updatedBy: userId,
    })),
  );
}

function mapPipeStatus(status?: string): DbPipeStatus {
  const normalized = normalizeKey(status);
  if (normalized === "inprogress") return "in_progress";
  if (normalized === "layingcompleted" || normalized === "layingdone" || normalized === "completed") {
    return "laying_completed";
  }
  if (normalized === "testingpending") return "testing_pending";
  if (normalized === "testingcompleted" || normalized === "testingdone" || normalized === "passed") {
    return "testing_completed";
  }
  if (normalized === "purgingcompleted" || normalized === "purgingdone") return "purging_completed";
  if (normalized === "notrequired" || normalized === "na") return "not_required";
  if (normalized === "onhold" || normalized === "hold") return "on_hold";
  return "not_started";
}

function parseDate(value?: string) {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!match) return null;

  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}



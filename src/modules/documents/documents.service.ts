import { eq } from "drizzle-orm";
import { getDb } from "@db";
import { customerDocuments, customers, projectDocuments, projects } from "@db/schema";
import { buildPaginationMeta, parsePagination } from "@utils";
import type { DocumentListQuery, DocumentRow } from "./documents.types";

async function listProjectDocuments(): Promise<DocumentRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: projectDocuments.id,
      name: projectDocuments.fileName,
      category: projectDocuments.documentType,
      fileUrl: projectDocuments.fileUrl,
      status: projectDocuments.status,
      uploadedAt: projectDocuments.uploadedAt,
      relatedName: projects.name,
    })
    .from(projectDocuments)
    .innerJoin(projects, eq(projectDocuments.projectId, projects.id));

  return rows.map((row) => ({ ...row, module: "Projects" as const }));
}

async function listCustomerDocuments(): Promise<DocumentRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: customerDocuments.id,
      name: customerDocuments.fileName,
      category: customerDocuments.category,
      documentType: customerDocuments.documentType,
      fileUrl: customerDocuments.fileUrl,
      status: customerDocuments.status,
      uploadedAt: customerDocuments.uploadedAt,
      relatedName: customers.customerName,
    })
    .from(customerDocuments)
    .innerJoin(customers, eq(customerDocuments.customerId, customers.id));

  return rows.map((row) => ({
    ...row,
    category: row.category ?? row.documentType,
    module: "Customers" as const,
  }));
}

export const documentsService = {
  async list(query: DocumentListQuery) {
    const [projectDocs, customerDocs] = await Promise.all([listProjectDocuments(), listCustomerDocuments()]);
    let merged: DocumentRow[] = [...projectDocs, ...customerDocs];

    if (query.module) {
      merged = merged.filter((row) => row.module === query.module);
    }

    if (query.search) {
      const term = query.search.toLowerCase();
      merged = merged.filter(
        (row) =>
          row.name.toLowerCase().includes(term) ||
          row.relatedName.toLowerCase().includes(term) ||
          row.category.toLowerCase().includes(term),
      );
    }

    merged.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    const { page, limit, offset } = parsePagination(query);
    const total = merged.length;
    const rows = merged.slice(offset, offset + limit);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },
};

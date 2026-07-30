import { and, count, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@db";
import { projectDocuments, projectSites, projects } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import type {
  CreateProjectBody,
  CreateProjectDocumentBody,
  CreateProjectSiteBody,
  ProjectListQuery,
  UpdateProjectBody,
  UpdateProjectSiteBody,
} from "./projects.types";

async function getProjectOrThrow(id: string) {
  const db = getDb();
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: {
      sites: true,
      documents: true,
    },
  });

  if (!project) throw new Error("Project not found");
  return project;
}

async function getSiteOrThrow(projectId: string, siteId: string) {
  const db = getDb();
  const [site] = await db
    .select()
    .from(projectSites)
    .where(and(eq(projectSites.id, siteId), eq(projectSites.projectId, projectId)))
    .limit(1);

  if (!site) throw new Error("Project site not found");
  return site;
}

export const projectsService = {
  async list(query: ProjectListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
      query.status ? eq(projects.status, query.status) : undefined,
      query.city ? eq(projects.normalizedCity, normalizeKey(query.city)) : undefined,
      searchPattern
        ? or(ilike(projects.name, searchPattern), ilike(projects.code, searchPattern))
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db.query.projects.findMany({
        where,
        limit,
        offset,
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      }),
      db.select({ value: count() }).from(projects).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async get(id: string) {
    return getProjectOrThrow(id);
  },

  async create(input: CreateProjectBody, userId: string) {
    const db = getDb();
    const [project] = await db
      .insert(projects)
      .values({
        name: input.name,
        normalizedName: normalizeKey(input.name),
        code: input.code || null,
        normalizedCode: input.code ? normalizeKey(input.code) : null,
        city: input.city || null,
        normalizedCity: input.city ? normalizeKey(input.city) : null,
        client: input.client || null,
        consultant: input.consultant || null,
        contractor: input.contractor || null,
        projectType: input.projectType || null,
        areaLocation: input.areaLocation || null,
        description: input.description || null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        plannedEndDate: input.plannedEndDate ? new Date(input.plannedEndDate) : null,
        status: input.status ?? "active",
        contractValue: input.contractValue?.toString(),
        projectManager: input.projectManager || null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!project) throw new Error("Unable to create project");
    return project;
  },

  async update(id: string, input: UpdateProjectBody, userId: string) {
    const db = getDb();
    await getProjectOrThrow(id);

    const patch = cleanObject({
      name: input.name,
      code: input.code,
      city: input.city,
      client: input.client,
      consultant: input.consultant,
      contractor: input.contractor,
      projectType: input.projectType,
      areaLocation: input.areaLocation,
      description: input.description,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      plannedEndDate: input.plannedEndDate ? new Date(input.plannedEndDate) : undefined,
      status: input.status,
      contractValue: input.contractValue?.toString(),
      projectManager: input.projectManager,
    });

    const [project] = await db
      .update(projects)
      .set({
        ...patch,
        ...(input.name ? { normalizedName: normalizeKey(input.name) } : {}),
        ...(input.code ? { normalizedCode: normalizeKey(input.code) } : {}),
        ...(input.city ? { normalizedCity: normalizeKey(input.city) } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    if (!project) throw new Error("Unable to update project");
    return project;
  },

  async listSites(projectId: string) {
    await getProjectOrThrow(projectId);
    const db = getDb();
    return db
      .select()
      .from(projectSites)
      .where(eq(projectSites.projectId, projectId))
      .orderBy(projectSites.name);
  },

  async createSite(projectId: string, input: CreateProjectSiteBody, userId: string) {
    await getProjectOrThrow(projectId);
    const db = getDb();

    const [site] = await db
      .insert(projectSites)
      .values({
        projectId,
        name: input.name,
        normalizedName: normalizeKey(input.name),
        code: input.code || null,
        normalizedCode: input.code ? normalizeKey(input.code) : null,
        city: input.city || null,
        normalizedCity: input.city ? normalizeKey(input.city) : null,
        address: input.address || null,
        latitude: input.latitude?.toString(),
        longitude: input.longitude?.toString(),
        plannedConnections: input.plannedConnections,
        supervisorName: input.supervisorName || null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        remarks: input.remarks || null,
        status: input.status ?? "active",
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!site) throw new Error("Unable to create project site");
    return site;
  },

  async updateSite(projectId: string, siteId: string, input: UpdateProjectSiteBody, userId: string) {
    await getSiteOrThrow(projectId, siteId);
    const db = getDb();

    const patch = cleanObject({
      name: input.name,
      code: input.code,
      city: input.city,
      address: input.address,
      latitude: input.latitude?.toString(),
      longitude: input.longitude?.toString(),
      plannedConnections: input.plannedConnections,
      supervisorName: input.supervisorName,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      remarks: input.remarks,
      status: input.status,
    });

    const [site] = await db
      .update(projectSites)
      .set({
        ...patch,
        ...(input.name ? { normalizedName: normalizeKey(input.name) } : {}),
        ...(input.code ? { normalizedCode: normalizeKey(input.code) } : {}),
        ...(input.city ? { normalizedCity: normalizeKey(input.city) } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projectSites.id, siteId))
      .returning();

    if (!site) throw new Error("Unable to update project site");
    return site;
  },

  async listDocuments(projectId: string) {
    await getProjectOrThrow(projectId);
    const db = getDb();
    return db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.projectId, projectId))
      .orderBy(projectDocuments.uploadedAt);
  },

  async createDocument(projectId: string, input: CreateProjectDocumentBody, userId: string) {
    await getProjectOrThrow(projectId);

    if (input.siteId) {
      await getSiteOrThrow(projectId, input.siteId);
    }

    const db = getDb();
    const [document] = await db
      .insert(projectDocuments)
      .values({
        projectId,
        siteId: input.siteId || null,
        documentType: input.documentType,
        referenceNumber: input.referenceNumber || null,
        documentDate: input.documentDate ? new Date(input.documentDate) : null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        amount: input.amount?.toString(),
        fileUrl: input.fileUrl,
        fileName: input.fileName,
        mimeType: input.mimeType || null,
        status: input.status ?? "submitted",
        remarks: input.remarks || null,
        uploadedBy: userId,
      })
      .returning();

    if (!document) throw new Error("Unable to create project document");
    return document;
  },
};

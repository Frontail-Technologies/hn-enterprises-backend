import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, projects } from "@db/schema";
import { customerStatCondition } from "@modules/customers/customer-completion";
import { accessibleProjectIds, inProjects } from "@modules/projects/project-access.service";
import type { AuthTokenPayload } from "@types";

/** Work stages shown on the map, in work order (keys of the dashboard stat conditions). */
export const MAP_STAGE_KEYS = [
  "survey-done",
  "gi-done",
  "gc-done",
  "laying-done",
  "flushing-testing-done",
  "valve-chamber-done",
  "pre-commissioning-done",
  "commissioning",
  "conversion-done",
  "connection-done",
  "pole-marker-done",
  "route-marker-done",
  "site-expenses-done",
  "jmr-done",
  "gi-bill-done",
  "gc-bill-done",
  "conversion-bill-done",
] as const;

export type CustomerMapPoint = {
  id: string;
  name: string;
  bpNo: string;
  projectId: string | null;
  projectName: string;
  lat: number;
  lng: number;
  /** Stage keys this customer has completed. */
  done: string[];
};

// Survey stores the position as latitude / longitude, or as "lat, lng" text (mobile "Capture GPS").
const LAT = sql<string | null>`coalesce(nullif(trim(${customers.survey}->>'latitude'), ''), nullif(trim(split_part(${customers.survey}->>'gpsLocation', ',', 1)), ''))`;
const LNG = sql<string | null>`coalesce(nullif(trim(${customers.survey}->>'longitude'), ''), nullif(trim(split_part(${customers.survey}->>'gpsLocation', ',', 2)), ''))`;

// Every completed stage as a text array, e.g. {survey-done,gi-done}.
const doneStages = () =>
  sql<string[]>`array_remove(ARRAY[${sql.join(
    MAP_STAGE_KEYS.map((key) => sql`CASE WHEN ${customerStatCondition(key) ?? sql`false`} THEN ${key} END`),
    sql`, `,
  )}]::text[], NULL)`;

/**
 * Customers that have a location (only those: no location = no pin), with
 * the stages they have completed. Supervisors only see their own projects.
 */
export async function getCustomerMapPoints(projectId: string | undefined, currentUser: AuthTokenPayload | null) {
  const projectIds = await accessibleProjectIds(currentUser);
  const rows = await getDb()
    .select({
      id: customers.id,
      name: customers.customerName,
      bpNo: customers.trBpNumber,
      projectId: customers.projectId,
      projectName: projects.name,
      lat: LAT,
      lng: LNG,
      done: doneStages(),
    })
    .from(customers)
    .leftJoin(projects, eq(customers.projectId, projects.id))
    .where(
      and(
        sql`${LAT} IS NOT NULL AND ${LNG} IS NOT NULL`,
        projectId && projectId !== "all" ? eq(customers.projectId, projectId) : undefined,
        inProjects(customers.projectId, projectIds),
      ),
    );

  const points: CustomerMapPoint[] = [];
  for (const row of rows) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    // Skip typos and 0,0 placeholders.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) continue;
    points.push({
      id: row.id,
      name: row.name ?? "",
      bpNo: row.bpNo ?? "",
      projectId: row.projectId,
      projectName: row.projectName ?? "",
      lat,
      lng,
      done: row.done ?? [],
    });
  }
  return points;
}

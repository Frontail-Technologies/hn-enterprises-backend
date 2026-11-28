import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, projects } from "@db/schema";
import { customerStatCondition } from "@modules/customers/customer-completion";
import { accessibleProjectIds, inProjects } from "@modules/projects/project-access.service";
import type { AuthTokenPayload } from "@types";

/** Furthest stage a customer has reached, for the pin colour. */
export type MapStage = "conversion" | "commissioning" | "gi" | "survey" | "none";

export type CustomerMapPoint = {
  id: string;
  name: string;
  bpNo: string;
  projectId: string | null;
  projectName: string;
  lat: number;
  lng: number;
  stage: MapStage;
};

// Survey stores the position as latitude / longitude, or as "lat, lng" text (mobile "Capture GPS").
const LAT = sql<string | null>`coalesce(nullif(trim(${customers.survey}->>'latitude'), ''), nullif(trim(split_part(${customers.survey}->>'gpsLocation', ',', 1)), ''))`;
const LNG = sql<string | null>`coalesce(nullif(trim(${customers.survey}->>'longitude'), ''), nullif(trim(split_part(${customers.survey}->>'gpsLocation', ',', 2)), ''))`;

const stageCase = () => {
  const when = (key: string, stage: MapStage) => sql`WHEN ${customerStatCondition(key) ?? sql`false`} THEN ${stage}`;
  return sql<MapStage>`CASE ${when("conversion-done", "conversion")} ${when("commissioning", "commissioning")} ${when("gi-done", "gi")} ${when("survey-done", "survey")} ELSE 'none' END`;
};

/**
 * Customers that have a location (only those: no location = no pin), with
 * the stage they reached. Supervisors only see their own projects.
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
      stage: stageCase(),
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
      stage: row.stage,
    });
  }
  return points;
}

import { eq } from "drizzle-orm";
import { getDb } from "@db";
import { reportTemplateOverrides } from "@db/schema";

export type ReportTemplateOverrideInput = {
  title?: string;
  category?: string;
  description?: string;
  fieldLabels?: Record<string, string>;
};

const clean = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Keep only non-empty labels; an empty label means "use the template's default". */
function cleanLabels(labels: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(labels ?? {})
      .map(([key, label]) => [key, label.trim()] as const)
      .filter(([key, label]) => key && label),
  );
}

export const reportTemplatesService = {
  async listOverrides() {
    const db = getDb();
    return db.select().from(reportTemplateOverrides);
  },

  /** Create or replace the saved edits for one template. */
  async saveOverride(templateId: string, input: ReportTemplateOverrideInput, userId: string) {
    const db = getDb();
    const values = {
      title: clean(input.title),
      category: clean(input.category),
      description: clean(input.description),
      fieldLabels: cleanLabels(input.fieldLabels),
      updatedBy: userId,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(reportTemplateOverrides)
      .values({ templateId, ...values })
      .onConflictDoUpdate({ target: reportTemplateOverrides.templateId, set: values })
      .returning();
    return row;
  },

  /** Remove saved edits so the template goes back to its defaults. */
  async resetOverride(templateId: string) {
    const db = getDb();
    await db.delete(reportTemplateOverrides).where(eq(reportTemplateOverrides.templateId, templateId));
    return { templateId };
  },
};

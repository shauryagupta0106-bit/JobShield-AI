import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const jobShieldSourceType = pgEnum("jobshield_source_type", [
  "url",
  "text",
  "pdf",
]);

export const jobShieldRiskLevel = pgEnum("jobshield_risk_level", [
  "lower",
  "moderate",
  "elevated",
  "insufficient_evidence",
]);

export const jobShieldVerificationStatus = pgEnum(
  "jobshield_verification_status",
  [
    "official_match",
    "partial_match",
    "no_match",
    "unable_to_verify",
    "material_discrepancy",
  ],
);

export const jobShieldAnalysesTable = pgTable(
  "jobshield_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionHash: text("session_hash").notNull(),
    sourceType: jobShieldSourceType("source_type").notNull(),
    sourceLabel: varchar("source_label", { length: 180 }).notNull(),
    companyName: varchar("company_name", { length: 120 }),
    jobTitle: varchar("job_title", { length: 120 }),
    overallAssessment: varchar("overall_assessment", { length: 64 })
      .notNull()
      .default("insufficient_evidence"),
    assessmentRationale: text("assessment_rationale"),
    riskScore: integer("risk_score").default(0),
    riskLevel: jobShieldRiskLevel("risk_level").default("insufficient_evidence"),
    verificationStatus: jobShieldVerificationStatus(
      "verification_status",
    ).notNull(),
    findingCount: integer("finding_count").notNull().default(0),
    report: jsonb("report").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("jobshield_analyses_session_created_idx").on(
      table.sessionHash,
      table.createdAt,
    ),
    index("jobshield_analyses_expiry_idx").on(table.expiresAt),
  ],
);

export type JobShieldAnalysisRow = typeof jobShieldAnalysesTable.$inferSelect;
export type InsertJobShieldAnalysis =
  typeof jobShieldAnalysesTable.$inferInsert;

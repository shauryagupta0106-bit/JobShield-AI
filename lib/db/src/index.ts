import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { existsSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const { Pool } = pg;

// Attempt to load .env if DATABASE_URL is not yet set
if (!process.env.DATABASE_URL) {
  for (const envPath of [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(import.meta.dirname, "../../../.env"),
  ]) {
    if (existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
        break;
      } catch {
        // ignore load error
      }
    }
  }
}

const rawDbUrl = process.env.DATABASE_URL?.trim();

if (!rawDbUrl) {
  throw new Error(
    "DATABASE_URL is not set. Please provide a valid PostgreSQL connection string in your .env file (e.g., DATABASE_URL=postgresql://postgres:password@localhost:5432/jobshield).",
  );
}

if (/^https?:\/\//i.test(rawDbUrl)) {
  throw new Error(
    "Invalid DATABASE_URL: Expected a PostgreSQL connection string starting with 'postgresql://' or 'postgres://', but found an HTTP/HTTPS URL. If using Supabase, obtain the Postgres connection URI from Project Settings -> Database -> Connection String (URI), not the REST project URL.",
  );
}

const isHosted = /supabase|neon|render|railway|pooler|aws|azure|gcp/i.test(rawDbUrl);

export const pool = new Pool({
  connectionString: rawDbUrl,
  ssl: isHosted ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

export * from "./schema";

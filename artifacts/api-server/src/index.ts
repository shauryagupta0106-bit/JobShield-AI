import { existsSync } from "node:fs";
import path from "node:path";

// Attempt to load .env before importing application components
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
      // ignore load errors
    }
  }
}

// Validate required SESSION_SECRET before starting
if (!process.env.SESSION_SECRET?.trim()) {
  throw new Error(
    "SESSION_SECRET is not set. Please set SESSION_SECRET to a secure secret in your .env file (e.g., SESSION_SECRET=your-random-secret-key-at-least-32-chars).",
  );
}

const rawPort = process.env.PORT;
const port = rawPort && !Number.isNaN(Number(rawPort)) && Number(rawPort) > 0 ? Number(rawPort) : 5000;

import app from "./app";
import { logger } from "./lib/logger";

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info(
    {
      port,
      tinyFishConfigured: Boolean(process.env.TINYFISH_API_KEY?.trim()),
      groqConfigured: Boolean(process.env.GROQ_API_KEY?.trim()),
      databaseConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    },
    "JobShield API server listening",
  );
});

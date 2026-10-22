import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

async function checkDatabase(): Promise<"connected" | "disconnected" | "not_configured"> {
  if (!process.env.DATABASE_URL?.trim()) {
    return "not_configured";
  }

  try {
    const probe = pool.query("SELECT 1");
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database probe timeout")), 1500),
    );
    await Promise.race([probe, timeout]);
    return "connected";
  } catch {
    return "disconnected";
  }
}

const healthHandler = async (_req: unknown, res: { json: (data: unknown) => void }) => {
  HealthCheckResponse.parse({ status: "ok" });
  const dbStatus = await checkDatabase();

  res.json({
    status: "ok",
    server: "healthy",
    database: dbStatus,
    services: {
      tinyfish: Boolean(process.env.TINYFISH_API_KEY?.trim()),
      groq: Boolean(process.env.GROQ_API_KEY?.trim()),
    },
    timestamp: new Date().toISOString(),
  });
};

router.get("/healthz", healthHandler);
router.get("/health", healthHandler);

export default router;

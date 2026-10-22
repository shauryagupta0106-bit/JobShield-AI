import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";

const rootDir = path.resolve(import.meta.dirname, "..");

// Load .env if present
const envPath = path.join(rootDir, ".env");
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
    console.log("\x1b[34m[jobshield]\x1b[0m Loaded environment variables from .env");
  } catch (err) {
    console.warn("\x1b[33m[jobshield]\x1b[0m Warning: Failed to parse .env file:", err.message);
  }
} else {
  console.warn("\x1b[33m[jobshield]\x1b[0m No .env file found. Copy .env.example to .env to configure credentials.");
}

// Check if a port is in use
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

async function checkPortConflict(port, name) {
  const free = await isPortAvailable(port);
  if (!free) {
    console.warn(
      `\x1b[31m[jobshield]\x1b[0m Warning: Port ${port} is currently in use. ` +
        `If a previous instance of ${name} is still running, please stop it first, ` +
        `or kill it with: Get-NetTCPConnection -LocalPort ${port} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
    );
  }
  return free;
}

function prefixStream(stream, prefix, color) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(`${color}${prefix}\x1b[0m ${line}`);
      }
    }
  });
}

function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // already stopped
    }
  }
}

async function start() {
  console.log("\x1b[36m====================================================\x1b[0m");
  console.log("\x1b[36m        JobShield AI - Unified Dev Runner          \x1b[0m");
  console.log("\x1b[36m====================================================\x1b[0m");
  console.log("  API Server:  \x1b[32mhttp://localhost:5000\x1b[0m (Health: \x1b[34mhttp://localhost:5000/api/health\x1b[0m)");
  console.log("  Web UI:      \x1b[32mhttp://localhost:3000\x1b[0m");
  console.log("  Proxy:       /api -> http://localhost:5000");
  console.log("\x1b[36m----------------------------------------------------\x1b[0m\n");

  await checkPortConflict(5000, "API server");
  await checkPortConflict(3000, "Frontend web app");

  const apiEnv = {
    ...process.env,
    PORT: "5000",
    NODE_ENV: "development",
  };

  const webEnv = {
    ...process.env,
    VITE_PORT: "3000",
    API_SERVER_URL: "http://localhost:5000",
    NODE_ENV: "development",
  };

  const apiProcess = spawn("pnpm", ["--filter", "@workspace/api-server", "run", "dev"], {
    cwd: rootDir,
    env: apiEnv,
    shell: true,
  });

  prefixStream(apiProcess.stdout, "[api]", "\x1b[36m");
  prefixStream(apiProcess.stderr, "[api-err]", "\x1b[31m");

  const webProcess = spawn("pnpm", ["--filter", "@workspace/jobshield-ai", "run", "dev"], {
    cwd: rootDir,
    env: webEnv,
    shell: true,
  });

  prefixStream(webProcess.stdout, "[web]", "\x1b[32m");
  prefixStream(webProcess.stderr, "[web-err]", "\x1b[33m");

  let exiting = false;
  function shutdown(code = 0) {
    if (exiting) return;
    exiting = true;
    console.log("\n\x1b[34m[jobshield]\x1b[0m Shutting down all services...");
    killProcessTree(apiProcess);
    killProcessTree(webProcess);
    console.log("\x1b[34m[jobshield]\x1b[0m All services stopped. Goodbye!");
    process.exit(code);
  }

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  process.on("exit", () => shutdown(0));

  apiProcess.on("close", (code) => {
    if (!exiting && code !== 0) {
      console.error(`\x1b[31m[api]\x1b[0m API process exited unexpectedly with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  webProcess.on("close", (code) => {
    if (!exiting && code !== 0) {
      console.error(`\x1b[31m[web]\x1b[0m Web process exited unexpectedly with code ${code}`);
      shutdown(code ?? 1);
    }
  });
}

start().catch((err) => {
  console.error("\x1b[31m[jobshield]\x1b[0m Fatal startup error:", err);
  process.exit(1);
});

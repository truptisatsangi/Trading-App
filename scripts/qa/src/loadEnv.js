import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

function tryLoad(envPath) {
  try {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function loadEnv() {
  const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  // Prefer local QA env if present.
  if (tryLoad(path.join(here, ".env"))) return;

  // Next, load QA example defaults (non-secret).
  tryLoad(path.join(here, ".env.example"));

  // Finally, attempt to load service envs if they exist (developer convenience).
  // These may contain secrets; we only read them locally.
  const repoRoot = path.resolve(here, "../..");
  tryLoad(path.join(repoRoot, "apps/derivation-service/.env"));
  tryLoad(path.join(repoRoot, "apps/indexer-service/.env"));
}


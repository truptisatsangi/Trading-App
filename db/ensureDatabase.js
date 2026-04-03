import { Client } from "pg";

/**
 * Ensures the target database from DB_URL exists. Connects to the maintenance DB `postgres`,
 * checks pg_database, and runs CREATE DATABASE only when missing. Safe on every startup.
 *
 * @param {string} connectionString - Full Postgres URL including database name (e.g. .../token_db)
 * @param {string} [logPrefix="[db]"] - Log line prefix
 */
export async function ensureDatabaseExists(connectionString, logPrefix = "[db]") {
  if (!connectionString || typeof connectionString !== "string") {
    throw new Error(`${logPrefix} DB_URL is required`);
  }

  let dbName;
  let adminUrlString;
  try {
    const normalized = connectionString.trim().replace(/^postgresql:/i, "postgres:");
    const u = new URL(normalized);
    dbName = decodeURIComponent((u.pathname || "/").replace(/^\//, "") || "");
    u.pathname = "/postgres";
    adminUrlString = u.toString();
  } catch {
    throw new Error(`${logPrefix} could not parse DB_URL`);
  }

  if (!dbName || dbName === "postgres") {
    return;
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
    throw new Error(
      `${logPrefix} database name must be alphanumeric/underscore only, got: ${dbName}`
    );
  }

  const admin = new Client({ connectionString: adminUrlString });
  await admin.connect();
  try {
    const { rowCount } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );
    if (rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`${logPrefix} created database "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}

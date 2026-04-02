import { Client } from "pg";

export function parseDbUrl(dbUrl) {
  const url = new URL(dbUrl);
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: url.pathname.replace(/^\//, "")
  };
}

export async function connect(dbUrl) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  return client;
}

export function buildDbUrlLike(dbUrl, databaseName) {
  const url = new URL(dbUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export async function withClient(dbUrl, fn) {
  const client = await connect(dbUrl);
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}


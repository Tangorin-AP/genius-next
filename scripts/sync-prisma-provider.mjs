import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const SCHEMA_PATH = path.join(PROJECT_ROOT, 'prisma', 'schema.prisma');
const DEFAULT_PROVIDER = 'sqlite';
const ALLOWED_PROVIDERS = new Set(['sqlite', 'postgresql']);

const ENV_FILES = [
  '.env.local',
  `.env.${process.env.NODE_ENV ?? 'development'}`,
  '.env',
  path.join('prisma', '.env'),
];

function parseEnv(content) {
  const entries = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function loadEnvFiles() {
  for (const relativePath of ENV_FILES) {
    if (!relativePath) continue;
    const absolutePath = path.join(PROJECT_ROOT, relativePath);
    if (!fsSync.existsSync(absolutePath)) continue;
    try {
      const content = fsSync.readFileSync(absolutePath, 'utf8');
      const parsed = parseEnv(content);
      let applied = false;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof process.env[key] === 'string' && process.env[key] !== '') continue;
        process.env[key] = value;
        applied = true;
      }
      if (applied) {
        console.log(`Loaded environment values from ${relativePath}`);
      }
    } catch (error) {
      console.warn(`Could not load ${relativePath}:`, error instanceof Error ? error.message : error);
    }
  }
}

function inferProviderFromUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;

  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) {
    return 'postgresql';
  }

  if (trimmed.startsWith('file:')) {
    return 'sqlite';
  }

  return undefined;
}

function resolveProvider() {
  const value = process.env.DATABASE_PROVIDER;
  if (value && value.trim() !== '') {
    const normalized = value.trim().toLowerCase();
    if (!ALLOWED_PROVIDERS.has(normalized)) {
      const allowedList = Array.from(ALLOWED_PROVIDERS).join(', ');
      throw new Error(
        `Unsupported DATABASE_PROVIDER "${value}". Expected one of: ${allowedList}.`
      );
    }
    return normalized;
  }

  const inferred = inferProviderFromUrl();
  if (inferred) {
    console.log(
      `DATABASE_PROVIDER not set. Inferred provider "${inferred}" from DATABASE_URL.`
    );
    return inferred;
  }

  return DEFAULT_PROVIDER;
}

async function syncProvider() {
  loadEnvFiles();
  const provider = resolveProvider();
  const schema = await fs.readFile(SCHEMA_PATH, 'utf8');

  const datasourceRegex = /(datasource\s+\w+\s*\{[\s\S]*?\})/m;
  const match = schema.match(datasourceRegex);

  if (!match) {
    throw new Error(
      `Could not find a datasource block in ${path.relative(PROJECT_ROOT, SCHEMA_PATH)}.`
    );
  }

  const datasourceBlock = match[0];
  const providerLineRegex = /(provider\s*=\s*")[^"]+(\")/;

  if (!providerLineRegex.test(datasourceBlock)) {
    throw new Error(
      `Could not find a provider assignment inside the datasource block of ${path.relative(PROJECT_ROOT, SCHEMA_PATH)}.`
    );
  }

  const updatedDatasourceBlock = datasourceBlock.replace(providerLineRegex, `$1${provider}$2`);

  if (updatedDatasourceBlock === datasourceBlock) {
    console.log(`Prisma provider already set to "${provider}".`);
    return;
  }

  const updatedSchema = schema.replace(datasourceBlock, updatedDatasourceBlock);
  await fs.writeFile(SCHEMA_PATH, updatedSchema, 'utf8');
  console.log(`Updated Prisma provider to "${provider}".`);
}

syncProvider().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const SCHEMA_PATH = path.join(PROJECT_ROOT, 'prisma', 'schema.prisma');
const DEFAULT_PROVIDER = 'sqlite';
const ALLOWED_PROVIDERS = new Set(['sqlite', 'postgresql']);

function inferProviderFromUrl(url) {
  if (!url) return null;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('file:')) return 'sqlite';
  if (trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) {
    return 'postgresql';
  }
  return null;
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

  const inferred = inferProviderFromUrl(process.env.DATABASE_URL);
  if (inferred) {
    return inferred;
  }

  return DEFAULT_PROVIDER;
}

async function syncProvider() {
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

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const schemaPath = path.join(projectRoot, 'prisma', 'schema.prisma');
const migrationLockPath = path.join(projectRoot, 'prisma', 'migrations', 'migration_lock.toml');

async function readEnvFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    return parseEnv(content);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function parseEnv(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const candidates = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, 'prisma', '.env'),
  ];

  for (const candidate of candidates) {
    const env = await readEnvFile(candidate);
    if (env.DATABASE_URL) {
      return env.DATABASE_URL;
    }
  }

  return '';
}

function inferProvider(databaseUrl) {
  if (!databaseUrl) {
    return 'postgresql';
  }

  if (/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    return 'postgresql';
  }

  if (databaseUrl.startsWith('file:')) {
    return 'sqlite';
  }

  if (/^mysql:\/\//i.test(databaseUrl)) {
    return 'mysql';
  }

  if (/^sqlserver:\/\//i.test(databaseUrl)) {
    return 'sqlserver';
  }

  if (/^mongodb:\/\//i.test(databaseUrl)) {
    return 'mongodb';
  }

  return 'postgresql';
}

async function updateFile(pathToFile, replacer) {
  const current = await readFile(pathToFile, 'utf8');
  const updated = replacer(current);
  if (updated !== current) {
    await writeFile(pathToFile, updated, 'utf8');
  }
}

function replaceProviderLine(content, provider) {
  const pattern = /(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*")(.*?)(")/;
  if (!pattern.test(content)) {
    throw new Error(`Could not find datasource provider in ${path.basename(schemaPath)}`);
  }
  return content.replace(pattern, (match, prefix, _oldProvider, suffix) => `${prefix}${provider}${suffix}`);
}

const databaseUrl = await resolveDatabaseUrl();
const provider = inferProvider(databaseUrl);

await updateFile(schemaPath, (content) => replaceProviderLine(content, provider));

await updateFile(migrationLockPath, (content) => {
  const pattern = /(provider\s*=\s*")(.*?)(")/;
  if (!pattern.test(content)) {
    return content;
  }
  return content.replace(pattern, `$1${provider}$3`);
});

if (process.env.VERBOSE) {
  console.log(`Prisma datasource provider synced to "${provider}" based on DATABASE_URL.`);
}

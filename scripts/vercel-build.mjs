import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function run(command, args, { cwd = PROJECT_ROOT } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: false,
    });

    child.on('close', (code, signal) => {
      resolve({
        code,
        signal,
        ok: code === 0 && signal === null,
      });
    });
  });
}

async function main() {
  const syncScript = path.join(__dirname, 'sync-prisma-provider.mjs');
  const sync = await run(process.execPath, [syncScript]);
  if (!sync.ok) {
    process.exit(sync.code ?? 1);
  }

  const hasDatabaseUrl = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim() !== '';
  if (hasDatabaseUrl) {
    const migrate = await run('npx', [
      'prisma',
      'migrate',
      'deploy',
      '--schema=./prisma/schema.prisma',
    ]);

    if (!migrate.ok) {
      console.warn('⚠️  Prisma migrate deploy failed; continuing without applying migrations.');
      console.warn('    Run `npx prisma migrate deploy --schema=./prisma/schema.prisma` manually to reconcile your database.');
    }
  } else {
    console.log('DATABASE_URL not set; skipping Prisma migrate deploy.');
  }

  const build = await run('npx', ['next', 'build']);
  if (!build.ok) {
    process.exit(build.code ?? 1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

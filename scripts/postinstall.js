const { spawnSync } = require('child_process');

function hasDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (typeof value !== 'string') return false;
  return value.trim() !== '';
}

if (!hasDatabaseUrl()) {
  console.log('Skipping `prisma generate` because DATABASE_URL is not set.');
  process.exit(0);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npxCommand, ['prisma', 'generate'], { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('`prisma generate` failed.');
  process.exit(result.status ?? 1);
}

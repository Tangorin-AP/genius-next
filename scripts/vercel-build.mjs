
// scripts/vercel-build.mjs
// Minimal Vercel build runner for Next.js + Prisma (Neon Postgres).
// No dependency on scripts/sync-prisma-provider.mjs.

import { execSync } from "node:child_process";

const run = (cmd) => {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit" });
};

const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const isProd = env === "production";

run("node ./scripts/sync-prisma-provider.mjs");

if (isProd) {
  console.log("Vercel build: production → running Prisma migrate deploy.");
  run("npx prisma migrate deploy --schema=./prisma/schema.prisma");
} else {
  console.log(`Vercel build: ${env} → skipping 'prisma migrate deploy'.`);
}

run("npx prisma generate");
run("next build");

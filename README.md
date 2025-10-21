
# Genius (Next.js) — Clean-room reimplementation

This project mirrors the **Genius** Mac app's learning flow with a modern web stack.

> **Why this?** You asked for a DB-backed, production-ready web version that preserves Genius’ *nuance* in the quiz UX. The code here keeps the same *concepts*:
> - **Directed associations** per card (A→B and B→A), each with its **own score** and **due date**.
> - **Scheduling**: Right ⇒ `score++` ⇒ next due at **5^score seconds**. Wrong ⇒ **score=0** ⇒ schedule using same rule.
> - **First-time Learn** vs **Review** flows in the quiz window.
> - **Exact vs Similar** checking: auto-accept only when equal *ignoring case/punctuation/extra spaces*; otherwise show **diff** and ask *“Were you correct?”*.

It’s implemented without copying Genius’ Objective‑C (GPL). If you decide to **reuse any GPL code** directly, the web app should become GPL‑compatible too.

---

## Stack

- Next.js 14 (App Router, Server Actions)
- TypeScript
- Prisma
- PostgreSQL (Neon/Supabase or local)
- Minimal CSS (Aqua‑like)

## Quick start (local)

```bash
# 1) Install deps
npm i

# 2) Configure your Postgres connection
cp prisma/.env.example prisma/.env # then edit with your credentials

# 3) Migrate + Seed
npm run migrate
npm run seed

# 4) Run
npm run dev
```

Now open http://localhost:3000

> **Note:** The `postinstall` step automatically adjusts Prisma's datasource provider based on your `DATABASE_URL`, so as long as that variable points at your Postgres instance the Prisma schema stays in sync.

## Deploy (Vercel + Neon/Postgres)

1. **Create a Neon or Supabase Postgres** database. Copy the connection string (e.g. `postgresql://...`).
2. In Vercel → Project → **Environment Variables**:
   - `DATABASE_URL=<your-postgres-connection-string>`
   - Optional but recommended: `DATABASE_PROVIDER=postgresql`
   - During install the build will run `scripts/sync-prisma-provider.mjs`, which rewrites `prisma/schema.prisma` so Prisma uses the matching datasource provider. If `DATABASE_PROVIDER` is not set, the script will infer the correct provider from `DATABASE_URL` (e.g. Postgres URLs automatically flip the schema to `postgresql`).
3. Add a build hook or first deploy; then run migrations (from your local machine):
   ```bash
   npx prisma migrate deploy --schema=./prisma/schema.prisma
   ```

## Where the “Genius behavior” lives

- `src/lib/engine.ts`
  - `nextDueFromScore(score)` → **5^score** seconds
  - `chooseAssociations(opts)` → returns a set of due items first, then pool selection
  - `mark(id, RIGHT|WRONG|SKIP)` → updates score/due/firstTime

- `src/components/StudyModal.tsx`
  - **First-time items** show answer with single **OK** (mapped to *Wrong*), just like Genius.
  - Otherwise: **Submit** → if **exact** match (case/punct/space-insensitive) → auto‑Right; otherwise show answer + **Yes/No/Skip**.

- `src/lib/similarity.ts`
  - `isExactLike(a,b)` returns `true` only for equal after lowercasing + stripping punctuation/extra spaces.
  - `trigramCosine(a,b)` is available for future “close match default to Yes” behavior; currently it’s kept conservative (default **No**).

## Import/Export

- **Import CSV**: `question,answer` per row.
- **Export JSON**: array of `{ question, answer }`.

## Mapping to the original code (what this mirrors)

- **Directed Associations** — Original: `GeniusAssociation` with `scoreNumber` & `dueDate`. Here: `Association` table with `score` & `dueAt`.
- **Enumerator** — Original: `GeniusAssociationEnumerator` with `setCount`, `setMinimumScore`, `setProbabilityCenter`, `associationRight/Wrong/Skip`. Here: `chooseAssociations()` has the same knobs and returns a scheduled list (due first), plus a clean-room probability weight centered at `mValue`.
- **Quiz controller** — Original: `MyQuizController` manages the dimmed background window, swaps review/learn views, and asks *“Were you correct?”*. Here: `StudyModal` duplicates that UX: dimmed screen, cue first, Reveal/Submit, diff, Yes/No/Skip.
- **String similarity** — Original: `NSString+Similiarity` exposing `-isSimilarToString:` (public domain). Here: `similarity.ts` provides an *exact‑like* test and a trigram cosine. Drop-in replacement can be added if we port the Objective‑C function 1:1.

## What remains to match *exactly*

- The exact **probability weighting** in `performChooseAssociations` (Enumerator). This build uses a Gaussian weight centered on `mValue` which is behaviorally close but not guaranteed to match the Objective‑C line for line.
- If you want a byte‑for‑byte equivalent:
  - We can translate the original Objective‑C from the SVN repo into TypeScript. That code is GPL‑licensed; adopting it would make this project GPL as well.
  - Alternatively, we can continue the clean‑room approach but tune unit tests to match the original output using reference decks.

## Tests to add (recommendation)

- Given a fixed random seed and a sample deck, the selection order from `chooseAssociations()` should match the original app’s order snapshot for the same slider setting.
- Answer‑checking fixtures to ensure the *exact‑like* behavior.

## License

MIT for this repository, unless you decide to pull in GPL portions from Genius.

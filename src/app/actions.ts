// src/app/actions.ts
'use server';

import { prisma, prismaReady } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertDatabaseUrl } from '@/lib/env';
import { auth } from '@/auth';

async function ensureDatabase() {
  assertDatabaseUrl();
  await prismaReady();
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  return session.user.id;
}

export async function createDeck(formData: FormData) {
  await ensureDatabase();
  const userId = await requireUserId();
  const rawName = String(formData.get('name') ?? '').trim();
  const name = rawName === '' ? 'Untitled Pack' : rawName;
  const deck = await prisma.deck.create({ data: { name, userId } });
  revalidatePath('/');
  redirect(`/deck/${deck.id}`);
}

export async function renameDeck(formData: FormData) {
  await ensureDatabase();
  const userId = await requireUserId();
  const deckId = String(formData.get('deckId') ?? '');
  if (!deckId) return;
  const rawName = String(formData.get('name') ?? '').trim();
  const name = rawName === '' ? 'Untitled Pack' : rawName;

  const result = await prisma.deck.updateMany({ where: { id: deckId, userId }, data: { name } });
  if (result.count === 0) return;
  revalidatePath('/');
  revalidatePath(`/deck/${deckId}`);
}

export async function deleteDeck(formData: FormData) {
  await ensureDatabase();
  const userId = await requireUserId();
  const deckId = String(formData.get('deckId') ?? '');
  if (!deckId) return;

  const redirectToRaw = formData.get('redirectTo');
  const redirectTo = typeof redirectToRaw === 'string' ? redirectToRaw : null;

  const result = await prisma.deck.deleteMany({ where: { id: deckId, userId } });
  if (result.count === 0) return;

  revalidatePath('/');
  revalidatePath(`/deck/${deckId}`);
  if (redirectTo) redirect(redirectTo);
}

function parseDelimited(text: string, delimiter: ',' | '\t' = ',') {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    current.push(field);
    field = '';
  };

  const pushRow = () => {
    if (current.length === 0) return;
    const normalized = current.map((v) => v.trim());
    if (normalized.some((v) => v !== '')) rows.push(normalized);
    current = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === delimiter) pushField();
    else if (char === '\r') {
      // skip
    } else if (char === '\n') {
      pushField();
      pushRow();
    } else {
      field += char;
    }
  }

  pushField();
  pushRow();
  return rows;
}

function parseCSV(text: string) {
  const sanitized = text.replace(/^\uFEFF/, '');
  const delimiter: ',' | '\t' =
    sanitized.includes('\t') && !sanitized.includes(',') ? '\t' : ',';
  return parseDelimited(sanitized, delimiter);
}

export async function importCSV(deckId: string, csvText: string) {
  await ensureDatabase();
  const userId = await requireUserId();
  const deck = await prisma.deck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
  if (!deck) return;
  const rows = parseCSV(csvText);
  if (rows.length === 0) return;

  const header = rows[0].map((v) => v.toLowerCase());
  const questionAliases = ['question', 'prompt', 'front', 'term'];
  const answerAliases = ['answer', 'back', 'definition'];

  let dataStartIndex = 0;
  let questionIndex = 0;
  let answerIndex = 1;

  const headerQuestionIndex = header.findIndex((v) => questionAliases.includes(v));
  const headerAnswerIndex = header.findIndex((v) => answerAliases.includes(v));

  if ((headerQuestionIndex !== -1 || headerAnswerIndex !== -1) && rows.length > 1) {
    dataStartIndex = 1;
    if (headerQuestionIndex !== -1) questionIndex = headerQuestionIndex;
    if (headerAnswerIndex !== -1) answerIndex = headerAnswerIndex;
  }

  const entries = rows
    .slice(dataStartIndex)
    .map((row) => {
      const question = row[questionIndex] ?? '';
      const answer = row[answerIndex] ?? '';
      return { question: question.trim(), answer: answer.trim() };
    })
    .filter((e) => e.question !== '' || e.answer !== '');

  if (entries.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const pair = await tx.pair.create({
        data: { deckId, question: entry.question, answer: entry.answer },
      });
      await tx.association.createMany({
        data: [
          { pairId: pair.id, direction: 'AB' },
          { pairId: pair.id, direction: 'BA' },
        ],
      });
    }
  });

  revalidatePath(`/deck/${deckId}`);
}

type TextReadable = { text: () => Promise<string> };

export async function importCSVFromForm(deckId: string, formData: FormData) {
  await ensureDatabase();
  await requireUserId();
  const file = formData.get('csv');
  if (!file || typeof (file as Partial<TextReadable>).text !== 'function') return;
  const text = await (file as TextReadable).text();
  await importCSV(deckId, text);
}

export async function saveRow(formData: FormData) {
  await ensureDatabase();
  const userId = await requireUserId();
  const deckId = String(formData.get('deckId') ?? '');
  const pairId = String(formData.get('pairId') ?? '');
  const associationId = String(formData.get('associationId') ?? '');
  const question = String(formData.get('question') ?? '');
  const answer = String(formData.get('answer') ?? '');
  const scoreStr = formData.get('score');
  const score =
    scoreStr === null || scoreStr === undefined || String(scoreStr).trim() === ''
      ? null
      : parseInt(String(scoreStr), 10);

  if (!deckId) return;

  const ownsDeck = await prisma.deck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
  if (!ownsDeck) return;

  const boundedScore =
    score === null || Number.isNaN(score) ? null : Math.max(-1, Math.min(10, score));
  const numericScore = boundedScore === null || boundedScore < 0 ? null : boundedScore;

  if (!pairId) {
    if (question.trim() === '' && answer.trim() === '') return;
    const created = await prisma.pair.create({
      data: { deckId, question, answer },
    });
    const hasScore = numericScore !== null;
    const dueAt = hasScore ? new Date(Date.now() + Math.pow(5, Math.max(0, numericScore)) * 1000) : null;
    await prisma.association.createMany({
      data: [
        {
          pairId: created.id,
          direction: 'AB',
          ...(hasScore
            ? { score: numericScore!, dueAt: dueAt!, firstTime: false }
            : {}),
        },
        {
          pairId: created.id,
          direction: 'BA',
          ...(hasScore
            ? { score: numericScore!, dueAt: dueAt!, firstTime: false }
            : {}),
        },
      ],
    });
    revalidatePath(`/deck/${deckId}`);
    return;
  }

  if (pairId) {
    await prisma.pair.updateMany({ where: { id: pairId, deck: { userId } }, data: { question, answer } });
  }
  if (associationId && numericScore !== null) {
    const s = numericScore;
    await prisma.association.updateMany({
      where: { id: associationId, pair: { deck: { userId } } },
      data: {
        score: s,
        dueAt: new Date(Date.now() + Math.pow(5, Math.max(0, s)) * 1000),
        firstTime: s === 0 ? false : undefined,
      },
    });
  } else if (associationId && boundedScore !== null && boundedScore < 0) {
    await prisma.association.updateMany({
      where: { id: associationId, pair: { deck: { userId } } },
      data: {
        score: null as unknown as number,
        dueAt: null,
        firstTime: true,
      },
    });
  }
  if (deckId) revalidatePath(`/deck/${deckId}`);
}

export async function deletePair(formData: FormData) {
  await ensureDatabase();
  const userId = await requireUserId();
  const deckId = String(formData.get('deckId') ?? '');
  const pairId = String(formData.get('pairId') ?? '');
  if (!deckId || !pairId) return;

  const ownsDeck = await prisma.deck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
  if (!ownsDeck) return;

  await prisma.association.deleteMany({ where: { pairId, pair: { deck: { userId } } } });
  await prisma.pair.deleteMany({ where: { id: pairId, deck: { userId } } });
  revalidatePath(`/deck/${deckId}`);
}

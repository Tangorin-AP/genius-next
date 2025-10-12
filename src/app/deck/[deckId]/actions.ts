
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function addPair(deckId: string) {
  const p = await prisma.pair.create({ data: { deckId, question: '', answer: '' } });
  await prisma.association.createMany({
    data: [
      { pairId: p.id, direction: 'AB', score: 0, dueAt: new Date() },
      { pairId: p.id, direction: 'BA', score: 0, dueAt: new Date() },
    ]
  });
  revalidatePath(`/deck/${deckId}`);
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
    if (current.length === 0) {
      return;
    }
    const normalized = current.map((value) => value.trim());
    if (normalized.some((value) => value !== '')) {
      rows.push(normalized);
    }
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

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\r') {
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
  const delimiter: ',' | '\t' = sanitized.includes('\t') && !sanitized.includes(',') ? '\t' : ',';
  return parseDelimited(sanitized, delimiter);
}

export async function importCSV(deckId: string, csvText: string) {
  const rows = parseCSV(csvText);
  if (rows.length === 0) return;

  const header = rows[0].map((value) => value.toLowerCase());
  const questionAliases = ['question', 'prompt', 'front', 'term'];
  const answerAliases = ['answer', 'back', 'definition'];
  let dataStartIndex = 0;
  let questionIndex = 0;
  let answerIndex = 1;

  const headerQuestionIndex = header.findIndex((value) => questionAliases.includes(value));
  const headerAnswerIndex = header.findIndex((value) => answerAliases.includes(value));

  if ((headerQuestionIndex !== -1 || headerAnswerIndex !== -1) && rows.length > 1) {
    dataStartIndex = 1;
    if (headerQuestionIndex !== -1) {
      questionIndex = headerQuestionIndex;
    }
    if (headerAnswerIndex !== -1) {
      answerIndex = headerAnswerIndex;
    }
  }

  const entries = rows.slice(dataStartIndex).map((row) => {
    const question = row[questionIndex] ?? '';
    const answer = row[answerIndex] ?? '';
    return {
      question: question.trim(),
      answer: answer.trim(),
    };
  }).filter((entry) => entry.question !== '' || entry.answer !== '');

  if (entries.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const pair = await tx.pair.create({
        data: {
          deckId,
          question: entry.question,
          answer: entry.answer,
        },
      });

      await tx.association.createMany({
        data: [
          { pairId: pair.id, direction: 'AB', score: 0, dueAt: new Date() },
          { pairId: pair.id, direction: 'BA', score: 0, dueAt: new Date() },
        ],
      });
    }
  });

  revalidatePath(`/deck/${deckId}`);
}

type TextReadable = { text: () => Promise<string> };

export async function importCSVFromForm(deckId: string, formData: FormData) {
  const file = formData.get('csv');
  if (!file || typeof (file as Partial<TextReadable>).text !== 'function') {
    return;
  }

  const text = await (file as TextReadable).text();
  await importCSV(deckId, text);
}

export async function saveRow(formData: FormData) {
  const deckId = String(formData.get('deckId') ?? '');
  const pairId = String(formData.get('pairId') ?? '');
  const associationId = String(formData.get('associationId') ?? '');
  const question = String(formData.get('question') ?? '');
  const answer = String(formData.get('answer') ?? '');
  const scoreStr = formData.get('score');
  const score = (scoreStr === null || scoreStr === undefined || String(scoreStr).trim()==='')
    ? null
    : parseInt(String(scoreStr), 10);

  if (pairId) {
    await prisma.pair.update({ where: { id: pairId }, data: { question, answer } });
  }
  if (associationId && score !== null && !Number.isNaN(score)) {
    const s = Math.max(0, Math.min(10, score));
    await prisma.association.update({
      where: { id: associationId },
      data: { score: s, dueAt: new Date(Date.now() + Math.pow(5, Math.max(0, s))*1000), firstTime: s === 0 ? false : undefined }
    });
  }
  if (deckId) revalidatePath(`/deck/${deckId}`);
}

export async function deletePair(formData: FormData) {
  const deckId = String(formData.get('deckId') ?? '');
  const pairId = String(formData.get('pairId') ?? '');
  if (pairId) {
    await prisma.association.deleteMany({ where: { pairId } });
    await prisma.pair.delete({ where: { id: pairId } });
  }
  if (deckId) revalidatePath(`/deck/${deckId}`);
}

// New: server action specifically for Client Component notes form
export async function saveDeckNotesAction(deckId: string, formData: FormData) {
  const notes = String(formData.get('notes') || '');
  await prisma.deck.update({ where: { id: deckId }, data: { notes } });
  revalidatePath(`/deck/${deckId}`);
}

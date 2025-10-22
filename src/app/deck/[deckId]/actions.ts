// src/app/deck/[deckId]/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { importCSV as baseImportCSV, importCSVFromForm as baseImportCSVFromForm, saveRow as baseSaveRow, deletePair as baseDeletePair } from '@/app/actions';
import { assertDatabaseUrl } from '@/lib/env';
import { prisma, prismaReady } from '@/lib/prisma';

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

export async function addPair(deckId: string) {
  await ensureDatabase();
  const userId = await requireUserId();
  if (!deckId) return;

  const deck = await prisma.deck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
  if (!deck) return;

  const pair = await prisma.pair.create({ data: { deckId, question: '', answer: '' } });
  await prisma.association.createMany({
    data: [
      { pairId: pair.id, direction: 'AB' },
      { pairId: pair.id, direction: 'BA' },
    ],
  });
  revalidatePath(`/deck/${deckId}`);
}

export const importCSV = baseImportCSV;
export const importCSVFromForm = baseImportCSVFromForm;
export const saveRow = baseSaveRow;
export const deletePair = baseDeletePair;

// ⛔ Do not export renameDeck from here.
// Keep renameDeck in src/app/actions.ts only.

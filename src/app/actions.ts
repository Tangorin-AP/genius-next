'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createDeck(formData: FormData) {
  const rawName = String(formData.get('name') ?? '').trim();
  const name = rawName === '' ? 'Untitled Pack' : rawName;

  const deck = await prisma.deck.create({
    data: { name },
  });

  revalidatePath('/');
  redirect(`/deck/${deck.id}`);
}

export async function renameDeck(formData: FormData) {
  const deckId = String(formData.get('deckId') ?? '');
  if (!deckId) return;

  const rawName = String(formData.get('name') ?? '').trim();
  const name = rawName === '' ? 'Untitled Pack' : rawName;

  await prisma.deck.update({
    where: { id: deckId },
    data: { name },
  });

  revalidatePath('/');
  revalidatePath(`/deck/${deckId}`);
}

export async function deleteDeck(formData: FormData) {
  const deckId = String(formData.get('deckId') ?? '');
  if (!deckId) return;

  const redirectToRaw = formData.get('redirectTo');
  const redirectTo = typeof redirectToRaw === 'string' ? redirectToRaw : null;

  await prisma.deck.delete({ where: { id: deckId } });

  revalidatePath('/');
  revalidatePath(`/deck/${deckId}`);

  if (redirectTo) {
    redirect(redirectTo);
  }
}

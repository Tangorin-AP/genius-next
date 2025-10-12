
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const deck = await prisma.deck.upsert({
    where: { id: 'seed' },
    update: {},
    create: { id: 'seed', name: 'Sample' }
  });
  const items = [
    ['la casa', 'house'],
    ['el libro', 'book'],
    ['el papel', 'paper']
  ];
  for (const [q,a] of items) {
    const pair = await prisma.pair.create({
      data: { deckId: deck.id, question: q, answer: a }
    });
    await prisma.association.createMany({
      data: [
        { pairId: pair.id, direction: 'AB' },
        { pairId: pair.id, direction: 'BA' }
      ]
    });
  }
  console.log('Seeded deck:', deck.id);
}
main().finally(()=>prisma.$disconnect());

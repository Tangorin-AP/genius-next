
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export default async function Home() {
  const decks = await prisma.deck.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { pairs: true } } },
  });
  return (
    <main className="wrap">
      <div className="toolbar aqua">
        <div className="title">Genius (Web • Next.js) — v2</div>
      </div>
      <section className="pack-grid">
        {decks.map(deck => (
          <Link key={deck.id} href={`/deck/${deck.id}`} className="deck-card">
            <span className="deck-card__name">{deck.name}</span>
            <span className="deck-card__meta">{deck._count.pairs} cards</span>
          </Link>
        ))}
        {decks.length === 0 && (
          <div className="deck-card deck-card--empty">
            <span className="deck-card__name">No packs yet</span>
            <span className="deck-card__meta">Create a note pack to begin studying.</span>
          </div>
        )}
      </section>
    </main>
  );
}

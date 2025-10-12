
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { createDeck, renameDeck } from './actions';
import DeleteDeckForm from '@/components/DeleteDeckForm';

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
        <form action={createDeck} className="deck-card deck-card--create">
          <span className="deck-card__name">New Pack</span>
          <label className="deck-card__field">
            <span className="deck-card__label">Title</span>
            <input name="name" placeholder="e.g. Neuroanatomy" />
          </label>
          <button type="submit" className="deck-card__button">Create &amp; open</button>
        </form>
        {decks.map(deck => (
          <article key={deck.id} className="deck-card deck-card--manage">
            <Link href={`/deck/${deck.id}`} className="deck-card__link">
              <span className="deck-card__name">{deck.name}</span>
              <span className="deck-card__meta">{deck._count.pairs} cards</span>
            </Link>
            <form action={renameDeck} className="deck-card__form">
              <input type="hidden" name="deckId" value={deck.id} />
              <label className="deck-card__field">
                <span className="deck-card__label">Rename</span>
                <input name="name" defaultValue={deck.name} />
              </label>
              <button type="submit" className="deck-card__button">Save title</button>
            </form>
            <div className="deck-card__form deck-card__form--danger">
              <DeleteDeckForm deckId={deck.id} className="deck-card__button deck-card__button--danger">
                Delete pack
              </DeleteDeckForm>
            </div>
          </article>
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

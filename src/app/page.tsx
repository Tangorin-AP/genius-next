
import { prisma } from '@/lib/prisma';
import { createDeck } from '@/app/actions';
import ThemeToggle from '@/components/ThemeToggle';
import MissingDatabaseNotice from '@/components/MissingDatabaseNotice';
import { hasDatabaseUrl } from '@/lib/env';
import DeckCardManage from '@/components/DeckCardManage';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!hasDatabaseUrl()) {
    return (
      <main className="wrap">
        <div className="toolbar aqua">
          <div className="title">Genius • Learning</div>
          <div className="spacer" />
          <ThemeToggle />
        </div>
        <section className="pack-grid">
          <MissingDatabaseNotice />
        </section>
      </main>
    );
  }

  const decks = await prisma.deck.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { pairs: true } } },
  });
  return (
    <main className="wrap">
      <div className="toolbar aqua">
        <div className="title">Genius • Learning</div>
        <div className="spacer" />
        <ThemeToggle />
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
          <DeckCardManage key={deck.id} deck={deck} />
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

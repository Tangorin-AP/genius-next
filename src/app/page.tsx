
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
      <main className="page">
        <header className="page-header">
          <div className="page-header__titles">
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Your career paths</p>
          </div>
          <ThemeToggle />
        </header>
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
    <main className="page">
      <header className="page-header">
        <div className="page-header__titles">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your career paths</p>
        </div>
        <ThemeToggle />
      </header>
      <section className="pack-grid">
        <form action={createDeck} className="deck-card deck-card--create">
          <div className="deck-card__empty-icon" aria-hidden="true">＋</div>
          <div className="deck-card__content">
            <span className="deck-card__name">Add new</span>
            <span className="deck-card__meta">Create a note pack to get started.</span>
          </div>
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
            <div className="deck-card__empty-icon" aria-hidden="true">＋</div>
            <div className="deck-card__content">
              <span className="deck-card__name">No packs yet</span>
              <span className="deck-card__meta">Create a note pack to begin studying.</span>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

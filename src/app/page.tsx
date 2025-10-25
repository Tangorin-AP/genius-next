
import { prisma, prismaReady } from '@/lib/prisma';
import { createDeck } from '@/app/actions';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import MissingDatabaseNotice from '@/components/MissingDatabaseNotice';
import { hasDatabaseUrl } from '@/lib/env';
import DeckCardManage from '@/components/DeckCardManage';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message;
  }
  if (typeof error === 'string') return error;
  return undefined;
}

function renderDatabaseNotice(kind: 'missing' | 'unreachable', error?: unknown) {
  const hint = IS_PRODUCTION ? undefined : formatError(error);
  return (
    <main className="page">
      <header className="page-header">
        <div className="page-header__titles">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your career paths</p>
        </div>
        <div className="page-header__actions">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <section className="pack-grid">
        <MissingDatabaseNotice kind={kind} hint={hint} />
      </section>
    </main>
  );
}

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  if (!hasDatabaseUrl()) {
    return renderDatabaseNotice('missing');
  }

  try {
    await prismaReady();
  } catch (error) {
    console.error('Prisma failed to initialize', error);
    return renderDatabaseNotice('unreachable', error);
  }

  let decks;
  try {
    decks = await prisma.deck.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { pairs: true } } },
    });
  } catch (error) {
    console.error('Failed to load decks', error);
    return renderDatabaseNotice('unreachable', error);
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-header__titles">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your career paths</p>
        </div>
        <div className="page-header__actions">
          <ThemeToggle />
          <LogoutButton />
        </div>
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

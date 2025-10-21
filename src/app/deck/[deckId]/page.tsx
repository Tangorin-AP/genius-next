
import { prisma, prismaReady } from '@/lib/prisma';
import StudyModal from '@/components/StudyModal';
import DeckControls from '@/components/DeckControls';
import DeckTable from '@/components/DeckTable';
import ImportCSVForm from '@/components/ImportCSVForm';
import DeleteDeckForm from '@/components/DeleteDeckForm';
import { Suspense } from 'react';
import Link from 'next/link';
import { renameDeck } from '@/app/actions';
import { hasDatabaseUrl } from '@/lib/env';
import MissingDatabaseNotice from '@/components/MissingDatabaseNotice';
import ThemeToggle from '@/components/ThemeToggle';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DeckPage({ params }: { params: { deckId: string }}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  if (!hasDatabaseUrl()) {
    return (
      <main className="page page--deck">
        <header className="page-header deck-header">
          <div className="deck-header__primary">
            <Link href="/" className="back-link">← Dashboard</Link>
            <h1 className="page-title">Pack</h1>
          </div>
          <ThemeToggle />
        </header>
        <section className="pack-grid">
          <MissingDatabaseNotice />
        </section>
      </main>
    );
  }

  await prismaReady;

  const deck = await prisma.deck.findFirst({
    where: { id: params.deckId, userId: session.user.id },
    include: { pairs: { include: { associations: true } } },
  });
  if (!deck) return <div>Deck not found</div>;

  const rows = deck.pairs.map((p) => {
    const ab = p.associations.find((a) => a.direction === 'AB');
    const rawScore = typeof ab?.score === 'number' ? ab.score : -1;
    return {
      pairId: p.id,
      question: p.question,
      answer: p.answer,
      associationId: ab?.id ?? null,
      score: rawScore,
    };
  });

  return (
    <main className="page page--deck">
      <header className="page-header deck-header">
        <div className="deck-header__primary">
          <Link href="/" className="back-link">← Dashboard</Link>
          <form action={renameDeck} className="deck-title-form">
            <input type="hidden" name="deckId" value={deck.id} />
            <input
              className="deck-title-input"
              name="name"
              defaultValue={deck.name}
              aria-label="Deck title"
            />
            <button type="submit" className="chip">Save title</button>
          </form>
        </div>
        <div className="deck-header__actions">
          <DeleteDeckForm deckId={deck.id} redirectTo="/" className="chip chip--danger deck-header__delete">
            Delete pack
          </DeleteDeckForm>
          <ThemeToggle className="deck-header__theme-toggle" />
        </div>
      </header>
      <DeckControls stats={{pairs: deck.pairs.length}} />

      <DeckTable deckId={deck.id} rows={rows} />

      <div className="boxed deck-footer">
        <div className="deck-footer__row">
          <div className="deck-footer__new">Use the “＋” row above to add a new card.</div>
          <ImportCSVForm deckId={deck.id} />
          <Link className="link-export" href={`/api/export?deckId=${deck.id}`}>Download CSV</Link>
          <div className="spacer" />
          <span className="deck-footer__hint">CSV format: “Question,Answer”. Importing updates instantly.</span>
        </div>
      </div>

      <Suspense>
        <StudyModal deckId={deck.id} />
      </Suspense>

      <form id="studyForm" action="" />
    </main>

  );
}

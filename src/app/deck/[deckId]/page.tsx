
import { prisma } from '@/lib/prisma';
import StudyModal from '@/components/StudyModal';
import DeckControls from '@/components/DeckControls';
import DeckTable from '@/components/DeckTable';
import ImportCSVForm from '@/components/ImportCSVForm';
import DeleteDeckForm from '@/components/DeleteDeckForm';
import { Suspense } from 'react';
import Link from 'next/link';
import { renameDeck } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function DeckPage({ params }: { params: { deckId: string }}) {
  const deck = await prisma.deck.findUnique({ where: { id: params.deckId }, include: { pairs: { include: { associations: true } } } });
  if (!deck) return <div>Deck not found</div>;

  const rows = deck.pairs.map(p=>{
    const ab = p.associations.find(a=>a.direction==='AB');
    const score = ab?.score ?? 0;
    return { pairId: p.id, question: p.question, answer: p.answer, associationId: ab?.id ?? null, score: score < 0 ? 0 : score };
  });

  return (
    <main className="wrap">
      <div className="page-header deck-header">
        <Link href="/" className="back-link">← Packs</Link>
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
        <DeleteDeckForm deckId={deck.id} redirectTo="/" className="chip chip--danger">
          Delete pack
        </DeleteDeckForm>
      </div>
      <DeckControls deckId={deck.id} stats={{pairs: deck.pairs.length}} initialNotes={deck.notes}/>

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

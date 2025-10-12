
import { prisma } from '@/lib/prisma';
import { addPair, importCSVFromForm } from './actions';
import StudyModal from '@/components/StudyModal';
import DeckControls from '@/components/DeckControls';
import DeckTable from '@/components/DeckTable';
import { Suspense } from 'react';
import Link from 'next/link';

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

      <div className="boxed" style={{marginTop:10}}>
        <div className="footer">
          <form action={addPair.bind(null, deck.id)}><button className="chip">+</button></form>
          <form
            action={importCSVFromForm.bind(null, deck.id)}
            encType="multipart/form-data"
          >
            <input type="file" name="csv" accept=".csv" />
            <button className="chip">Import CSV</button>
          </form>
          <Link className="chip" href={`/api/export?deckId=${deck.id}`}>Export JSON</Link>
          <div className="spacer" />
        </div>
      </div>

      <Suspense>
        <StudyModal deckId={deck.id} />
      </Suspense>

      <form id="studyForm" action="" />
    </main>
  );
}


import { prisma } from '@/lib/prisma';
import { addPair, importCSV } from './actions';
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
    return { pairId: p.id, question: p.question, answer: p.answer, associationId: ab?.id ?? null, score: ab?.score ?? -1 };
  });

  return (
    <main className="wrap">
      <DeckControls deckId={deck.id} stats={{pairs: deck.pairs.length}} initialNotes={deck.notes}/>

      <DeckTable deckId={deck.id} rows={rows} />

      <div className="boxed" style={{marginTop:10}}>
        <div className="footer">
          <form action={addPair.bind(null, deck.id)}><button className="chip">+</button></form>
          <form action={async(formData)=>{
            'use server';
            const file = formData.get('csv') as File | null;
            if (!file) return;
            const text = await file.text();
            await importCSV(deck.id, text);
          }} encType="multipart/form-data">
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

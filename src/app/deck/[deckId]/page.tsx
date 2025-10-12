
import { prisma } from '@/lib/prisma';
import { addPair, importCSV, exportJSON, saveRow } from './actions';
import StudyModal from '@/components/StudyModal';
import { Suspense } from 'react';

export default async function DeckPage({ params }: { params: { deckId: string }}) {
  const deck = await prisma.deck.findUnique({ where: { id: params.deckId }, include: { pairs: { include: { associations: true } } } });
  if (!deck) return <div>Deck not found</div>;
  return (
    <main className="wrap">
      <div className="toolbar aqua">
        <button form="studyForm" className="toolbtn play" title="Study">▶</button>
        <div className="sliderbox"><span>Learn</span><input type="range" min="0" max="100" defaultValue={40} /><span>Review</span></div>
        <button className="toolbtn" title="Info">i</button>
        <button className="toolbtn" title="Notes">📒</button>
        <div className="spacer"></div>
        <input className="search" placeholder="Search" />
      </div>

      <div className="boxed">
        <div className="header">
          <div className="th chk" />
          <div className="th qcol">Question</div>
          <div className="th acol">Answer</div>
          <div className="th scol">Score(+-)</div>
        </div>
        {deck.pairs.map(p=>{
          const ab = p.associations.find(a=>a.direction==='AB');
          return (
            <form key={p.id} className="row grid-4" action={saveRow}>
              <input type="hidden" name="deckId" value={deck.id} />
              <input type="hidden" name="pairId" value={p.id} />
              <input type="hidden" name="associationId" value={ab?.id ?? ''} />
              <div className="td chk"><input type="checkbox" defaultChecked /></div>
              <div className="td qcol"><input name="question" type="text" defaultValue={p.question} /></div>
              <div className="td acol"><input name="answer" type="text" defaultValue={p.answer} /></div>
              <div className="td scol">
                <div className="score-inline">
                  <input name="score" type="number" min="-1" max="10" defaultValue={ab ? ab.score : -1} />
                  <button className="chip" type="submit">Save</button>
                </div>
              </div>
            </form>
          )
        })}
        <div className="footer">
          <form action={addPair.bind(null, deck.id)}><button className="chip">+</button></form>
          <form action={async(formData)=>{
            'use server';
            const file = formData.get('csv') as File | null;
            if (!file) return;
            const text = await file.text();
            await importCSV(deck.id, text);
          }}>
            <input type="file" name="csv" accept=".csv" />
            <button className="chip">Import</button>
          </form>
          <form action={async()=>{
            'use server';
            const json = await exportJSON(deck.id);
            return new Response(json, { headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename=deck.json' } });
          }}>
            <button className="chip">Export</button>
          </form>
          <div className="spacer" />
          <div className="progress"><div className="bar" style={{ width: '0%' }} /></div><span className="muted">0%</span>
        </div>
      </div>

      <Suspense>
        <StudyModal deckId={deck.id} />
      </Suspense>

      <form id="studyForm" action="" />
    </main>
  );
}

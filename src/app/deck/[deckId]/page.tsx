
import { prisma } from '@/lib/prisma';
import { addPair, importCSV, exportJSON, setScore, updatePair } from './actions';
import StudyModal from '@/components/StudyModal';
import { Suspense } from 'react';

export default async function DeckPage({ params }: { params: { deckId: string }}) {
  const deck = await prisma.deck.findUnique({ where: { id: params.deckId }, include: { pairs: { include: { associations: true } } } });
  if (!deck) return <div>Deck not found</div>;
  return (
    <main className="wrap">
      <div className="toolbar">
        <button form="studyForm">▶︎ Learn</button>
        <div className="seg"><span>Learn</span><div className="slider"/><span>Review</span></div>
        <div className="spacer" />
        <div>{deck.name}</div>
      </div>
      <div className="boxed">
        <div className="header">
          <div className="th chk"/>
          <div className="th qcol">Question</div>
          <div className="th acol">Answer</div>
          <div className="th scol">Score(+-)</div>
        </div>
        {deck.pairs.map(p=>{
          const ab = p.associations.find(a=>a.direction==='AB');
          return (
            <div className="row" key={p.id}>
              <div className="td chk"><input type="checkbox" defaultChecked /></div>
              <div className="td qcol"><input defaultValue={p.question} onBlur={async e=>updatePair(p.id, { question: e.currentTarget.value })} /></div>
              <div className="td acol"><input defaultValue={p.answer} onBlur={async e=>updatePair(p.id, { answer: e.currentTarget.value })} /></div>
              <div className="td scol">
                <button className="score" onClick={async ()=>{
                  const v = prompt('Score (-1 unseen, 0 wrong, 1+ right streak):', String(ab?.score ?? -1));
                  if (v==null) return;
                  const score = parseInt(v, 10);
                  if (ab) await setScore(ab.id, score);
                }}>
                  <span className={`dot ${ab && ab.score>0 ? 'good': ''}`}></span>
                  <span>{ab ? (ab.score<0 ? '—' : ab.score) : '—'}</span>
                </button>
              </div>
            </div>
          )
        })}
        <div className="footer">
          <form action={addPair.bind(null, deck.id)}><button>+</button></form>
          <form action={async(formData)=>{
            'use server';
            const file = formData.get('csv') as File | null;
            if (!file) return;
            const text = await file.text();
            await importCSV(deck.id, text);
          }}>
            <input type="file" name="csv" accept=".csv" />
            <button>Import CSV</button>
          </form>
          <form action={async()=>{
            'use server';
            const json = await exportJSON(deck.id);
            return new Response(json, { headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename=deck.json' } });
          }}>
            <button>Export JSON</button>
          </form>
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


'use client';

import { useEffect, useMemo, useState } from 'react';
import { saveDeckNotesAction } from '@/app/deck/[deckId]/actions';
import ThemeToggle from './ThemeToggle';

export default function DeckControls({ deckId, stats, initialNotes }: { deckId: string; stats: {pairs:number}; initialNotes?: string|null; }){
  const [q, setQ] = useState('');
  const [m, setM] = useState(0);
  const [min, setMin] = useState(-1);
  const [mode, setMode] = useState<'exact'|'words'>('exact');
  const [openInfo, setOpenInfo] = useState(false);
  const [openNotes, setOpenNotes] = useState(false);

  const notes = useMemo(() => initialNotes || '', [initialNotes]);

  useEffect(()=>{
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' && (e.ctrlKey||e.metaKey)) (document.getElementById('searchBox') as HTMLInputElement| null)?.focus();
    };
    window.addEventListener('keydown', handler);
    return ()=>window.removeEventListener('keydown', handler);
  }, []);

  useEffect(()=>{ window.dispatchEvent(new CustomEvent('deck-search', { detail: q })); }, [q]);

  function handleLearn(){
    localStorage.setItem('studyParams', JSON.stringify({ m, min, count: 30, mode }));
    (document.getElementById('studyForm') as HTMLFormElement | null)?.requestSubmit();
  }

  return (
    <>
      <div className="toolbar aqua">
        <button onClick={handleLearn} className="toolbtn play" title="Study">▶</button>
        <div className="sliderbox"><span>Learn</span><input type="range" min="-2" max="6" step="1" value={m} onChange={e=>setM(parseInt(e.currentTarget.value,10))} /><span>Review</span></div>
        <label className="match-mode" title="Choose how your answer is compared">
          <span className="match-mode__label">Answer check</span>
          <select value={mode} onChange={e=>setMode(e.currentTarget.value as any)}>
            <option value="exact">Exact phrase (case &amp; punctuation ignored)</option>
            <option value="words">All words match (any order)</option>
          </select>
          <span className="match-mode__hint">Exact ignores case &amp; punctuation. Word mode checks all words in any order.</span>
        </label>
        <button onClick={()=>setOpenInfo(true)} className="toolbtn" title="Info">i</button>
        <button onClick={()=>setOpenNotes(true)} className="toolbtn" title="Notes">📒</button>
        <div className="spacer"></div>
        <ThemeToggle />
        <input id="searchBox" className="search" placeholder="Search" value={q} onChange={e=>setQ(e.currentTarget.value)} />
      </div>

      {openInfo && (
        <div className="screen" onClick={()=>setOpenInfo(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><div className="title">Deck Info</div><div className="spacer"/><button className="icon" onClick={()=>setOpenInfo(false)}>×</button></div>
            <div className="modal-body">
              <div>Total cards: {stats.pairs}</div>
              <div>Study settings: m = {m}, minimum score = {min}, match = {mode}</div>
              <p className="muted">m controls where the scheduler samples scores (lower = newer learning, higher = later review).</p>
            </div>
          </div>
        </div>
      )}

      {openNotes && (
        <div className="screen" onClick={()=>setOpenNotes(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><div className="title">Notes</div><div className="spacer"/><button className="icon" onClick={()=>setOpenNotes(false)}>×</button></div>
            <div className="modal-body">
              <form action={saveDeckNotesAction.bind(null, deckId)}>
                <textarea name="notes" defaultValue={notes} style={{width:'100%',minHeight:180}}></textarea>
                <div style={{display:'flex',justifyContent:'flex-end',marginTop:10}}>
                  <button className="chip" type="submit">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

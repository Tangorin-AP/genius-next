
'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState, useTransition } from 'react';
import { defaultMatchingMode, MatchingMode } from '@/lib/matching';
import { saveDeckNotesAction } from '@/app/deck/[deckId]/actions';
import ThemeToggle from './ThemeToggle';

export default function DeckControls({ deckId, stats, initialNotes }: { deckId: string; stats: {pairs:number}; initialNotes?: string|null; }){
  const [q, setQ] = useState('');
  const [m, setM] = useState(0);
  const [min, setMin] = useState(-1);
  const [count, setCount] = useState(30);
  const [mode, setMode] = useState<MatchingMode>(defaultMatchingMode());
  const [openInfo, setOpenInfo] = useState(false);
  const [openNotes, setOpenNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(initialNotes || '');
  const [notesStatus, setNotesStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [isSavingNotes, startSavingNotes] = useTransition();

  useEffect(() => {
    setNotesDraft(initialNotes || '');
  }, [initialNotes]);

  useEffect(() => {
    if (openNotes) {
      setNotesStatus('idle');
      setNotesError(null);
    }
  }, [openNotes]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('studyParams');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.m === 'number') setM(parsed.m);
        if (typeof parsed.min === 'number') setMin(parsed.min);
        if (typeof parsed.count === 'number') setCount(parsed.count);
        if (typeof parsed.mode === 'string') setMode(parsed.mode as MatchingMode);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(()=>{
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' && (e.ctrlKey||e.metaKey)) (document.getElementById('searchBox') as HTMLInputElement| null)?.focus();
    };
    window.addEventListener('keydown', handler);
    return ()=>window.removeEventListener('keydown', handler);
  }, []);

  useEffect(()=>{ window.dispatchEvent(new CustomEvent('deck-search', { detail: q })); }, [q]);

  function handleLearn(){
    localStorage.setItem('studyParams', JSON.stringify({ m, min, count, mode }));
    (document.getElementById('studyForm') as HTMLFormElement | null)?.requestSubmit();
  }

  const handleNotesSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set('notes', notesDraft);
    setNotesError(null);
    setNotesStatus('saving');
    startSavingNotes(() => {
      void saveDeckNotesAction(deckId, formData)
        .then(() => {
          setNotesStatus('saved');
          setTimeout(() => {
            setOpenNotes(false);
            setNotesStatus('idle');
          }, 500);
        })
        .catch(() => {
          setNotesStatus('error');
          setNotesError('Could not save notes. Please try again.');
        });
    });
  };

  return (
    <>
      <div className="toolbar aqua">
        <button onClick={handleLearn} className="toolbtn play" title="Study">▶</button>
        <div className="sliderbox"><span>Learn</span><input type="range" min="-2" max="6" step="1" value={m} onChange={e=>setM(parseInt(e.currentTarget.value,10))} /><span>Review</span></div>
        <label className="match-mode" title="Cards per run">
          <span className="match-mode__label">Cards</span>
          <input
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isNaN(value)) {
                setCount(1);
              } else {
                setCount(Math.max(1, Math.min(200, Math.round(value))));
              }
            }}
          />
          <span className="match-mode__hint">Number of unscheduled cards to sample this session.</span>
        </label>
        <label className="match-mode" title="Minimum score to include">
          <span className="match-mode__label">Minimum score</span>
          <select value={min} onChange={e=>setMin(parseInt(e.currentTarget.value, 10))}>
            <option value={-1}>Include new</option>
            <option value={0}>Review only</option>
            <option value={1}>Score ≥ 1</option>
            <option value={2}>Score ≥ 2</option>
          </select>
          <span className="match-mode__hint">Use 0 for review-only mode. Higher scores focus on long-term items.</span>
        </label>
        <label className="match-mode" title="Choose how your answer is compared">
          <span className="match-mode__label">Answer check</span>
          <select value={mode} onChange={e=>setMode(e.currentTarget.value as MatchingMode)}>
            <option value="fuzzy">Fuzzy similarity (default)</option>
            <option value="case">Case-insensitive exact</option>
            <option value="exact">Exact spelling</option>
          </select>
          <span className="match-mode__hint">Fuzzy mode mirrors Genius similarity scoring with SearchKit vectors.</span>
        </label>
        <button onClick={()=>setOpenInfo(true)} className="toolbtn" title="Info">i</button>
        <button onClick={()=>setOpenNotes(true)} className="toolbtn" title="Notes">📒</button>
        <div className="spacer"></div>
        <Link href="/spacing" className="toolbtn" title="Spacing guide">Guide</Link>
        <ThemeToggle />
        <input id="searchBox" className="search" placeholder="Search" value={q} onChange={e=>setQ(e.currentTarget.value)} />
      </div>

      {openInfo && (
        <div className="screen" onClick={()=>setOpenInfo(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><div className="title">Deck Info</div><div className="spacer"/><button className="icon" onClick={()=>setOpenInfo(false)}>×</button></div>
            <div className="modal-body">
              <div>Total cards: {stats.pairs}</div>
              <div>Study settings: m = {m}, minimum score = {min}, cards = {count}, match = {mode}</div>
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
              <form onSubmit={handleNotesSubmit}>
                <textarea
                  name="notes"
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.currentTarget.value)}
                  style={{width:'100%',minHeight:180}}
                ></textarea>
                <div className="notes-actions">
                  <div className="notes-feedback" role="status">
                    {notesStatus === 'saved' && <span>Saved!</span>}
                    {notesStatus === 'error' && <span className="notes-feedback--error">{notesError}</span>}
                  </div>
                  <button className="chip" type="submit" disabled={isSavingNotes}>
                    {isSavingNotes ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

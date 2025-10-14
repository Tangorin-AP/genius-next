
'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState, useTransition } from 'react';
import { defaultMatchingMode, MatchingMode } from '@/lib/matching';
import { UNSCHEDULED_SAMPLE_COUNT } from '@/lib/constants';
import { saveDeckNotesAction } from '@/app/deck/[deckId]/actions';
import ThemeToggle from './ThemeToggle';

export default function DeckControls({ deckId, stats, initialNotes }: { deckId: string; stats: {pairs:number}; initialNotes?: string|null; }){
  const [q, setQ] = useState('');
  const [slider, setSlider] = useState(0);
  const [minimumScore, setMinimumScore] = useState(-1);
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
    const clampSliderValue = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    try {
      const raw = localStorage.getItem('studyParams');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.slider === 'number') {
        setSlider(clampSliderValue(parsed.slider));
      } else if (typeof parsed.m === 'number') {
        setSlider(clampSliderValue((parsed.m / 2) * 100));
      }
      if (typeof parsed.minimumScore === 'number') {
        setMinimumScore(parsed.minimumScore);
      } else if (typeof parsed.min === 'number') {
        setMinimumScore(parsed.min);
      }
      if (typeof parsed.mode === 'string') setMode(parsed.mode as MatchingMode);
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
    const sliderValue = Math.max(0, Math.min(100, Math.round(slider)));
    const payload = {
      slider: sliderValue,
      minimumScore: sliderValue === 100 ? Math.max(0, minimumScore) : minimumScore,
      mode,
      m: 2 * (sliderValue / 100),
    };
    localStorage.setItem('studyParams', JSON.stringify(payload));
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

  const sliderValue = Math.max(0, Math.min(100, slider));
  const derivedM = 2 * (sliderValue / 100);

  return (
    <>
      <div className="toolbar aqua">
        <button onClick={handleLearn} className="toolbtn play" title="Study">▶</button>
        <div className="sliderbox">
          <span>Learn</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={slider}
            onChange={(e) => {
              const value = Number(e.currentTarget.value);
              if (Number.isNaN(value)) {
                setSlider(0);
              } else {
                setSlider(Math.max(0, Math.min(100, Math.round(value))));
              }
            }}
          />
          <span>Review</span>
        </div>
        <label className="match-mode" title="Minimum score to include">
          <span className="match-mode__label">Minimum score</span>
          <select value={minimumScore} onChange={e=>setMinimumScore(parseInt(e.currentTarget.value, 10))}>
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
              <div>
                Study settings: slider = {sliderValue}% (m = {derivedM.toFixed(2)}), minimum score = {minimumScore}, sample size = {UNSCHEDULED_SAMPLE_COUNT}, match = {mode}
              </div>
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

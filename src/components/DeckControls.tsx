
'use client';

import { useEffect, useState } from 'react';
import { defaultMatchingMode, MatchingMode } from '@/lib/matching';
import { UNSCHEDULED_SAMPLE_COUNT } from '@/lib/constants';

export default function DeckControls({ stats }: { stats: {pairs:number}; }){
  const [q, setQ] = useState('');
  const [slider, setSlider] = useState(0);
  const [minimumScore, setMinimumScore] = useState(-1);
  const [mode, setMode] = useState<MatchingMode>(defaultMatchingMode());
  const [openInfo, setOpenInfo] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);

  useEffect(() => {
    const clampSliderValue = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    try {
      const raw = localStorage.getItem('studyParams');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      let sliderValue: number | null = null;
      if (typeof parsed.slider === 'number') {
        sliderValue = clampSliderValue(parsed.slider);
        setSlider(sliderValue);
      } else if (typeof parsed.m === 'number') {
        sliderValue = clampSliderValue((parsed.m / 2) * 100);
        setSlider(sliderValue);
      }
      if (typeof parsed.baseMinimumScore === 'number') {
        setMinimumScore(parsed.baseMinimumScore);
      } else if (typeof parsed.minimumScore === 'number') {
        if (sliderValue !== null && sliderValue >= 100) {
          setMinimumScore(-1);
        } else {
          setMinimumScore(parsed.minimumScore);
        }
      } else if (typeof parsed.min === 'number') {
        if (sliderValue !== null && sliderValue >= 100) {
          setMinimumScore(-1);
        } else {
          setMinimumScore(parsed.min);
        }
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

  useEffect(() => {
    if (!openSettings) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenSettings(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSettings]);

  function handleLearn(){
    const sliderValue = Math.max(0, Math.min(100, Math.round(slider)));
    const baseMinimumScore = minimumScore;
    const payload = {
      slider: sliderValue,
      minimumScore: sliderValue === 100 ? Math.max(0, baseMinimumScore) : baseMinimumScore,
      baseMinimumScore,
      mode,
      m: 2 * (sliderValue / 100),
    };
    localStorage.setItem('studyParams', JSON.stringify(payload));
    (document.getElementById('studyForm') as HTMLFormElement | null)?.requestSubmit();
  }

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
        <div className="toolbar__settings">
          <button
            onClick={() => setOpenSettings(true)}
            className="toolbtn"
            title="Study settings"
            type="button"
          >
            Settings
          </button>
        </div>
        <button onClick={()=>setOpenInfo(true)} className="toolbtn" title="Info">i</button>
        <div className="spacer"></div>
        <input id="searchBox" className="search" placeholder="Search" value={q} onChange={e=>setQ(e.currentTarget.value)} />
      </div>

      {openSettings && (
        <div className="toolbar-popover-backdrop" onClick={()=>setOpenSettings(false)}>
          <div className="toolbar-popover" onClick={e=>e.stopPropagation()}>
            <div className="toolbar-popover__header">
              <h2>Study settings</h2>
              <button className="icon" onClick={()=>setOpenSettings(false)} aria-label="Close study settings" type="button">×</button>
            </div>
            <div className="toolbar-popover__content">
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
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}

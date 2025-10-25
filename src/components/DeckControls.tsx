
'use client';

import { useEffect, useState } from 'react';
import { defaultMatchingMode, MatchingMode } from '@/lib/matching';
import { UNSCHEDULED_SAMPLE_COUNT } from '@/lib/constants';

type SaveState = {
  hasDirty: boolean;
  saving: boolean;
  isRefreshing: boolean;
};

const MINIMUM_SCORE_PRESETS = [
  { value: -1, label: 'Include new cards', helper: 'Matches the macOS “Include new cards” option (score ≥ -1).' },
  { value: 0, label: 'Review only (score ≥ 0)', helper: 'Same as the macOS “Review only” menu item.' },
  { value: 1, label: 'Score ≥ 1', helper: 'Focus on cards that have passed at least once.' },
  { value: 2, label: 'Score ≥ 2', helper: 'Stick to long-term cards that are already in rotation.' },
  { value: 3, label: 'Score ≥ 3', helper: 'Mirror the Genius Mac “Minimum Score 3” preset.' },
  { value: 4, label: 'Score ≥ 4', helper: 'Equivalent to Genius for concentrating on late-stage reviews.' },
] as const;

export default function DeckControls({ stats }: { stats: {pairs:number}; }){
  const [q, setQ] = useState('');
  const [slider, setSlider] = useState(0);
  const [minimumScore, setMinimumScore] = useState(-1);
  const [mode, setMode] = useState<MatchingMode>(defaultMatchingMode());
  const [openInfo, setOpenInfo] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ hasDirty: false, saving: false, isRefreshing: false });

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

  useEffect(() => {
    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<SaveState>).detail;
      if (!detail) return;
      setSaveState(detail);
    };
    window.addEventListener('deck-save-state', handler);
    return () => window.removeEventListener('deck-save-state', handler);
  }, []);

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
    const payload = {
      slider: sliderValue,
      minimumScore: sliderValue === 100 ? Math.max(0, minimumScore) : minimumScore,
      mode,
      m: 2 * (sliderValue / 100),
    };
    localStorage.setItem('studyParams', JSON.stringify(payload));
    (document.getElementById('studyForm') as HTMLFormElement | null)?.requestSubmit();
  }

  const sliderValue = Math.max(0, Math.min(100, slider));
  const derivedM = 2 * (sliderValue / 100);
  const minimumScorePreset =
    MINIMUM_SCORE_PRESETS.find((preset) => preset.value === minimumScore) ?? MINIMUM_SCORE_PRESETS[0];

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
        <button
          type="button"
          className="chip chip--primary"
          onClick={() => window.dispatchEvent(new CustomEvent('deck-save-request'))}
          disabled={!saveState.hasDirty || saveState.saving || saveState.isRefreshing}
        >
          {saveState.saving || saveState.isRefreshing ? 'Saving…' : 'Save changes'}
        </button>
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
              <div className="match-mode" aria-live="polite">
                <span className="match-mode__label">Learn ↔ Review slider</span>
                <span className="match-mode__hint">
                  Same control as the Genius macOS quiz window. Drag left to bias toward new pairs (m≈0), right to stay
                  with due reviews (m≈2). Current value: {sliderValue}% (m = {derivedM.toFixed(2)}).
                </span>
              </div>
              <label className="match-mode" title="Minimum score to include">
                <span className="match-mode__label">Minimum score</span>
                <select value={minimumScore} onChange={e=>setMinimumScore(parseInt(e.currentTarget.value, 10))}>
                  {MINIMUM_SCORE_PRESETS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="match-mode__hint">
                  Mirrors the macOS Genius “Minimum Score” pop-up: raise it to limit the quiz to cards that have already reached that stage.
                </span>
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
                Study settings: Learn ↔ Review slider at {sliderValue}% (m = {derivedM.toFixed(2)}), minimum score = {minimumScorePreset.label}, sample size = {UNSCHEDULED_SAMPLE_COUNT}, match = {mode}
              </div>
              <p className="muted">
                Learn/Review slider matches the macOS Genius probability slider (m = {derivedM.toFixed(2)}).{' '}
                {minimumScorePreset.helper}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

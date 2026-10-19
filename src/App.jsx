import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

const GOAL = 7;
const STORAGE_KEY = 'seven-pages-club-v1';
const now = new Date();
const todayKey = toKey(now);
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatMonth(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function formatSelectedDate(key) {
  const date = fromKey(key);
  return `${date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()} / ${date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}`;
}
function totalPages(entry) {
  return (entry?.sessions || []).reduce((sum, session) => sum + Math.max(0, Number(session.pages) || 0), 0);
}
function stateFor(total) {
  if (total <= 0) return 'empty';
  if (total < GOAL) return 'low';
  if (total === GOAL) return 'goal';
  return 'over';
}
function blankEntry() {
  return { sessions: [], note: '', word: '', meaning: '' };
}
function newSession(book = '', pages = '') {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, book, pages };
}
function makeSampleEntries(referenceDate) {
  const sample = {};
  const pages = [8, 7, 3, 0, 11, 9, 7, 4, 7, 14, 0, 8, 7, 7, 2, 7, 10, 7];
  const books = ['Behave', 'Dune Messiah', 'The Odyssey', 'Antifragile', 'No Longer Human', 'The Black Swan'];
  for (let day = 1; day <= Math.min(pages.length, referenceDate.getDate() - 1); day++) {
    const count = pages[day - 1];
    if (!count) continue;
    const key = toKey(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), day));
    sample[key] = { sessions: [newSession(books[(day - 1) % books.length], count)], note: '', word: '', meaning: '' };
    if (day === 13) {
      sample[key].word = 'liminal';
      sample[key].meaning = 'At a threshold or in-between state.';
    }
  }
  return sample;
}
function getInitialEntries() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
  } catch { /* local storage may be unavailable */ }
  const sample = makeSampleEntries(now);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sample)); } catch { /* ignore */ }
  return sample;
}
function computeChain(entries, goalOnly = false) {
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const qualifies = key => goalOnly ? totalPages(entries[key]) >= GOAL : totalPages(entries[key]) > 0;
  if (!qualifies(toKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let length = 0;
  for (let i = 0; i < 3660; i++) {
    if (!qualifies(toKey(cursor))) break;
    length++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return length;
}

export default function App() {
  const [entries, setEntries] = useState(getInitialEntries);
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [viewMonth, setViewMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [draft, setDraft] = useState({ sessions: [newSession()], note: '', word: '', meaning: '' });
  const [feedback, setFeedback] = useState('');
  const [lookupFeedback, setLookupFeedback] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInEmail, setSignInEmail] = useState('');
  const [signInMessage, setSignInMessage] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* local storage is optional */ }
  }, [entries]);

  useEffect(() => {
    const entry = entries[selectedKey] || blankEntry();
    setDraft({
      sessions: entry.sessions?.length ? entry.sessions.map(session => ({ ...session, id: session.id || newSession().id, pages: String(session.pages ?? '') })) : [newSession()],
      note: entry.note || '', word: entry.word || '', meaning: entry.meaning || ''
    });
    setFeedback('');
    setLookupFeedback('');
  }, [selectedKey, entries]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 2300);
    return () => window.clearTimeout(id);
  }, [toast]);

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstOffset = (new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay() + 6) % 7;
  const calendarCells = useMemo(() => {
    const cells = Array.from({ length: firstOffset }, (_, index) => ({ key: `blank-${index}`, blank: true }));
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
      cells.push({ key: toKey(date), day, date, blank: false });
    }
    while (cells.length % 7) cells.push({ key: `tail-${cells.length}`, blank: true });
    return cells;
  }, [daysInMonth, firstOffset, viewMonth]);

  const monthStats = useMemo(() => {
    const prefix = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}-`;
    const dates = Object.keys(entries).filter(key => key.startsWith(prefix) && totalPages(entries[key]) > 0);
    return { pages: dates.reduce((sum, key) => sum + totalPages(entries[key]), 0), days: dates.length };
  }, [entries, viewMonth]);

  const liveTotal = draft.sessions.reduce((sum, session) => sum + Math.max(0, Math.floor(Number(session.pages) || 0)), 0);
  const liveState = stateFor(liveTotal);
  const selectedDate = fromKey(selectedKey);
  const isFutureMonth = (year, month) => new Date(year, month, 1) > new Date(now.getFullYear(), now.getMonth(), 1);

  function selectDate(key) {
    setSelectedKey(key);
    const date = fromKey(key);
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }
  function changeMonth(delta) {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
    if (isFutureMonth(next.getFullYear(), next.getMonth())) return;
    const clampedDay = Math.min(fromKey(selectedKey).getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate());
    setSelectedKey(toKey(new Date(next.getFullYear(), next.getMonth(), clampedDay)));
    setViewMonth(next);
  }
  function updateSession(id, key, value) {
    setDraft(current => ({ ...current, sessions: current.sessions.map(session => session.id === id ? { ...session, [key]: value } : session) }));
    setFeedback('');
  }
  function addSession() {
    setDraft(current => ({ ...current, sessions: [...current.sessions, newSession()] }));
  }
  function removeSession(id) {
    setDraft(current => ({ ...current, sessions: current.sessions.length > 1 ? current.sessions.filter(session => session.id !== id) : [newSession()] }));
  }
  function saveDay(event) {
    event.preventDefault();
    const hasHalfFilled = draft.sessions.some(session => {
      const title = session.book.trim();
      const rawPages = String(session.pages).trim();
      if (!title && !rawPages) return false;
      if (!title || !rawPages) return true;
      const pages = Number(rawPages);
      return !Number.isFinite(pages) || pages <= 0;
    });
    if (hasHalfFilled) {
      setFeedback('Add both a book title and a page count, or remove the blank session.');
      return;
    }
    const sessions = draft.sessions
      .filter(session => session.book.trim() && String(session.pages).trim() && Number(session.pages) > 0)
      .map(session => ({ book: session.book.trim(), pages: Math.floor(Number(session.pages)) }));
    const entry = { sessions, note: draft.note.trim(), word: draft.word.trim(), meaning: draft.meaning.trim() };
    const hasContent = sessions.length || entry.note || entry.word || entry.meaning;
    setEntries(current => {
      const next = { ...current };
      if (hasContent) next[selectedKey] = entry;
      else delete next[selectedKey];
      return next;
    });
    setFeedback('Saved in this browser.');
    setToast(`Day saved · ${sessions.reduce((sum, session) => sum + session.pages, 0)} pages`);
  }
  function clearDay() {
    if (entries[selectedKey] && !window.confirm('Clear this day’s reading entry?')) return;
    setEntries(current => {
      const next = { ...current };
      delete next[selectedKey];
      return next;
    });
    setDraft({ sessions: [newSession()], note: '', word: '', meaning: '' });
    setFeedback('');
    setToast('Day cleared');
  }
  function clearHistory() {
    if (!window.confirm('Clear all reading history stored in this browser? This cannot be undone.')) return;
    setEntries({});
    setDraft({ sessions: [newSession()], note: '', word: '', meaning: '' });
    setToast('Reading history cleared');
  }
  async function lookupWord() {
    const word = draft.word.trim();
    if (!word) { setLookupFeedback('Enter a word first.'); return; }
    setLookupFeedback('Looking up a dictionary definition…');
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!response.ok) throw new Error('No entry');
      const data = await response.json();
      const definitions = (data[0]?.meanings || []).flatMap(item => item.definitions || []).map(item => item.definition).filter(Boolean);
      if (!definitions.length) throw new Error('No definition');
      setDraft(current => ({ ...current, meaning: current.meaning.trim() ? current.meaning : definitions[0] }));
      setLookupFeedback('Definition added. Rephrase it in your own words if that helps it stick.');
    } catch {
      setLookupFeedback('Could not retrieve a definition. Add it manually.');
    }
  }
  function submitSignIn(event) {
    event.preventDefault();
    setSignInMessage('Authentication is not connected in this prototype. Your entries are stored locally in this browser.');
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="edition"><strong>Reading practice</strong><br />No. 07 / Independent</div>
        <div className="mini-mark" aria-label="Seven Pages Club">seven pages</div>
        <button className="signin-link" onClick={() => { setSignInOpen(true); setSignInMessage(''); }}>
          Sign in <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </header>

      <main>
        <section className="masthead" aria-labelledby="page-title">
          <div className="eyebrow">A reading club for the long run</div>
          <h1 className="hero-title" id="page-title">Seven Pages Club</h1>
          <p className="hero-caption">Read anything <span>·</span> Seven pages a day <span>·</span> Keep going</p>
        </section>

        <section className="metrics-strip" aria-label="Reading statistics">
          <div className="metric"><div className="metric-label">Pages this month</div><div className="metric-value">{monthStats.pages.toLocaleString()} pages</div></div>
          <div className="metric"><div className="metric-label">Reading days</div><div className="metric-value">{monthStats.days} {monthStats.days === 1 ? 'day' : 'days'}</div></div>
          <div className="metric"><div className="metric-label">Current chain</div><div className="metric-value">{computeChain(entries)} {computeChain(entries) === 1 ? 'day' : 'days'}</div></div>
        </section>

        <section className="workspace" aria-label="Reading calendar and daily log">
          <section className="calendar-section" aria-labelledby="calendar-heading">
            <div className="section-heading">
              <div className="section-kicker" id="calendar-heading">Your reading record</div>
              <div className="month-switch">
                <button className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} strokeWidth={1.3} /></button>
                <div className="month-name">{formatMonth(viewMonth)}</div>
                <button className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month" disabled={isFutureMonth(viewMonth.getFullYear(), viewMonth.getMonth() + 1)}><ChevronRight size={16} strokeWidth={1.3} /></button>
              </div>
            </div>
            <div className="calendar-rule" />
            <div className="weekday-row" aria-hidden="true">{weekdays.map(day => <div className="weekday" key={day}>{day}</div>)}</div>
            <div className="calendar-grid" aria-label="Calendar dates">
              {calendarCells.map(cell => {
                if (cell.blank) return <div className="day-cell" key={cell.key} aria-hidden="true" />;
                const total = totalPages(entries[cell.key]);
                const state = stateFor(total);
                const future = cell.date > new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const classes = ['day-button', `is-${state}`];
                if (cell.key === selectedKey) classes.push('is-selected');
                if (cell.key === todayKey) classes.push('is-today');
                return (
                  <div className="day-cell" key={cell.key}>
                    <button type="button" className={classes.join(' ')} disabled={future}
                      aria-label={`${cell.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}: ${total} pages${cell.key === selectedKey ? ', selected' : ''}`}
                      aria-pressed={cell.key === selectedKey}
                      title={future ? 'Future date' : total > 0 ? `${total} pages` : undefined}
                      onClick={() => selectDate(cell.key)}>{cell.day}</button>
                  </div>
                );
              })}
            </div>
            <div className="calendar-legend" aria-label="Page goal states">
              <div className="legend-item"><span className="legend-symbol empty" />No entry</div>
              <div className="legend-item"><span className="legend-symbol low" />1–6 pages</div>
              <div className="legend-item"><span className="legend-symbol goal" />7 pages</div>
              <div className="legend-item"><span className="legend-symbol over" />8+ pages</div>
            </div>
            <div className="history-control"><span>{Object.keys(entries).length ? 'Example history · stored in this browser' : 'No reading history yet'}</span><button className="text-button" onClick={clearHistory}>Clear history</button></div>
          </section>

          <section className="day-panel" aria-labelledby="dayPanelTitle">
            <div className="panel-top">
              <div>
                <div className="date-overline">{formatSelectedDate(selectedKey)}</div>
                <h2 className="date-large" id="dayPanelTitle">The daily entry</h2>
              </div>
              <div className={`day-status state-${liveState}`}>{liveState === 'empty' ? 'Not logged' : liveState === 'low' ? 'Below goal' : liveState === 'goal' ? 'Goal complete' : 'Beyond goal'}</div>
            </div>
            <div className="progress-area">
              <div className="progress-copy"><span>{liveTotal} / {GOAL} pages</span><span className="muted">{liveTotal < GOAL ? `${GOAL - liveTotal} to go` : liveTotal === GOAL ? 'Goal met' : `${liveTotal - GOAL} beyond goal`}</span></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, liveTotal / GOAL * 100)}%` }} /></div>
            </div>
            <div className="form-rule" />
            <form onSubmit={saveDay}>
              <div className="form-section-heading"><h3>Reading sessions</h3><span className="section-kicker">Required</span></div>
              <div>
                {draft.sessions.map((session, index) => (
                  <div className="session-row" key={session.id}>
                    <div><label className="field-label" htmlFor={`book-${session.id}`}>Book title</label><input id={`book-${session.id}`} className="field" maxLength={140} placeholder="What are you reading?" value={session.book} onChange={event => updateSession(session.id, 'book', event.target.value)} /></div>
                    <div><label className="field-label" htmlFor={`pages-${session.id}`}>Pages read</label><input id={`pages-${session.id}`} className="field" type="number" min="0" max="99999" step="1" placeholder="0" value={session.pages} onChange={event => updateSession(session.id, 'pages', event.target.value)} /></div>
                    <button type="button" className="remove-session" aria-label={`Remove book session ${index + 1}`} title="Remove session" onClick={() => removeSession(session.id)}><X size={14} strokeWidth={1.25} /></button>
                  </div>
                ))}
              </div>
              <button className="add-book" type="button" onClick={addSession}><Plus size={11} strokeWidth={1.4} /> Add another book</button>

              <div className="optional-fields">
                <div className="optional-title"><h3>Keep a thought</h3><span>Optional</span></div>
                <div className="optional-field">
                  <label className="field-label" htmlFor="dayNote">What stayed with you?</label>
                  <textarea className="field" id="dayNote" placeholder="A thought, a question, a line worth remembering…" rows="3" value={draft.note} onChange={event => setDraft(current => ({ ...current, note: event.target.value }))} />
                </div>
                <div className="optional-field">
                  <label className="field-label" htmlFor="wordLearned">A word you learned</label>
                  <div className="word-row">
                    <div className="word-input-wrap"><input className="field" id="wordLearned" placeholder="e.g. liminal" autoComplete="off" value={draft.word} onChange={event => setDraft(current => ({ ...current, word: event.target.value }))} /><button type="button" className="lookup-button" onClick={lookupWord}>Look up ↗</button></div>
                    <input className="field definition-field" aria-label="Word meaning" placeholder="Meaning, in your words" value={draft.meaning} onChange={event => setDraft(current => ({ ...current, meaning: event.target.value }))} />
                  </div>
                  <div className="save-feedback" aria-live="polite">{lookupFeedback}</div>
                </div>
              </div>
              <div className="form-actions">
                <button className="save-button" type="submit"><span>Save day</span><ArrowUpRight className="arrow" size={16} strokeWidth={1.4} /></button>
                <button className="clear-day" type="button" onClick={clearDay}>Clear</button>
              </div>
              <div className="save-feedback" aria-live="polite">{feedback}</div>
            </form>
          </section>
        </section>
      </main>

      <footer className="footer">
        <div><span className="footer-mark">Seven Pages Club</span> / A little every day.</div>
        <div>Any book. Any order. Your own chain.</div>
      </footer>

      {signInOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSignInOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="signInHeading">
          <button className="modal-close" onClick={() => setSignInOpen(false)} aria-label="Close sign in"><X size={17} /></button>
          <div className="eyebrow">A place to return to</div>
          <h2 id="signInHeading">Sign in</h2>
          <p>Your reading record should follow you. Account sign-in is a visual prototype here; no account is created and no email is sent.</p>
          <form onSubmit={submitSignIn}>
            <label className="field-label" htmlFor="signInEmail">Email address</label>
            <input className="field modal-email" id="signInEmail" type="email" required placeholder="you@example.com" value={signInEmail} onChange={event => setSignInEmail(event.target.value)} />
            <button className="save-button" type="submit"><span>Continue</span><ArrowUpRight className="arrow" size={16} strokeWidth={1.4} /></button>
          </form>
          <div className="modal-message" aria-live="polite">{signInMessage}</div>
        </section>
      </div>}
      <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

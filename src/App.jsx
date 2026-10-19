import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const googleProvider = new GoogleAuthProvider();

const GOAL = 7;
const STORAGE_KEY = 'seven-pages-club-v1';
const now = new Date();
const todayKey = toKey(now);

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatMonth(date) {
  return `${date.toLocaleDateString('en-US', { month: 'long' })} ${String(date.getFullYear()).slice(-2)}`;
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
  const localEntriesRef = useRef(null);
  if (localEntriesRef.current === null) localEntriesRef.current = getInitialEntries();
  const entriesSourceRef = useRef('local');
  const [entries, setEntries] = useState(localEntriesRef.current);
  const [user, setUser] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [viewMonth, setViewMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [draft, setDraft] = useState({ sessions: [newSession()], note: '', word: '', meaning: '' });
  const [feedback, setFeedback] = useState('');
  const [lookupFeedback, setLookupFeedback] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [signInMessage, setSignInMessage] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (user || entriesSourceRef.current !== 'local') return;
    localEntriesRef.current = entries;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* local storage is optional */ }
  }, [entries, user]);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) {
      entriesSourceRef.current = 'local';
      setEntries(localEntriesRef.current);
      return undefined;
    }
    return onSnapshot(
      collection(db, 'users', user.uid, 'entries'),
      snapshot => {
        entriesSourceRef.current = 'cloud';
        setEntries(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()])));
      },
      () => setToast('Could not load your account entries')
    );
  }, [user]);

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

  useEffect(() => {
    if (!panelOpen) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') setPanelOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [panelOpen]);

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const tailDays = daysInMonth % 7;
  const tailStart = daysInMonth - tailDays + 1;
  const calendarCells = useMemo(() => {
    const cells = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
      cells.push({ key: toKey(date), day, date });
    }
    return cells;
  }, [daysInMonth, viewMonth]);

  const monthStats = useMemo(() => {
    const prefix = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}-`;
    const dates = Object.keys(entries).filter(key => key.startsWith(prefix) && totalPages(entries[key]) > 0);
    return { pages: dates.reduce((sum, key) => sum + totalPages(entries[key]), 0), days: dates.length };
  }, [entries, viewMonth]);

  const liveTotal = draft.sessions.reduce((sum, session) => sum + Math.max(0, Math.floor(Number(session.pages) || 0)), 0);
  const liveState = stateFor(liveTotal);
  const isFutureMonth = (year, month) => new Date(year, month, 1) > new Date(now.getFullYear(), now.getMonth(), 1);

  function selectDate(key) {
    setSelectedKey(key);
    const date = fromKey(key);
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setPanelOpen(true);
  }
  function changeMonth(delta) {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
    if (isFutureMonth(next.getFullYear(), next.getMonth())) return;
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
  async function saveDay(event) {
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
    const savedPages = sessions.reduce((sum, session) => sum + session.pages, 0);
    if (user) {
      try {
        const entryRef = doc(db, 'users', user.uid, 'entries', selectedKey);
        if (hasContent) await setDoc(entryRef, entry);
        else await deleteDoc(entryRef);
        setFeedback('Saved to your account.');
        setToast(`Day saved · ${savedPages} pages`);
      } catch {
        setFeedback('Could not save to your account. Check your connection and try again.');
      }
      return;
    }
    setEntries(current => {
      const next = { ...current };
      if (hasContent) next[selectedKey] = entry;
      else delete next[selectedKey];
      return next;
    });
    setFeedback('Saved in this browser.');
    setToast(`Day saved · ${savedPages} pages`);
  }
  async function clearDay() {
    if (entries[selectedKey] && !window.confirm('Clear this day’s reading entry?')) return;
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'entries', selectedKey));
      } catch {
        setFeedback('Could not clear this day in your account. Try again.');
        return;
      }
    } else {
      setEntries(current => {
        const next = { ...current };
        delete next[selectedKey];
        return next;
      });
    }
    setDraft({ sessions: [newSession()], note: '', word: '', meaning: '' });
    setFeedback('');
    setToast('Day cleared');
  }
  async function clearHistory() {
    if (!window.confirm('Clear all reading history? This cannot be undone.')) return;
    if (user) {
      try {
        const snapshot = await getDocs(collection(db, 'users', user.uid, 'entries'));
        await Promise.all(snapshot.docs.map(item => deleteDoc(item.ref)));
      } catch {
        setToast('Could not clear your account history');
        return;
      }
    }
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
  function openAuth(mode) {
    setAuthMode(mode);
    setSignInMessage('');
    setSignInOpen(true);
  }
  async function signInWithGoogle() {
    setSignInMessage('');
    try {
      await signInWithPopup(auth, googleProvider);
      setSignInOpen(false);
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') return;
      setSignInMessage(error.code === 'auth/operation-not-allowed'
        ? 'Google sign-in is not enabled for this Firebase project yet.'
        : 'Sign-in failed. Try again.');
    }
  }
  async function signOutUser() {
    await signOut(auth);
    setToast('Signed out · entries stay on this device');
  }

  return (
    <div className="page-shell">
      <header className="masthead" aria-labelledby="page-title">
        <span className="commit-mark" title={`${__COMMIT_COUNT__} commits`}>{__COMMIT_COUNT__}</span>
        <h1 className="hero-title" id="page-title"><span className="title-mark" aria-label="Seven"><span>7</span></span> Pages Book Club</h1>
        <nav className="account-links" aria-label="Account">
          <button className="account-link" onClick={user ? signOutUser : () => openAuth('signin')} title={user?.email || 'Sign in'}>Account</button>
        </nav>
      </header>

      <main>
        <section className="metrics-strip" aria-label="Reading statistics">
          <div className="metric"><div className="metric-label">Pages this month</div><div className="metric-value">{monthStats.pages.toLocaleString()}</div></div>
          <div className="metric"><div className="metric-label">Reading days</div><div className="metric-value">{monthStats.days}</div></div>
          <div className="metric"><div className="metric-label">Current chain</div><div className="metric-value">{computeChain(entries)}</div></div>
        </section>

        <section className="calendar-section" aria-label="Reading calendar">
            <div className="month-switch">
              <button className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} strokeWidth={3.2} /></button>
              <div className="month-name">{formatMonth(viewMonth)}</div>
              <button className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month" disabled={isFutureMonth(viewMonth.getFullYear(), viewMonth.getMonth() + 1)}><ChevronRight size={18} strokeWidth={3.2} /></button>
            </div>
            <div className="calendar-grid" aria-label="Calendar dates">
              {calendarCells.map(cell => {
                const total = totalPages(entries[cell.key]);
                const state = stateFor(total);
                const future = cell.date > new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const classes = ['day-button', `is-${state}`];
                if (cell.key === selectedKey) classes.push('is-selected');
                if (cell.key === todayKey) classes.push('is-today');
                return (
                  <div className="day-cell" key={cell.key} style={tailDays && cell.day === tailStart ? { gridColumnStart: 8 - tailDays } : undefined}>
                    <button type="button" className={classes.join(' ')} disabled={future}
                      aria-label={`${cell.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}: ${total} pages${cell.key === selectedKey ? ', selected' : ''}`}
                      aria-pressed={cell.key === selectedKey}
                      title={future ? 'Future date' : total > 0 ? `${total} pages` : undefined}
                      onClick={() => selectDate(cell.key)}>{cell.day}</button>
                  </div>
                );
              })}
            </div>
            <div className="history-control"><span>{user ? (user.email || 'Synced to your account') : Object.keys(entries).length ? 'Stored in this browser' : 'No reading history yet'}</span><button className="text-button" onClick={clearHistory}>Clear history</button></div>
        </section>
      </main>

      {panelOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPanelOpen(false); }}>
          <section className="day-panel" role="dialog" aria-modal="true" aria-labelledby="dayPanelTitle">
            <button className="drawer-close" onClick={() => setPanelOpen(false)} aria-label="Close daily entry"><X size={18} strokeWidth={1.2} /></button>
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
        </div>
      )}

      <aside className="index-legend" aria-label="Legend">
        <h2>Legend</h2>
        <div className="index-rule" />
        <ul>
          <li><span className="index-mark mark-goal">7</span><span>7 or more pages read; daily target completed.</span></li>
          <li><span className="index-mark mark-low">4</span><span>Fewer than 7 pages read, but an entry was logged; the reading streak is maintained.</span></li>
          <li><span className="index-mark mark-empty">9</span><span>No reading entry recorded; the reading streak is broken.</span></li>
          <li><span className="index-mark mark-today">*</span><span>Marks the current day.</span></li>
        </ul>
      </aside>

      <footer className="footer">
        <div><span className="footer-mark">Seven Pages Book Club</span> / A little every day.</div>
        <div>Any book. Any order. Your own chain.</div>
      </footer>

      {signInOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSignInOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="signInHeading">
          <button className="modal-close" onClick={() => setSignInOpen(false)} aria-label="Close sign in"><X size={17} /></button>
          <h2 id="signInHeading">{authMode === 'signup' ? 'Create a profile' : 'Sign in'}</h2>
          <p>{authMode === 'signup' ? 'Create a profile to keep your reading record across devices.' : 'Sign in to continue your reading record across devices.'}</p>
          <button className="save-button" type="button" onClick={signInWithGoogle}><span>Continue with Google</span></button>
          <div className="modal-message" aria-live="polite">{signInMessage}</div>
        </section>
      </div>}
      <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

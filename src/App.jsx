import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { quoteForDate } from './quotes.js';

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
function formatReceiptStamp(key) {
  const date = fromKey(key);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const rest = `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'long' })} ${date.getFullYear()}`.toUpperCase();
  return `${weekday}, ${rest}`;
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
function computeChain(entries) {
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const qualifies = key => totalPages(entries[key]) > 0;
  if (!qualifies(toKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let length = 0;
  for (let i = 0; i < 3660; i++) {
    if (!qualifies(toKey(cursor))) break;
    length++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return length;
}
function yearStats(entries, referenceDate) {
  const year = referenceDate.getFullYear();
  const prefix = `${year}-`;
  const keys = Object.keys(entries).filter(key => key.startsWith(prefix) && totalPages(entries[key]) > 0);
  const pages = keys.reduce((sum, key) => sum + totalPages(entries[key]), 0);
  const elapsedDays = (Date.UTC(year, referenceDate.getMonth(), referenceDate.getDate()) - Date.UTC(year, 0, 1)) / 86400000 + 1;
  const daysInYear = new Date(year, 1, 29).getDate() === 29 ? 366 : 365;
  // ponytail: two weeks and seven reading days is a deliberately conservative confidence gate
  const reliable = elapsedDays >= 14 && keys.length >= 7;
  const projected = reliable ? Math.round((pages / elapsedDays) * daysInYear / 10) * 10 : 0;
  return { pages, reliable, projected };
}
function blankEntry() {
  return { sessions: [] };
}
function newSession(book = '', pages = '') {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, book, pages, note: '' };
}
function makeSampleEntries(referenceDate) {
  const sample = {};
  const pages = [8, 7, 3, 0, 11, 9, 7, 4, 7, 14, 0, 8, 7, 7, 2, 7, 10, 7];
  const books = ['Behave', 'Dune Messiah', 'The Odyssey', 'Antifragile', 'No Longer Human', 'The Black Swan'];
  for (let day = 1; day <= Math.min(pages.length, referenceDate.getDate() - 1); day++) {
    const count = pages[day - 1];
    if (!count) continue;
    const key = toKey(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), day));
    sample[key] = { sessions: [newSession(books[(day - 1) % books.length], count)] };
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

export default function App() {
  const localEntriesRef = useRef(null);
  if (localEntriesRef.current === null) localEntriesRef.current = getInitialEntries();
  const entriesSourceRef = useRef('local');
  const [entries, setEntries] = useState(localEntriesRef.current);
  const [user, setUser] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [viewMonth, setViewMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [draft, setDraft] = useState({ sessions: [newSession()] });
  const [feedback, setFeedback] = useState('');
  const formRef = useRef(null);
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
    const sessions = entry.sessions?.length
      ? entry.sessions.map((session, index) => ({
          ...session,
          id: session.id || newSession().id,
          pages: String(session.pages ?? ''),
          note: session.note || (index === 0 ? entry.note || '' : '')
        }))
      : [{ ...newSession(), note: entry.note || '' }];
    setDraft({ sessions });
    setFeedback('');
  }, [selectedKey, entries]);

  useEffect(() => {
    if (!formRef.current) return;
    formRef.current.querySelectorAll('.receipt-note').forEach(note => {
      note.style.height = 'auto';
      note.style.height = `${note.scrollHeight}px`;
    });
  }, [draft.sessions, panelOpen]);

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

  const dailyQuote = quoteForDate(now);
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
    return { pages: dates.reduce((sum, key) => sum + totalPages(entries[key]), 0) };
  }, [entries, viewMonth]);
  const chain = computeChain(entries);
  const totalAll = Object.keys(entries).reduce((sum, key) => sum + totalPages(entries[key]), 0);
  const projection = yearStats(entries, now);

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
      if (!title && !rawPages && !session.note.trim()) return false;
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
      .map(session => ({ book: session.book.trim(), pages: Math.floor(Number(session.pages)), note: session.note.trim() }));
    const entry = { sessions };
    const hasContent = sessions.length > 0;
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

      <section className="daily-quote" aria-label="Quote of the day">
        <p className="daily-quote-text">“{dailyQuote.text}”</p>
        <p className="daily-quote-author">{dailyQuote.author}</p>
      </section>

      <main>
        <div className="club-layout">
        <article className="club-stat stat-one">
          <div className="stat-head"><span className="stat-index" aria-hidden="true">1</span><h3 className="stat-title">Pages This Month</h3></div>
          <p className="stat-copy">
            {monthStats.pages > 0
              ? <>You’ve read <strong>{monthStats.pages.toLocaleString()}</strong> {monthStats.pages === 1 ? 'page' : 'pages'} this month.</>
              : 'Your reading for this month starts here.'}
          </p>
          {monthStats.pages === 0 && <button className="stat-action" type="button" onClick={() => selectDate(todayKey)}>Start reading</button>}
        </article>

        <article className="club-stat stat-two">
          <div className="stat-head"><span className="stat-index" aria-hidden="true">2</span><h3 className="stat-title">Current Chain</h3></div>
          <p className="stat-copy">
            {chain > 0
              ? <>You’ve shown up to read for <strong>{chain}</strong> consecutive {chain === 1 ? 'day' : 'days'}.</>
              : 'Your next reading chain starts with one day.'}
          </p>
        </article>

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
        </section>

        <article className="club-stat stat-three">
          <div className="stat-head"><span className="stat-index" aria-hidden="true">3</span><h3 className="stat-title">Total Pages</h3></div>
          <p className="stat-copy">
            {totalAll > 0
              ? <>You’ve read <strong>{totalAll.toLocaleString()}</strong> {totalAll === 1 ? 'page' : 'pages'} since you started.</>
              : 'Every page counts. Your reading history begins with your first entry.'}
          </p>
        </article>

        <article className="club-stat stat-four">
          <div className="stat-head"><span className="stat-index" aria-hidden="true">4</span><h3 className="stat-title">Year-End Estimate</h3></div>
          <p className="stat-copy">
            {projection.reliable
              ? <>At your current pace, you’re projected to read <strong>{projection.projected.toLocaleString()}</strong> pages by the end of this year.</>
              : 'Your year-end estimate will appear once you’ve built up some reading history.'}
          </p>
        </article>
        </div>
      </main>

      {panelOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPanelOpen(false); }}>
          <section className="day-panel" role="dialog" aria-modal="true" aria-labelledby="dayPanelTitle">
            <button className="drawer-close" onClick={() => setPanelOpen(false)} aria-label="Close daily entry"><X size={18} strokeWidth={1.2} /></button>
            <div className="receipt-head">
              <h2 className="receipt-title" id="dayPanelTitle">Entry</h2>
              <p className="receipt-stamp">{formatReceiptStamp(selectedKey)}</p>
            </div>
            <form onSubmit={saveDay} ref={formRef}>
              {draft.sessions.map((session, index) => (
                <div className="receipt-session" key={session.id}>
                  <div className="receipt-field">
                    <label className="receipt-label" htmlFor={`book-${session.id}`}>Book Title:</label>
                    <input id={`book-${session.id}`} className="receipt-input" maxLength={140} placeholder="What are you reading?" value={session.book} onChange={event => updateSession(session.id, 'book', event.target.value)} />
                  </div>
                  <div className="receipt-field">
                    <label className="receipt-label" htmlFor={`pages-${session.id}`}>Pages Read:</label>
                    <input id={`pages-${session.id}`} className="receipt-input" type="number" min="0" max="99999" step="1" placeholder="0" value={session.pages} onChange={event => updateSession(session.id, 'pages', event.target.value)} />
                  </div>
                  <div className="receipt-field receipt-field-note">
                    <label className="receipt-label" htmlFor={`note-${session.id}`}>Note:</label>
                    <textarea className="receipt-note" id={`note-${session.id}`} rows="2" placeholder="A thought, a question, a line worth remembering…" value={session.note} onChange={event => updateSession(session.id, 'note', event.target.value)} />
                  </div>
                  <button type="button" className="remove-session" aria-label={`Remove book session ${index + 1}`} title="Remove session" onClick={() => removeSession(session.id)}><X size={13} strokeWidth={1.3} /></button>
                </div>
              ))}
              <button className="add-book" type="button" onClick={addSession}><Plus size={11} strokeWidth={1.5} /> Add another book</button>

              <div className="receipt-actions">
                <button className="save-button" type="submit"><span>Save</span></button>
              </div>
              <div className="save-feedback" aria-live="polite">{feedback}</div>
            </form>
          </section>
        </div>
      )}

      <aside className="index-legend" aria-label="Legend">
        <ul>
          <li><span className="index-mark mark-goal">7</span><span>7 or more pages read; daily target completed.</span></li>
          <li><span className="index-mark mark-low">7</span><span>Fewer than 7 pages read, but an entry was logged; the reading streak is maintained.</span></li>
          <li><span className="index-mark mark-empty">7</span><span>No reading entry recorded; the reading streak is broken.</span></li>
          <li><span className="index-mark mark-today"><span>7</span><span className="index-star">*</span></span><span>Marks the current day.</span></li>
        </ul>
      </aside>

      <footer className="club-footer">
        <span>© {now.getFullYear()} Seven Pages Book Club</span>
        <span>Made with love in Pune</span>
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

# Seven Pages Club

A daily reading tracker: log book sessions, watch your monthly page count and reading chain, keep a note and a word each day.

Live: https://seven-pages-club.vercel.app

## Run locally

```bash
npm install
npm run dev
```

## Stack

- React + Vite
- `lucide-react` for small line icons
- Custom CSS for the editorial layout and circle-state calendar
- `localStorage` for local persistence
- Dictionary lookup through `dictionaryapi.dev` (online only)

## Notes

- Sign-in is deliberately a visual placeholder; authentication is not connected.
- The first launch seeds illustrative reading history so the date-state design is visible. Use **Clear history** to remove it.
- Data is stored only in the current browser and is not synced across devices.
- `prototype/index.html` is the original self-contained static prototype.
- The interface uses Goudy Bookletter 1911 as a free, oldstyle/ink-drawn-feeling serif approximation and Space Mono for utility text.

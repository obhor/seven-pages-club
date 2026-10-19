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

## Firebase setup

Sign-in is Google via Firebase Auth; when signed in, entries live in Firestore at `users/{uid}/entries/{YYYY-MM-DD}`. Signed out, entries stay in `localStorage`.

Console steps for the `pages-book-club` project:

1. Authentication → Sign-in method → enable **Google**.
2. Authentication → Settings → Authorized domains → add the Vercel domain (`seven-pages-club.vercel.app`; `localhost` is there by default).
3. Create a **Firestore** database (production mode).
4. Deploy the rules in `firestore.rules`:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules
   ```

## Notes

- The first launch seeds illustrative reading history so the date-state design is visible. Use **Clear history** to remove it.
- Local entries are not uploaded on sign-in; the account starts from its own cloud data.
- `prototype/index.html` is the original self-contained static prototype.
- The interface uses a heavy Helvetica Neue-style sans for display type and Space Mono for utility text.

# Sample to PO FMS

Tracks every sample from creation through CAD drawing and approval,
purchase order, and receiving of materials.

- **Screens:** React (Vite)
- **Database:** Supabase project "SAMPLE TO PO FMS" (Mumbai)

## Run it on your computer

1. Install Node.js (version 20 or newer) if it is not already installed.
2. Open a terminal in this folder and run `npm install` (first time only).
3. Run `npm run dev` and open `http://localhost:3000`.

The sign-in page opens. The first time, choose "First time here?" to set up your sign-in.

## Folder layout

| Folder | What lives there |
|---|---|
| `src/components` | Reusable building blocks used by every screen |
| `src/pages` | One file per screen |
| `src/lib` | Shared helpers, including the database connection |
| `supabase/migrations` | Every database structure change, in order |
| `docs` | The project bible and other project notes |

## Rules for every screen

1. Every component is reusable: built once, used everywhere.
2. Every list has search, sort and a Google-Sheets-style filter.
3. Every image is clickable and opens in a popup with full screen, copy link and close.
4. Esc closes any popup or form. It asks "Discard changes?" only when there is unsaved work.
5. Every list has a column selector.
6. Everything works on a phone.
7. Every list can be grouped by up to two levels.
8. The side menu groups fold.
9. Every list exports to PDF, Excel and CSV.
10. Every master has Import with a downloadable template.
11. In every master, clicking a row opens Edit.
12. Every picture can be rotated, cropped and compressed while uploading.

## Project notes

| File | What it is |
|---|---|
| `docs/PROJECT_BIBLE.md` | The single source of truth, updated with every change |
| `docs/PROGRESS.md` | Done, in progress, and next |
| `docs/FUTURE.md` | Later ideas and things to settle before going live |
| `docs/DECISIONS.md` | Every important choice and the reason for it |

## Settings

Connection settings live in `.env.local`, which is never uploaded to GitHub.
`.env.example` shows which settings are needed.

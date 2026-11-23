# Project Bible: Sample to PO FMS

The single source of truth for this project. If this file and anything else disagree,
this file is fixed first. It is updated with every change, in the same save as the change.

Last updated: 23 Nov 2026

---

## 1. What this system is

One system that follows a style from the first sample all the way to materials arriving.
At any moment, anyone can pick a sample and see where it is stuck, or pick a purchase
order and see what has been received and what is still pending.

It is a fresh build, not the next version of the earlier sample system.

## 2. The flow

| Stage | What happens | Detail status |
|---|---|---|
| 1. Sample | A sample is created and moves through its steps, each step tracked | Steps not yet defined |
| 2. CAD | The CAD drawing is made for the sample and sent for approval | Not yet defined |
| 3. Purchase order | Once approved, a purchase order is raised for the materials | Not yet defined |
| 4. Receiving | Materials arrive against the purchase order, fully or in parts | Not yet defined |

Each stage is filled in here as it is discussed and agreed, one step at a time.

## 3. How it is built

| Part | Choice | Why |
|---|---|---|
| Screens | React (Vite), plain JavaScript | Built once, stays the same if the backend ever changes |
| Database and sign-in | Supabase | The system is too elaborate for Google Sheets: linked records, roles, many users at once |
| Version history | Git, stored on GitHub | Every change is saved and can be undone |

## 4. Where everything lives

| Thing | Location |
|---|---|
| Project folder | `C:\Users\User\Desktop\NG WEBAPPS\SAMPLE TO PO FMS` |
| GitHub repository | `NG-MIS/sample-to-po-fms` (private) |
| Supabase project | "SAMPLE TO PO FMS", Mumbai region, `https://hcddljhrqfblulzjfoby.supabase.co` |
| Connection settings | `.env.local` in the project folder (never uploaded to GitHub) |

Note: the Supabase account is on the free plan, which allows 2 active projects.
"NG OWN ERP" was paused on 23 Nov 2026 to make room. Its data is kept and it can be resumed
from the Supabase dashboard, but only if another project is paused first.

### Folder layout

| Folder | What lives there |
|---|---|
| `src/components` | Reusable building blocks used by every screen |
| `src/pages` | One file per screen |
| `src/lib` | Shared helpers, including the database connection |
| `supabase/migrations` | Every database structure change, in order |
| `docs` | This bible and the other project notes |

## 5. Standing rules for every screen

1. **Build once, use everywhere.** Every component is reusable. A screen never builds its own
   version of a table, form, popup or image viewer.
2. **Every list has search, sort and filter.** The filter works like Google Sheets: click a
   column heading, tick or untick values, combine filters across columns.
3. **Every image is clickable.** It opens in a popup with full screen, copy link and close.
4. **Esc closes any popup or form.** It asks "Discard changes?" only when there is unsaved
   work. With nothing to lose, it closes straight away.

## 6. How we work

1. One step at a time. A step is discussed, agreed, built, checked, then the next begins.
2. Understanding is confirmed in plain words before anything is built.
3. Questions are asked one at a time.
4. Every change updates this bible and `PROGRESS.md` in the same save.
5. Every database structure change is saved as a dated file in `supabase/migrations`.

## 7. Database structure

Empty. Nothing has been created yet.

## 8. Screens

| Screen | What it does | Status |
|---|---|---|
| Starter page | Shows the project name and whether the database is reachable | Working |

## 9. Reusable building blocks

None built yet. Planned first: table with search, sort and filter; popup box; image viewer; form.

## 10. People and access

Not yet defined: who uses the system and what each person can see and change.

## 11. Change log

Newest first.

| Date | Change |
|---|---|
| 23 Nov 2026 | Project uploaded to GitHub for the first time |
| 23 Nov 2026 | Project notes added: this bible, progress, future, decisions |
| 23 Nov 2026 | Project set up: Supabase project created, React starter in the project folder, GitHub repository created, starter page confirmed "Connected to the database" |

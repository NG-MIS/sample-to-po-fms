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
| 0. Masters and sign-in | People, departments, designations and roles are kept; people sign in | Built (step 1) |
| 1. Sample | A sample is created and moves through its steps, each step tracked | Sample creation built (step 2, see 2.1). Later steps not yet defined |
| 2. CAD | The CAD drawing is made for the sample and sent for approval | Not yet defined |
| 3. Purchase order | Once approved, a purchase order is raised for the materials | Not yet defined |
| 4. Receiving | Materials arrive against the purchase order, fully or in parts | Not yet defined |

Each stage is filled in here as it is discussed and agreed, one step at a time.

### 2.1 Sample creation (built)

| Header | How it gets filled |
|---|---|
| SL NO | Automatic running number |
| TIMESTAMP | Automatic, the moment of saving |
| ENTERED BY | Automatic, the signed-in person |
| SAMPLE NO | Automatic. The person picks a PREFIX; the system adds the next number of that series |
| CREATION DATE | Chosen by the person, defaulting to today. Earlier dates allowed, future dates not |
| DESIGNER | Required. Picked from active people whose department is "Sample" and who hold the role "Designer" |
| CONCEPT IMAGE | Required. Uploaded picture, clickable |
| REFERENCE | Optional. One choice from the References list, and one picture |
| REMARKS | Optional. Any number of typed notes, voice notes and pictures |

**Sample number.** Prefix, a dash, then the number with no padding: `LB-2323`, `VM-511`,
`ABC-100023`. Each prefix is its own series in the Numbering master, with its own starting
number. A number is given out exactly once, with no gaps, and never changes afterwards.
Once a series has been used, its prefix and starting number are locked.

**Who can do what with a sample.**

| Action | Who |
|---|---|
| Create | People with the role Designer, or authority All |
| Change after saving | Authority All only. The sample number never changes |
| Delete | Nobody |
| See | All: every sample. Self: samples they entered or are the designer of. Department(s): also samples whose enterer or designer belongs to one of their departments |

**Names the system depends on.** The department "Sample" and the role "Designer" are created
automatically and cannot be renamed or switched inactive, because they decide who is a designer.

Pick-list pattern for the whole system: each people pick-list is defined as "department X plus role Y".
Adding a person to the user master with that department and role makes them appear automatically.

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

Created by `supabase/migrations/20261123113937_masters_and_sign_in.sql`.

| Stored as | What it holds |
|---|---|
| `departments` | Department list: name, active or inactive |
| `designations` | Designation list: name, active or inactive |
| `roles` | Role list: name, active or inactive |
| `app_users` | The user master: name, email, phone, department, designation, authority, picture, sign-in on or off, active or inactive |
| `user_roles` | Which roles each person holds (a person can hold several) |
| `user_authority_departments` | Which departments a person works with when their authority is Department(s) |
| `avatars` (picture store) | Avatar pictures. Private: only signed-in people can view them |
| `sample_series` | Numbering master: prefix, starting number, last number used, active or inactive |
| `sample_reference_options` | References list: name, active or inactive |
| `samples` | One row per sample: sample number, creation date, designer, concept image, reference |
| `sample_remarks` | Remarks of a sample: typed notes, voice notes, pictures |
| `samples` (file store) | Concept images, reference images, remark pictures and voice notes. Private: a file can be viewed only by people who can see its sample |

Step 2 was created by `supabase/migrations/20261123130147_numbering_references_samples.sql`.
Samples are created and changed only through one database routine (`save_sample`), which
checks who is asking and gives out the sample number. Screens cannot write to samples directly.

Every row in the four lists records SL NO, TIMESTAMP and ENTERED BY automatically. The database
fills these itself, so a screen cannot fake them.

Rules the database enforces, whatever the screens do:

- Names in the three small lists are unique, ignoring capitals and spaces.
- Nothing in the masters can be deleted. Items and people are switched inactive instead.
- A person's email cannot be changed once they have set up sign-in.
- Sign-in on needs an email. Authority Department(s) needs at least one department.
- There must always be at least one active person with authority All who can sign in.

## 8. Screens

| Screen | What it does | Status |
|---|---|---|
| Sign-in | Sign in, first-time set-up, forgot password, choose new password | Built |
| User master | List, add and edit people, with avatar upload | Built |
| Departments | List, add and edit | Built |
| Designations | List, add and edit | Built |
| Roles | List, add and edit | Built |
| Numbering | List, add and edit series (prefix and starting number) | Built |
| References | List, add and edit | Built |
| Samples | List with search, sort and filter; new sample form; view; edit (authority All) | Built |

The simple lists (departments, designations, roles, references) share one screen file (`SimpleListPage`). The starter page from the
set-up has been replaced by these screens.

## 9. Reusable building blocks

All in `src/components`. A screen never builds its own version of these.

| Block | What it does |
|---|---|
| `DataTable` | Table with search box, click-to-sort headings and a Sheets-style filter on every column |
| `Modal` | Popup box for forms. Handles Esc, click outside, and "Discard changes?" when there is unsaved work |
| `ConfirmDialog` | Yes/no question on top of everything (inside `Modal.jsx`) |
| `ImageViewer` | Picture popup: full screen, copy link, open in new tab, close |
| `ClickableImage` | Thumbnail that opens the picture popup. Shows initials when there is no picture |
| `ImageUpload` | Picture field for forms: choose, preview, change, remove |
| `PickList` | Pick-list, single or multi-tick, with search |
| `RemarksEditor`, `RemarksView` | Remarks in a form (text, voice, pictures, any number of each) and their read-only display |
| `VoiceRecorder`, `VoiceNote` | Record a voice note from the microphone; play one back |
| `Popover` | Floating panel under a button, used by pick-lists and column filters |
| `Field`, `Tick`, `Badge` | Labelled form row, tick box, coloured yes/no label |
| `Layout`, `PageHead` | Menu on the left, signed-in person on top, screen heading |

Shared helpers in `src/lib`: database connection, sign-in state, Esc handling, picture links
and upload, data loading, date and error wording.

## 10. People and access

### The user master

Headers: NAME, EMAIL, PHONE, DEPARTMENT, DESIGNATION, ROLES (several), AUTHORITY, PICTURE,
SIGN-IN (on or off), STATUS (active or inactive), plus SL NO, TIMESTAMP and ENTERED BY.

- A person with sign-in off is only a name in pick-lists. Sign-in can be switched on later
  without entering them again.
- A person who leaves is switched inactive, never deleted, so old records keep their name.

### Authority

| Authority | Whose records the person works with |
|---|---|
| Self | Only the records they entered or are assigned to |
| Department(s) | Everything belonging to one or more chosen departments |
| All | Everything in the system, and can add or change the masters |

Today authority decides one thing: only All can add or change the masters, everyone else
can view them. Self and Department(s) start to matter when sample records exist.

### Sign-in

- Sign-in is by email and password.
- First time: the person opens "First time here?" on the sign-in page, types the email that is
  in the user master, and chooses their own password. An email arrives with a link to confirm.
  Nobody else ever knows the password.
- An email that is not in the user master, or has sign-in off, is refused.
- The very first person to set up sign-in becomes the first user, with authority All.
- Forgot password: a reset link is emailed.
- The app runs at `http://localhost:3000` on a computer, because that is the address the email
  links come back to.

## 11. Change log

Newest first.

| Date | Change |
|---|---|
| 23 Nov 2026 | Step 2 built: Numbering master, References list, sample creation with automatic sample number, reference, and remarks (text, voice, pictures) |
| 23 Nov 2026 | Step 1 built: department, designation and role lists, user master, sign-in, and all reusable building blocks |
| 23 Nov 2026 | Sample creation headers and the DESIGNER pick-list rule agreed |
| 23 Nov 2026 | Project uploaded to GitHub for the first time |
| 23 Nov 2026 | Project notes added: this bible, progress, future, decisions |
| 23 Nov 2026 | Project set up: Supabase project created, React starter in the project folder, GitHub repository created, starter page confirmed "Connected to the database" |

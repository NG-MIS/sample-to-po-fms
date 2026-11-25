# Progress

What is done, what is being worked on, and what comes next. Updated with every change.

Last updated: 24 Nov 2026

## Now

Step 3 (process log, piece completion, stage images, approval) is built. Waiting for Nihal
to try it against the real database.

To try step 3 the masters need: at least one process and one vendor, a person in department
Management (to approve), and a person with Department(s) authority that includes Sample
(to mark pieces completed). Authority All can do all of it in the meantime.

Before a sample can be created, the masters need: at least one series in Numbering, at
least one active person in department Sample with the role Designer, and at least one
component in Components. Product types and Collections already hold Nihal's starting
entries. The one sample created before components and category details existed (LB-3000)
has none; they must be picked the next time it is edited.

Next to discuss: the CAD stage (CAD drawing and its approval).

## Done

| Date | What |
|---|---|
| 23 Nov 2026 | Decided the build: React screens, Supabase database, fresh project |
| 23 Nov 2026 | Supabase project "SAMPLE TO PO FMS" created (Mumbai) |
| 23 Nov 2026 | React starter set up in the project folder, with version history |
| 23 Nov 2026 | Starter page confirmed "Connected to the database" on the office computer |
| 23 Nov 2026 | GitHub repository `NG-MIS/sample-to-po-fms` created |
| 23 Nov 2026 | Project notes added (bible, progress, future, decisions) |
| 23 Nov 2026 | Project uploaded to GitHub for the first time |
| 23 Nov 2026 | Sample creation headers agreed; DESIGNER pick-list = department "Sample" + role "Designer" |
| 23 Nov 2026 | Step 1 database: three small lists, user master, sign-in rules, private avatar store (19 rule checks passed) |
| 23 Nov 2026 | Step 1 screens: sign-in, user master, departments, designations, roles |
| 23 Nov 2026 | Reusable building blocks: table, popup, picture viewer, picture upload, pick-list (45 screen checks passed with stand-in data) |
| 23 Nov 2026 | First sign-in set up by Nihal on the real database (sign-up and email confirmation worked) |
| 23 Nov 2026 | Step 2 database: numbering master, references, samples, remarks, private file store (33 rule checks passed) |
| 23 Nov 2026 | Step 2 screens: Numbering, References, Samples with new, view and edit; remarks with text, voice and pictures (37 screen checks passed with stand-in data) |
| 23 Nov 2026 | Column selector on every list, and phone layout for every screen (38 more screen checks passed with stand-in data, at computer and phone size) |
| 24 Nov 2026 | Group by two levels on every list, folding side menu, emerald theme (31 more screen checks passed; all 151 screen checks pass with the new theme) |
| 24 Nov 2026 | Export to PDF, Excel and CSV on every list; import with template on every master (40 more screen checks passed with stand-in data; 191 in total) |
| 24 Nov 2026 | Clicking a row in a master opens Edit (14 more screen checks passed; 205 in total) |
| 24 Nov 2026 | Sample form tested by Nihal on the real database (prefix, designer and picture upload preview work); form rearranged into balanced sections |
| 24 Nov 2026 | Picture editor on every upload: rotate, crop, compress (23 more screen checks passed; 228 in total) |
| 24 Nov 2026 | Pictures fill the popup and the editor preview (9 more screen checks passed; 237 in total) |
| 24 Nov 2026 | First real sample created by Nihal: sample number, picture upload and save all work on the live database |
| 24 Nov 2026 | Components master and required COMPONENTS on samples (17 database rule checks passed; 244 screen checks pass in total) |
| 24 Nov 2026 | Category details on samples: PCS type, denim type, product type, collection (17 database rule checks passed; 255 screen checks pass in total) |
| 24 Nov 2026 | Step 3 database: processes, vendors, process log, completion, stage images, approvals with history (51 rule checks passed) |
| 24 Nov 2026 | Step 3 screens: sample detail with all actions, Process log, two masters (49 new screen checks, as five different kinds of person; 308 screen checks pass in total) |
| 24 Nov 2026 | Work tabs on the Samples screen: Process, Mark completed, Images, Approval (37 new screen checks; 345 pass in total) |
| 24 Nov 2026 | Approval rules revised: repeatable initial approval, changes-requested count, No closes the sample (35 database rule checks; 22 new screen checks, 369 pass in total) |
| 24 Nov 2026 | Reference pictures in Masters, several references per sample, Tags master and #tags on samples (26 database rule checks; 10 new screen checks, 379 pass in total) |
| 24 Nov 2026 | Series name in Numbering, shown on the sample form in place of the prefix (380 screen checks pass in total) |
| 24 Nov 2026 | Fabric list of a sample, Fabrics tab, Fabrics and Fabric vendors masters (24 database rule checks; 42 new screen checks, 424 pass in total) |
| 25 Nov 2026 | Fabrics tab: one row per sample with fabric status Pending, Incomplete, Completed (426 screen checks pass in total) |
| 25 Nov 2026 | Process and Mark completed tabs: one row per sample (427 screen checks pass in total) |
| 25 Nov 2026 | Design number assignment and the accessory list of a sample (31 database rule checks; 46 new screen checks, 475 pass in total) |
| 25 Nov 2026 | Wishlist: Sizes and ratios master, entries at final approval or later, Wishlist screen (29 database rule checks; 43 new screen checks, 520 pass in total) |

## Next, in order

1. Nihal tries step 3 against the real database
2. CAD stage
4. CAD stage
5. Purchase order stage
6. Receiving stage

## Open questions

- How does the CAD stage start: which samples go to CAD, and who makes and approves the drawing?

# Progress

What is done, what is being worked on, and what comes next. Updated with every change.

Last updated: 26 Nov 2026

## Now

Receiving, lot numbers and follow-ups are built (26 Nov 2026). Waiting for Nihal to try them.

To try them: put the store people in departments "Fabric store" and "Accessory store"
(both already created), add at least one fabric lot series and one accessory lot series in
Masters > Numbering, and check the receiving allowance there (10% to start).

Material lists and purchase orders are built (25 Nov 2026). Waiting for Nihal to try them.

To try them, authority All sets two things in Masters > Numbering, under Purchase orders:
the starting PO number (needed before the first PO) and the fabric tolerance %. Sizes and
ratios now has "Pcs of each size"; the existing rows were filled in (1:2 and 2:1 by segment,
the rest 1 of each). Fabric vendors and Accessory vendors must hold the vendors to order from.

Earlier notes:

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
| 25 Nov 2026 | CAD drawings (table view, new, copy, assign to wishlist, fabric by sample people) and the primary accessory list with size groups (41 database rule checks; 69 new screen checks, 591 pass in total) |
| 27 Nov 2026 | One drawing per fabric material list, with a Drawing dropdown when there are several (17 new screen checks, 881 pass in total) |
| 27 Nov 2026 | Wishlist items pick up the CADs of their sample, size and ratio by themselves; assigning removed (5 database rule checks; 864 screen checks pass in total) |
| 27 Nov 2026 | Approved samples without a wishlist item in Pending drawing, used counter on each CAD, message boxes for CAD creation and assigning (13 new screen checks, 871 pass in total) |
| 27 Nov 2026 | New CAD from Pending drawing is assigned to the clicked wishlist item on saving (5 new screen checks, 858 pass in total) |
| 26 Nov 2026 | CAD components and efficiency, accessory colour choice, same pcs per size group, sample picture on the CAD form, Send to process from the Process log, created message, image first, column choices kept per person, Tab in pick-lists (18 database rule checks; 853 screen checks pass in total) |
| 26 Nov 2026 | All, Completed and Running tabs on Samples and Process log; sample bars lined up; data centred and wrapped on every list (815 screen checks pass in total) |
| 26 Nov 2026 | Screen search in the side menu with Ctrl+K (14 new screen checks, 803 pass in total) |
| 26 Nov 2026 | Receiving of POs: two receiving screens, receipts in parts, lot numbers, mark complete, follow-ups, lot series and receiving allowance in Numbering (45 database rule checks; 55 new screen checks, 789 pass in total) |
| 26 Nov 2026 | Masters as tabs of one screen; CAD form starts with 5 rows and drops empty ones (17 new screen checks, 734 pass in total) |
| 26 Nov 2026 | Samples screen accordion style: collapsible sample bars and collapsible sections inside a sample (35 new screen checks, 717 pass in total) |
| 25 Nov 2026 | Material lists (four per wishlist item) and purchase orders, with open orders, PO PDF, Colours master, PO numbering and fabric tolerance (50 database rule checks; 88 new screen checks and 3 added to the wishlist checks, 682 pass in total) |

## Next, in order

1. Nihal tries material lists and purchase orders against the real database
2. What happens to received lots next (issue to production, stock)
3. Costing (mentioned, not explained yet)
4. Production lots and lot numbers

## Open questions

- Is the wishlist quantity for all colours together, or for each colour? The PO form fills in the
  quantity worked out for the wishlist quantity, and one number is multiplied by the number of colours.
- The rule for which fabric or accessory is primary and which is secondary (Nihal: "i will share the rule later").
- Several drawing rows with the same fabric come to the list as separate lines, and so as separate
  PO lines. Should the same fabric from one vendor be added up into one line?
- The photo of the cloth on POs (skipped for now).
- How the secondary accessory pending screen is to change.

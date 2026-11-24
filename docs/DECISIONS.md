# Decisions

Every important choice, with the reason, so nobody has to ask "why did we do it this way?".
Newest first. A changed decision is not deleted: a new entry is added that replaces it.

| Date | Decision | Reason |
|---|---|---|
| 24 Nov 2026 | Theme: soft emerald with glass-style panels, taken from the Lycra Tracker project. Buttons and links use a slightly deeper green than Lycra Tracker | Nihal asked for the Lycra Tracker look; the deeper green keeps white text on buttons easy to read |
| 24 Nov 2026 | Grouping and folded menu groups are remembered in the person's own browser | Personal conveniences, same as the column choice |
| 24 Nov 2026 | Every list can be grouped by up to two levels; side menu groups fold | Nihal's standing rules |
| 23 Nov 2026 | On a phone, lists are shown as cards and popups fill the screen | A wide table is unusable on a phone; nothing should scroll sideways |
| 23 Nov 2026 | Column choice is remembered per table in the person's own browser, not in the database | It is a personal convenience; another device simply starts with all columns |
| 23 Nov 2026 | Column selector on every list, built into the shared table | Nihal's standing rule |
| 23 Nov 2026 | The whole system must work on a phone | Nihal's standing rule |
| 23 Nov 2026 | Samples are written only through one database routine, never directly by a screen | The sample number and the who-may-do-what rules cannot be bypassed |
| 23 Nov 2026 | Department "Sample" and role "Designer" are created by the system and cannot be renamed or switched inactive | They decide who is a designer; renaming them would silently break the pick-list and the right to create |
| 23 Nov 2026 | Sample files are private; a file can be viewed only by people who can see its sample | Concept images are design work and should not leak |
| 23 Nov 2026 | Reference on a sample: one choice from a References list in Masters, plus one picture, both optional | Nihal chose a list he maintains himself |
| 23 Nov 2026 | Remarks on a sample: typed notes, voice notes and pictures, any number of each, all optional | Nihal's request |
| 23 Nov 2026 | Only authority All can change a sample after it is saved; nobody can delete one | Nihal: "authority all can change, no one else" |
| 23 Nov 2026 | Only people with the role Designer or authority All can create a sample | Nihal's rule |
| 23 Nov 2026 | Creation date defaults to today; earlier dates allowed, future dates not ("today" is counted in India time) | Agreed |
| 23 Nov 2026 | Sample number = prefix, dash, number with no padding. Several series, each with its own prefix and starting number from the Numbering master; the person picks the prefix | Matches how numbers are written today: LB-2323, VM-511, ABC-100023 |
| 23 Nov 2026 | Prefixes are stored in capitals, letters and digits only, up to 10 characters | "lb" and "LB" can never become two series |
| 23 Nov 2026 | A used series has its prefix and starting number locked | Old sample numbers must keep making sense |
| 23 Nov 2026 | The app runs on port 3000 on a computer | It is the address Supabase sends people back to from email links, so no dashboard setting is needed yet |
| 23 Nov 2026 | Pictures are stored privately and shown through temporary links; "Copy link" gives a link that works for 7 days | Avatars now, concept images later, should not be open to anyone on the internet |
| 23 Nov 2026 | The first person to set up sign-in becomes the first user with authority All | Someone has to exist before anyone can be added |
| 23 Nov 2026 | Sign-in by email and password; each person chooses their own password and confirms by an email link | Nobody else ever knows a person's password |
| 23 Nov 2026 | Only authority All can add or change the masters; everyone else can view | Keeps the lists clean |
| 23 Nov 2026 | Nothing in the masters is deleted, only switched inactive | Old records keep their names |
| 23 Nov 2026 | Department, designation and role are their own lists, picked and never typed | No spelling variations |
| 23 Nov 2026 | A person can hold several roles | Nihal: "multiple" |
| 23 Nov 2026 | People pick-lists are defined as "department X plus role Y"; DESIGNER = department Sample + role Designer | New people appear in the right lists automatically |
| 23 Nov 2026 | One people list: a person can be only a name, or also sign in | Some designers use the system, some do not; nobody is entered twice |
| 23 Nov 2026 | User master is built before sample creation | ENTERED BY and DESIGNER both point to people |
| 23 Nov 2026 | Esc asks before closing only when there is unsaved work | Otherwise the team must confirm every time they close a picture |
| 23 Nov 2026 | Every component reusable; search, sort and Sheets-style filter everywhere; every image opens in a popup | Same look and behaviour on every screen |
| 23 Nov 2026 | Plain JavaScript for the React code | Matches what the team already works in |
| 23 Nov 2026 | "NG OWN ERP" paused to free a Supabase slot | Free plan allows 2 active projects |
| 23 Nov 2026 | Brand new Supabase project, separate from every existing one | Build and change freely without touching anything live |
| 23 Nov 2026 | Supabase directly, not Google Sheets first (replaces the earlier plan) | The system is too elaborate for a sheet, and it avoids a move later |
| 23 Nov 2026 | React for the screens | Screens stay the same if the backend changes |
| 23 Nov 2026 | Fresh build, not the next version of the earlier sample system | A crisp restart |

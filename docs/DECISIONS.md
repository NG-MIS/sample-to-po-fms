# Decisions

Every important choice, with the reason, so nobody has to ask "why did we do it this way?".
Newest first. A changed decision is not deleted: a new entry is added that replaces it.

| Date | Decision | Reason |
|---|---|---|
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

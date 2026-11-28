# Project Bible: Sample to PO FMS

The single source of truth for this project. If this file and anything else disagree,
this file is fixed first. It is updated with every change, in the same save as the change.

Last updated: 24 Nov 2026

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
| 1. Sample | A sample is created and moves through its steps, each step tracked | Sample creation built (step 2, see 2.1). Process log, completion, stage images and approval built (step 3, see 2.2) |
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
| SAMPLE NO | Automatic. The person picks a series by its NAME; the system makes the number from that series' prefix and its next number |
| CREATION DATE | Chosen by the person, defaulting to today. Earlier dates allowed, future dates not |
| DESIGNER | Required. Picked from active people whose department is "Sample" and who hold the role "Designer" |
| COMPONENTS | Required, at least one. Several can be picked from the Components master |
| PCS TYPE | Automatic. The number of components: 1PCS, 2PCS, 3PCS and so on. Not stored, always worked out |
| DENIM TYPE | Required. Denim or Non denim (a fixed choice, not a master) |
| PRODUCT TYPE | Required. Picked from the Product types master |
| COLLECTION | Required. Picked from the Collections master |
| CONCEPT IMAGE | Required. Uploaded picture, clickable |
| REFERENCE | Optional. One or more choices from the References list. Each reference carries its own picture, uploaded once in Masters, so the picture appears on the sample by itself. A reference cannot be added from the sample form |
| TAGS | Optional. One or more #tags from the Tags list. A tag that is not in the list yet can be typed on the sample form and is added to the list when the sample is saved |
| REMARKS | Optional. Any number of typed notes, voice notes and pictures |

**Sample number.** Prefix, a dash, then the number with no padding: `LB-2323`, `VM-511`,
`ABC-100023`. Each prefix is its own series in the Numbering master, with its own starting
number. A number is given out exactly once, with no gaps, and never changes afterwards.
Once a series has been used, its prefix and starting number are locked. Every series also has
a name, which is what the sample form shows when choosing the series; the name can be changed
at any time and each name is used once.

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

### 2.1a Fabric list of a sample (built)

Every sample has its own fabric list: any number of fabric lines, entered on the New sample
form or later. Nothing here is needed to create a sample.

| Field | Rule |
|---|---|
| FABRIC NAME | Picked from the Fabrics list (the names used before). A name that is not in the list can be typed and is added to the list when the line is saved. The only field a line must have |
| FOR COMPONENTS | Optional. One or more, only from the components chosen on that sample. A component taken off the sample is taken off its fabric lines |
| VENDOR CODE | Optional. Picked from the Fabric vendors master. Samples always show the vendor's code, never the name |
| RATE | Optional. A number, 0 or more, up to 2 decimals |

After creation the list is changed from the Fabrics tab of the Samples screen or from the
opened sample, by the same people who update the sample's images: its designer, or a person
with department authority over Sample. On a closed sample the fabric list cannot be changed.
The same list for accessories comes next (see FUTURE).

**Fabric status** of a sample, worked out from its fabric lines:

| Status | When |
|---|---|
| Pending | The sample has no fabric line |
| Incomplete | It has fabric, but at least one of its components is not on any fabric line |
| Completed | Every component of the sample is on a fabric line |

The status shows in the Fabrics tab, in All samples and on the opened sample.

### 2.1b Accessory list of a sample (built)

Every sample also has its own accessory list, the draft made during sampling. Any number of
lines, entered on the New sample form or later. Nothing here is needed to create a sample.

| Field | Rule |
|---|---|
| ACCESSORY NAME | Picked from the Accessories list (the names used before), or typed new and added to the list when the line is saved. The only field a line must have |
| QTY TYPE | Optional: Quantity, Length or Dimension |
| QTY | Depends on the qty type. Quantity: a whole number of pieces (pcs). Length: a number in inches. Dimension: length x breadth, two numbers in inches. A qty needs its qty type first |
| VENDOR CODE | Optional. Picked from the Accessory vendors master (its own list, separate from fabric vendors). Samples show the vendor's code, never the name |
| RATE | Optional. A number, 0 or more, up to 2 decimals |
| REMARKS | Optional text, up to 500 characters |

Changed after creation from the Accessories tab or the opened sample, by the same people as
the fabric list; not on a closed sample. **Accessory status:** Pending while the sample has
no accessory line, Added once it has one. Unlike fabric, an accessory line is not tied to
components.

### 2.1c Design number (built)

A sample approved for production (final approval Yes) is given a design number. From then on
production refers to the design number (and lot number), and the sample number much less.

- One plain running series for all samples: no prefix. Its starting number is set once in
  Masters, under Numbering, by a person with authority All, and is locked after the first
  design number is given.
- The Design no tab of the Samples screen lists the samples with final approval Yes and no
  design number yet. Clicking Assign design number (after a confirmation) gives the sample the
  next number. Nothing is typed.
- A sample gets one design number, and it cannot be changed or taken back.
- Who: the same people who update the sample's images.
- Once a sample has a design number, its final approval can no longer be changed from Yes.

### 2.2 After creation: pieces, process log, stage images, approval (built)

These run side by side after a sample is created. None waits for another.

**Two physical pieces.** Every sample has a 1st sample piece and a 2nd sample piece, tracked
separately. The two are independent: the 2nd can start before the 1st is completed.

| Status of a piece | Meaning |
|---|---|
| Pending | In-house and not yet completed |
| At vendor | Sent out to at least one process and not yet received back |
| Completed | Marked completed. Nothing more can be sent for it |

**Process log.** One entry each time a piece is sent out: PIECE, PROCESS, VENDOR, SENT DATE,
and later RECD DATE. A piece can be in several processes at once. Process and vendor come from
their masters, and every entry has a vendor. The received date is entered later on the same
entry; it cannot be before the sent date, and no date can be in the future.

**Stage images.** Four per sample, in rising priority: concept (from creation), 1st sample,
2nd sample, photoshoot. The picture shown for a sample everywhere is the highest one that
exists. Uploading a stage image again replaces the earlier one.

**Approval.** For the sample as a whole, not for a piece, and with no precondition.

| Approval | Choices | Remarks | How many times |
|---|---|---|---|
| Initial approval | Yes, No, Maybe | Optional | Again and again while the latest one is Maybe |
| Final approval | Yes, No | Optional | Once |

- **Maybe means "changes requested".** The sample goes back for changes and can be given an
  initial approval again. Every round is kept with its remarks, who and when, and the number
  of times changes were requested is shown on the sample and in the lists.
- **Yes settles the initial approval.** No further initial approval; the final approval is next.
- **No closes the sample.** One No is enough. See "A closed sample" below.
- **The final approval can be given directly** without an initial approval, at any time before
  the sample is closed. After a final approval, no initial approval can be added.
- Every approval given or changed is kept in a history.

**A closed sample.** A sample is closed when its latest initial approval is No. Then
everything stops: no further approval, nothing more can be sent to a process, no piece can be
marked completed, and no stage image can be added or replaced. This holds for everyone,
authority All included. One exception: a piece that is already at a vendor can still be
received back, so the record of where it is stays true. A closed sample is reopened only by a
person with authority All changing that No.

**Who can do what after creation.**

| Action | Who |
|---|---|
| Send and receive process entries | The sample's designer, or Department(s) authority that includes Sample |
| Upload stage images | Same as above |
| Add or change the fabric list | Same as above |
| Add or change the accessory list | Same as above |
| Give a sample its design number | Same as above, and only after the final approval is Yes |
| Add a sample to the wishlist (first entry or repeats) | The people who approve: department Management, and authority All |
| Correct a wishlist entry | Authority All |
| Make or change a CAD, set up a primary accessory list | Department CAD, and authority All |
| Fill the fabric, vendor and rate of CAD rows | The sample's designer, or department authority over Sample |
| Mark a piece completed | Department(s) authority that includes Sample, and only when the piece is not At vendor |
| Give initial or final approval | Anyone in department Management |
| Change an approval, correct a process entry, reopen a completed piece | Authority All only |
| See every sample | Authority All, and everyone in department Management |

"Department(s) authority that includes Sample" means authority Department(s) with Sample among
the ticked departments. Authority All can do everything in this table.

**Names the system depends on** now also include the department "Management".

**Tabs on the Samples screen.** Each activity has its own tab, and a tab lists only what is
waiting for that activity. Each tab shows a count, and a row leaves its tab as soon as the
action is done.

| Tab | What it lists | Actions on a row | Who sees the tab |
|---|---|---|---|
| All samples | Every sample the person can see | Open, Edit (authority All) | Everyone |
| Process | One row per sample that still has a piece which is not completed, with the status of both pieces and what is out at which vendor. A closed sample is listed only while a piece is still at a vendor. Send asks which piece; Receive asks which one came back when more than one is out | Send, Receive | The sample's designer for their own samples; Sample department authority for all |
| Mark completed | One row per sample with a piece that is Pending (nothing out at a vendor, not completed) and may be completed now: the 2nd sample only after the 1st is completed. Shows the status of both pieces | Complete 1st, Complete 2nd (only for a Pending piece) | Sample department authority |
| Images | Samples still missing a 1st sample, 2nd sample or photoshoot image | Add (per missing image) | Same as Process |
| Fabrics | Every open sample the person looks after, one row per sample, with its fabric status, its fabrics, the components still without fabric and the vendor codes. The number on the tab counts samples that are not Completed | Add fabrics, Change fabrics | Same as Process |
| Accessories | Every open sample the person looks after, one row per sample, with its accessory status (Pending or Added), its accessories and the vendor codes. The number on the tab counts samples that are Pending | Add accessories, Change accessories | Same as Process |
| Approval | Samples with no final approval yet that are not closed | Initial approval (while it is not Yes), Final approval | Department Management |
| Design no | Samples with final approval Yes and no design number yet | Assign design number | Same as Process |

Sending and receiving share the Process tab, and the initial and final approval share the
Approval tab. Closed samples leave the Mark completed, Images and Approval tabs. A work tab lists only items the signed-in person may act on, and a tab the person can
never use is not shown to them. The chosen tab is kept in the page address, so a refresh or a
shared link opens the same tab. Opening a sample still shows its full picture and history.

### 2.3 Wishlist (built)

A sample approved for production (final approval Yes) goes to the wishlist: what it is to be
produced in. One sample can be in the wishlist many times.

| Field | Rule |
|---|---|
| WISHLIST ID | Automatic. The first entry of a sample is `SAMPLE NO-NEW`; every later one is a repeat: `SAMPLE NO-REPEAT-1`, `-2`, and so on |
| SIZE | Required. Picked from the Sizes and ratios master |
| RATIO | Only for a size that is made in ratios (22-38). Required there, starting at 1:1. Not asked for any other size |
| QTY | Required. A whole number of pieces, 1 or more. The screen also shows how many sets that is |

**Sizes and ratios master.** One row per allowed combination, with the pieces in one set:
22-38 in 1:1 (9 pieces), 1:2 (13) and 2:1 (14); 22-30 (5) and 32-38 (4) without a ratio. The
ratio is sets of 22-30 : sets of 32-38. New sizes and ratios are added here; a size is either
made in ratios or not.

**How a sample gets into the wishlist**
- *At approval:* when giving the final approval Yes, the approver may add one or more
  entries in the same step (the first NEW, the rest REPEAT-1, REPEAT-2...). Optional.
  Approval and entries are saved together, or not at all.
- *Newly approved:* a sample approved without entries waits in the Newly approved tab of the
  Wishlist screen until its first entry is added.
- *Add repeat:* the Add repeat tab lists samples already in the wishlist; any number of
  repeats can be added at one time.

**Who.** Entries are added by the people who approve samples: department Management (and
authority All). A person with authority All can correct the size, ratio or quantity of an
entry. Entries are never deleted. Once a sample is in the wishlist its final approval can no
longer be changed from Yes.

The Wishlist screen has three tabs: Wishlist (every entry), Newly approved, Add repeat.

### 2.4 CAD drawings (built)

A CAD is for one sample and one size (and ratio), and has one row per drawing. It is shown
and entered as a table like the CAD sheet. A sample can have many CADs; each is numbered
`SAMPLE NO-CAD-1`, `-2`, and so on.

Top line of the table: sample number, design number, size, ratio, number of drawings (the
count of rows), and the button for the primary accessory list.

| Column of a row | Rule | Filled by |
|---|---|---|
| PARTICULARS | Required. Picked from the names used before (CAD particulars master), or typed new | CAD department |
| FABRIC TYPE | Required. Primary or Secondary | CAD department |
| MSRMNT | Optional number, up to 2 decimals: the fabric length needed | CAD department |
| PAINA | Optional number: the fabric width in inches | CAD department |
| NO. OF PCS IN LAYER | Optional whole number | CAD department |
| NO OF PANELS | Optional whole number | CAD department |
| FABRIC | From the Fabrics list, or typed new | The people who look after the sample |
| VENDOR | Fabric vendor code | The people who look after the sample |
| RATE | Number, up to 2 decimals | The people who look after the sample |

- A CAD can be made only for a sample whose final approval is Yes.
- On the New CAD form several CAD tables can be entered at once for the same sample, and the
  rows can be copied from an existing CAD of that sample ("Copy as new CAD", "Copy rows from").
- **Wishlist items pick up their CADs by themselves (from 27 Nov 2026).** Every CAD of the
  same sample, size and ratio is a drawing of the wishlist item; all of them together when
  there are several. Nothing is assigned by hand: the Assign buttons and form are gone. The
  Pending drawing tab lists wishlist items that have no CAD of their sample, size and ratio.
  Making that CAD (from the row's New CAD, or anywhere) takes every such item off the list.
- **One drawing per fabric list.** Each drawing is a complete fabric list, so when a wishlist
  item has more than one CAD the primary fabric list has a "Drawing" dropdown and takes its
  rows from the chosen CAD only; the lists are never combined. Changing the drawing replaces
  the rows of the earlier one (rows added by hand stay). Once a row of the drawing is ordered
  or marked not required, the drawing cannot be changed. The secondary fabric list follows
  the drawing of the primary fabric list, with no dropdown of its own; if the primary list
  changes drawing later, the secondary list warns and offers to replace its rows. The chosen
  drawing is read from the rows of the list, nothing extra is stored; the screens keep this
  rule, the database does not check it. The drawing is named once on top of a fabric list
  (also when there is only one); each row shows only its PARTICULARS.
- **Approved samples not in the wishlist yet.** A sample with final approval Yes, no wishlist
  item and no CAD is also listed in Pending drawing ("Not in the wishlist yet"), with New CAD
  only; the size is chosen in the form. It leaves the list once its first CAD is made. A
  wishlist item added later shows as usual until a CAD of its size and ratio exists.
- **Used counter.** Each CAD shows "Used in material lists: N": the number of wishlist items
  whose fabric material list was made from its drawing rows (each item counted once). It is
  worked out on the screen from the material lists, nothing extra is stored.
- **Message box.** Creating a CAD shows a message box with the CAD number in large type and
  the wishlist items that now use it, like "Sample created". One shared component (`DoneBox`).
- **Keeping the size.** A CAD keeps its size and ratio once a material list was made from its
  rows; a wishlist item keeps its size and ratio once it has a material list. Until then both
  can be changed (the database enforces this).
- **Fabric pending** tab, for the people who look after the sample: CADs with a drawing row
  whose fabric, vendor or rate is still missing (from 27 Nov 2026; before, only a missing
  fabric counted). A CAD leaves it when every row has all three. Two views inside it: **All**,
  and **Partly filled** (some fabric details are entered, something is still missing). The
  WHAT IS MISSING column names each row and what it lacks.

**Who.** Department CAD (a fixed department name) and authority All make and change CADs,
assign them, and set up primary accessory lists. The fabric, vendor and rate of the rows are
filled by the people who can add images to the sample: its designer, or department authority
over Sample. The CAD department can see every sample, as Management can.

### 2.5 Primary accessory list (built)

One list per sample + size (+ ratio), shared by every wishlist item and CAD of that
combination. Set up by the CAD department, from the CAD table or the New CAD form.

| Field | Rule |
|---|---|
| ACCESSORY NAME | Required. From the Accessories list, or typed new |
| QTY TYPE | Required: Quantity, Length or Dimension |
| QTY | For one garment piece. Quantity: pieces. Length: number of pieces and inches each. Dimension: number of pieces, and length and breadth in inches |
| SIZES | The qty can differ by size. The single sizes of the range are shown as boxes; clicking a box ends a group there, and the next group starts after it. Groups follow one another and must reach the last size. An accessory that is the same for every size has one group |

The single sizes of each range (22-38 = 22, 24 ... 38) are kept in the Sizes and ratios master.
The sampling accessory list of a sample (2.1b) is separate and unchanged.

**Wishlist statuses so far:** CAD drawings, CAD accessory list (Added or Pending), and where
each of the four material lists stands (2.6).

### 2.6 Material lists of a wishlist item (built)

Every wishlist item has four lists of what must be bought for it. Screen: Material lists.

| List | How it is filled |
|---|---|
| Primary fabric | "Bring in from CADs" takes the drawing rows marked Primary of the CADs of the item's sample, size and ratio (fabric, Msrmnt, No. of pcs in layer, paina, vendor, rate). Rows with no fabric yet cannot be brought in. Lines can also be added by hand |
| Secondary fabric | The same, from the rows marked Secondary |
| Primary accessory | "Bring in primary accessory list" takes the list set up with the CADs for that sample + size + ratio (2.5). The person reviews it, changes it if needed, and adds vendor, rate and the Colour specific mark |
| Secondary accessory | Entered by hand, same fields as the primary one. The primary accessory list is shown on top, to look at only |

**Statuses of a list.** Pending until "Confirm list" is pressed. Updated once confirmed.
Ordered when every material on it has a PO or is marked Not required. A list with nothing on
it can be confirmed (nothing to order), and then counts as Ordered.

**Order of work.** Primary fabric first. Once it is Ordered, the item appears on the other
three pending tabs: primary accessory, secondary fabric, secondary accessory. (The secondary
accessory pending screen is to be changed later.) The tab "All wishlist items" shows all
four statuses; a status opens its list.

**Changing a list.** A material can be changed or removed, also after the list is confirmed,
until it is on a raised PO or marked Not required. From then on it is locked.

**Not required.** Per material, after the list is confirmed. Reason: Already in-house, or
Not required at all; optional remark. Only authority All can take the mark off again.

**How much to order.**
- Fabric, in metres: (Msrmnt / No. of pcs in layer + by-product cloth per garment) x wishlist
  quantity, plus the fabric tolerance %, then rounded up to the next 10. The by-product cloth
  is 0 when the row has none; with 0.1 mtr a garment, (8 / 16 + 0.1) x 900 = 540; with 5% = 567;
  ordered 570. Example: 9 / 18 x 900 = 450; with 5% = 472.5;
  ordered 480. The tolerance is one percentage, set in Masters > Numbering by authority All;
  a change applies to POs raised after it.
- Accessories: the wishlist quantity is split by size using "Pcs of each size" from the
  Sizes and ratios master (900 pcs at 22-38 1:1 = 100 of each size; 1300 at 1:2 = 100 each
  of 22-30 and 200 each of 32-38). Each size group of the accessory is then multiplied out.
  Quantity: total pieces. Dimension: pieces of each length x breadth. Length: pieces of each
  length, or the whole length in inches, as the person chooses on the PO.

**Who.** The people who can add images to the sample (its designer, or department authority
over Sample; authority All) fill and confirm the lists, mark Not required and raise POs.
Everyone who can see the sample can look.

### 2.7 Purchase orders (built)

Screen: Purchase orders (tabs: Purchase orders, PO lines). A PO is raised from a confirmed
material list.

- One PO = one wishlist item + one vendor. It carries every fabric (or every accessory) of
  that wishlist item that is confirmed, still to order, and has that vendor. Fabric and
  accessory POs are separate, as their vendors are separate masters.
- PO number: automatic, `PO-` and the next number. The starting number is set once in
  Masters > Numbering and is locked after the first PO. A cancelled PO keeps its number.
- Quantity and rate come filled in from the list and can be changed before raising.

| Field of a line | Rule |
|---|---|
| FABRIC NAME / ACCESSORY NAME, TYPE | From the list. Type is Primary or Secondary |
| DIMENSION | Accessories only. Each length, or length x breadth, is its own line |
| COLOURS NAME | Several, from the Colours master or typed new. Required for fabric, and for an accessory marked Colour specific. An accessory that is not colour specific has no colours |
| NO. OF COLOURS | The count of colours picked |
| QTY | The qty of one colour: one number is taken for every colour (100 with 3 colours = 300). Or one number per colour joined with +, like 100+200+300; the count must equal the number of colours. **Until a qty is typed**, the form divides what the line needs equally between the colours as they are picked, each share rounded up to the next 5 (700 mtr in 3 colours = 235 each, 705 in all), and says so under the line. Once a qty is typed it is kept as typed. A saved PO opens with the qty it was raised with |
| TOTAL QTY, AMOUNT | Worked out. Fabric in metres, accessories in pieces or inches |
| RATE | Required |
| PROMISE DAYS, PROMISED DATE OF DELIVERY | Promised date = order date + promise days. Per line; what is typed on the first line fills the lines that have none of their own |
| FOLDS, PAINA | Fabric only. Paina starts from the CAD row |

The photo of the cloth is left out for now, to be added later.

**Open order.** A free PO for anything: any vendor, any fabric or accessory (typed new if
needed), remarks, and an optional link to a wishlist item or a sample. Raised by the people
who look after samples, or the designer of any sample.

**After raising.** Only authority All can change or cancel a PO. Cancelling asks for a
reason; the materials of a cancelled PO can be ordered again. Every PO can be downloaded
as a PDF.

**Receiving of materials** against POs is in 2.8.

### 2.8 Receiving, lot numbers and follow-ups (built)

Screens: Fabric receiving and Accessory receiving (separate, one per kind). Tabs on each:
Pending, Late, Partly received, Received, All lots. Opening a PO shows its items colour by
colour, its receipts and its follow-ups.

**Who.** Department "Fabric store" receives fabric POs, department "Accessory store" receives
accessory POs (both fixed department names); authority All can do both. The store
departments can see every sample, as Management and CAD do.

**A receipt.** For one PO; a PO can have many (it can come in parts).

| Field | Rule |
|---|---|
| RECEIVED DATE | Required. Not in the future, not before the order date |
| BILL NUMBER, BILL DATE | Required |
| PHOTO | Optional |
| QUANTITY | For each colour of each item; fill only what came now. An item with no colours has one row |
| LOT NUMBER SERIES | Asked only when an item is received for the first time |
| ITEM RECEIVED | At the first receipt of an item its name can be changed to what actually came (from the Fabrics or Accessories list, or typed new). The PO keeps the ordered name; the lot shows both |

**Lot numbers.** Every PO item gets one number at its first receipt, from the lot series
the person picks, and keeps it however many parts it comes in. Each colour gets a letter in
the order the colours are written on the PO: FB-1234-A, FB-1234-B. An item with no colours
is -A. Lot series are kept in Masters > Numbering, separately for fabric and accessories:
series name, prefix, starting number; prefix and starting number lock once used.

**When something is complete.**
- Receiving allowance: one percentage in Masters > Numbering, 10% to start.
- A colour is Received once what has come is at least the ordered quantity less the
  allowance (91 of 100 at 10%). An item is Received when all its colours are.
- More than ordered is accepted. More than the allowance over is flagged Excess.
- "Mark complete" closes an item that is partly received and will not get more: Short
  received. Nothing more can then be received against it; authority All can open it again.
- A PO is Pending (nothing came), Partly received, or Received (every item received or
  closed short).

**Follow-ups.** Date, what the vendor said, and a new promised date when given. Added by the
store people of that kind, whoever raised the PO, and the people who may raise POs for its
sample. The promised date of a PO is the one from the latest follow-up that gave one,
otherwise the latest promised date on the PO. A PO is Late when today is past it and the
PO is not fully received.

**After receiving.** A PO with a receipt can no longer be changed or cancelled. Only
authority All can remove a wrong receipt (its quantities stop counting; lot numbers given
stay). The wishlist and Material lists show a list as Received once everything ordered on
it has come or was closed short. Purchase orders shows the receiving status of each PO and
opens the same receiving and follow-ups view.


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
5. **Every list has a column selector.** The person ticks which columns to show. The choice is
   remembered per table, in their own browser. Hiding a column also drops its filter and sort,
   and search only looks at the columns on screen.
6. **Everything works on a phone.** On a screen 720px wide or narrower: rows are shown as
   cards instead of a wide table, sort and filter are reached from one "Sort and filter"
   button, the menu becomes a drawer, popups and forms fill the whole screen, form fields
   stack one per row, and nothing scrolls sideways.
7. **Every list can be grouped by up to two levels.** The person picks a first-level column
   and, if wanted, a second-level column. Rows sit under group headings that show a count and
   fold when clicked. Grouping works together with search, sort, filter and the column
   selector, and is remembered per table in the person's own browser.
8. **The side menu folds.** Each menu group (Sampling, Masters, and later ones) can be folded
   and opened; the choice is remembered in the person's own browser.
9. **Every list exports to PDF, Excel and CSV.** The export is exactly what is on screen:
   the shown columns, and the rows left after search and filters, in the order shown
   (including group order). Pictures and buttons are left out. Anyone who can see a list
   can export it.
10. **Every master has Import with a downloadable template.** The template is an Excel file
    with the right headings and a "How to fill" sheet. The person fills it, chooses the file
    (Excel or CSV), and sees every row checked before anything is saved. Import only ADDS
    rows: rows that already exist are skipped and reported, rows with a problem are left out
    with the reason shown, and nothing existing is ever changed. Only authority All can import.
11. **In every master, clicking a row opens Edit.** It works for people who may edit
    (authority All); for everyone else a row click does nothing. Pictures, buttons and group
    headings inside the row keep their own job. The Edit button stays as well.
12. **Every picture can be edited while uploading.** Choosing a picture opens the picture
    editor: rotate left or right, crop (drag the box or its corners, or pick a square), and
    compress (Best quality, Balanced, Smallest file), with the original and finished file
    size shown. The finished picture is saved as a JPG. Where several pictures are added at
    once (remarks), they are compressed automatically and each can be opened in the editor.
    A chosen picture may be up to 25 MB; the finished one must be 5 MB or less.
13. **Every picture view fits its space.** In the picture popup and in the picture editor,
    the picture is enlarged or reduced to fill the space available, with the whole picture
    visible and its shape kept. A small picture is never shown small in a large popup.
    Thumbnails in lists and forms also show the whole picture, with empty space at the sides
    when the picture is not square; nothing is trimmed.

### Look and feel

On every list the headings and the data are centred, and long text wraps onto more lines
instead of being cut or pushing the list wide.

Soft emerald theme in the family of the Lycra Tracker project: pale green background,
white glass-style panels with a faint green edge, deep green side menu, emerald accents,
rounded corners. All colours are set in one place at the top of `src/index.css`, so the
theme can be changed without touching any screen.

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
| `sample_series` | Numbering master: series name, prefix, starting number, last number used, active or inactive |
| `sample_reference_options` | References list: name, picture, active or inactive |
| `sample_references` | Which references each sample has |
| `tags` | Tags list: name (kept without the # sign), active or inactive |
| `sample_tags` | Which tags each sample has |
| `fabric_vendors` | Fabric vendors master: vendor name, vendor code, active or inactive |
| `fabrics` | Fabrics list: the fabric names, active or inactive |
| `sample_fabrics` | The fabric lines of each sample: fabric, vendor, rate |
| `sample_fabric_components` | Which components each fabric line is for |
| `accessory_vendors` | Accessory vendors master: vendor name, vendor code, active or inactive |
| `accessories` | Accessories list: the accessory names, active or inactive. `is_primary` marks the ones in the primary accessory master, with `default_qty_type` as the unit their table starts with |
| `sample_accessories` | The accessory lines of each sample: accessory, qty type, qty, breadth, vendor, rate, remarks |
| `design_series` | The one design number series: starting number and last number given |
| `size_ratios` | Sizes and ratios master: size, ratio (empty for a size without ratios), pieces in a set, active or inactive |
| `wishlist_entries` | Wishlist: wishlist id, sample, repeat number (0 = NEW), size and ratio, quantity in pieces |
| `cad_particulars` | CAD particulars master: the names of drawing rows |
| `cads` | One row per CAD: CAD number, sample, size and ratio |
| `cad_rows` | The drawing rows of each CAD, with their fabric, vendor and rate |
| `cad_wishlist` | No longer used (27 Nov 2026): a wishlist item uses every CAD of its sample, size and ratio. Kept with its old rows, to be removed later |
| `primary_accessory_lines` | The lines of each primary accessory list (sample + size and ratio), with their size groups. `details_filled` = false while the details of an accessory are still to be filled (no groups yet) |
| `samples` | One row per sample: sample number, creation date, designer, concept image |
| `sample_remarks` | Remarks of a sample: typed notes, voice notes, pictures |
| `components` | Components master: name, active or inactive |
| `sample_components` | Which components each sample has |
| `product_types` | Product types master (started with CAPRI SET, PLAZZO SET, FULL PANT SET, HOT PANT SET, SKIRT TOP, FROCK, KURTI SET) |
| `collections` | Collections master (started with EID 2027, SUMMER 2027) |

Denim type, product type and collection are stored on the sample itself. They are empty on
samples created before 24 Nov 2026 and required on every sample saved from then on.
| `samples` (file store) | Concept images, reference pictures, remark pictures and voice notes. Private: a file can be viewed only by people who can see its sample; reference pictures can be viewed by every signed-in person |

Step 2 was created by `supabase/migrations/20261123130147_numbering_references_samples.sql`.
Components were added by `supabase/migrations/20261124071841_sample_components.sql`,
category details by `supabase/migrations/20261124073301_sample_category_details.sql`, and
step 3 by `supabase/migrations/20261124082250_sample_processes_images_approvals.sql`, and the
revised approval rules by
`supabase/migrations/20261124103219_initial_approval_rounds_and_closed_samples.sql`.

| Stored as (step 3) | What it holds |
|---|---|
| `processes`, `vendors` | The two new masters |
| `sample_process_entries` | Process log: piece, process, vendor, sent date, received date, who and when |
| `sample_piece_completions` | A row means that piece is completed: who and when |
| `sample_stage_images` | The 1st sample, 2nd sample and photoshoot image of each sample |
| `sample_approvals` | Every initial approval round of each sample, and its final approval |
| `sample_approval_history` | Every approval ever given or changed |

| `material_lists`, `material_items` | The four material lists of every wishlist item and what is on them, with the Not required mark |
| `purchase_orders`, `po_lines` | Every PO and its lines; `purchase_settings` holds the PO number series and the fabric tolerance; `colours` is the Colours master |

| `po_receipts`, `po_receipt_items` | Every receipt against a PO and the quantity of each colour; the lot number and received item are kept on the PO line |
| `po_followups` | Follow-ups with the vendor |
| `lot_series` | The lot number series for fabric and accessories |

Receiving is written only through `save_po_receipt`, `delete_po_receipt`, `complete_po_line` and `add_po_followup`.

Material lists and POs are written only through `save_material_list`,
`mark_material_not_required`, `save_purchase_order` and `cancel_purchase_order`.

Like samples, all of these are written only through database routines that check who is
asking: `send_sample_process`, `receive_sample_process`, `correct_sample_process`,
`complete_sample_piece`, `reopen_sample_piece`, `set_sample_stage_image`, `set_sample_approval`.
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

All the masters below are tabs of one screen, Masters, sorted alphabetically. The menu has one
Masters link.

| Screen | What it does | Status |
|---|---|---|
| Sign-in | Sign in, first-time set-up, forgot password, choose new password | Built |
| User master | List, add and edit people, with avatar upload | Built |
| Departments | List, add and edit | Built |
| Designations | List, add and edit | Built |
| Roles | List, add and edit | Built |
| Numbering | List, add and edit series (series name, prefix and starting number). Also shows the design number series, where authority All sets its starting number, Purchase orders (the starting PO number, the fabric tolerance % and the receiving allowance %), and the lot number series for fabric and accessories | Built |
| References | List, add and edit, each with its picture (required when added by hand; an imported reference gets its picture afterwards) | Built |
| Tags | List, add and edit. Shown with a # in front | Built |
| Fabrics | List, add and edit the fabric names | Built |
| Fabric vendors | List, add and edit: vendor name and vendor code (each code used once) | Built |
| Accessories | List, add and edit the accessory names | Built |
| Primary accessories | The primary accessory master: name, default unit (Quantity, Length or Dimension), active. Add, edit, import. Kept in the accessories list, marked primary: adding a name that is already an accessory marks that one; unticking "Primary accessory" takes it out of this master only | Built |
| Accessory vendors | List, add and edit: vendor name and vendor code (each code used once) | Built |
| Sizes and ratios | List, add and edit the size and ratio combinations (pcs in a set, single sizes, pcs of each size), with import | Built |
| Wishlist | Tabs: Wishlist (all entries), Newly approved, Add repeat. Add to wishlist and Add repeat popups; Edit for authority All | Built |
| CAD drawings | Tabs: CAD drawings (each CAD as a table), Pending drawing, Fabric pending, All rows. New CAD, Copy as new CAD, Edit, Fill fabric, primary accessory list | Built |
| CAD particulars | List, add and edit the names of drawing rows | Built |
| Material lists | Tabs: one pending tab per list (primary fabric, primary accessory, secondary fabric, secondary accessory) and All wishlist items. Opens a list to fill, confirm, mark Not required and raise POs | Built |
| Purchase orders | Tabs: Purchase orders, PO lines. View a PO, PDF, Open order; Change and Cancel for authority All; receiving status and the receiving and follow-ups view | Built |
| Fabric receiving | Fabric POs. Tabs: Pending, Late, Partly received, Received, All lots. Receive material, follow-ups, mark complete | Built |
| Accessory receiving | The same for accessory POs | Built |
| Colours | List, add and edit the colour names used on POs | Built |
| Components | List, add, edit and import | Built |
| Product types | List, add, edit and import | Built |
| Collections | List, add, edit and import | Built |
| Samples | The All samples tab is a list of collapsible bars: a closed bar shows the picture, sample number and the important details and statuses; clicking it opens the sample right under it. An opened sample has seven collapsible sections (details, stage images, fabrics, accessories, pieces and process log, approval, remarks), all closed at first, each bar showing its summary. Search, sort, filter, group and export work on every detail; Columns chooses what the closed bar shows. New sample form; edit (authority All). The work tabs stay as tables and open a sample in a popup with the same sections | Built |
| Process log | Every process entry of every sample, in tabs All, Completed (received back) and Running (still at the vendor); clicking a row opens the sample | Built |
| Processes | List, add, edit and import | Built |
| Vendors | List, add, edit and import | Built |

The simple lists (departments, designations, roles, references, tags, fabrics, fabric vendors, accessories, accessory vendors, colours, components, product types, collections, processes, vendors) share one screen file (`SimpleListPage`). The starter page from the
set-up has been replaced by these screens.

## 9. Reusable building blocks

All in `src/components`. A screen never builds its own version of these.

| Block | What it does |
|---|---|
| `DataTable` | With `renderExpanded` it draws collapsible bars instead of a table (used by All samples). Otherwise: table with search box, click-to-sort headings, a Sheets-style filter on every column, a column selector, grouping by up to two levels, and export to PDF, Excel and CSV. Turns into cards on a phone |
| `Modal` | Popup box for forms. Handles Esc, click outside, and "Discard changes?" when there is unsaved work |
| `ConfirmDialog` | Yes/no question on top of everything (inside `Modal.jsx`) |
| `ImageViewer` | Picture popup: full screen, copy link, open in new tab, close |
| `ClickableImage` | Thumbnail that opens the picture popup. Shows initials when there is no picture |
| `ImageUpload` | Picture field for forms: choose, edit, preview, change, remove |
| `ImageEditor` | Picture editor shown on upload: rotate, crop, compress |
| `PickList` | Pick-list, single or multi-tick, with search |
| `ImportButton` | Import for a master: template download, file check with a preview of every row, then import |
| `RemarksEditor`, `RemarksView` | Remarks in a form (text, voice, pictures, any number of each) and their read-only display |
| `VoiceRecorder`, `VoiceNote` | Record a voice note from the microphone; play one back |
| `Popover` | Floating panel under a button, used by pick-lists and column filters |
| `Field`, `Tick`, `Badge` | Labelled form row, tick box, coloured yes/no label |
| `Tabs` | A row of tabs, each with a count of what is waiting |
| `ScreenSearch` | Search box on top of the side menu that finds any screen, and each master, by name. Ctrl+K (Cmd+K on a Mac) jumps to it; arrow keys and Enter open a result |
| `Fold` | A section that opens and closes; its bar always shows the title, a short summary and an optional button |
| `Layout`, `PageHead` | Menu on the left with folding groups (a drawer on a phone), signed-in person on top, screen heading |

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
| 28 Nov 2026 | Lists that are **Not required**. A wishlist item's list shows Not required instead of Pending, and counts as dealt with, when: (secondary fabric) its drawing has no secondary fabric row - worked out on the screen from the drawing its primary fabric list was made from, or else every CAD of its size; (primary accessory) the CAD team marked the sample and size as having no primary accessory, with "Not required" on the empty primary accessory list (`primary_accessory_none`, `set_primary_accessory_not_required`) - this also takes it off Accessory pending; (secondary accessory) the people who look after the sample chose "Not required" on the empty secondary accessory list (`material_lists.not_required_at`, `set_material_list_not_required`). The two marks can be undone, and adding an accessory takes them away. Shown on the Wishlist, Material lists, the CAD and inside each list (migration `lists_not_required`) |
| 28 Nov 2026 | **By-product consumption** on CAD drawing rows: cloth a garment needs that is not in the drawing (a flower, piping). A row can have several, each as item, metres of cloth, pieces made from it, and pieces on one garment; cloth per garment = metres / pieces made x pieces per garment. Entered under the row on the CAD form ("+ By-product"), shown under the row on the CAD and in All rows. When the row is brought into a fabric material list its total comes along as BY-PRODUCT (MTR / PC), which can be changed there, and is added to the cloth needed before the tolerance: (Msrmnt / pcs in layer + by-product) x wishlist quantity. Kept as `cad_rows.by_products` and `material_items.by_product` (migration `cad_by_product_consumption`) |
| 28 Nov 2026 | Seven changes. (1) CAD drawings has an **Accessory pending** tab for the CAD team: one row per sample and size with a CAD whose primary accessory list is not added or has details pending, with views All, Not added, Details pending. (2) Number boxes work sums out (1+2, 2*3, (10-4)/8) on leaving the box or Enter; whole-number boxes round; the PO Qty box is left out because + means one qty per colour there (`lib/calc.js`). (3) A primary accessory list can be brought in from another size of the same sample; the size groups are fitted to the new sizes and nothing is doubled. (4) **Send to CAD** is a third step beside the initial and final approval (first built as a choice of the initial approval, changed the same day): a sample that is not final approved yet but needs its drawing is sent to CAD by Management, with a confirmation; it is then ready for CAD (Pending drawing, New CAD, primary accessory list) while the wishlist and design number still wait for the final approval. It needs no approval first, cannot be done on a closed sample, and authority All can take it back until a CAD is made. The button is in the Approvals section of a sample and on each row of the Approval tab of Samples (with a SENT TO CAD column). Kept on the sample as `sent_to_cad_at` / `sent_to_cad_by`, done with `send_sample_to_cad` (migrations `send_to_cad_as_its_own_step`, `send_to_cad_messages`). (5) The secondary accessory material list starts with a tick list from the whole accessories master (or a typed new name), then one table per accessory. (6) Pick-lists are typed into directly: the line to type in lies on the box itself, typing with the cursor on a box starts the search, Enter or Tab takes the first match or adds the new name. This also fixed the cursor not landing in the search line when a list opened. (7) Every column of a CAD drawing row is required (migration `send_to_cad_and_required_cad_columns`) |
| 28 Nov 2026 | Primary accessory list reworked. Step 1: the accessories of the design are ticked from the new **Primary accessories** master (a new name can be typed and joins the master). Step 2: one table per ticked accessory, all open at once, starting with the unit from the master. Details can be filled now or later: a table left empty is saved as **Details pending**, shown on the table, the CAD, and the wishlist (CAD ACCESSORY LIST: Pending, Details pending, Added). An accessory with details pending cannot be brought into the primary accessory material list yet. Accessories already on a list were marked primary (migration `primary_accessory_master_and_details_later`). The same accessory can be on a list more than once: "Add accessory" opens one more table where any accessory is picked, also one already on the list or one not ticked, or a new name is typed (migration `primary_accessory_more_than_once` takes out the once-only rule of the first version). Unticking an accessory takes away all its tables. The material list brings in every line, also repeats |
| 28 Nov 2026 | Pieces are completed in order: the 2nd sample only after the 1st; the 1st cannot be reopened while the 2nd is completed (database and screens). A colour specific accessory can follow Base, Alternate or **Neutral** colour. Number boxes take .87 (it becomes 0.87). On the CAD form, No. of pcs in layer is filled with the pcs in a set of the chosen size and ratio from the Sizes and ratios master, on every row where it was not typed; typing over it keeps the typed number (migration `pieces_in_order_and_neutral_colour`) |
| 27 Nov 2026 | Corrected the entry below: the Qty box stays the qty of one colour. It now changes by itself as colours are picked (needed qty divided by the colours, rounded up to the next 5) until a qty is typed. Screen change only |
| 27 Nov 2026 | PO qty is the total of the line and is divided between the colours (each share rounded up to the next 5) instead of being multiplied by the number of colours. Screen change only: the database already takes one number per colour |
| 27 Nov 2026 | The side menu stays in place while a screen scrolls (it scrolls on its own when taller than the window; the phone drawer is unchanged). Fabric material lists: the FROM column is now PARTICULARS and shows only the particulars; the drawing is named once on top |
| 27 Nov 2026 | Fabric pending counts a CAD until every row has fabric, vendor and rate, and has two views: All and Partly filled. Screen change only |
| 27 Nov 2026 | Fabric material lists take their rows from one drawing: a Drawing dropdown on the primary fabric list when the item has several CADs; the secondary fabric list follows it. Screen change only |
| 27 Nov 2026 | Wishlist items use every CAD of their sample, size and ratio by themselves; assigning removed from the screens. The size of a CAD or wishlist item is now kept once a material list exists, not once assigned (migration `wishlist_items_use_cads_of_their_size`) |
| 27 Nov 2026 | Pending drawing also lists approved samples with no wishlist item and no CAD; each CAD shows how many material lists used it; message boxes after creating a CAD and after assigning. Screen change only, no database change |
| 27 Nov 2026 | New CAD opened from a Pending drawing item is assigned to that wishlist item on saving. Screen change only, no database change |
| 26 Nov 2026 | CAD rows carry COMPONENTS (required, one or more of the sample's components; a sample with one component needs no picking) and EFFICIENCY %. The CAD form shows the sample's picture. Added by `supabase/migrations/20261126130457_cad_components_efficiency_and_accessory_colours.sql` |
| 26 Nov 2026 | Accessories (the CAD primary accessory list and both accessory material lists) are either general (one colour, which can be named) or colour specific (following the Base colour or an Alternate colour); a "Same pcs per size group" tick types the pieces once. The PO says how each accessory is coloured |
| 26 Nov 2026 | Column choices are now kept with the person in the database (`user_preferences`), so they survive a refresh, another browser or a phone. Added by `supabase/migrations/20261126130632_user_preferences.sql` |
| 26 Nov 2026 | Samples: the image is the first detail on a bar; creating a sample shows a message with its number. Process log: Send to process from there. Pick-lists: Tab does what Enter does (takes the typed new name or the first match) and moves on |
| 26 Nov 2026 | Fix: every picture upload failed with "permission denied for function can_receive" after the receiving step, because the receipt photo rule used a function signed-in people could not run. Fixed by `supabase/migrations/20261126101657_let_picture_rules_use_can_receive.sql`. Lesson: a function used in an access rule must be runnable by signed-in people, and picture uploads must be part of the rule checks |
| 26 Nov 2026 | Samples screen and Process log given All, Completed and Running tabs. A sample is Completed when both its pieces are marked completed; a process is Completed when it has been received back |
| 26 Nov 2026 | Sample bars lined up: every bar has the same details in the same places (an empty one shows a dash), with labels on one line and values starting at the same height |
| 26 Nov 2026 | Standing rule added and built into the shared list: the data on every list is centred and long text wraps (headings too) |
| 26 Nov 2026 | `vercel.json` added so the app can be published on Vercel: every address is served by the app, so a refresh or a saved link does not show "not found". Vercel needs the two settings from `.env.local`, and Supabase needs the published address under Authentication > URL Configuration |
| 26 Nov 2026 | Screen search added to the side menu, with the shortcut Ctrl+K |
| 26 Nov 2026 | Receiving built: Fabric receiving and Accessory receiving screens, receipts in parts, lot numbers by colour from lot series, item name change at first receipt, receiving allowance, mark complete, follow-ups, departments Fabric store and Accessory store. Added by `supabase/migrations/20261126065917_po_receiving_lots_and_followups.sql` |
| 26 Nov 2026 | Masters brought into one screen: the menu has a single Masters link, and every master is a tab on it, in alphabetical order (the list is in `src/lib/masters.js`). The old address of each master still opens its tab |
| 26 Nov 2026 | CAD form: a new CAD table starts with 5 rows; rows left empty are dropped when it is saved |
| 26 Nov 2026 | Samples screen made accordion style: All samples is a list of collapsible bars, and an opened sample has collapsible sections that all start closed and show their summary |
| 25 Nov 2026 | Material lists and purchase orders built: four lists per wishlist item, Confirm list, Not required, one PO per wishlist item and vendor, open orders, PO PDF, Colours master, PO numbering and fabric tolerance in Numbering, pcs of each size in Sizes and ratios. Added by `supabase/migrations/20261125180234_material_lists_and_purchase_orders.sql` |
| 25 Nov 2026 | CAD drawings and the primary accessory list built, with department CAD, CAD particulars master and single sizes in the Sizes and ratios master. Added by `supabase/migrations/20261125112929_cad_drawings_and_primary_accessories.sql` |
| 25 Nov 2026 | Wishlist built: Sizes and ratios master, wishlist entries at final approval or later, Wishlist screen with Newly approved and Add repeat. Added by `supabase/migrations/20261125081337_wishlist_and_size_ratios.sql` |
| 25 Nov 2026 | Design numbers added (Design no tab, one plain series set in Numbering) and the accessory list of a sample (Accessories tab, Accessories and Accessory vendors masters). Added by `supabase/migrations/20261125072608_design_numbers_and_sample_accessories.sql` |
| 25 Nov 2026 | Process and Mark completed tabs changed to one row per sample, showing both pieces |
| 25 Nov 2026 | Fabrics tab changed to one row per sample, with a fabric status: Pending, Incomplete or Completed |
| 24 Nov 2026 | Fabric list added to samples (fabric name, for components, vendor code, rate), with a Fabrics tab, a Fabrics master and a Fabric vendors master. Added by `supabase/migrations/20261124131621_sample_fabrics_and_fabric_vendors.sql` |
| 24 Nov 2026 | Numbering: every series has a name; the sample form lists series by name while sample numbers still use the prefix. Added by `supabase/migrations/20261124115500_series_name.sql` |
| 24 Nov 2026 | References now carry their picture in Masters and a sample can have several of them (the separate reference picture on the sample is gone). Tags added: a Tags master, and optional #tags on every sample that can be added on the spot |
| 24 Nov 2026 | Approval rules revised: "1st approval" renamed "initial approval" and can be repeated while it is Maybe, with the number of times changes were requested shown; an initial approval of No closes the sample and everything on it stops |
| 24 Nov 2026 | Samples screen given a tab per activity (All samples, Process, Mark completed, Images, Approval), each listing only what is waiting |
| 24 Nov 2026 | Step 3 built: process log for the two pieces, piece completion, stage images, 1st and final approval, Process log screen, Processes and Vendors masters |
| 24 Nov 2026 | Category details added to samples: PCS type (automatic), denim type, product type and collection, with Product types and Collections masters |
| 24 Nov 2026 | Components added: a Components master, and a required multi-pick COMPONENTS field on every sample |
| 24 Nov 2026 | First real sample created by Nihal on the live database |
| 24 Nov 2026 | Thumbnails changed to show the whole picture instead of trimming the edges |
| 24 Nov 2026 | Standing rule 13 added and built: pictures fill the popup and the editor preview |
| 24 Nov 2026 | Standing rule 12 added and built: picture editor (rotate, crop, compress) on every picture upload |
| 24 Nov 2026 | Sample form laid out in three sections: Sample details (prefix, creation date, designer, reference), Pictures (concept image, reference image), Remarks |
| 24 Nov 2026 | Standing rule 11 added and built: clicking a row in a master opens Edit |
| 24 Nov 2026 | Standing rules 9 and 10 added and built: export to PDF, Excel and CSV on every list; import with template on every master (user master, departments, designations, roles, numbering, references) |
| 24 Nov 2026 | Standing rules 7 and 8 added and built: group by two levels on every list, folding side menu. Theme changed to soft emerald, inspired by Lycra Tracker |
| 23 Nov 2026 | Two standing rules added and built into the shared blocks: column selector on every list, and phone layout everywhere |
| 23 Nov 2026 | Step 2 built: Numbering master, References list, sample creation with automatic sample number, reference, and remarks (text, voice, pictures) |
| 23 Nov 2026 | Step 1 built: department, designation and role lists, user master, sign-in, and all reusable building blocks |
| 23 Nov 2026 | Sample creation headers and the DESIGNER pick-list rule agreed |
| 23 Nov 2026 | Project uploaded to GitHub for the first time |
| 23 Nov 2026 | Project notes added: this bible, progress, future, decisions |
| 23 Nov 2026 | Project set up: Supabase project created, React starter in the project folder, GitHub repository created, starter page confirmed "Connected to the database" |

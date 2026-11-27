# Decisions

Every important choice, with the reason, so nobody has to ask "why did we do it this way?".
Newest first. A changed decision is not deleted: a new entry is added that replaces it.

| Date | Decision | Reason |
|---|---|---|
| 27 Nov 2026 | PO qty stays "one number is for every colour" (the 25 Nov rule stands). What changed: the form fills the Qty box with what is needed divided by the colours, each share rounded up to the next 5, until a qty is typed (corrects the entry below, which changed the meaning of the box) | Nihal: "qty is not changing" - he expects the Qty box itself to change when colours are added |
| 27 Nov 2026 | PO qty: one number is the total of the line, divided equally between the colours with each share rounded up to the next 5; numbers joined with + override it (replaces the 25 Nov rule that one number is for every colour) | Nihal: the total must stay the same when colours are added; "round up in 5s". The required quantity is for all colours together |
| 27 Nov 2026 | A CAD stays in Fabric pending until every row has fabric, vendor and rate (before: fabric only) | Nihal confirmed; he wants to see CADs whose fabric details are started but not complete |
| 27 Nov 2026 | A fabric material list takes its rows from one drawing only, chosen in a dropdown; the secondary fabric list uses the same drawing as the primary (narrows "all together": every CAD of the size still counts as a drawing of the item, but only one feeds the fabric lists) | Nihal: each drawing contains the complete fabric list, so combining them would cause trouble; "same as primary" |
| 27 Nov 2026 | A wishlist item uses every CAD of the same sample, size and ratio, all together, with no assigning (replaces the 25 Nov rule that a CAD must be assigned) | Nihal: "should fetch their respective drawings, no need to assign further"; "all together" |
| 27 Nov 2026 | A CAD or wishlist item keeps its size and ratio once a material list exists for it (replaces "once assigned") | With no assigning, the material list is the first thing that depends on the size |
| 27 Nov 2026 | An approved sample with no wishlist item leaves Pending drawing once it has its first CAD | Nihal agreed; a wishlist item added later still shows until a CAD is assigned to it |
| 27 Nov 2026 | A CAD's used counter counts wishlist items whose fabric material list was made from it, each once | Shows how many times a drawing has been used |
| 25 Nov 2026 | The CAD department can see every sample, like Management | They must see approved samples and their pictures to make CADs |
| 25 Nov 2026 | A CAD and a wishlist item keep their size and ratio once they are assigned to each other | A CAD is drawn for one size and ratio; changing either side would break the match |
| 25 Nov 2026 | CADs are numbered per sample: SAMPLE NO-CAD-1, -2 ... | Nihal gave no numbering; a sample can have several CADs and versions |
| 25 Nov 2026 | Number of pieces for Length and Dimension is only on the primary accessory list; the sampling draft stays as it is | Nihal's answer |
| 25 Nov 2026 | Accessory qty on the primary list is for one garment piece and can be split by groups of sizes that follow one another | Nihal's chain example: 22-24 6 inch, 26-30 8 inch, 32-38 10 inch |
| 25 Nov 2026 | The fabric, vendor and rate of CAD rows are filled by the people who can add images to the sample, not by the CAD department | Nihal's answer |
| 25 Nov 2026 | CADs and primary accessory lists are made by department CAD (a fixed name) and authority All | Nihal: "the cad department updates the cad drawing and the primary accessory" |
| 25 Nov 2026 | Particulars of a CAD row come from the names used before, with new ones added on the spot | Nihal's answer |
| 25 Nov 2026 | One assigned CAD is enough for a wishlist item; a drawing for every fabric is not required | Nihal's answer |
| 25 Nov 2026 | Once a sample is in the wishlist its final approval cannot be changed from Yes | Production is planned on it |
| 25 Nov 2026 | A wishlist entry can be corrected only by authority All and is never deleted | Same pattern as the rest of the system; Nihal did not say otherwise, so open to change |
| 25 Nov 2026 | A quantity that is not a whole number of sets is allowed; the screen points it out | Nihal gave the quantity in pieces and set no rule that it must fill whole sets |
| 25 Nov 2026 | The master keeps the pieces in a set for each size and ratio | Lets the screens show sets for a quantity; the numbers are Nihal's (9, 13, 14, 5, 4) |
| 25 Nov 2026 | Size and ratio are one master, one row per combination; "1:0" is simply size 22-30 | Nihal: ratio applies only to 22-38, with 1:1, 1:2 and 2:1, more to be added from the master |
| 25 Nov 2026 | Wishlist entries are added by the people who approve samples | Nihal's answer |
| 25 Nov 2026 | Wishlist quantity is in pieces | Nihal's answer |
| 25 Nov 2026 | Assigning a design number asks for confirmation first | The number is used up and cannot be taken back; Nihal asked only that a click gives the next number, so this is open to change |
| 25 Nov 2026 | A design number is given by the same people who update a sample's images | Nihal described the screen as "like image update"; who exactly was not stated, so this is open to change |
| 25 Nov 2026 | Once a sample has a design number its final approval cannot be changed from Yes | Production refers to the design number, so the approval behind it must stand |
| 25 Nov 2026 | Design numbers are plain numbers from one series, with the starting number set by authority All in Numbering | Nihal: "same series for now", "keep it plain"; he did not give a starting number |
| 25 Nov 2026 | Dimension is entered as length and breadth in inches | Nihal gave inches for Length and "length * breadth" for Dimension; the unit for Dimension is assumed |
| 25 Nov 2026 | Accessory status is Pending (no line) or Added | Accessory lines are not tied to components, so there is no "all components covered" rule as for fabric |
| 25 Nov 2026 | Accessory vendors are their own master, separate from fabric vendors | Nihal's answer |
| 25 Nov 2026 | Every work tab of the Samples screen shows one row per sample. Process and Mark completed show both pieces on that row; the piece is chosen when sending, and by its own button when completing | Nihal's instruction; replaces the one-row-per-piece layout of 24 Nov |
| 24 Nov 2026 | The fabric list of a closed sample cannot be changed, also not by authority All through the edit form | "Everything stops" on a closed sample |
| 25 Nov 2026 | Fabrics tab shows one row per sample with a status: Pending (no fabric), Incomplete (a component has no fabric), Completed (every component has one). Completed samples stay listed; the tab's number counts those not Completed. Replaces the one-row-per-fabric layout of 24 Nov | Nihal's instruction |
| 25 Nov 2026 | A fabric line with no component picked does not count for any component | The status asks whether each component has a fabric, so the line must say which component it is for |
| 24 Nov 2026 | A fabric line needs only the fabric name; components, vendor code and rate may stay empty | Nihal: all are optional at creation and can be filled later |
| 24 Nov 2026 | Fabric names are their own list (Fabrics master), filled as names are typed on samples | "Dropdown from previous, also add new instantly"; a list lets a wrong name be corrected or switched off in one place |
| 24 Nov 2026 | Fabric vendors are a separate master from the process Vendors, and samples show only the vendor code | Nihal: vendor name and vendor code in a fabric vendor master, "we use vendor codes everywhere" |
| 24 Nov 2026 | The fabric list is changed by the same people who update a sample's images | Nihal's answer |
| 24 Nov 2026 | The existing series LB was given the name "LB" until it is renamed | Every series needs a name; Nihal can change it in Numbering at any time |
| 24 Nov 2026 | A series name is required, used once, and stays editable after the series has given out numbers | The name is only a label on the sample form; the prefix and numbers are what must never change |
| 24 Nov 2026 | The picture already uploaded on sample LB-3001 became the picture of its reference "MUMBAI SAMPLES" | Nothing is lost when the picture moves from the sample to the reference; it can be replaced in Masters |
| 24 Nov 2026 | A tag typed on the sample form is added to the Tags list only when the sample is saved, by whoever may save the sample | No stray tags from forms that were cancelled; Nihal: tags "can be added instantly" |
| 24 Nov 2026 | Tags are kept without the # sign and compared ignoring capitals; the screens show the # | "#Summer", "summer" and "SUMMER" are one tag |
| 24 Nov 2026 | References are added only in Masters (authority All), never from the sample form | Nihal: "can't add reference" |
| 24 Nov 2026 | A reference's picture lives in Masters; a sample can have several references and has no reference picture of its own | Nihal: the picture should be fetched directly while creating a sample |
| 24 Nov 2026 | On a closed sample, a piece that is already at a vendor can still be received back | Otherwise the piece would show "At vendor" for ever. Everything else stops, as Nihal asked |
| 24 Nov 2026 | A closed sample stops everything for everyone, authority All included; it is reopened only by authority All changing the No | One clear way to reopen, and it leaves a record in the approval history |
| 24 Nov 2026 | An initial approval of No closes the sample: no final approval, and all further work stops | Nihal: "everything stops" |
| 24 Nov 2026 | Initial approval can be repeated only while the latest one is Maybe; Yes settles it | Maybe is "changes requested"; after Yes the next step is the final approval |
| 24 Nov 2026 | "Changes requested" is the number of initial approval rounds that were Maybe | Nihal wants to see how many times changes were requested |
| 24 Nov 2026 | "1st approval" renamed "initial approval" (replaces the earlier name) | Nihal's wording |
| 24 Nov 2026 | A work tab lists only items the signed-in person may act on, and is hidden from people who can never use it | Nobody sees a list of work that is not theirs |
| 24 Nov 2026 | The Process tab has one row per piece that is not completed; when a piece is out in two processes, Receive asks which one came back | Send and receive in one place, as Nihal asked |
| 24 Nov 2026 | Samples screen has a tab per activity; send and receive share one tab, 1st and final approval share one tab; each tab shows only eligible items | Nihal's instruction |
| 24 Nov 2026 | Every approval given or changed is kept in a history | An approval can be changed by authority All, and the earlier decision must not be lost |
| 24 Nov 2026 | Department "Management" is created by the system and cannot be renamed or switched inactive | The approval rule and "sees every sample" depend on it |
| 24 Nov 2026 | People in Management can see every sample | They approve any sample |
| 24 Nov 2026 | After a final approval, a 1st approval can no longer be added | The final decision makes the first one pointless |
| 24 Nov 2026 | Approval has no precondition and is for the sample as a whole | Nihal: "as whole"; agreed it can be given at any time |
| 24 Nov 2026 | An approval is given once; only authority All can change it | Nihal's rule |
| 24 Nov 2026 | Remarks are optional on both the 1st and the final approval | Nihal's answer |
| 24 Nov 2026 | Uploading a stage image again replaces the earlier one | One current picture per stage |
| 24 Nov 2026 | The picture shown for a sample is the highest stage image that exists: photoshoot, then 2nd sample, then 1st sample, then concept | Nihal's priority order |
| 24 Nov 2026 | A completed piece is closed: nothing more can be sent for it; only authority All can reopen it | Agreed |
| 24 Nov 2026 | A piece cannot be marked completed while any of its process entries has not been received | Nihal: status must not be at vendor |
| 24 Nov 2026 | Mark completed: Department(s) authority that includes Sample, whatever the designation or role | Nihal's rule |
| 24 Nov 2026 | Process entries and stage images: the sample's designer, or Department(s) authority that includes Sample | Nihal's rule |
| 24 Nov 2026 | "Looks after Sample" is defined once as authority Department(s) with Sample ticked, and used for both rules above | One definition is easier to explain and to set up in the user master |
| 24 Nov 2026 | Every process entry has a vendor; process and vendor come from masters | Agreed |
| 24 Nov 2026 | A process entry is made at sending and completed later with the received date | Nihal: sent details first, received date later |
| 24 Nov 2026 | Each sample has two physical pieces (1st and 2nd sample), tracked separately and independent of each other | Nihal's description |
| 24 Nov 2026 | Collection is its own master, like product type | New collections arrive every season, so the list must be editable without a code change |
| 24 Nov 2026 | Denim type is a fixed choice (Denim, Non denim), not a master | There are only ever two values |
| 24 Nov 2026 | PCS type is worked out from the number of components and never stored | It can then never disagree with the components |
| 24 Nov 2026 | Denim type, product type and collection are required on every sample | Nihal: "every sample has its category details" |
| 24 Nov 2026 | A component that is switched inactive stays on samples that already have it, but cannot be newly picked | Old samples keep their record; the list stays clean for new ones |
| 24 Nov 2026 | COMPONENTS on a sample: required, one or more, picked from a Components master | Nihal's request; he chose Required |
| 24 Nov 2026 | Thumbnails show the whole picture with empty space at the sides, never trimmed | Nihal's choice: a garment picture should not lose its edges |
| 24 Nov 2026 | Edited pictures are saved as JPG, with "Balanced" (longest side 1600) as the default compression | Small files that still look sharp; phone photos of 5 to 10 MB come down to a few hundred KB |
| 24 Nov 2026 | Several pictures added at once are compressed automatically without opening the editor for each | Adding ten remark pictures should not mean ten popups; each can still be edited |
| 24 Nov 2026 | Picture editor (rotate, crop, compress) on every picture upload | Nihal's standing rule |
| 24 Nov 2026 | Import only adds rows; it never changes or removes existing ones. Existing rows are skipped and reported | A wrong file can then never damage a master. Corrections are made on screen |
| 24 Nov 2026 | Import shows a check of every row first, and imports the good rows even if others have problems | The person sees exactly what will happen before anything is saved |
| 24 Nov 2026 | Export gives what is on screen (shown columns, filtered rows, shown order) | "What you see is what you get" is the easiest rule to trust |
| 24 Nov 2026 | "XLS" export is a modern Excel file (.xlsx) | Opens in Excel and Google Sheets; the old .xls format is obsolete |
| 24 Nov 2026 | Export on every list and import with template on every master | Nihal's standing rules |
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
| 26 Nov 2026 | Components and efficiency % are entered on every row of a CAD, not once per CAD | Nihal: "every row" |
| 26 Nov 2026 | An accessory is general (single colour, can be named) or colour specific (follows Base colour or Alternate colour); the same on primary and secondary lists | Nihal's explanation; "not only in primary secondary also" |
| 26 Nov 2026 | Column choices are kept per person in the database, not only in the browser | They were being lost on refresh for Nihal |
| 26 Nov 2026 | Samples and Process log have tabs All, Completed, Running; a sample counts as Completed when both pieces are completed | Nihal: "Both pieces completed" |
| 26 Nov 2026 | Data on every list is centred and wraps | Nihal: "add text wrap and center for screen datas" |
| 26 Nov 2026 | The app is published on Vercel, from the GitHub project | Nihal: "vercel" |
| 26 Nov 2026 | Material is received by departments Fabric store and Accessory store, on two separate screens | Nihal: "we will make fabric store and accessory store department", "fabric and accessory screen should be different" |
| 26 Nov 2026 | A PO can be received in parts; quantity is recorded for each colour; bill number, bill date and received date are entered, photo optional | Nihal's answers |
| 26 Nov 2026 | One lot number per PO item, given at first receipt and kept across parts; colours get letters (1234-A, 1234-B); no colours still gets -A; the person picks the series, from separate fabric and accessory lot series in Numbering | Nihal's answers |
| 26 Nov 2026 | The item name can be changed at the first receipt only; the PO keeps the ordered name | Nihal: "sometime vendor can send not the same item but similar" |
| 26 Nov 2026 | Receiving allowance 10% from the master, changeable; within it a colour closes on its own; Mark complete closes a short item; more than ordered is accepted and flagged excess (when over by more than the allowance) | Nihal's answers; the excess threshold is Claude's choice |
| 26 Nov 2026 | Follow-ups by both the people who raise the PO and the store people; a new promised date in a follow-up replaces the PO's for counting late | Nihal: "both" |
| 26 Nov 2026 | A received PO cannot be changed or cancelled; only authority All removes a receipt or reopens a completed item | Stated to Nihal with the build summary and accepted |
| 26 Nov 2026 | Masters are tabs of one Masters screen, sorted alphabetically; no master links in the side menu | Nihal's request |
| 26 Nov 2026 | A new CAD table starts with 5 rows and empty rows are discarded on save | Nihal's request |
| 26 Nov 2026 | Samples screen is accordion style: the list as collapsible bars, and each section inside a sample collapsible; everything starts collapsed, with the important statuses on the closed bar | Nihal: "Both", "all collapsed" |
| 26 Nov 2026 | On a bar list, Columns only chooses what the closed bar shows; search, sort, filter, group and export use every detail | Otherwise a short bar would hide details from search and export |
| 25 Nov 2026 | One PO = one wishlist item + one vendor, with all that vendor's items | Nihal: "in one po, there are items for only one wishlist" |
| 25 Nov 2026 | A material list is Updated when "Confirm list" is pressed, Ordered when every item has a PO or is Not required; primary fabric first, the other three lists show as pending after it | Nihal's flow |
| 25 Nov 2026 | Fabric to order = Msrmnt / pcs in layer x qty, plus one tolerance % from the master, rounded up to the next 10, in metres | Nihal: "always round up in 10s", "single... but can be updated in master" |
| 25 Nov 2026 | Accessory qty is split by size using the pieces of each size in a set, kept in Sizes and ratios | 1:2 and 2:1 give different pieces per size |
| 25 Nov 2026 | PO qty: one number is for every colour; numbers joined with + are one per colour and must match the colour count. Colour specific applies to accessories only; fabric always names colours | Nihal's rule |
| 25 Nov 2026 | Promise days per line; the first line's value fills the others, changeable | Nihal: "the first one become default but changeable" |
| 25 Nov 2026 | Length accessories are ordered as pieces of each length or as one whole length in inches, chosen on the PO; dimension in pieces | Nihal: "sometime whole length and sometime pcs" |
| 25 Nov 2026 | PO number is automatic, PO- and a running number, starting number set in Numbering; a cancelled PO keeps its number | Agreed |
| 25 Nov 2026 | The people who update a sample's images confirm lists, mark Not required and raise POs; only authority All changes or cancels a raised PO, or takes off a Not required mark | Nihal: "currently the persons who updates the images", "yes, authority all" |
| 25 Nov 2026 | An open order can be for anything, with remarks and an optional link to a wishlist item or sample | Nihal: "no, can be anything" |
| 25 Nov 2026 | A confirmed list stays editable until a material is on a PO or Not required | Stated to Nihal with the build summary and accepted |
| 25 Nov 2026 | The wishlist column for the CAD department's list is now headed CAD ACCESSORY LIST | PRIMARY ACCESSORY is the heading of the material list status |
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

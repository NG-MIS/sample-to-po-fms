# Future

Ideas and later work that are not part of the current step. Nothing here is promised
or scheduled. An item moves to `PROGRESS.md` when it is picked up.

Last updated: 23 Nov 2026

## To settle before going live

- Where the screens are hosted on the web. When that is decided, the web address must be added
  in the Supabase dashboard (sign-in settings) so that email links come back to it
- Email sending: Supabase's built-in email is meant for testing and only sends a few emails
  per hour. Before the whole team sets up sign-in, connect a proper email sender
- Phone use needs the app hosted on the web (or the computer's address opened from the phone
  on the same network); a phone cannot open `localhost` on the computer
- PDF export uses standard fonts, which cover English letters and numbers only. Text in Hindi
  or other scripts, and the rupee sign, will not print correctly in a PDF until a wider font is
  added (Excel and CSV exports are not affected). Needed before purchase orders with amounts
- Import for the user master cannot set pictures; avatars are added on screen
- Supabase can refuse passwords that are known to have leaked. It is switched off; consider
  switching it on in the Supabase dashboard (sign-in settings) before the whole team joins
- Pictures and voice notes that were uploaded for a form that was then cancelled, or removed
  from a sample later, stay in the file store. A clean-up job can remove them later
- Supabase plan: the free plan allows only 2 active projects, and "NG OWN ERP" is paused
  to make room for this one

## Ideas

Nothing recorded yet. Add ideas here as they come up, with the date.

## The production side, as told by Nihal on 25 Nov 2026 (not built yet)

Order agreed: wishlist (built 25 Nov 2026, Project Bible 2.3), then CAD and the primary
accessory list (built 25 Nov 2026, Project Bible 2.4 and 2.5), then the material lists and
purchase orders (built 25 Nov 2026, Project Bible 2.6 and 2.7).

**Still to come, as told so far**
- What happens to received lots next (stock, issue to production).
- The photo of the cloth on POs.
- The rule for primary and secondary.
- A change to the secondary accessory pending screen.
- Costing.
- Production lots and lot numbers.

**Material lists and purchase orders (told on 25 Nov 2026; built, see Project Bible 2.6 and 2.7)**
- Every wishlist item has four material lists: primary fabric, secondary fabric, primary
  accessory, secondary accessory.
- Each list has two statuses: Updated (filled and confirmed) and Ordered (every item has a PO
  raised or is marked Not required).
- Primary accessory: a button brings in the primary accessory list of that sample + size +
  ratio when one exists; the person reviews it and edits if needed.
- Fabric lists: picked from the CAD drawings of the wishlist item's sample, size and ratio (rows marked
  Primary or Secondary).
- Secondary accessory list: created by hand.
- From a material list: raise a PO for the items required, or mark an item Not required
  (already in-house, or not needed at all).
- Open order: an order outside the material list, to reorder something lost or to add a new
  item that was not on the list.
- Order of work: primary fabric first. Raising its PO or marking it Not required puts the
  wishlist item on three pending screens: primary accessory, secondary fabric and secondary
  accessory. The secondary accessory pending screen will be changed later.

**Wishlist**
- A sample with final approval Yes is approved for production and goes to the wishlist.
- Each wishlist entry needs size, ratio and the quantity to take into production. All three
  are required.
- The first entry of a sample is NEW, with an id like `LB-3001-NEW`. Later entries are
  repeats: `LB-3001-REPEAT-1`, `-2`, and so on.
- At the time of approval the approver may create the entries right there, several at once
  (the first NEW, the rest REPEAT-1, REPEAT-2...). If they do not, the sample shows on a
  separate screen as newly approved, waiting to be added to the wishlist.
- An "Add to wishlist" screen adds repeats for samples that were in the wishlist before;
  several lots can be created at one time.
- One sample can have several production lots, even at the same time. Production refers to
  design number and lot number everywhere.

**Sizes and ratio**
- Sizes 22 to 38, even sizes only: 9 pieces in a full set.
- Two segments: 22-30 (5 pieces) and 32-38 (4 pieces).
- Ratio = sets of 22-30 : sets of 32-38. 1:1 = 9 pieces (usual), 1:0 = 5, 2:1 = 14, 1:2 = 13.

**CAD drawing**
- For each fabric of a garment, all the parts cut from that fabric (for every component it is
  used in) are drawn together in one CAD drawing. The fabric is layered, the drawing placed on
  top, and the parts are cut.
- The CAD department makes the drawings; a sample can have many.
- Every wishlist entry uses the drawings of the same sample, size and ratio by itself (changed
  27 Nov 2026; before that a drawing had to be assigned). One wishlist id can have several
  drawings, all used together.
- Clean-up to do: remove the unused `cad_wishlist` table and its two assigning functions.
- Entries with no drawing show on a "Pending drawing" screen.

**Final material list**
- Fabrics are primary or secondary, and accessories are primary or secondary. The team
  assigns this; the rule is still to come from Nihal.
- The fabric and accessory lists entered during sampling are only a draft.
- To raise a PO, every wishlist item needs its final material list. While making the CAD
  drawing, the CAD department updates the final primary accessory list; there is exactly one
  per wishlist id, even when it has several drawings.

**Still open (ask Nihal)**
- The rule for primary and secondary.
- Whether a wishlist entry counts as "has its drawing" only when every fabric has one.
- Costing: mentioned as related to CAD, not yet explained.

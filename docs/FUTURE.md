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

## Accessories list of a sample (next)

Nihal: after fabrics, the same kind of list is needed for accessories, "slightly different". The
differences are still to be given by Nihal. The fabric editor (`SampleFabrics.jsx`,
`lib/sampleFabrics.js`) is the pattern to follow.

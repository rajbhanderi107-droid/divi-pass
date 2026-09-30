# Divi Pass Register

Simple offline app to record every **Divi pass** you sell: who bought, which pass, price, night, payments (with UTR and who received the money), and whether it is punched into Showmates.

Works on your phone like an app. Data stays on your phone (no login, no server).

## Use it
1. Open the site link on your phone → **Share → Add to Home Screen** (iPhone) or **Install** (Android). Installing also stops iPhone from erasing the data.
2. **Add** tab → paste the buyer's WhatsApp message (`Name / Pass / No / Date`) → check → **Save sale**.
   - `2600 + 650` in the message becomes two payments; add each UTR.
   - Or tap **Paid full · UPI / Cash**.
3. **Sale** page: tick *Punched* per pass line; **Copy for Showmates** gives Date, Ticket, Quantity, **Manual amount** (your real price, not the ₹800 list price), Name, Phone.
4. **Add from photo** (optional): tap 📷 on the Add screen and pick a WhatsApp or payment screenshot; if the photo is clear (phone, passes and night all read) the sale is added straight away with an Undo; if anything is unclear the form opens for you to check. Needs the small reader in `server/` (see `server/README.md`), then More → Photo reader.
5. **More → Backup & restore**: back up often (share to WhatsApp / Drive). Restore merges; the newest edit of each record wins.

## Also included
- **Merge** two sales of the same buyer and night, **Customers** list with repeat buyers, **Gate list** (mark how many of a group have entered), **Expenses** and net per night.
- **Reports**: per-night totals, who received how much, a WhatsApp summary to copy, Sales and Payments CSV, Print / Save as PDF.
- **Prices**: change the price for one sale on the Add screen, save it as the default, or set a different price for a single night (More → Nights → Prices).
- Attach a payment **screenshot** to a payment (kept on the phone, not in backup files). **Change history** shows every edit.

## Automatic adding (on by default)
Paste a WhatsApp message (or several at once) into the Add box, tap **Paste**, or add from a photo, and the sales are saved for you with no review step.
- Payments in the text are recorded; a payment card photo attaches itself to the one unpaid sale of that amount.
- If something looks off (no date, weekday mismatch, price differs…) the sale is still added and marked **Check**; Home shows how many.
- If the app cannot add it safely (no phone number, unclear pass, payment with no single matching sale) it goes to the **Inbox**; nothing is lost. *Fix and add* opens it in the form.
- Repeats (same message, same UTR, same buyer and amount minutes apart) are ignored. Every automatic sale has Undo.
- More → Automatic adding: *Fully automatic*, *Only when everything is clear*, or *Off*. Typing in the box never auto-adds.

## Punch in Showmates
Home → **Punch in Showmates** (or More): shows the next line to punch with every Showmates field (Date, Ticket, Quantity, Manual amount, Buyer name, Phone) and a Copy button on each, an **Open Showmates Punch** button, then **Done — punched** moves to the next. The ticket wording can be set per pass (More → Pass types → “Ticket name in Showmates”) or changed on the spot. Showmates has no way for other apps to fill their form, so this makes it one tap per field; it cannot punch for you.

## Starting setup (edit in More)
These are only starting guesses, and Home shows a “Check your prices and nights” card until you confirm them. Nights 11–19 Oct 2026 · Solo ₹650 (list ₹800) · Couple ₹1,300 (list ₹1,600) · Receivers: Bhanderi Raj, Dev Kinner Trivedi.

## Develop
```
npm i
npm run dev        # local
npm test           # unit tests (CI runs them with TZ=UTC and TZ=Asia/Kolkata)
npm run build
npm run e2e        # Playwright phone-size flow; needs `npm run build` first
```
Stack: Vite, React, TypeScript, Tailwind, Dexie (IndexedDB), PWA. See `PLAN.md` for the full plan and the roadmap (v1.1, v1.2).

## Rules the code enforces
- Money is whole rupees. Dates are IST. Phone numbers are stored as `+91XXXXXXXXXX`.
- A UTR can only be used once. Payment status (paid / partial / due) is always calculated, never typed.
- Every save is all-or-nothing and logged; deletes go to Trash for 30 days.
- The pass price is copied onto each sale, so changing prices never changes old sales.

## Sign-in, roles and sync

Everyone signs in (login id + password, or Google). Roles:

- **Super admin** (Raj, Dev): everything, and the only ones who can create logins and passwords (More → Team & logins).
- **Admin**: everything about sales and money for all sellers, nights, prices, reports, backups — but cannot create logins.
- **Seller**: only their own book. The server sends a seller nothing else, and refuses writes outside their book.

Sales sync through the cloud (Supabase edge function `sync`, which checks the sign-in and role on every call). The app works offline and catches up. Signing out clears that phone's copy. Synced: nights, pass types, buyers, sales, payments, receivers, expenses (expenses are never sent to sellers). Not synced: payment screenshots, Inbox, settings.

Google sign-in works only for emails a super admin has added, and needs the Google provider switched on in the Supabase dashboard (Authentication → Sign In / Providers → Google) and the site address in Authentication → URL Configuration.

## Sellers

More → *Sellers & who receives money*. Every sale records **Sold by**. Raj and Dev keep separate books; Divya is set as selling for Raj, so her sales appear in Raj's book and in her own. The switcher at the top of Home, Sales, Money, Reports and Gate picks whose book to show (Everyone shows all). Payments can be received by Raj directly or by Divya; Money shows how much Divya is holding for Raj. Older sales with no seller show under Everyone only. The chosen book is per phone and is not synced.

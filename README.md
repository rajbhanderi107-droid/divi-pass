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

## Starting setup (edit in More)
Nights 11–19 Oct 2026 · Solo ₹650 (list ₹800) · Couple ₹1,300 (list ₹1,600, **assumed**) · Receivers: Bhanderi Raj, Dev Kinner Trivedi.

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

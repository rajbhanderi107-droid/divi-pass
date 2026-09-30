# Divi Pass Register — Final Plan (v3)

Mobile-first, offline, installable app for the organiser of **Divya Achariya Divi** passes.
Records every pass sold: who, which pass, what price, which night, who paid what, and whether it's punched into Showmates.

Status: **awaiting approval — nothing built yet.**

---

## 1. Ground truth from the screenshots

| Evidence | What it means for the app |
|---|---|
| `Name / Pass / No / Date` WhatsApp messages | Paste-to-fill parser |
| 2 solo = ₹1,300, 5 solo = 2600 + 650 = ₹3,250 | Solo actual price **₹650**; split payments exist |
| Showmates `EARLY BIRD \| SINGLE · ₹800` + Manual amount | Track **list price vs actual price**; copy the actual amount to Showmates |
| Payments to Bhanderi Raj and Dev Kinner Trivedi | Each payment records **who received it** |
| Paid 29–30 Sep, night 16 Oct | Sale night, sold time and payment time kept separately |
| "Aa system thi mokalje have" | Every sale also gets punched into Showmates, so the app tracks **punched / not punched** |

## 2. Architecture

- Vite + React 18 + TypeScript (strict) + Tailwind; dark theme with lime accent (matches Smart Punch)
- Dexie 4 (IndexedDB) + `useLiveQuery`; zod validation; ULID ids
- PWA (vite-plugin-pwa, **prompt** update — never reloads mid-typing); HashRouter
- GitHub Pages deploy via GitHub Actions
- Tests: Vitest + fake-indexeddb + fast-check; Playwright (Chromium, phone viewport) + manual iPhone checklist

```
src/
  domain/   money.ts time.ts phone.ts status.ts schema.ts (pure, 100% tested)
  parser/   pipeline + __tests__/golden.test.ts
  db/       schema.ts repo.ts backup.ts seed.ts
  screens/  Home Sales AddSale SaleDetail Payment Money Reports More ...
  components/ui/
```

## 3. Data model (Dexie v1)

```ts
events:      'id, date, updatedAt, deletedAt'                    // one row per night, 'YYYY-MM-DD' IST
passTypes:   'id, sortOrder, updatedAt, deletedAt'
customers:   'id, &phone, nameLower, updatedAt, deletedAt'       // +91XXXXXXXXXX
sales:       'id, eventId, customerId, refNo, createdAt, updatedAt, deletedAt, cancelledAt, punchState, sourceHash, [eventId+punchState], [customerId+createdAt]'
payments:    'id, saleId, &utr, paidAt, receiverId, kind, updatedAt, deletedAt, [saleId+kind]'
receivers:   'id, nameLower, updatedAt, deletedAt'
attachments: 'id, saleId, paymentId, createdAt, deletedAt'
expenses:    'id, eventId, paidAt, receiverId, updatedAt, deletedAt'
auditLog:    '++seq, at, entity, entityId'
settings:    'key'
```

- **Sale** = one night, one or more lines (`1 couple + 2 solo`). Each line snapshots name, seats, list price, actual price, qty, and its own `punchedAt` (Showmates takes one ticket type per punch).
- **Payment** = receipt or refund, integer ₹ > 0, method, 12-digit UTR (unique), receiver, paidAt, optional screenshot (≤200 KB).

**Invariants** (enforced in `repo.ts`; every write = one transaction + audit row)
1. `total = Σ qty × price − discount ≥ 0`; `seats = Σ qty × seatsPerUnit`
2. Status is derived, never stored: unpaid / partial / paid / overpaid / refundDue (cancelled with money held)
3. UTR unique; phone unique per customer, normalised
4. Money is integer rupees only; all dates via one IST helper
5. Soft delete cascades sale → payments → attachments; Undo; 30-day trash
6. Restore merges by id, newest `updatedAt` wins, with preview first

## 4. Paste parser

Pipeline: normalise → strip WhatsApp export prefixes → split blocks → classify (sale / payment / noise) → extract → resolve date + passes → cross-check → drafts.
It **never saves by itself**. Each field gets a confidence level, unsure fields are highlighted amber, and the original text is kept on the sale.

It understands:
- Labels `Name/Naam/નામ`, `No/Mobile/Ph/નંબર`, `Pass/પાસ`, `Date`, with `: ; -`
- Phones in `+91`, `91`, `0` and spaced forms. A 12-digit number is never read as a phone.
- `solo/single/stag`, `couple/cpl/pair/jodi`, and the number words `ek/do/be/teen/panch`, including Gujarati and Hindi digits
- Dates `16th october Friday`, `16/10`, `16-10-26`, `16 oct`. It warns on a weekday mismatch and moves past dates to next year.
- Amounts with `₹ Rs , /- k` and sums like `2600 + 650`
- UPI payment text: `Paid to X`, UTR / UPI Ref (ignores PhonePe `T…` IDs)

**35 golden tests** include the three real messages exactly:
- `tanmay Jain / 1 couple / +919426672046` → Tanmay Jain, 1× Couple, +919426672046, warning "no date"
- `niyati patel / 2 solo / 9913803737 / 16th october Friday` → 2× Solo, 2026-10-16
- `vanshika banodia / 5 solo / +919313585913` + `2600 + 650` → 5× Solo, total 3250, no mismatch

Plus: UTRs 627326018483 / 627325985997 / 627223546951 captured; export timestamps never used as the night; the header line is never taken as a name; multi-block and mixed paste; and `hi bro` → nothing recognised. Property tests: 12-digit strings never become phones, and parsing is deterministic.

## 5. Screens

Tabs: **Home · Sales · + Add · Money · More**

- **Home**: strip of nights (seats sold, dues and unpunched count per night), plus Dues and Unpunched tiles. Banners, most urgent first: install app → storage not kept → backup overdue.
- **Add Sale, Paste mode** (default): **paste → Save = 2 taps**. Payment text in the same paste is saved as a receipt.
  - A duplicate UTR is blocked with a link to the existing sale.
  - A near-duplicate (same phone and total within 10 minutes) asks before saving.
  - Pasting the same text twice shows "Already added".
- **Add Sale, Quick Punch**: night → pass chips with +/− → phone → Save (4 taps plus the digits). A "Paid?" toggle records the payment.
- **Sales**: chips for Tonight / Unpaid / Unpunched / All, and search by name, phone, DV-number or UTR. Swipe to copy for Showmates or add a payment.
- **Sale detail**:
  - Lines with a Punched checkbox each, payments, WhatsApp link, original text.
  - **Copy for Showmates** gives Date, Ticket, Qty, Manual amount (actual price), Name and Phone, in the Punch form's order.
  - Other actions: edit, merge sales, cancel/refund, delete with undo.
- **Add payment**: prefilled with the balance due, UPI/cash, UTR with a live duplicate check, receiver chips and time. "Paid in full" takes 2 taps.
- **Money**: dues list, collections per receiver per night (settlement), refunds, and later expenses.
- **Reports**: WhatsApp summary per night; later CSV and print → PDF.
- **More**: backup / restore, trash, audit log, health check, nights, pass types, receivers, settings.

## 6. The 50 features

**v1.0 (P1, target 8 Oct)**
1. Installable offline app
2. Validated database
3. Transactional saves with audit
4. Editable seed setup
5. Paste mode
6. Atomic save of customer + sale + payment
7. Quick Punch
8. Smart night preselect
9. Phone validation
10. Parser warnings before save
11. Receipts and refunds
12. Unique UTR
13. Split payments with derived status
14. Sales filters and search
15. Per-line Punched toggle
16. Copy for Showmates
17. Edit with recalculation and history
18. Trash and undo
19. Night strip
20. Dues and Unpunched tiles
21. JSON backup export and share
22. Restore with preview and merge
23. Backup reminder
24. iPhone install banner
25. Persistent-storage request
26. Update prompt
27. CI with a bundle budget under 250 KB

**v1.1 (P2, target 14 Oct)**
28. Multi-block paste
29. Mixed sale + payment paste
30. Near-duplicate guard
31. Same-paste idempotency
32. Merge sales
33. Cancel → refund due
34. Payment screenshot
35. Customers
36. Dues list
37. Receiver settlement
38. WhatsApp night summary
39. Swipe actions
40. Health check
41. Audit viewer
42. Playwright smoke test

**v1.2 (P3, after the nights)**
43. CSV export
44. Print / PDF
45. Expenses and net
46. Gate list with partial group entry
47. Per-night price override

**Only if you ask (P4)**
48. Sellers and commission
49. Gujarati / Hindi UI
50. Encrypted backup and app lock

## 7. Top bug risks and how each is proven fixed

| Risk | Test that proves it's fixed |
|---|---|
| UTR read as a phone number | Golden test + property test |
| Chat export timestamp taken as the night | Golden test |
| IST day shift | Tests run in both UTC and IST time zones |
| Decimal rupee errors | Property test on the integer money type |
| Stored total drifting from its lines after edits | Property test with random edits |
| Half-saved sale (sale saved, payment not) | Transaction-abort test |
| Duplicate UTR | Repo test |
| Same person saved under `0…` and `+91…` | Upsert test |
| iPhone clearing data after 7 days | Install banner, keep-storage request, backup reminder, manual iPhone check |
| Update reloading the app mid-typing | Update-prompt test |
| Restore overwriting newer local edits | Merge tests |
| Showmates over-invoicing (₹800 list vs ₹650 sold) | Copy-string test: 5 solo gives Manual amount 3250 |
| Unpunched second pass type hidden | Per-line punch test |
| Deleted rows counted in totals | Query test |
| Screens stale after restore | Playwright test |

## 8. Build order and release gates

1. Scaffold + CI + Pages deploy
2. Domain logic (money, IST, phone, status)
3. Database + repo + seed
4. Parser + 35 golden tests
5. App shell + Home
6. Paste mode
7. Quick Punch
8. Sales list
9. Sale detail
10. Payments
11. Copy for Showmates
12. Backup / restore / reminders / install banner
13. Update prompt + health check + bundle budget

→ **Gate v1.0**: all tests green, manual iPhone check (install, offline, paste, share backup), tag v1.0.0.

14–17. P2 features → **Gate v1.1**: Playwright smoke green, zero data-check violations.
18–19. P3 features → **Gate v1.2**.

**"v1.0 usable"** means: installed from the link, you paste any of the three real messages and save in 2 taps, record split UPI payments with UTRs to either receiver, see tonight's dues, copy each line to Showmates and mark it punched, and back up / restore. All of it works offline.

## 9. Starting setup (all editable on a first-run "Review setup" screen)

- Season: Divya Achariya Divi 2026
- Nights: 11–19 Oct 2026 (**unconfirmed**; Showmates shows 12 Oct, messages confirm 16 Oct)
- Solo: 1 seat, list ₹800, price **₹650** (confirmed)
- Couple: 2 seats, list ₹1,600, price **₹1,300** (**unconfirmed**; assumed 2 × solo)
- Receivers: Bhanderi Raj, Dev Kinner Trivedi
- Backup reminder: every 2 days or 10 sales

## 10. Open questions (default used if unanswered)

1. Couple price? → ₹1,300 (list ₹1,600)
2. Which nights? → 11–19 Oct
3. Is the Showmates ticket the entry pass? → yes; gate list later
4. Is Dev Kinner Trivedi a co-organiser collecting money? → yes; settlement view
5. One phone or two? → one phone; share via backup file
6. Other sellers on commission? → no (feature 48 stays off)

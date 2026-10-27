# Shared online ledger: setup (free, about 20 minutes)

With this setup the owner, family, office staff and drivers all see the same data on any phone or laptop. The data is kept in a Google Sheet that belongs to your business Google account. You can open it, download it and see its version history. The app also keeps working with a weak signal: entries are saved on the phone and sent when the internet returns.

The setup has two parts: a small server script in your Google account, and the app on a free host (see HOSTING.md).

## Part 1: create the Google Sheet

1. Sign in to Google with the business Gmail account.
2. Go to **sheets.google.com** and create a blank spreadsheet. Name it `Trip Ledger Data`.
3. Look at the web address. Copy the long text between `/d/` and `/edit`. This is the **Sheet ID**.
4. Keep this sheet private. Do not share it with anyone who should not see all business records.

## Part 2: create the server script

1. Go to **script.google.com** and click **New project**.
2. Delete the sample code and paste in everything from `Server.gs`.
3. At the top, replace `PASTE-YOUR-GOOGLE-SHEET-ID-HERE` with your Sheet ID.
4. Click **Save**.
5. Click **Deploy**, then **New deployment**. For the type choose **Web app**.
6. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy**.
7. Google asks for permission. If it warns that the app is unverified, click **Advanced**, then **Go to (your project name)**, then **Allow**. This is your own script, so this is normal.
8. Copy the **Web app URL** (it ends with `/exec`). This is your **server link**.

"Anyone" only means anyone can reach the link. Nobody can read or change records without a username and password.

## Part 3: first login (owner)

1. Open the app link. The first screen asks for the **server link**: paste it there (if you already use the app on this phone, paste it under **More**, **Shared online ledger**, and tap Connect). Create the owner account straight away, because until then anyone who has the server link could create it.
2. The button says **Create owner account**. Choose a username and a password (at least 8 characters) and tap it. This account is the owner and can see everything.
3. Open **More** and set your business details, bank details and GST details once. You can save up to 3 bank accounts. When you print, send or email an invoice, the app asks which account to show on it.
4. In **More**, under staff, create a login for your drivers and staff (a username and password). You can create more than one by repeating this with another username.

## Part 4: other phones

1. Open the app link on the phone.
2. Paste the server link once, then log in with the staff or owner username.
3. To skip pasting the link on every phone, open `index.html` in a text editor before you upload it and put the link in `var SERVER_URL="";`.

## Who can do what

| | Owner | Staff |
|---|---|---|
| Add and edit trips, diesel, expenses and daily wages | Yes | Yes |
| Add new customers and drivers, and edit their details | Yes | Yes (the customer's carried-forward balance is kept by the server and never sent to staff) |
| Make invoices (print or save PDF, send on WhatsApp, send from their own email app) and see reports | Yes | Yes. Staff can add an invoice but cannot change one afterwards. Reports for staff leave out the profit figures. |
| Email the invoice PDF straight from the business Gmail ("Send now with PDF") | Yes | No (the server refuses it) |
| Record client payments | Yes | Yes |
| Hired tab: see vehicles hired from other owners, add their details, record a payment to the owner | Yes | **Yes, currently.** The tab is not hidden from staff, so staff can see the hire amounts, the owner's phone and bank/UPI text, and can add a vehicle or a "Pay owner" entry. Only the server-enforced rule applies: staff cannot delete. |
| History tab (who changed what) | Yes | No (tab hidden, and the server refuses the request) |
| Delete anything, or undo a payment | Yes | No (refused by the server) |
| Home dashboard (profit, totals) and the More page | Yes | No (tabs hidden) |
| Business, GST and staff settings, adding or removing staff logins | Yes | No (the server refuses any change to settings) |
| Bank details | Yes | Staff phones receive them so invoices can show the account; they cannot change them |

What the server enforces and what the screen only hides:

- **Enforced by the server:** staff can never delete, never change settings, never change an existing invoice, and never receive the carried-forward balance. "Entered by" and "last changed by" are written by the server, so a phone cannot fake them. Staff logins stop working the moment you change their password or remove them.
- **Hidden on screen only:** profit figures and the Home and More tabs. **Not hidden from staff, although earlier versions of this page said so:** the "Outside vehicle hire" field on a trip and the whole Hired tab (hire amounts, owner phone and bank text, payments to owners). Staff phones still receive the underlying trip, expense and wage records so that their screens work. Give staff logins only to people you trust with those figures.

If the server refuses a change from a staff phone, the app shows a red warning at the top and undoes that change on the phone. If the server cannot be reached, the same warning says entries are saved on the phone only.

## Payment reminders

The **Reminders** tab lists clients who owe money. A client is "due" when the oldest unpaid trip is older than the grace days (default 15) and no reminder was sent in the last gap days (default 7). Change both numbers in **More**. WhatsApp and Email open a ready message with the unpaid trips, the total and your bank details; you check it and press send yourself. The app records the date when you open the message, so use **Mark as reminded** if you phoned instead, or **Snooze** to hide a client for the gap days. The app does not send anything to clients on its own.

## Daily email reminder for vehicle documents (optional)

The Vehicles tab only warns while the app is open. To get an email every morning even when nobody opens the app:

1. In **script.google.com**, open your project and paste in the updated `Server.gs`. Click **Save**.
2. To check the email works, choose **testReminder** in the function drop-down and click **Run** (it sends an email only if something is due). Then, in the same drop-down, choose **installReminderTrigger** and click **Run**. Allow the permissions Google asks for. If you ran it before, run it again once: it replaces the old trigger, and the new one is fixed to India time (Asia/Kolkata), so the email really arrives at about 8 am in India.
3. That is all. At about 8 am Google runs `sendDocReminders`, which emails the business Gmail a list of documents that have expired or are due within your reminder days (set in **More**). Nothing is sent on days when nothing is due.
4. Click **Deploy**, **Manage deployments**, edit, **New version** so the new staff rules also go live.

To stop the emails, open **Triggers** (clock icon) in the Apps Script editor and delete the trigger.

## Hired vehicles and payments to vehicle owners (the Hired tab)

Use this for vehicles you hire from other owners to do a client's trip.

1. In the trip form, enter the amount you pay the outside owner in **Outside vehicle hire (₹, our cost)** and put that vehicle's number in the vehicle box. This field is currently shown to staff as well. Our own vehicles are not listed on the Hired tab.
2. The Hired tab adds every such trip to that vehicle number automatically: **Hire total** (sum of the hire amounts), **Paid to owner** (sum of the payments you recorded) and the balance, shown as "to pay", "Settled" or "paid extra".
3. Tap **Add vehicle** to save the owner's name, phone, bank/UPI text and remarks, and **Call** to ring them. Tap **Pay owner** to record a payment (date, amount, cash/UPI/bank, note). Each payment is listed under "Payments to vehicle owners". Only the owner can delete a payment.
4. The vehicle number is matched ignoring capitals and spaces, so "TN 02 BB 2222" and "tn02bb2222" are the same vehicle.

How it reaches the reports: the hire amount is counted as a cost **on the trip date**, in Profit and loss ("Outside vehicle hire") and in Profit by vehicle ("Trip costs"). Paying the owner later does **not** change profit again, it only reduces what you still owe on the Hired tab. A trip with a hire amount but no payment yet therefore already reduces profit.

## What the reports show

On the Reports tab, choose the dates, then **Print or save PDF** or **Download Excel (CSV)**:

- **Profit and loss:** billed to clients, minus diesel, toll, airport, labour, border tax, other charges, police fines, outside vehicle hire and daily wages, giving "Profit before other expenses"; the Expenses-tab categories are then subtracted for "Real profit". Toll, airport, labour, border tax and other charges are billed to the client **and** counted as your cost, so they cancel out unless you billed less than you paid.
- **Profit by vehicle:** the same figures per vehicle. Driver wages and expenses that belong to no vehicle are listed on their own lines, and the "Real profit" line equals the one above.
- **Summary of client:** billed, received and the full amount still pending (not only for the chosen dates).
- **GST report:** one row per invoice that was saved with GST ticked, with taxable value, rate, CGST, SGST, IGST and total, plus a total row. Invoices saved before GST was added have no tax details and are not listed. Please check the figures with your accountant before filing.
- Staff see the reports without the profit figures.

## Weekly clean-up of old rows (recommended)

Deleted records leave a small "deleted" row in the `data` tab so that every phone learns about the deletion, and the `log` tab grows with every change. A weekly clean-up keeps both small:

- Deleted rows are removed **180 days** after the deletion (`TOMBSTONE_DAYS` at the top of `Server.gs`).
- `log` rows are removed once they are **365 days** old (`LOG_KEEP_DAYS`). If you want to keep the old history, use **File, Download** on the `log` tab before the first run.
- Records that are not deleted are never touched.

To switch it on, in the Apps Script editor (after deploying the new `Server.gs`):
1. Choose the function **previewCleanup** and click **Run**. Open **Execution log**: it shows how many rows would be removed. Nothing is changed.
2. Choose **installCleanupTrigger** and click **Run** once. Google now runs the clean-up every Sunday at 3 am India time.

A phone that was switched off for more than 180 days is handled automatically: on its next sync it reloads everything from the server and drops the records that were deleted meanwhile. Any change on that phone that was not yet sent is kept and sent.

## Sending invoices by email automatically

On the Invoice tab, tap **Send by email**. The app shows a "Check before sending" box with the message. The owner sees two buttons there: **Open in my email app** (you press send yourself) and **Send now with PDF** (the server emails the invoice as a PDF from your Gmail). The second button needs the client to have an email address, and only the owner sees it. Staff can use **Open in my email app** or **Send on WhatsApp**. Test **Send now with PDF** by sending to your own email first and check the layout. Free Gmail accounts have a daily sending limit; when it is used up the app tells you instead of failing silently. Check Google's current limits.

## Keeping data safe

- **Change history:** every time a record is created, changed or deleted, the server adds a row to a second tab named `log` in the same Google Sheet. Each row shows the time, who did it (username and role), what they did, the record, and the record before and after the change. Rows in `log` are never edited, and only the weekly clean-up (below) removes old ones, so you can use it to see who changed a payment or an amount. Open the sheet and look at the `log` tab (filter the `user` or `key` column). The tab is created automatically the first time something is saved after you deploy the new `Server.gs`. It grows over time; once it gets very large you can delete old rows in Sheets yourself.
- **History screen:** the owner also sees this log inside the app, on the **History** tab (not shown to staff). It lists every change newest first, can be filtered by person, kind of record and action, and **Details** shows exactly which fields changed. It needs the new `Server.gs` (the `history` action). It only reads the `log` tab.
- The Google Sheet is the master copy. Use **File, Version history** in Sheets to see earlier versions.
- Passwords are stored as scrambled hashes in the script settings, never in the sheet.
- After 5 wrong passwords, only that phone is blocked for 10 minutes. If someone keeps trying from many phones, new phones are blocked from that username for an hour after 30 wrong tries in total. Phones that have already logged in successfully are not blocked by that limit, so a stranger cannot lock you out of your own phone.
- **Lost or stolen phone:** in **More**, give that staff login a new password (or remove it). The old password and the phone's saved login stop working immediately, even if you later re-create the same username. For the owner phone, change the owner password in **More** straight away: every other phone is logged out at once and the phone you used stays logged in. Phones that are already logged in when you first install this version stay logged in until a password is changed.
- **Mass-delete protection:** if the owner's phone is about to delete 10 or more shared records and you did not just run a clean-up or a restore, the app stops and asks. Choose **Restore them from the shared ledger** if the phone lost its own data.
- Backups: you can still copy or email a backup from **More**. The app also keeps up to 3 restore points on each device.

## Updating the app later

1. Upload the new `index.html`, `sw.js`, `manifest.json` and the icons to the same host project. All records stay safe because they live in your Google Sheet.
2. The app makes a restore point on the device before it first runs a new version.
3. If you change `Server.gs`, click **Deploy**, then **Manage deployments**, edit the deployment and choose **New version**. The link stays the same. Upload the new `index.html` and deploy the new `Server.gs` together.

## Limits you should know

- Google free accounts have daily limits on script use. A business of this size should be far below them, but check Google's current quota page.
- Each save takes a moment to reach other phones (usually within 30 seconds).
- If two people change the same record at nearly the same time, the first save wins. The second person's phone is told "Someone else changed this record first. Your change was not saved", shows the latest version, and they can enter their change again. Nothing is overwritten silently. (This protection needs both the new `Server.gs` and the new `index.html`; deploy them together.) Daily wage and advance entries for one driver on one date are a single record, so two phones cannot create duplicates. Invoice numbers are worked out from the invoices that already exist; if two phones make an invoice at the same moment, the server keeps the first and the second phone is told it was refused.
- **Invoice numbers are given by the server.** When you print, send on WhatsApp or email an invoice, the phone saves it on the server under the number shown. If two phones do this at the same moment, the first gets the number and the second is refused with "Another phone just used that invoice number". Its invoice is renumbered to the next free number and the user taps Print or Send again. The number box is read-only in shared mode, and an invoice cannot be numbered while the phone is offline. (Needs the new `Server.gs` and `index.html` deployed together. The WhatsApp and email buttons save the invoice as soon as the "Check before sending" box opens, because the number must be known first.)
- **Version 6.1 upgrade on each phone is automatic.** The app now fingerprints records with SHA-256 instead of a short 32-bit number, so two different edits can no longer look the same. The first time a phone opens the new version it converts its saved fingerprints, and only for records that have no unsent change; anything not yet sent is still sent. The app also takes its usual automatic restore point before the first run of a new version. The old on-device password for single-phone mode has been removed (shared mode logins are on the server and are unchanged).
- GST is worked out in whole paise, rounding half a paisa up, using exact integer arithmetic (checked against exact calculation on 1,000,000 random invoices with rates such as 5, 12, 18, 28 and 2.5 per cent, with no differences). CGST and SGST are each half of the tax, rounded on their own, so for an odd paisa the two together can differ by one paisa from the IGST the same invoice would have had. Versions before 6.3 were one paisa out on about 1 in 600 amounts that ended exactly on half a paisa; invoices already saved keep the figures they were saved with. Invoices with no trips or a total of zero cannot be saved, printed or sent.
- The server logic (logins, staff rules, push and pull) was tested here against a simulated Google environment, not a live Google account. Please test it with a few made-up records first, using two phones.
- **Not tested in real use.** Nothing has been run against a real staff login, a real sync between phones or a printed invoice. The logic was checked and small tests were run, but real use may show problems. Before relying on it, run it alongside your current records for a week or two, using two phones, a staff login and a real printed invoice.
- **Everything is in one big file** (`index.html`). It is hard to maintain, and a small change can break something far away. Test the main screens again after any change.
- **Staff can still change amounts.** Editing cannot be removed without blocking their work. The "Changed by" list (History tab) only shows you what changed afterwards, it does not prevent it. Check it from time to time.
- **Archive to your Google Sheet (owner only).** In **More**, under Delete old records, press **Preview**, then **1b. Also save to Google Sheet**. The records about to be removed are copied to a new `archive` tab in your Sheet (phones never load that tab, and nothing cleans it automatically), and only then does the delete button unlock. You can still use **1. Save archive first** to download the file as well. Pressing 1b twice copies the records twice; delete the extra rows in the tab if that happens. Needs the new `Server.gs` deployed as a new version together with the new `index.html`. You can look things up in the archive tab, and you can also bring a batch back into the app: **More → Restore from archive → Show archived batches → Restore this batch** (owner only, needs internet). Any batch can be restored, in any order. If one batch cannot be restored on its own (for example a payment was also used by a newer batch), the app says so, changes nothing, and you restore the newer batch first. Before changing anything the app checks that every client's pending amount would stay exactly the same; if not, it stops and changes nothing. Each restored record is marked in the archive tab's "restored at" column so a batch cannot be restored twice. You can also restore from the file you downloaded with **1. Save archive first**: **More → Restore from a saved file → choose the file**. This works without the Google Sheet and without internet, and uses the same safety check. A batch or file saved by an older version of the app (before this restore feature) cannot be restored automatically. Records you edited by hand after archiving may be overwritten by the restore. The app also makes a restore point on the phone just before restoring.
- **It may slow down as data grows.** Each phone keeps all records and syncs them in batches. This suits one business for a few years. With many years of trips it will get slower; use **Delete old records** in More (after a backup) to keep it light.
- **The backend depends on Google Apps Script,** which has usage limits and can be slow. It is fine for a business of this size, but it is not a business-grade system.

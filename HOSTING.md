# Putting Trip Ledger online for free

Trip Ledger is one HTML page plus a few small helper files (`sw.js`, `manifest.json` and four icons) that let it open without internet. It only needs a place to be stored. You do not need a paid website. For shared data across phones, also follow [ONLINE-SETUP.md](ONLINE-SETUP.md).

## Free hosting options

| Option | Cost | Good for | Watch out for |
|---|---|---|---|
| **Cloudflare Pages** (recommended) | Free plan, unlimited static traffic | Real daily business use | Menu names change; Cloudflare now also promotes "Workers with static assets". |
| **GitHub Pages** | Free for public repositories | Showing the project on your resume | The repository must be public, so never upload real data. Its terms are aimed at personal and project sites. |
| **Netlify** | Free plan with monthly credits | Drag-and-drop deploys | The free plan is capped. |

A custom address such as `yourbusiness.in` is optional and costs a small yearly fee. The free `.pages.dev` address works fine. Plans change, so check the host's pricing page.

## Cloudflare Pages steps

1. Create a free account at cloudflare.com (use the business Gmail).
2. Open **Workers & Pages**, create a **Pages** project and choose **Upload assets** (direct upload).
3. Upload the whole folder (`index.html`, `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`) and click **Deploy**. Keep all of them together.
4. You get a link ending in `.pages.dev`. Open it on a phone in Chrome while online, wait a few seconds, then choose **Add to Home screen**. After that the app opens even with no signal. Entries are saved on the phone and sent when the internet returns.

## GitHub Pages steps (demo copy)

A public repository shows everything in it to the world, so make a separate demo copy first:

1. In the demo copy of `index.html`, set `var SERVER_URL="";` and replace the business name, owner, address, phone and email in `DEF.settings` with sample values. Remove any real email address or family names from the `.md` files.
2. Name the ignore file `.gitignore` (with the dot). It keeps `my-business-setup.txt` and `*.backup.json` out of the repository.
3. Create a public repository and upload the demo files.
4. Go to **Settings**, then **Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`.
5. The demo is live after about a minute. Use only sample data there. Keep the real, configured copy in a private repository or deploy it straight to Cloudflare Pages.

## First-time setup on each device

The published website code should contain no bank details, no signature and no GST number, because anyone with the link can read a website's code. Your live server link is also visible in the code, which is fine once the owner account exists (it cannot be created twice), but do not publish it in a public repository.

- **With the shared online ledger:** the owner enters bank and GST details once in **More**. They are stored in your Google Sheet and sent only to the owner's devices.
- **Without it (single device):** paste your private `my-business-setup.txt` into the backup box in **More** and tap **Restore from text**. The file is a small JSON text that starts with `{"setup": {` followed by your business, bank and GST fields; keep it private and never upload it (the `.gitignore` already excludes it). This fills in the bank details without deleting trips.

## Where the data lives

- **Shared mode:** in your Google Sheet, with a copy on each phone so it works offline.
- **Single-device mode:** only in that browser. A new phone starts empty until you restore a backup.
- Keep using the same app link. Browsers store data per web address.

## Legal note about deleting old records

The app can delete old paid records after a number of years you choose (default 2). Indian tax and GST rules usually require business records to be kept for about 6 years, so confirm with your accountant before using it, and always save the archive first.

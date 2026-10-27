// Trip Ledger shared server (Google Apps Script + Google Sheet).
// Setup steps are in ONLINE-SETUP.md. Paste this file into a new Apps Script project,
// replace SHEET_ID below, then Deploy > New deployment > Web app
// (Execute as: Me, Who has access: Anyone).

const SHEET_ID = "PASTE-YOUR-GOOGLE-SHEET-ID-HERE";
const SHEET_NAME = "data";
const ARCHIVE_NAME = "archive";           // old records copied here by the owner before "Delete old records" (never read by phones, never cleaned automatically)
const LOG_NAME = "log";                    // append-only change history (every create, edit and delete, with the old and new record)
const TZ = "Asia/Kolkata";                 // the daily reminder runs at 8 am India time
const TOKEN_DAYS = 30;
const TOMBSTONE_DAYS = 180;                // a deleted record stays in the sheet this long so phones that were offline still learn it was deleted, then the row is removed
const LOG_KEEP_DAYS = 365;                 // change-log rows older than this are removed by the weekly clean-up (download the tab first if you want to keep them)
const OWNER_COLLECTIONS = ["trips", "entries", "clients", "drivers", "fuel", "invoices", "settings"];

// ---- Role rules (staff). Owner may do everything in OWNER_COLLECTIONS. ----
const STAFF_ACTIONS = { status: 1, login: 1, push: 1, pull: 1, nextinv: 1, newinvoice: 1 };                        // every other action is owner only
const STAFF_COLLECTIONS = { trips: 1, entries: 1, clients: 1, drivers: 1, fuel: 1, invoices: 1 };   // staff can add invoices; settings are read-only for staff
// Staff may read and write every entry kind (payments, expenses, wages, vehicle details ...).
const STAFF_SETTINGS = ["name", "owner", "proprietor", "address", "phone", "email", "gst", "gstRate", "sac", "prefix", "queries", "freeHrs", "haltRate", "remDays", "payGrace", "payGap", "sign",
  "bankLabel", "bankAcName", "bankName", "bankBranch", "bankAcNo", "bankIfsc", "gpay", "bank2", "bank3"];   // read-only for staff, so invoices can show the bank details
// Per collection: staff may CREATE new records, but may only EDIT existing ones where listed here.
const STAFF_CAN_EDIT = { trips: 1, fuel: 1, entries: 1, clients: 1, drivers: 1 };       // invoices: add only. Staff can never delete anything.

function doGet() { return reply({ ok: true, app: "trip-ledger" }); }

function doPost(e) {
  let out;
  try { out = route(JSON.parse(e.postData.contents)); }
  catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    const busy = /lock/i.test(String(err && err.message));
    out = { ok: false, error: busy ? "Server is busy. Please try again in a moment." : "server error" };
  }
  return reply(out);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function route(b) {
  const a = b.action;
  if (a === "status") return { ok: true, initialized: Object.keys(getUsers()).length > 0 };
  if (a === "setup") return setup(b);
  if (a === "login") return login(b);
  const who = verify(b.token);
  if (!who) return { ok: false, error: "auth" };
  if (!roleAllowsAction(who.role, a)) return { ok: false, error: "Not allowed for staff." };
  if (a === "pull") return pull(b, who);
  if (a === "push") return push(b, who);
  if (a === "setpassword") return setPassword(b, who);
  if (a === "listusers") return listUsers();
  if (a === "adduser") return addUser(b);
  if (a === "removeuser") return removeUser(b, who);
  if (a === "invoice") return sendInvoice(b);
  if (a === "history") return history(b);                  // owner only (not in STAFF_ACTIONS)
  if (a === "archive") return archiveRows(b, who);
  if (a === "archivelist") return archiveList();             // owner only
  if (a === "archiveget") return archiveGet(b);              // owner only
  if (a === "archivemark") return archiveMark(b);            // owner only           // owner only (not in STAFF_ACTIONS)
  if (a === "nextinv") return nextInv();
  if (a === "newinvoice") return newInvoice(b, who);
  return { ok: false, error: "unknown action" };
}

/* ---------- users and login ---------- */
function props() { return PropertiesService.getScriptProperties(); }
function getUsers() { try { return JSON.parse(props().getProperty("users") || "{}"); } catch (e) { return {}; } }
function saveUsers(u) { props().setProperty("users", JSON.stringify(u)); }
function b64(bytes) { return Utilities.base64Encode(bytes); }
function newSalt() { return Utilities.getUuid(); }
function hashPw(pw, salt) {
  let d = salt + ":" + pw;
  for (let i = 0; i < 300; i++) d = b64(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d));
  return d;
}
function validUser(u) { return typeof u === "string" && /^[a-z0-9._-]{3,30}$/.test(u); }
function validPw(p) { return typeof p === "string" && p.length >= 8 && p.length <= 100; }
function sign(payload) { return b64(Utilities.computeHmacSha256Signature(payload, props().getProperty("secret"))); }
function makeToken(user, role, tv) {
  const p = user + "|" + role + "|" + (Date.now() + TOKEN_DAYS * 864e5) + "|" + (tv || "");
  return p + "." + sign(p);
}
function verify(t) {
  if (typeof t !== "string") return null;
  const i = t.lastIndexOf(".");
  if (i < 0) return null;
  const p = t.slice(0, i);
  if (sign(p) !== t.slice(i + 1)) return null;
  const parts = p.split("|");
  if (Number(parts[2]) < Date.now()) return null;
  const u = getUsers()[parts[0]];
  if (!u || u.role !== parts[1]) return null;
  if (String(parts[3] || "") !== String(u.tv || "")) return null;   // token version: changes on every password change
  return { user: parts[0], role: parts[1] };
}
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function setup(b) {
  return withLock(function () {
    if (Object.keys(getUsers()).length > 0) return { ok: false, error: "Already set up. Please log in." };
    const user = String(b.user || "").trim().toLowerCase();
    if (!validUser(user)) return { ok: false, error: "Username: 3 to 30 letters, numbers, dot, dash or underscore." };
    if (!validPw(b.password)) return { ok: false, error: "Password must have at least 8 characters." };
    props().setProperty("secret", Utilities.getUuid() + Utilities.getUuid());
    const salt = newSalt();
    const tv = newSalt();
    saveUsers({ [user]: { salt: salt, hash: hashPw(b.password, salt), role: "owner", tv: tv } });
    return { ok: true, token: makeToken(user, "owner", tv), role: "owner" };
  });
}
// Wrong-password limits. Each phone sends a random device id, so 5 wrong tries lock only THAT phone
// for 10 minutes. A second, larger limit per username (30 wrong tries in an hour) stops someone who keeps
// changing the device id. Phones that have logged in successfully before ("known devices") are NOT blocked
// by the username limit, so a stranger cannot lock the owner out of the owner's own phone.
const DEVICE_FAILS = 5, DEVICE_LOCK_SECS = 600, USER_FAILS = 30, USER_LOCK_SECS = 3600, KNOWN_PER_USER = 10;
function getKnown() { try { return JSON.parse(props().getProperty("known") || "{}"); } catch (e) { return {}; } }
function isKnownDevice(user, dev) { return dev !== "nodevice" && (getKnown()[user] || []).indexOf(dev) > -1; }
function rememberDevice(user, dev) {
  if (dev === "nodevice") return;
  const k = getKnown(), list = k[user] || [];
  if (list.indexOf(dev) > -1) return;
  list.push(dev);
  k[user] = list.slice(-KNOWN_PER_USER);
  props().setProperty("known", JSON.stringify(k));
}
function login(b) {
  const user = String(b.user || "").trim().toLowerCase();
  const dev = /^[a-z0-9]{8,40}$/.test(String(b.device || "")) ? String(b.device) : "nodevice";
  const cache = CacheService.getScriptCache();
  const dKey = "fail:" + user + ":" + dev, uKey = "failu:" + user;
  const dFails = Number(cache.get(dKey) || 0), uFails = Number(cache.get(uKey) || 0);
  if (dFails >= DEVICE_FAILS) return { ok: false, error: "Too many wrong attempts on this phone. Please try again in 10 minutes." };
  if (uFails >= USER_FAILS && !isKnownDevice(user, dev)) return { ok: false, error: "Too many wrong attempts for this username. Please try again later." };
  const u = getUsers()[user];
  if (!u || hashPw(String(b.password || ""), u.salt) !== u.hash) {
    cache.put(dKey, String(dFails + 1), DEVICE_LOCK_SECS);
    cache.put(uKey, String(uFails + 1), USER_LOCK_SECS);
    return { ok: false, error: "Wrong username or password." };
  }
  cache.remove(dKey);
  withLock(function () { rememberDevice(user, dev); });
  return { ok: true, token: makeToken(user, u.role, u.tv), role: u.role };
}
function setPassword(b, who) {
  if (!validPw(b.password)) return { ok: false, error: "Password must have at least 8 characters." };
  return withLock(function () {
    const users = getUsers();
    const salt = newSalt();
    users[who.user].salt = salt;
    users[who.user].hash = hashPw(b.password, salt);
    users[who.user].tv = newSalt();                                // logs out every other phone using the old password
    saveUsers(users);
    return { ok: true, token: makeToken(who.user, who.role, users[who.user].tv) };   // this phone gets a fresh token
  });
}
function addUser(b) {
  const user = String(b.user || "").trim().toLowerCase();
  if (!validUser(user)) return { ok: false, error: "Staff username: 3 to 30 letters, numbers, dot, dash or underscore." };
  if (!validPw(b.password)) return { ok: false, error: "Password must have at least 8 characters." };
  return withLock(function () {
    const users = getUsers();
    if (users[user] && users[user].role === "owner") return { ok: false, error: "That name belongs to the owner." };
    const salt = newSalt();
    users[user] = { salt: salt, hash: hashPw(b.password, salt), role: "staff", tv: newSalt() };
    saveUsers(users);
    return { ok: true };
  });
}
function removeUser(b, who) {
  const user = String(b.user || "").trim().toLowerCase();
  return withLock(function () {
    const users = getUsers();
    if (!users[user] || users[user].role === "owner" || user === who.user) return { ok: false, error: "No such staff user." };
    delete users[user];
    saveUsers(users);
    const k = getKnown(); delete k[user]; props().setProperty("known", JSON.stringify(k));
    return { ok: true };
  });
}

function listUsers() {
  const users = getUsers();
  return { ok: true, users: Object.keys(users).map(function (k) { return { user: k, role: users[k].role }; }) };
}

/* ---------- role enforcement ---------- */
function has(map, k) { return Object.prototype.hasOwnProperty.call(map, k); }
function roleAllowsAction(role, action) { return role === "owner" || has(STAFF_ACTIONS, String(action)); }

// existing(c, id) returns the stored record's data object or null.
function validShape(o) {
  // The record must be a plain object whose own id matches the key, and must be a reasonable size.
  if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) return false;
  if (String(o.c) !== "invoices" && String(o.data.id) !== String(o.id)) return false;
  try { return JSON.stringify(o.data).length <= 20000; } catch (e) { return false; }
}
function filterPushOps(role, ops, existing, user) {
  if (role === "owner") return { allowed: ops, rej: [] };
  const allowed = [], rej = [], nowTs = Date.now();
  ops.forEach(function (o) {
    const c = String(o.c), id = String(o.id), key = c + "|" + id;
    let ok = true, old = null;
    if (o.del) ok = false;                                         // staff can never delete
    else if (!has(STAFF_COLLECTIONS, c)) ok = false;               // settings and anything unknown
    else if (!validShape(o)) ok = false;
    else {
      old = existing(c, id);
      if (c === "invoices" && !old) ok = false;                    // new invoices get their number from the server ("newinvoice"), never from a phone
      else if (old && !has(STAFF_CAN_EDIT, c)) ok = false;         // existing invoices cannot be changed by staff
      else if (c === "clients") {
        // The carried-forward balance is hidden from staff, so keep the stored value whatever the phone sends.
        if (old && "carry" in old) o.data.carry = old.carry; else delete o.data.carry;
        if (old && old.code) o.data.code = old.code;
      }
      if (ok) {
        // "Entered by" and "changed by" are written by the server, so a phone cannot fake them.
        const d = o.data;
        if (old) {
          if (old.by) { d.by = old.by; d.at = old.at; } else { delete d.by; delete d.at; }
          d.edBy = user; d.edAt = nowTs;
        } else {
          d.by = user; d.at = nowTs; delete d.edBy; delete d.edAt;
        }
      }
    }
    if (ok) allowed.push(o); else rej.push(key);
  });
  return { allowed: allowed, rej: rej };
}

function filterPullRecords(role, records) {
  if (role === "owner") return records;
  return records.filter(function (r) {
    if (r.c === "settings") return true;                           // trimmed below
    if (!has(STAFF_COLLECTIONS, r.c)) return false;
    return true;
  }).map(function (r) {
    if (r.c === "clients" && r.data) delete r.data.carry;
    if (r.c !== "settings" || !r.data) return r;
    const d = {};
    STAFF_SETTINGS.forEach(function (k) { if (k in r.data) d[k] = r.data[k]; });
    r.data = d;
    return r;
  });
}

/* ---------- data ---------- */
function sheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 6).setValues([["key", "collection", "id", "json", "updated", "deleted"]]);
  }
  return sh;
}
function logSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(LOG_NAME);
  if (!sh) {
    sh = ss.insertSheet(LOG_NAME);
    sh.getRange(1, 1, 1, 7).setValues([["time", "user", "role", "operation", "key", "before", "after"]]);
  }
  return sh;
}
/* ---------- archive tab: a copy of old records the owner is about to delete from the live data ---------- */
function archiveSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(ARCHIVE_NAME);
  if (!sh) {
    sh = ss.insertSheet(ARCHIVE_NAME);
    sh.getRange(1, 1, 1, 7).setValues([["saved at", "saved by", "batch", "kind", "id", "json", "restored at"]]);
  }
  return sh;
}
// Appends the given records (b.items = [{k: kind, id, data}]) to the archive tab. Phones never read this tab.
function archiveRows(b, who) {
  return withLock(function () {
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length || items.length > 500) return { ok: false, error: "Nothing to archive, or too many at once." };
    const batch = String(b.batch || "").slice(0, 60), now = new Date().toISOString();
    const rows = items.map(function (x) {
      const js = JSON.stringify(x.data == null ? null : x.data);
      if (js.length > 45000) throw new Error("archive record too large");
      return [now, who.user, batch, String(x.k || "").slice(0, 30), String(x.id == null ? "" : x.id), js];
    });
    const sh = archiveSheet();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    SpreadsheetApp.flush();
    return { ok: true, saved: rows.length };
  });
}
// Lists the archived batches: how many records each has and how many are already restored.
function archiveList() {
  const sh = archiveSheet(), last = sh.getLastRow();
  if (last < 2) return { ok: true, batches: [] };
  const n = last - 1, a = sh.getRange(2, 1, n, 3).getValues(), g = sh.getRange(2, 7, n, 1).getValues();
  const order = [], by = {};
  for (let i = 0; i < n; i++) {
    const name = String(a[i][2]);
    if (!by[name]) { by[name] = { batch: name, total: 0, restored: 0, at: String(a[i][0]), by: String(a[i][1]) }; order.push(name); }
    by[name].total++;
    if (g[i][0]) by[name].restored++;
  }
  return { ok: true, batches: order.map(function (k) { return by[k]; }) };
}
// Returns the records of one batch that are not restored yet. Does not change anything.
function archiveGet(b) {
  const batch = String(b.batch || ""), sh = archiveSheet(), last = sh.getLastRow();
  if (last < 2) return { ok: true, items: [] };
  const n = last - 1, a = sh.getRange(2, 3, n, 4).getValues(), j = sh.getRange(2, 6, n, 1).getValues(), g = sh.getRange(2, 7, n, 1).getValues();
  const items = [];
  for (let i = 0; i < n; i++) {
    if (String(a[i][0]) !== batch || g[i][0]) continue;
    let data = null;
    try { data = JSON.parse(j[i][0]); } catch (e) { continue; }
    items.push({ k: String(a[i][1]), id: String(a[i][2]), data: data });
  }
  return { ok: true, items: items };
}
// Marks every not-yet-restored record of the batch as restored, so it cannot be restored twice.
function archiveMark(b) {
  return withLock(function () {
    const batch = String(b.batch || ""), sh = archiveSheet(), last = sh.getLastRow();
    if (last < 2) return { ok: true, marked: 0 };
    const n = last - 1, a = sh.getRange(2, 3, n, 1).getValues(), g = sh.getRange(2, 7, n, 1).getValues(), now = new Date().toISOString();
    let m = 0;
    for (let i = 0; i < n; i++) if (String(a[i][0]) === batch && !g[i][0]) { g[i][0] = now; m++; }
    sh.getRange(2, 7, n, 1).setValues(g);
    SpreadsheetApp.flush();
    return { ok: true, marked: m };
  });
}
function cap(v) { return String(v == null ? "" : v).slice(0, 45000); }   // one sheet cell holds at most 50,000 characters
// Reads the JSON cell of the given sheet rows (few rows: just those cells; many rows: the whole column).
function readJson(sh, rowNums, last) {
  const out = {};
  if (!rowNums.length) return out;
  if (rowNums.length > 60 || rowNums.length > (last - 1) / 3) {
    sh.getRange(2, 4, last - 1, 1).getValues().forEach(function (r, i) { out[i + 2] = r[0]; });
  } else {
    sh.getRangeList(rowNums.map(function (r) { return "D" + r; })).getRanges().forEach(function (rg, j) { out[rowNums[j]] = rg.getValue(); });
  }
  return out;
}
function rows(sh) {
  const last = sh.getLastRow();
  return last > 1 ? sh.getRange(2, 1, last - 1, 6).getValues() : [];
}
function isDel(v) { return v === 1 || v === "1" || v === true; }
function pull(b, who) {
  return withLock(function () {
    const now = Date.now(), keys = Array.isArray(b.keys) ? b.keys : [];
    let since = Number(b.since || 0), reset = false;
    // A phone that last synced before the last clean-up may have missed deletions whose markers are now gone.
    // It gets everything again and removes the records that no longer exist (the app does that when it sees `reset`).
    const horizon = Number(props().getProperty("purged") || 0);
    if (since > 0 && since < horizon) { reset = true; since = 0; }
    const sh = sheet(), last = sh.getLastRow();
    let records = [];
    if (last > 1) {
      const n = last - 1;
      // Small columns first (key, collection, id / updated, deleted); the large JSON column is read only for rows that are needed.
      const head = sh.getRange(2, 1, n, 3).getValues(), tail = sh.getRange(2, 5, n, 2).getValues();
      const need = [];
      for (let i = 0; i < n; i++) {
        if (Number(tail[i][0]) < since && keys.indexOf(head[i][0]) < 0) continue;
        if (OWNER_COLLECTIONS.indexOf(head[i][1]) < 0) continue;
        need.push(i);
      }
      let json = {};
      const wanted = need.filter(function (i) { return !isDel(tail[i][1]); });
      if (wanted.length > 60 || wanted.length > n / 3) {
        sh.getRange(2, 4, n, 1).getValues().forEach(function (r, i) { json[i] = r[0]; });
      } else if (wanted.length) {
        const rl = sh.getRangeList(wanted.map(function (i) { return "D" + (i + 2); })).getRanges();
        rl.forEach(function (r, j) { json[wanted[j]] = r.getValue(); });
      }
      need.forEach(function (i) {
        const del = isDel(tail[i][1]);
        let data = null;
        if (!del) { try { data = JSON.parse(json[i]); } catch (e) { return; } }
        records.push({ c: head[i][1], id: String(head[i][2]), data: data, ts: Number(tail[i][0]), del: del });
      });
    }
    records = filterPullRecords(who.role, records);
    return { ok: true, now: now, records: records, reset: reset };
  });
}
function push(b, who) {
  const ops = Array.isArray(b.ops) ? b.ops : [];
  if (ops.length > 300) return { ok: false, error: "too many changes at once" };
  return withLock(function () {
    const sh = sheet();
    const last = sh.getLastRow();
    const index = {};
    if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { index[r[0]] = i + 2; });
    const isOwner = who.role === "owner";
    const jsonCol = (!isOwner && last > 1) ? sh.getRange(2, 4, last - 1, 1).getValues() : [];
    const existing = function (c, id) {
      const i = index[c + "|" + id];
      if (!i || !jsonCol[i - 2] || !jsonCol[i - 2][0]) return null;
      try { return JSON.parse(jsonCol[i - 2][0]); } catch (e) { return null; }
    };

    // Conflict check: the phone says which version of the record it last saw (base = that record's server time).
    // If somebody saved the record after that, this change would silently wipe their edit, so it is refused
    // (unless the stored record is already exactly what the phone is sending, e.g. a retry after a lost reply).
    const updCol = last > 1 ? sh.getRange(2, 5, last - 1, 1).getValues() : [];
    const delCol = last > 1 ? sh.getRange(2, 6, last - 1, 1).getValues() : [];
    const conflicts = [], okOps = [];
    ops.forEach(function (o) {
      const key = String(o.c) + "|" + String(o.id), i = index[key];
      // An invoice number that already belongs to a saved invoice is never overwritten by a phone that did not see it
      // (two phones that made the same number). An identical re-send, e.g. after a lost reply, is simply accepted.
      if (i && !o.del && String(o.c) === "invoices" && !isDel(delCol[i - 2][0])) {
        if (String(sh.getRange(i, 4).getValue()) === JSON.stringify(o.data)) return;
        if (typeof o.base !== "number") { conflicts.push(key); return; }
      }
      if (i && !o.del && typeof o.base === "number" && Number(updCol[i - 2][0]) > o.base) {
        const cur = String(sh.getRange(i, 4).getValue());
        if (cur !== JSON.stringify(o.data)) { conflicts.push(key); return; }
        return;                                                        // already exactly this: nothing to write, and the record's time stays as it was
      }
      okOps.push(o);
    });

    const chk = filterPushOps(who.role, okOps, existing, who.user);
    const rej = chk.rej.concat(conflicts);
    const now = Date.now();
    const adds = [], updates = [], newPos = {};
    chk.allowed.forEach(function (o) {
      const c = String(o.c), id = String(o.id), key = c + "|" + id;
      if (OWNER_COLLECTIONS.indexOf(c) < 0) { rej.push(key); return; }
      if (!o.del && (typeof o.data !== "object" || o.data === null)) { rej.push(key); return; }
      const row = [key, c, id, o.del ? "" : JSON.stringify(o.data), now, o.del ? 1 : 0];
      if (index[key]) updates.push({ r: index[key], row: row });
      else if (key in newPos) adds[newPos[key]] = row;               // same new record twice in one push: keep the latest
      else { newPos[key] = adds.length; adds.push(row); }
    });

    // Old versions are read BEFORE writing, for the change log.
    let olds = {};
    try { olds = readJson(sh, updates.map(function (u) { return u.r; }), last); } catch (e) { console.error(e); }

    // Write all changes to existing rows in ONE call when there are several (much faster than one call per row).
    if (updates.length > 5 && last > 1) {
      const rng = sh.getRange(2, 1, last - 1, 6), vals = rng.getValues();
      updates.forEach(function (u) { vals[u.r - 2] = u.row; });
      rng.setValues(vals);
    } else {
      updates.forEach(function (u) { sh.getRange(u.r, 1, 1, 6).setValues([u.row]); });
    }
    if (adds.length) sh.getRange(sh.getLastRow() + 1, 1, adds.length, 6).setValues(adds);

    // Change log. A failure here must never block saving the data itself.
    try {
      const logs = [];
      updates.forEach(function (u) {
        const before = String(olds[u.r] == null ? "" : olds[u.r]), after = String(u.row[3]);
        if (before === after) return;                                  // nothing actually changed
        logs.push([now, who.user, who.role, u.row[5] === 1 ? "delete" : "update", u.row[0], cap(before), cap(after)]);
      });
      adds.forEach(function (row) { logs.push([now, who.user, who.role, row[5] === 1 ? "delete" : "create", row[0], "", cap(row[3])]); });
      if (logs.length) { const ls = logSheet(); ls.getRange(ls.getLastRow() + 1, 1, logs.length, 7).setValues(logs); }
    } catch (e) { console.error(e); }

    return { ok: true, rejected: rej.length, rej: rej, conflict: conflicts, ts: now };
  });
}

/* ---------- change history for the app's History screen (owner only) ---------- */
// Reads the `log` tab. List mode returns the newest changes first (without the big before/after text) and a cursor
// (`next`, a row number) to load older ones. Detail mode ({row}) returns the before and after of one change.
function history(b) {
  const sh = logSheet(), last = sh.getLastRow();
  if (b.row) {
    const r = Math.floor(Number(b.row));
    if (!(r >= 2 && r <= last)) return { ok: false, error: "No such change." };
    const v = sh.getRange(r, 1, 1, 7).getValues()[0];
    return { ok: true, entry: { row: r, t: Number(v[0]), user: String(v[1]), role: String(v[2]), op: String(v[3]), key: String(v[4]), before: String(v[5]), after: String(v[6]) } };
  }
  const limit = Math.min(Math.max(Math.floor(Number(b.limit)) || 50, 1), 100);
  const fUser = String(b.user || ""), fColl = String(b.coll || ""), fOp = String(b.op || "");
  let end = Math.floor(Number(b.before)) || last + 1;          // scan rows below this one
  if (end > last + 1) end = last + 1;
  const out = [];
  let scanned = 0;
  while (end > 2 && out.length < limit && scanned < 4000) {
    const from = Math.max(2, end - 500);
    const v = sh.getRange(from, 1, end - from, 5).getValues();
    scanned += v.length;
    for (let i = v.length - 1; i >= 0 && out.length < limit; i--, end--) {
      const x = v[i], key = String(x[4]);
      if (fUser && String(x[1]) !== fUser) continue;
      if (fOp && String(x[3]) !== fOp) continue;
      if (fColl && key.indexOf(fColl + "|") !== 0) continue;
      out.push({ row: from + i, t: Number(x[0]), user: String(x[1]), role: String(x[2]), op: String(x[3]), key: key });
    }
    if (out.length < limit) end = from;                         // block fully scanned
  }
  return { ok: true, entries: out, next: end > 2 ? end : 0 };
}

/* ---------- invoice numbers (assigned by the server) ---------- */
// The next number is worked out here, inside the lock, from the invoices that really exist on the server.
// A phone may only save an invoice under exactly that number. If another phone got there first, the number has
// moved on, the save is refused ("taken") and the phone is told the new number so the user can tap again.
function invoiceInfo(sh) {
  const last = sh.getLastRow();
  let prefix = "LTP", nextSet = 1, settingsRow = 0;
  const live = [], index = {};
  if (last > 1) {
    const head = sh.getRange(2, 1, last - 1, 3).getValues(), del = sh.getRange(2, 6, last - 1, 1).getValues();
    for (let i = 0; i < head.length; i++) {
      index[head[i][0]] = i + 2;
      if (head[i][1] === "settings" && String(head[i][2]) === "main" && !isDel(del[i][0])) settingsRow = i + 2;
      if (head[i][1] === "invoices" && !isDel(del[i][0])) live.push(String(head[i][2]));
    }
  }
  if (settingsRow) {
    try {
      const st = JSON.parse(sh.getRange(settingsRow, 4).getValue());
      if (st.prefix) prefix = String(st.prefix);
      nextSet = Number(st.next) || 1;
    } catch (e) { /* keep the defaults */ }
  }
  let mx = 0;
  live.forEach(function (no) {
    if (no.indexOf(prefix + "-") !== 0) return;
    const m = no.match(/-(\d+)$/);
    if (m && Number(m[1]) > mx) mx = Number(m[1]);
  });
  const seq = Math.max(nextSet, mx + 1);
  const no = prefix + "-" + Utilities.formatDate(new Date(), TZ, "yyMM") + "-" + String(seq).padStart(3, "0");
  return { no: no, index: index };
}
function nextInv() { return { ok: true, no: invoiceInfo(sheet()).no }; }
function newInvoice(b, who) {
  const d = b.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, error: "Invalid invoice." };
  if (!String(d.client || "").trim() || !(Number(d.total) > 0)) return { ok: false, error: "Invoice has no client or a zero total." };
  return withLock(function () {
    const sh = sheet(), info = invoiceInfo(sh);
    if (String(d.no) !== info.no) return { ok: false, taken: true, next: info.no, error: "That invoice number was just used on another phone." };
    const now = Date.now();
    const rec = Object.assign({}, d, { no: info.no, by: who.user, at: now });
    delete rec.edBy; delete rec.edAt;
    const json = JSON.stringify(rec);
    if (json.length > 20000) return { ok: false, error: "Invoice is too large." };
    const key = "invoices|" + info.no, row = [key, "invoices", info.no, json, now, 0];
    if (info.index[key]) sh.getRange(info.index[key], 1, 1, 6).setValues([row]);   // a number freed by deleting the latest invoice
    else sh.getRange(sh.getLastRow() + 1, 1, 1, 6).setValues([row]);
    try { const ls = logSheet(); ls.getRange(ls.getLastRow() + 1, 1, 1, 7).setValues([[now, who.user, who.role, "create", key, "", cap(json)]]); } catch (e) { console.error(e); }
    return { ok: true, rec: rec, ts: now };
  });
}

/* ---------- clean-up of old deleted rows and old log rows ---------- */
// Run installCleanupTrigger() ONCE from the Apps Script editor: after that Google runs cleanupSheets() every Sunday at 3 am India time.
// Run previewCleanup() first to see what would be removed (nothing is changed; read the result under "Execution log").
function previewCleanup() { const r = cleanupSheets(true); console.log(JSON.stringify(r)); return r; }
function installCleanupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "cleanupSheets") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("cleanupSheets").timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).inTimezone(TZ).create();
}
// Deletes the sheet rows in each contiguous run, bottom run first, so row numbers above stay valid and no data is rewritten.
function deleteRuns(sh, rowNums) {
  const runs = [];
  rowNums.forEach(function (r) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === r) last[1]++; else runs.push([r, 1]);
  });
  for (let i = runs.length - 1; i >= 0; i--) sh.deleteRows(runs[i][0], runs[i][1]);
}
function cleanupSheets(dry) {
  dry = dry === true;                                              // a time trigger passes an event object, which must not count as "dry"
  return withLock(function () {
    const now = Date.now(), out = { dataRows: 0, logRows: 0, dry: dry };
    const tombCut = now - TOMBSTONE_DAYS * 864e5, logCut = now - LOG_KEEP_DAYS * 864e5;

    const sh = sheet(), last = sh.getLastRow();
    if (last > 1) {
      const tail = sh.getRange(2, 5, last - 1, 2).getValues();       // updated, deleted
      const gone = [];
      for (let i = 0; i < tail.length; i++) if (isDel(tail[i][1]) && Number(tail[i][0]) < tombCut) gone.push(i + 2);
      out.dataRows = gone.length;
      if (gone.length && !dry) {
        // Record the clean-up time BEFORE removing anything, so a phone can never miss a deletion without being told to resync.
        props().setProperty("purged", String(Math.max(Number(props().getProperty("purged") || 0), tombCut)));
        deleteRuns(sh, gone);
      }
    }

    const ls = SpreadsheetApp.openById(SHEET_ID).getSheetByName(LOG_NAME), ll = ls ? ls.getLastRow() : 0;
    if (ll > 1) {
      const times = ls.getRange(2, 1, ll - 1, 1).getValues();
      let k = 0;
      while (k < times.length && Number(times[k][0]) < logCut) k++;  // the log is appended in time order, so old rows are at the top
      out.logRows = k;
      if (k && !dry) ls.deleteRows(2, k);
    }
    if (!dry) console.log("cleanup: " + JSON.stringify(out));
    return out;
  });
}

/* ---------- invoice email (owner only) ---------- */
function sendInvoice(b) {
  if (MailApp.getRemainingDailyQuota() < 1) return { ok: false, error: "Today's email limit is used up. Try again tomorrow or send the PDF yourself." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.to || ""))) return { ok: false, error: "Client email is missing or not valid." };
  const pdf = Utilities.newBlob(String(b.html || ""), "text/html", "invoice.html")
    .getAs("application/pdf").setName(String(b.subject || "Invoice") + ".pdf");
  MailApp.sendEmail(b.to, String(b.subject || "Invoice"), String(b.message || ""),
    { attachments: [pdf], name: String(b.name || ""), replyTo: Session.getEffectiveUser().getEmail() });
  return { ok: true };
}

/* ---------- daily email reminder for vehicle documents (owner) ---------- */
// Run installReminderTrigger() ONCE from the Apps Script editor (see ONLINE-SETUP.md).
// After that Google runs sendDocReminders() every morning, even when nobody has the app open.
const DOC_FIELDS = [["ins", "Insurance"], ["fc", "Fitness (FC)"], ["permit", "Permit"], ["tax", "Road tax"], ["puc", "Pollution (PUC)"]];

// Run this once from the editor to check the reminder email works (sends now if anything is due).
function testReminder() { sendDocReminders(); }

function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "sendDocReminders") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sendDocReminders").timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
}

function dueDocs(records, remDays, todayStr) {
  const t0 = new Date(todayStr + "T00:00:00Z").getTime(), out = [];
  records.forEach(function (m) {
    const veh = String(m.name || "").toUpperCase();
    const list = DOC_FIELDS.map(function (f) { return [f[1], m[f[0]]]; });
    if (m.othDate) list.push([m.othName || "Other document", m.othDate]);
    list.forEach(function (x) {
      if (!x[1]) return;
      const days = Math.round((new Date(x[1] + "T00:00:00Z").getTime() - t0) / 864e5);
      if (isNaN(days)) return;
      if (days <= remDays) out.push({ veh: veh, label: x[0], date: x[1], days: days });
    });
  });
  return out.sort(function (a, b) { return a.days - b.days; });
}

function sendDocReminders() {
  const recs = [];
  let remDays = 30;
  rows(sheet()).forEach(function (r) {
    if (r[5] === 1 || r[5] === "1" || r[5] === true) return;
    let d; try { d = JSON.parse(r[3]); } catch (e) { return; }
    if (r[1] === "entries" && d.kind === "vdoc") recs.push(d);
    if (r[1] === "settings" && d.remDays) remDays = Number(d.remDays) || 30;
  });
  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  const due = dueDocs(recs, remDays, today);
  if (!due.length) return;
  if (MailApp.getRemainingDailyQuota() < 1) return;
  const lines = due.map(function (x) {
    return x.veh + ": " + x.label + " - " + (x.days < 0 ? "EXPIRED " + (-x.days) + " day(s) ago" : x.days === 0 ? "expires TODAY" : x.days + " day(s) left") + " (" + x.date + ")";
  });
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "Vehicle documents due: " + due.length,
    "These vehicle documents are expired or due within " + remDays + " days:\n\n" + lines.join("\n") + "\n\nUpdate the new date in the Trip Ledger app after renewing.");
}

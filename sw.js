// Trip Ledger offline cache. The page is fetched from the network first, so a new
// index.html is picked up as soon as there is signal; the saved copy is used only
// when the network fails. Server (Google Apps Script) requests are never cached.
var CACHE = "trip-ledger-v6.4";   // keep in step with APP_VER in index.html
var NET_WAIT = 4000;               // on a weak signal, use the saved copy after 4 seconds instead of waiting
var FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-192.png", "./icon-maskable-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== self.location.origin && !fonts) return;       // leave the Google server link alone
  if (fonts) {                                                      // fonts: saved copy first, refreshed in the background
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (r) { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }
  e.respondWith(new Promise(function (resolve) {
    var done = false;
    function fallback() {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined);
      });
    }
    function finish(p) { if (done) return; done = true; resolve(p); }
    var timer = setTimeout(function () { fallback().then(function (hit) { if (hit) finish(hit); }); }, NET_WAIT);   // network keeps trying; if the saved copy exists it is shown now
    fetch(req).then(function (r) {
      clearTimeout(timer);
      if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      finish(r);
    }).catch(function () {
      clearTimeout(timer);
      fallback().then(function (hit) { finish(hit || Response.error()); });
    });
  }));
});

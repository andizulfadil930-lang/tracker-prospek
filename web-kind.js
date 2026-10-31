// Jenis web prospek untuk filter dashboard: dibaca dari kolom Website.
//
// Dipakai dashboard lewat window.webKind(website) dan window.webLabel(jenis). Filter "Jenis Web"
// di panel filter dipasang ke bundle React oleh tools/apply-live-sync.py (--web-filter).
//
// Jenis:
//   wa     kolom kosong / "-" / "no website": hanya bisa dihubungi lewat WA
//   ig     hanya Instagram
//   fb     hanya Facebook
//   gratis web gratisan atau halaman link (business.site, blogspot, linktr.ee, dst.)
//   mati   ada domain tapi sudah ditandai MATI / PINDAH (hasil tools/check-websites.py)
//   web    punya website sendiri
//
// Pola UMD-lite: window.webKind di browser, module.exports di Node.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.webKind = api.webKind;
    root.webLabel = api.webLabel;
    root.WEB_KINDS = api.WEB_KINDS;
  }
})(typeof self !== "undefined" ? self : this, function () {
  var WEB_KINDS = [
    ["web", "Ada Website"],
    ["gratis", "Web Gratisan"],
    ["mati", "Web Mati / Pindah"],
    ["wa", "Cuma WA"],
    ["ig", "Cuma Instagram"],
    ["fb", "Cuma Facebook"],
  ];

  var FREE = /gratisan|business\.site|blogspot|wordpress\.com|localo\.site|carrd\.co|linktr\.ee|lynk\.id|wixsite|weebly|google\.com\/sites|redirect|small web/;

  // Urutan penting: yang pertama cocok dipakai. Isi yang tidak dikenali dan tidak mirip domain
  // dianggap "wa" (belum ada web), sama seperti cold-reach.js.
  function webKind(website) {
    var w = (website == null ? "" : String(website)).trim().toLowerCase();
    var s = w.replace(/\s*-\s*(tidak valid|valid|cek).*$/, "").trim();
    if (s === "" || s === "-" || /no website|no (lp|website) proper/.test(w)) return "wa";
    if (/\b(mati|pindah)\b/.test(w)) return "mati";
    if (/instagram|\big\b|ig only/.test(s)) return "ig";
    if (/facebook|\bfb\b/.test(s)) return "fb";
    if (FREE.test(s)) return "gratis";
    if (/(^|[\s/])[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/.test(s)) return "web";
    return "wa";
  }

  function webLabel(kind) {
    for (var i = 0; i < WEB_KINDS.length; i++) if (WEB_KINDS[i][0] === kind) return WEB_KINDS[i][1];
    return kind;
  }

  return { webKind: webKind, webLabel: webLabel, WEB_KINDS: WEB_KINDS };
});

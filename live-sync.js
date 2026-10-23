// Sinkronisasi live Google Sheet -> dashboard.
//
// Alur: ambil CSV Sheet -> petakan kolom -> buang yang sudah ada (cek HP) ->
// kirim baris baru ke dashboard lewat event "prospek:sync". Listener-nya ada di
// bundle React di index.html (satu useEffect, ditandai "prospek:sync"); di sanalah
// baris baru masuk ke state dan otomatis tersimpan permanen oleh auto-save aplikasi.
//
// Yang disinkronkan hanya baris BARU. Baris yang sudah ada tidak ditimpa, jadi
// status follow-up/catatan yang diedit di dashboard tidak hilang. Baris yang
// dihapus dari Sheet tidak dihapus dari dashboard.
//
// Pola UMD-lite: window.ProspekLiveSync di browser, module.exports di Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ProspekLiveSync = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var CONFIG = {
    // Sheet harus dibagikan "Anyone with the link: Viewer" atau di-Publish to web,
    // kalau tidak Google membalas 401/halaman login dan sinkronisasi gagal.
    sheetCsvUrl:
      "https://docs.google.com/spreadsheets/d/11Gyj1wDkb5zquc3IRv32GOnZ7gJe6DZQzB296ky3tJM/gviz/tq?tqx=out:csv&sheet=Prospek",
    storageKey: "prospek-v5-97-data", // sama dengan `so` di bundle
    intervalMs: 5 * 60 * 1000,
  };

  // Urutan kolom bawaan aplikasi (export/import CSV di dashboard), dipakai kalau
  // header Sheet tidak dikenali.
  var APP_ORDER = ["nama", "cluster", "alamat", "phone", "website", "statusFollowup", "tanggalFollowup", "catatan", "nilaiPotensi", "prioritas"];

  var ALIASES = {
    nama: ["nama", "namausaha", "namabisnis", "name"],
    cluster: ["cluster", "jenisusaha", "kategori", "jenis"],
    alamat: ["alamat", "lokasi", "address"],
    phone: ["phone", "hp", "nohp", "nomorhp", "telepon", "telp", "whatsapp", "wa"],
    website: ["website", "web", "situs", "url"],
    statusFollowup: ["statusfollowup", "status"],
    tanggalFollowup: ["tanggalfollowup", "tanggal", "tgl"],
    catatan: ["catatan", "notes", "note", "keterangan"],
    nilaiPotensi: ["nilaipotensi", "nilai", "potensi"],
    prioritas: ["prioritas", "priority"],
  };

  // RFC 4180: kutip ganda, "" sebagai kutip literal, koma/baris baru di dalam kutip.
  function parseCsv(text) {
    var rows = [], row = [], cell = "", inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQuotes = false;
        } else cell += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
  }

  // HARUS sama dengan fungsi `k` di listener "prospek:sync" pada index.html.
  function phoneKey(p) {
    var d = String(p == null ? "" : p).replace(/\D/g, "");
    if (d.indexOf("62") === 0) return "0" + d.slice(2);
    if (d.indexOf("8") === 0) return "0" + d;
    return d;
  }

  function normHeader(h) {
    return String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // -> { field: indeks kolom }. Tanpa header "nama" dikenali, pakai urutan bawaan.
  function mapColumns(headerRow) {
    var byHeader = {};
    headerRow.forEach(function (h, i) {
      var n = normHeader(h);
      Object.keys(ALIASES).forEach(function (field) {
        if (byHeader[field] === undefined && ALIASES[field].indexOf(n) !== -1) byHeader[field] = i;
      });
    });
    if (byHeader.nama !== undefined) return byHeader;
    var positional = {};
    APP_ORDER.forEach(function (field, i) { positional[field] = i; });
    return positional;
  }

  // Baris Sheet -> objek prospek bentuk aplikasi. Baris tanpa nama atau tanpa HP
  // valid dilewati (anti-double aplikasi berbasis HP).
  function toProspects(table, today) {
    if (table.length < 2) return { rows: [], skipped: 0 };
    var cols = mapColumns(table[0]);
    var rows = [], skipped = 0;
    table.slice(1).forEach(function (r) {
      function get(field) {
        var i = cols[field];
        return i === undefined || r[i] === undefined ? "" : r[i].trim();
      }
      var nama = get("nama"), phone = get("phone"), key = phoneKey(phone);
      if (!nama || key.length < 8) { skipped++; return; }
      var status = get("statusFollowup") || "Belum Hubungi";
      rows.push({
        id: "sheet-" + key,
        nama: nama,
        cluster: get("cluster") || "Kontraktor",
        alamat: get("alamat") || "Bekasi",
        phone: phone,
        website: get("website"),
        statusAktif: status !== "Gagal",
        statusFollowup: status,
        tanggalFollowup: get("tanggalFollowup") || today,
        catatan: get("catatan"),
        nilaiPotensi: Number(get("nilaiPotensi").replace(/[^0-9]/g, "")) || 5000000,
        prioritas: get("prioritas") || "Medium",
      });
    });
    return { rows: rows, skipped: skipped };
  }

  // Sisakan baris yang HP-nya belum ada di `existing` dan tidak dobel di dalam Sheet.
  function pickNew(rows, existing) {
    var seen = {};
    existing.forEach(function (p) { seen[phoneKey(p.phone)] = true; });
    return rows.filter(function (r) {
      var k = phoneKey(r.phone);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  var api = {
    CONFIG: CONFIG,
    parseCsv: parseCsv,
    phoneKey: phoneKey,
    mapColumns: mapColumns,
    toProspects: toProspects,
    pickNew: pickNew,
  };

  // ---- bagian browser ------------------------------------------------------
  if (typeof window === "undefined" || typeof document === "undefined") return api;

  var toastEl = null, toastTimer = null, lastError = null;

  function toast(text, kind) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.setAttribute("role", "status");
      toastEl.style.cssText = "position:fixed;bottom:10px;right:10px;color:#fff;padding:6px 12px;border-radius:20px;font-size:12px;z-index:9999;max-width:80vw";
      document.body.appendChild(toastEl);
    }
    toastEl.style.background = kind === "error" ? "#d97706" : "#22c55e";
    toastEl.textContent = text;
    toastEl.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.display = "none"; }, kind === "error" ? 8000 : 5000);
  }

  function existingProspects() {
    try {
      var arr = JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function whenAppReady() {
    if (window.__prospekReady) return Promise.resolve();
    return new Promise(function (resolve) {
      window.addEventListener("prospek:ready", function () { resolve(); }, { once: true });
    });
  }

  function fetchSheet() {
    return fetch(CONFIG.sheetCsvUrl, { cache: "no-store" }).then(function (res) {
      var type = res.headers.get("content-type") || "";
      if (!res.ok || type.indexOf("text/html") !== -1)
        throw new Error("Sheet belum publik (HTTP " + res.status + ")");
      return res.text();
    });
  }

  function sync() {
    return Promise.all([fetchSheet(), whenAppReady()])
      .then(function (out) {
        var parsed = toProspects(parseCsv(out[0]), new Date().toISOString().slice(0, 10));
        var fresh = pickNew(parsed.rows, existingProspects());
        if (fresh.length)
          window.dispatchEvent(new CustomEvent("prospek:sync", { detail: { rows: fresh } }));
        lastError = null;
        toast(
          fresh.length
            ? "✓ Sheet: +" + fresh.length + " prospek baru"
            : "✓ Sheet tersinkron, tidak ada prospek baru (" + parsed.rows.length + " baris)"
        );
        return { added: fresh.length, total: parsed.rows.length, skipped: parsed.skipped };
      })
      .catch(function (e) {
        console.warn("Gagal sinkron Sheet, pakai data yang sudah ada:", e);
        // Satu toast per jenis error, supaya tidak muncul tiap 5 menit.
        if (lastError !== e.message) toast("Gagal sinkron Sheet: " + e.message, "error");
        lastError = e.message;
        return { error: e.message };
      });
  }

  api.sync = sync;
  window.syncProspekNow = sync;
  sync();
  setInterval(sync, CONFIG.intervalMs);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") sync();
  });
  return api;
});

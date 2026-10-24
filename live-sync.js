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
    // Cadangan saja: kunci sebenarnya dibaca dari window.__prospekStorageKey, yang
    // diisi listener di bundle (jadi tidak perlu diedit saat build dashboard berganti).
    storageKey: "prospek-v6-97-verified-data",
    intervalMs: 5 * 60 * 1000,
  };

  // Dua urutan kolom yang dipakai kalau baris pertama Sheet bukan header (header
  // terhapus, atau data ditempel tanpa header): urutan Sheet "Prospek" dari hunter,
  // dan urutan export/import CSV di dashboard.
  var SHEET_ORDER = ["no", "nama", "cluster", "alamat", "phone", "website", "jam", "statusAktif", "prioritas", "statusFollowup", "tanggalFollowup", "catatan", "nilaiPotensi", "angle"];
  var APP_ORDER = ["nama", "cluster", "alamat", "phone", "website", "statusFollowup", "tanggalFollowup", "catatan", "nilaiPotensi", "prioritas"];
  var STATUSES = ["Belum Hubungi", "Sudah WA", "Follow-up 1", "Follow-up 2", "Meeting", "Closing", "Gagal"];
  var UNITS = { jt: 1e6, juta: 1e6, rb: 1e3, ribu: 1e3, k: 1e3, miliar: 1e9, milyar: 1e9 };

  var ALIASES = {
    nama: ["nama", "namausaha", "namabisnis", "name"],
    cluster: ["cluster", "jenisusaha", "kategori", "jenis"],
    alamat: ["alamat", "alamatlengkap", "lokasi", "address"],
    phone: ["phone", "hp", "hpwa", "nohp", "nohpwa", "nomorhp", "telepon", "telp", "whatsapp", "wa"],
    website: ["website", "web", "situs", "url"],
    statusFollowup: ["statusfollowup", "status"],
    tanggalFollowup: ["tanggalfollowup", "tglfollowup", "tanggal", "tgl"],
    catatan: ["catatan", "notes", "note", "keterangan"],
    nilaiPotensi: ["nilaipotensi", "potensinilai", "nilai", "potensi"],
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

  // -> { field: indeks kolom } berdasarkan nama header; field yang tidak dikenali
  // tidak ada di hasil.
  function mapColumns(headerRow) {
    var byHeader = {};
    headerRow.forEach(function (h, i) {
      var n = normHeader(h);
      Object.keys(ALIASES).forEach(function (field) {
        if (byHeader[field] === undefined && ALIASES[field].indexOf(n) !== -1) byHeader[field] = i;
      });
    });
    return byHeader;
  }

  function orderToCols(order) {
    var cols = {};
    order.forEach(function (field, i) { cols[field] = i; });
    return cols;
  }

  // Isi sel (tanpa spasi pinggir); strip "-" dianggap kosong.
  function cell(r, cols, field) {
    var i = cols[field];
    if (i === undefined || r[i] === undefined) return "";
    var v = r[i].trim();
    return /^[-–—]$/.test(v) ? "" : v;
  }

  function rowValid(r, cols) {
    return cell(r, cols, "nama") !== "" && phoneKey(cell(r, cols, "phone")).length >= 8;
  }

  // Baris pertama dianggap header kalau ada kolom "Nama". Kalau tidak, semua baris
  // dianggap data, dan urutan kolom dipilih (Sheet atau dashboard) yang paling banyak
  // menghasilkan baris valid di 10 baris pertama.
  function detectLayout(table) {
    var byHeader = mapColumns(table[0]);
    if (byHeader.nama !== undefined) return { cols: byHeader, start: 1, kind: "header", ok: 0 };
    var best = null;
    [["sheet", SHEET_ORDER], ["app", APP_ORDER]].forEach(function (c) {
      var cols = orderToCols(c[1]);
      var ok = table.slice(0, 10).filter(function (r) { return rowValid(r, cols); }).length;
      if (!best || ok > best.ok) best = { cols: cols, start: 0, kind: c[0], ok: ok };
    });
    return best;
  }

  // Nilai bentuk aplikasi: status dan prioritas dibandingkan persis oleh dashboard,
  // tanggal harus YYYY-MM-DD (input type=date).
  function normStatus(v) {
    var n = normHeader(v);
    for (var i = 0; i < STATUSES.length; i++) if (normHeader(STATUSES[i]) === n) return STATUSES[i];
    return "Belum Hubungi";
  }

  function normPrioritas(v) {
    var n = normHeader(v);
    if (n === "high" || n === "tinggi") return "High";
    if (n === "low" || n === "rendah") return "Low";
    return "Medium";
  }

  function normTanggal(v, today) {
    var m;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    if ((m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)))
      return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    return today;
  }

  // "Rp 1.5jt" -> 1500000, "Rp 2,5 juta" -> 2500000, "Rp 12.500.000" -> 12500000.
  function parseNilai(v) {
    var t = String(v).toLowerCase().replace(/rp\.?/g, "").trim();
    var m = t.match(/(\d[\d.,]*)\s*(jt|juta|rb|ribu|k|miliar|milyar)\b/);
    if (m) {
      var num = /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? m[1].replace(/\./g, "") : m[1].replace(",", ".");
      var n = parseFloat(num);
      if (!isNaN(n)) return Math.round(n * UNITS[m[2]]);
    }
    return Number(t.replace(/[^0-9]/g, "")) || 5000000;
  }

  // Baris Sheet -> objek prospek bentuk aplikasi. Baris tanpa nama atau tanpa HP
  // valid dilewati (anti-double aplikasi berbasis HP). `missing` berisi kolom wajib
  // (nama, phone) yang tidak terbaca; kalau tidak kosong, tidak ada baris yang diproses.
  // `kind`: "header", "sheet" atau "app" (cara kolom dibaca, lihat detectLayout).
  function toProspects(table, today) {
    if (!table.length) return { rows: [], skipped: 0, missing: [], kind: "kosong" };
    var layout = detectLayout(table), cols = layout.cols, kind = layout.kind;
    var missing = ["nama", "phone"].filter(function (f) { return cols[f] === undefined; });
    if (missing.length) return { rows: [], skipped: 0, missing: missing, kind: kind };
    if (kind !== "header" && layout.ok === 0)
      return { rows: [], skipped: table.length, missing: ["phone"], kind: kind };
    var rows = [], skipped = 0;
    table.slice(layout.start).forEach(function (r) {
      function get(field) { return cell(r, cols, field); }
      var nama = get("nama"), phone = get("phone"), key = phoneKey(phone);
      if (!nama || key.length < 8) { skipped++; return; }
      var status = normStatus(get("statusFollowup"));
      rows.push({
        id: "sheet-" + key,
        nama: nama,
        cluster: get("cluster") || "Kontraktor",
        alamat: get("alamat") || "Bekasi",
        phone: phone,
        website: get("website"),
        statusAktif: status !== "Gagal",
        statusFollowup: status,
        tanggalFollowup: normTanggal(get("tanggalFollowup"), today),
        catatan: get("catatan"),
        nilaiPotensi: parseNilai(get("nilaiPotensi")),
        prioritas: normPrioritas(get("prioritas")),
      });
    });
    return { rows: rows, skipped: skipped, missing: [], kind: kind };
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
    detectLayout: detectLayout,
    parseNilai: parseNilai,
    normPrioritas: normPrioritas,
    normStatus: normStatus,
    normTanggal: normTanggal,
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
      var arr = JSON.parse(localStorage.getItem(window.__prospekStorageKey || CONFIG.storageKey) || "[]");
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
        var table = parseCsv(out[0]);
        var parsed = toProspects(table, new Date().toISOString().slice(0, 10));
        if (parsed.missing.length)
          throw new Error(
            parsed.kind === "header"
              ? "kolom " + parsed.missing.join("/") + " tidak ditemukan di header Sheet (" + table[0].join(", ") + ")"
              : "tidak ada kolom HP yang terbaca di 10 baris pertama Sheet (" + table.length + " baris)"
          );
        if (!parsed.rows.length && parsed.skipped)
          throw new Error("0 dari " + parsed.skipped + " baris Sheet terbaca (nama atau HP kosong/tidak valid)");
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

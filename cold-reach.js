// Pesan cold reach WhatsApp: pendek, bahasa chat biasa, disesuaikan dengan prospeknya.
//
// Dipakai dashboard lewat window.coldReachMessage(prospek). Dua fungsi template lama di
// bundle React di index.html (pesan umum dan pesan grand opening) diganti satu baris
// yang memanggil fungsi ini; tools/apply-live-sync.py memasangnya lagi saat build
// diganti. Jadi teks pesan cukup diedit di sini.
//
// Pesan dirakit dari tiga bagian: pembuka (sapaan + yang terlihat dari usahanya),
// manfaat (menurut jenis usaha), dan penutup berisi link video motion penjelasnya
// (promo/index.html). Link wa.me tidak bisa membawa berkas, jadi videonya dikirim sebagai
// link; WhatsApp menampilkannya sebagai kartu pratinjau yang bisa diketuk untuk memutar.
//
// Pola UMD-lite: window.coldReachMessage di browser, module.exports di Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.coldReachMessage = factory().coldReachMessage;
})(typeof self !== "undefined" ? self : this, function () {
  // Urutan penting: yang pertama cocok dipakai. Dicocokkan ke kolom cluster.
  var SEGMENTS = [
    ["urgent", /sedot wc|darurat|ledeng|kunci|bocor/],
    ["shop", /barber|cafe|coffee|kopi|gelato|laundry/],
    ["trust", /pest|fogging|rayap|tungau|klinik|hewan/],
    ["service", /service|servis|\bac\b|kulkas|mesin cuci|cctv|teknik/],
    ["proof", /cuci|cleaning|kuras|toren|poles|bangunan|kontraktor|\blas\b|kitchen|taman|plafon|renovasi|pindahan|puing/],
  ];

  // {di} diganti " di <kota>" kalau kota ketahuan dari alamat, kosong kalau tidak.
  var BENEFIT = {
    urgent: "Orang{di} yang cari jasa begini biasanya butuh cepat, jadi saya bikinkan landing page 1 halaman dengan tombol WA sekali tap.",
    service: "Saya bikinkan landing page 1 halaman: layanan, area jangkauan, dan tombol WA, biar calon customer{di} gampang memanggil.",
    proof: "Saya bikinkan landing page 1 halaman berisi foto before-after, harga jelas, dan tombol WA, biar calon customer{di} cepat yakin.",
    trust: "Orang{di} biasanya cari yang terpercaya dulu, jadi saya bikinkan landing page 1 halaman berisi layanan, testimoni, dan tombol WA.",
    shop: 'Biar yang cari "{noun} terdekat" langsung ketemu, saya bikinkan landing page 1 halaman: lokasi, jam buka, promo, dan tombol WA.',
    opening: 'Biar yang cari "{noun} terdekat" langsung ketemu sejak awal, saya bikinkan landing page 1 halaman berisi promo opening dan tombol booking WA.',
    fallback: "Saya bikinkan landing page 1 halaman yang fokus ke satu hal: calon customer langsung chat WA.",
    // Sudah punya website sendiri: yang ditawarkan bukan pengganti, tapi halaman khusus.
    own: "Saya biasa bantu bikin landing page 1 halaman khusus iklan/Google Maps, fokusnya satu: calon customer langsung chat WA.",
  };

  var PENGIRIM = "Andi dari Ritiros Studio";

  var SITE_OPENER = {
    none: "Kebetulan nemu {nama} di Google, tapi belum ada websitenya.",
    ig: "Kebetulan lihat {nama} di Instagram, tapi belum ada websitenya di Google.",
    free: "Kebetulan nemu {nama} di Google, tapi websitenya masih versi gratisan.",
    own: "Kebetulan lihat {nama} sudah punya website.",
  };

  var OPENING_OPENER = {
    open: "Kebetulan lihat {nama} baru buka, selamat ya!",
    soon: "Kebetulan lihat {nama} sebentar lagi buka, semoga lancar ya!",
  };

  var GREETINGS = ["Selamat {waktu} Kak, saya {pengirim}.", "Halo Kak, selamat {waktu}. Saya {pengirim}."];

  var VIDEO_URL = "https://andizulfadil930-lang.github.io/tracker-prospek/promo/";

  var CLOSINGS = [
    "Videonya cuma 20 detik, cek di sini ya: {video}\nKalau tertarik, contohnya saya buatkan gratis \uD83D\uDE4F",
    "Penjelasannya di video 20 detik ini: {video}\nKalau cocok, saya buatkan contoh gratis buat usaha Kakak? \uD83D\uDE4F",
  ];

  // Kota dari alamat; alamat di data campur aduk ("Jaksel", "Kebon Jeruk Jakbar", "Bekasi - Pekayon").
  var AREAS = [
    [/jaksel|jakarta selatan/i, "Jakarta Selatan"],
    [/jakbar|jakarta barat/i, "Jakarta Barat"],
    [/jakpus|jakarta pusat/i, "Jakarta Pusat"],
    [/jaktim|jakarta timur/i, "Jakarta Timur"],
    [/jakut|jakarta utara/i, "Jakarta Utara"],
    [/tangsel|serpong|pamulang|pondok aren/i, "Tangerang Selatan"],
    [/tangerang|balaraja|cibodas|periuk/i, "Tangerang"],
    [/depok/i, "Depok"],
    [/bogor|cibinong|dramaga/i, "Bogor"],
    [/bekasi|cikarang/i, "Bekasi"],
  ];

  function text(v) {
    return v == null ? "" : String(v).trim();
  }

  // Penyebut yang sama untuk satu prospek, supaya pratinjau, salinan, dan link WA identik.
  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function pick(list, p, salt) {
    return list[hash(text(p.id) + text(p.nama) + salt) % list.length];
  }

  function waktu(now) {
    var h = (now || new Date()).getHours();
    return h < 11 ? "pagi" : h < 15 ? "siang" : h < 18 ? "sore" : "malam";
  }

  // Nama di Sheet sering diawali "Jasa ..." (kata kunci, bukan nama usaha).
  function namaUsaha(nama) {
    return text(nama).replace(/^jasa\s+/i, "");
  }

  function kota(alamat) {
    var a = text(alamat);
    for (var i = 0; i < AREAS.length; i++) if (AREAS[i][0].test(a)) return AREAS[i][1];
    return "";
  }

  function segmen(cluster) {
    var c = text(cluster).toLowerCase();
    for (var i = 0; i < SEGMENTS.length; i++) if (SEGMENTS[i][1].test(c)) return SEGMENTS[i][0];
    return "fallback";
  }

  // Usaha baru buka / segera buka, dilihat dari catatan (bukan dari nomor urut baris).
  function statusBuka(catatan) {
    var c = text(catatan).toLowerCase();
    if (c.indexOf("coming soon") >= 0) return "soon";
    if (c.indexOf("grand opening") >= 0 || c.indexOf("baru buka") >= 0) return "open";
    return "";
  }

  // none = belum ada web, ig = hanya Instagram, free = web gratisan, own = web sendiri.
  // Isi yang tidak dikenali dan tidak mirip domain dianggap "none": lebih aman salah
  // menawarkan website ke yang sudah punya daripada bilang "sudah punya" ke yang belum.
  function statusWeb(website) {
    var w = text(website).toLowerCase();
    if (w === "" || w === "-") return "none";
    if (/gratisan|\bfree\b|business\.site|blogspot|redirect|small web|no (lp|website) proper/.test(w)) return "free";
    if (w.indexOf("ig only") >= 0) return "ig";
    if (/\.[a-z]{2,}/.test(w)) return "own";
    return "none";
  }

  function coldReachMessage(p, now) {
    var nama = namaUsaha(p.nama) || "usaha Kakak";
    var di = kota(p.alamat) ? " di " + kota(p.alamat) : "";
    var noun = text(p.cluster).toLowerCase().replace(/\b(ac|wc|cctv)\b/g, function (m) { return m.toUpperCase(); });
    var buka = statusBuka(p.catatan);
    var web = statusWeb(p.website);

    var kalimat = buka ? OPENING_OPENER[buka] : SITE_OPENER[web];
    var manfaat = buka ? BENEFIT.opening : web === "own" ? BENEFIT.own : BENEFIT[segmen(p.cluster)];

    return [
      pick(GREETINGS, p, "sapa").replace("{waktu}", waktu(now)).replace("{pengirim}", PENGIRIM) + " " + kalimat.replace("{nama}", function () { return nama; }),
      manfaat.replace("{di}", di).replace("{noun}", function () { return noun; }),
      pick(CLOSINGS, p, "tutup").replace("{video}", VIDEO_URL),
    ].join("\n\n");
  }

  return { coldReachMessage: coldReachMessage, statusWeb: statusWeb, statusBuka: statusBuka, segmen: segmen, kota: kota };
});

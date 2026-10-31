# Tracker Prospek Jasa - andizulfadil930-lang

Dashboard 97+ prospek Jabodetabek, auto-update dari Google Sheet.

## Live Dashboard (setelah deploy)
https://andizulfadil930-lang.github.io/tracker-prospek/

## Repo
https://github.com/andizulfadil930-lang/tracker-prospek

## Auto-Update
`live-sync.js` mengambil CSV dari tab "Prospek" di Google Sheet saat halaman dibuka, tiap 5 menit, dan setiap kali tab kembali aktif:
https://docs.google.com/spreadsheets/d/11Gyj1wDkb5zquc3IRv32GOnZ7gJe6DZQzB296ky3tJM/gviz/tq?tqx=out:csv&sheet=Prospek

- Hunter harian jam 7 pagi WIB nambah 50 prospek ke Sheet -> dashboard otomatis menambahkannya tanpa push ulang. Muncul toast hijau "+N prospek baru", dan barisnya tersimpan permanen lewat auto-save dashboard.
- **Hanya baris baru yang ditambahkan.** Dobel dicek lewat nomor HP (format `0812…`, `+62 812…`, `62812…` dianggap sama). Baris tanpa nama atau tanpa HP valid dilewati.
- Baris yang sudah ada **tidak ditimpa**, jadi status follow-up dan catatan yang diedit di dashboard aman. Baris yang dihapus dari Sheet juga tidak dihapus dari dashboard.
- Kolom dipetakan lewat nama header. Header Sheet saat ini (`No, Nama Usaha, Cluster, Alamat Lengkap, HP / WA, Website, Jam Operasional, Status Aktif, Prioritas, Status Follow-up, Tgl Follow-up, Catatan, Potensi Nilai, Angle Landing Page`) terbaca semua, kecuali `No`, `Jam Operasional`, `Status Aktif`, dan `Angle Landing Page` yang diabaikan. Nama alternatif yang dikenali ada di `ALIASES` dalam `live-sync.js`.
- **Sheet tanpa header** (baris pertama langsung data, mis. header terhapus atau data ditempel ulang) tetap terbaca: kalau tidak ada kolom `Nama`, semua baris dianggap data dan urutan kolomnya dipilih dari isi 10 baris pertama, antara urutan Sheet di atas (`No, Nama Usaha, Cluster, …`) dan urutan dashboard (sama dengan Export CSV).
- Nilai dinormalkan ke bentuk dashboard: prioritas `HIGH`/`MEDIUM`/`LOW` menjadi `High`/`Medium`/`Low`, nilai `Rp 1.5jt`/`2,5 juta`/`500rb` menjadi angka rupiah, tanggal `dd/mm/yyyy` menjadi `yyyy-mm-dd`, status dicocokkan tanpa peduli huruf besar-kecil, dan sel yang hanya berisi `-` dianggap kosong.
- Kalau Sheet tidak bisa dibaca (kolom Nama/HP tidak ketemu, atau semua baris tidak valid), muncul toast oranye yang menyebut sebabnya dan tidak ada baris yang ditambahkan. Toast hijau "tidak ada prospek baru" hanya muncul kalau Sheet memang terbaca.
- Baris dengan nomor HP yang sama dengan baris lain (di dashboard atau di dalam Sheet) dilewati; hanya yang pertama masuk.
- Sheet belum publik -> toast oranye "Gagal sinkron Sheet: Sheet belum publik (HTTP 401)" dan data yang ada tetap dipakai.
- Paksa sinkron dari console browser: `syncProspekNow()`.
- Cara kerja: `live-sync.js` mengirim baris baru lewat event `prospek:sync`. Listener-nya adalah satu `useEffect` yang disisipkan ke bundle React di `index.html` (cari `prospek:sync`). Kalau `index.html` diganti dengan build dashboard baru, pasang ulang dengan `python3 tools/apply-live-sync.py <build-baru.html> index.html`. Skrip itu mencari nama variabel di bundle lewat pola dan berhenti dengan pesan jelas kalau polanya tidak ketemu. Skrip itu juga mengembalikan pesan cold reach (lihat "Pesan cold reach" di bawah) dan memberi peringatan kalau template pesan bawaan build tidak ditemukan. Skrip juga memasang `overrides.css` (penyesuaian tampilan di atas build, saat ini: panel filter tidak lagi menempel di atas layar dan menutupi daftar).

## Pesan cold reach
Pratinjau "WA Script Generator", tombol Copy Script, dan link Buka WA memakai pesan dari `cold-reach.js` (`window.coldReachMessage`), bukan template bawaan bundle. Pesannya pendek (sekitar 300 karakter), dirakit dari data prospek, dan menyebut video motion yang kamu lampirkan sendiri saat kirim (link `wa.me` tidak bisa membawa berkas).
- **Pembuka** mengikuti kondisi web: belum ada web, hanya Instagram, web gratisan (`business.site`, `blogspot`, dst.), atau sudah punya web sendiri (yang ini ditawari landing page khusus iklan/Maps, bukan website baru). Usaha yang baru buka atau segera buka (catatan berisi `grand opening`, `baru buka`, `coming soon`) dibuka dengan ucapan selamat. Isi kolom website yang tidak dikenali dan tidak mirip domain dianggap belum ada web.
- **Manfaat** mengikuti `Cluster`: darurat (sedot WC, ledeng, kunci, bocor), service (AC, kulkas, CCTV), hasil kerja (cuci sofa, tukang, kontraktor, taman, dst.), kepercayaan (pest, fogging, klinik hewan), toko/kafe (barber, cafe, laundry). Cluster lain dapat kalimat umum. Kota diambil dari alamat kalau terbaca.
- Sapaan memperkenalkan pengirim (`PENGIRIM`, sekarang Andi dari Ritiros Studio) dan mengikuti jam di browser (pagi/siang/sore/malam). Sapaan dan penutup punya dua variasi yang dipilih tetap per prospek, jadi pratinjau, salinan, dan link WA selalu sama.
- Ubah kalimat dengan mengedit konstanta di `cold-reach.js` (`BENEFIT`, `SITE_OPENER`, `OPENING_OPENER`, `GREETINGS`, `CLOSINGS`, `PENGIRIM`); `index.html` tidak perlu disentuh.
- Status "baru buka" dibaca dari catatan, bukan dari nomor baris, jadi prospek 95-97 (taman, plafon, fogging) tidak lagi dapat ucapan grand opening. Filter "Grand Opening (83-97)" di dashboard masih menghitung nomor 83-97.

## Filter Jenis Web
Di panel filter ada pilihan **Semua Jenis Web** (di samping Prioritas): Ada Website, Web Gratisan, Web Mati / Pindah, Cuma WA, Cuma Instagram, Cuma Facebook, masing-masing dengan jumlahnya. Bisa digabung dengan filter lain (status, prioritas, cluster, pencarian), tampil sebagai chip, dan ikut dihapus oleh Clear Filters. Jenis dibaca dari kolom Website lewat `web-kind.js` (`-` atau kosong = Cuma WA). Kalau `index.html` diganti build baru, `apply-live-sync.py` memasangnya lagi; untuk memasang filter saja: `python3 tools/apply-live-sync.py --web-filter index.html index.html`.

## Filter Jenis Usaha (dropdown)
Daftar 100+ jenis usaha tidak lagi tampil sebagai deretan chip. Tombol **Pilih Jenis Usaha** membuka daftar centang yang bisa digulir; saat tertutup hanya jenis yang dipilih yang tampil. Dipasang ulang oleh `apply-live-sync.py` (juga lewat `--web-filter`).

## Cek kolom Website
`python3 tools/check-websites.py` membaca Sheet dan menulis laporan `hasil-cek-web.csv`: tiap baris ditandai ADA, MATI, PINDAH (dialihkan ke domain lain), GRATISAN, IG/FB, atau BELUM ADA. Sheet dan dashboard tidak diubah. Kalau hasilnya MATI atau PINDAH dan kamu tulis kata itu di kolom Website (mis. `novis.co.id MATI`), pesan cold reach memakai pembuka "websitenya sepertinya lagi tidak bisa dibuka". Dengan `SERPER_API_KEY` dan opsi `--cari`, baris yang kosong dicari di Google dan ditandai KANDIDAT kalau ada situs yang cocok nama usahanya dan memuat nama atau nomor HP-nya.

## Mengganti versi dashboard
- Dashboard menyimpan data di `localStorage` browser dengan kunci yang berganti tiap versi (sekarang `prospek-v6-97-verified-data`). Saat dibuka, versi baru memakai data versi lama di browser itu kalau ada (edit lokal ikut terbawa), jadi **data bawaan versi baru hanya terlihat di browser yang belum pernah membuka dashboard**.
- Untuk memakai data bawaan versi baru di browser lama: tombol "Reset ke ... Awal" di dashboard (edit lokal hilang, baris dari Sheet masuk lagi otomatis saat sinkron berikutnya).
- Backup harian via GitHub Actions **belum ada** (tidak ada `.github/workflows/` di repo ini).

## Cara Deploy (sudah dikonfigurasi untuk username kamu)
1. Buat repo baru: https://github.com/new -> Nama: tracker-prospek -> Public -> Create (jangan centang README)
2. Extract ZIP ini, buka terminal di foldernya, jalankan:

```
git init
git add .
git commit -m "initial: 97 prospek + auto-fetch"
git branch -M main
git remote add origin https://github.com/andizulfadil930-lang/tracker-prospek.git
git push -u origin main
```

3. Aktifkan Pages: https://github.com/andizulfadil930-lang/tracker-prospek/settings/pages
   - Source: Deploy from a branch
   - Branch: main / (root) -> Save
4. Tunggu 1-2 menit, buka: https://andizulfadil930-lang.github.io/tracker-prospek/

## Buka akses Sheet (wajib sekali)
Tanpa ini Google membalas 401 dan auto-update tidak jalan (dicek 2026-10-23: Sheet masih privat).
1. Buka https://docs.google.com/spreadsheets/d/11Gyj1wDkb5zquc3IRv32GOnZ7gJe6DZQzB296ky3tJM/edit
2. Share > General access > **Anyone with the link: Viewer**
3. Pastikan nama tabnya persis `Prospek`
4. Kalau lebih suka link "Publish to web" (File > Share > Publish to web > sheet "Prospek" > CSV), tempel linknya ke `sheetCsvUrl` di `live-sync.js`

Catatan: repo dan Sheet yang publik berarti nama dan nomor HP prospek bisa dilihat siapa saja.

Done!

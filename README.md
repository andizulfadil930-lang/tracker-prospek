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
- Kolom dipetakan lewat nama header (`Nama Usaha`/`Nama`, `Cluster`, `Alamat`, `Phone`/`HP`, `Website`, `Status Followup`/`Status`, `Tanggal Followup`, `Catatan`, `Nilai Potensi`, `Prioritas`). Kalau header tidak dikenali, dipakai urutan kolom bawaan dashboard (sama dengan Export CSV).
- Sheet belum publik -> toast oranye "Gagal sinkron Sheet: Sheet belum publik (HTTP 401)" dan data yang ada tetap dipakai.
- Paksa sinkron dari console browser: `syncProspekNow()`.
- Cara kerja: `live-sync.js` mengirim baris baru lewat event `prospek:sync`. Listener-nya adalah satu `useEffect` yang disisipkan ke bundle React di `index.html` (cari `prospek:sync`). Kalau `index.html` dibangun ulang dari sumbernya, sisipan itu harus dipasang lagi.
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

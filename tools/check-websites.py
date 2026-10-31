#!/usr/bin/env python3
"""Cek kolom Website prospek: apakah situsnya benar-benar ada, dan (opsional) apakah usaha
yang tertulis "belum punya web" sebenarnya sudah punya.

    python3 tools/check-websites.py                      # baca Sheet langsung
    python3 tools/check-websites.py prospek.csv -o hasil.csv
    SERPER_API_KEY=... python3 tools/check-websites.py --cari   # cari web untuk yang "-"

Hanya MEMBACA. Hasilnya berupa berkas CSV laporan, Sheet dan dashboard tidak diubah, jadi
keputusan akhir (mis. ganti pesan cold reach) tetap di tangan kamu.

Tiap baris dapat satu hasil:
  ADA         situs di kolom Website terbuka dan isinya bukan halaman parkir
  PINDAH      situs dialihkan ke domain lain (sering tanda domain sudah dijual/diambil)
  MATI        situs di kolom Website tidak terbuka / domain tidak ada / halaman parkir
  GRATISAN    web gratisan (business.site, blogspot, dst.), tidak dicek ulang
  IG/FB       hanya media sosial
  KANDIDAT    (--cari) hasil pencarian yang mirip usahanya dan memuat nama atau nomor HP-nya
  BELUM ADA   kolom kosong/"-" dan (kalau --cari) tidak ada kandidat yang meyakinkan

Kandidat hanya dicatat kalau cocok nama usaha DAN halamannya memuat nama atau nomor HP:
salah bilang "sudah punya web" lebih buruk daripada tidak bilang apa-apa.
Hanya pustaka standar Python.
"""
import argparse
import csv
import io
import ipaddress
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request

SHEET = ("https://docs.google.com/spreadsheets/d/11Gyj1wDkb5zquc3IRv32GOnZ7gJe6DZQzB296ky3tJM"
         "/gviz/tq?tqx=out:csv&sheet=Prospek")
UA = {"User-Agent": "Mozilla/5.0 (compatible; tracker-prospek-check/1.0)"}
TIMEOUT = 10

# Urutan kolom Sheet: No, Nama Usaha, Cluster, Alamat, HP/WA, Website, ...
COL = {"id": 0, "nama": 1, "cluster": 2, "alamat": 3, "hp": 4, "website": 5}

FREE = re.compile(r"gratisan|business\.site|blogspot|wordpress\.com|localo\.site|carrd\.co|"
                  r"linktr\.ee|wixsite|weebly|google\.com/sites|redirect|small web", re.I)
SOCIAL = re.compile(r"instagram|\big\b|facebook|\bfb\b|tiktok", re.I)
PARKED = re.compile(r"domain (is )?(for sale|parked)|this domain|buy this domain|"
                    r"dijual|domain.{0,20}expired|account suspended|default web site page", re.I)
# Direktori/agregator: hasilnya bukan situs milik usaha itu sendiri.
DIRECTORY = re.compile(r"google\.|facebook\.|instagram\.|tiktok\.|youtube\.|tokopedia|shopee|"
                       r"yelp|tripadvisor|yellowpages|wikipedia|olx\.|kaskus|linkedin|"
                       r"jalantikus|sulekha|waze|foursquare|bukalapak|blibli|traveloka|"
                       r"pinterest|twitter|x\.com|whatsapp|wa\.me|linktr\.ee|business\.site", re.I)


def public_host(host):
    """Tolak alamat lokal/privat, supaya skrip ini tidak bisa diarahkan ke jaringan dalam."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    return all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def fetch(url):
    """Kembalikan (status, url_akhir, teks). status None kalau tidak terbuka."""
    if not re.match(r"https?://", url, re.I):
        url = "http://" + url
    host = urllib.parse.urlparse(url).hostname or ""
    if not host or not public_host(host):
        return None, url, ""
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            final = r.geturl()
            fh = urllib.parse.urlparse(final).hostname or ""
            if fh != host and not public_host(fh):
                return None, final, ""
            return r.status, final, r.read(300_000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, url, ""
    except (urllib.error.URLError, OSError, ValueError):
        return None, url, ""


def digits(s):
    return re.sub(r"\D", "", s or "")


def phone_tail(hp):
    d = digits(hp)
    d = d[2:] if d.startswith("62") else d.lstrip("0")
    return d[-9:] if len(d) >= 9 else ""


def nama_usaha(nama):
    return re.sub(r"^(jasa|cv\.?|pt\.?)\s+", "", (nama or "").strip(), flags=re.I)


def tokens(s):
    stop = {"jasa", "dan", "the", "cv", "pt", "service", "servis", "jakarta", "bekasi", "depok",
            "bogor", "tangerang", "24", "jam"}
    return [t for t in re.findall(r"[a-z0-9]{3,}", (s or "").lower()) if t not in stop]


def cek_cell(website):
    """Klasifikasi isi kolom Website, tanpa jaringan. Mengembalikan (jenis, url_atau_None)."""
    w = (website or "").strip()
    w = re.sub(r"\s*-\s*TIDAK VALID\s*$", "", w, flags=re.I).strip()
    if w in ("", "-"):
        return "kosong", None
    if FREE.search(w):
        return "gratisan", None
    m = re.search(r"((?:https?://)?(?:[\w-]+\.)+[a-z]{2,}(?:/\S*)?)", w, re.I)
    if SOCIAL.search(m.group(1) if m else w):
        return "sosmed", None
    return ("domain", m.group(1)) if m else ("kosong", None)


def cek_domain(url, nama):
    status, final, html = fetch(url)
    if status is None:
        return "MATI", final, "tidak terbuka / domain tidak ada"
    if status in (401, 403, 429):  # situs ada tapi memblokir pengecek otomatis
        return "ADA", final, f"HTTP {status} (diblokir bot, cek manual)"
    if status >= 400:
        return "MATI", final, f"HTTP {status}"
    if PARKED.search(html[:5000]):
        return "MATI", final, "halaman parkir/suspend"
    def inti(u):
        return (urllib.parse.urlparse(u if "//" in u else "//" + u).hostname or "").removeprefix("www.")
    if inti(final) != inti(url):
        return "PINDAH", final, f"dialihkan ke {inti(final)}, mungkin domain sudah dikuasai pihak lain"
    return "ADA", final, f"HTTP {status}"


def cari_kandidat(row, key):
    q = f"{nama_usaha(row['nama'])} {row['alamat'][-40:]}".strip()
    body = json.dumps({"q": q, "gl": "id", "hl": "id", "num": 10}).encode()
    req = urllib.request.Request("https://google.serper.dev/search", data=body,
                                 headers={"X-API-KEY": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            hits = json.load(r).get("organic", [])
    except (urllib.error.URLError, OSError, ValueError) as e:
        return None, f"pencarian gagal: {e}"
    nt = tokens(nama_usaha(row["nama"]))
    tail = phone_tail(row["hp"])
    for h in hits:
        url = h.get("link", "")
        host = urllib.parse.urlparse(url).hostname or ""
        if not host or DIRECTORY.search(host):
            continue
        # nama usaha harus tampak di domainnya
        if not nt or sum(t in host.replace("-", "") for t in nt) < max(1, len(nt) // 2):
            continue
        status, final, html = fetch(url)
        if status is None or status >= 400:
            continue
        page = html.lower()
        if tail and tail in digits(html):
            return final, "memuat nomor HP-nya"
        if all(t in page for t in nt[:2]):
            return final, "memuat nama usahanya"
    return None, ""


def baca(sumber):
    if re.match(r"https?://", sumber):
        with urllib.request.urlopen(urllib.request.Request(sumber, headers=UA), timeout=30) as r:
            text = r.read().decode("utf-8")
    else:
        with open(sumber, encoding="utf-8") as f:
            text = f.read()
    rows = list(csv.reader(io.StringIO(text)))
    if rows and not rows[0][0].strip().isdigit():  # baris header
        rows = rows[1:]
    out = []
    for r in rows:
        r = r + [""] * (6 - len(r))
        out.append({k: r[i].strip() for k, i in COL.items()})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("sumber", nargs="?", default=SHEET, help="URL CSV atau berkas (bawaan: Sheet)")
    ap.add_argument("-o", "--out", default="hasil-cek-web.csv")
    ap.add_argument("--cari", action="store_true", help="cari web untuk yang kosong (butuh SERPER_API_KEY)")
    ap.add_argument("--limit", type=int, default=0, help="batasi jumlah baris (0 = semua)")
    a = ap.parse_args()

    key = os.environ.get("SERPER_API_KEY", "")
    if a.cari and not key:
        sys.exit("--cari butuh SERPER_API_KEY di environment (2.500 pencarian gratis di serper.dev)")

    rows = baca(a.sumber)
    if a.limit:
        rows = rows[:a.limit]
    hasil, hitung = [], {}
    for r in rows:
        jenis, url = cek_cell(r["website"])
        temuan, alasan = "", ""
        if jenis == "domain":
            status, temuan, alasan = cek_domain(url, r["nama"])
        elif jenis == "gratisan":
            status = "GRATISAN"
        elif jenis == "sosmed":
            status = "IG/FB"
        else:
            status = "BELUM ADA"
        if a.cari and status in ("BELUM ADA", "IG/FB", "GRATISAN"):
            url2, why = cari_kandidat(r, key)
            if url2:
                status, temuan, alasan = "KANDIDAT", url2, why
            elif why:
                alasan = why
        hitung[status] = hitung.get(status, 0) + 1
        hasil.append([r["id"], r["nama"], r["website"], status, temuan, alasan])
        print(f"{r['id']:>4} {status:<10} {r['nama'][:40]:<40} {temuan}", file=sys.stderr)

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["No", "Nama Usaha", "Website di Sheet", "Hasil", "URL temuan", "Alasan"])
        w.writerows(hasil)
    print(f"\n{len(hasil)} baris -> {a.out}: " + ", ".join(f"{k} {v}" for k, v in sorted(hitung.items())))


if __name__ == "__main__":
    main()

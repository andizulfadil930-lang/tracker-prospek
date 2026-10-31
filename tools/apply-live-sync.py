#!/usr/bin/env python3
"""Pasang sinkronisasi Google Sheet ke build dashboard baru (bundle React yang di-minify).

Pakai setiap kali index.html diganti dengan build baru:

    python3 tools/apply-live-sync.py <build-baru.html> index.html

Yang dilakukan:
  1. Menyisipkan satu useEffect yang mendengarkan event "prospek:sync" dan memasukkan
     baris baru ke state prospek (dedupe HP). Nama variabel di bundle (namespace React,
     setter state, kunci localStorage) berubah tiap build, jadi dicari lewat pola.
  2. Memuat live-sync.js sebelum </body>.
  3. Membuang blok fetch lama (AUTO-FETCH LIVE DATA...) kalau ada.
  4. Memuat overrides.css (penyesuaian tampilan, mis. panel filter tidak lagi menempel
     dan menutupi daftar) sebelum </head>.
  5. Mengganti dua template pesan WhatsApp bawaan build (pesan umum "Halo Pak ..." dan
     pesan grand opening "Halo Kak ...") dengan panggilan ke cold-reach.js, dan memuat
     berkas itu sebelum </body>. Langkah ini tidak fatal: kalau template tidak ketemu
     (teks bawaan build berubah), pesan bawaan build tetap dipakai dan hasil akhirnya
     menyebutnya.

  6. Memasang filter "Jenis Web" (web-kind.js): Ada Website, Web Gratisan, Web Mati, Cuma WA,
     Cuma Instagram, Cuma Facebook. Untuk index.html yang sudah terpasang live-sync, pasang
     hanya filternya dengan: python3 tools/apply-live-sync.py --web-filter index.html index.html

Berhenti dengan pesan jelas kalau polanya tidak ketemu atau tidak unik, supaya tidak
menghasilkan index.html setengah jadi. Hanya pustaka standar Python.
"""
import re
import sys

NAME = r"[A-Za-z_$][\w$]*"

# Awal teks dua template pesan WA bawaan build: pesan umum, lalu pesan grand opening.
WA_TEMPLATES = ("Halo Pak ", "Halo Kak ")


def apply_cold_reach(html):
    """Arahkan template pesan WA ke window.coldReachMessage (cold-reach.js).

    Kembalian: (html, terpasang). Tidak pernah berhenti dengan sys.exit.
    """
    if "coldReachMessage" in html:
        return html, True
    patched = html
    for opening in WA_TEMPLATES:
        # Template literal tanpa backtick di dalamnya: function <fn>(e){return`Halo Pak ${e.nama} ...`}
        found = list(re.finditer(
            rf"function ({NAME})\(e\)\{{return`{re.escape(opening)}\$\{{e\.nama\}}[^`]*`\}}", patched))
        if len(found) != 1 or patched.count("</body>") != 1:
            return html, False
        m = found[0]
        # Cadangan kalau cold-reach.js gagal dimuat: jangan sampai dashboard error.
        call = f'function {m.group(1)}(e){{return window.coldReachMessage?window.coldReachMessage(e):"Halo "+e.nama}}'
        patched = patched[:m.start()] + call + patched[m.end():]
    if "cold-reach.js" not in patched:
        patched = patched.replace("</body>", '<script src="cold-reach.js"></script>\n</body>')
    return patched, True


def apply_web_filter(html):
    """Pasang filter "Jenis Web" (Ada Website / Cuma WA / Cuma IG / Cuma FB / ...) ke bundle.

    Menambah satu state, satu <select> di samping filter Prioritas, syarat di filter daftar,
    chip filter aktif, dan reset di Clear Filters. Jenis dihitung oleh window.webKind
    (web-kind.js). Berhenti dengan pesan jelas kalau salah satu pola tidak ketemu tepat 1x.
    """
    if "__setWf" in html:
        return html

    def one(pattern, what):
        found = list(re.finditer(pattern, html))
        if len(found) != 1:
            sys.exit(f"filter web: {what} harus ketemu tepat 1x, ketemu {len(found)}x")
        return found[0]

    # 1. state, tepat setelah state filter cluster: [l,u]=R.useState("All"),[o,i]=R.useState("All"),[a,p]=R.useState([])
    m = one(rf'\[({NAME}),({NAME})\]=({NAME})\.useState\("All"\),(?=\[{NAME},{NAME}\]=\3\.useState\("All"\),\[{NAME},{NAME}\]=\3\.useState\(\[\]\))', "state filter")
    html = html[:m.end()] + f'[__wf,__setWf]={m.group(3)}.useState("All"),' + html[m.end():]

    # 2. syarat di filter daftar + dependensi useMemo
    m = one(rf'(return {NAME}(?:&&{NAME})+)(\}}\)\}},\[)((?:{NAME},)+{NAME})(\]\))', "filter daftar")
    pm = list(re.finditer(rf"\.filter\(\(({NAME})\)=>\{{", html[:m.start()]))
    if not pm:
        sys.exit("filter web: parameter baris di filter daftar tidak terbaca")
    cond = f'&&(__wf==="All"||!!window.webKind&&window.webKind({pm[-1].group(1)}.website)===__wf)'
    html = html[:m.start()] + m.group(1) + cond + m.group(2) + m.group(3) + ",__wf" + m.group(4) + html[m.end():]

    # 3. <select> setelah filter Prioritas
    m = one(rf'({NAME})\("select",\{{value:{NAME},onChange:\(s\)=>{NAME}\(s\.target\.value\),className:"([^"]+)",children:\[({NAME})\("option",\{{value:"All",children:"Semua Prioritas"\}}\)', "filter Prioritas")
    jsx_s, cls, jsx = m.group(1), m.group(2), m.group(3)
    tail = f'{jsx}("option",{{value:"Low",children:"Low"}})]}}),'
    at = html.find(tail, m.end())
    if at < 0 or at - m.end() > 600:
        sys.exit("filter web: akhir filter Prioritas tidak ketemu")
    select = (
        f'{jsx_s}("select",{{value:__wf,onChange:(s)=>__setWf(s.target.value),className:"{cls}",'
        f'children:[{jsx}("option",{{value:"All",children:"Semua Jenis Web"}}),'
        f'...(window.WEB_KINDS||[]).map((k)=>{jsx}("option",{{value:k[0],'
        f'children:k[1]+" ("+e.filter((p)=>window.webKind(p.website)===k[0]).length+")"}},k[0]))]}}),'
    )
    html = html[:at + len(tail)] + select + html[at + len(tail):]

    # 4. chip filter aktif
    m = one(r'(if\(' + NAME + r'!=="All"\)' + NAME + r'\.push\(' + NAME + r'\);)(if\(' + NAME + r'\)' + NAME + r'\.push\(`Search: )', "chip filter aktif")
    arr = re.search(NAME + r"\.push\(", m.group(1)).group(0)
    html = html[:m.end(1)] + f'if(__wf!=="All"){arr}window.webLabel?window.webLabel(__wf):__wf);' + html[m.end(1):]
    m = one(r'(return ' + NAME + r'\},\[)((?:' + NAME + r',)+' + NAME + r')(\]\),function ' + NAME + r'\(\)\{|\]\);function ' + NAME + r'\(\)\{)', "dependensi chip")
    html = html[:m.end(2)] + ",__wf" + html[m.end(2):]

    # 5. Clear Filters
    m = one(rf'function {NAME}\(\)\{{{NAME}\(""\),{NAME}\("All"\),{NAME}\("All"\),{NAME}\("All"\),{NAME}\(\[\]\),', "Clear Filters")
    html = html[:m.end()] + '__setWf("All"),' + html[m.end():]

    if "web-kind.js" not in html:
        if html.count("</body>") != 1:
            sys.exit("</body> harus ada tepat 1x")
        html = html.replace("</body>", '<script src="web-kind.js"></script>\n</body>')
    return html


def apply(html):
    if "prospek:sync" in html:
        sys.exit("sudah dipasang: 'prospek:sync' sudah ada di berkas ini")

    # useEffect auto-save: <R>.useEffect(()=>{try{localStorage.setItem(<K>,JSON.stringify(e))
    save = list(re.finditer(
        rf"({NAME})\.useEffect\(\(\)=>\{{try\{{localStorage\.setItem\(({NAME}),JSON\.stringify\(e\)\)", html))
    if len(save) != 1:
        sys.exit(f"effect auto-save harus ketemu tepat 1x, ketemu {len(save)}x")
    react, key = save[0].group(1), save[0].group(2)

    # setter state prospek: let[e,<n>]=<R>.useState(()=>...), letaknya sebelum effect auto-save
    setters = [m for m in re.finditer(
        rf"let\[e,({NAME})\]={re.escape(react)}\.useState\(\(\)=>", html) if m.start() < save[0].start()]
    if len(setters) != 1:
        sys.exit(f"deklarasi state prospek harus ketemu tepat 1x sebelum effect auto-save, ketemu {len(setters)}x")
    setter = setters[0].group(1)

    # k = phoneKey: HARUS sama dengan phoneKey di live-sync.js
    listener = (
        f"{react}.useEffect(()=>{{"
        'let k=p=>{let d=String(p==null?"":p).replace(/\\D/g,"");'
        'return d.indexOf("62")===0?"0"+d.slice(2):d.indexOf("8")===0?"0"+d:d},'
        'h=ev=>{let rows=(ev.detail&&ev.detail.rows)||[];if(!rows.length)return;'
        f"{setter}(prev=>{{let seen=new Set(prev.map(x=>k(x.phone))),"
        "add=rows.filter(r=>{let key=k(r.phone);if(!key||seen.has(key))return!1;seen.add(key);return!0});"
        "return add.length?[...add,...prev]:prev})};"
        f'window.__prospekStorageKey={key};'
        'window.addEventListener("prospek:sync",h);window.__prospekReady=!0;'
        'window.dispatchEvent(new Event("prospek:ready"));'
        'return()=>{window.removeEventListener("prospek:sync",h);window.__prospekReady=!1}},[]);'
    )
    html = html[:save[0].start()] + listener + html[save[0].start():]

    # blok fetch lama (hanya ada di build lama)
    html = re.sub(r"<script>\n// AUTO-FETCH LIVE DATA FROM GOOGLE SHEET.*?</script>\n", "", html, flags=re.S)

    if "overrides.css" not in html:
        if html.count("</head>") != 1:
            sys.exit("</head> harus ada tepat 1x")
        html = html.replace("</head>", '<link rel="stylesheet" href="overrides.css">\n</head>')

    html, pesan = apply_cold_reach(html)
    html = apply_web_filter(html)

    if "live-sync.js" not in html:
        if html.count("</body>") != 1:
            sys.exit("</body> harus ada tepat 1x")
        html = html.replace("</body>", '<script src="live-sync.js"></script>\n</body>')
    return html, react, setter, key, pesan


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--web-filter":
        # Hanya filter "Jenis Web", untuk index.html yang sudah punya live-sync.
        with open(sys.argv[2], encoding="utf-8") as f:
            out = apply_web_filter(f.read())
        with open(sys.argv[3], "w", encoding="utf-8") as f:
            f.write(out)
        sys.exit(f"ok: filter Jenis Web terpasang di {sys.argv[3]}")
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        out, react, setter, key, pesan = apply(f.read())
    with open(dst, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"ok: {dst} (react={react}, setter={setter}, kunci={key})")
    if not pesan:
        print("peringatan: template pesan WA bawaan build tidak ketemu, pesan bawaan build dipakai "
              "(cold-reach.js tidak terpasang)", file=sys.stderr)

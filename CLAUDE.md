# CLAUDE.md — pena-digital-catalog

Dokumen ini berisi konteks lengkap proyek **pena-digital-catalog** untuk membantu AI assistant (Claude) memahami arsitektur, konvensi, dan keputusan teknis yang sudah dibuat.

---

## 🗂️ Gambaran Proyek

**PenaDigital Store** adalah toko digital yang menjual perangkat ajar (Modul Ajar, PPT, KKTP, ATP, Prota, Promes) untuk guru Indonesia. Produk berupa file Google Drive yang dikirim otomatis setelah pembayaran.

**Repository ini** (`pena-digital-catalog`) adalah **frontend statis** yang di-deploy ke Vercel dan dapat diakses di `https://penadigital.xyz`.

Ada **repository terpisah** bernama `pena-digital-backend` yang di-deploy di `https://pena-digital-backend.vercel.app` — frontend ini mengakses semua data melalui API backend tersebut.

---

## 🏗️ Arsitektur Sistem

```
pena-digital-catalog (repo ini)        pena-digital-backend (repo terpisah)
├── Frontend statis (HTML/CSS/JS)  →   ├── Express.js + Prisma
├── Di-deploy ke Vercel                ├── Database: Supabase (PostgreSQL)
└── Domain: penadigital.xyz            ├── Di-deploy ke Vercel
                                       └── URL: pena-digital-backend.vercel.app
```

### Flow Utama

**Pesanan Shopee (sistem lama):**
```
Shopee → Google Apps Script → Webhook → pena-digital-backend
       → Telegram Bot admin → kirim email + WA ke pembeli
       → Pembeli cek link di index.html (input nomor pesanan Shopee)
```

**Pesanan Website Midtrans (sistem baru):**
```
Pembeli pilih produk → cart → checkout → Midtrans Snap popup
→ Webhook Midtrans → pena-digital-backend
→ bedahDanCariLink() → kirim email + WA + notif Telegram otomatis
→ Pembeli lihat link di success.html
```

**Mode Maintenance (toggle admin, tanpa redeploy):**
```
Admin nyalain switch di admin.html → PUT /api/public/maintenance
→ disimpan di tabel app_settings (key='maintenance')

Dicek di 2 titik, masing-masing independen:
1. Tombol "Cari" di index.html   → GET /pesanan/:no_pesanan digate server-side
2. Tombol "Beli Sekarang" produk.html → cek GET /maintenance sebelum masuk cart
   (backstop) POST /midtrans/create-transaction digate server-side juga,
   jadi jalur cart.html → checkout.html manual pun tetap ketolak.

Kalau digate, pembeli diarahkan ke maintenance.html?fitur=cari|beli.
```

---

## 📁 Struktur File Frontend

```
pena-digital-catalog/
│
├── index.html          # Halaman utama: cek pesanan Shopee + grid katalog
├── produk.html         # Detail produk: foto, deskripsi, variasi, preview contoh, add to cart
├── cart.html           # Keranjang belanja
├── checkout.html       # Form pembeli + Midtrans Snap + input kode referral
├── success.html        # Halaman setelah bayar: tampilkan link / hubungi admin
├── pending.html        # Pembayaran tertunda: countdown 3 jam + tombol batalkan
│
├── admin.html          # Admin: kelola katalog produk (CRUD) + toggle mode maintenance
├── orders.html         # Admin: riwayat pesanan Midtrans + rekap keuangan + kirim link manual
├── referral.html       # Admin: kelola kode diskon referral
├── maintenance.html    # Halaman "sedang maintenance" -- tujuan redirect saat fitur cari/beli dimatikan admin
│
├── contact.html        # Halaman kontak (wajib Midtrans)
├── tnc.html            # Syarat & Ketentuan (wajib Midtrans)
├── refund.html         # Kebijakan pengembalian dana (wajib Midtrans)
│
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (PWA)
├── icon-192.png        # Ikon PWA 192x192
└── icon-512.png        # Ikon PWA 512x512
```

---

## 🔌 API Backend

**Base URL:** `https://pena-digital-backend.vercel.app/api/public`

Semua file frontend menggunakan konstanta:
```js
const API = 'https://pena-digital-backend.vercel.app/api/public';
```

### Endpoint Publik (tanpa auth)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/pesanan/:no_pesanan` | Cek link pesanan Shopee (rate-limited 10x/menit) |
| PATCH | `/pesanan/:no_pesanan/ambil` | Tandai pesanan TERKIRIM + notif Telegram |
| GET | `/katalog` | Daftar produk aktif untuk halaman publik |
| GET | `/katalog/:id` | Detail satu produk |
| POST | `/referral/validasi` | Validasi kode referral saat checkout |
| POST | `/midtrans/create-transaction` | Buat transaksi Midtrans |
| POST | `/midtrans/notification` | Webhook dari Midtrans (tidak dipanggil frontend) |
| GET | `/midtrans/order/:order_id` | Cek status & link pesanan Midtrans |
| POST | `/midtrans/order/:order_id/cancel` | Batalkan pesanan pending |
| POST | `/midtrans/order/:order_id/regenerate-token` | Buat ulang Snap token yang expired |
| GET | `/midtrans/config` | Ambil client key Midtrans |
| GET | `/maintenance` | Status mode maintenance saat ini `{cari,beli}` |

### Endpoint Admin (butuh header `x-admin-secret`)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/katalog/all` | Semua produk termasuk nonaktif |
| POST | `/katalog` | Tambah produk baru |
| PUT | `/katalog/:id` | Edit produk |
| DELETE | `/katalog/:id` | Hapus produk |
| GET | `/midtrans/orders` | Daftar semua pesanan (support filter) |
| GET | `/midtrans/rekap` | Rekap keuangan + grafik 30 hari + terlaris |
| POST | `/midtrans/kirim-link` | Kirim link manual ke email + WA pembeli |
| GET | `/referral` | Daftar kode referral |
| POST | `/referral` | Buat kode referral baru |
| PUT | `/referral/:id` | Edit kode referral |
| DELETE | `/referral/:id` | Hapus kode referral |
| PUT | `/maintenance` | Ubah mode maintenance `{cari,beli}` |

---

## 🗃️ Database (Supabase)

### Tabel yang relevan untuk frontend ini

**`catalog_products`** — produk katalog toko
```sql
id              SERIAL PRIMARY KEY
nama            TEXT NOT NULL
foto_url        TEXT NOT NULL          -- URL Cloudinary (bukan Google Drive)
link_co         TEXT                   -- opsional, link Shopee/Lynk.id
harga           INT DEFAULT 0
deskripsi       TEXT
variasi_config  JSONB DEFAULT '[]'     -- [{nama:"Mapel", opsi:["MTK","IPA"]}]
link_contoh     TEXT                   -- URL Google Drive untuk preview
stok_habis      JSONB DEFAULT '[]'     -- ["IPA-7", "MTK-9"] kombinasi yang habis
urutan          INT DEFAULT 0
aktif           BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ
```

**`midtrans_orders`** — pesanan via website
```sql
id              TEXT PRIMARY KEY       -- format: PD-{timestamp}-{random}
customer_name   TEXT
customer_email  TEXT
customer_wa     TEXT
items           JSONB                  -- [{produk_id, nama, variasi, harga, qty}]
total           INT
status          TEXT                   -- pending/paid/cancel/expire/fraud
snap_token      TEXT
link_produk     JSONB                  -- [{label, url}] hasil bedahDanCariLink
referral_data   JSONB                  -- {kode, diskon, tipe, nilai} jika pakai referral
midtrans_data   JSONB                  -- raw response dari Midtrans
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

**`referral_codes`** — kode diskon
```sql
id              SERIAL PRIMARY KEY
kode            TEXT UNIQUE            -- selalu uppercase, tanpa spasi
tipe_diskon     TEXT                   -- 'persen' atau 'nominal'
nilai_diskon    INT
maks_pemakaian  INT
jumlah_terpakai INT DEFAULT 0
aktif           BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ
```

**`app_settings`** — setting key-value generik (dipakai pertama kali untuk mode maintenance)
```sql
key             TEXT PRIMARY KEY       -- saat ini cuma 1 baris: 'maintenance'
value           JSONB                  -- {"cari":bool,"beli":bool}
updated_at      TIMESTAMPTZ
```

**`shopee_orders`** — pesanan Shopee (sistem lama, read-only dari frontend ini)
```
no_pesanan      TEXT (key)
detail_produk   TEXT    -- format: "PAG MTK Kelas 7 (https://drive...) | PAG IPA ..."
username_pembeli TEXT
status_aksi     TEXT    -- diupdate ke 'TERKIRIM' saat pembeli ambil link sendiri
```

---

## 🎨 Desain & Identitas Visual

**Brand:** PenaDigital Store — Perangkat Ajar Digital

**Palet Warna:**
```css
--navy:    #1B3A6B   /* warna utama, header, teks penting */
--navy2:   #2A4F8F   /* navy hover state */
--orange:  #E07B2A   /* aksen utama, CTA, highlight */
--orange2: #F5A040   /* orange lebih terang, subtitle */
--cream:   #F5EFE6   /* background halaman */
--cream2:  #EDE4D6   /* border, divider */
```

**Font:** `Plus Jakarta Sans` (Google Fonts) — weight 400/500/600/700/800

**Logo header (`.logo-box` & `.login-logo`):** `<img>` ke Cloudinary — `https://res.cloudinary.com/dnksb0xpy/image/upload/v1782532301/6e9671ed-082b-4fe0-a7a0-6cec31b30e92_ruxq3l.jpg` (diganti dari SVG inline pada commit `1d91078`, 2026-07-02). Berlaku di semua header (11 halaman publik+admin) dan layar login admin/orders/referral.

**Ikon:** SVG inline (tidak ada icon library eksternal) — kecuali logo header di atas

**PWA:** Semua halaman publik adalah PWA — bisa diinstall di HP sebagai aplikasi

---

## 🔐 Autentikasi Admin

- **Satu password** untuk semua halaman admin (`admin.html`, `orders.html`, `referral.html`)
- Password disimpan di environment variable backend: `ADMIN_SECRET`
- Frontend kirim sebagai header: `x-admin-secret: <password>`
- Session disimpan di `sessionStorage` browser (hilang saat tab ditutup)
- Tidak ada JWT atau sistem token — simpel intentional karena single-user

---

## 💳 Midtrans

- **Mode:** Production (`MIDTRANS_IS_PRODUCTION=true`)
- **Client Key:** `Mid-client-tSZ9jlbMfd4FzuOA` (hardcoded di `checkout.html`)
- **Snap.js:** Di-load dari `https://app.midtrans.com/snap/snap.js`
- **Webhook URL:** `https://pena-digital-backend.vercel.app/api/public/midtrans/notification`
- **Finish URL:** `https://penadigital.xyz/success.html`

---

## 🛒 State Management

Tidak ada state management library. Semua state disimpan di:

| Data | Lokasi | Key |
|------|--------|-----|
| Isi keranjang | `localStorage` | `pd_cart` |
| Order ID terakhir | `localStorage` | `pd_last_order` |
| WA pembeli terakhir | `localStorage` | `pd_customer_wa` |
| Session admin | `sessionStorage` | `pd_admin_secret` |

**Format `pd_cart`:**
```json
[{
  "key": "4-Matematika - 7",
  "produk_id": 4,
  "nama": "PAG SMA Deep Learning",
  "variasi": "Matematika - 7",
  "harga": 35000,
  "foto_url": "https://res.cloudinary.com/...",
  "qty": 1
}]
```

---

## ⚠️ Bug Diketahui

### ✅ Sudah Diperbaiki

1. **`orders.html`** (dulu baris 534 & 609) — `JSON.stringify(items/links)` di atribut `onclick` tidak escape tanda kutip ganda, memecah HTML sehingga tombol "Kirim/Update Link ke Pembeli" gagal terpanggil. **Fixed** commit `f8c4cfc` (2026-07-02): ganti `.replace(/'/g,'&#39;')` → `.replace(/"/g,'&quot;')`.
2. **`admin.html`** (dulu baris 534) — `toggleAktif` tidak escape `JSON.stringify(p)` dengan `&quot;`, memecah `onclick` tombol toggle Aktif/Nonaktif. **Fixed** commit `f8c4cfc` (2026-07-02): disamakan dengan pola `bukaEdit` yang sudah benar.
3. **`admin.html`** (dulu baris 729) — body PUT di `toggleAktif` hanya kirim 5 field lama (`nama, foto_url, link_co, urutan, aktif`). Dikonfirmasi lewat kode backend (`pena-digital-backend/src/routes/api.js`, endpoint `PUT /katalog/:id`) bahwa query melakukan `UPDATE ... SET` ke **semua 10 kolom tanpa syarat** — jadi field yang tidak dikirim (`harga, deskripsi, variasi_config, link_contoh, stok_habis`) benar-benar ter-reset ke default setiap toggle Aktif/Nonaktif. **Fixed** commit `3affc5e` (2026-07-02): `toggleAktif` sekarang kirim semua field seperti `simpanEdit()`.
4. **`referral.html:251`** — body PUT di `toggleReferral` tidak kirim `kode`. Dikonfirmasi lewat kode backend (`PUT /referral/:id`) bahwa query **hanya** meng-update 4 kolom eksplisit (`tipe_diskon, nilai_diskon, maks_pemakaian, aktif`) — `kode` dan `jumlah_terpakai` tidak pernah disentuh, jadi **sebenarnya sudah aman, bukan bug**. Tetap ditambahkan pengiriman `kode` di commit `3affc5e` (2026-07-02) sebagai pengaman kalau query backend berubah ke full-replace di masa depan.
5. **`produk.html:367`** — `Object.values(variasiTerpilih).join('-')` di `cekKombinasiStok()` bergantung pada urutan klik pembeli, bukan urutan dimensi di `variasi_config`. **Fixed** commit `e1d3063` (2026-07-02): tambah helper `getVarConf()` & `getVariasiUrut()`, dipakai di `cekKombinasiStok`, `getVariasiLabel`, `validasiVariasi` agar kombinasi selalu diurutkan sesuai `variasi_config`.
6. **`produk.html:293`** — `const harga = p.harga ? ... : 'Hubungi Admin'` memperlakukan harga `0` sebagai falsy. **Fixed** commit `e1d3063` (2026-07-02): ganti jadi null-check (`p.harga !== null && p.harga !== undefined`).
7. **`referral.html:210`** — `onclick="hapusReferral(...)"` pakai `esc()` yang tidak escape kutip tunggal, padahal disisipkan ke string berkutip tunggal. **Fixed** commit `e1d3063` (2026-07-02): tambah fungsi `escA()` (sebelumnya belum ada sama sekali di file ini) dan dipakai di `hapusReferral`.

### 🔍 Temuan & Perbaikan Backend (repo `pena-digital-backend`)

- **`ADMIN_SECRET` fallback hardcoded** di `src/routes/publicRoutes.js` (fungsi `adminAuth`). **Fixed** commit `913d833` (2026-07-02): fallback `'penadigital2025'` dihapus, sekarang fail-closed — kalau `ADMIN_SECRET` tidak di-set di env, semua endpoint admin selalu 401 (bukan lagi bisa diakses pakai password default).
- **`/api/shopee-webhook` dan `/api/telegram-webhook` tidak ada verifikasi signature/secret**. **Partial fix** commit `913d833` (2026-07-02): ditambah middleware `verifyWebhookSecret` di `src/routes/api.js`, tapi **opt-in** (hanya aktif kalau env var `GAS_WEBHOOK_SECRET` / `TELEGRAM_WEBHOOK_SECRET` di-set) supaya webhook produksi yang sedang berjalan tidak putus. Proteksi belum benar-benar aktif sampai:
  1. Set `GAS_WEBHOOK_SECRET` di Vercel **dan** update skrip Google Apps Script agar mengirim header `x-webhook-secret: <nilai>` saat POST ke `/api/shopee-webhook`.
  2. Set `TELEGRAM_WEBHOOK_SECRET` di Vercel **dan** daftarkan ulang webhook Telegram dengan `secret_token` yang sama via `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<url>&secret_token=<TELEGRAM_WEBHOOK_SECRET>`.
- **`prisma/schema.prisma` tidak mencerminkan skema DB asli** — tabel `catalog_products`, `midtrans_orders`, `referral_codes` diakses lewat raw SQL (`$queryRaw`) dan tidak dideklarasikan di schema Prisma (hanya `Product`, `ProductCell`, `ShopeeOrder`, `SystemLog`). Aman dari SQL injection (tagged template Prisma otomatis parameterize), tapi tidak ada type-safety untuk tabel-tabel utama itu. **Belum diperbaiki.**
- **`src/controllers/productController.js` — dead code, sudah dihapus** commit `fd23cf4` (2026-07-02). Duplikat lama dari `bedahDanCariLink` yang sudah digantikan `shopeeController.js`; tidak direferensikan `routes/api.js` maupun file lain. `shopeeController.js` (jalur produksi webhook GAS → cari link → notif Telegram + email/WA) **tidak diubah**.
- File `gas.txt` dan `pro.py` di root backend (kode Python skoring tugas/deadline, tidak berhubungan dengan proyek ini) — **dihapus** commit `913d833` (2026-07-02).

---

## 📦 Environment Variables Backend

Set di Vercel Dashboard → pena-digital-backend → Settings → Environment Variables:

```
DATABASE_URL          = postgresql://... (Supabase connection string)
ADMIN_SECRET          = <password admin>
MIDTRANS_SERVER_KEY   = <server key Midtrans, JANGAN pernah ditulis plaintext di sini>
MIDTRANS_CLIENT_KEY   = Mid-client-tSZ9jlbMfd4FzuOA
MIDTRANS_IS_PRODUCTION= true
FRONTEND_URL          = https://penadigital.xyz
EMAIL_USER            = official.penadigital@gmail.com
EMAIL_PASS            = <app password Gmail>
FONNTE_TOKEN          = <token Fonnte untuk kirim WA>
TELEGRAM_TOKEN        = <token bot Telegram>
TELEGRAM_CHAT_ID      = <chat ID admin>
```

---

## 🚀 Deploy

**Frontend (repo ini):**
- Auto-deploy via Vercel setiap push ke `main`
- Tidak ada build step — file statis langsung di-serve
- Domain custom: `penadigital.xyz`

**Backend (repo terpisah):**
- Auto-deploy via Vercel setiap push ke `main`
- Setelah tambah dependency baru, wajib commit `package.json` + `package-lock.json`
- Prisma: generate otomatis via `postinstall` script

---

## 🔧 SQL Migrations

Semua migration dijalankan manual di **Supabase SQL Editor**. Tidak ada migration tool otomatis.

File migration tersedia di: `SQL_MIGRATION_FITUR_BARU.sql`

```sql
-- Kolom yang sudah ditambahkan ke catalog_products:
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS deskripsi TEXT;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS harga INT DEFAULT 0;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS variasi_config JSONB DEFAULT '[]';
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS link_contoh TEXT;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS stok_habis JSONB DEFAULT '[]';

-- Tabel baru:
-- midtrans_orders (lihat schema di atas)
-- referral_codes (lihat schema di atas)
```

---

## 📋 Konvensi Kode

### Escaping di template string HTML

```js
// Untuk konten HTML (aman dari XSS):
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Untuk nilai di dalam atribut onclick='...' (escape kutip tunggal):
function escA(s){ return String(s||'').replace(/'/g,"\\'"); }

// JANGAN sisipkan JSON.stringify() langsung ke onclick="" tanpa escaping penuh
// BENAR:
onclick="bukaEdit(${JSON.stringify(p).replace(/"/g,'&quot;')})"
// SALAH:
onclick="bukaEdit(${JSON.stringify(p)})"
```

### Format harga

```js
// Selalu gunakan toLocaleString('id-ID') untuk display:
Rp ${parseInt(harga).toLocaleString('id-ID')}

// Cek harga dengan null check, bukan falsy (karena 0 valid):
p.harga !== null && p.harga !== undefined ? `Rp ${p.harga}` : 'Hubungi Admin'
```

### Format variasi kombinasi stok habis

Admin input di field "Stok Habis": `IPA-7, Matematika-9`
Disimpan di DB sebagai: `["IPA-7", "Matematika-9"]`
Kunci kombinasi dibuat dari: nilai variasi diurutkan sesuai `variasi_config`, digabung dengan `-`

---

## 📞 Kontak Admin

- **WhatsApp:** `6282228225791` (hardcoded di beberapa file)
- **Email:** `official.penadigital@gmail.com`
- **Template WA admin (link belum ada):**
  ```
  Halo min, saya belum mendapatkan pesanan saya
  no pesanan: XXXXXXX
  produk: PAG Matematika Kelas 7
  ```

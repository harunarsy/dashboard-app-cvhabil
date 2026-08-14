# Habil Beta V2.0 — Rancangan

**Tanggal:** 14 Agustus 2026
**Status:** disetujui pemilik, siap dibuat rencana kerja
**Versi sekarang:** v1.66.2-stable

---

## Tujuan

Habil V2 yang lebih kokoh, rapi, dan setara kualitas produk komersial — dibangun berdampingan
dengan v1 yang tetap dipakai bisnis setiap hari.

Yang membuat V2 perlu ada **bukan** kecepatan. Enam bug yang ditemukan pada 7–14 Agustus 2026
semuanya berakar pada satu hal yang sama:

| Bug | Akar |
|---|---|
| HPP Omela 12× lipat | logika satuan tersebar, tanpa tipe data |
| Draft WA "48 karton" | aturan `qty_in_unit` ditulis ulang di 8 tempat |
| Toast tertutup modal | tidak ada aturan lapisan terpusat |
| `Invalid Date` 64× | format tanggal ditulis ulang di 4 berkas |
| Stok hantu 168 unit | filter `is_active` lupa di 3 query |
| Tombol "Tambah Baru" selalu gagal | validasi backend tidak terwakili di frontend |

**Pola tunggalnya: aturan bisnis yang sama ditulis ulang di banyak berkas.**
`InvoiceList.jsx` 5.800 baris, `SalesOrderList.jsx` 6.000 baris.

Mengganti kerangka kerja tidak menyentuh masalah ini. V2 ada untuk menghapusnya.

---

## Keputusan yang sudah diambil

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Multi-perusahaan (SaaS) | **Tidak sekarang** | Belum ada pembeli nyata. Menambahkannya nanti di atas fondasi bersih itu kerja berminggu; membangunnya sekarang secara spekulatif berlipat 3–4× beban. |
| Cara bangun | **Bertahap dari yang ada** | Menulis ulang dari nol berarti menemukan ulang bertahun-tahun aturan halus (FEFO, satuan pack, PPN, opname). Bisnis tidak boleh berhenti. |
| Bahasa | **TypeScript** | Tiga dari enam bug di atas mustahil terjadi dengan pengecekan tipe. |
| Frontend | **Vite + React** | CRA (`react-scripts`) sudah tidak dikembangkan. |
| Backend | **Express, tetap** | Fastify tidak menyelesaikan satu pun bug di atas. Yang berubah: pakai `core/`, TypeScript bertahap. |
| Database beta | **Sama dengan produksi** | Keputusan pemilik, dengan pengaman wajib (lihat di bawah). |

### Sengaja TIDAK dikerjakan

Multi-perusahaan · langganan & tagihan · pendaftaran mandiri · ganti Axios ke `fetch` ·
ganti Recharts · ganti Express ke Fastify.

Semua bisa ditambahkan nanti kalau terbukti perlu. Tidak ada yang menyelesaikan masalah
yang membuat V2 dibutuhkan.

---

## Arsitektur

```
habil/
├─ core/          ← aturan bisnis. SATU-SATUNYA sumber kebenaran
│   ├─ uom.ts        satuan: pcs ↔ karton, pack_size
│   ├─ pricing.ts    HNA → HPP, PPN, margin
│   ├─ inventory.ts  FEFO, batch aktif, nilai stok
│   ├─ dates.ts      format & parsing tanggal
│   └─ types.ts      bentuk data: Produk, Batch, Nota, Faktur
│
├─ api/           ← backend Express, memakai core/
└─ web/           ← frontend Vite + React + TypeScript, memakai core/
```

**`core/` adalah inti rancangan ini.** Satu aturan, satu tempat, dipakai kedua sisi.
Salah sekali berarti salah di semua tempat sekaligus — dan tertangkap satu test.

**`core/` juga dipakai v1.** Tiap aturan yang diekstrak langsung memperbaiki yang sekarang.
Kalau V2 mandek di tengah jalan, kerja yang sudah dilakukan tetap berguna.

---

## Dua pintu

| | Alamat | Isi |
|---|---|---|
| Stabil | `habil-dashboard.vercel.app` | v1, dipakai Fivin & Ferry — tidak disentuh |
| Beta | `habil-beta.vercel.app` | proyek Vercel terpisah, repo sama, folder `web/` |

Dua proyek Vercel dari satu repo; keduanya menembak backend yang sama.

**Akses:** Vercel Deployment Protection pada proyek beta. Orang tanpa izin berhenti di
halaman kunci, tidak sampai ke layar login — lebih rapat daripada pengecekan peran di kode,
karena tidak ada kode yang perlu benar.

---

## Pengaman database

Beta memakai database produksi. Pengaman berikut **wajib**, bukan opsional — kehati-hatian
gagal justru saat kita paling percaya diri. Pada 14 Agustus 2026 ditemukan tiga query yang
lupa menyaring `is_active`; filter yang lupa bukan kejadian langka.

1. **Penanda beta.** Semua baris yang dibuat beta ditandai (`created_by_beta = true` atau
   awalan nama `[BETA]`).
2. **Beta hanya boleh menyentuh miliknya sendiri.** `INSERT` bebas; `UPDATE`/`DELETE` hanya
   pada baris bertanda beta. Percobaan mengubah nota/stok asli **ditolak di backend**.
3. **Perintah bersih-bersih.** Satu perintah mencari semua data bertanda beta, menghapusnya,
   dan melaporkan apa saja yang dihapus — sehingga "dihapus setelah pengetesan" jadi
   terverifikasi, bukan diingat-ingat.
4. **Fase awal tanpa tulis.** Slice 1 hanya membaca. Risiko nol sampai alur simpan
   benar-benar perlu diuji.

---

## Urutan pemindahan

Prinsip: **paling banyak membuktikan, risiko paling kecil** — bukan "paling gampang dulu".

### Slice 1 — Inventory, tampilan saja
Menyentuh seluruh isi `core/` sekaligus (satuan, HNA→HPP, PPN, FEFO, batch aktif, nilai stok)
tapi hanya membaca. Menguji semuanya dengan risiko tulis nol.

**Ukuran keberhasilan** — angka beta harus sama persis dengan v1:
83 produk · stok Tropicana `TS-CLS-160SCT` = 187 · nilai persediaan Rp 226.120.468 inc PPN.
Kalau meleset, `core/` salah.

### Slice 2 — Customer + Distributor
CRUD sederhana tanpa uang. Di sini pengaman tulis diuji sungguhan.

### Slice 3 — Daftar Harga + Surat Pesanan

### Slice 4 — Faktur Pembelian
Terberat: stok masuk, HPP, PPN, batch.

### Slice 5 — Nota Penjualan
Pengurangan FEFO, margin, draft WA, cetak PDF 3 ukuran kertas.

### Slice 6 — Dashboard, Keuangan, Pajak, Buku Besar
Sengaja terakhir: semuanya menjumlah hasil modul lain.

### Aturan transisi
Halaman yang sudah pindah ke beta **dibekukan di v1** — perbaikan bug boleh, fitur baru tidak.
Tanpa aturan ini kita mengerjakan hal yang sama dua kali, dan itu penyebab utama proyek
seperti ini mati di tengah.

---

## Pembuktian

### Test `core/` — diambil dari bug nyata

| Test | Bug yang ditangkap |
|---|---|
| 4 karton × `pack_size` 12 → 48 pcs, harga tetap per karton | HPP Omela 12× |
| `qty_in_unit` ada → dipakai; `null` → jatuh ke `qty` | draft WA 48 karton |
| `"2026-07-17T00:00:00.000Z"` → tanggal sah | `Invalid Date` 64× |
| batch `is_active = false` → tidak masuk stok & nilai | stok hantu 168 unit |
| nilai stok = Σ(qty × hna) per batch | selisih Rp 3,98 juta |
| produk tanpa `code` → ditolak | tombol Tambah Baru mati |

### Test paritas — senjata utama
Skrip menjalankan v1 dan v2 di atas data produksi yang sama, lalu membandingkan angkanya.
Selama identik, pemindahan tidak merusak apa pun. Untuk migrasi bertahap, paritas jauh lebih
berharga daripada test UI.

### Penanganan error
Notifikasi dibangun sekali dengan aturan tegas: selalu di lapisan teratas, error tidak hilang
sendiri sampai ditutup, tiap kegagalan simpan menyebut **apa** yang gagal. Backend berhenti
membocorkan pesan database mentah ke pengguna (audit menemukan 124 tempat).

Pelajaran 14 Agustus 2026: peringatan yang tertutup modal sama saja dengan tidak ada
peringatan — operator mengira faktur tersimpan padahal tidak.

---

## Kriteria rilis

1. Semua 6 slice pindah
2. Test paritas hijau di seluruh modul
3. **Harun memakai beta sebagai alat kerja utama selama 2 minggu**, v1 hanya cadangan
4. Dua minggu itu tanpa satu pun selisih angka
5. Baru Fivin & Ferry dipindahkan

Langkah 3 tidak bisa dilewati. Bug yang tersisa hanya muncul saat dipakai sungguhan di bawah
tekanan pekerjaan nyata.

---

## Risiko

**Terbesar: mandek di tengah.** Slice 1–2 selesai, kesibukan bisnis datang, repo berisi dua
sistem separuh jadi selamanya.
*Peredam:* `core/` dipakai v1 juga, jadi kerja yang sudah dilakukan tetap berguna meski
V2 berhenti.

**Perkiraan waktu.** Slice 1 sekitar 1–2 minggu (sekalian membangun fondasi). Faktur dan Nota
masing-masing 2–3 minggu — dua berkas itu 5.800 dan 6.000 baris berisi aturan bertahun-tahun.

**Beta menulis ke database produksi.** Diredam oleh empat pengaman di atas. Kalau pengaman
nomor 2 gagal, kerusakan bisa permanen (nota terhapus, stok terlanjur berkurang).
Karena itu pengaman dibangun **sebelum** slice 2, bukan bersamaan.

---

## Yang belum diputuskan

- Apakah `core/` jadi paket npm terpisah atau cukup folder yang di-import lewat path alias
- Cara v1 (JavaScript, CRA) mengimpor `core/` (TypeScript) — kemungkinan lewat hasil build
- Kapan `system_qty` opname (`inventory.js:763`) diperbaiki — masih lupa filter `is_active`,
  tapi jalur itu menulis penyesuaian stok

Ketiganya diputuskan saat menyusun rencana kerja Slice 1.

# 🤖 HABIL SUPERAPP — PROMPT TEMPLATE (FINAL)
# Optimized for: Gemini 2.5 Flash @ Google Antigravity
#
# PILIH SESUAI SITUASI:
# Ada error/foto → TEMPLATE CEPAT
# Task jelas     → TEMPLATE STANDAR
# Fitur baru     → TEMPLATE LENGKAP
# Sesi putus     → TEMPLATE RECOVERY

---

## ⚡ TEMPLATE CEPAT
# Buat: laporan bug dengan foto, error kecil, fix sederhana

```
Baca SUPERAPP_BRAIN.md dan CHANGELOG.md dulu.

BUG: [1 kalimat — apa yang error dan di halaman mana]
[lampirkan foto/screenshot]
JANGAN ubah apapun selain yang berhubungan langsung dengan bug ini.

Setelah fix → jalankan SHUTDOWN procedure.
```

### Contoh:
```
Baca SUPERAPP_BRAIN.md dan CHANGELOG.md dulu.

BUG: Cetak nota di halaman Invoice error "Invalid arguments passed to jsPDF.text"
[screenshot terlampir]
JANGAN ubah apapun selain yang berhubungan langsung dengan bug ini.

Setelah fix → jalankan SHUTDOWN procedure.
```

---

## 📋 TEMPLATE STANDAR
# Buat: bug yang sudah kamu tahu penyebabnya, refactor kecil, tweak UI

```
Baca SUPERAPP_BRAIN.md dan CHANGELOG.md dulu.

TYPE : [Bug / Refactor / Hotfix]
TASK : [Jelaskan apa yang mau difix/diubah — 2-3 kalimat]

SELESAI KALAU:
- [ ] [kriteria 1]
- [ ] [kriteria 2]

JANGAN ubah apapun di luar scope task ini.
Setelah selesai → jalankan SHUTDOWN procedure.
```

### Contoh:
```
Baca SUPERAPP_BRAIN.md dan CHANGELOG.md dulu.

TYPE : Bug
TASK : Tombol hapus customer tidak merespons saat diklik.
       Tidak ada error di console, tapi data tidak terhapus.
       Harusnya soft delete (is_active = false), bukan hard delete.

SELESAI KALAU:
- [ ] Dialog konfirmasi muncul sebelum hapus
- [ ] is_active = false setelah hapus, customer hilang dari list
- [ ] Tidak ada error di console

JANGAN ubah apapun di luar scope task ini.
Setelah selesai → jalankan SHUTDOWN procedure.
```

---

## 🔧 TEMPLATE LENGKAP
# Buat: fitur baru, perubahan besar, butuh schema migration

```
Baca SUPERAPP_BRAIN.md dan CHANGELOG.md dulu.

TYPE    : [Fitur / Refactor besar]
TITLE   : [Maks 10 kata]
VERSION : Lanjutkan dari versi terakhir di CHANGELOG.md

KONDISI SEKARANG:
[Apa yang terjadi saat ini]

TARGET:
[Hasil akhir yang diinginkan, spesifik]

SELESAI KALAU:
- [ ] [kriteria 1]
- [ ] [kriteria 2]
- [ ] [kriteria 3]

BATASAN:
- Kerja di branch `dev`
- Port 6543 untuk koneksi Neon
- Buat migration script jika ada schema baru — jangan ubah data existing
- Jangan hardcode kredensial, pakai process.env

Setelah semua criteria ✅ → jalankan SHUTDOWN procedure.
```

---

## 🔄 TEMPLATE RECOVERY
# Buat: sesi terpotong, agent lupa konteks, ganti model di tengah jalan

```
Sesi sebelumnya terpotong. Jangan lanjutkan apapun dulu.

Baca dulu:
- SUPERAPP_BRAIN.md → cek versi & arsitektur terakhir
- CHANGELOG.md → cek versi terakhir
- FEEDBACK_LOG.md → cek incident yang sudah dicatat

Lalu jawab:
1. Versi sistem saat ini?
2. Task terakhir yang dikerjakan apa?
3. Apakah SHUTDOWN sudah dijalankan?

Tunggu konfirmasi dari saya sebelum melanjutkan apapun.
```

---

## 📦 SHUTDOWN PROCEDURE
# Ini yang selalu disebut di setiap template di atas.
# Agent sudah tahu isinya dari SUPERAPP_BRAIN.md,
# tapi kalau perlu dieksplisitkan:

```
SHUTDOWN:
1. Catat incident/temuan baru → FEEDBACK_LOG.md
2. Update SUPERAPP_BRAIN.md jika ada perubahan arsitektur
3. Bump versi → update CHANGELOG.md → grep-replace global
   di: Login.jsx, Dashboard.jsx, index.js
4. CI=true npm run build → harus sukses (exit code 0)
5. git add -A && git commit -m "..." && git push origin dev
6. git checkout main && git merge dev && git push origin main
7. git checkout dev
8. Berikan ringkasan: apa yang berubah, file apa yang diedit
```

---

## 📌 CATATAN PENTING

| Situasi | Yang harus dilakukan |
|---|---|
| Task besar (5+ item) | Tanya Claude dulu untuk dipecah, kirim satu per satu |
| Agent self-declare selesai tapi aneh | Cek acceptance criteria satu per satu di browser |
| Sesi putus / ganti model | Pakai Template Recovery, jangan langsung "continue" |
| Mau laporin bug dengan foto | Template Cepat sudah cukup |

**Kredensial default** (jangan sampai agent tebak-tebak):
- Admin   : `admin` / `admin123`
- Direktur: `direktur` / `direktur123`

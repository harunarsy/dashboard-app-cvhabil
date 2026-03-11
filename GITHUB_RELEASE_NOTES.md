# Dashboard CV Habil v0.5.1 — Due Date, Trash, Draft & Universal Search

## ✨ New Features

### 🔍 Universal Search
Satu search bar di atas tabel — cari no. faktur, distributor, atau status sekaligus. Advanced filters sekarang collapsible, ada indikator "!" kalau ada filter aktif.

### ⏰ Due Date Reminder
- Field baru **Tanggal Jatuh Tempo** di form faktur
- Badge berwarna di list faktur: 🔴 Terlambat · 🟠 ≤ 7 hari · 🟡 ≤ 3 hari
- Alert counter di header halaman — klik langsung filter ke yang terlambat
- Auto-sort: faktur paling mendesak muncul paling atas

### 🗑️ Trash & Restore
- Delete sekarang **soft-delete** — faktur pindah ke Trash dulu
- Confirm dialog sebelum delete (anti salah klik)
- Panel Trash bisa dibuka, pilih **Restore** atau **Hapus Permanen**

### 💾 Draft Autosave
- Form faktur auto-save ke server setiap 30 detik
- Banner "Ada draft tersimpan" muncul saat buka halaman
- Klik **Lanjutkan** untuk resume sesi yang terputus

### 📊 HNA per Item
- Kolom **HNA/Item** baru di expanded view (HNA Baru ÷ QTY)
- Tampil juga di summary list sebagai **HPP/item**

## 🐛 Bug Fixes
- **Duplicate invoice number** tidak lagi error — sekarang auto-update invoice yang sudah ada dengan nomor yang sama
- Fix filter tidak reset dengan benar

## 🗄️ Database (auto-migrate)
Tidak perlu jalankan SQL manual. Saat backend start, kolom baru otomatis ditambahkan:
- `invoices`: `due_date`, `deleted_at`, `is_draft`, `draft_data`
- `invoice_items`: `hna_per_item`

## 📦 Files Changed
```
backend/routes/invoices.js   ← soft-delete, draft, due_date, upsert
frontend/src/services/api.js ← endpoint baru (trash, draft, restore)
frontend/src/components/InvoiceList.jsx ← semua fitur baru
README.md                    ← setup guide lengkap
CHANGELOG.md                 ← full history
```

## 📊 Release History
| Version | Highlights |
|---------|------------|
| **v0.5.1** | Due date, trash, draft, universal search ← **You are here** |
| v0.5.0 | MasterSelect, products database |
| v0.4.0 | Full invoice form, PPN formula, per-item calc |
| v0.3.1 | Fix distributor bug |
| v0.3.0 | Invoice Management |
| v0.2.2 | Apple HIG design |
| v0.1.0 | MVP |

🚀 **Status: Production Ready** · Release Date: March 11, 2026 · Version: 0.5.1

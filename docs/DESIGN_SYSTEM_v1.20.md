# HABIL Design System v1.20

Design system ini lahir dari pilot Customers v1.19.3, Tasks v1.19.6, dan Dashboard v1.19.7. Tujuannya bukan membuat Habil terlihat ramai, tapi membuat dashboard operasional terasa premium, cepat discan, dan aman dipakai harian.

## Direction

- Base shell: Catalyst-style operational console.
- Data pages: Tremor-style density, hierarchy angka kuat, dan panel yang mudah discan.
- Polish: Untitled-style spacing, rounded shell moderat, hover halus, dan state yang jelas.
- Light mode tetap default utama; dark mode harus solid, bukan transparan berat.

## Surface Rules

- Pakai token existing: `var(--color-bg)`, `var(--color-surface)`, `var(--color-surface-elevated)`, `var(--color-border)`, `var(--color-text)`.
- Untuk page shell, gunakan background token dan hindari gradient global baru sampai pilot berikutnya selesai.
- Untuk section penting, pakai `ui-panel` atau `ui-surface-panel`: surface, border, radius 12px, shadow ringan.
- Jangan ubah token global kalau perubahan belum terbukti di minimal 1 halaman pilot.

## Utility Classes v1.20.0

- `ui-page`: shell halaman token-driven untuk background/text transition.
- `ui-panel`: panel umum untuk section, toolbar wrapper, dan card besar.
- `ui-toolbar`: wrapper search/filter/action dengan gap dan padding konsisten.
- `ui-action-button`: tombol secondary/icon+text minimal 40px.
- `ui-density-compact`: helper untuk tabel/list padat dengan padding baris stabil.
- `ui-stat-card`: kartu angka/KPI dengan tabular nums.
- `ui-dialog-shell`: modal shell centered dengan max-height `calc(100dvh - 32px)`.

Utility ini additive. Jangan mass-replace JSX lama; pakai saat menyentuh halaman tertentu.

## Toolbar & Actions

- Header halaman harus ringkas: judul, jumlah data, CTA utama.
- Search/filter toolbar dibungkus `ui-toolbar` atau panel setara agar terasa sebagai control surface.
- CTA utama tetap primary, minimal 44px tinggi, dan tidak boleh memicu layout shift.
- Icon-only action harus minimal 40px touch target, punya aria-label, dan border halus. Jika bukan primary, gunakan pola `ui-action-button`.

## Cards & Tables

- Card list memakai hover ringan (`ui-hover-delight`) tanpa animasi masuk beruntun.
- Angka uang/jumlah harus tabular dan mudah discan.
- Metadata sekunder masuk badge kecil, bukan teks panjang.
- Untuk tabel padat, prioritas berikutnya: sticky header seperlunya, row hover non-jumpy, action kanan konsisten, dan `ui-density-compact` hanya saat tabel sudah divalidasi mobile.

## Modals & Forms

- Modal portal harus centered, body scroll lock, max-height `calc(100dvh - 32px)`, dan scroll di dalam panel.
- Label form uppercase kecil, helper/error dekat field, input pakai `ui-form-field`.
- Tombol save disabled saat saving; Escape close hanya aman ketika tidak saving.
- Mobile modal harus punya padding 16px dan tidak terpotong kanan. Gunakan `ui-dialog-shell` untuk modal baru/refactor kecil.

## Rollout Rules

- Customers, Tasks, dan Dashboard sudah menjadi pilot awal. Rollout berikutnya boleh mulai dari shell/Login/Sidebar, lalu halaman kritis paling akhir.
- Sales, Faktur, SP, dan Inventory masuk paling akhir dan harus per halaman.
- Setiap halaman theme harus punya commit sendiri, test/build hijau, dan bisa di-`git revert` tanpa menyentuh logic bisnis.
- No mass JSX sweep, no formatter-only mixed with logic, no backend/schema/PDF changes for theme work.

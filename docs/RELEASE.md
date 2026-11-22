# Checklist rilis HABIL

Jalankan saat pemilik meminta rilis. Untuk pekerjaan lokal, hentikan sebelum push.

1. `git fetch origin main`. Pastikan commit yang akan dipush berasal dari `origin/main` dan tidak menyertakan pekerjaan lokal di luar scope. Jangan force-push.
2. Jadikan judul stabil pertama `CHANGELOG.md` sebagai sumber versi. Untuk hotfix, naikkan patch. Sinkronkan Login, Sidebar, `Dashboard.jsx` (`RELEASES[0]` dan `status: "latest"`), `frontend/src/index.js`, `SUPERAPP_BRAIN.md`, dan README. Jalankan `node scripts/check-version-consistency.mjs`.
3. Jalankan tes frontend/backend dan build frontend. Commit hanya berkas pekerjaan ini. Push ke `main`, lalu cocokkan SHA lokal dengan `refs/heads/main` di remote.
4. Verifikasi workflow `CI` sukses untuk SHA itu (`gh run list --workflow CI --commit <SHA>`). Jangan publish rilis baru saat CI gagal atau belum selesai.
5. Periksa apakah tag dan Release sudah ada. Untuk rilis baru, buat tag anotasi sesuai judul changelog pada SHA yang sudah lolos CI, push tag itu, lalu jalankan `gh release create <tag> --verify-tag --title <tag> --notes-file <catatan> --latest`. Catatan hanya berisi bagian changelog untuk versi itu. Jangan pindahkan atau menimpa tag yang sudah ada.
6. Verifikasi SHA tag (`git ls-remote --tags origin "refs/tags/<tag>^{}"`), metadata/URL Release (`gh release view <tag> --json tagName,url,isDraft,isPrerelease`), serta status deploy jika bisa diperiksa. Tulis hasil aktual di `ACTION_LOG.md`; bedakan commit lokal, push, CI, Release, dan deploy.

Backfill rilis historis: tag harus menunjuk commit historis yang sesuai. Jangan tandai Latest. Jika commit lama tidak lolos CI, jelaskan itu di catatan dan gunakan `--prerelease --latest=false`, bukan rilis stabil yang direkomendasikan.

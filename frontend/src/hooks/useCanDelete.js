import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

// v1.67.24: peran yang boleh menghapus data — selaras dengan roleGuard di backend
// (`roleGuard('direktur','admin')`). Backend tetap penjaga sebenarnya (403).
const DELETE_ROLES = ["direktur", "admin"];

/**
 * Apakah user saat ini boleh melakukan tindakan destruktif (hapus).
 * Fail-open: bila peran tidak diketahui (mis. komponen dirender tanpa provider di
 * test), tombol tetap tampil — backend yang menolak.
 */
export default function useCanDelete() {
  const ctx = useContext(AuthContext);
  const role = ctx?.user?.role;
  if (!role) return true;
  return DELETE_ROLES.includes(String(role).toLowerCase());
}

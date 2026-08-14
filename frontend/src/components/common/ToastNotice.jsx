import React from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle, Info } from "lucide-react";
import { UI_ZINDEX } from "../../constants/ui";

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

export default function ToastNotice({ message, type = "success", isMobile = false }) {
  if (!message) return null;
  const Icon = ICONS[type] || Info;

  // v1.66.1: WAJIB lewat portal ke document.body. Modal besar (Faktur, Nota, SP)
  // dipindah ke body lewat createPortal juga; kalau toast tetap tinggal di dalam
  // wadah halaman, dia kalah stacking dan pesan errornya tertutup modal tanpa
  // disadari operator. zIndex dipaksa dari token supaya tidak bisa terseri lagi.
  return createPortal(
    <div
      role={type === "error" ? "alert" : "status"}
      className="ui-toast-notice ui-motion-toast"
      data-type={type}
      data-mobile={isMobile ? "true" : "false"}
      style={{ zIndex: UI_ZINDEX.toast }}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>,
    document.body,
  );
}

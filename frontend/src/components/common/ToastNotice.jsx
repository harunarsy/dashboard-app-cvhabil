import React from "react";
import { AlertCircle, CheckCircle, Info } from "lucide-react";

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

export default function ToastNotice({ message, type = "success", isMobile = false }) {
  if (!message) return null;
  const Icon = ICONS[type] || Info;

  return (
    <div
      role="status"
      className="ui-toast-notice ui-motion-toast"
      data-type={type}
      data-mobile={isMobile ? "true" : "false"}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

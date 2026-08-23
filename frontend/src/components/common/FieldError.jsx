import React from "react";
import { AlertCircle } from "lucide-react";

export default function FieldError({ id, message, visible = true }) {
  return (
    <div
      id={id}
      role="alert"
      className="ui-field-error"
      data-visible={visible && message ? "true" : "false"}
      aria-hidden={visible && message ? "false" : "true"}
    >
      <AlertCircle size={14} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

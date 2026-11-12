"use client";
export function studioAlert({ title, message, warning = false, tone }) {
  window.dispatchEvent(new CustomEvent("studio-notice", { detail: { message: message || title, type: warning ? "error" : tone === "deleted" ? "delete" : "success" } }));
}

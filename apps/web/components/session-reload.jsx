"use client";
import { useEffect } from "react";

const sessionChangeKey = "imajilearn-session-change";

export function announceSessionChange() {
  try {
    localStorage.setItem(sessionChangeKey, `${Date.now()}:${Math.random()}`);
  } catch {
    // Full navigation still revalidates this tab when browser storage is unavailable.
  }
}

export function navigateAfterSessionChange(path) {
  announceSessionChange();
  window.location.replace(path);
}

export default function SessionReload() {
  useEffect(() => {
    function onStorage(event) {
      if (event.key === sessionChangeKey) window.location.reload();
    }
    function onPageShow(event) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
  return null;
}

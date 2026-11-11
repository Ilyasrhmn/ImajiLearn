"use client";
import { useEffect } from "react";
import { completeGoogleSession } from "../lib/google-session.mjs";

import { announceSessionChange, sessionChangeKey } from "@imajilearn/shared/lib/session.mjs";
export { announceSessionChange, navigateAfterSessionChange } from "@imajilearn/shared/lib/session.mjs";

export default function SessionReload() {
  useEffect(() => {
    completeGoogleSession(window.location, window.history, announceSessionChange);
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

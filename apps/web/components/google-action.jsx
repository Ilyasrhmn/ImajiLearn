"use client";
import { useEffect, useRef, useState } from "react";
import { requestGoogleAuthorization } from "../lib/google-auth-client.mjs";
import { navigateAfterSessionChange } from "./session-reload";
import "./google-action.css";

export function useGoogleAuthorization(teacherId) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    function restore(event) {
      if (event.persisted) { submitting.current = false; setPending(false); }
    }
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  async function start(currentPassword) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const result = await requestGoogleAuthorization({ teacherId, currentPassword });
      if (result.sessionExpired) { navigateAfterSessionChange("/masuk"); return; }
      if (result.accountChanged) { window.location.reload(); return; }
      window.location.assign(result.url);
    } catch (failure) {
      setError(failure.message);
      submitting.current = false;
      setPending(false);
    }
  }
  return { pending, error, start, clearError: () => setError("") };
}

export { default } from "@imajilearn/shared/components/google-action.jsx";

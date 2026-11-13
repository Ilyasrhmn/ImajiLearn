"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export default function NarrationButton({ title, paragraphs, label, unavailable }) {
  const current = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");

  function cancel() {
    if (!current.current) return;
    current.current = null;
    window.speechSynthesis.cancel();
  }

  useEffect(() => cancel, []);

  function toggle() {
    setError("");
    if (current.current) {
      cancel();
      setSpeaking(false);
      return;
    }
    const synthesis = window.speechSynthesis;
    if (!synthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      setError(unavailable);
      return;
    }

    const narration = [title, ...paragraphs].map(text => {
      const sentence = text.trim();
      return /[.!?\u2026]$/.test(sentence) ? sentence : `${sentence}.`;
    }).join("\n\n");
    const utterance = new window.SpeechSynthesisUtterance(narration);
    utterance.lang = "id-ID";
    const voice = synthesis.getVoices().find(item => /^id(?:[-_]|$)/i.test(item.lang));
    if (voice) utterance.voice = voice;
    const finish = message => {
      if (current.current !== utterance) return;
      current.current = null;
      setSpeaking(false);
      if (message) setError(message);
    };
    utterance.onend = () => finish();
    utterance.onerror = () => finish("Suara belum bisa diputar. Coba lagi.");
    current.current = utterance;
    setSpeaking(true);
    try { synthesis.speak(utterance); }
    catch { finish("Suara belum bisa diputar. Coba lagi."); }
  }

  return <div className="material-narration">
    <button type="button" className="source-secondary" onClick={toggle}>
      {speaking ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      {speaking ? "Hentikan suara" : label}
    </button>
    {error && <p className="source-error" role="alert">{error}</p>}
  </div>;
}

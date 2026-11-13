export function isTemporaryAIError(error) {
  return (error.status === 503 && ["PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE"].includes(error.code)) ||
    (error.status === 429 && error.code === "RATE_LIMITED") || (!error.code && [502, 504].includes(error.status));
}

export function waitForAI(signal, seconds = 5) {
  signal?.throwIfAborted();
  const milliseconds = Math.min(60, Math.max(1, Number.isFinite(seconds) ? seconds : 5)) * 1000;
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

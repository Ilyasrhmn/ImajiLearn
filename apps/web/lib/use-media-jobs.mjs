"use client";
import { useSyncExternalStore } from "react";
import { mediaJobs, emptyMediaJobs } from "@imajilearn/shared/lib/media-jobs.mjs";

export function useMediaJobs() {
  return useSyncExternalStore(mediaJobs.subscribe, mediaJobs.getSnapshot, () => emptyMediaJobs);
}

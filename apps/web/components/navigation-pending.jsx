"use client";
import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
export default function NavigationPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="navigation-pending" role="status" aria-label="Membuka hasil"><LoaderCircle size={32} aria-hidden="true" /><span>Membuka hasil…</span></span> : null;
}

"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();
  return <button type="button" className="logout" aria-label="Keluar" title="Keluar" onClick={() => router.replace("/masuk")}><LogOut size={20} aria-hidden="true" /></button>;
}

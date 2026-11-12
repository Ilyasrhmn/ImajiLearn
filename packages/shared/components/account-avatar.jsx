"use client";
import { useState } from "react";
import Image from "next/image";
import { googleAvatarUrl } from "../lib/google-avatar.mjs";

export default function AccountAvatar({ name = "", avatarUrl, size = 36, className = "" }) {
  const [failed, setFailed] = useState(null);
  const picture = googleAvatarUrl(avatarUrl);
  return <span className={`account-avatar ${className}`} aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * .42) }}>
    {picture && failed !== picture ? <Image src={picture} alt="" width={size} height={size} unoptimized referrerPolicy="no-referrer" onError={() => setFailed(picture)} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : name.trim().slice(0, 1).toLocaleUpperCase("id") || "?"}
  </span>;
}

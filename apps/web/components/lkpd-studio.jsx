"use client";
import Studio from "@imajilearn/shared/components/lkpd-studio.jsx";
import { LkpdWebFrame } from "./document-studio-frame";
export default function LkpdStudio({ teacherId }) { return <Studio teacherId={teacherId} Frame={LkpdWebFrame} />; }

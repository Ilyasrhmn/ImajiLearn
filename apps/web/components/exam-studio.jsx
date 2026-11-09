"use client";
import Studio from "@imajilearn/shared/components/exam-studio.jsx";
import { ExamWebFrame } from "./document-studio-frame";
export default function ExamStudio({ teacherId }) { return <Studio teacherId={teacherId} Frame={ExamWebFrame} />; }

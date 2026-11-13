import { Suspense } from "react";
import LessonDemo from "./lesson-demo";

export const metadata = { title: "Demo fotosintesis | ImajiLearn" };

export default function DemoPage() {
  return <Suspense fallback={<main aria-busy="true" />}><LessonDemo /></Suspense>;
}

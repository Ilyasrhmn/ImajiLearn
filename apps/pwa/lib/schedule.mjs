import { studioRequest } from "@imajilearn/shared/lib/studio-api.mjs";
export const weekdays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export function currentTerm(date = new Date()) { return { year: date.getMonth() < 6 ? date.getFullYear() - 1 : date.getFullYear(), semester: date.getMonth() < 6 ? "2" : "1" }; }
export const readSchedule = (teacherId, year, semester, signal) => studioRequest(teacherId, `/schedule?${new URLSearchParams({ year, semester })}`, { signal });
export function nextLesson(entries, date = new Date()) {
  const today = date.getDay(), minutes = date.getHours() * 60 + date.getMinutes();
  return entries.filter(slot => slot.day >= today && today !== 0 && (slot.day !== today || Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3)) > minutes)).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))[0] || null;
}

export function teacherStorageKey(teacherId, name) {
  if (typeof teacherId !== "string" || !teacherId) throw new Error("Akun guru belum tersedia.");
  return `${name}:${encodeURIComponent(teacherId)}`;
}

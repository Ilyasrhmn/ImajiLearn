import { ApiError } from "../../core/errors.mjs";
import { getOwnedMaterial } from "../../materials/readers.mjs";
import { createWorksheetRepository } from "./repository.mjs";
import { createWorksheetService } from "./service.mjs";

// Internal B2 storage boundary. The caller supplies approved content and its
// server source revision. Job/provider/layout execution is outside this module.
// No public create endpoint exposes this command or accepts a profile snapshot.
export function createWorksheetStorage({ database, requireTeacher }) {
  if (typeof database?.$transaction !== "function" || typeof requireTeacher !== "function") {
    throw new TypeError("Worksheet storage requires the shared database and core teacher authentication.");
  }
  return Object.freeze({
    async storeDocument(request, command, expectedSourceRevision) {
      const teacher = await requireTeacher(request);
      if (!teacher?.id) throw new ApiError(401, "SESSION_REQUIRED", "Masuk untuk melanjutkan.");
      const repository = createWorksheetRepository({ database, getOwnedMaterial,
        // requireTeacher reads the current profile from core sessions. Capture it
        // once for this new document; later profile changes never rewrite it.
        getTeacherProfile: async () => ({ grade: teacher.grade }),
      });
      return createWorksheetService({ repository, requireTeacher: async () => teacher })
        .storeDocument(request, command, expectedSourceRevision);
    },
  });
}

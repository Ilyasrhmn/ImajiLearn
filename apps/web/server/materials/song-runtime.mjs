import { createSessionHandlers } from "../accounts/sessions.mjs";
import { generateJson } from "../ai/index.mjs";
import { createTrebloMusic } from "../ai/providers/treblo.mjs";
import { sessionConfig } from "../core/config.mjs";
import { database } from "../core/database.mjs";
import { endpoint } from "../core/http.mjs";
import { createMaterialSongs } from "./songs.mjs";
import { songAudioResponse } from "./song-audio.mjs";

export function songRoute(action) {
  return (request, context) => endpoint(async () => {
    const db = database();
    const teacher = await createSessionHandlers(db, sessionConfig()).requireTeacher(request);
    const { materialId } = await context.params;
    // Existing saved audio remains available even if the provider key is removed.
    let provider;
    const musicProvider = () => provider ??= createTrebloMusic();
    const music = {
      validate: () => { musicProvider(); },
      describe: () => musicProvider().describe(),
      create: input => musicProvider().create(input),
      retrieve: id => musicProvider().retrieve(id),
      download: url => musicProvider().download(url),
    };
    const service = createMaterialSongs(db, generateJson, music);
    if (action === "audio") {
      const asset = await service.audio(teacher.id, materialId, new URL(request.url).searchParams.get("revision"));
      return songAudioResponse(request, asset);
    }
    const data = await service[action](teacher.id, materialId);
    return Response.json({ data }, { status: action === "start" && data.status !== "ready" ? 202 : 200 });
  }, process.env.APP_ORIGIN)(request);
}

import { createSessionHandlers } from "../accounts/sessions.mjs";
import { generateJson } from "../ai/index.mjs";
import { createKieMusic } from "../ai/providers/kie-music.mjs";
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
    const musicProvider = () => provider ??= createKieMusic();
    const music = {
      validate: () => { musicProvider(); },
      describe: () => musicProvider().describe(),
      create: input => musicProvider().create(input),
      retrieve: (id, audioId) => musicProvider().retrieve(id, audioId),
      align: (task, audio) => musicProvider().align(task, audio),
      download: url => musicProvider().download(url),
    };
    const service = createMaterialSongs(db, generateJson, music);
    if (action === "audio") {
      const query = new URL(request.url).searchParams;
      const asset = await service.audio(teacher.id, materialId, query.get("revision"), query.get("version"));
      return songAudioResponse(request, asset);
    }
    const data = await service[action](teacher.id, materialId);
    return Response.json({ data }, { status: action === "start" && data.status !== "ready" ? 202 : 200 });
  }, process.env.APP_ORIGIN)(request);
}

import { formats } from "../components/material-formats.mjs";

const routes = { reading: "/bacaan", slides: "/slide", song: "/lagu", mindmap: "/visual" };

export function mediaStudio(feature) {
  const format = formats.find(item => item.id === feature);
  return format ? { ...format, route: routes[feature] } : null;
}

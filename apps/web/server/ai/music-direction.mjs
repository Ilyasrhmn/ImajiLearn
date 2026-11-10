export const musicPromptVersion = 7;

// Vocabulary verified against https://treblo.com/styles (v3 only).
const avoidedStyleTags = Object.freeze(["indian pop"]);

export const musicPrompt = [
  "Joyful, energetic children's pop sung entirely in Bahasa Indonesia, around 120 bpm. A full, lively band arrangement that invites elementary-school children to sing and clap along.",
  "A warm bouncing bass line and a crisp kick, snare, hi-hat and handclap groove carry the song throughout. Rhythmic acoustic guitar strums and bouncy piano chords fill out the harmony; bright bell-like or keyboard motifs answer between vocal phrases. Keep the accompaniment moving when the singer pauses.",
  "Build into a fuller, catchy repeating chorus with rhythmic accents and light unison vocal doubles on the supplied hook. Use short fills to connect sections, varying the texture without losing momentum. Keep the sung words intelligible over the full arrangement.",
  "Warm, clear female lead with a youthful, smiling, enthusiastic delivery and a naturally resonant tone. Sing Indonesian sentences as connected expressive phrases: natural word linking, varied stress and phrase endings, comfortable breaths, and open sustained vowels. Let melody fit the words without chopping them into separate syllables or rushing phrase endings.",
  "For a supplied question-and-answer bridge, leave two bars of instrumental response space after the question or invitation before singing the answer. Keep the groove alive underneath. Otherwise invite participation through the supplied hook and rhythm.",
  "Short bright instrumental intro and a joyful resolved outro. Sing only the supplied lyrics in their original order, preserving every learning fact. Arrangement directions are not sung words.",
].join(" ");

export function musicStyle(model) {
  // Treblo rejects tags + lyrics + prompt together; style is carried by the prompt.
  return { styleTags: [], avoidedStyleTags: model === "v3" ? [...avoidedStyleTags] : [] };
}

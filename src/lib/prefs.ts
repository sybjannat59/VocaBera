/** Runtime preferences shared by non-React code (speech, sounds, haptics). Kept in sync by SettingsProvider. */
export const prefs = {
  lang: "en-US" as "en-US" | "en-GB",
  rate: 0.95,
  pitch: 1,
  sound: true,
  haptics: true,
  /** natural = real recordings + best device voice · studio = on-device AI voice · device = device voice only */
  engine: "natural" as "natural" | "studio" | "device",
  recordings: true,
  voiceURI: "",
  studioVoice: "af_heart",
};

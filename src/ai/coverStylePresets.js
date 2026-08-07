export const COVER_STYLE_PRESETS = [
  {
    key: "default",
    label: "Default",
    promptFragment: "",
  },
  {
    key: "photorealistic",
    label: "Photorealistic",
    promptFragment:
      "Style: realistic photography — real camera lighting, convincing skin/fabric texture, natural depth of field, nothing that looks like 3D rendering or digital painting.",
  },
  {
    key: "digital_illustration",
    label: "Digital illustration",
    promptFragment:
      "Style: digital illustration / concept art — visible brushwork and character-art shading, stylized but detailed, not photorealistic.",
  },
  {
    key: "classic_painting",
    label: "Classic painting",
    promptFragment:
      "Style: classic oil/gouache painting — rich painterly texture, traditional composition and color mixing, museum key-art feel.",
  },
  {
    key: "anime",
    label: "Anime",
    promptFragment:
      "Style: Japanese anime/manga — clean linework, stylized eyes, vibrant colors, typical flat cel shading.",
  },
  {
    key: "minimal_typographic",
    label: "Minimal / typographic",
    promptFragment:
      "Style: minimalist book-cover art — a small number of bold flat shapes or a single striking symbolic image, large areas of negative space, restrained color palette, composition built to work as a backdrop for large typography.",
  },
  {
    key: "cinematic_poster",
    label: "Cinematic poster",
    promptFragment:
      "Style: cinematic key-art poster — dramatic two-tone lighting contrast, bold vector-clean illustration with crisp edges and flat-shaded gradients, high-impact poster composition, graphic-novel finish rather than painterly texture.",
  },
];

export function coverStylePromptFragment(key) {
  return COVER_STYLE_PRESETS.find((p) => p.key === key)?.promptFragment || "";
}

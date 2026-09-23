import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "VocaBera — Smart Vocabulary Builder",
    short_name: "VocaBera",
    description: "Learn English vocabulary with Bangla meanings, smart AI auto-fill, adaptive quizzes, flashcards and spaced repetition.",
    lang: "en",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f4f6fc",
    theme_color: "#6366f1",
    categories: ["education", "productivity", "books"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/icons/monochrome.svg", sizes: "any", type: "image/svg+xml", purpose: "monochrome" },
      { src: "/pwa-icon/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add word", short_name: "Add", url: "/add", icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Smart quiz", short_name: "Quiz", url: "/quiz", icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Flashcards", short_name: "Cards", url: "/flashcards", icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "All words", short_name: "Words", url: "/words", icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" }] },
    ],
  };
}

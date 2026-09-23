import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "VocaBera — Smart Vocabulary Builder",
    short_name: "VocaBera",
    description:
      "Learn English vocabulary with Bangla meanings, AI auto-fill, adaptive quizzes, flashcards and spaced repetition. Works offline.",
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f4f6fc",
    theme_color: "#f4f6fc",
    categories: ["education", "productivity", "books"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Add a word",
        short_name: "Add word",
        description: "Add a new word to your list",
        url: "/add",
        icons: [{ src: "/icons/shortcut-add.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Smart quiz",
        short_name: "Quiz",
        description: "Start an adaptive quiz",
        url: "/quiz",
        icons: [{ src: "/icons/shortcut-quiz.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Flashcards",
        short_name: "Cards",
        description: "Flip and swipe your flashcards",
        url: "/flashcards",
        icons: [{ src: "/icons/shortcut-cards.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Review due words",
        short_name: "Review",
        description: "Review words that are due today",
        url: "/flashcards?deck=due",
        icons: [{ src: "/icons/shortcut-review.png", sizes: "96x96", type: "image/png" }],
      },
    ],
    screenshots: [
      {
        src: "/screenshots/mobile-home.jpg",
        sizes: "780x1688",
        type: "image/jpeg",
        form_factor: "narrow",
        label: "Home — word of the day, daily goal and streak",
      },
      {
        src: "/screenshots/mobile-quiz.jpg",
        sizes: "780x1688",
        type: "image/jpeg",
        form_factor: "narrow",
        label: "Smart adaptive quiz",
      },
      {
        src: "/screenshots/desktop-home.jpg",
        sizes: "1440x900",
        type: "image/jpeg",
        form_factor: "wide",
        label: "VocaBera on a laptop",
      },
    ],
  };
}

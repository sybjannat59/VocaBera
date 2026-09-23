"use client";

import { CloudOff, House, Layers, RefreshCw } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";

export default function OfflinePage() {
  return (
    <EmptyState
      icon={CloudOff}
      tone="amber"
      title="You're offline"
      text="This page isn't saved for offline use yet. Your saved words, flashcards and quizzes still work — progress syncs when you reconnect."
    >
      <Button
        icon={RefreshCw}
        onClick={() => {
          const from = new URLSearchParams(window.location.search).get("from");
          window.location.href = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
        }}
      >
        Try again
      </Button>
      {/* Plain links force a full navigation, which the service worker serves from its cache. */}
      <a href="/">
        <Button variant="secondary" icon={House}>
          Home
        </Button>
      </a>
      <a href="/flashcards">
        <Button variant="secondary" icon={Layers}>
          Flashcards
        </Button>
      </a>
    </EmptyState>
  );
}

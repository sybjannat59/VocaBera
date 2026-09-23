"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-lg pt-6">
      <EmptyState
        icon={WifiOff}
        tone="slate"
        title="You're offline"
        text="This page hasn't been saved for offline use yet. Your saved words, flashcards and quizzes still work from the pages you've opened before."
      >
        <Button icon={RefreshCw} onClick={() => window.location.reload()}>
          Try again
        </Button>
        <Link href="/">
          <Button variant="secondary">Go home</Button>
        </Link>
      </EmptyState>
    </div>
  );
}

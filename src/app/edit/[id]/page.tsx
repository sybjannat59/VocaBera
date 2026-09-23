"use client";

import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { WordForm } from "@/components/word-form";
import { Button, EmptyState, PageSkeleton } from "@/components/ui";
import { useVocab } from "@/lib/store";

export default function EditWordPage() {
  const params = useParams<{ id: string }>();
  const { words, status } = useVocab();
  const id = Number(params?.id);
  const word = words.find((w) => w.id === id);

  if (status === "loading") return <PageSkeleton />;
  if (!word)
    return (
      <EmptyState icon={SearchX} tone="slate" title="Word not found" text="It may have been deleted.">
        <Link href="/words">
          <Button icon={ArrowLeft}>Back to words</Button>
        </Link>
      </EmptyState>
    );
  return <WordForm key={word.id} initial={word} />;
}

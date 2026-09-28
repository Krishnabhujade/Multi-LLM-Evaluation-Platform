import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        This evaluation doesn&apos;t exist, or the link is incomplete.
      </p>
      <Button asChild>
        <Link href="/">Start a new evaluation</Link>
      </Button>
    </main>
  );
}

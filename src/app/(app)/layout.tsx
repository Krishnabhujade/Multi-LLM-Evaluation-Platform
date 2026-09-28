import { AppHeader } from "@/components/layout/app-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>Multi-LLM Evaluation Platform</span>
          <span>
            Scores come from an LLM judge and reflect this platform&apos;s rubric, not universal
            model quality.
          </span>
        </div>
      </footer>
    </>
  );
}

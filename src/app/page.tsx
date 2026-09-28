export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 px-6 py-24">
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
        Multi-LLM Evaluation Platform
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Enter one prompt → compare multiple AI models → find the strongest response.
      </h1>
      <p className="text-muted-foreground">The evaluation workspace is under construction.</p>
    </main>
  );
}

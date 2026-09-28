import { Database, FlaskConical } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function DatabaseSetupNotice() {
  return (
    <Alert>
      <Database aria-hidden />
      <AlertTitle>Database not configured</AlertTitle>
      <AlertDescription>
        Add a PostgreSQL connection string as <code className="font-mono">DATABASE_URL</code> in{" "}
        <code className="font-mono">.env</code>, then run{" "}
        <code className="font-mono">npm run db:deploy</code> and{" "}
        <code className="font-mono">npm run db:seed</code>. Evaluations are stored so they can be
        revisited.
      </AlertDescription>
    </Alert>
  );
}

export function DemoModeNotice() {
  return (
    <Alert>
      <FlaskConical aria-hidden />
      <AlertTitle>Demo mode</AlertTitle>
      <AlertDescription>
        No provider API keys are configured, so only the demo models (synthetic development data)
        are available. Add a Groq, Gemini, OpenRouter or Hugging Face key to{" "}
        <code className="font-mono">.env</code> to evaluate real models.
      </AlertDescription>
    </Alert>
  );
}

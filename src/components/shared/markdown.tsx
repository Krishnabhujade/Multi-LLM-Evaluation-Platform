import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders model output as GitHub-flavoured markdown. Raw HTML is never rendered and unsafe URLs
 * are stripped (react-markdown defaults), so model output cannot inject markup or scripts.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none break-words dark:prose-invert",
        "prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:border prose-pre:bg-muted prose-pre:text-foreground",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
        "prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-viz-accent",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

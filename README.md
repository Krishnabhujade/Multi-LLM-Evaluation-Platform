# Multi-LLM Evaluation Platform

Enter one prompt → compare multiple AI models → find the strongest response.

The platform sends a prompt to several LLMs in parallel, scores every response with a blind
LLM-as-a-judge on weighted criteria, and presents the winner alongside a transparent comparison.

> 🚧 Work in progress — full documentation (architecture, evaluation methodology, deployment)
> lands with the final phase.

## Quick start

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and at least one provider key
npm run dev
```

## Scripts

| Script              | Purpose                      |
| ------------------- | ---------------------------- |
| `npm run dev`       | Start the dev server         |
| `npm run build`     | Production build             |
| `npm run lint`      | ESLint                       |
| `npm run typecheck` | Generate route types + `tsc` |
| `npm test`          | Unit and integration tests   |
| `npm run check`     | Lint + typecheck + tests     |

# Multi-LLM Evaluation Platform

Enter one prompt → compare multiple AI models → find the strongest response.

The platform sends a prompt to several LLMs in parallel, scores every response with a blind
LLM-as-a-judge on weighted criteria, and presents the winner alongside a transparent comparison.

> 🚧 Work in progress. The MVP (prompt → parallel models → blind judge → weighted scores →
> winner → comparison UI) is complete. Full documentation (architecture diagrams, evaluation
> methodology, deployment) lands with the final phase.

## Quick start

Requirements: Node.js 20.19+ (22 recommended) and a PostgreSQL database (a free
[Neon](https://neon.tech) project works well).

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then fill in the values below
npm run db:deploy           # apply migrations
npm run db:seed             # providers, models and built-in criteria
npm run dev                 # http://localhost:3000
```

Minimum `.env`:

| Variable                                                                      | Purpose                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`                                                                | Postgres connection string (Neon: the pooled URL)            |
| `DIRECT_DATABASE_URL`                                                         | Direct (non-pooled) URL used by migrations; optional locally |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY` | Any subset — a provider appears once its key is set          |

Every variable is documented in [`.env.example`](.env.example). Keys are read only on the server
and are never sent to the browser or logged.

**No keys yet?** Development mode enables demo models (clearly labelled synthetic data): concise,
verbose, a "flaky" model that returns 429 and recovers on retry, and a "slow" model that times
out — enough to exercise the whole pipeline, including failure handling.

**No hosted database?** `npx prisma dev` starts a local Postgres without Docker. It serves one
connection at a time, so also set `DATABASE_POOL_MAX=1`.

## Try it from the terminal

```bash
npm run llm:smoke -- groq:llama-3.1-8b-instant "Say hello in five words"
npm run eval -- "Explain how DNS works" groq:llama-3.3-70b-versatile gemini:gemini-3.8-flash
```

## API

| Method | Path                            | Purpose                                                      |
| ------ | ------------------------------- | ------------------------------------------------------------ |
| `POST` | `/api/evaluations`              | Create an evaluation (returns its id)                        |
| `POST` | `/api/evaluations/:id/run`      | Run it, streaming progress as Server-Sent Events             |
| `GET`  | `/api/evaluations/:id`          | Full result: responses, criterion scores, winner, call trace |
| `POST` | `/api/evaluate`                 | Create and run synchronously; returns the full result        |
| `GET`  | `/api/models`, `/api/providers` | Available models and provider status                         |

## Scripts

| Script                                                       | Purpose                             |
| ------------------------------------------------------------ | ----------------------------------- |
| `npm run dev`                                                | Start the dev server                |
| `npm run build`                                              | Production build                    |
| `npm run lint`                                               | ESLint                              |
| `npm run typecheck`                                          | Generate route types + `tsc`        |
| `npm test`                                                   | Unit and integration tests (Vitest) |
| `npm run check`                                              | Lint + typecheck + tests            |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma workflows                    |

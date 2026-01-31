# AGENTS.md - Guide for Agentic Coding Assistants

This repo is a Vite + React + TypeScript app with optional Electron/Tauri/Bun builds.
Use this file as the operational guide for automated agents.

## Install & Run

```bash
npm install
npm run dev            # Vite dev server
npm run build          # Production build
npm run preview        # Preview build
```

### Bun (optional runtime)

```bash
bun install
bun run bun:dev
bun run bun:build
bun run bun:preview
```

### Desktop Builds

```bash
npm run electron:dev
npm run electron:build
npm run electron:build:win
npm run electron:build:mac

npm run tauri:dev
npm run tauri:build
```

## Lint / Typecheck / Tests

- Linting: not configured.
- Unit/integration tests: not configured.
- Typecheck: `npx tsc --noEmit` (uses `tsconfig.json` with strict mode).

Single-test command: none (no test runner configured).

## Tech Stack Snapshot

- React 19, TypeScript 5.8, Vite 6
- Optional Electron + Tauri
- Firebase/Firestore integrations
- AI providers: Google GenAI, OpenAI, Anthropic, custom endpoints

## Code Style Guidelines

### TypeScript

- Strict mode is enabled; keep code type-safe.
- Avoid `any` unless there is no alternative.
- Prefer `interface` for object shapes; avoid `I` prefixes.
- Use `Record<string, T>` for maps and indexed objects.
- Keep shared interfaces in `src/types.ts`.
- Add explicit types for public function params/returns.

### React

- Functional components only.
- Use hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`).
- Keep components focused and single-purpose.
- Memoize handlers passed to children with `useCallback`.
- Memoize expensive derived data with `useMemo`.

### Imports

- Group imports: React first, third-party next, local last.
- Use namespace imports for services: `import * as X from '../services/x'`.
- Prefer importing shared types from `src/types.ts`.

```ts
import React, { useEffect, useState } from 'react';
import { Icon } from 'lucide-react';
import { SynthLogItem } from '../types';
import * as sessionService from '../services/sessionService';
```

### Naming

- Components: PascalCase (`VerifierPanel.tsx`).
- Types/Interfaces: PascalCase (`SynthLogItem`).
- Services: camelCase exports inside `services/`.
- Constants: UPPER_SNAKE_CASE.
- Variables/functions: camelCase.
- State setters: `set` + name (`setIsLoading`).

### Error Handling & Logging

- Always guard async calls with `try/catch`.
- Log errors via `logger.error()` from `utils/logger`.
- Use `logger.warn()`/`logger.log()` only in verbose paths.
- UI should show user-friendly error messages.
- Track errors in `isError` + `error` fields where applicable.

### API Calls / Retries

- Business logic lives in `src/services/`.
- AI provider calls must include retry with exponential backoff.

```ts
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    return await apiCall();
  } catch (error: any) {
    const isRateLimit = error?.status === 429;
    if (isRateLimit && attempt < maxRetries) {
      const backoff = retryDelay * Math.pow(2, attempt);
      await sleep(backoff);
      continue;
    }
    throw error;
  }
}
```

### Formatting

- Follow existing project patterns; no automated formatter configured.
- Keep JSX readable and prefer small helpers over deeply nested ternaries.
- Avoid large inlined objects in JSX; extract constants when reused.

### App Structure

- Keep `src/App.tsx` thin.
- Compose: `AppHeader`, `AppMainContent`, `AppOverlays`.
- Use `useAppViewProps` (or a similar hook) to bundle typed props.
- Prefer new UI blocks in `src/components/panels/`.
- Prefer layout wrappers in `src/components/layout/`.

### File Organization

```
src/
├── components/       # UI components
│   ├── layout/       # App-level layout
│   ├── panels/       # Sidebar and form panels
├── services/         # Business logic + API integrations
├── utils/            # Helpers + logger
├── types.ts          # Shared interfaces
├── constants.ts      # Constants and configs
├── App.tsx           # Main app
└── index.tsx         # Entry
```

## Reasoning Format (SYNTH)

When handling reasoning traces, preserve the stenographic symbols:

- `→` Derives/Implies
- `↺` Loop/Correction
- `∴` Conclusion
- `●` Ground Truth
- `◐` Inference
- `○` Speculation
- `!` Insight
- `※` Constraint/Trap
- `?` Ambiguity
- `⚠` Risk/Warning
- `<H≈X.X>` Entropy marker

## JSON Output Expectations

- AI responses should be valid JSON objects.
- Common shape: `{ "query": "...", "reasoning": "...", "answer": "..." }`.
- Use `cleanAndParseJSON()` for markdown-wrapped JSON.

## Env Vars

Use `.env.local` and never commit secrets.
Required keys (Vite prefixes):

- `VITE_GEMINI_API_KEY`
- `VITE_OPENAI_API_KEY`
- `VITE_ANTHROPIC_API_KEY`

## Security & Safety

- Never hardcode API keys or secrets.
- Validate and sanitize user inputs.
- Rate-limit provider calls to protect quotas.
- Use Firebase security rules in production.

## Comments & Docs

- Comment complex or non-obvious logic.
- Use JSDoc for exported functions where useful.
- Keep inline comments concise.

## Prompt Sets

Custom prompts live in `prompts/<set_name>/`:

```
prompts/
  <set_name>/
    generator/system.txt
    generator/meta.txt
    converter/writer.txt
    verifier/query_rewrite.txt
```

The app auto-discovers prompt sets; missing roles fall back to `default`.

## Repo Policy Notes

- No Cursor or Copilot instruction files are present in this repo.

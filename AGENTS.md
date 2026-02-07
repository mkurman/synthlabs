# AGENTS.md - Guide for Agentic Coding Assistants

This repo is a Vite + React + TypeScript app with optional Electron/Bun builds.
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

```

## Lint / Typecheck / Tests

- Linting: not configured.
- Unit/integration tests: not configured.
- Typecheck: `npx tsc --noEmit` (uses `tsconfig.json` with strict mode).

Single-test command: none (no test runner configured).

## Tech Stack Snapshot

- React 19, TypeScript 5.8, Vite 6
- Optional Electron
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
- `VITE_API_KEY_SALT` – Shared secret for encrypting API keys sent to the backend (both frontend and backend read this). Defaults to a dev-only fallback if unset.

## Security & Safety

- Never hardcode API keys or secrets.
- Validate and sanitize user inputs.
- Rate-limit provider calls to protect quotas.
- Use Firebase security rules in production.
- API keys sent to the backend are encrypted with AES-256-CBC using a shared salt (`VITE_API_KEY_SALT`). See `utils/keyEncryption.ts` (frontend) and `server/utils/keyEncryption.js` (backend).

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

## Refactoring Guidelines

### When to Refactor

Refactor when files exceed these thresholds:
- **Services**: >500 lines → split into focused modules
- **Components**: >300 lines → extract hooks and sub-components
- **Hooks**: >200 lines → split by concern

### Service Splitting Pattern

When splitting a large service (e.g., `generationService.ts` with 1400+ lines):

1. **Create subdirectory**: `services/generation/`
2. **Extract by concern**:
   - Main orchestration logic → `generationService.ts`
   - Retry operations → `retryOperations.ts`
   - Related utilities → separate files
3. **Maintain backward compatibility**: Original file re-exports from subdirectory

Example structure after splitting:
```
services/
├── generation/
│   ├── generationService.ts    # Main orchestration
│   └── retryOperations.ts      # Retry logic
└── generationService.ts        # Re-export stub (backward compat)
```

### Enum Usage

**Always use enums** instead of string literals for:
- Theme modes: `ThemeMode.Dark` / `ThemeMode.Light`
- Classification methods: `ClassificationMethod.None` / `Heuristic` / `LLM`
- Deep phases: `DeepPhase.Generator`, `Responder`, `UserAgent`, etc.
- External providers: `ExternalProvider.Gemini`, `OpenAI`, etc.

**Pattern**:
```ts
// ❌ Avoid
if (mode === 'dark') { ... }

// ✅ Use
import { ThemeMode } from '../interfaces/enums/ThemeMode';
if (mode === ThemeMode.Dark) { ... }
```

### Type Safety Rules

- **Never use `any`** in new code
- **Prefer `unknown`** with type guards when type is uncertain
- **Use strict TypeScript**: All new files must pass `npx tsc --noEmit`
- **Explicit return types** for exported functions

### Backward Compatibility

When refactoring:
1. Keep original file as re-export stub
2. Update imports gradually
3. Verify TypeScript passes after each change
4. Test functionality before committing

Example re-export stub:
```ts
// services/generationService.ts
export * from './generation/generationService';
export { default } from './generation/generationService';
```

## Backend Server

Express server in `server/` provides Firestore-backed APIs and background job execution.

```bash
node server/index.js       # Start backend (auto-discovers port 8787-8797)
```

### Backend Structure

```
server/
├── index.js               # Route registration + server startup
├── firebaseAdmin.js       # Firestore admin SDK init
├── jobs/
│   └── jobStore.js        # In-memory + Firestore job tracking (Pending/Running/Completed/Failed)
├── services/
│   └── aiClient.js        # OpenAI-compatible chat completions caller (shared by jobs)
├── utils/
│   └── keyEncryption.js   # AES-256-CBC decrypt for API keys from frontend
├── routes/
│   ├── health/            # GET /health
│   ├── admin/             # POST /api/admin/service-account-*
│   ├── jobs/
│   │   ├── getJob.js      # GET /api/jobs/:id
│   │   ├── startAutoscore.js  # POST /api/jobs/autoscore
│   │   └── startRewrite.js    # POST /api/jobs/rewrite
│   ├── sessions/          # CRUD + verification status
│   ├── logs/              # CRUD + stats + pagination
│   └── orphans/           # Orphan detection + sync jobs
```

### Background Jobs

Jobs use `jobStore.js` with statuses: `pending` → `running` → `completed`/`failed`.
Progress is polled via `GET /api/jobs/:id`. The frontend uses `backendClient.fetchJob(jobId)` / `backendClient.pollJob(jobId)`.

### Backend AI Client (`server/services/aiClient.js`)

Simple OpenAI-compatible caller used by autoscore and rewrite jobs:
- `callChatCompletion({ baseUrl, apiKey, model, systemPrompt, userPrompt, maxTokens?, temperature? })`
- Auto-appends `/v1/chat/completions` to base URL
- Retries up to 2 times with 2s delay

## Agent Tools (ToolExecutor)

The verifier agent has access to tools registered in `services/toolService.ts`. Tools are exposed as OpenAI function-calling definitions.

### Tool Registration

```ts
this.registerTool(
    { name, description, parameters: { type: 'object', properties, required } },
    async (args) => { /* execute */ },
    { requiresApproval: true, approvalSettingName: 'Label' }  // optional
);
```

### Available Tools (20 total)

| # | Tool | Approval | Description |
|---|------|----------|-------------|
| 1 | `getTotalItemsCount` | No | Count items in current dataset |
| 2 | `getItems` | No | Get items by range with field selection |
| 3 | `getItem` | No | Get single item by index |
| 4 | `updateItem` | No | Update item field locally |
| 5 | `fetchRows` | No | Fetch more rows from DB |
| 6 | `listSessions` | No | List sessions with filtering |
| 7 | `getLatestSession` | No | Most recently updated session |
| 8 | `getSessionWithMostRows` | No | Session with highest row count |
| 9 | `getSessionWithFewestRows` | No | Session with lowest row count |
| 10 | `fetchSessionRows` | No | Fetch rows from specific session |
| 11 | `loadSessionById` | No | Load session into UI |
| 12 | `refreshSessionsList` | No | Refresh sessions from storage |
| 13 | `renameSession` | Yes | Rename session |
| 14 | `autoscoreItems` | No | Set scores locally by indices |
| 15 | `updateItemsInDb` | Yes | Persist local changes to Firebase |
| 16 | `getSessionByVerificationStatus` | No | Find session by status (unreviewed/verified/garbage) + order (latest/oldest) |
| 17 | `markSessionVerificationStatus` | Yes | Mark session as verified/garbage |
| 18 | `runAutoScore` | Yes | Start backend auto-scoring job, returns jobId |
| 19 | `runRewrite` | Yes | Start backend rewrite job with field selection, returns jobId |
| 20 | `checkJobStatus` | No | Poll backend job status/progress by jobId |

### Backend Job Tools (18-20)

`runAutoScore` and `runRewrite` send encrypted API keys to the backend, which runs the AI calls as background jobs. The agent receives a `jobId` and uses `checkJobStatus` to monitor progress.

Parameters for `runAutoScore`: `{ sessionId, provider?, model?, baseUrl?, limit?, sleepMs? }`
Parameters for `runRewrite`: `{ sessionId, fields: ['query'|'reasoning'|'answer'], provider?, model?, baseUrl?, limit?, sleepMs? }`

Provider/model/baseUrl default to current settings if not specified by the agent.

### ToolContext

Tools access data via `ToolContext` (provided by `useVerifierToolExecutor` hook):
- `data`, `setData` – current dataset
- `sessions`, `refreshSessions` – session list
- `getApiKey(provider)`, `getExternalProvider()`, `getCustomBaseUrl()`, `getModel()` – settings accessors
- `loadSessionById`, `loadSessionRows`, `autoscoreItems`, etc.

### File Organization After Refactoring

```
src/
├── services/
│   ├── generation/          # Split from generationService.ts
│   ├── deep/                # Split from deepReasoningService.ts
│   │   └── rewrite/         # Split from conversationRewrite.ts
│   ├── api/                 # Split from externalApiService.ts
│   └── verifier/
│       └── rewriters/       # Split from verifierRewriterService.ts
├── interfaces/
│   └── enums/               # Individual enum files
│       ├── ThemeMode.ts
│       ├── ClassificationMethod.ts
│       ├── DeepPhase.ts
│       └── ...
```

### Constants Consolidation

Move hardcoded data to `constants.ts`:
- Model definitions (`HARDCODED_MODELS`)
- Default configurations (`DEFAULT_FALLBACK_MODELS`)
- API endpoints
- Feature flags

Import in services instead of defining locally:
```ts
// ❌ Avoid defining in service
const HARDCODED_MODELS = [...];

// ✅ Import from constants
import { HARDCODED_MODELS } from '../constants';
```

### No String Literals - Use Enums/Interfaces

**Never use string literals** for types, modes, states, or configuration values. Always create proper enums or interfaces.

**Required Enums:**
- UI states/tabs/modes → Create enum in `interfaces/enums/`
- API providers → `ExternalProvider` enum
- Configuration options → Dedicated enum per feature
- Status values → Enum instead of `'pending' | 'active' | 'completed'`

**Pattern:**
```ts
// ❌ NEVER use string literals
if (status === 'pending') { ... }
type Tab = 'general' | 'api' | 'advanced';

// ✅ ALWAYS use enums
import { ItemStatus } from '../interfaces/enums/ItemStatus';
if (status === ItemStatus.Pending) { ... }

// Create new enum file: interfaces/enums/SettingsTab.ts
export enum SettingsTab {
  General = 'general',
  Api = 'api',
  Advanced = 'advanced'
}
```

**When to create interfaces:**
- Function parameters with 3+ properties
- Return types from services
- Props for components
- State shapes in hooks

### Single Responsibility Principle

**Every function must do ONE thing.** If a function:
- Has more than 30 lines
- Uses "and" in its name (e.g., `fetchAndProcess`)
- Has nested conditionals deeper than 2 levels
- Takes more than 4 parameters

→ **Split it immediately.**

**Pattern:**
```ts
// ❌ Violates SRP - does 3 things
async function processUserData(userId: string) {
  const user = await fetchUser(userId);
  const validated = validateUser(user);
  const enriched = await enrichWithPermissions(validated);
  return enriched;
}

// ✅ Each function has single responsibility
async function fetchUser(userId: string): Promise<User> { ... }
function validateUser(user: User): ValidatedUser { ... }
async function enrichWithPermissions(user: ValidatedUser): Promise<EnrichedUser> { ... }

// Orchestrator calls them in sequence
async function processUserData(userId: string): Promise<EnrichedUser> {
  const user = await fetchUser(userId);
  const validated = validateUser(user);
  return await enrichWithPermissions(validated);
}
```

### Split Complex Files Immediately

**When a file becomes complex, split it right away.** Don't wait.

**Complexity indicators:**
- File exceeds line thresholds (see "When to Refactor")
- More than 5 imports from the same module
- Functions that share no common imports
- Mixed concerns (UI + business logic + API calls)

**Splitting process:**
1. Identify distinct responsibilities
2. Create subdirectory if needed
3. Extract pure functions first
4. Move to new files by concern
5. Update imports
6. Verify TypeScript passes
7. Test functionality

**Example:** A 400-line service with validation, API calls, and data transformation → Split into:
- `validators.ts` - Input validation
- `apiClient.ts` - API calls
- `transformers.ts` - Data transformation
- Original file becomes thin orchestrator

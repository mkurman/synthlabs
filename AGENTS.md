# AGENTS.md - Guide for AI Coding Agents

This file provides essential information for agentic coding assistants working in this repository.

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Build for production
npm run preview          # Preview production build
```

**Note**: No test framework or linter is currently configured. Before committing changes, ensure:
- TypeScript compilation succeeds: `npx tsc --noEmit`
- Manual testing in dev server passes

## Tech Stack

- **Frontend**: React 19, TypeScript 5.8
- **Build**: Vite
- **Icons**: lucide-react
- **Backend**: Firebase/Firestore (optional)
- **AI Integration**: Google GenAI, OpenAI, Anthropic, custom endpoints

## Code Style Guidelines

### TypeScript

- **Strict mode enabled**: All code must be type-safe
- **Avoid `any`** unless absolutely necessary
- Define interfaces for all data structures in `types.ts`
- Use type inference where possible, but add explicit types for function parameters and return values
- **Interface naming**: Do NOT prefix with 'I' (use `SynthLogItem`, not `ISynthLogItem`)
- **Prefer `interface` over `type`** for object shapes
- Use `Record<string, Type>` for object maps

### React

- Use **functional components exclusively**
- Use React hooks (useState, useEffect, useCallback, useMemo, useRef)
- Keep components focused and single-purpose
- Props must be explicitly typed with interfaces
- Use `useCallback` for event handlers passed to children
- Use `useMemo` for expensive computations

### Imports

- Group imports: React hooks first, then third-party, then local imports
```typescript
import React, { useState, useEffect } from 'react';
import { Icon } from 'lucide-react';
import { MyType } from '../types';
import * as MyService from '../services/myService';
```
- Use `import * as X` for services to namespace exports
- Import from `../types.ts` for all shared interfaces

### Services & API Calls

- Place business logic in `services/` directory
- All AI provider calls **must include retry logic with exponential backoff**
- Use `try/catch` blocks for all async operations
- Log errors using `logger.error()` from `utils/logger`
- Pattern for retry logic:
```typescript
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

### Error Handling

- Always include proper error handling for API calls
- Use `logger.error()` for errors (always logged)
- Use `logger.warn()` for warnings (only in verbose mode)
- Use `logger.log()` for info (only in verbose mode)
- Display user-friendly error messages in the UI
- Track errors in `isError` and `error` fields of data items

### JSON Output Format

- AI responses should be valid JSON objects
- Common format: `{ "query": "...", "reasoning": "...", "answer": "..." }`
- Use `cleanAndParseJSON()` to handle markdown-wrapped JSON from LLMs
- Handles: code blocks (```json), stripped backticks, fallback to first `{}` match

### Naming Conventions

- **Components**: PascalCase (e.g., `VerifierPanel.tsx`)
- **Services**: camelCase with namespace export (e.g., `export const myFunction` in `services/myService.ts`)
- **Types/Interfaces**: PascalCase without 'I' prefix (e.g., `SynthLogItem`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `EXTERNAL_PROVIDERS`)
- **Variables/Functions**: camelCase (e.g., `const handleSave = ...`)
- **State setters**: `set` + variable name (e.g., `setData`, `setIsLoading`)

### File Organization

```
src/
├── components/       # React UI components
├── services/         # Business logic and API integrations
├── utils/           # Utility functions (logger, helpers)
├── types.ts          # Shared TypeScript interfaces
├── constants.ts      # Application constants and configs
├── App.tsx          # Main application component
└── index.tsx        # Entry point
```

### Reasoning Protocol (SYNTH Format)

The app uses stenographic reasoning symbols:
- `→` (Derives/Implies)
- `↺` (Loop/Correction)
- `∴` (Conclusion)
- `●` (Ground Truth)
- `◐` (Inference)
- `○` (Speculation)
- `!` (Insight)
- `※` (Constraint/Trap)
- `?` (Ambiguity)
- `⚠` (Risk/Warning)
- `<H≈X.X>` (Entropy Marker)

When working with reasoning traces, maintain this symbolic format.

### Environment Variables

Required keys (prefix with `VITE_` for Vite):
- `VITE_GEMINI_API_KEY`
- `VITE_OPENAI_API_KEY`
- `VITE_ANTHROPIC_API_KEY`

Store in `.env.local` (never commit to repository).

### Security

- Never hardcode API keys or sensitive data
- Validate all user inputs
- Sanitize data before rendering in UI
- Use Firebase security rules to protect production data
- Rate limit API calls to avoid quota exhaustion

### Comments

- **Add comments** for complex logic or non-obvious implementations
- Use JSDoc-style comments for exported functions
- Keep inline comments concise and relevant
- Document all exported interfaces

### Prompt Sets

Custom prompt sets go in `prompts/<set_name>/` with structure:
- `generator/system.txt`, `generator/meta.txt`, etc.
- `converter/system.txt`, `converter/writer.txt`, etc.
- `verifier/query_rewrite.txt`, etc.

System auto-discovers new prompt sets from this directory.

# Copilot Instructions for SynthLabs Reasoning Generator

## Project Context

This is a React + TypeScript application for creating high-quality synthetic reasoning datasets for training AI models. The application supports multiple generation modes (Generator, Converter, DEEP) and integrates with various AI providers (Gemini, OpenAI, Anthropic, etc.) and HuggingFace datasets.

## Tech Stack

- **Frontend**: React 19, TypeScript 5.8
- **Build Tool**: Vite
- **UI Components**: lucide-react for icons
- **Backend Services**: Firebase/Firestore for cloud persistence
- **AI Providers**: Google GenAI, OpenAI, Anthropic, and custom endpoints
- **Data Processing**: HuggingFace Hub integration, Parquet support (hyparquet)

## Project Structure

- `components/` - React UI components (AnalyticsDashboard, DataPreviewTable, LogFeed, SettingsPanel, VerifierPanel, etc.)
- `services/` - Business logic and API integrations (geminiService, firebaseService, huggingFaceService, etc.)
- `utils/` - Utility functions (logger)
- `types.ts` - TypeScript type definitions and interfaces
- `constants.ts` - Application constants, prompts, and provider configurations
- `App.tsx` - Main application component
- `index.tsx` - Application entry point

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Build for production
npm run preview      # Preview production build
```

## TypeScript Configuration

- **Strict mode enabled**: All code must be type-safe
- **Target**: ES2020
- **Module**: ESNext with bundler resolution
- **JSX**: react-jsx
- **Linting rules**:
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noFallthroughCasesInSwitch: true`

## Coding Standards

### TypeScript

- Use TypeScript strict mode - avoid `any` type unless absolutely necessary
- Define interfaces for all data structures
- Use type inference where possible, but add explicit types for function parameters and return values
- Interface naming: Do NOT prefix with 'I' (use `SynthLogItem`, not `ISynthLogItem`)
- Use `Record<string, Type>` for object maps
- Prefer `interface` over `type` for object shapes

### React

- Use functional components exclusively
- Use React hooks (useState, useEffect, etc.)
- Keep components focused and single-purpose
- Props should be explicitly typed with interfaces

### API and Services

- All AI provider calls should include retry logic with exponential backoff
- Use `try/catch` blocks for all async operations
- Log errors using the `logger` utility from `utils/logger`
- API responses from AI providers must be validated and parsed (handle markdown code blocks in JSON responses)

### Error Handling

- Always include proper error handling for API calls
- Use the logger utility for warnings and errors
- Display user-friendly error messages in the UI
- Track errors in the `isError` and `error` fields of data items

### JSON Output Format

- AI responses should be valid JSON objects
- Common format: `{ "query": "...", "reasoning": "...", "answer": "..." }`
- Use helper functions like `cleanAndParseJSON()` to handle markdown-wrapped JSON from LLMs

### Reasoning Protocol

The application implements a stenographic reasoning protocol using symbolic operators:
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

## Firebase Integration

- Firebase is optional but recommended for production use
- Configuration stored in `FirebaseConfig` interface
- Collections: `synth_logs` and `synth_sessions`
- Handle Firebase errors gracefully and provide fallback to local storage

## Environment Variables

Required environment variables (prefix with `VITE_` for Vite):
- `VITE_GEMINI_API_KEY` - Google Gemini API key
- `VITE_OPENAI_API_KEY` - OpenAI API key
- `VITE_ANTHROPIC_API_KEY` - Anthropic API key
- Additional provider keys as needed

Store in `.env.local` (never commit to repository).

## Security and Best Practices

- Never hardcode API keys or sensitive data
- Validate all user inputs
- Sanitize data before rendering in UI
- Use Firebase security rules to protect production data
- Rate limit API calls to avoid quota exhaustion
- Implement proper retry mechanisms with exponential backoff

## Comments and Documentation

- Add comments for complex logic or non-obvious implementations
- Document all exported functions and complex interfaces
- Use JSDoc-style comments for functions that are part of public APIs
- Keep inline comments concise and relevant

## Data Formats

### SynthLogItem
Core data structure for generated reasoning traces. Contains:
- `query`, `reasoning`, `answer` - Main content fields
- `messages` - ChatML conversation history for multi-turn
- `metadata` - Provider, model, timestamp, duration info
- `deepMetadata` and `deepTrace` - For DEEP mode pipeline tracking

### VerifierItem
Extends SynthLogItem with quality control fields:
- `score` - Rating (0=unrated, 1-5)
- `isDuplicate`, `isDiscarded` - Quality flags

## Contributing

- Make minimal, focused changes
- Test with the dev server before committing
- Ensure TypeScript compilation succeeds
- Follow existing code style and patterns
- Update documentation if adding new features

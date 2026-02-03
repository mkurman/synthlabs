<div align="center">
<img width="1200" height="auto" alt="SynthLabs Reasoning Generator" src="assets/synthlabs.jpeg" />

# SynthLabs Reasoning Generator

**Create high-quality synthetic reasoning datasets for training AI models**

[![Node.js](https://img.shields.io/badge/Node.js-18+-43853D?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-fbf0df?style=flat&logo=bun&logoColor=black)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)

</div>

---

## Features

### Generator Mode
Create synthetic datasets from scratch using AI-powered generation. Define topics, customize prompts, and generate high-quality reasoning traces in the [SYNTH](https://huggingface.co/datasets/PleIAs/SYNTH) format.

Core idea: [SYNTH The New Data Frontier by PleIAs](https://pleias.fr/blog/blogsynth-the-new-data-frontier)

<details>
<summary>📸 Screenshot</summary>

![Generator](assets/creator.png)

</details>

---

### Converter Mode
Transform existing datasets into reasoning-enhanced formats. Full **HuggingFace** integration lets you search, preview, and convert public datasets with automatic reasoning trace generation.

---

### DEEP Mode
Multiple AI agents working together in sophisticated pipelines:
- **Meta Agent**: Analyzes and plans approach
- **Retrieval Agent**: Gathers relevant information
- **Derivation Agent**: Builds logical chains
- **Writer Agent**: Composes the response
- **Rewriter Agent**: Polishes and refines

---

### Multi-turn Support
Go beyond single Q&A pairs:
- Generate multi-turn conversations
- Let the model ask follow-up questions
- Choose responders using SYNTH-style thinking
- Perfect for dialogue and instruction-following datasets

---

### Data Preview

Have data but unsure what's inside? Explore it directly with our HuggingFace-style table viewer:
- Column type detection (string, number, array, object)
- Search and filter capabilities
- Fullscreen expansion with pagination
- Click any row to see full details

<details>
<summary>📸 Screenshots</summary>

![Data Preview](assets/data_preview.png)

![Single Row View](assets/data_preview_single_row.png)

</details>

---

### Verifier View

Quality control your generated data:
- Review and evaluate entries
- Remove duplicates automatically
- Assign ratings (1-5 stars)
- Export only verified, high-quality data

<details>
<summary>📸 Screenshots</summary>

![Verifier](assets/verifier.png)

![Rating System](assets/verifier_rating.png)

</details>

---

### Cloud Integration

Seamless Firebase/Firestore support:
- **Development Mode**: Download data directly as JSONL files
- **Production Mode**: Upload to your Firestore database with one click
- Session management and persistence
- Real-time sync across devices

<details>
<summary>📸 Screenshot</summary>

![Production Mode](assets/production_mode.png)

</details>

---

### Additional Features

| Feature | Description |
|---------|-------------|
| **Multiple Providers** | Support for Gemini, OpenAI, Anthropic, and custom endpoints |
| **Concurrent Workers** | Parallel processing for faster generation |
| **Smart Retry** | Automatic retry with exponential backoff |
| **Session Management** | Save, load, and manage multiple generation sessions |
| **Export Formats** | JSONL, JSON, and Parquet support |
| **HuggingFace Upload** | Push directly to HuggingFace Hub |

---

## Quick Start

### Prerequisites
- Node.js 18+ **OR** Bun 1.0+
- API keys for your preferred provider(s)

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd synthlabs-reasoning-generator
   
   # Using npm
   npm install
   
   # OR using Bun (faster)
   bun install
   ```

2. **Configure API keys:**
   
   Copy `.env.example` to `.env.local` and add your keys:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` with your API keys:
   ```env
   VITE_GEMINI_API_KEY=your-gemini-key
   VITE_OPENAI_API_KEY=your-openai-key
   VITE_ANTHROPIC_API_KEY=your-anthropic-key
   # Add other provider keys as needed
   ```

3. **Run the app:**
   ```bash
   # Using npm
   npm run dev

   # Frontend only (custom port)
   npm run dev:client -- --port 3000
   
   # OR using Bun (standalone)
   bun run bun:dev
   ```

4. **Open in browser:**
   Navigate to `http://localhost:3000`

### Backend (optional)

This repo includes a minimal Node backend to handle Firebase Admin operations.

1. **Set backend env vars (example):**
   ```env
   VITE_BACKEND_URL=http://localhost:8787
   VITE_SESSION_LIST_PAGE_SIZE=50
   VITE_SESSION_LIST_TTL_MS=60000
   VITE_SESSION_MAX_TEXT_LEN=10000
   SESSION_LIST_TTL_MS=60000
   BACKEND_JSON_LIMIT_MB=10
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-service-account-email
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

2. **Run (Vite + backend):**
   ```bash
   npm run dev
   ```

The frontend will use the backend when `VITE_BACKEND_URL` is set.

You can also set these in `.env.example` and copy to `.env.local`.

### Bun Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run bun:dev` | Start dev server with Bun runtime |
| `bun run bun:build` | Build for production |
| `bun run bun:preview` | Preview production build |

---

## Electron Desktop App

Build standalone desktop applications for Windows, macOS, and Linux using Electron.

### Electron Commands

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Run in development mode (with hot reload) |
| `npm run electron:build` | Build for all platforms |
| `npm run electron:build:win` | Build Windows installer (NSIS + portable) |
| `npm run electron:build:mac` | Build macOS app (DMG + ZIP) |

### Building for Windows

On Windows or cross-platform:
```bash
npm run electron:build:win
```

Output files will be in the `release/` directory:
- `SynthLabs Reasoning Generator Setup X.X.X.exe` - NSIS installer
- `SynthLabs Reasoning Generator X.X.X.exe` - Portable executable

### Building for macOS

On macOS:
```bash
npm run electron:build:mac
```

Output files will be in the `release/` directory:
- `SynthLabs Reasoning Generator-X.X.X.dmg` - Disk image
- `SynthLabs Reasoning Generator-X.X.X-mac.zip` - ZIP archive

Both builds support:
- x64 (Intel) architecture
- arm64 (Apple Silicon) architecture
- Code signing with hardened runtime
- Network permissions for API calls

### Building for Linux

```bash
npm run electron:build
```

Output files:
- `SynthLabs Reasoning Generator-X.X.X.AppImage` - Universal Linux app
- `synthlabs-reasoning-generator_X.X.X_amd64.deb` - Debian/Ubuntu package

### Requirements for Building

**Windows:**
- Windows 10 or later
- Node.js 18+
- No additional dependencies required

**macOS:**
- macOS 10.15 (Catalina) or later
- Xcode Command Line Tools: `xcode-select --install`
- Node.js 18+
- For code signing: Apple Developer account (optional, for distribution)

**Linux:**
- Any modern Linux distribution
- Node.js 18+
- Build tools: `sudo apt-get install build-essential` (Debian/Ubuntu)

### Development Workflow

1. **Start development server:**
   ```bash
   npm run electron:dev
   ```
   This runs Vite dev server and Electron concurrently with hot reload.

2. **Build for production:**
   ```bash
   npm run electron:build
   ```

3. **Test the built app:**
   - Run the installer/exe/dmg from `release/` directory
   - All features work the same as the web version

### Configuration

Electron settings are in `electron/main.js`:
- Window size, icon, and appearance
- Menu configuration
- Security settings (context isolation enabled)
- Platform-specific behavior

electron-builder configuration is in `package.json` under the `build` section:
- Output directories
- Platform-specific targets
- Code signing and entitlements
- Installer options


---

## Custom Prompts

The generator supports dynamic prompt sets. You can create your own "persona" or logical framework by adding files to the `prompts/` directory.

### Create a New Prompt Set

1. Create a new folder in `prompts/` (e.g., `prompts/my-set/`).
2. Inside your set folder, create subdirectories for each category:
   - `generator/`
   - `converter/`
   - `verifier/`
3. Add `.txt` files for each role. The app will automatically discover your set and show it in the **Settings > Prompts** tab.

### Directory Structure & Roles

```text
prompts/
  └── <set_name>/
      ├── generator/
      │   ├── system.txt      (Main generator persona)
      │   ├── meta.txt        (Task decomposition)
      │   ├── retrieval.txt   (Constraint identification)
      │   ├── derivation.txt  (Logical reasoning chains)
      │   ├── responder.txt   (Final answer formulation)
      │   └── user_agent.txt  (Multi-turn interaction agent)
      ├── converter/
      │   ├── system.txt      (Main converter persona)
      │   ├── writer.txt      (Writing the final reasoning trace)
      │   └── rewriter.txt    (Polishing converted output)
      └── verifier/
          ├── query_rewrite.txt
          ├── reasoning_rewrite.txt
          ├── answer_rewrite.txt
          └── message_rewrite.txt
```

> [!TIP]
> If a specific role file is missing in your custom set, the system will automatically fall back to the version in the `default` set.

---

## Firebase Setup (Optional)

For cloud persistence and production mode, set up Firestore:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)

2. Enable Firestore Database

3. Add these Security Rules (Firestore Database → Rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /synth_logs/{document=**} {
      allow read, write: if true; # change if needed (too open for production)
    }
    match /synth_sessions/{document=**} {
      allow read, write: if true;  # change if needed (too open for production)
    }
  }
}
```

4. Configure your Firebase credentials in the app's settings panel

---

## Output Format

Generated data follows the SYNTH format:

```json
{
  "query": "What is the capital of France?",
  "reasoning": "<think>The user is asking about geography...</think>",
  "answer": "The capital of France is Paris.",
  "messages": [...],
  "isMultiTurn": false,
  "metadata": {
    "provider": "gemini",
    "model": "gemini-2.0-flash",
    "timestamp": 1704067200000
  }
}
```

---

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

## License

This project is licensed under the Apache 2.0 License.

---

## Citation

If you find this tool useful, please cite it as:

```
@misc{synthlabs,
    author = {Kurman, Mariusz},
    title = {SYNTHLabs Reasoning Generator},
    howpublished = {\url{https://github.com/mkurman/synthlabs}},
    year = {2026}
}
```

Thank you!

---

<div align="center">

**Built with ❤️ for the AI research community**

</div>

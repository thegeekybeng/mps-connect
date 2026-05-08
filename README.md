# MPS-Connect

A constituent case management tool built to cut down the time it takes to log, triage, and follow up on cases received at Meet-the-People Sessions (MPS).

Before this, everything was manual — residents had to repeat themselves, staff had to transcribe on the spot, and nothing was structured enough to action quickly. This changes that.

---

## What it does

Residents arrive, type out their concern in a chat interface (or speak it — STT is supported), and an AI assistant helps them articulate the full picture. By the time a case worker picks it up, the case is already structured, categorised, and assigned an urgency level.

Staff get a clean dashboard with all cases in one view — no sticky notes, no scribbled forms.

**Key capabilities:**

- AI-assisted resident intake in natural language (English, Mandarin, Malay, Tamil, Singlish)
- Automatic case categorisation and urgency classification
- Staff dashboard with full case history
- Consent gate before any AI interaction (privacy and demo disclosure)
- Reference number generated per case — no more lost submissions

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React + TypeScript + Vite |
| AI inference | Ollama — `aisingapore/gemma-sea-lion-v4-27b-it` (local, no cloud API) |
| Speech-to-text | Wyoming Whisper via FastAPI bridge |
| Text-to-speech | Wyoming Piper via FastAPI bridge |
| Containerisation | Docker Compose |

---

## Engineering notes

**Why a pure SPA with no backend?**
The tool is designed for MPS sessions — low-frequency, supervised use. A full backend adds deployment complexity that isn't justified at this stage. State lives in-memory for the session, which is fine when a case worker is present and the session ends cleanly. The trade-off is accepted and documented.

**Why local inference?**
Resident data is sensitive by nature. Running inference locally via Ollama means no case content ever leaves the network — no cloud API, no usage logs on a third-party server. It also eliminates per-session API costs, which adds up at scale.

**Why SEA-LION (aisingapore/gemma-sea-lion-v4-27b-it)?**
Most LLMs handle formal English well but struggle with the way residents actually speak — Singlish, code-switching, partial sentences. SEA-LION is trained on Southeast Asian language data and handles this significantly better than general-purpose models for this use case.

**Why the consent gate?**
Privacy by design. Before any resident data is processed by the AI, explicit consent is collected for three things: AI use, data handling, and demo acknowledgement. This is a gate, not a notice — nothing proceeds without all three checked.

**Why replace `alert()` with a persistent screen?**
A browser alert is dismissed and the reference number is gone. A resident asking "what was my number?" has no recourse. The CaseSubmitted screen holds the reference until the resident actively leaves — a small change with a meaningful UX impact.

---

## Setup

### Prerequisites

- Docker and Docker Compose
- Ollama running with SEA-LION model pulled (or any OpenAI-compatible endpoint)
- `ai-bridge` Docker network created by `infrastructure/docker-compose.ai.yml`

### Environment

Copy `.env.example` to `.env` and set:

```env
VITE_STAFF_ACCESS_CODE=your-chosen-code
```

### Run

```bash
docker compose up -d
```

App is available at `http://localhost:3080`.

---

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_STAFF_ACCESS_CODE` | Passcode required to access the staff portal |
| `OLLAMA_HOST` | Base URL of Ollama instance (include `/v1` path) |
| `AI_MODEL` | Model name to use for inference |

---

## Important notes

This is a **research and demonstration tool**. It is not an official government service, not affiliated with any government agency, and must not be presented as one. The consent gate displayed to residents makes this explicit.

Staff access is gated by an environment-variable access code. Do not use a weak code in any environment with real resident data.

---

Built by [@thegeekybeng](https://github.com/thegeekybeng)

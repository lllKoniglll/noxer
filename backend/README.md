# Python agent backend

Backend for the economy chat assistant. It exposes a small FastAPI API that
accepts uploaded SIE4 files in memory, runs report tools, and can optionally
use Google ADK/Ollama for routing and answer synthesis.

## Run locally

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e .
uvicorn app.main:app --reload --port 8001
```

Environment:

- `OLLAMA_API_KEY`: API key for the Ollama-compatible endpoint.
- `OLLAMA_BASE_URL`: optional, defaults to `http://localhost:11434`.
- `OLLAMA_MODEL`: optional, defaults to `llama3.1:8b`.

The production API receives SIE4 files as multipart uploads on each chat
request. Uploaded files are not written to disk. The local fallback directory
`../SIE4` is only useful for development diagnostics.

Python 3.10+ is recommended for Google ADK. The local macOS Python 3.9 can run this prototype, but ADK emits compatibility warnings.

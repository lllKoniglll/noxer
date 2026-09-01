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

The production API receives SIE4 files through the authenticated web API. Files
are stored in a per-workspace directory on the server and loaded for reports
and chat. The local fallback directory `../SIE4` is only useful for development
diagnostics.

## Workspace groups

Authentik must send exactly one group whose name starts with
`noxer-workspace-`, for example `noxer-workspace-team-a`. All users in that
group share the same SIE files. Users with no matching group, or with more
than one matching workspace group, are denied. The backend never accepts a
workspace path from the browser.

The production bind mount must be writable by the backend container user
(UID 10001), for example on the server:

```sh
mkdir -p /Users/server/server/stacks/noxer/data
chown -R 10001:10001 /Users/server/server/stacks/noxer/data
```

Python 3.10+ is recommended for Google ADK. The local macOS Python 3.9 can run this prototype, but ADK emits compatibility warnings.

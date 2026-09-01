# Noxer på Mac mini med Docker

Noxer körs som två containers: `web` (Next.js) och `backend` (FastAPI). Endast
webbcontainern publiceras lokalt på `127.0.0.1:8081`; den befintliga Caddy-
gatewayen på `127.0.0.1:8083` skyddar den innan Cloudflare Tunnel når appen.

SIE4-filer lagras i en workspace på servern. Alla användare i samma Authentik-
workspace-grupp delar filerna; användare måste tillhöra exakt en grupp med
prefixet `noxer-workspace-`. Backend väljer workspace från Authentik-headern,
aldrig från en sökväg som skickas av webbläsaren.

## Första installationen som `server`

```bash
cd /Users/server/server/stacks
git clone -b main git@github.com:lllKoniglll/noxer.git noxer
cd noxer
cp .env.example .env
mkdir -p data
chown -R 10001:10001 data
```

Redigera `.env` och fyll i Ollama-inställningarna om chatten ska använda en
Ollama-kompatibel tjänst. Lägg inte riktiga secrets i Git.

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f
curl http://localhost:8081/api/health
```

Cloudflare-routen ska gå via den befintliga Caddy-gatewayen mot:

```text
http://host.docker.internal:8083
```

Ingen port ska öppnas i routern och ingen containerport ska bindas till
`0.0.0.0`.

## Uppdatering

```bash
cd /Users/server/server/stacks/noxer
git pull --ff-only origin main
chown -R 10001:10001 data
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100
```

# Noxer på Mac mini med Docker

Noxer körs som två containers: `web` (Next.js) och `backend` (FastAPI). Endast
webbcontainern publiceras lokalt på `127.0.0.1:8081`; Cloudflare Tunnel kan
senare routa `noxer.fluxweaver.com` till `http://host.docker.internal:8081`.

SIE4-filer laddas upp i webbgränssnittet och behandlas i minnet. De skrivs inte
till servern, Docker-volymer eller browser storage och försvinner när sidan
stängs eller laddas om.

## Första installationen som `server`

```bash
cd /Users/server/server/stacks
git clone -b main git@github.com:lllKoniglll/noxer.git noxer
cd noxer
cp .env.example .env
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

Öppna därefter Cloudflare-routen mot:

```text
http://host.docker.internal:8081
```

Ingen port ska öppnas i routern och ingen containerport ska bindas till
`0.0.0.0`.

## Uppdatering

```bash
cd /Users/server/server/stacks/noxer
git pull --ff-only origin main
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100
```

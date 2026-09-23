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
# På macOS ska bind-mounten ägas av serverkontot, inte container-UID 10001.
sudo chown -R server:staff data
sudo chmod -RN data
sudo chmod -R u+rwX data
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
# Kör inte chown till 10001 på Mac. deploy-server.sh kontrollerar att data
# ägs av server innan containrarna startas.
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100
```

Det finns också ett deployskript som kör samma säkra uppdatering och kontroller
att webbens health-endpoint svarar. Kör det som macOS-användaren `server`:

```bash
cd /Users/server/server/stacks/noxer
bash scripts/deploy-server.sh
```

För att testa en branch på servern innan merge till `main`:

```bash
NOXER_DEPLOY_BRANCH=codex/monthly-account-comparison bash scripts/deploy-server.sh
```

Skriptet använder `docker compose up -d --build`; `down` behövs inte och den
centrala Caddy-, Cloudflare- eller Authentik-stacken ändras inte.

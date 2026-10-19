# Autentisering med Authentik

Noxer skyddas i produktion av den centrala Authentik-stacken. Publik trafik går
via Cloudflare Tunnel och Caddy: `noxer.fluxweaver.com` → Caddy `:8083` →
Authentik Forward Auth → Noxer lokalt på `:8081`.

## Viktiga regler

- Noxer ska inte implementera en separat publik lösenordsinloggning när den
  körs bakom den gemensamma proxyn.
- Före en förändring i auth-flödet: kontrollera Authentik Application/Provider,
  Caddy-route och Cloudflare hostname tillsammans.
- Lita inte på `X-Authentik-*`-headers direkt från klienten. De ska skrivas av
  den betrodda proxyn och Noxers upstream ska inte vara publikt nåbar.
- Vid native SSO i framtiden ska OIDC/OAuth2 användas mot Authentik.

## Workspace-behörighet

Authentik måste skicka exakt en grupp vars namn börjar med
`noxer-workspace-`, exempelvis `noxer-workspace-team-a`. Alla användare i gruppen
delar workspace-filer. Ingen matchande grupp eller fler än en matchande grupp
ska nekas. Backend får aldrig ta emot en workspace-sökväg från webbläsaren;
workspace ska härledas server-side från den autentiserade gruppen.

Ändra inte credentials eller Authentik-konfiguration i kod. Deploymentdetaljer
finns i Noxers `DEPLOYMENT.md` och i Authentik-repots `AGENTS.md`/README.

## Produktionsserver

Noxer körs på en Mac mini M4/ARM64 under det separata macOS-kontot `server`.
`rik` används för utveckling och Codex; kör inte produktionscontainrar som
`rik`. Deploymenten finns i `/Users/server/server/stacks/noxer/` och består av
webb- och backend-containrar på det externa Docker-nätet `ai-network`.

Webben publiceras endast lokalt på `127.0.0.1:8081`. Den befintliga Cloudflare
Tunneln `mac-mini` går till Caddy på `127.0.0.1:8083`, där Authentik kontrollerar
åtkomst innan trafiken skickas till Noxer. `cloudflared` kör som container och
`host.docker.internal` används för host-portar. Det finns ingen inkommande
Internet-port-forwarding.

Images måste stödja ARM64. Behåll `restart: unless-stopped`, exponera inte
Noxers app-port på alla interface och ändra inte den centrala `cloudflared`-
stacken utan uttrycklig begäran. Se `/Users/server/server/stacks/team-manager/server-setup.md`
för den gemensamma servermodellen.

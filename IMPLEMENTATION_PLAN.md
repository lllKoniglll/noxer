# Implementeringsplan: SIE4 ekonomivisualisering

Senast uppdaterad: 2026-06-18

## Mal

Bygga en modern webbapp som laser SIE4-filer exporterade fran Fortnox och visar begripliga rapporter for intakter, kostnader, likviditet och jamforelser over tid. Appen ska vara enkel att bygga vidare med nya rapporter och senare kunna fa inloggning/medlemsaccess utan stor ombyggnad.

## Nulage

- [x] Projektmapp inventerad.
- [x] Tva SIE4-filer hittade i `SIE4/`.
- [x] Filerna ar Fortnox SIE typ 4 och anger `#FORMAT PC8`, vilket betyder att parsern maste hantera PC-8/IBM-kodning.
- [x] 2025-filen innehaller rakenskapsar 2025 med jamforelse mot 2024.
- [x] 2026-filen innehaller rakenskapsar 2026 med jamforelse mot 2025 och verifikationer till 2026-06-18.
- [x] Planfil skapad.
- [ ] GitHub-repo `claw-fluxweaver.github.io` skapat. Pausat tills vidare.
- [x] Lokal git-repo initialiserad.
- [x] Lokal appgrund skapad.
- [x] Anvandarbeslut dokumenterade.

## Viktiga principer

1. Bokforingsfiler ska inte checkas in i ett publikt repo.
2. Rapporter ska bygga pa en gemensam, testad datamodell i stallet for att varje vy tolkar SIE sjalv.
3. Anvandaren ska kunna forsta ekonomin utan kontokoder, men kontokoder ska finnas tillgangliga i drilldown for transparens.
4. Likviditet ska skilja tydligt mellan faktiskt utfall till dagens datum och simulerad prognos for resten av aret.
5. Arkitekturen ska ta hojd for senare autentisering och organisationsbaserad access.

## Foreslagen teknik

### App

- Next.js med TypeScript som webbapp.
- React for UI-komponenter.
- Tailwind CSS for snabb, modern och konsekvent styling.
- Recharts eller Tremor-liknande komponenter for diagram.
- SheetJS eller ExcelJS for Excel-export.

Motivering: Next.js ar latt att hosta, fungerar bra som statisk/frontend-forst app i borjan, och kan senare fa API-routes, server actions, auth och databas utan att byta ramverk.

### Datamodell och parser

- Egen SIE4-parser i TypeScript med tydliga typer.
- Parsern ska lasa `#KONTO`, `#RAR`, `#IB`, `#UB`, `#RES`, `#VER` och `#TRANS`.
- Kodning ska hanteras explicit for `#FORMAT PC8`.
- Normaliserad intern modell:
  - Organisation
  - Rakenskapsar
  - Kontoplan
  - Verifikationer
  - Transaktionsrader
  - Manadsaggregeringar
  - Rapportkategorier

### Rapportlager

Rapporter ska implementeras som separata moduler med samma kontrakt:

```ts
type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  build: (dataset: AccountingDataset, options: ReportOptions) => ReportResult;
};
```

Det gor det enkelt att lagga till nya rapporter utan att bygga om navigering, filter och export.

## MVP-rapporter

### 1. Manadsoversikt

Syfte: ge snabb totalbild utan krav pa kontokunskap.

Innehall:
- Intakter per manad.
- Kostnader per manad.
- Resultat per manad.
- Ackumulerat resultat.
- Jamforelse med samma manad foregaende ar.
- Tydlig markering av vilka manader som ar faktiska och vilka som saknar data.
- Drilldown fran kategori till konton och transaktioner.

### 2. Kostnads- och intaktskategorier

Syfte: oversatta kontoplan till begripliga omraden.

Forsta kategorier:
- Medlems- och traningsavgifter
- Sponsring och bidrag
- Kiosk/cafe/forsaljning
- Cuper och arrangemang
- Planer, lokal och arena
- Domare, licenser och tavling
- Personal och arvoden
- Administration, IT och bank
- Ovrigt

Kategorierna bor ligga i en konfigurationsfil sa de kan justeras utan kodandring.

### 3. Likviditetsanalys

Syfte: visa kassalage korrekt till dagens datum och simulera resten av aret.

Innehall:
- Faktiskt banksaldo baserat pa likvida konton, initialt `1910`, `1920`, `1930`, `1939`, `1940`, `1950`, `1960`.
- Faktiska in- och utbetalningar fram till senaste verifikationsdatum.
- Prognos for resterande manader baserad pa motsvarande period foregaende ar.
- Antaganden synliga i UI: vilka konton ingar, vilken historik anvands, och om prognosen ar justerad.
- Scenario-reglage senare: optimistisk, normal, forsiktig.

### 4. Excel-export

Syfte: kunna ta med rapporter till mote/styrelsearbete.

Innehall:
- Export av aktuell rapportvy till `.xlsx`.
- Flikar for sammanfattning, manadsdata, kategoriuppdelning och transaktionsunderlag.
- Tydlig rubrik med organisation, period och exportdatum.

## UI-design

Forsta skarmen ska vara en arbetsvy, inte en landningssida.

Foreslagen layout:
- Toppbar med organisation, vald period och filstatus.
- Vanster navigation for rapporter.
- Dashboard-yta med KPI-rad, diagram och tabell/drilldown.
- Filter for ar, manad, rapportkategori och jamforelsear.
- Exportknapp per rapport.

Uttryck:
- Modern, ren och foreningsvanlig snarare an "enterprise finance".
- Fokus pa tydliga siffror, bra kontrast och korta etiketter.
- Kontokoder gomda som detalj, inte som huvudsprak.

## Hosting och access senare

Forsta versionen kan vara lokal eller enkel webbhosting. Designen ska anda forbereda for:

- Separat data-importlager.
- Organisations-id i datamodellen.
- Rollbaserad access senare: admin, styrelse, lasare.
- Auth.js, Clerk eller Supabase Auth som mojliga framtida alternativ.
- Databas senare: Supabase/Postgres eller SQLite/Turso beroende pa hostingval.

## Sakerhet och dataskydd

- `SIE4/` ska ligga i `.gitignore`.
- Ingen bokforingsdata ska lagras i publikt repo.
- Importerade filer ska pa sikt hanteras som privata organisationsdata.
- Exporter ska skapas lokalt/i session och inte lagras permanent utan aktivt val.
- GitHub Pages-repot kan anvandas for appkod/demo, men inte for verkliga SIE-data.

## Implementeringsfaser

### Fas 0: Repo och grund

- [x] Initiera git lokalt.
- [ ] Skapa GitHub-repo `claw-fluxweaver.github.io`. Pausat, arbetar lokalt forst.
- [x] Lagg till `.gitignore` for SIE-filer och byggartefakter.
- [ ] Skapa Next.js/TypeScript-projekt.
- [ ] Lagg in grundlayout och designsystem.

### Fas 1: SIE4-parser

- [x] Implementera tokenizer/parser for SIE4.
- [x] Hantera PC8-kodning.
- [x] Extrahera konton, rakenskapsar, saldo, resultat, verifikationer och transaktioner.
- [ ] Skriva tester mot de tva befintliga filerna utan att checka in filerna.
- [ ] Validera debet/kredit-balans per verifikation.

### Fas 2: Rapportmotor

- [x] Skapa normaliserad `AccountingDataset`.
- [x] Skapa kategori-konfiguration for kontogrupper.
- [x] Bygga manadsaggregering for resultatkonton.
- [x] Bygga likviditetsaggregering for bank/kassa-konton.
- [ ] Skapa gemensamt rapportkontrakt for nya rapporter.

### Fas 3: UI for MVP

- [x] Dashboard med KPI:er.
- [x] Manadsoversikt med jamforelse mot samma manad foregaende ar i helarsdiagram.
- [x] Kategori-vy, forsta version utan drilldown.
- [x] Likviditetsvy med faktisk/prognos-markering.
- [x] Lokal auto-inlasning fran `SIE4/`.
- [x] Separata sidor for manadsoversikt, likviditet och kategorier.
- [x] Val for jamforelse mot helt foregaende ar eller samma period foregaende ar.
- [x] Separat chattvy planerad pa egen sida.
- [x] Python-backend vald for agenten eftersom Google ADK har starkast Python-stod.

### Fas 4: Export

- [ ] Exportera manadsoversikt till Excel.
- [ ] Exportera likviditetsanalys till Excel.
- [ ] Skapa en gemensam exporthelper for framtida rapporter.

### Fas 5: Forberedelse for drift

- [ ] Valja hostingstrategi.
- [ ] Separera demo-data fran privat data.
- [ ] Dokumentera miljovariabler och deployment.
- [ ] Skissa auth/access-modell for nasta etapp.

## Fragor att besvara tidigt

1. Ska forsta versionen vara en ren lokal app dar du laddar upp SIE-filer i browsern, eller ska den ha en backend redan fran start?
2. Ska GitHub-repot vara publikt, privat, eller publikt med endast appkod och utan ekonomidata?
3. Vilka personer ska vara primara anvandare: kassor, styrelse, ledare eller medlemmar?
4. Ska rapporterna vara for en enda forening initialt, eller flera organisationer fran borjan?
5. Vilka konton raknar du som "likvida medel" utover `1910`, `1920`, `1930`, `1939`, `1940`, `1950`, `1960`?
6. Ska likviditetsprognosen baseras strikt pa foregaende ars samma datum/manad, eller vill du kunna justera for kanda engangshandelser?
7. Behover appen hantera budget senare, eller bara faktiskt utfall och prognos?
8. Ska Excel-exporterna vara enkla datatabeller eller mer styrelsefardiga rapporter med formatering och sammanfattning?
9. Finns det visuella preferenser, exempelvis klubbfarger, logotyp eller en stil du gillar?
10. Vill du att kontokategorierna ska folja BAS-kontoplanens logik eller foreningens egna sprak fullt ut?

## Beslut som ar tagna tills vidare

- SIE-filerna betraktas som privata och ska inte checkas in.
- GitHub-repot ska vara privat nar det skapas.
- Forsta versionen laser automatiskt fran lokala `SIE4/`.
- Appen byggs for en organisation per instans.
- Styrelsen ar primar malgrupp.
- Likviditetsprognosen ska kunna justeras for kanda handelser.
- UI ska profileras for Kronängs IF och kronangsif.se.
- Excel-exporter ska vara motesfardiga men aven visa underliggande data.
- Appen ska designas for att vara rapportmodulbaserad.
- Forsta prioritet ar manadsoversikt, jamforelse foregaende ar, likviditet och Excel-export.
- Hosting/access tas hojd for men implementeras inte i forsta skedet.

## Andringslogg

- 2026-06-18: Forsta plan skapad efter inventering av SIE4-filer.
- 2026-06-18: GitHub-sparet pausat efter anvandarbeslut; fortsatt arbete sker lokalt.
- 2026-06-18: Lokal Next.js-app, SIE-parser, rapportmodell och forsta dashboard kopplad till SIE4-data.
- 2026-06-18: Rapporter uppdelade pa egna sidor och manadsdiagrammet visar hela aret med jamforelse mot foregaende ar.
- 2026-06-18: Jamforelseperiod kan valjas mellan helt foregaende ar och samma period till senaste verifikationsdatum.
- 2026-06-20: Branch skapad for Python/ADK-baserad chattagent med FastAPI-backend och agent-tools.
- 2026-06-20: Chattagenten utokad med kategori- och skillnadsanalyser, inklusive diagram for t.ex. personalkostnader over aret.
- 2026-06-20: Chattagenten utokad med intaktsanalys for storsta okning/minskning samt textsokning/akronymmatchning for t.ex. KAC.
- 2026-06-20: SIE-data normaliseras aven till ett internt SQLite-lager for agentfragor; chatten kan nu visa SQL-baserade tabeller.
- 2026-06-20: Fragetolkningen styr nu tydligare tabell/diagram-lage och kan ateranvanda tidigare amne for foljdfragor som "visa alla rader".
- 2026-06-20: Chattens SQL-routing hanterar fler stavfel/ordformer for lagfragor, storsta kostnader och blandade intakter/kostnader i tabell.
- 2026-06-20: Ollama kopplad som primar SQL-agent med databasschema i prompten; defaultmodell bytt till fungerande `ministral-3:8b`.
- 2026-06-20: Chatten visar spinner/statusrad medan Ollama skapar SQL och bearbetar fragan.
- 2026-06-20: SQL-agenten bevarar manadsvis gruppering vid diagram-uppfoljningar och tvingar Datum-kolumn for radtabeller.
- 2026-06-20: Tabeller fick gemensam sortering, filter, fet summeringsrad samt gron text for intakter och rod text for kostnader; chattens spinner flyttad ovanfor textrutan.

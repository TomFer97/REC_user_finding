# REC_user_finding

Webapp preliminare per supportare Vaprioenergy nell'identificazione di potenziali utenti non domestici da coinvolgere nella comunita energetica.

L'app consente di:

- selezionare l'area ufficiale GSE di riferimento per Vaprio d Adda;
- interrogare OpenStreetMap tramite Overpass per trovare potenziali utenze non domestiche;
- classificare i risultati per macro-categoria utile all'outreach;
- stimare la superficie dell'edificio quando OSM fornisce una geometria o un edificio associabile;
- esportare una lista CSV/PDF per le successive verifiche manuali.

> Nota: l'area GSE viene caricata tramite il proxy backend `/api/gse-area`, usando il layer ArcGIS reale `AC_Comuni/FeatureServer/21`.

## Esecuzione locale

```bash
npm install
npm start
```

Aprire:

```bash
http://localhost:3000
```

## Test rapido

```bash
npm test
```

Il test controlla la sintassi del backend e del JavaScript frontend principale.

## Modalita mock

Per evitare chiamate a Overpass durante demo o sviluppo:

```bash
USE_MOCK_OSM=true npm start
```

Di default l'app prova a usare Overpass reale.

## Dati principali

- `/api/gse-area`: proxy backend per la geometria ufficiale GSE.
- `/api/osm-search`: ricerca Overpass su target non domestici e geometrie edificio.
- `webapp/data/cabins.json` e `webapp/data/areas.json`: dati legacy non usati dalla UI principale.
- `webapp/data/osm-mock.json`: dati demo usati solo con `USE_MOCK_OSM=true`.

## Export

L'export usa un set fisso di colonne pensate per outreach CER, cosi resta semplice da usare e stabile tra CSV e PDF:

- nome target;
- priorita;
- superficie edificio stimata;
- categoria macro e sotto-categoria;
- indirizzo se disponibile;
- telefono, sito, email se disponibili in OSM;
- coordinate;
- livello di confidenza;
- note di verifica.

I dati OSM sono utili per screening preliminare, ma vanno verificati prima di qualsiasi contatto formale.

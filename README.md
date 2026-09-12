# BYSIC

Pianificatore SOC per **BYD Seal U DM-i Boost 18,3 kWh**.

Webapp mobile (PWA) che dice **cosa impostare sull'auto** e **in quale punto del viaggio**, per
minimizzare il costo totale benzina + elettricità. Due istruzioni, al massimo tre, più una checklist
con checkpoint che segue l'esecuzione lungo il percorso.

Specifica completa: [`SPEC.md`](SPEC.md).

## Stato

| punto | contenuto | stato |
|---|---|---|
| 1 | Scheletro PWA, navigazione, onboarding auto | ✅ |
| 2 | Modello energetico §3 + percorso manuale | — |
| 3 | Simulatore §4.2, ricerca §4.3, pannello debug | — |
| 4 | Checkpoint §5, modalità viaggio, persistenza | — |
| 5 | Routing e altimetria reali §7 | — |
| 6 | Grafici, confronti, storico | — |

## Sviluppo

```bash
npm install
npm run dev       # server di sviluppo
npm run build     # build di produzione (dist/)
npm test          # test del modello
```

Screenshot a viewport telefono:

```bash
npx vite preview --port 4173 &
CHROME_BIN=/path/to/chrome BASE_URL=http://127.0.0.1:4173 node scripts/schermate.mjs
```

## Limiti dichiarati

Questi non sono difetti da nascondere: sono i confini entro cui il risultato è attendibile.

- **L'app non legge nulla dall'auto.** Stima a partire da un modello fisico calibrato. Obiettivo
  dichiarato: ±10% sul consumo, non «preciso».
- **Il guadagno reale è piccolo.** Su Milano→Ortisei (321 km) la differenza fra il piano ottimo e
  «guido in EV e basta» è 0,45 €, l'1,1%. Il valore dell'app è evitare i due errori grossi —
  dimenticare il rilascio della batteria (3,38 €) e tenere «obbligatoria 70%» per tutto il viaggio —
  non spremere l'ultimo percento. Se il risparmio previsto sta sotto il 2% o 1,50 €, l'app dice di
  non fare niente e non genera istruzioni.
- **Il geofencing in browser mobile non è affidabile in background.** Senza notifiche push, iOS
  sospende le tab: se lo schermo si spegne o si cambia app, il riconoscimento automatico dei
  checkpoint può saltare. Per questo la modalità viaggio tiene lo schermo acceso con la Screen Wake
  Lock API, ha sempre un pulsante **«Sono qui»** manuale in cima alla schermata, e se il GPS si perde
  stima la posizione per tempo trascorso e velocità media chiedendo conferma. (Implementazione al
  punto 4.)
- **L'auto può sovrascrivere la raccomandazione.** Il manuale dice che il veicolo regola da solo il
  setpoint SOC in base ad altitudine e temperatura. Quando succede, l'app asseconda il valore che ha
  messo l'auto invece di insistere su quello originale.
- **Una costante è ancora incerta:** la soglia di SOC sotto cui l'auto abbandona la modalità EV. È
  impostata a 8% come ipotesi, non è mai stata verificata sul veicolo, ed è il singolo numero che
  sposta di più il punto di rilascio. Si corregge dalla schermata *Auto*.

## Costanti

Nessun numero vive sparso nel codice: tutto sta in
[`src/config/vehicle.ts`](src/config/vehicle.ts) con valore, unità, fonte e confidenza
(`manuale` / `misurato` / `stimato`). La schermata *Auto* dell'app le elenca tutte, filtrabili per
confidenza, così è sempre visibile su quali numeri sta girando il modello.

## Stack

React 19 + Vite + TypeScript · Tailwind v4 · Zustand · Dexie (IndexedDB) · vite-plugin-pwa.
Nessun backend. Routing e altimetria (punto 5) su stack aperto: OpenRouteService/Valhalla +
OpenTopoData.

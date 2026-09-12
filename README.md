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
| 2 | Modello energetico §3 + percorso manuale | ✅ |
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

## Calibrazione del modello

Il modello riproduce le tabelle della SPEC molto meglio delle tolleranze richieste:
§3.1 entro **±0,4%** (tolleranza ±10%) e 13 celle su 14 di §3.2 entro **±0,006 L/kWh**
(tolleranza ±0,01). Il pannello *Verifica del modello* nell'app le ricalcola a ogni avvio.

Per arrivarci sono stati ricavati due parametri che la SPEC non dichiara — entrambi in
`CALIBRAZIONE` dentro `src/config/vehicle.ts`, con il procedimento documentato:

- **massa di calibrazione 2.100 kg**: l'unica che riproduce le tre righe EV di §3.1 entro lo 0,3%
  (a 1.950 kg lo scarto è −5,4% / −3,0% / −2,1%);
- **efficienza degli ausiliari in HEV 0,299**: ricavata imponendo che l'efficienza di catena
  risulti la stessa a 20 °C e a 0 °C su tutte le righe di §3.2. È la verifica più forte
  disponibile — dodici dati indipendenti, e la catena esce piatta in temperatura.

### Tre punti in cui la SPEC non torna con sé stessa

Documentati e non aggiustati in silenzio:

1. **§3 dice «presa diretta sopra 65 km/h: 0,323–0,344».** Vero a 110–130 km/h, dove la curva
   calibrata dà 0,322–0,345. Falso a 80 km/h, dove le tabelle §3.1/§3.2 impongono **0,299**, cioè
   peggio della modalità serie. È anche il motivo per cui §3.2 attribuisce a 80 km/h un `g` più alto
   che a 30. Lettura fisica: a 80 in presa diretta il termico lavora a carico basso, fuori dal punto
   di BTE ottimo.
2. **La riga «Statale montana 55» di §3.2 non è riconciliabile con le altre sei.** La SPEC non ne
   dichiara né la velocità né il `k_ciclo`, e il suo salto fra 20 e 0 °C (+0,008) è più piccolo di
   quello dell'extraurbano 80 (+0,010) pur avendo più tempo di percorrenza per km, quindi più
   ausiliari. Risolvendo il modello su quelle due celle servirebbe un'energia alle ruote di
   26,8 kWh/100 km, cioè `k_ciclo ≈ 2,9`: più della coda. La riga è tenuta fuori dalla calibrazione
   e lo scarto è mostrato nel pannello di verifica.
3. **L'invariante economico di §11 è violato dalla SPEC stessa.** La ricarica forzata costa
   `1/(0,318 × 8,94) = 0,3518 L/kWh`, mentre §3.2 dichiara `max(g) = 0,356` (coda a 0 °C). Lo scarto
   è 0,004 L/kWh, l'1,2%; §3.2b lo ammette scrivendo «non c'è margine». Nessuna conseguenza pratica:
   §13 vieta comunque la ricarica forzata fuori dai tre casi di §4.4, e «sei in coda e fa freddo» non
   è uno di quelli.

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

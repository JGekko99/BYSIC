# SPEC — Pianificatore SOC per BYD Seal U DM-i **Boost 18,3 kWh**

Webapp (PWA) mobile che dice cosa impostare sull'auto e in quale punto del viaggio, per minimizzare il costo totale benzina + elettricità.

---

## 0. Regole di ingaggio

- **Non scrivere codice** finché non hai fatto le domande della §14 e io non ho risposto.
- **L'algoritmo della §4 è già stato derivato, implementato e validato** contro un DP esatto su cinque profili di viaggio. Implementalo come descritto. Se credi di avere di meglio, dimostralo con i test della §11 prima di sostituirlo.
- **I numeri della §3 e i risultati attesi della §11 sono vincoli, non suggerimenti.** La tua implementazione deve riprodurli.
- **Non inventare costanti.** Tutto in `src/config/vehicle.ts` con valore, unità, fonte, confidenza (`manuale` / `misurato` / `stimato`).
- **Ogni fase è una webapp grafica usabile dal telefono.** Nessun prototipo a riga di comando, nessuna fase "prima il motore poi la UI". La validazione del modello sta nei test automatici e in un pannello di debug interno all'app.
- Se un requisito è impossibile o darebbe risultati inaffidabili, dillo invece di implementarlo male.

---

## 1. Cosa produce l'app

Per ogni viaggio: **2 istruzioni, massimo 3**. È un risultato del calcolo, non una scelta di comodo (§4.5).

> **Alla partenza** → Modalità `HEV` + Sospensione SOC `obbligatoria` al `70%`
> **All'uscita di Bolzano Sud (km 270)** → Modalità di guida `EV`

Più una **checklist con checkpoint** che segue l'esecuzione lungo il viaggio (§5).

---

## 2. Il veicolo — dati confermati

**BYD Seal U DM-i versione Boost, FWD, batteria 18,3 kWh.** Confermata dal proprietario: non è la Comfort/Design (26,6 kWh) né la AWD. Non chiedere di nuovo la versione, ma tieni la capacità in config perché il modello deve restare riusabile.

| Elemento | Valore |
|---|---|
| Batteria | **18,3 kWh LFP Blade**, ~80 km WLTP elettrici (reali ~65–72) |
| Utilizzabile da 100% | **~16,8 kWh** |
| Motore termico | 1.5 Atkinson, ~72 kW |
| Motore elettrico | ~145 kW · sistema 160 kW / 218 CV |
| Ricarica | 11 kW AC, 18 kW DC (30→80% ≈ 35–45 min) |
| Serbatoio | ~60 L (52 L utilizzabili con riserva) |
| Massa a vuoto | ~1.950 kg |

### 2.1 Percorso menu — usare queste parole esatte nelle istruzioni

```
Infotainment → New Energy → Energy Manager  (Nuova energia → Gestione energia)
```
oppure: abbassare la barra di stato in alto sull'infotainment.

Nello stesso menu ci sono: **Impostazione SOC** (slider), **Protezione dell'alimentazione intelligente / forzata**, **Impostazione intensità feedback energia**.

I due nomi ufficiali sul display, da usare nella UI al posto di AUTO/SAVE:
- **Sospensione SOC intelligente** — *"dare priorità al risparmio di carburante e considerare la domanda di sospensione SOC"*
- **Sospensione SOC obbligatoria** — *"dare priorità alla sospensione SOC e mantenere il livello SOC il più vicino possibile al valore impostato"*

### 2.2 Comportamento reale — dal manuale utente (cap. 04, pp. 107–115)

| Fatto | Conseguenza per l'algoritmo |
|---|---|
| Il SOC **oscilla attorno al valore impostato** in marcia stabile | il setpoint è un equilibrio, non un vincolo rigido: banda ±2–3% |
| *"Se la differenza tra la potenza corrente e il valore impostato SOC è elevata, potrebbe essere necessario molto tempo per raggiungere il valore"* | **mai proporre un setpoint più di 15–20 punti sopra il SOC attuale** |
| *"L'intervallo di impostazione SOC può variare a seconda dello stato del veicolo o dell'ambiente"* | **non hardcodare 25–70%**: va in config e la UI deve accettare un range diverso |
| *"Il veicolo regola automaticamente il valore SOC impostato in base all'altitudine e alla temperatura ambiente"* | **l'auto può sovrascrivere la raccomandazione.** Al checkpoint si chiede conferma e si ricalcola. Non insistere |
| *"In caso di SOC elevato, il veicolo passa automaticamente alla modalità EV quando viene acceso"* | **con la batteria carica l'auto parte da sola in EV.** Se il piano vuole HEV, l'istruzione va data esplicitamente o il piano non parte. Deve stare nella checklist di partenza |
| Il setpoint resta memorizzato tra un viaggio e l'altro | la prima schermata chiede sempre "che valore c'è adesso sull'auto?" |
| **Generazione in situ**: a veicolo fermo con SOC basso il motore parte e ricarica; *"dopo aver bloccato il veicolo verrà consumata una piccola quantità di carburante"* | non pianificare arrivo a SOC basso se l'auto resta ferma e non ricaricabile |
| Sosta > 7 giorni: mantenere SOC **tra 40% e 60%** | se l'utente dichiara sosta lunga, il SOC di arrivo target diventa 40–60% |
| Rodaggio: primi 2.000 km in ECO, uso HEV ≥ 50% | flag in config, disattivo |
| Batteria −35…+60 °C, con riscaldamento a bassa temperatura | consumo aggiuntivo sotto ~5 °C |
| Ad alto SOC la ricarica passa a mantenimento e rallenta | l'ultimo 10–15% di ricarica è lento |

### 2.3 Leve disponibili

```
modalità di guida  : { EV, HEV }
sospensione SOC    : { intelligente, obbligatoria }      ← vale SOLO in HEV
valore SOC         : { 25, 30, ... , 70 }                ← range da config
intensità feedback : { standard, alta }                  ← "alta" prima di discese lunghe
```

> **Lo slider non scende sotto il 25%.** Quindi "rilasciare" la batteria per usarla fino in fondo **non si può fare abbassando il valore**: si fa solo passando a modalità **EV**, dove il setpoint non ha effetto e il veicolo scarica fino alla soglia fisica (~8–10%, da confermare col proprietario).
> L'azione di rilascio dell'algoritmo deve quindi essere **sempre `EV`, mai `obbligatoria 25%`**.

---

## 3. Modello energetico — valori già calibrati

Usa questi come punto di partenza in config. Non ripartire da zero.

```
F = m·g·Crr·k_ciclo + ½·ρ·Cd·A·v²·k_ciclo + m·g·sin(θ)
E_ruote = F · d
```

`m ≈ 1950 kg + carico` · `Cd = 0,32` · `A = 2,60 m²` · `Crr = 0,0105`
`k_ciclo`: urbano **1,80** · extraurbano **1,05** · autostrada **1,00** · coda **2,20**

| catena | valore |
|---|---|
| batteria → ruote | 0,86 |
| rigenerazione ruote → batteria | 0,60 |
| BTE termico al punto ottimo | 0,36 |
| **serie** (termico → gen → inv → motore) | **0,312** |
| **presa diretta** (>65 km/h) | **0,323–0,344** |
| **ricarica forzata** (fuel → batteria) | **0,318** |

`P_aux(T)`: 0,45 kW a 20–25 °C · 2,2 kW a 5 °C · 3,0 kW a 0 °C · 4,0 kW a −10 °C · 2,0 kW a 35 °C. Benzina 8,94 kWh/L.

### 3.1 Calibrazione da riprodurre entro ±10%

| condizione | modello | reale |
|---|---|---|
| EV città 30 km/h | 16,1 kWh/100 | ~16 |
| EV extraurbano 80 | 16,4 kWh/100 | ~17 |
| EV autostrada 120 | 25,7 kWh/100 | ~25 |
| HEV città | 5,13 L/100 | ~4,9 |
| HEV extraurbano | 5,32 L/100 | ~5,0 |
| HEV autostrada 120 | 7,47 L/100 | ~6,9 |

### 3.2 Il numero che governa tutto: **g**

`g = consumo_HEV(tratto) / consumo_EV(tratto)` = litri risparmiati per kWh di batteria speso.

| regime | 20 °C | 0 °C |
|---|---|---|
| Coda / passo d'uomo | 0,324 | **0,356** |
| Extraurbano 80 | 0,324 | 0,334 |
| Città 30 | 0,318 | 0,342 |
| Statale montana 55 | 0,311 | 0,319 |
| Autostrada 110 | 0,301 | 0,308 |
| Autostrada 120 | 0,291 | 0,298 |
| Autostrada 130 | **0,281** | 0,287 |

Spread: solo 15% a 20 °C. Tre conseguenze non negoziabili:

**(a)** La batteria vale ~15% di più a bassa velocità che in autostrada a 130.

**(b) La ricarica forzata col motore è sempre in perdita.** Mettere 1 kWh in batteria col termico costa `1/(0,318 × 8,94) = 0,351 L/kWh`. Il valore massimo ottenibile da quel kWh è 0,356 L/kWh (coda a 0 °C). Non c'è margine. **Mai proporre un setpoint sopra il SOC attuale**, tranne per i tre motivi della §4.4.

**(c) Fermarsi a ricaricare non conviene quasi mai.** Break-even a benzina 1,72 €/L: **0,48 €/kWh** (energia usata in autostrada), **0,53 €/kWh** (in città). I DC pubblici italiani stanno a 0,55–0,85. Vedi §8.

---

## 4. L'ALGORITMO — implementalo esattamente così

### 4.1 Perché non un DP

Confrontati su cinque profili di viaggio:

| approccio | scostamento dall'ottimo | problema |
|---|---|---|
| DP esatto sullo stato SOC (griglia 0,5%) | 0 (riferimento) | policy che cambia ogni pochi km: **ineseguibile** |
| Allocazione analitica + soglie decrescenti | +0,2 … +1,6% | genera ~10 istruzioni |
| **Ricerca diretta sul piano a K istruzioni** | **±0,2%** | nessuno: è ciò che l'utente esegue davvero |

La ricerca diretta pareggia o batte il DP perché ottimizza esattamente l'oggetto eseguito, senza post-processing che perde qualità. Ed è più semplice da scrivere e da testare.

### 4.2 Il simulatore — scrivilo per primo, è il cuore

```ts
type Azione =
  | { modo: 'EV' }
  | { modo: 'HEV', sospensione: 'intelligente' }
  | { modo: 'HEV', sospensione: 'obbligatoria', soc: number }   // 25..70

function step(tratto, socKwh, azione, tempC, massa): { socKwh: number, litri: number }
```

Comportamento da modellare:

- **EV**: la batteria copre tutto finché `SOC > soglia_fisica` (~8%, config). Sotto, il veicolo ripiega da solo su HEV.
- **HEV + intelligente**: priorità al carburante. Scarica la batteria se c'è (fino a ~22%), **non risale mai attivamente**. Sotto, charge-sustaining.
- **HEV + obbligatoria @ s**:
  - `SOC > s` → viaggia in **elettrico** finché scende a `s`. **Il setpoint è un pavimento, non un target.** È l'osservazione su cui si regge tutto il progetto.
  - `SOC ≈ s` → mantenimento, consumo = HEV puro
  - `SOC < s` → ricarica forzata a ~5 kW medi, `litri += kWh_ricaricati / (0,318 × 8,94)`
- **In discesa** (`E_ruote < 0`): rigenerazione a 0,60 con tetto a SOC 100%. **L'energia oltre il tetto va contata come persa** — è ciò che rende necessario l'headroom (§4.4).

### 4.3 La ricerca

```
1. Segmenta il percorso in sottotratti omogenei da ~4 km
   (tipo strada, velocità media prevista, pendenza media)

2. Candidati punto di rilascio = SOLO waypoint riconoscibili dal guidatore:
   caselli, uscite autostradali, ingressi in città, aree di servizio, valichi.
   Tipicamente 5–20, NON tutti i sottotratti. La qualità del piano dipende
   più da questi che dall'ottimizzatore.

3. Candidati azione = { EV, HEV+intelligente } ∪ { HEV+obbligatoria @ 25..70 step 5 }

4. Per K = 1, 2, 3:
     per ogni combinazione di (K−1) punti di rilascio × K azioni:
        simula con step(); scarta se SOC_arrivo < riserva richiesta
        tieni il minimo di:  litri × prezzo_benzina + kWh_usati × prezzo_kWh

5. Presenta il K più piccolo che sta entro l'1% dal migliore. K=2 basta quasi sempre.

6. Riporta SEMPRE nel risultato il confronto con:
     - "tutto sospensione intelligente"   (cosa succede se non fa niente)
     - "obbligatoria 70% e via"           (l'errore istintivo)
     - il limite teorico del DP           (solo in pannello debug)
```

Costo: ~15 waypoint × 12 × 12 ≈ 2.200 simulazioni da ~80 passi. Decine di millisecondi in browser. Per K=3 usa beam search se serve.

### 4.4 I tre casi in cui la ricarica forzata è giustificata — e solo questi

1. **Riserva di potenza per salita lunga**: dislivello > 500 m con SOC previsto < 20%.
2. **Headroom per la rigenerazione prima di una discesa lunga.** `E_recuperabile = m·g·Δh·0,60`. Su **18,3 kWh con 2.200 kg**:

   | discesa | recuperabili | punti di SOC |
   |---|---|---|
   | 500 m | 1,80 kWh | **9,8%** |
   | 770 m | 2,77 kWh | **15,1%** |
   | 900 m | 3,24 kWh | **17,7%** |
   | 1.100 m | 3,96 kWh | **21,6%** |

   Il SOC previsto in cima non deve superare `100% − headroom`. In quel caso si **abbassa** il setpoint (non si alza) e si mette l'intensità feedback su **alta**.
3. **Vincolo di sosta**: auto ferma e non ricaricabile → arrivo ≥ 25%; sosta > 7 giorni → 40–60%. Se serve ricarica forzata, **falla in autostrada a velocità costante** (dove il manuale conferma che il motore aziona il generatore nelle condizioni migliori), mai in città o in coda.

### 4.5 Perché 2 istruzioni — risultati misurati sulla Boost

**Milano → Ortisei, 321 km, 2 persone (2.200 kg), 18,3 kWh, benzina 1,72 €/L, elettricità 0,25 €/kWh, partenza 100%:**

| piano | 20 °C | 2 °C |
|---|---|---|
| **2 istruzioni (ottimo)** | **39,18 €** · 20,41 L · arrivo 10,8% | **42,45 €** · 22,29 L |
| Solo EV, nient'altro | 39,63 € (+0,45) | 42,90 € (+0,45) |
| Sospensione intelligente | 40,43 € (+1,25) | 43,81 € (+1,36) |
| **"Obbligatoria 70%" e via** | **42,56 € (+3,38)** | 45,83 € (+3,38) |

Piani trovati: a 20 °C `obbligatoria 70%` → `EV` al km 270; a 2 °C `obbligatoria 65%` → `EV` al km 270; con arrivo richiesto al 40% la seconda istruzione diventa `obbligatoria 35–40%`.

**Tre letture da incorporare nella UI:**

- **L'istruzione che vale è il RILASCIO, non il mantenimento.** Dimenticarsi di rilasciare costa 3,38 €; sbagliare il livello di mantenimento ne costa 0,10. Se l'utente ne esegue una sola, deve essere la seconda. Il checkpoint di rilascio va marcato **critico** (§5).
- **Con la batteria da 18,3 kWh il margine è sottile.** Su 321 km il guadagno rispetto a "guido e basta in EV" è 0,45 € (1,1%). Il valore vero dell'app è impedire i due errori grossi, non spremere l'ultimo percento. **Dillo all'utente, non fingere il contrario.**
- **Spesso non serve fare niente.** Regola: se il risparmio previsto è **< 2% o < 1,50 €**, mostrare "su questo viaggio la strategia non cambia nulla" e **nessuna istruzione**.

---

## 5. Checkpoint — requisito centrale, non un dettaglio della UI

Il piano vale zero se non viene eseguito nei punti giusti. Il sistema di checkpoint è **una delle tre parti principali dell'app**, insieme al modello e all'ottimizzatore.

### 5.1 Modello dati

```ts
type Checkpoint = {
  id: string
  tipo: 'partenza' | 'istruzione' | 'verifica' | 'arrivo'
  km: number                  // progressiva sul percorso
  coord: { lat: number, lng: number }
  raggio: number              // metri, default 800 (1500 in autostrada)
  nome: string                // "Uscita Bolzano Sud", "Casello Milano Nord"
  critico: boolean            // true per il rilascio
  azione?: Azione             // null per i checkpoint di sola verifica
  socPrevisto: number         // % attesa dal piano in quel punto
  stato: 'attesa' | 'armato' | 'fatto' | 'saltato'
  socReale?: number           // inserito dall'utente
  eseguitoAlle?: string
}
```

Persistenza in **IndexedDB**. Un viaggio interrotto si riprende dove era rimasto: alla riapertura l'app propone *"hai un viaggio in corso, riprendi?"*.

### 5.2 Tipi di checkpoint

- **Partenza** — checklist pre-viaggio, da fare **da fermi**, prima di muoversi. Contenuto specifico per questa auto:
  1. Leggi il SOC attuale e confermalo (l'app lo usa come input reale)
  2. Leggi il valore SOC memorizzato dall'ultimo viaggio
  3. **Modalità di guida → HEV** (con batteria carica l'auto si è messa da sola in EV, §2.2)
  4. Sospensione SOC → **obbligatoria**
  5. Valore → X%
  6. Se il percorso ha discese lunghe: intensità feedback energia → **alta**
  7. Conferma livello carburante
- **Istruzione** — i punti di azione, massimo 3. Il rilascio è `critico: true`.
- **Verifica** — nessuna azione, l'app chiede solo *"che SOC ti mostra adesso?"* per ricalibrare. Piazzane 2–4 su un viaggio lungo, in punti dove ci si può fermare (aree di servizio).
- **Arrivo** — chiusura: SOC finale, litri effettivi, km reali → alimentano la calibrazione.

### 5.3 Riconoscimento

- `navigator.geolocation.watchPosition` mentre la modalità viaggio è aperta, con **Screen Wake Lock API** per tenere lo schermo acceso.
- Entrata nel raggio → il checkpoint passa ad `armato` → card a tutto schermo + `navigator.vibrate()` + suono breve.
- **"Sono qui" manuale sempre disponibile**, in cima alla schermata, non nascosto in un menu.
- Se il GPS si perde: stima per tempo trascorso e velocità media, e proponi il checkpoint con un *"dovresti essere circa qui, confermi?"*.
- **Limite da rispettare, non da nascondere:** senza notifiche push e in browser mobile il GPS in background non è affidabile (iOS sospende le tab). Scrivilo nel README e mostralo nella UI la prima volta che si avvia un viaggio.

### 5.4 Divergenze

A ogni checkpoint l'utente inserisce il SOC reale.

- Se `|reale − previsto| > 5 punti` → **ricalcola il piano residuo** e mostra cosa cambia, evidenziando la differenza.
- Se l'auto ha corretto da sola il setpoint (succede con quota e temperatura, §2.2) → **assecondala**, non riproporre il valore originale. Mostra: *"l'auto ha messo 62% invece di 70%, va bene così, prosegui"*.
- Ogni divergenza va registrata: è il dato che serve alla calibrazione della v2.

### 5.5 Sicurezza

Ogni istruzione riporta *"esegui da fermo o fai eseguire al passeggero"* e il percorso menu completo della §2.1. Nessun checkpoint va piazzato in punti di manovra (svincoli, rotonde, immissioni).

---

## 6. Input

**Onboarding (una tantum)**: capacità batteria (**18,3 kWh preimpostata**), range SOC ammesso dall'auto, soglia fisica minima in EV, pneumatici, prezzo elettricità casa e colonnina, prezzo benzina, consumi reali osservati se noti.

**Per viaggio**: partenza · arrivo · tappe · ora di partenza · **SOC attuale** · **valore di setpoint attualmente memorizzato nell'auto** · livello carburante · temperatura (da API meteo, con override) · passeggeri e carico kg · box da tetto · **ricarica a destinazione** (no / presa domestica / wallbox / AC / DC) · **quanto resta ferma l'auto a destinazione** · SOC di riserva desiderato · **solo HEV o switch EV consentito** · velocità autostradale abituale (110/120/130) · stile di guida · obiettivo (min costo / min benzina / min tempo).

---

## 7. Percorso

- **Google Routes API** con `departure_time` per `duration_in_traffic` (lo stesso motore del navigatore BYD).
- **Google Elevation API**, profilo campionato ogni 200–500 m.
- Segmentazione in tratti omogenei per tipo strada / velocità / pendenza.
- **Estrazione dei waypoint riconoscibili** dagli step: sono sia i candidati punto di rilascio (§4.3) sia i checkpoint (§5).
- ToS Google Maps Platform: i dati Directions non si possono usare senza mostrare una mappa Google né cachare a lungo. Se è un problema, proponi OpenRouteService/Valhalla + OpenTopoData e spiegami il trade-off.

---

## 8. Opzione "nessuna sosta di ricarica" — attiva di default

Tre stati: **`mai`** (default) · **`solo se necessario`** (autonomia) · **`se conviene`**.

Autonomia con 52 L utilizzabili, più ~65 km di batteria piena:

| regime | 20 °C | 2 °C |
|---|---|---|
| Autostrada 110 | 754 km | 696 km |
| Autostrada 120 | 692 km | 647 km |
| Autostrada 130 | 640 km | 604 km |
| Extraurbano 80 | 968 km | 843 km |

**Praticamente qualunque viaggio italiano è fattibile senza soste.** L'app lo verifica e lo dice: *"nessuna sosta necessaria, arrivi con X litri di margine"*.

Se l'utente sceglie "se conviene", mostra il break-even invece di decidere al posto suo:

> A benzina 1,72 €/L conviene ricaricare solo **sotto 0,48 €/kWh** (energia usata in autostrada) o **0,53 €/kWh** (in città). Una sosta DC 30→80% sulla Boost = 9,2 kWh in ~30 min. A 0,70 €/kWh spendi 6,44 € per risparmiarne 4,42 di benzina: **perdi 2 € e mezz'ora.**

**Mai proporre una sosta DC sopra il break-even**, se non per autonomia. Una sosta AC lenta durante una tappa che l'utente fa comunque (pranzo, visita) è invece sempre valutabile, perché il tempo è già speso.

---

## 9. Interfaccia

PWA mobile-first, installabile, funzionante offline dopo il calcolo del piano.

1. **Onboarding auto**
2. **Nuovo viaggio** — due modi di inserimento, entrambi permanenti: **automatico** (indirizzi → routing + altimetria) e **manuale** (km autostrada / extraurbano / urbano, dislivello, temperatura). Il manuale è fallback offline e banco di prova del modello.
3. **Piano** — mappa, timeline delle 2–3 istruzioni, grafico SOC previsto vs km, e **il confronto con "non faccio niente" e con "obbligatoria 70%"** in euro e litri, con banda di incertezza. Sotto soglia, il piano dice esplicitamente di non fare nulla.
4. **Modalità viaggio** — §5. Checkpoint corrente in grande, prossima azione, "Fatto ✓", "Sono qui", SOC reale.
5. **Storico e riepilogo** — lista dei viaggi, consumi previsti vs reali.

---

## 10. Stack

React + Vite + TypeScript, Tailwind, Zustand, Dexie (IndexedDB), Recharts, Leaflet o Google Maps JS. Nessun backend in v1. Chiavi API in variabili d'ambiente, **mai una chiave Google nel bundle client senza restrizioni di referrer**. Se proponi altro, motivalo prima di iniziare.

---

## 11. Test — con i valori attesi

- **Modello fisico**: conservazione energia, monotonicità, casi limite (pendenza negativa, SOC minimo, −10 °C, +38 °C, carico massimo). Calibrazione entro ±10% dalla §3.1.
- **Tabella `g`** della §3.2 riprodotta entro ±0,01 L/kWh.
- **Invariante economico**: `costo_ricarica_forzata = 0,351 L/kWh` deve risultare ≥ `max(g)` in ogni condizione testata. Se un test lo viola, il modello ha un errore.
- **Ottimizzatore**: implementa un DP a griglia **solo nei test**, come limite inferiore. Il piano a 2 istruzioni non deve mai discostarsi di più del 2%.

**Scenari di regressione — Boost 18,3 kWh, benzina 1,72 €/L, elettricità 0,25 €/kWh, partenza 100%:**

| scenario | costo atteso | piano atteso |
|---|---|---|
| Milano→Ortisei 321 km, 2.200 kg, 20 °C, arrivo 10% | **39,18 €** ± 5% | obbligatoria 70% → EV a ~km 270 |
| idem a 2 °C | **42,45 €** ± 5% | obbligatoria 65% → EV a ~km 270 |
| idem, arrivo richiesto 40% | **40,75 €** ± 5% | obbligatoria 70% → obbligatoria 35% |
| Milano→Somma Lombardo A/R 100 km, 2.070 kg, 20 °C | **6,48 €** · 1,33 L | guadagno sotto soglia → nessuna istruzione |
| Milano→Roma 607 km, 20 °C | **76,43 €** · 42 L | quasi indifferente, delta < 0,30 € |
| Milano→Bergamo 58 km, 20 °C | **3,81 €** · 0 L | piano vuoto, solo EV |
| Giro montano ±900 m, 100 km | **3,85 €** · 0 L | deve comparire il vincolo di headroom (17,7%) |
| Anti-pattern "obbligatoria 70% e via" su Milano→Ortisei | **42,56 €** | deve risultare il peggiore di tutti |

- **Checkpoint**: test del ciclo di vita degli stati, della persistenza (chiudi e riapri il browser a metà viaggio), del ricalcolo su divergenza > 5 punti, del fallback manuale con GPS assente.
- **Backtesting**: script che, dato un log reale di viaggi, calcola l'errore del modello. Obiettivo dichiarato **±10%**, non "perfetto".

---

## 12. Ordine di costruzione

Una sola fase di consegna: **webapp completa**. La UI cresce insieme al motore, non dopo. Fermati dopo ogni punto e mostrami il risultato a schermo.

1. Scheletro PWA + navigazione + onboarding auto → già navigabile dal telefono
2. Modello energetico §3 + schermata "percorso manuale" → un piano a schermo subito
3. Simulatore §4.2 + ricerca §4.3, con pannello di debug che mostra tutti i piani valutati e il confronto col DP
4. Sistema di checkpoint §5 + modalità viaggio + persistenza
5. Routing e altimetria reali §7, che sostituiscono l'input manuale come modo predefinito
6. Grafici, confronti, storico

Poi: **v2** calibrazione automatica sui viaggi reali · **v3** notifiche push, condivisione, OBD.

---

## 13. Cosa NON fare

- Non promettere precisione che il modello non ha: l'app non legge nulla dall'auto.
- Non generare più di 3 istruzioni.
- Non generare istruzioni se il risparmio è sotto il 2% o 1,50 €.
- **Mai un setpoint sopra il SOC attuale** fuori dai tre casi §4.4.
- Mai un salto di setpoint > 15–20 punti sopra il SOC attuale.
- Non hardcodare l'intervallo 25–70%.
- **Mai `obbligatoria 25%` come azione di rilascio: deve essere `EV`.**
- Non abbinare una percentuale alla modalità EV: lì il setpoint non ha effetto.
- Non proporre soste DC sopra il break-even se non per autonomia.
- Non insistere su un setpoint che l'auto ha corretto da sola per quota/temperatura.
- Non pianificare arrivo a SOC basso se l'auto resta ferma senza ricarica.
- Non piazzare checkpoint in punti di manovra.
- Non nascondere i limiti del geofencing in browser: scrivili nel README.

---

## 14. Domande da farmi PRIMA di scrivere codice

1. Che intervallo ti lascia impostare lo slider SOC nel tuo menu? (il manuale dice che varia)
2. A che percentuale si ferma l'auto guidando in EV fino a esaurimento? Serve per la soglia fisica.
3. Hai foto dei menu SOC e modalità di guida? Servono per le istruzioni testuali esatte.
4. Wallbox a casa o presa domestica? A che prezzo carichi? Tariffa bioraria?
5. Hai già dati reali di consumo (kWh/100 in EV, L/100 in HEV) per la calibrazione?
6. Chiave Google Maps Platform con billing attiva, o vado su alternativa open?
7. Su quale viaggio vuoi che ottimizzi per primo?

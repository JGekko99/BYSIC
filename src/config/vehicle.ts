/**
 * Config unica del veicolo e del modello.
 *
 * REGOLA (SPEC §0): nessuna costante numerica vive fuori da questo file.
 * Ogni voce dichiara valore, unità, fonte e confidenza:
 *   - 'manuale'  : letto sul manuale utente BYD o sul display dell'auto
 *   - 'misurato' : verificato dal proprietario sul suo esemplare
 *   - 'stimato'  : derivato/calibrato, da confermare sul campo
 */

export type Confidenza = 'manuale' | 'misurato' | 'stimato'

export type Costante<T = number> = {
  readonly valore: T
  readonly unita: string
  readonly fonte: string
  readonly confidenza: Confidenza
  readonly note?: string
}

const c = <T>(
  valore: T,
  unita: string,
  fonte: string,
  confidenza: Confidenza,
  note?: string,
): Costante<T> => ({ valore, unita, fonte, confidenza, note })

// ─────────────────────────────────────────────────────────────────────────────
// Veicolo — BYD Seal U DM-i Boost, FWD, 18,3 kWh  (SPEC §2)
// ─────────────────────────────────────────────────────────────────────────────

export const VEICOLO = {
  nome: 'BYD Seal U DM-i Boost (FWD, 18,3 kWh)',

  batteria: {
    capacita: c(18.3, 'kWh', 'SPEC §2 — confermato dal proprietario', 'misurato'),
    utilizzabileDa100: c(16.8, 'kWh', 'SPEC §2', 'manuale'),
    chimica: 'LFP Blade',
    /**
     * SOC sotto cui il veicolo abbandona da solo la modalità EV (SPEC §4.2).
     * NON confermato: il proprietario non ha mai guidato in EV fino a esaurimento.
     * Il pannello di debug mostra la sensibilità del piano a 8 / 10 / 15 %.
     */
    sogliaFisicaEV: c(8, '% SOC', 'SPEC §4.2 — da confermare sul campo', 'stimato'),
    tempMin: c(-35, '°C', 'SPEC §2.2 / manuale cap. 04', 'manuale'),
    tempMax: c(60, '°C', 'SPEC §2.2 / manuale cap. 04', 'manuale'),
    tempRiscaldamento: c(5, '°C', 'SPEC §2.2 — consumo aggiuntivo sotto questa soglia', 'manuale'),
  },

  /**
   * Intervallo dello slider "Impostazione SOC".
   * SPEC §13: NON hardcodare 25–70, il manuale dice che varia con stato e ambiente.
   * stepUI = granularità dello slider sull'auto (risposta proprietario: 1 punto).
   * stepRicerca = granularità della ricerca §4.3 (5 punti), poi arrotondata in UI.
   */
  socSetpoint: {
    min: c(25, '% SOC', 'Verificato dal proprietario sul menu Energy Manager', 'misurato'),
    max: c(70, '% SOC', 'Verificato dal proprietario sul menu Energy Manager', 'misurato'),
    stepUI: c(1, '% SOC', 'Verificato dal proprietario', 'misurato'),
    stepRicerca: c(5, '% SOC', 'SPEC §4.3', 'manuale'),
    bandaOscillazione: c(
      3,
      '% SOC',
      'SPEC §2.2 — il SOC oscilla attorno al setpoint, ±2–3 punti',
      'manuale',
    ),
    /** SPEC §13: mai un salto di setpoint oltre questo valore sopra il SOC attuale. */
    maxSaltoSopraSocAttuale: c(15, 'punti SOC', 'SPEC §2.2 / §13 (15–20, preso il conservativo)', 'manuale'),
  },

  motore: {
    termicoPotenza: c(72, 'kW', 'SPEC §2 — 1.5 Atkinson', 'manuale'),
    elettricoPotenza: c(145, 'kW', 'SPEC §2', 'manuale'),
    sistemaPotenza: c(160, 'kW', 'SPEC §2 — 218 CV', 'manuale'),
  },

  massa: {
    aVuoto: c(1950, 'kg', 'SPEC §2/§3', 'manuale'),
    perPasseggero: c(75, 'kg', 'convenzione', 'stimato'),
    boxDaTetto: c(20, 'kg', 'massa tipica box + contenuto leggero', 'stimato'),
  },

  aerodinamica: {
    cd: c(0.32, '—', 'SPEC §3', 'stimato'),
    areaFrontale: c(2.6, 'm²', 'SPEC §3', 'stimato'),
    crr: c(0.0105, '—', 'SPEC §3', 'stimato'),
    /** Penalità aerodinamica del box da tetto, applicata come fattore su Cd·A. */
    fattoreBoxDaTetto: c(1.15, '—', 'stima di letteratura', 'stimato'),
  },

  serbatoio: {
    capacita: c(60, 'L', 'SPEC §2', 'manuale'),
    utilizzabile: c(52, 'L', 'SPEC §2 — netto riserva', 'manuale'),
  },

  ricarica: {
    ac: c(11, 'kW', 'SPEC §2', 'manuale'),
    dc: c(18, 'kW', 'SPEC §2 — 30→80% in 35–45 min', 'manuale'),
    domestica: c(2.3, 'kW', 'presa Schuko 10 A', 'stimato'),
    /** Sopra questo SOC la ricarica passa a mantenimento e rallenta (SPEC §2.2). */
    socMantenimento: c(85, '% SOC', 'SPEC §2.2 — ultimo 10–15% lento', 'manuale'),
  },

  rodaggio: {
    attivo: c(false, '—', 'SPEC §2.2 — flag, disattivo', 'manuale'),
    km: c(2000, 'km', 'SPEC §2.2 — primi 2.000 km in ECO, HEV ≥ 50%', 'manuale'),
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Modello energetico  (SPEC §3)
// ─────────────────────────────────────────────────────────────────────────────

export const FISICA = {
  g: c(9.81, 'm/s²', 'costante fisica', 'manuale'),
  densitaAria: c(1.225, 'kg/m³', 'aria a livello del mare, 15 °C', 'manuale'),
  energiaBenzina: c(8.94, 'kWh/L', 'SPEC §3', 'manuale'),
} as const

/** k_ciclo: penalità di ciclo per tipo di percorrenza (SPEC §3). */
export const K_CICLO = {
  urbano: c(1.8, '—', 'SPEC §3', 'stimato'),
  extraurbano: c(1.05, '—', 'SPEC §3', 'stimato'),
  autostrada: c(1.0, '—', 'SPEC §3', 'stimato'),
  coda: c(2.2, '—', 'SPEC §3', 'stimato'),
} as const

export type TipoStrada = keyof typeof K_CICLO

/** Catene di efficienza (SPEC §3). */
export const EFFICIENZA = {
  batteriaRuote: c(0.86, '—', 'SPEC §3', 'stimato'),
  rigenerazione: c(0.6, '—', 'SPEC §3 — ruote → batteria', 'stimato'),
  bteTermico: c(0.36, '—', 'SPEC §3 — BTE al punto ottimo', 'stimato'),
  serie: c(0.312, '—', 'SPEC §3 — termico → gen → inv → motore', 'stimato'),
  presaDiretta: c(0.334, '—', 'SPEC §3 — media di 0,323–0,344, sopra 65 km/h', 'stimato'),
  presaDirettaMin: c(0.323, '—', 'SPEC §3', 'stimato'),
  presaDirettaMax: c(0.344, '—', 'SPEC §3', 'stimato'),
  ricaricaForzata: c(0.318, '—', 'SPEC §3 — fuel → batteria', 'stimato'),
  /** Sopra questa velocità il termico può andare in presa diretta (SPEC §3). */
  sogliaPresaDiretta: c(65, 'km/h', 'SPEC §3', 'manuale'),
  /** Potenza media di ricarica forzata in HEV+obbligatoria sotto setpoint (SPEC §4.2). */
  potenzaRicaricaForzata: c(5, 'kW', 'SPEC §4.2', 'stimato'),
} as const

/**
 * P_aux(T): ausiliari (clima, riscaldamento batteria, servizi) — SPEC §3.
 * Interpolata linearmente fra i punti, costante agli estremi.
 */
export const P_AUX: ReadonlyArray<{ tempC: number; kW: number }> = [
  { tempC: -10, kW: 4.0 },
  { tempC: 0, kW: 3.0 },
  { tempC: 5, kW: 2.2 },
  { tempC: 20, kW: 0.45 },
  { tempC: 25, kW: 0.45 },
  { tempC: 35, kW: 2.0 },
]

// ─────────────────────────────────────────────────────────────────────────────
// Regole di pianificazione  (SPEC §4, §5, §8, §13)
// ─────────────────────────────────────────────────────────────────────────────

export const PIANIFICAZIONE = {
  maxIstruzioni: c(3, '—', 'SPEC §13 — non generare più di 3 istruzioni', 'manuale'),
  /** Sotto queste soglie il piano è "non fare niente" (SPEC §4.5). */
  sogliaRisparmioPercentuale: c(2, '%', 'SPEC §4.5 / §13', 'manuale'),
  sogliaRisparmioEuro: c(1.5, '€', 'SPEC §4.5 / §13', 'manuale'),
  /** Un K più piccolo vince se sta entro questa distanza dal migliore (SPEC §4.3). */
  tolleranzaK: c(1, '%', 'SPEC §4.3', 'manuale'),
  lunghezzaSottotratto: c(4, 'km', 'SPEC §4.3 — segmentazione in tratti omogenei', 'manuale'),
  /** Headroom rigenerazione: soglie di dislivello che attivano il vincolo (SPEC §4.4). */
  discesaRilevante: c(500, 'm', 'SPEC §4.4', 'manuale'),
  salitaRilevante: c(500, 'm', 'SPEC §4.4 — riserva di potenza se SOC previsto < 20%', 'manuale'),
  socCriticoSalita: c(20, '% SOC', 'SPEC §4.4', 'manuale'),
  /** Vincoli di sosta a destinazione (SPEC §2.2 / §4.4). */
  sostaLungaGiorni: c(7, 'giorni', 'SPEC §2.2', 'manuale'),
  sostaLungaSocMin: c(40, '% SOC', 'SPEC §2.2', 'manuale'),
  sostaLungaSocMax: c(60, '% SOC', 'SPEC §2.2', 'manuale'),
  sostaFermaSocMin: c(25, '% SOC', 'SPEC §4.4 — auto ferma e non ricaricabile', 'manuale'),
} as const

export const CHECKPOINT = {
  raggioDefault: c(800, 'm', 'SPEC §5.1', 'manuale'),
  raggioAutostrada: c(1500, 'm', 'SPEC §5.1', 'manuale'),
  /** Divergenza oltre la quale si ricalcola il piano residuo (SPEC §5.4). */
  divergenzaSocRicalcolo: c(5, 'punti SOC', 'SPEC §5.4', 'manuale'),
  verificheConsigliate: c(3, '—', 'SPEC §5.2 — 2–4 su un viaggio lungo', 'manuale'),
} as const

export const PREZZI_DEFAULT = {
  benzina: c(1.72, '€/L', 'SPEC §4.5 / §11 — scenario di riferimento', 'stimato'),
  elettricitaCasa: c(0.25, '€/kWh', 'SPEC §4.5 / §11', 'stimato'),
  elettricitaColonnina: c(0.7, '€/kWh', 'SPEC §8 — DC pubblici italiani 0,55–0,85', 'stimato'),
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Percorso menu infotainment — stringhe esatte da mostrare nelle istruzioni
// (SPEC §2.1, §5.5). Da verificare sulle foto del display.
// ─────────────────────────────────────────────────────────────────────────────

export const MENU = {
  percorso: 'Infotainment → New Energy → Energy Manager',
  percorsoIt: 'Nuova energia → Gestione energia',
  scorciatoia: 'oppure: abbassa la barra di stato in alto sull’infotainment',
  voceSetpoint: 'Impostazione SOC',
  sospensioneIntelligente: 'Sospensione SOC intelligente',
  sospensioneObbligatoria: 'Sospensione SOC obbligatoria',
  descrizioneIntelligente:
    'dare priorità al risparmio di carburante e considerare la domanda di sospensione SOC',
  descrizioneObbligatoria:
    'dare priorità alla sospensione SOC e mantenere il livello SOC il più vicino possibile al valore impostato',
  feedbackEnergia: 'Impostazione intensità feedback energia',
  avvisoSicurezza: 'Esegui da fermo o fai eseguire al passeggero.',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Calibrazione dedotta dalle tabelle §3.1 e §3.2
//
// I valori qui sotto NON sono inventati: sono ricavati risolvendo il modello
// contro le tabelle della SPEC, che §0 e §11 dichiarano vincolanti.
// Il procedimento è in `src/model/catena.ts` e verificato in `calibrazione.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export const CALIBRAZIONE = {
  /**
   * Massa a cui è stata costruita la tabella §3.1.
   * Non è dichiarata nella SPEC: 2.100 kg è l'unico valore che riproduce tutte
   * e tre le righe EV entro lo 0,3% (a 1.950 kg lo scarto è −5,4% / −3,0% / −2,1%).
   * Corrisponde alla massa a vuoto più due persone e bagaglio.
   */
  massa: c(2100, 'kg', 'dedotta: riproduce §3.1 entro 0,3%', 'stimato'),

  /**
   * Efficienza fuel → energia ausiliaria in HEV.
   * Ricavata imponendo che l'efficienza di catena risulti la stessa a 20 °C e a
   * 0 °C su tutte le righe di §3.2: l'ottimo è netto e il residuo è 0,0045.
   * È la validazione più forte che ho del modello — sei regimi per due
   * temperature, dodici dati, e la catena esce indipendente dalla temperatura.
   */
  etaAusiliari: c(0.299, '—', 'calibrato su §3.2 (20 °C e 0 °C)', 'stimato'),

  /**
   * Efficienza della catena termica in funzione della velocità.
   *
   * Conferma i valori di §3 alle estremità: 0,311 a bassa velocità ≈ «serie
   * 0,312», e 0,322–0,345 a 110–130 km/h ≈ «presa diretta 0,323–0,344».
   * Li smentisce in mezzo: a 80 km/h la catena reale vale 0,299, PEGGIO della
   * serie. Lettura fisica: a 80 in presa diretta il termico lavora a carico
   * basso, fuori dal punto di BTE ottimo; in città la modalità serie lo tiene
   * al suo punto migliore. Per questo la §3.2 dà g più alto a 80 che a 30.
   *
   * Interpolazione lineare fra i nodi, costante agli estremi.
   */
  catenaTermica: [
    { vKmh: 10, eta: 0.3107 },
    { vKmh: 30, eta: 0.3078 },
    { vKmh: 80, eta: 0.2989 },
    { vKmh: 110, eta: 0.3223 },
    { vKmh: 120, eta: 0.333 },
    { vKmh: 130, eta: 0.3451 },
  ] as ReadonlyArray<{ vKmh: number; eta: number }>,
} as const

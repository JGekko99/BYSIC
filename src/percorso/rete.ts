/**
 * Chiamate di rete verso i servizi esterni, con errori che dicono cosa fare.
 *
 * Un `fetch` che fallisce dà messaggi diversi in ogni browser — «Failed to
 * fetch» su Chrome, «NetworkError when attempting to fetch resource» su
 * Firefox — e nessuno dei due dice all'utente se ha senso riprovare. Le cause
 * sono tre e vogliono risposte diverse: il dispositivo è offline, il servizio
 * non risponde, oppure l'ambiente non lascia proprio uscire le richieste.
 */

export type CausaRete = 'offline' | 'bloccato' | 'lento' | 'servizio' | 'sconosciuta'

export class ErroreRete extends Error {
  constructor(
    readonly causa: CausaRete,
    messaggio: string,
    readonly stato?: number,
  ) {
    super(messaggio)
    this.name = 'ErroreRete'
  }
}

/** Vero se la pagina gira dentro un iframe, dove le chiamate esterne sono spesso bloccate. */
export function dentroUnaCornice(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // Accedere a window.top da un'origine opaca solleva: siamo di sicuro dentro.
    return true
  }
}

const MESSAGGIO_CORNICE =
  'Questa anteprima non lascia uscire le richieste verso l’esterno, quindi percorso e altimetria non si possono calcolare qui. Inserisci il viaggio a mano qui sotto, oppure apri l’app installata.'

const MESSAGGIO_OFFLINE =
  'Il dispositivo risulta offline. Il piano si può comunque calcolare con l’inserimento manuale.'

const MESSAGGIO_BLOCCATO =
  'Non riesco a raggiungere il servizio: la richiesta viene rifiutata prima di partire. Può succedere con un blocco pubblicità, una VPN o una rete aziendale.'

/**
 * `fetch` con tempo massimo e con gli errori già interpretati.
 * Il tempo massimo serve: senza, una richiesta che non risponde lascia
 * l'indicatore di caricamento acceso per sempre.
 */
export async function chiedi(
  url: string,
  opzioni: RequestInit & { attesaMassimaMs?: number; nomeServizio?: string } = {},
): Promise<Response> {
  const { attesaMassimaMs = 20000, nomeServizio = 'Il servizio', ...resto } = opzioni
  const controller = new AbortController()
  const scadenza = setTimeout(() => controller.abort(), attesaMassimaMs)

  // Un segnale già fornito dal chiamante (annullamento della ricerca) va rispettato.
  resto.signal?.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    const risposta = await fetch(url, { ...resto, signal: controller.signal })
    if (risposta.status === 429) {
      throw new ErroreRete(
        'servizio',
        `${nomeServizio} ha chiesto di rallentare. Riprova fra un minuto.`,
        429,
      )
    }
    if (!risposta.ok) {
      throw new ErroreRete('servizio', `${nomeServizio} ha risposto ${risposta.status}.`, risposta.status)
    }
    return risposta
  } catch (e) {
    if (e instanceof ErroreRete) throw e

    // Annullamento voluto dal chiamante: non è un errore da mostrare.
    if (resto.signal?.aborted) throw e

    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ErroreRete('lento', `${nomeServizio} non ha risposto entro ${Math.round(attesaMassimaMs / 1000)} secondi.`)
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new ErroreRete('offline', MESSAGGIO_OFFLINE)
    }
    if (dentroUnaCornice()) {
      throw new ErroreRete('bloccato', MESSAGGIO_CORNICE)
    }
    throw new ErroreRete('bloccato', MESSAGGIO_BLOCCATO)
  } finally {
    clearTimeout(scadenza)
  }
}

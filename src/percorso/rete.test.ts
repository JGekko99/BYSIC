import { afterEach, describe, expect, it, vi } from 'vitest'
import { chiedi, ErroreRete } from './rete'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const risposta = (corpo: unknown, stato = 200) =>
  new Response(JSON.stringify(corpo), { status: stato })

describe('errori di rete che dicono cosa fare', () => {
  it('una risposta buona torna così com’è', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(risposta({ ok: true })))
    await expect((await chiedi('https://esempio')).json()).resolves.toEqual({ ok: true })
  })

  it('il 429 dice di rallentare, non di riprovare subito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(risposta({}, 429)))
    const e = await chiedi('https://esempio').catch((x) => x)
    expect(e).toBeInstanceOf(ErroreRete)
    expect(e.causa).toBe('servizio')
    expect(e.message).toMatch(/rallentare/)
  })

  it('un errore del servizio riporta il codice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(risposta({}, 503)))
    const e = await chiedi('https://esempio', { nomeServizio: 'Il percorso' }).catch((x) => x)
    expect(e.causa).toBe('servizio')
    expect(e.stato).toBe(503)
    expect(e.message).toMatch(/503/)
  })

  /**
   * È il caso che ha morso davvero: dentro un'anteprima la fetch viene rifiutata
   * prima di partire, e il messaggio del browser («NetworkError when attempting
   * to fetch resource») non dice né perché né cosa fare. Peggio: invitava a
   * riprovare, quando riprovare non può funzionare.
   */
  it('dentro una cornice dice che riprovare è inutile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')))
    vi.stubGlobal('window', { self: {}, top: {} } as unknown as Window)
    const e = await chiedi('https://esempio').catch((x) => x)
    expect(e.causa).toBe('bloccato')
    expect(e.message).toMatch(/anteprima/)
    expect(e.message).toMatch(/a mano/)
  })

  it('offline lo dice, e rimanda al modo manuale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    vi.stubGlobal('navigator', { onLine: false } as Navigator)
    const e = await chiedi('https://esempio').catch((x) => x)
    expect(e.causa).toBe('offline')
    expect(e.message).toMatch(/manuale/)
  })

  /**
   * Senza tempo massimo una richiesta che non risponde lascia l'indicatore di
   * caricamento acceso per sempre: lo stesso difetto della pagina bianca,
   * spostato di una schermata.
   */
  it('una richiesta che non risponde si arrende invece di restare appesa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, opzioni: RequestInit) =>
          new Promise((_, rifiuta) => {
            opzioni.signal?.addEventListener('abort', () =>
              rifiuta(new DOMException('abortita', 'AbortError')),
            )
          }),
      ),
    )
    const e = await chiedi('https://esempio', { attesaMassimaMs: 40 }).catch((x) => x)
    expect(e.causa).toBe('lento')
    expect(e.message).toMatch(/non ha risposto/)
  })

  it('un annullamento voluto non diventa un errore da mostrare', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, opzioni: RequestInit) =>
          new Promise((_, rifiuta) => {
            opzioni.signal?.addEventListener('abort', () =>
              rifiuta(new DOMException('abortita', 'AbortError')),
            )
          }),
      ),
    )
    const promessa = chiedi('https://esempio', { signal: controller.signal }).catch((x) => x)
    controller.abort()
    const e = await promessa
    expect(e).not.toBeInstanceOf(ErroreRete)
  })
})

import { useEffect, useMemo } from 'react'
import { useProfilo } from '../store/profilo'
import { useViaggio } from '../store/viaggio'
import { usePercorso } from '../store/percorso'
import { pianifica, pianificaTratti, type Piano } from '../model/pianificatore'
import type { PercorsoRisolto } from '../percorso'

/**
 * Il piano corrente, da qualunque origine arrivi.
 *
 * Col percorso reale i tratti e i waypoint vengono da lì; altrimenti si ricade
 * sull'inserimento manuale, che resta permanente (§9.2) ed è il fallback quando
 * si è offline o i servizi non rispondono.
 */
export function usePiano(): { piano: Piano; percorso: PercorsoRisolto | null; daPercorsoReale: boolean } {
  const { profilo } = useProfilo()
  const { viaggio, caricato, carica } = useViaggio()
  const { percorso, caricaUltimo, imposta, chiaveOrs, velocitaAutostrada } = usePercorso()

  useEffect(() => {
    if (!caricato) void carica()
    void caricaUltimo()
  }, [caricato, carica, caricaUltimo])

  // La chiave vive nel profilo, sul dispositivo: qui viene solo passata al
  // motore di routing quando serve. Stessa cosa per la velocità autostradale
  // abituale, che è un dato del viaggio ma serve già in fase di segmentazione.
  useEffect(() => {
    const salvata = profilo.chiaveOrs ?? ''
    if (salvata !== chiaveOrs) imposta({ chiaveOrs: salvata })
    if (viaggio.velocitaAutostrada !== velocitaAutostrada) {
      imposta({ velocitaAutostrada: viaggio.velocitaAutostrada })
    }
  }, [profilo.chiaveOrs, chiaveOrs, viaggio.velocitaAutostrada, velocitaAutostrada, imposta])

  return useMemo(() => {
    if (percorso && percorso.sottotratti.length > 0) {
      return {
        piano: pianificaTratti(percorso.sottotratti, percorso.waypoint, viaggio, profilo, true),
        percorso,
        daPercorsoReale: true,
      }
    }
    return { piano: pianifica(viaggio, profilo), percorso: null, daPercorsoReale: false }
  }, [percorso, viaggio, profilo])
}

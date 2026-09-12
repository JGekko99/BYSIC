import Prossimamente from './Prossimamente'

export default function ModalitaViaggio() {
  return (
    <Prossimamente
      titolo="Guida"
      punto={4}
      descrizione="La modalità viaggio: checkpoint che seguono l’esecuzione del piano lungo il percorso. È una delle tre parti principali dell’app, non un dettaglio di interfaccia."
      elenco={[
        'Checklist di partenza da fare da fermi, inclusa la forzatura in HEV',
        'Checkpoint riconosciuti via GPS, con «Sono qui» sempre in cima',
        'SOC reale a ogni checkpoint e ricalcolo se diverge di oltre 5 punti',
        'Viaggio interrotto che riprende da dove era rimasto',
        'Limiti del GPS in background dichiarati prima di partire',
      ]}
    />
  )
}

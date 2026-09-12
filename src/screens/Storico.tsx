import Prossimamente from './Prossimamente'

export default function Storico() {
  return (
    <Prossimamente
      titolo="Storico"
      punto={6}
      descrizione="I viaggi fatti, con previsto contro reale. È il materiale che serve alla calibrazione automatica della v2."
      elenco={[
        'Elenco dei viaggi con costo previsto e costo effettivo',
        'Errore del modello viaggio per viaggio',
        'Divergenze registrate ai checkpoint',
      ]}
    />
  )
}

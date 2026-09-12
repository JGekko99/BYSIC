import Prossimamente from './Prossimamente'

export default function Piano() {
  return (
    <Prossimamente
      titolo="Piano"
      punto={3}
      descrizione="Qui compariranno le 2 istruzioni (massimo 3) con il punto esatto in cui eseguirle, il grafico del SOC previsto e il confronto in euro con le alternative."
      elenco={[
        'Timeline delle istruzioni, con il rilascio marcato come critico',
        'Confronto con «non faccio niente» e con «obbligatoria 70% e via»',
        'Banda di incertezza dichiarata, non nascosta',
        'Sotto il 2% o 1,50 € di risparmio: nessuna istruzione, detto esplicitamente',
        'Pannello di debug con tutti i piani valutati e il limite teorico',
      ]}
    />
  )
}

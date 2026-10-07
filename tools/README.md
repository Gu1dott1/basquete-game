# Simulador de balanceamento

`sim.js` roda o motor do `index.html` direto no Node (com um DOM falso), sem abrir o navegador, para medir o balanceamento com milhares de lutas e carreiras. Toda mudança em `BAL`, `STY`, `PLANS`, `CAMPS`, `CUTS` ou no mundo vivo deve passar por ele.

```bash
node tools/sim.js luta        # planos, estilos, atributos, curva de OVR, finalizações e decisões
node tools/sim.js carreira    # carreiras completas com dois robôs + estabilidade do mundo vivo
node tools/sim.js tudo
```

Opções: `--n=3000` (lutas por cenário), `--c=300` (carreiras por robô), `--seed=42`.

Os dois robôs:

- **Esperto:** escolhe ofertas pelo risco, segue o treinador, monta camp e equipe, provoca quando é favorito e treina com critério.
- **Preguiçoso:** aceita a primeira oferta, fica no camp em casa, pula as lutas no plano Equilibrado e gasta os pontos ao acaso.

A diferença entre os dois mostra quanto as decisões do jogador importam. O simulador também pode ser importado (`require('./tools/sim.js')`) para testes pontuais. Ele exporta `loadGame`, `fight`, `mkDef` e `flat`.

Os robôs também passam pelos sistemas de carreira: calendário (descanso, suspensão médica e lesões empurram as lutas), pesagem real, desistência do adversário, seletiva da Liga, contratos de 4 lutas (renovam com a Liga), academia (o esperto vai pra escola do estilo e pro Combat Lab quando entra no ranking) e as pendências entre lutas (`pendAuto`: renova o contrato, recusa doping, segue lutando depois do recado do médico).

## Alvos de referência

| O que | Alvo |
|---|---|
| Plano x plano (média contra os outros) | 45–55%, nenhum dominante, cada plano com um contra claro |
| Estilo x estilo (média contra o campo) | 45–55% |
| Atributo de 50 para 90 (resto 70) | amplitude de ~10 a ~25 pontos, todos acima de zero |
| OVR -5 / -10 | ~30% / ~15% de vitória |
| Como as lutas acabam (OVR igual) | ~30% KO/TKO, ~12–18% finalização, resto decisão |
| Decisões | ~75–80% unânimes, ~15–20% divididas, empates ≤2% |
| Robô esperto / preguiçoso | ~65–75% / ~10–20% chegam a campeão |
| Fim de carreira por lesão | ≤20%, e no fim da carreira (32+ anos) |
| Fim de carreira por saúde (dano acumulado) | minoria, concentrado em quem toma muito nocaute |
| Lutas por ano na Liga | ~2,5–3 (como no UFC) |
| Sem resultado / desclassificação | ~0,5–1% das lutas |
| Mundo vivo (campeão / top 5 da divisão) | OVR ~81–85 / ~75–80, sem desabar nem inflar ao longo de 15 anos |

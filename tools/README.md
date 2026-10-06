# Simulador de balanceamento

`sim.js` roda o motor de luta do `index.html` direto no Node (com um DOM falso) para medir o balanceamento com milhares de lutas e carreiras, sem abrir o navegador. Toda mudança em `BAL`, `STY` ou `PLANS` deve passar por ele.

```bash
node tools/sim.js luta        # planos, estilos, atributos, curva de OVR, finalizações e decisões
node tools/sim.js carreira    # carreiras completas com dois robôs
node tools/sim.js tudo
```

Opções: `--n=3000` (lutas por cenário), `--c=300` (carreiras por robô), `--seed=42`.

O robô **esperto** segue o treinador e treina com critério; o **preguiçoso** pula as lutas no plano Equilibrado e gasta os pontos ao acaso. A diferença entre os dois mostra quanto as decisões do jogador importam.

## Alvos de referência

| O que | Alvo |
|---|---|
| Plano x plano (média contra os outros) | 45–55%, nenhum dominante, cada plano com um contra claro |
| Estilo x estilo (média contra o campo) | 45–55% |
| Atributo de 50 para 90 (resto 70) | amplitude de ~10 a ~25 pontos, todos acima de zero |
| OVR -5 / -10 | ~30% / ~15% de vitória |
| Como as lutas acabam (OVR igual) | ~30% KO/TKO, ~12–18% finalização, resto decisão |
| Decisões | ~75–80% unânimes, ~15–20% divididas, empates ≤2% |
| Robô esperto / preguiçoso | ~55–65% / ~10–20% chegam a campeão |
| Fim de carreira por lesão | ≤20%, e no fim da carreira (32+ anos) |

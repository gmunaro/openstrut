# Ligação viga-pilar de extremidade

Módulo: `src/calculo/vigas/ligacaoPilar.ts`. É puro e está integrado ao fluxo (`src/calculo/fluxo.ts`) só pela NBR 6118:2023, pela flag `Norma.ligacaoVigaPilar`. A NB-1/78 não usa a ligação, para manter a paridade com a V1. Na base do lance mais baixo o momento é 0, marcado [VERIFICAR]: as fontes consultadas não tratam a ligação com a fundação.

## Problema
Hoje a viga contínua é rotulada em todos os pilares, e `fluxo.ts` passa `mx = my = 0` aos pilares. Com isso:
- o negativo de extremidade da viga sai 0;
- o pilar de extremidade só recebe o momento mínimo.

A NBR 6118 exige considerar a solidariedade nos apoios extremos quando não há cálculo exato. Ignorá-la fica contra a segurança nos pilares.

## Fórmulas
NBR 6118:2023, 14.6.6.1 c). Bastos (Vigas, abr/2024) cita esse número; na edição de 2014 é o 14.6.7.1. [VERIFICAR] numeração no texto da norma.

O tramo extremo é tomado biengastado (engaste perfeito no apoio interno), o que dá Meng no pilar extremo. Meng se reparte no nó:

| Grandeza | Fórmula | Fonte |
|---|---|---|
| Viga | Mvig = Meng·(rinf + rsup)/(rvig + rinf + rsup) | Bastos, Vigas, Eq. 4, p. 15 |
| Lance superior | Msup = Meng·rsup/(rvig + rinf + rsup) | Vigas, Eq. 5, p. 17; Pilares, Eq. 89, p. 59 |
| Lance inferior | Minf = Meng·rinf/(rvig + rinf + rsup) | Vigas, Eq. 6, p. 17; Pilares, Eq. 88, p. 59 |
| Rigidez | r = I/ℓ: ℓ = vão efetivo do tramo extremo (viga); ℓ = metade da altura do lance (pilar) | Vigas, Eq. 7, p. 17 |
| Inércia do pilar | a dimensão na direção da viga vai ao cubo | Pilares, nota 101, p. 155 |
| Lance entre os níveis i e i+1 | Mbase = Msup,i + 0,5·Minf,i+1; Mtopo = Minf,i+1 + 0,5·Msup,i (em módulo) | Pilares, Eq. 90, p. 59 |

Notas:
- Por equilíbrio, Mvig = Msup + Minf.
- Lance ausente (cobertura) tem r = 0.
- Meng usa a carga total g + q, como nos exemplos de Bastos. As concentradas entram como P·a·b²/ℓ² e P·a²·b/ℓ², com P = g + q da montagem, que é a reação de projeto.
- A propagação de metade do momento entre as pontas do lance (Eq. 90) é de Bastos/Fusco, não da norma.

Testes com valores publicados: pilares P6, P5 e P1 de Bastos, Pilares, p. 155–166 (Meng, rigidezes, Mk e Md de topo e base). Também há contas à mão para viga biapoiada, cobertura, Meng com concentrada e equilíbrio do nó.

## API
- `ligacaoVigaPilar(viga, lances)` recebe `lances: Record<pilarId, { superior, inferior }>`. Cada lance é `{ b, h, altura } | null`, com b e h em cm e altura em m. Para cada extremidade da viga apoiada em pilar, devolve:
  - `mViga` (≤ 0, kN·m, convenção de `continua.ts`);
  - `mBaseSuperior` e `mTopoInferior` (característicos, convenção abaixo);
  - Meng e as rigidezes.

  Também devolve `direcao`, `avisos` e `memoria`. A direção é `x` para viga horizontal na planta, o que dá Mx no pilar, e `y` para viga vertical, o que dá My.
- `momentosDoLance(topo, base)` aplica a Eq. 90 com sinais. `REF_LANCE` é a referência para a memória.
- Ficam de fora:
  - extremidade livre (balanço) e extremidade apoiada em viga;
  - pilar interno à viga, inclusive o vizinho a um balanço. A norma só trata os apoios extremos, e o momento mínimo continua valendo.
- Pilar sem entrada em `lances` gera aviso e é tratado como rótula.

## Convenção de sinais (proposta única)
**Sinal = face tracionada.** M > 0 traciona a face de coordenada maior na direção do momento: +x para Mx e +y para My. Consequências:
- topo e base com o mesmo sinal indicam curvatura simples, e com sinais opostos, curvatura dupla. MB/MA em αb é a razão com sinal. É o que `normas/nbr6118-2023/pilares.ts` já supõe;
- uma viga que sai do pilar no sentido + traciona a face + na base do lance superior e a face − no topo do lance inferior. Por isso, com vigas do mesmo lado nos dois níveis, o lance fica com topo = −base, que é curvatura dupla com αb = 0,40. Bastos chega ao mesmo resultado: "M1d,A,x = −M1d,B,x", αb = 0,4 (Pilares, p. 165).

Ação para quem integrar:
- trocar o comentário de `PilarEntrada` em `tipos.ts`, hoje "sinal = sentido", por esta convenção;
- remover o [VERIFICAR] correspondente em `pilares.ts`.

A NB-1/78 usa o maior |M| e não depende do sinal.

## Integração em `fluxo.ts` (a fazer pelo coordenador)
1. **Lances por nível.** Os níveis vão do topo para a base (uma repetição de pavimento-tipo = um nível), e a viga do nível k fica no topo do lance do nível k. Para cada pilar de extremidade:
   - `inferior` = seção do pilar no pavimento do nível k e pé-direito desse pavimento;
   - `superior` = o mesmo para o nível k − 1, ou `null` se não há lance acima.

   O pilar se casa entre pavimentos por `chavePilar`, e a chave do mapa é o id do pilar no pavimento da viga.
2. **Vigas.** Ao dimensionar, use `mViga` no lugar do `mNegEsq` do 1º tramo (nó 0) e do `mNegDir` do último tramo (nó n), que hoje são 0. Isso vale para o negativo e para a armadura longitudinal do τc nessa ponta. O positivo pode continuar o da viga rotulada, que é maior e fica a favor da segurança (Bastos, Vigas, p. 15).

   Num pavimento-tipo, as repetições têm rigidezes de lance diferentes só no topo e na base da pilha. Para dimensionar a viga, use o maior |mViga| entre as repetições.
3. **Pilares.** Para o lance do nível k, na direção d:
   - topo = Σ `mTopoInferior` das vigas do nível k que chegam ao pilar na direção d;
   - base = Σ `mBaseSuperior` das vigas do nível k + 1 (abaixo), ou 0 no lance mais baixo.

   Em seguida, `momentosDoLance(topo, base)` vai para `mxTopo/mxBase` (d = x) ou `myTopo/myBase` (d = y), com uma etapa de memória `REF_LANCE`. Os momentos são característicos, e o pilar aplica γn·γf.
4. **Norma.** A V1 (NB-1/78) não fazia esse cálculo. Decida se ele vale só para a 6118. Se valer, a escolha vai para a `Norma` (contrato em `tipos.ts`), não para um `if` no fluxo.

## Limitações [VERIFICAR]
- Duas vigas distintas terminando no mesmo pilar, na mesma direção e em lados opostos, por exemplo duas vigas colineares desenhadas separadas: somar as contribuições de cada uma é aproximado, porque cada viga reparte o seu Meng sem a rigidez da outra. O nó correto seria ΣMeng (com sinal)·r/(Σrvig + rsup + rinf). Com rigidezes de viga muito diferentes, a soma pode sair com o sinal trocado: Meng 10 e 5, rvig 100 e 1, rpilar 1 dão −2,4 contra +0,05 do nó correto. Se o caso existir no editor, integre pelo nó.
- Viga apoiada em pilar intermediário com balanço além dele: o momento do balanço chega ao pilar e não é considerado aqui.
- O Anexo IV de Bastos, Vigas, p. 173, usa uma variante com coeficientes 4·rvig e 3·r (Eq. 14 a 16). Ela não foi adotada: vale a equação literal da norma.

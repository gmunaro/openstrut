# SISTRUT V2: especificação

## Problema

O SISTRUT 4.0 (1991) calculava a estrutura de concreto armado de um edifício inteiro. A carga saía das lajes, passava pelas vigas e chegava aos pilares, andar por andar. Ele roda em MS-DOS, usa a norma NB-1/78 e tem interface de teclado com telas de 80×25. A V1 (`_Arquivo/Sistrust/dist`) reconstruiu esse programa em QB64 e o faz rodar no Windows atual, mas a interface e a norma continuam as de 1991.

A V2 leva o mesmo fluxo para uma ferramenta atual:
- desenha a planta com o mouse;
- calcula pela NBR 6118:2023, ou pela NB-1/78 para comparar com o original;
- mostra a memória de cálculo de cada elemento.

## Usuário

Engenheiro civil que faz o pré-dimensionamento e o cálculo de edifícios simples de concreto armado: residências, sobrados e prédios baixos com lajes maciças retangulares. Hoje ele usa planilhas, tabelas ou software comercial caro, como Eberick e TQS.

## Decisões tomadas

| Pergunta | Decisão |
|---|---|
| Norma | NB-1/78 e NBR 6118:2023, escolhida por obra; dá para recalcular a mesma obra nas duas e comparar |
| Plataforma | App web local: abre no navegador, funciona offline (PWA), sem servidor e sem login |
| Persistência | Obra em arquivo `.sistrut.json`, aberto e salvo pelo usuário, com salvamento automático no navegador (IndexedDB) |
| MVP | Planta gráfica, com cálculo de lajes → vigas → pilares, memória de cálculo e relatório |
| Pavimentos | Vários, com pé-direito; um pavimento pode ser "tipo" e se repetir N vezes; os pilares acumulam a carga de cima para baixo |
| Unidades | Cálculo interno em SI (kN, m, MPa). A tela mostra kN, kN·m, MPa e cm², com chave para exibir tf, tf·m e kgf/cm² |

## MVP: critérios de aceite

1. **Obra**
   - Criar a obra (nome, norma, materiais fck/aço, classe de agressividade e cobrimentos), salvar em arquivo, reabrir e recuperar o rascunho automático depois de fechar a aba.
2. **Pavimentos**
   - Criar, renomear, reordenar e apagar pavimentos, com pé-direito e número de repetições.
   - Copiar a planta de um pavimento para outro.
3. **Planta**
   - Desenhar lajes retangulares numa grade com snap.
   - As vigas aparecem sozinhas nos bordos e os pilares nos cruzamentos e nas extremidades, como na V1.
   - O usuário edita seção, cargas e nomes, apaga viga (o bordo vira livre), move ou apaga pilar e acrescenta balanço.
   - Zoom, pan, desfazer e refazer.
4. **Cargas**
   - Peso próprio automático.
   - Revestimento e sobrecarga por laje, com presets da NBR 6120, e carga de parede linear sobre viga.
5. **Lajes**
   - Vinculação de cada bordo detectada pela vizinhança (engastada, apoiada ou livre) e editável.
   - Momentos, reações nas vigas, compatibilização dos negativos, armaduras (cm²/m e barras) e flecha.
6. **Vigas**
   - Viga contínua por rigidez, com balanços e envoltória.
   - Flexão (simples e dupla), cortante e estribos, e barras escolhidas que cabem na alma.
7. **Pilares**
   - Carga acumulada por pavimento, com peso próprio.
   - Momentos mínimos e de 2ª ordem pela norma escolhida, flexão composta (oblíqua quando houver), armadura e estribos.
8. **Resultados**
   - Cada elemento mostra o resultado na planta (cor por situação: ok, aviso ou falha) e um painel com a memória de cálculo: fórmulas, valores intermediários e o item da norma.
9. **Relatório**
   - Relatório da obra imprimível (HTML → PDF pelo navegador), com lajes, vigas, pilares, avisos e o resumo de aço e concreto.
10. **Paridade**
    - Uma obra com as mesmas lajes da obra FLUXO da V1, calculada pela NB-1/78, dá os mesmos resultados que a V1 nas tolerâncias de `docs/PARIDADE.md`.
11. **Equilíbrio**
    - Em qualquer obra, a soma das cargas das lajes de um pavimento é igual à soma das cargas que elas passam às vigas.
    - A soma das reações das vigas é igual à carga que os pilares recebem.
    - O app verifica isso e mostra o resultado.

## Fora do escopo do MVP (fase 2 ou depois)

- Plantas de forma e quantitativos.
- Detalhamento de barras (desenho de armação), tabela de aço e exportação DXF/PDF de desenho.
- Lajes não retangulares, nervuradas ou pré-moldadas.
- Escadas, reservatórios, fundações e vento (pórtico espacial).
- Contas, nuvem e colaboração.
- Importar obras da V1 (formato `.LAJ`/`.VIG`): fica para depois do MVP, se for útil.

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript strict | padrão |
| Runtime/pacotes | Bun | padrão |
| App | Vite + React 19 + TanStack Router | é app local sem servidor; o TanStack Start (padrão) traria SSR sem uso |
| UI | Tailwind 4 + shadcn/ui | padrão |
| Planta | SVG em React | elementos poucos (dezenas a centenas), testável, impressão nítida |
| Estado | Zustand com histórico (desfazer/refazer) | pequeno, sem cerimônia |
| Armazenamento | IndexedDB (rascunho) + File System Access API, com download como alternativa | offline, sem servidor |
| Offline | vite-plugin-pwa | instalável e offline |
| Testes | Vitest para o motor de cálculo; Playwright para o fluxo na tela | padrão |
| Lint/format | oxlint + oxfmt | padrão |
| Deploy | site estático (Vercel ou Cloudflare Pages), opcional | o app roda local com `bun run preview` |

## Arquitetura

```
src/
  dominio/      tipos da obra (Obra, Pavimento, Laje, Viga, Pilar, Materiais) e funções puras de edição
  calculo/      motor sem React, determinístico e testado
    normas/     interface Norma; nb1-78/ e nbr6118-2023/ implementam
    lajes/      vinculação, momentos (charneiras e tabelas), reações, flecha
    vigas/      viga contínua por rigidez, envoltória, dimensionamento
    pilares/    carga acumulada, 2ª ordem, flexão composta (compatibilidade de deformações)
    fluxo.ts    obra → lajes → vigas → pilares, com verificação de equilíbrio
    memoria.ts  registro das etapas (fórmula, valores, item da norma)
  planta/       editor SVG (grade, snap, ferramentas, seleção)
  telas/        rotas: obras, planta, resultados, relatório
  armazenamento/ arquivo .sistrut.json (com versão de esquema) e rascunho no IndexedDB
```

Regras:
- O motor de cálculo não importa nada de React nem do navegador.
- Toda função de cálculo devolve o resultado e a memória (as etapas).
- A norma entra como parâmetro: nenhum `if (norma === ...)` espalhado; as diferenças ficam na implementação de `Norma`.
- O arquivo da obra tem `versao` e uma migração por versão.

## Como a correção é garantida

- **NB-1/78:** os métodos são portados da V1, que já tem testes com referências calculadas à mão. Os mesmos casos viram testes Vitest com os mesmos valores esperados. A obra FLUXO serve de teste de paridade.
- **NBR 6118:2023:** os testes usam exemplos resolvidos de apostilas públicas, com fonte citada no teste (`docs/norma/NBR6118-2023.md`). Cada fórmula leva o item da norma num comentário e na memória.
- **Equilíbrio:** o fluxo verifica as somas de carga em todas as obras, nos testes e no app.
- **Avisos:** todo resultado fora dos limites da norma (x/d, armadura máxima, λ > 90, flecha) vira aviso visível e não é escondido.
- O app avisa na tela e no relatório que os resultados precisam de conferência de um engenheiro responsável.

## Riscos

- **Norma paga:** a NBR 6118:2023 não é pública. Por isso a especificação vem de fontes secundárias, e os pontos sem fonte ficam marcados com [VERIFICAR] até alguém conferir na norma.
- **Métodos de laje:** a NBR 6118 aceita análise elástica (tabelas) e plástica, e os resultados diferem. O MVP usa tabelas elásticas (Bares/Czerny) na 6118 e charneiras na NB-1/78, como a V1; a escolha fica registrada na memória.
- **Editor de planta:** costuma consumir mais tempo que o previsto. Por isso as lajes são só retangulares e alinhadas à grade no MVP.

## Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 0 | Scaffold, lint, format, typecheck, testes, PWA, CLAUDE.md | `bun run check` passa; app abre vazio |
| 1 | Domínio + arquivo `.sistrut.json` + motor NB-1/78 portado da V1 | testes de paridade com a V1 passam (lajes, vigas, pilares, FLUXO) |
| 2 | Motor NBR 6118:2023 | exemplos resolvidos das apostilas passam; tabela de diferenças NB-1/78 × 6118 coberta por testes |
| 3 | Editor de planta + pavimentos | e2e: desenhar a obra FLUXO pela tela e salvar/reabrir |
| 4 | Fluxo integrado, resultados na planta, memória, relatório | e2e: obra de 3 pavimentos do desenho ao relatório; equilíbrio ok |
| 5 (fase 2) | Formas, detalhamento, DXF | a definir |

# Rotina das issues

Um agente roda esta rotina a cada hora, por uma tarefa agendada do T3 Code, no clone do repositório que a tarefa indica. Hoje ela roda no Munaro-Pc. Ele lê as issues abertas de `gmunaro/openstrut`, investiga cada novidade no código e responde na própria issue com diagnóstico, opções e recomendação. Quando o problema e a solução estão definidos, ele avisa na issue o que vai implementar, implementa com a skill `enxame`, publica uma versão nova e avisa na issue para o usuário conferir.

## Para quem o OpenStrut existe

O usuário principal é o André Peggion, engenheiro civil, que usa o OpenStrut nas obras dele. Trate cada reclamação ou pergunta dele como sinal: ele tem um motivo técnico forte, e o trabalho é achar esse motivo antes de responder. Procure na norma (NBR 6118, NB-1/78), no comportamento do SISTRUT original e na prática de obra. Responder "o programa faz assim" sem achar o porquê é resposta incompleta.

O objetivo de cada issue é deixar a ferramenta alinhada com o que ele precisa para calcular e detalhar a obra dele com confiança.

## Uma rodada

1. **Atualize.** `git fetch origin` no clone e trabalhe a partir de `origin/main`. Pronto quando o checkout de leitura está em `origin/main`, sem mudança local.
2. **Ache as novidades.** Liste as issues abertas com os comentários (`gh issue list --state open --json number,title,updatedAt,labels` e `gh issue view <n> --comments`). Uma issue tem novidade quando a última manifestação nela não é do agente. Os comentários do agente terminam com o marcador oculto `<!-- openstrut-agente -->`. Os relatos do botão "Relatar problema" chegam com o título `[Relato] ` e o marcador `openstrut-relato` no corpo (`docs/RELATO.md`). Sem novidade em nenhuma issue, encerre a rodada sem comentar nada. Pronto quando você tem a lista de issues com novidade.
3. **Investigue cada uma.** Leia a issue inteira e entenda o problema na obra dele. Reproduza: abra a obra ou os arquivos anexados, rode o caso no app ou num teste, e leia o código e as docs da área (`docs/SPEC.md`, `docs/MODO-CALCULO.md`, `docs/MOTOR-6118.md`, `docs/DETALHAMENTO.md` e as outras de `docs/`). Pronto quando você sabe a causa, com evidência (arquivo e linha, número calculado contra número esperado), ou sabe exatamente que informação falta para chegar nela.
4. **Responda na issue.** Um comentário por issue por rodada, em português, de engenheiro para engenheiro:
   - o que você entendeu do problema, nas palavras da obra dele;
   - a causa, com a evidência;
   - duas ou três soluções, com o que cada uma muda para ele no dia a dia da obra e o custo de cada uma;
   - a sua recomendação e o porquê;
   - as perguntas que faltam para decidir.

   Ajuste a label: `triagem` sai; entra `aceito` (problema confirmado), `precisa-info` (falta dado para reproduzir) ou `nao-reproduz`. Termine o comentário com `— agente do OpenStrut` e o marcador `<!-- openstrut-agente -->`. Quando a decisão for de produto ou de escopo, mencione `@gmunaro`. Pronto quando cada issue com novidade tem a resposta e a label certa.
5. **Implemente e publique o que está definido.** Uma issue está definida quando o problema está confirmado e a solução não tem decisão de engenharia em aberto: o André ou o gmunaro escolheu uma opção, ou é um defeito com uma correção só, uma melhoria de experiência ou uma mudança de interface que não muda número de cálculo. Solução com opções de engenharia em disputa volta para a conversa do passo 4.
   1. **Avise antes de começar.** Comente na issue o que vai implementar e o que muda para o usuário na obra, em duas ou três frases. Troque a label para `aceito`.
   2. **Implemente com a skill `enxame`.** Carregue a skill e siga: Opus conduz, o Haiku faz em volume o que dá para conferir, e o A/B só roda com oráculo. Trabalhe num worktree próprio, no branch `issue-<n>-<assunto>`, com:
      - um teste que falha antes da mudança e passa depois;
      - `bun run check` verde e o e2e da área afetada verde, e prints da tela mudada em 390x844 e 1366x768 quando a mudança for de interface;
      - o modo original continuando a reproduzir o SISTRUT número a número (os testes de `src/calculo/sistrut/**` guardam isso); correção de cálculo entra no modo corrigido, com a fonte na norma citada;
      - um `reviewer` novo sobre o diff, sem achado bloqueante em aberto.
   3. **Publique uma versão.** Suba a versão em `package.json` no mesmo PR: correção sobe o último número (2.0.1), melhoria ou mudança de interface sobe o do meio (2.1.0); sem tag anterior, a primeira é 2.0.0. Abra o PR com `Refs #<n>`, a descrição começando pelo problema do usuário, e o que foi e o que não foi verificado. Com o CI verde, faça o merge (`gh pr merge --merge --delete-branch`), espere o deploy do Pages terminar verde e crie a release: `gh release create v<versão> --target main --title "v<versão>"`, com notas em português que dizem, para cada issue, o que mudou para o usuário.
   4. **Avise quando estiver no ar.** Comente na issue: a versão, o que mudou, o endereço https://gmunaro.github.io/openstrut/ e o passo a passo para conferir na obra dele. Lembre que o app instalado atualiza ao reabrir. Deixe a issue aberta: ela fecha quando o usuário confirmar que resolveu. Se ele disser que não resolveu, a issue volta ao passo 3.

   Pronto quando a versão está publicada, a release existe e a issue tem o aviso.
6. **Feche a rodada.** Pronto quando toda issue com novidade tem resposta, toda issue definida está publicada ou tem o motivo escrito de ainda não estar, e toda issue confirmada pelo usuário está fechada.

## Limites

- Tudo entra na `main` por PR com o CI verde e a revisão do `reviewer`. Nada de push direto na `main`, force-push ou reescrita de histórico.
- O modo original não muda de número: ele reproduz o SISTRUT. Mudança de número no modo corrigido entra com a fonte na norma; sem fonte, espera o OK do gmunaro na issue (mencione `@gmunaro`).
- Os comentários saem pela conta GitHub do gmunaro. Por isso a assinatura `— agente do OpenStrut` vai em todo comentário do agente.
- Obra de cliente fica fora do repositório e dos comentários: use o que já está anexado à issue e não republique arquivos.
- Pergunta feita ao usuário espera a resposta dele. Sem resposta nova, a issue não ganha outro comentário.
- Dúvida de engenharia sem fonte vira pergunta na issue, não suposição no código.

## Ligar numa máquina

1. `gh auth status` mostra a conta `gmunaro` com os escopos `repo` e `workflow`.
2. A skill `enxame` está em `~/.claude/skills/enxame` e os agentes que ela usa (`scout`, `auditor`, `implementer`, `reviewer`, `researcher`) em `~/.claude/agents`.
3. No T3 Code da máquina, abra uma thread num projeto cujo diretório é o clone e peça:

   > Crie uma tarefa agendada a cada 1 hora, neste thread, com o prompt: "Rode uma rodada da rotina de `docs/ROTINA-ISSUES.md` neste clone." Depois rode a primeira rodada agora.

O t3-lab também está pronto (clone `~/openstrut`, `gh` logado, skill e agentes copiados), caso a rotina mude para lá.

A rotina mora neste arquivo. Para mudar o comportamento do agente, mude o arquivo por PR; a tarefa agendada só aponta para ele.

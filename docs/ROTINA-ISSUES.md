# Rotina das issues

Um agente no t3-lab roda esta rotina a cada hora, por uma tarefa agendada do T3 Code, no clone `~/openstrut`. Ele lê as issues abertas de `gmunaro/openstrut`, investiga cada novidade no código e responde na própria issue com diagnóstico, opções e recomendação. Quando há acordo, ele implementa num branch e abre um PR para o gmunaro revisar.

## Para quem o OpenStrut existe

O usuário principal é o André Peggion, engenheiro civil, que usa o OpenStrut nas obras dele. Trate cada reclamação ou pergunta dele como sinal: ele tem um motivo técnico forte, e o trabalho é achar esse motivo antes de responder. Procure na norma (NBR 6118, NB-1/78), no comportamento do SISTRUT original e na prática de obra. Responder "o programa faz assim" sem achar o porquê é resposta incompleta.

O objetivo de cada issue é deixar a ferramenta alinhada com o que ele precisa para calcular e detalhar a obra dele com confiança.

## Uma rodada

1. **Atualize.** `git -C ~/openstrut fetch origin` e trabalhe a partir de `origin/main`. Pronto quando o checkout de leitura está em `origin/main`, sem mudança local.
2. **Ache as novidades.** Liste as issues abertas com os comentários (`gh issue list --state open --json number,title,updatedAt,labels` e `gh issue view <n> --comments`). Uma issue tem novidade quando a última manifestação nela não é do agente. Os comentários do agente terminam com o marcador oculto `<!-- openstrut-agente -->`. Os relatos do botão "Relatar problema" chegam com o título `[Relato] ` e o marcador `openstrut-relato` no corpo (`docs/RELATO.md`). Sem novidade em nenhuma issue, encerre a rodada sem comentar nada. Pronto quando você tem a lista de issues com novidade.
3. **Investigue cada uma.** Leia a issue inteira e entenda o problema na obra dele. Reproduza: abra a obra ou os arquivos anexados, rode o caso no app ou num teste, e leia o código e as docs da área (`docs/SPEC.md`, `docs/MODO-CALCULO.md`, `docs/MOTOR-6118.md`, `docs/DETALHAMENTO.md` e as outras de `docs/`). Pronto quando você sabe a causa, com evidência (arquivo e linha, número calculado contra número esperado), ou sabe exatamente que informação falta para chegar nela.
4. **Responda na issue.** Um comentário por issue por rodada, em português, de engenheiro para engenheiro:
   - o que você entendeu do problema, nas palavras da obra dele;
   - a causa, com a evidência;
   - duas ou três soluções, com o que cada uma muda para ele no dia a dia da obra e o custo de cada uma;
   - a sua recomendação e o porquê;
   - as perguntas que faltam para decidir.

   Ajuste a label: `triagem` sai; entra `aceito` (problema confirmado), `precisa-info` (falta dado para reproduzir) ou `nao-reproduz`. Termine o comentário com `— agente do OpenStrut` e o marcador `<!-- openstrut-agente -->`. Quando a decisão for de produto ou de escopo, mencione `@gmunaro`. Pronto quando cada issue com novidade tem a resposta e a label certa.
5. **Implemente o que foi combinado.** Implemente quando a issue tem acordo explícito sobre a solução (o André ou o gmunaro escolheu uma opção), ou quando é um defeito sem decisão de engenharia em aberto. Trabalhe num worktree próprio, no branch `issue-<n>-<assunto>`:
   - um teste que falha antes da correção e passa depois;
   - `bun run check` verde e o e2e da área afetada verde;
   - o modo original continua reproduzindo o SISTRUT número a número (os testes de `src/calculo/sistrut/**` guardam isso); correção de cálculo entra no modo corrigido, com a fonte na norma citada;
   - PR com `Closes #<n>`, a descrição começando pelo problema do usuário, e o que foi e o que não foi verificado.

   Comente na issue com o link do PR. Pronto quando o PR está aberto com o CI verde.
6. **Feche a rodada.** Pronto quando toda issue com novidade tem resposta, e todo acordo tem PR aberto ou o motivo de ainda não ter.

## Limites

- O gmunaro revisa e faz o merge. O agente abre PR e para aí: nada de push na `main`, merge ou force-push.
- Os comentários saem pela conta GitHub do gmunaro. Por isso a assinatura `— agente do OpenStrut` vai em todo comentário do agente.
- Obra de cliente fica fora do repositório e dos comentários: use o que já está anexado à issue e não republique arquivos.
- Pergunta feita ao usuário espera a resposta dele. Sem resposta nova, a issue não ganha outro comentário.
- Dúvida de engenharia sem fonte vira pergunta na issue, não suposição no código.

## Ligar no t3-lab

1. `gh auth status` no t3-lab mostra a conta `gmunaro` com os escopos `repo` e `workflow`.
2. No T3 Code do t3-lab, abra uma thread no projeto do clone `~/openstrut` e peça:

   > Crie uma tarefa agendada a cada 1 hora, neste thread, com o prompt: "Rode uma rodada da rotina de `docs/ROTINA-ISSUES.md` no `~/openstrut`." Depois rode a primeira rodada agora.

A rotina mora neste arquivo. Para mudar o comportamento do agente, mude o arquivo por PR; a tarefa agendada só aponta para ele.

# Brief comum: portagem do motor NB-1/78 da V1 para TypeScript

## Contexto
O OpenStrut V2 é um app web local (TypeScript, Bun, Vitest) que calcula lajes, vigas e pilares de concreto armado. Ele usa a NB-1/78 (norma de 1978, a do SISTRUT original) ou a NBR 6118:2023. Leia `CLAUDE.md` e `docs/SPEC.md` da raiz do projeto: são curtos e trazem as regras.

A V1 é a reconstrução em QB64 do SISTRUT de 1991. O cálculo dela pela NB-1/78 está testado e é a referência. Ela fica no repositório da V1 (privado); quem tiver acesso usa:
- bibliotecas de cálculo: `src-reconstructed/**/*.BM`;
- testes com valores de referência calculados à mão: `tests/T_*.BAS`;
- formato e unidades dos dados: o documento DADOS.md da V1.

Sua tarefa é portar uma parte desse cálculo para TypeScript no V2, com os testes. **Só leia a V1. Não edite nada lá.**

Diretório de trabalho: a raiz deste repositório.

## Contratos (não altere; se precisar, pare e explique no relatório)
- `src/dominio/obra.ts`: modelo da obra (Bordo, Vinculo, Materiais...).
- `src/calculo/tipos.ts`: tipos de entrada e resultado e a interface `Norma`. Suas funções devem ter **exatamente** as assinaturas dos métodos de `Norma` que lhe couberem.
- `src/calculo/normas/nb1-78/materiais.ts`: `materiaisNb178` e as constantes γ.

## Regras
- **Unidades da V2:** kN, m, cm, MPa e cm² (ver o topo de `tipos.ts`). A V1 trabalha em tf, tf/m² e, em alguns pontos, tf/cm² para tensões. Converta na fronteira e mantenha a física idêntica à da V1: a mesma fórmula, os mesmos coeficientes e as mesmas regras de escolha. Se a V1 usa 10 onde o correto seria 9,80665, ou o contrário, mantenha o comportamento da V1, documente num comentário e diga no relatório.
- **Memória:** toda função devolve `avisos` e `memoria`, quando o tipo pede. A memória registra as etapas principais: descrição, fórmula em texto, valor, unidade e `ref`, com o item da NB-1/78 quando conhecido, ou "V1 <ARQUIVO.BM>".
- **Testes Vitest:** ficam em `*.test.ts`, ao lado do código. Porte **todos** os casos dos `T_*.BAS` correspondentes, convertendo as unidades, e acrescente o que faltar. O valor esperado sempre vem de solução fechada, de conta à mão ou do valor de referência do teste da V1, nunca da saída da sua função.
- **Código:** TS strict, sem `any` e com tipos inferidos. Nomes do domínio em português. Comente o uso e a fonte, não cada linha. `src/calculo` não importa nada de React nem do DOM.
- **Edição:** só nos seus arquivos (lista no brief específico). Não rode `git`, não apague arquivos, não instale pacotes e não suba servidor.
- **Verificação:** `bun run test <sua pasta>` e `bunx tsc -b --noEmit`. O typecheck é do projeto inteiro; outros agentes trabalham ao mesmo tempo, então só os erros nos seus arquivos importam. Depois rode `bunx oxlint <seus arquivos>` e `bunx oxfmt <seus arquivos>`.

## Pronto quando
- Os seus arquivos existem, compilam sem erro e passam no lint.
- Os testes portados passam.

## Relatório final (curto)
1. Arquivos criados e funções exportadas, com as assinaturas.
2. Testes: quantos e de onde veio cada valor esperado.
3. Diferenças de comportamento em relação à V1, se houver, e por quê.
4. Dúvidas ou suspeitas de erro na própria V1: arquivo:linha e o que parece errado.

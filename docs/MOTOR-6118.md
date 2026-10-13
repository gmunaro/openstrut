# Brief comum: motor de cálculo pela NBR 6118:2023

## Contexto
O SISTRUT V2 é um app web local (TypeScript strict, Bun, Vitest) que calcula lajes, vigas e pilares de concreto armado. Leia `CLAUDE.md` e `docs/SPEC.md`. O motor pela NB-1/78 já existe e está testado: `src/calculo/normas/nb1-78/*`, com a mecânica comum em `src/calculo/vigas/continua.ts`, `src/calculo/pilares/*` e `src/calculo/barras.ts`. Use-o como modelo de estilo, de memória de cálculo e de testes. Agora entra a NBR 6118:2023.

## Fontes de engenharia
Ficam em `docs/norma/`. O texto da norma é pago, então os valores vêm de apostilas públicas, com linha e página.
- `vigas-pilares.md`: materiais, flexão, cortante, ancoragem, pilares e combinações.
- `durabilidade-lajes.md`: CAA, cobrimentos, mínimos de laje, flecha e tabelas de Bares.
- `exemplos.md`: exemplos resolvidos de apostilas. Viram testes.
- `NBR6118-2023.md`: visão geral, menos confiável.

Regras para as fontes:
- Item marcado [VERIFICAR], PENDENTE ou [NÃO ENCONTRADO]: implemente a interpretação mais conservadora, marque no código com `// [VERIFICAR] <motivo>` e liste no relatório.
- Não invente coeficiente sem fonte.

## Contratos (não altere; se precisar, pare e explique)
- `src/calculo/tipos.ts`: interface `Norma` e tipos de entrada e resultado.
- `src/calculo/normas/nbr6118-2023/materiais.ts`: já pronto (`materiais6118`, γ, fctm, Ecs, ηc).
- Use `src/calculo/barras.ts` e `src/calculo/pilares/flexaoComposta.ts`, que são independentes de norma.
  - Se faltar algo neles, crie no seu próprio arquivo e relate.
  - Não edite esses dois arquivos: os testes da NB-1/78 dependem deles.

## Regras
- **Unidades:** kN, m, cm e MPa (topo de `tipos.ts`).
- **Memória:** toda função devolve `avisos` e `memoria`. Cada etapa tem `ref`, com o item da NBR 6118:2023 e a fonte, por exemplo `"6118:2023 17.4.2.2 (Bastos, Cortante, p. 23)"`.
- **Testes:**
  - Todo exemplo de `exemplos.md` do seu elemento vira teste Vitest, com o valor publicado e uma tolerância compatível com o arredondamento da apostila.
  - Acrescente casos com conta à mão quando faltar exemplo.
  - Nunca use a saída da própria função como valor esperado.
- **Avisos:** todo limite da norma violado vira aviso. Exemplos: x/d > 0,45, armadura máxima, biela, λ > 140 (fora do 15.8.1, avisa; 90 < λ ≤ 140 é dimensionado pelo pilar-padrão acoplado a M-N-1/r com fluência, em `src/calculo/pilares/pilarPadraoMN.ts`), fck > 50 (fora do escopo, avisa).
- **Edição:** só nos seus arquivos. Não rode `git`, não apague arquivos, não instale pacotes e não suba servidor.
- **Verificação:**
  - `bun run test <sua pasta>` e `bun run typecheck`; só os erros nos seus arquivos importam, porque há trabalho paralelo;
  - `bun x oxlint <seus arquivos>` e `bun x oxfmt <seus arquivos>`.

## Relatório final (curto)
1. Arquivos e funções.
2. Testes, com a fonte de cada valor esperado: exemplo e página, ou conta.
3. Itens [VERIFICAR] e as escolhas feitas.
4. Diferenças relevantes em relação à NB-1/78 no seu elemento.

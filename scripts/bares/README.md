# Gerador das tabelas de lajes (tipos de Bares/Pinheiro)

Calcula os coeficientes de momento, reação e flecha das lajes retangulares com carga uniforme e bordos apoiados ou engastados (tipos 1 a 6) e grava `src/calculo/normas/nbr6118-2023/tabelasBares.ts`, que o motor da NBR 6118 usa. O modo NB-1/78 (SISTRUT) não usa esse arquivo. Método, convenções e comparação com a tabela impressa: `docs/norma/bares-reacoes-flechas.md`.

## Regerar

```
bun scripts/bares/gerar.ts
```

Leva uns 2 segundos e é determinístico. Depois de regerar:

- `git diff src/calculo/normas/nbr6118-2023/tabelasBares.ts` mostra o que mudou; sem mudança no gerador, o diff sai vazio;
- `bun x vitest run src/calculo/normas/nbr6118-2023/tabelasBares.test.ts` confere o arquivo contra o gerador (tipos 3 e 5A), o solver contra Timoshenko & Woinowsky-Krieger e a tabela contra uma amostra da tabela publicada;
- os testes do motor que usam coeficientes à mão (`lajes.test.ts`, `obra.test.ts`, `compatibilizacao.test.ts`, `ligacao.fluxo.test.ts`) quebram se algum valor que eles usam mudar.

Não edite `tabelasBares.ts` à mão: mude o gerador e rode de novo.

## Arquivos

- `placas.ts`: placa de Kirchhoff com bordos apoiados ou engastados, pelo método da superposição (placa apoiada mais momentos de bordo em série de Lévy). Devolve deslocamento e momentos em qualquer ponto e o momento ao longo de cada bordo engastado.
- `reacoes.ts`: reações pelo processo das áreas da NBR 6118 14.7.6.1, com metade do alívio no bordo apoiado oposto a um engastado.
- `tabela.ts`: tipos, ν = 0,15, número de termos (100) e montagem das 22 linhas de cada tipo, incluindo a linha "> 2,00" (faixa como viga).
- `gerar.ts`: escreve o arquivo e formata com o `oxfmt` do repositório.

`tsconfig.json`, `oxlint src` e `oxfmt src` não incluem `scripts/`. `placas.ts`, `reacoes.ts` e `tabela.ts` passam pelo typecheck porque `tabelasBares.test.ts` os importa. Para conferir o resto: `node_modules/.bin/oxlint scripts/bares` e `node_modules/.bin/oxfmt --check scripts/bares`.

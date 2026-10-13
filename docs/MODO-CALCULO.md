# Modo de cálculo: "corrigido" e "original"

Pela NB-1/78 a V2 tem de bater número a número com a V1. A V1 reproduz também erros do SISTRUT 4.0 de 1991. Nesses pontos a obra escolhe o modo em `Obra.modoCalculo`:

- `"corrigido"` (padrão em obra nova; arquivo sem o campo também lê assim): calcula certo.
- `"original"`: reproduz o SISTRUT de 1991, como a V1.

O motor recebe o modo por `calcularObra` (vai em `MateriaisCalc.modoCalculo`) e por `calcularQuantitativos` (lê `obra.modoCalculo`). Só os itens marcados como switch mudam com ele. Os demais são correções da V2 e valem nos dois modos.

## Itens

| Item | Switch | "corrigido" | "original" | Código | Referência do teste |
|---|---|---|---|---|---|
| B. Armadura longitudinal no τc dos estribos | não | da positiva chega ao apoio 1/3 sem negativo e 1/4 com negativo; com negativo vale a menor entre essa parcela e a negativa | igual | `fluxo.ts` `armaduraLongitudinalCortante` (V1 `VcAsLong#`) | V1 BALC.SEC: V4 Asw = 5,3674 cm²/m |
| C. Obra da V1 com balanço | não | apoio "-" do .VIG vira ponta livre (sem pilar) | igual | `importarV1.ts` `pontasEmBalanco` | V1 BALC.SEC: V2 M+ = 1,7046 tf·m |
| D. Aço estimado da laje em balanço | não | a negativa do bordo de balanço vai da borda livre até 0,25·x dentro da vizinha, com x = máx(lmenor; menor vão da vizinha), e só a laje em balanço a conta | igual | `quantitativos.ts` `comprimentoNegativa`, `vizinhancaLajes` | conta à mão (obra q1) |
| E. Negativas no aço das lajes | sim | cada laje conta o seu lado, 0,25·lmenor | cada laje conta a barra inteira, 2·0,25·lmenor (V1 LAJEPROC `ImprimeLinha`); a vizinha conta a mesma barra de novo | `quantitativos.ts` `comprimentoNegativa` | conta à mão |
| F. Volume de concreto | sim | `volumeTela` = `volumeRelatorio` = total certo | `volumeTela` pela regra do editor de formas (FORMEDCA: sem pilares); `volumeRelatorio` pela da impressão (FORMIMP: viga com a altura inteira, a faixa da laje conta duas vezes) | `quantitativos.ts`, `formas.ts` `RegraQuantitativo` | V1 E2E: 10,304 / 12,032; certo 11,384 m³ |
| G. Fôrma | regra certa sempre; no original, as da V1 | pilar até o fundo da laje, menos bw·(hviga − hlaje) em cada face onde chega viga | `formaTela` = FORMEDCA (pilar no pé-direito inteiro; viga sem a laje de referência, a primeira com h > 0); `formaRelatorio` = FORMIMP (viga com a altura inteira) | `formas.ts` `formaPilar`, `encontroNoPilar` | q1: 53,724 m² à mão; V1 E2E: 146,48 / 157,28 |
| H. As,min de viga na NB-1/78 | sim | 0,25 % bw·h com CA-25 (e CA-30); 0,15 % com CA-50 e CA-60 (fonte secundária: Silva e Araújo, Revista Essentia, 2015, citando a NB-1/78) | 0,15 % para qualquer aço (SISTRUT.LAP, linhas 150-151; V1 `VcDimensiona`) | `normas/nb1-78/vigas.ts` `taxaAsMinNb178` | V1 BALC.SEC: As− = 1,3483 cm² (original); 1,5 cm² (corrigido, à mão) |

As lajes não têm switch de armadura mínima.

## O que a interface usa

- `Obra.modoCalculo: "corrigido" | "original"`.
- `Quantitativos.volumeTela` e `formaTela`: o que a tela mostra.
- `Quantitativos.volumeRelatorio` e `formaRelatorio`: o que o relatório mostra. Também são iguais a `total.concreto` e `total.forma`.
- No original, `lajes`, `vigas` e `pilares` (concreto e fôrma) seguem a regra do relatório (FORMIMP), que também dá subtotais por tipo. No corrigido seguem a regra certa.
- `formasObra(obra, regra)` e `formasPavimento(pav, regra)`: regra `"certa"` (padrão), `"editor"` ou `"impressao"`.

## Casos de referência

- **q1** (`_rev5/quant/q1.ts`): L1 4×5 apoiada e L2 em balanço 1,5×5, h 10, pilares 20x30, pé-direito 3. A fôrma certa é 53,724 m²; a regra antiga dava 52,46 (2,35 % a menos). O aço da L2 é 26,49 kg; antes era 3,97 kg.
- **E2E** (V1, `dist/roteiros/saida/e2e_10_forma-*`): 4 lajes 4×5 h 10, vigas 12x40 e 12x50, 9 pilares 20x20, pé-direito 3. O volume certo é 11,384 m³. O editor da V1 dá 10,304 m³ e 146,48 m²; a impressão dá 12,032 m³ e 157,28 m².
- **BALC** (V1, `dist/_rev5/difnb`): é a fixture `src/armazenamento/__fixtures__/v1/BALC.*`.

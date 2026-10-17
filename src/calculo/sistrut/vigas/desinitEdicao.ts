// Armadura editada à mão no DESEDCAO (o .EDV, `ExtrasDesinit.armaduraEditada`) no lugar da
// automática. No original, ao voltar do DESEDCAO o controle passa ao DESINIT, que refaz o
// quadro de ferros com os arrays editados do COMMON e regrava o .TAB (S_202b9,
// DESINIT.BAS:96-104 e 404-966); o DESEDITA, ao reabrir a viga, lê o .EDV para os mesmos
// arrays (DESEDITA.BAS:745-880). `aplicaEdicao` faz a mesma troca no `Comum` depois do
// detalhamento automático e antes do quadro (`posicoesDoQuadro` em desinit.ts).
import type { EdicaoVigaSistrut } from "../../../dominio/edicaoViga";
import { numAte } from "../../texto";
import type { DimensionamentoParaDetalhe } from "../base/tipos";
import { type Comum, type M2, qb } from "./desinitComum";
import { apoiosComNegativo } from "./desinitCorte";

/** Comprimento da viga de ponta a ponta, cm, como o DESEDCAO o grava na 2ª linha do .EDV
 *  (DESEDCAO.BAS:466): face direita do último tramo + último apoio + balanço direito,
 *  menos a face esquerda do 1º tramo − 1º apoio − balanço esquerdo. */
export function comprimentoDaViga(c: Comum) {
  const n = c.v0ddc;
  return c.s(
    c.a1926.g(n, 0) -
      qb(c.v0de4 === 1) * c.a1926.g(n + 1, 1) +
      c.a1a0c.g(n, 1) -
      (c.a1a0c.g(1, 0) - c.a1926.g(0, 0) + qb(c.v0de0 === 1) * c.a1926.g(0, 1)),
  );
}

/** Por que a edição não serve mais à viga (nº de tramos, balanços ou comprimento com mais
 *  de 1 cm de diferença); lista vazia = serve. O original não confere: o DESEDITA lê o
 *  .EDV sobre a viga que estiver no registro. */
export function motivosEdicaoNaoServe(c: Comum, e: EdicaoVigaSistrut): string[] {
  const motivos: string[] = [];
  if (e.tramos !== c.v0ddc) motivos.push(`${e.tramos} tramos na edição e ${c.v0ddc} na viga`);
  const bal = (b: boolean) => (b ? "com" : "sem");
  if (e.balancoEsquerdo !== (c.v0de0 === 1))
    motivos.push(
      `balanço esquerdo: ${bal(e.balancoEsquerdo)} na edição e ${bal(c.v0de0 === 1)} na viga`,
    );
  if (e.balancoDireito !== (c.v0de4 === 1))
    motivos.push(
      `balanço direito: ${bal(e.balancoDireito)} na edição e ${bal(c.v0de4 === 1)} na viga`,
    );
  const comp = comprimentoDaViga(c);
  if (Math.abs(e.comprimento - comp) > 1)
    motivos.push(
      `comprimento de ${numAte(e.comprimento, 1)} cm na edição e ${numAte(comp, 1)} cm na viga`,
    );
  return motivos;
}

/** A bitola da tabela do .DSP igual a `phi` em SINGLE, ou `phi`. O .EDV grava a bitola
 *  como texto ("6.3") e o original a lê para uma variável SINGLE; no modo corrigido a
 *  tabela pode estar em SINGLE e a comparação exata do quadro perderia a bitola. */
function bitolaDaTabela(c: Comum, phi: number) {
  for (let i = 0; i <= 9; i++)
    if (Math.fround(c.bitola.g(i)) === Math.fround(phi)) return c.bitola.g(i);
  return phi;
}

/** Troca contagens e arrays do COMMON pelos da edição (a ordem das colunas é a do .EDV,
 *  DESEDCAO.BAS:464-588). Os arrays de tamanho fixo são os do original: a edição maior
 *  que eles é recusada na leitura e na validação do arquivo. */
export function aplicaEdicao(c: Comum, e: EdicaoVigaSistrut) {
  const longitudinais = (m: M2, dobras: M2, barras: EdicaoVigaSistrut["negativas"]) => {
    for (const [k, b] of barras.entries()) {
      m.p(k + 1, 0, b.quantidade);
      m.p(k + 1, 1, bitolaDaTabela(c, b.bitola));
      m.p(k + 1, 2, b.inicio);
      m.p(k + 1, 3, b.fim);
      dobras.p(k + 1, 0, b.dobras[0]);
      dobras.p(k + 1, 1, b.dobras[1]);
    }
    return barras.length;
  };
  const grampos = (m: M2, lista: EdicaoVigaSistrut["grampoNegativos"]) => {
    for (const [k, g] of lista.entries()) {
      m.p(k + 1, 0, g.quantidade);
      m.p(k + 1, 1, bitolaDaTabela(c, g.bitola));
      m.p(k + 1, 2, g.inicio);
      m.p(k + 1, 3, g.fim);
      m.p(k + 1, 4, g.lado === "direito" ? 1 : 0);
      m.p(k + 1, 5, g.largura);
    }
    return lista.length;
  };
  c.v185e = longitudinais(c.a1af2, c.a1b4e, e.negativas);
  c.v1872 = grampos(c.a1bd8, e.grampoNegativos);
  c.v1866 = longitudinais(c.a1ac4, c.a1b20, e.positivas);
  c.v1876 = grampos(c.a1baa, e.grampoPositivos);
  for (const [k, p] of e.portaEstribos.entries()) {
    c.a1b7c.p(k + 1, 0, p.quantidade);
    c.a1b7c.p(k + 1, 1, bitolaDaTabela(c, p.bitola));
    c.a1b7c.p(k + 1, 2, p.inicio);
    c.a1b7c.p(k + 1, 3, p.fim);
  }
  c.v1862 = e.portaEstribos.length;
  // pele: o .EDV grava todos os trechos 0..n + balD; o leitor guarda os que têm barra
  for (let t = 0; t <= c.a1c34.n; t++) for (let j = 0; j <= 3; j++) c.a1c34.p(t, j, 0);
  for (let j = 0; j <= c.a1a96.n; j++) c.a1a96.p(j, 0);
  c.v186e = e.pele?.linhas ?? 0;
  for (const p of e.pele?.trechos ?? []) {
    c.a1c34.p(p.trecho, 0, p.quantidadePorFace);
    c.a1c34.p(p.trecho, 1, bitolaDaTabela(c, p.bitola));
    c.a1c34.p(p.trecho, 2, p.inicio);
    c.a1c34.p(p.trecho, 3, p.fim);
  }
  for (const [j, n] of (e.pele?.trechosPorBitola ?? []).entries()) c.a1a96.p(j, n);
  for (const [k, t] of e.estribos.entries()) {
    const r = k + 1;
    c.a1c06.p(r, 0, t.inicio);
    c.a1c06.p(r, 1, t.fim);
    c.a1c06.p(r, 2, bitolaDaTabela(c, t.bitola));
    c.a1c06.p(r, 3, t.espacamento);
    c.a1c06.p(r, 4, t.ladoALado);
    c.a1c06.p(r, 5, t.bw + t.h * 0.0001);
    c.a1c06.p(r, 6, t.posicao);
  }
  c.v186a = e.estribos.length;
}

/** Modo corrigido: As das negativas editadas que passam no meio de cada apoio com
 *  negativa (os de `apoiosComNegativo`, como no detalhamento) e das positivas no meio do
 *  vão livre de cada tramo, contra a As necessária do dimensionamento. Uma linha de aviso
 *  por seção abaixo da necessária. O original não confere a edição (DESEDCAO). */
export function conferenciaAsEditada(
  c: Comum,
  e: EdicaoVigaSistrut,
  dim: DimensionamentoParaDetalhe,
): string[] {
  const avisos: string[] = [];
  const asEm = (barras: EdicaoVigaSistrut["negativas"], x: number) =>
    barras
      .filter((b) => b.inicio <= x && x <= b.fim)
      .reduce((s, b) => s + b.quantidade * c.areaDaBitola(bitolaDaTabela(c, b.bitola)), 0);
  const confere = (onde: string, necessaria: number, editada: number, tipo: string) => {
    if (necessaria > 0 && editada < necessaria * (1 - 1e-6))
      avisos.push(
        `${onde}: armadura ${tipo} editada no SISTRUT com As = ${numAte(editada, 2)} cm², abaixo da necessária pelo dimensionamento corrigido (${numAte(necessaria, 2)} cm²); confira a edição.`,
      );
  };
  const n = c.v0ddc;
  const { ini, fim } = apoiosComNegativo(c);
  for (let k = ini; k <= fim; k++) {
    const centro =
      k === 0 ? c.a1a0c.g(1, 0) - c.a1926.g(0, 0) / 2 : c.a1a0c.g(k, 1) + c.a1926.g(k, 0) / 2;
    confere(
      `apoio ${k}, a ${numAte(centro, 1)} cm da ponta esquerda`,
      dim.apoios[k]?.as ?? 0,
      asEm(e.negativas, centro),
      "negativa",
    );
  }
  for (let t = 1; t <= n; t++) {
    const meio = (c.a1a0c.g(t, 0) + c.a1a0c.g(t, 1)) / 2;
    confere(
      `tramo ${t}, no meio do vão livre (${numAte(meio, 1)} cm da ponta esquerda)`,
      dim.tramos[t - 1]?.flexao.as ?? 0,
      asEm(e.positivas, meio),
      "positiva",
    );
  }
  return avisos;
}

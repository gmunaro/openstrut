// Armação das vigas em DXF, a partir do detalhamento (telas/detalhamento.ts).
// Unidade do desenho: cm, em escala real. Um desenho por viga, empilhados de
// cima para baixo na ordem da obra, e no fim a tabela de aço da obra inteira.
//
// Cada desenho tem:
// - elevação: contorno da viga, apoios com a largura deles, estribos dentro da
//   viga e as barras longitudinais desenhadas fora dela (superiores acima,
//   inferiores abaixo), cada uma de xInicio a xFim com os ganchos, e o rótulo
//   "N1 2φ10 c=345";
// - corte A-A no meio do maior vão: seção, estribo e as barras que passam ali;
// - tabela de aço da viga (posições e resumo por bitola, com a perda).
import { tabelaAco, type TabelaAco } from "../calculo/detalhamento/tabelaAco";
import type { PosicaoArmadura } from "../calculo/detalhamento/vigas";
import type { Obra } from "../dominio/obra";
import {
  rotuloPhi,
  rotuloPosicao,
  type DetalhamentoVigaObra,
  type DetalhamentoVigasObra,
} from "../telas/detalhamento";
import {
  type Camada,
  deslocar,
  type Entidade,
  escreverDxf,
  extensao,
  retangulo,
  texto,
} from "./dxf";

export const CAMADAS_ARMACAO = [
  { nome: "CONCRETO", cor: 8 },
  { nome: "BARRAS", cor: 1 },
  { nome: "ESTRIBOS", cor: 3 },
  { nome: "TEXTOS", cor: 7 },
  { nome: "TABELA", cor: 7 },
  { nome: "TITULO", cor: 7 },
] as const satisfies readonly Camada[];

/** Alturas de texto, cm. */
const ALTURA_TEXTO = 8;
const ALTURA_TITULO = 15;
/** Distância entre as faixas das barras desenhadas fora da viga, cm. */
const FAIXA = 25;
/** Altura do toco de apoio desenhado abaixo da viga, cm. */
const TOCO_APOIO = 20;
/** Espaço entre a elevação, o corte e a tabela, e entre as vigas, cm. */
const AFASTAMENTO = 80;
const ESPACO_VIGAS = 150;
/** Linha da tabela de aço, cm. */
const LINHA_TABELA = 14;

const emCima = (p: PosicaoArmadura) => p.tipo === "negativa" || p.tipo === "porta-estribos";
const decimal = (v: number, casas: number) => v.toFixed(casas).replace(".", ",");
const linha = (camada: string, x1: number, y1: number, x2: number, y2: number): Entidade => ({
  tipo: "linha",
  camada,
  x1,
  y1,
  x2,
  y2,
});

/** Barra longitudinal na altura y, com os ganchos voltados para a viga (sentido −1 desce). */
function barra(p: PosicaoArmadura, y: number, sentido: 1 | -1): Entidade[] {
  const pontos = [
    ...(p.ganchoInicio > 0 ? [{ x: p.xInicio, y: y + sentido * p.ganchoInicio }] : []),
    { x: p.xInicio, y },
    { x: p.xFim, y },
    ...(p.ganchoFim > 0 ? [{ x: p.xFim, y: y + sentido * p.ganchoFim }] : []),
  ];
  return [
    { tipo: "polilinha", camada: "BARRAS", pontos, fechada: false },
    texto("TEXTOS", (p.xInicio + p.xFim) / 2, y + 3, ALTURA_TEXTO, rotuloPosicao(p), {
      alinhamento: "centro",
    }),
  ];
}

/** Elevação: viga, apoios, estribos e barras. Devolve as entidades e o x do corte. */
function elevacao(d: DetalhamentoVigaObra) {
  const ents: Entidade[] = [];
  const ps = d.detalhamento.posicoes;
  const L = d.nos.at(-1) ?? 0;
  ents.push(retangulo("CONCRETO", 0, 0, L, d.h));
  d.nos.forEach((x, k) => {
    const w = d.larguraApoios[k] ?? 0;
    if (w > 0) ents.push(retangulo("CONCRETO", x - w / 2, -TOCO_APOIO, x + w / 2, 0));
  });

  // estribos dentro da viga, igualmente espaçados na região estribada
  for (const p of ps.filter((q) => q.tipo === "estribo")) {
    const n = p.quantidade;
    for (let i = 0; i < n; i++) {
      const x = n > 1 ? p.xInicio + ((p.xFim - p.xInicio) * i) / (n - 1) : p.xInicio;
      ents.push(linha("ESTRIBOS", x, d.cobrimento, x, d.h - d.cobrimento));
    }
  }

  // barras fora da viga: superiores de baixo para cima, inferiores de cima para baixo
  const sup = ps.filter(emCima);
  const inf = ps.filter((p) => !emCima(p));
  sup.forEach((p, i) => ents.push(...barra(p, d.h + FAIXA * (i + 1), -1)));
  inf.forEach((p, i) => {
    const y = -TOCO_APOIO - FAIXA * (i + 1);
    if (p.tipo === "estribo") {
      ents.push(
        linha("ESTRIBOS", p.xInicio, y, p.xFim, y),
        linha("ESTRIBOS", p.xInicio, y - 4, p.xInicio, y + 4),
        linha("ESTRIBOS", p.xFim, y - 4, p.xFim, y + 4),
        texto("TEXTOS", (p.xInicio + p.xFim) / 2, y + 3, ALTURA_TEXTO, rotuloPosicao(p), {
          alinhamento: "centro",
        }),
      );
    } else ents.push(...barra(p, y, 1));
  });

  // corte no meio do maior vão que não é balanço (ou do maior, se só houver balanço)
  let xCorte = L / 2;
  let maior = -1;
  for (let t = 0; t + 1 < d.nos.length; t++) {
    const [a = 0, b = 0] = [d.nos[t], d.nos[t + 1]];
    const balanco = (d.larguraApoios[t] ?? 0) === 0 || (d.larguraApoios[t + 1] ?? 0) === 0;
    const peso = b - a + (balanco ? 0 : 1e6);
    if (peso > maior) [maior, xCorte] = [peso, (a + b) / 2];
  }
  ents.push(
    linha("TEXTOS", xCorte, -8, xCorte, d.h + 8),
    texto("TEXTOS", xCorte + 2, d.h + 4, ALTURA_TEXTO, "A"),
    texto("TEXTOS", xCorte + 2, -8, ALTURA_TEXTO, "A"),
  );
  return { ents, xCorte };
}

/** Círculo aproximado por um octógono (o escritor R12 não tem CIRCLE). */
function circulo(camada: string, cx: number, cy: number, r: number): Entidade {
  const pontos = Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  return { tipo: "polilinha", camada, pontos, fechada: true };
}

/** Corte transversal em x: seção, estribo e as barras longitudinais que passam ali,
 *  com origem no canto inferior esquerdo da seção. */
function corte(d: DetalhamentoVigaObra, x: number): Entidade[] {
  const { bw, h, cobrimento: c } = d;
  const ps = d.detalhamento.posicoes;
  const passa = (p: PosicaoArmadura) => p.xInicio <= x + 1e-6 && x <= p.xFim + 1e-6;
  const estribo = ps.find((p) => p.tipo === "estribo" && passa(p));
  const phiT = (estribo?.phi ?? 5) / 10;
  const ents: Entidade[] = [retangulo("CONCRETO", 0, 0, bw, h)];
  if (estribo) ents.push(retangulo("ESTRIBOS", c, c, bw - c, h - c));

  /** Uma camada de barras na altura y (do centro), distribuídas na largura útil. */
  const camada = (grupo: PosicaoArmadura[], topo: boolean) => {
    const barras = grupo.flatMap((p) => Array.from({ length: p.quantidade }, () => p));
    const n = barras.length;
    if (n === 0) return;
    const phiMax = Math.max(...barras.map((p) => p.phi)) / 10;
    const y = topo ? h - c - phiT - phiMax / 2 : c + phiT + phiMax / 2;
    const xa = c + phiT + phiMax / 2;
    const xb = bw - xa;
    barras.forEach((p, i) => {
      const xi = n > 1 ? xa + ((xb - xa) * i) / (n - 1) : bw / 2;
      ents.push(circulo("BARRAS", xi, y, p.phi / 20));
    });
    const rotulo = grupo.map((p) => `${p.nome} ${p.quantidade}φ${rotuloPhi(p.phi)}`).join(" + ");
    ents.push(texto("TEXTOS", bw + 5, y - ALTURA_TEXTO / 2, ALTURA_TEXTO, rotulo));
  };
  camada(
    ps.filter((p) => emCima(p) && passa(p)),
    true,
  );
  camada(
    ps.filter((p) => !emCima(p) && p.tipo !== "estribo" && passa(p)),
    false,
  );
  if (estribo)
    ents.push(
      texto(
        "TEXTOS",
        bw + 5,
        h / 2 - ALTURA_TEXTO / 2,
        ALTURA_TEXTO,
        `${estribo.nome} φ${rotuloPhi(estribo.phi)} c/${rotuloPhi(estribo.espacamento ?? 0)}`,
      ),
    );
  ents.push(
    texto("TITULO", bw / 2, -TOCO_APOIO, ALTURA_TEXTO * 1.25, "CORTE A-A", {
      alinhamento: "centro",
    }),
    texto("TEXTOS", bw / 2, -TOCO_APOIO - 12, ALTURA_TEXTO, `${bw}x${h}`, {
      alinhamento: "centro",
    }),
  );
  return ents;
}

/** Grade de texto com linhas horizontais, a partir de (x, y) para baixo. Colunas
 *  com largura e alinhamento; a primeira linha é o cabeçalho. */
function grade(
  x: number,
  y: number,
  colunas: readonly { largura: number; direita?: boolean }[],
  linhas: readonly (readonly string[])[],
): Entidade[] {
  const ents: Entidade[] = [];
  const largura = colunas.reduce((s, c) => s + c.largura, 0);
  linhas.forEach((cels, i) => {
    const yl = y - LINHA_TABELA * (i + 1);
    let xc = x;
    cels.forEach((cel, j) => {
      const col = colunas[j];
      if (!col) return;
      const xt = col.direita ? xc + col.largura - 3 : xc + 3;
      ents.push(
        texto("TABELA", xt, yl + 4, ALTURA_TEXTO, cel, {
          alinhamento: col.direita ? "direita" : "esquerda",
        }),
      );
      xc += col.largura;
    });
    ents.push(linha("TABELA", x, yl, x + largura, yl));
  });
  ents.push(linha("TABELA", x, y, x + largura, y));
  return ents;
}

/** Resumo por bitola (aço, φ, comprimento, massa) com a perda e o total. */
function resumoAco(t: TabelaAco, x: number, y: number): Entidade[] {
  const linhas = [
    ["AÇO", "φ (mm)", "COMPR. (m)", "MASSA (kg)"],
    ...t.linhas.map((l) => [
      l.aco ?? "",
      rotuloPhi(l.phi),
      decimal(l.comprimento, 2),
      decimal(l.massa, 1),
    ]),
    ["", "", "TOTAL", decimal(t.massa, 1)],
    ["", "", `PERDA ${decimal(t.perda * 100, 0)}%`, decimal(t.massaComPerda - t.massa, 1)],
    ["", "", "TOTAL C/ PERDA", decimal(t.massaComPerda, 1)],
  ];
  return grade(
    x,
    y,
    [
      { largura: 45 },
      { largura: 40, direita: true },
      { largura: 85, direita: true },
      { largura: 60, direita: true },
    ],
    linhas,
  );
}

/** Tabela de aço da viga: posições e resumo por bitola, a partir de (x, y) para baixo. */
function tabelaViga(d: DetalhamentoVigaObra, x: number, y: number): Entidade[] {
  const ps = d.detalhamento.posicoes;
  const rep = d.repeticoes > 1 ? ` (por pavimento; x ${d.repeticoes} na obra)` : "";
  const posicoes = [
    ["N", "φ (mm)", "QUANT.", "UNIT. (cm)", "TOTAL (m)"],
    ...ps.map((p) => [
      p.nome,
      rotuloPhi(p.phi),
      String(p.quantidade),
      String(p.comprimento),
      decimal((p.quantidade * p.comprimento) / 100, 2),
    ]),
  ];
  const ents = [
    texto("TITULO", x, y + 4, ALTURA_TEXTO * 1.25, `TABELA DE AÇO - ${d.nome}${rep}`),
    ...grade(
      x,
      y,
      [
        { largura: 30 },
        { largura: 40, direita: true },
        { largura: 45, direita: true },
        { largura: 55, direita: true },
        { largura: 60, direita: true },
      ],
      posicoes,
    ),
  ];
  const yResumo = y - LINHA_TABELA * (posicoes.length + 1);
  ents.push(...resumoAco(tabelaAco(ps), x, yResumo));
  return ents;
}

/** Entidades do desenho de uma viga, em cm, com a elevação a partir de (0, 0). */
export function entidadesArmacaoViga(obra: Obra, d: DetalhamentoVigaObra): Entidade[] {
  const elev = elevacao(d);
  const ents = [...elev.ents];
  const ext = extensao(ents) ?? { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  const xCorte = ext.xmax + AFASTAMENTO;
  ents.push(...corte(d, elev.xCorte).map((e) => deslocar(e, xCorte, 0)));
  const xTabela = (extensao(ents)?.xmax ?? xCorte) + AFASTAMENTO;
  ents.push(...tabelaViga(d, xTabela, Math.max(ext.ymax, d.h)));
  const topo = extensao(ents)?.ymax ?? d.h;
  const rep = d.repeticoes > 1 ? ` (x${d.repeticoes})` : "";
  ents.push(
    texto(
      "TITULO",
      0,
      topo + 20,
      ALTURA_TITULO,
      `VIGA ${d.nome} - ${d.bw}x${d.h} - ${d.pavimento}${rep}`,
    ),
    texto(
      "TITULO",
      0,
      topo + 20 - 1.6 * ALTURA_TITULO,
      ALTURA_TEXTO,
      `Obra: ${obra.nome} - medidas em cm, φ em mm - cobrimento ${decimal(d.cobrimento, 1)} cm`,
    ),
  );
  // avisos do detalhamento (ancoragem, barra longa) embaixo de tudo
  const base = (extensao(ents)?.ymin ?? 0) - 20;
  for (const [i, aviso] of d.detalhamento.avisos.entries())
    ents.push(texto("TEXTOS", 0, base - 1.5 * ALTURA_TEXTO * i, ALTURA_TEXTO, `AVISO: ${aviso}`));
  return ents;
}

/** DXF da armação de todas as vigas detalhadas, uma embaixo da outra, e a tabela
 *  de aço das vigas da obra (com as repetições) no fim. */
export function dxfArmacaoVigas(obra: Obra, det: DetalhamentoVigasObra) {
  const todas: Entidade[] = [];
  let cursor = 0;
  const empilha = (ents: Entidade[]) => {
    const ext = extensao(ents);
    if (!ext) return;
    const dy = cursor - ext.ymax;
    todas.push(...ents.map((e) => deslocar(e, -ext.xmin, dy)));
    cursor = ext.ymin + dy - ESPACO_VIGAS;
  };
  for (const d of det.vigas) empilha(entidadesArmacaoViga(obra, d));
  empilha([
    texto("TITULO", 0, 4, ALTURA_TITULO, "TABELA DE AÇO - VIGAS DA OBRA (com repetições)"),
    ...resumoAco(det.tabela, 0, -10),
  ]);
  return escreverDxf(CAMADAS_ARMACAO, todas);
}

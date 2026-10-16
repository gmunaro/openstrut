// Planta de formas em DXF, a partir dos mesmos dados que o editor de planta
// desenha (Pavimento de src/dominio: lajes pelos eixos, vigas pelo eixo com
// largura bw, pilares pelo centro com b em x e h em y). Unidade do desenho: cm,
// com a origem da obra (x = 0, y = 0 m) em (0, 0).
//
// Por pavimento: contorno das lajes (eixos) com "L1 h=10"; vigas como retângulo
// de largura bw com "V1 12x40" (bw x h); pilares hachurados com "P1 20x20" (b x h);
// cotas nos dois eixos (parciais entre os eixos e a total) e o título com o nome
// do pavimento, da obra e a área de fôrma.
//
// Obra inteira: UM arquivo com todos os pavimentos lado a lado em x, na ordem da
// obra (do topo para a base), separados por ESPACO_PAVIMENTOS. Um arquivo só é
// mais simples de baixar e de abrir; cada pavimento continua com o seu título.
import { formasPavimento } from "../calculo/formas";
import type { Obra, Pavimento } from "../dominio/obra";
import {
  type Camada,
  cota,
  deslocar,
  type Entidade,
  escreverDxf,
  extensao,
  hachuraRetangulo,
  retangulo,
  rotuloCota,
  texto,
} from "./dxf";

export const CAMADAS_FORMAS = [
  { nome: "LAJES", cor: 7 },
  { nome: "VIGAS", cor: 3 },
  { nome: "PILARES", cor: 1 },
  { nome: "HACHURA", cor: 8 },
  { nome: "TEXTOS", cor: 7 },
  { nome: "COTAS", cor: 4 },
  { nome: "TITULO", cor: 7 },
] as const satisfies readonly Camada[];

/** Metros da obra → cm do desenho. */
const CM = 100;
/** Alturas de texto, cm. */
const ALTURA_TEXTO = 15;
const ALTURA_COTA = 12;
const ALTURA_TITULO = 25;
/** Afastamento entre as linhas de hachura dos pilares, cm. */
const PASSO_HACHURA = 5;
/** Distância da 1ª linha de cota ao desenho e entre linhas de cota, cm. */
const AFASTAMENTO_COTA = 50;
const ENTRE_COTAS = 40;
/** Espaço entre pavimentos no arquivo da obra, cm. */
export const ESPACO_PAVIMENTOS = 300;

const area = (m2: number) => `${m2.toFixed(2).replace(".", ",")} m²`;

/** Coordenadas distintas (a menos de 0,1 cm), em ordem crescente. */
function distintas(vs: readonly number[]) {
  const ordenadas = [...vs].sort((a, b) => a - b);
  return ordenadas.filter((v, i) => i === 0 || v - (ordenadas[i - 1] ?? v) > 0.1);
}

/** Lajes, vigas e pilares do pavimento, em cm. */
function elementos(pav: Pavimento): Entidade[] {
  const ents: Entidade[] = [];
  for (const l of pav.lajes) {
    const [x, y, lx, ly] = [l.x * CM, l.y * CM, l.lx * CM, l.ly * CM];
    ents.push(retangulo("LAJES", x, y, x + lx, y + ly));
    ents.push(
      texto("TEXTOS", x + lx / 2, y + ly / 2, ALTURA_TEXTO, `${l.nome} h=${rotuloCota(l.h)}`, {
        alinhamento: "centro",
      }),
    );
  }
  for (const v of pav.vigas) {
    const [x1, y1, x2, y2] = [v.x1 * CM, v.y1 * CM, v.x2 * CM, v.y2 * CM];
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L === 0) continue;
    // direção do eixo (d) e normal à esquerda dele (n)
    const [dx, dy] = [(x2 - x1) / L, (y2 - y1) / L];
    const [nx, ny] = [-dy, dx];
    const m = v.bw / 2;
    ents.push({
      tipo: "polilinha",
      camada: "VIGAS",
      fechada: true,
      pontos: [
        { x: x1 - nx * m, y: y1 - ny * m },
        { x: x2 - nx * m, y: y2 - ny * m },
        { x: x2 + nx * m, y: y2 + ny * m },
        { x: x1 + nx * m, y: y1 + ny * m },
      ],
    });
    // rótulo ao lado da viga, no meio do maior vão entre pilares (longe dos rótulos
    // dos pilares), sempre legível (rotação em (-90°, 90°])
    const apoios = pav.pilares
      .map((p) => ({
        s: (p.x * CM - x1) * dx + (p.y * CM - y1) * dy,
        d: (p.x * CM - x1) * nx + (p.y * CM - y1) * ny,
      }))
      .filter((a) => Math.abs(a.d) <= 1 && a.s > 0 && a.s < L)
      .map((a) => a.s);
    const marcas = [0, ...apoios.sort((a, b) => a - b), L];
    let meio = L / 2;
    let maior = -1;
    for (let i = 1; i < marcas.length; i++) {
      const [a = 0, b = 0] = [marcas[i - 1], marcas[i]];
      if (b - a > maior + 1e-6) [maior, meio] = [b - a, (a + b) / 2];
    }
    let rotacao = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (rotacao > 90 + 1e-9) rotacao -= 180;
    if (rotacao <= -90 + 1e-9) rotacao += 180;
    const afasta = m + 4 + ALTURA_TEXTO / 2;
    ents.push(
      texto(
        "TEXTOS",
        x1 + dx * meio + nx * afasta,
        y1 + dy * meio + ny * afasta,
        ALTURA_TEXTO,
        `${v.nome} ${rotuloCota(v.bw)}x${rotuloCota(v.h)}`,
        { alinhamento: "centro", rotacao },
      ),
    );
  }
  for (const p of pav.pilares) {
    const [x, y, b, h] = [p.x * CM, p.y * CM, p.b / 2, p.h / 2];
    ents.push(retangulo("PILARES", x - b, y - h, x + b, y + h));
    ents.push(...hachuraRetangulo("HACHURA", x - b, y - h, x + b, y + h, PASSO_HACHURA));
    ents.push(
      texto(
        "TEXTOS",
        x + b + 4,
        y + h + 4,
        ALTURA_TEXTO,
        `${p.nome} ${rotuloCota(p.b)}x${rotuloCota(p.h)}`,
      ),
    );
  }
  return ents;
}

/** Cotas parciais entre as coordenadas dadas e a total, numa direção. */
function cotasEixo(eixo: "x" | "y", coords: readonly number[], origem: number, sentido: -1 | 1) {
  const cs = distintas(coords);
  const primeira = cs[0];
  const ultima = cs[cs.length - 1];
  if (primeira === undefined || ultima === undefined || ultima - primeira <= 0.1) return [];
  const base = { camada: "COTAS", eixo, origem, altura: ALTURA_COTA };
  const ents: Entidade[] = [];
  let em = origem + sentido * AFASTAMENTO_COTA;
  if (cs.length > 2) {
    for (let i = 1; i < cs.length; i++)
      ents.push(...cota({ ...base, de: cs[i - 1] ?? primeira, ate: cs[i] ?? ultima, em }));
    em += sentido * ENTRE_COTAS;
  }
  ents.push(...cota({ ...base, de: primeira, ate: ultima, em }));
  return ents;
}

/** Entidades da planta de formas de um pavimento, em cm, na posição da obra. */
export function entidadesPlantaFormas(obra: Obra, pav: Pavimento): Entidade[] {
  const ents = elementos(pav);
  const desenho = extensao(ents);

  // cotas: eixos das lajes, vigas e pilares; x embaixo, y à esquerda
  if (desenho) {
    const xs = [
      ...pav.lajes.flatMap((l) => [l.x, l.x + l.lx]),
      ...pav.vigas.flatMap((v) => [v.x1, v.x2]),
      ...pav.pilares.map((p) => p.x),
    ].map((v) => v * CM);
    const ys = [
      ...pav.lajes.flatMap((l) => [l.y, l.y + l.ly]),
      ...pav.vigas.flatMap((v) => [v.y1, v.y2]),
      ...pav.pilares.map((p) => p.y),
    ].map((v) => v * CM);
    ents.push(...cotasEixo("x", xs, desenho.ymin, -1), ...cotasEixo("y", ys, desenho.xmin, -1));
  }

  // título abaixo de tudo
  const tudo = extensao(ents) ?? { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  const forma = formasPavimento(pav);
  const repeticoes = pav.repeticoes > 1 ? ` x ${pav.repeticoes} = ${area(forma.total)}` : "";
  const x = tudo.xmin;
  const y = tudo.ymin - 60;
  ents.push(
    texto("TITULO", x, y, ALTURA_TITULO, `PLANTA DE FORMAS - ${pav.nome}`),
    texto("TITULO", x, y - 1.6 * ALTURA_TITULO, ALTURA_TEXTO, `Obra: ${obra.nome} - medidas em cm`),
    texto(
      "TITULO",
      x,
      y - 1.6 * ALTURA_TITULO - 1.6 * ALTURA_TEXTO,
      ALTURA_TEXTO,
      `Área de fôrma: ${area(forma.porPavimento)} por pavimento${repeticoes}`,
    ),
  );
  return ents;
}

/** DXF da planta de formas de um pavimento. */
export const dxfPlantaFormas = (obra: Obra, pav: Pavimento) =>
  escreverDxf(CAMADAS_FORMAS, entidadesPlantaFormas(obra, pav));

/**
 * DXF da obra inteira: os pavimentos lado a lado em x (o primeiro na posição da obra).
 * Lança Error se nenhum pavimento tem laje, viga ou pilar: não há o que desenhar.
 */
export function dxfFormasObra(obra: Obra) {
  const temGeometria = obra.pavimentos.some(
    (p) => p.lajes.length + p.vigas.length + p.pilares.length > 0,
  );
  if (!temGeometria) {
    throw new Error(
      "A obra não tem lajes, vigas nem pilares: não há planta de formas para exportar.",
    );
  }
  const todas: Entidade[] = [];
  let cursor: number | undefined;
  for (const pav of obra.pavimentos) {
    const ents = entidadesPlantaFormas(obra, pav);
    const ext = extensao(ents);
    if (!ext) continue;
    const dx = cursor === undefined ? 0 : cursor - ext.xmin;
    todas.push(...ents.map((e) => deslocar(e, dx, 0)));
    cursor = ext.xmax + dx + ESPACO_PAVIMENTOS;
  }
  return escreverDxf(CAMADAS_FORMAS, todas);
}

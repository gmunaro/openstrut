// Geometria das barras de armadura de vigas e pilares a partir do detalhamento: onde
// cada barra e cada estribo ficam na peça, com cobrimento, estribo e distribuição na
// seção. Um lugar só para a regra, usado pela vista 3D (telas/obra3d) e pelo
// exportador IFC (exportacao/ifc/modelo.ts, de onde a lógica foi extraída). Puro, em
// metros, no sistema local da peça; cada consumidor leva ao seu sistema de coordenadas.
import type { PosicaoArmadura } from "../calculo/detalhamento/vigas";
import type { Pilar } from "./obra";

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** Perfil 2D da seção, m, centrado na origem. */
export type PerfilSecao =
  | { tipo: "retangulo"; largura: number; altura: number }
  | { tipo: "circulo"; raio: number; parede?: number }
  /** Contorno anti-horário, sem repetir o primeiro ponto. */
  | { tipo: "poligono"; pontos: { x: number; y: number }[] }
  /** Mesa em cima: largura `mesa` e espessura `espessuraMesa`; alma `alma`; altura total. */
  | { tipo: "T"; altura: number; mesa: number; espessuraMesa: number; alma: number };

/** Uma posição de armadura (N1, N2…): a forma de uma barra no sistema local da peça e o
 *  deslocamento de cada barra igual. Cada barra é `forma` somada a uma `copia`. */
export interface PosicaoGeometria {
  nome: string;
  /** Viga: positiva, negativa, porta-estribos, pele, construtiva ou estribo. Pilar:
   *  longitudinal ou estribo. */
  tipo:
    | "positiva"
    | "negativa"
    | "porta-estribos"
    | "pele"
    | "construtiva"
    | "longitudinal"
    | "estribo";
  /** Bitola, mm. */
  phi: number;
  aco: string;
  /** Comprimento de cada barra, cm (o do detalhamento). */
  comprimento: number;
  /** Polilinha da barra, m. O estribo é aberto: termina 2φ antes do início. */
  forma: P3[];
  /** Deslocamento de cada barra em relação à forma, m. */
  copias: P3[];
}

/** Barra de viga num formato comum aos detalhamentos (o da V2 e o do DESENHO do
 *  SISTRUT): x em m ao longo do eixo a partir da origem da viga; ganchos em m;
 *  estribos com a abscissa de cada um. */
export interface BarraViga {
  nome: string;
  tipo: PosicaoGeometria["tipo"] | "grampo";
  phi: number;
  quantidade: number;
  comprimento: number;
  inicio: number;
  fim: number;
  ganchoInicio: number;
  ganchoFim: number;
  /** Só estribos: abscissa de cada um, m. */
  estribos?: number[];
}

/** Abscissas de n pontos igualmente espaçados de a a b (com as pontas). */
export const espalhar = (a: number, b: number, n: number) =>
  Array.from({ length: Math.max(0, n) }, (_, i) => (n > 1 ? a + ((b - a) * i) / (n - 1) : a));

/** Detalhamento da V2 (calculo/detalhamento/vigas.ts, x em cm a partir do primeiro nó)
 *  no formato comum; `origem` = posição do primeiro nó no eixo, m. Os estribos de cada
 *  posição ficam igualmente espaçados na região estribada. */
export function barrasDaV2(posicoes: readonly PosicaoArmadura[], origem: number): BarraViga[] {
  return posicoes.map((p) => ({
    nome: p.nome,
    tipo: p.tipo,
    phi: p.phi,
    quantidade: p.quantidade,
    comprimento: p.comprimento,
    inicio: origem + p.xInicio / 100,
    fim: origem + p.xFim / 100,
    ganchoInicio: p.ganchoInicio / 100,
    ganchoFim: p.ganchoFim / 100,
    ...(p.tipo === "estribo"
      ? { estribos: espalhar(origem + p.xInicio / 100, origem + p.xFim / 100, p.quantidade) }
      : {}),
  }));
}

/** Contorno do estribo (cantos, sem repetir o primeiro) aberto: volta pelo último lado e
 *  para a `folga` do ponto inicial. */
export function estriboAberto(cantos: readonly P3[], folga: number): P3[] {
  const a = cantos[0]!;
  const b = cantos.at(-1)!;
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const t = L > 0 ? Math.min(folga / L, 0.5) : 0;
  return [
    ...cantos,
    { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t },
  ];
}

/** Posições y de n barras numa camada de largura útil `largura` (centrada). */
const naLargura = (n: number, largura: number) =>
  n <= 1 ? [0] : Array.from({ length: n }, (_, i) => -largura / 2 + (largura * i) / (n - 1));

/** Barras da viga no sistema local dela: x no eixo (m, como em `barras`), y lateral (à
 *  esquerda de quem anda no sentido de x), z para cima com o topo da viga em 0.
 *  Longitudinais numa camada (positivas embaixo; negativas e porta-estribos em cima;
 *  pele nas faces), a `cobrimento + φestribo + φ/2` das faces e com os ganchos voltados
 *  para dentro da viga; estribos retangulares na alma, a `cobrimento + φ/2` das faces.
 *  `secaoEm(x)` dá bw e h (m) da alma no ponto x. Grampos não entram. */
export function armaduraViga(
  barras: readonly BarraViga[],
  secaoEm: (x: number) => { bw: number; h: number },
  cobrimento: number,
  aco: string,
  acoEstribo: string,
): PosicaoGeometria[] {
  const phiEstribo = (barras.find((b) => b.tipo === "estribo")?.phi ?? 5) / 1000;
  const c = cobrimento / 100;
  const pos: PosicaoGeometria[] = [];
  for (const b of barras) {
    if (b.tipo === "grampo" || b.quantidade <= 0 || b.phi <= 0) continue;
    const phi = b.phi / 1000;
    if (b.tipo === "estribo") {
      const xs = b.estribos ?? [];
      if (xs.length === 0) continue;
      const { bw, h } = secaoEm((b.inicio + b.fim) / 2);
      const meio = bw / 2 - c - phi / 2;
      const topo = -c - phi / 2;
      const fundo = -h + c + phi / 2;
      if (meio <= 0 || topo <= fundo) continue;
      pos.push({
        nome: b.nome,
        tipo: "estribo",
        phi: b.phi,
        aco: acoEstribo,
        comprimento: b.comprimento,
        forma: estriboAberto(
          [
            { x: 0, y: -meio, z: topo },
            { x: 0, y: meio, z: topo },
            { x: 0, y: meio, z: fundo },
            { x: 0, y: -meio, z: fundo },
          ],
          2 * phi,
        ),
        copias: xs.map((x) => ({ x, y: 0, z: 0 })),
      });
      continue;
    }
    const { bw, h } = secaoEm((b.inicio + b.fim) / 2);
    const util = bw - 2 * (c + phiEstribo) - phi;
    const emCima = b.tipo === "negativa" || b.tipo === "porta-estribos";
    const z = emCima ? -(c + phiEstribo + phi / 2) : -h + c + phiEstribo + phi / 2;
    const sentido = emCima ? -1 : 1;
    const gancho = (g: number) => Math.min(g, h - 2 * (c + phiEstribo) - phi);
    if (b.tipo === "pele") {
      // metade em cada face, igualmente espaçadas na altura entre as camadas
      const porFace = Math.max(1, Math.ceil(b.quantidade / 2));
      const zs = espalhar(-h + c + phiEstribo, -(c + phiEstribo), porFace + 2).slice(1, -1);
      const copias = [-util / 2, util / 2].flatMap((y) => zs.map((zz) => ({ x: 0, y, z: zz })));
      pos.push({
        nome: b.nome,
        tipo: "pele",
        phi: b.phi,
        aco,
        comprimento: b.comprimento,
        forma: [
          { x: b.inicio, y: 0, z: 0 },
          { x: b.fim, y: 0, z: 0 },
        ],
        copias: copias.slice(0, b.quantidade),
      });
      continue;
    }
    const forma: P3[] = [
      ...(b.ganchoInicio > 0
        ? [{ x: b.inicio, y: 0, z: z + sentido * gancho(b.ganchoInicio) }]
        : []),
      { x: b.inicio, y: 0, z },
      { x: b.fim, y: 0, z },
      ...(b.ganchoFim > 0 ? [{ x: b.fim, y: 0, z: z + sentido * gancho(b.ganchoFim) }] : []),
    ];
    pos.push({
      nome: b.nome,
      tipo: b.tipo,
      phi: b.phi,
      aco,
      comprimento: b.comprimento,
      forma,
      copias: naLargura(b.quantidade, Math.max(util, 0)).map((y) => ({ x: 0, y, z: 0 })),
    });
  }
  return pos;
}

/** Anti-horário (área com sinal positiva). */
function antiHorario<T extends { x: number; y: number }>(pontos: readonly T[]): T[] {
  const area = pontos.reduce((a, p, k) => {
    const q = pontos[(k + 1) % pontos.length]!;
    return a + p.x * q.y - q.x * p.y;
  }, 0);
  return area < 0 ? [...pontos].reverse() : [...pontos];
}

/** Perfil da seção do pilar, m: retângulo b × h (b em x), círculo (com vazado) ou
 *  polígono centrado pela caixa dele (b e h são a caixa da seção, dominio/obra.ts). A
 *  `rotacao` do pilar não entra: quem posiciona a peça gira o sistema local. */
export function perfilPilar(p: Pick<Pilar, "b" | "h" | "secao">): PerfilSecao {
  const s = p.secao;
  if (s?.tipo === "circular") {
    const raio = s.d / 200;
    return s.dInterno > 0 && s.dInterno < s.d
      ? { tipo: "circulo", raio, parede: (s.d - s.dInterno) / 200 }
      : { tipo: "circulo", raio };
  }
  if (s?.tipo === "poligonal" && s.vertices.length >= 3) {
    const xs = s.vertices.map((v) => v.x);
    const ys = s.vertices.map((v) => v.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return {
      tipo: "poligono",
      pontos: antiHorario(s.vertices.map((v) => ({ x: (v.x - cx) / 100, y: (v.y - cy) / 100 }))),
    };
  }
  return { tipo: "retangulo", largura: p.b / 100, altura: p.h / 100 };
}

export interface EntradaArmaduraPilar {
  /** Longitudinais: total, bitola (mm) e barras por face, cantos incluídos (porFaceX nas
   *  faces de comprimento h, x = ±; porFaceY nas de comprimento b, y = ±), como
   *  calculo/tipos.ts BarrasPilar. */
  barras: { n: number; phi: number; porFaceX: number; porFaceY: number };
  /** Estribo: bitola, mm, e espaçamento, cm (0 = sem estribo). */
  estribo: { phi: number; espacamento: number };
  perfil: PerfilSecao;
  /** Altura do lance, m (piso a piso). */
  altura: number;
  /** Cobrimento, cm. */
  cobrimento: number;
  aco: string;
  acoEstribo: string;
  /** Trecho das longitudinais, m a partir da base do lance (o traspasse pode passar da
   *  altura). Ausente = de 0 à altura. */
  longitudinal?: { z0: number; z1: number };
  /** Estribos: região, m a partir da base do lance, e quantidade, igualmente espaçados.
   *  Ausente = de `cobrimento` para cima, um a cada espaçamento, até `altura − cobrimento`. */
  estribos?: { z0: number; z1: number; quantidade: number };
}

/** Barras do lance do pilar no sistema local dele: centro da seção em x = y = 0 (x na
 *  direção de b), base do lance em z = 0, z para cima. Longitudinais com a distribuição
 *  por face que o cálculo verificou (retangular) ou em círculo, a `cobrimento + φestribo
 *  + φ/2` das faces; estribos no contorno a `cobrimento + φestribo/2`. Seção poligonal e
 *  T: sem armadura. */
export function armaduraPilar(e: EntradaArmaduraPilar): PosicaoGeometria[] {
  const { barras, estribo, perfil, altura, cobrimento, aco, acoEstribo } = e;
  if (barras.n <= 0 || barras.phi <= 0 || perfil.tipo === "poligono" || perfil.tipo === "T")
    return [];
  const c = cobrimento / 100;
  const phi = barras.phi / 1000;
  const phiT = estribo.phi > 0 ? estribo.phi / 1000 : 0.005;
  const pos: PosicaoGeometria[] = [];
  let copias: P3[];
  let contornoEstribo: P3[];
  if (perfil.tipo === "circulo") {
    const rb = perfil.raio - c - phiT - phi / 2;
    const re = perfil.raio - c - phiT / 2;
    if (rb <= 0) return [];
    copias = Array.from({ length: barras.n }, (_, i) => {
      const a = (2 * Math.PI * i) / barras.n;
      return { x: rb * Math.cos(a), y: rb * Math.sin(a), z: 0 };
    });
    contornoEstribo = Array.from({ length: 24 }, (_, i) => {
      const a = (2 * Math.PI * i) / 24;
      return { x: re * Math.cos(a), y: re * Math.sin(a), z: 0 };
    });
  } else {
    const ax = perfil.largura / 2 - c - phiT - phi / 2;
    const ay = perfil.altura / 2 - c - phiT - phi / 2;
    if (ax <= 0 || ay <= 0) return [];
    const nx = Math.max(2, barras.porFaceX);
    const ny = Math.max(2, barras.porFaceY);
    const ys = espalhar(-ay, ay, nx);
    const xs = espalhar(-ax, ax, ny).slice(1, -1);
    copias = [
      ...ys.flatMap((y) => [
        { x: -ax, y, z: 0 },
        { x: ax, y, z: 0 },
      ]),
      ...xs.flatMap((x) => [
        { x, y: -ay, z: 0 },
        { x, y: ay, z: 0 },
      ]),
    ];
    const ex = perfil.largura / 2 - c - phiT / 2;
    const ey = perfil.altura / 2 - c - phiT / 2;
    contornoEstribo = [
      { x: -ex, y: -ey, z: 0 },
      { x: ex, y: -ey, z: 0 },
      { x: ex, y: ey, z: 0 },
      { x: -ex, y: ey, z: 0 },
    ];
  }
  const lg = e.longitudinal ?? { z0: 0, z1: altura };
  pos.push({
    nome: "Longitudinal",
    tipo: "longitudinal",
    phi: barras.phi,
    aco,
    comprimento: Math.round((lg.z1 - lg.z0) * 100),
    forma: [
      { x: 0, y: 0, z: lg.z0 },
      { x: 0, y: 0, z: lg.z1 },
    ],
    copias,
  });
  if (estribo.phi > 0 && estribo.espacamento > 0) {
    const s = estribo.espacamento / 100;
    const zs = e.estribos
      ? espalhar(e.estribos.z0, e.estribos.z1, e.estribos.quantidade)
      : Array.from(
          { length: Math.max(0, Math.floor((altura - 2 * c) / s) + 1) },
          (_, i) => c + i * s,
        );
    const forma = estriboAberto(contornoEstribo, 2 * phiT);
    const perimetro = forma
      .slice(1)
      .reduce((a, p, i) => a + Math.hypot(p.x - forma[i]!.x, p.y - forma[i]!.y), 0);
    pos.push({
      nome: "Estribo",
      tipo: "estribo",
      phi: estribo.phi,
      aco: acoEstribo,
      comprimento: Math.round(perimetro * 100),
      forma,
      copias: zs.map((z) => ({ x: 0, y: 0, z })),
    });
  }
  return pos;
}

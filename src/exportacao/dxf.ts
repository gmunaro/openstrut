// Escritor DXF ASCII R12 (AC1009) mínimo, sem dependências: camadas, LINE,
// POLYLINE (a polilinha do R12; LWPOLYLINE só existe a partir do R14) e TEXT.
// Cotas e hachuras são montadas com LINE + TEXT, sem DIMENSION nem HATCH, que
// mudam muito entre versões. R12 é o formato que LibreCAD, QCAD e AutoCAD leem
// sem reclamar. As coordenadas são gravadas como vêm (quem chama decide a
// unidade; a planta de formas usa cm) e o arquivo sai com fim de linha CRLF.
//
// Texto: o R12 é ANSI ($DWGCODEPAGE ANSI_1252); caracteres fora do ASCII saem
// como \U+XXXX, que AutoCAD, LibreCAD e QCAD convertem de volta.

export interface Camada {
  nome: string;
  /** Cor ACI (1 vermelho, 2 amarelo, 3 verde, 4 ciano, 5 azul, 6 magenta, 7 branco/preto, 8 cinza). */
  cor: number;
}

export type Alinhamento = "esquerda" | "centro" | "direita";

export type Entidade =
  | { tipo: "linha"; camada: string; x1: number; y1: number; x2: number; y2: number }
  | { tipo: "polilinha"; camada: string; pontos: { x: number; y: number }[]; fechada: boolean }
  | {
      tipo: "texto";
      camada: string;
      x: number;
      y: number;
      altura: number;
      texto: string;
      /** Graus, anti-horário. */
      rotacao: number;
      /** Horizontal; na vertical o texto fica centrado no ponto (x, y). */
      alinhamento: Alinhamento;
    };

export interface Extensao {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/** Número para o DXF: até 6 casas, sem "-0" nem notação exponencial para valores de desenho. */
export function numeroDxf(v: number) {
  const s = String(Number(v.toFixed(6)) + 0);
  return s.includes(".") ? s : `${s}.0`;
}

/** Texto para o DXF R12: uma linha, ASCII, com \U+XXXX para o resto. */
export function textoDxf(t: string) {
  let s = "";
  for (const c of t.replace(/[\r\n]+/g, " ")) {
    const cp = c.codePointAt(0) ?? 32;
    s += cp < 32 ? " " : cp < 127 ? c : `\\U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return s;
}

/** Pontos de uma entidade (o texto conta só o ponto de inserção). */
function pontos(e: Entidade): { x: number; y: number }[] {
  switch (e.tipo) {
    case "linha":
      return [
        { x: e.x1, y: e.y1 },
        { x: e.x2, y: e.y2 },
      ];
    case "polilinha":
      return e.pontos;
    case "texto":
      return [{ x: e.x, y: e.y }];
  }
}

/** Caixa que contém as entidades; undefined se não houver nenhuma. */
export function extensao(entidades: readonly Entidade[]): Extensao | undefined {
  const ps = entidades.flatMap(pontos);
  if (ps.length === 0) return undefined;
  return {
    xmin: Math.min(...ps.map((p) => p.x)),
    ymin: Math.min(...ps.map((p) => p.y)),
    xmax: Math.max(...ps.map((p) => p.x)),
    ymax: Math.max(...ps.map((p) => p.y)),
  };
}

/** A mesma entidade transladada de (dx, dy). */
export function deslocar(e: Entidade, dx: number, dy: number): Entidade {
  switch (e.tipo) {
    case "linha":
      return { ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy };
    case "polilinha":
      return { ...e, pontos: e.pontos.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "texto":
      return { ...e, x: e.x + dx, y: e.y + dy };
  }
}

/** Retângulo fechado (polilinha) de cantos (xmin, ymin)–(xmax, ymax). */
export const retangulo = (
  camada: string,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): Entidade => ({
  tipo: "polilinha",
  camada,
  fechada: true,
  pontos: [
    { x: xmin, y: ymin },
    { x: xmax, y: ymin },
    { x: xmax, y: ymax },
    { x: xmin, y: ymax },
  ],
});

/** Texto com rotação 0 e alinhamento à esquerda, salvo se dito. */
export const texto = (
  camada: string,
  x: number,
  y: number,
  altura: number,
  conteudo: string,
  opcoes: { rotacao?: number; alinhamento?: Alinhamento } = {},
): Entidade => ({
  tipo: "texto",
  camada,
  x,
  y,
  altura,
  texto: conteudo,
  rotacao: opcoes.rotacao ?? 0,
  alinhamento: opcoes.alinhamento ?? "esquerda",
});

/** Hachura de um retângulo por linhas a 45°, com `passo` de afastamento entre elas,
 *  recortadas no retângulo. As linhas são y = x + k. */
export function hachuraRetangulo(
  camada: string,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
  passo: number,
): Entidade[] {
  const linhas: Entidade[] = [];
  const dk = passo * Math.SQRT2; // afastamento perpendicular `passo` entre retas a 45°
  for (let k = ymin - xmax + dk; k < ymax - xmin - 1e-9; k += dk) {
    const xa = Math.max(xmin, ymin - k);
    const xb = Math.min(xmax, ymax - k);
    if (xb - xa > 1e-9)
      linhas.push({ tipo: "linha", camada, x1: xa, y1: xa + k, x2: xb, y2: xb + k });
  }
  return linhas;
}

export interface OpcoesCota {
  camada: string;
  /** "x": mede de `de` a `ate` em x, linha de cota em y = `em`; "y": mede em y, linha em x = `em`. */
  eixo: "x" | "y";
  de: number;
  ate: number;
  em: number;
  /** Coordenada (y para eixo "x", x para eixo "y") de onde partem as linhas de chamada. */
  origem: number;
  altura: number;
  /** Texto da cota; o padrão é o comprimento com até 1 casa decimal. */
  rotulo?: string;
}

/** Comprimento da cota: inteiro sem casas, senão com 1 casa (vírgula decimal). */
export const rotuloCota = (v: number) =>
  Number.isInteger(Number(v.toFixed(1))) ? v.toFixed(0) : v.toFixed(1).replace(".", ",");

/** Cota linear simples: linha de cota, linhas de chamada, traços oblíquos nas pontas
 *  e o valor centrado acima (eixo "x") ou à esquerda, girado 90° (eixo "y"). */
export function cota(o: OpcoesCota): Entidade[] {
  const { camada, de, ate, em, origem, altura } = o;
  const rotulo = o.rotulo ?? rotuloCota(Math.abs(ate - de));
  const t = altura / 2; // meio traço oblíquo
  const passa = altura / 2; // a chamada passa um pouco da linha de cota
  const sentido = Math.sign(em - origem) || 1;
  const fim = em + sentido * passa;
  // na direção da medida (u) e na perpendicular (v); converte para (x, y) conforme o eixo
  const p = (u: number, v: number) => (o.eixo === "x" ? { x: u, y: v } : { x: v, y: u });
  const linha = (u1: number, v1: number, u2: number, v2: number): Entidade => {
    const a = p(u1, v1);
    const b = p(u2, v2);
    return { tipo: "linha", camada, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };
  const meio = p((de + ate) / 2, em + altura * 0.6 * (o.eixo === "x" ? 1 : -1));
  return [
    linha(de, em, ate, em),
    linha(de, origem, de, fim),
    linha(ate, origem, ate, fim),
    linha(de - t, em - t, de + t, em + t),
    linha(ate - t, em - t, ate + t, em + t),
    o.eixo === "x"
      ? texto(camada, meio.x, meio.y, altura, rotulo, { alinhamento: "centro" })
      : texto(camada, meio.x, meio.y, altura, rotulo, { alinhamento: "centro", rotacao: 90 }),
  ];
}

const pares = (...ps: [number, string | number][]) =>
  ps.map(([c, v]) => `${String(c).padStart(3)}\r\n${v}\r\n`).join("");

const ponto = (x: number, y: number, base = 10) =>
  pares([base, numeroDxf(x)], [base + 10, numeroDxf(y)], [base + 20, "0.0"]);

const ALINHAMENTO_H: Record<Alinhamento, number> = { esquerda: 0, centro: 1, direita: 2 };

function entidadeDxf(e: Entidade): string {
  switch (e.tipo) {
    case "linha":
      return pares([0, "LINE"], [8, e.camada]) + ponto(e.x1, e.y1) + ponto(e.x2, e.y2, 11);
    case "polilinha":
      return (
        pares([0, "POLYLINE"], [8, e.camada], [66, 1]) +
        ponto(0, 0) +
        pares([70, e.fechada ? 1 : 0]) +
        e.pontos.map((q) => pares([0, "VERTEX"], [8, e.camada]) + ponto(q.x, q.y)).join("") +
        pares([0, "SEQEND"], [8, e.camada])
      );
    case "texto": {
      // com alinhamento ≠ esquerda/base, o R12 posiciona pelo ponto 11/21 (72 e 73)
      const h = ALINHAMENTO_H[e.alinhamento];
      const centrado = h !== 0;
      return (
        pares([0, "TEXT"], [8, e.camada]) +
        ponto(e.x, e.y) +
        pares([40, numeroDxf(e.altura)], [1, textoDxf(e.texto)], [50, numeroDxf(e.rotacao)]) +
        (centrado ? pares([72, h]) + ponto(e.x, e.y, 11) + pares([73, 2]) : "")
      );
    }
  }
}

/** Arquivo DXF R12 completo: HEADER, TABLES (LTYPE e LAYER), ENTITIES e EOF.
 *  `unidades` vai em $INSUNITS (5 = cm); leitores R12 ignoram a variável. */
export function escreverDxf(
  camadas: readonly Camada[],
  entidades: readonly Entidade[],
  unidades = 5,
): string {
  const ext = extensao(entidades) ?? { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  const header =
    pares([0, "SECTION"], [2, "HEADER"]) +
    pares([9, "$ACADVER"], [1, "AC1009"]) +
    pares([9, "$DWGCODEPAGE"], [3, "ANSI_1252"]) +
    pares([9, "$INSBASE"]) +
    ponto(0, 0) +
    pares([9, "$EXTMIN"]) +
    ponto(ext.xmin, ext.ymin) +
    pares([9, "$EXTMAX"]) +
    ponto(ext.xmax, ext.ymax) +
    pares([9, "$LIMMIN"], [10, numeroDxf(ext.xmin)], [20, numeroDxf(ext.ymin)]) +
    pares([9, "$LIMMAX"], [10, numeroDxf(ext.xmax)], [20, numeroDxf(ext.ymax)]) +
    pares([9, "$INSUNITS"], [70, unidades]) +
    pares([0, "ENDSEC"]);
  const ltype =
    pares([0, "TABLE"], [2, "LTYPE"], [70, 1]) +
    pares([0, "LTYPE"], [2, "CONTINUOUS"], [70, 0], [3, "Solid line"], [72, 65], [73, 0]) +
    pares([40, "0.0"], [0, "ENDTAB"]);
  const layer =
    pares([0, "TABLE"], [2, "LAYER"], [70, camadas.length]) +
    camadas
      .map((c) => pares([0, "LAYER"], [2, c.nome], [70, 0], [62, c.cor], [6, "CONTINUOUS"]))
      .join("") +
    pares([0, "ENDTAB"]);
  const tables = pares([0, "SECTION"], [2, "TABLES"]) + ltype + layer + pares([0, "ENDSEC"]);
  const entities =
    pares([0, "SECTION"], [2, "ENTITIES"]) +
    entidades.map(entidadeDxf).join("") +
    pares([0, "ENDSEC"]);
  return header + tables + entities + pares([0, "EOF"]);
}

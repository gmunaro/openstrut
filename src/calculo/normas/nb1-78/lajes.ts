// Lajes maciças retangulares pela NB-1/78 "em regime de ruptura", portado da
// V1 (LAJCALC.BM e as funções de laje de CALCCA.BM):
// - momentos por charneiras plásticas (Johansen), armadura isótropa ou ortótropa
//   (afinidade, μ = my/mx), vãos reduzidos pelos engastes com i = Mneg/Mpos;
// - reações pelo processo das áreas (45° entre bordos iguais, 60° a partir do
//   engastado), integrado numa malha 300 × 300;
// - flecha por faixas de Marcus/Grashof, seção bruta, Ec secante, com o fator
//   de fluência (1 + φ) sobre a parcela permanente;
// - armaduras por flexão simples com diagrama retangular (0,85 fcd em 0,8 x), x/d
//   limite pela classe do aço (A ou B), e aviso de cortante na laje sem estribos.
// A V1 trabalha em tf, tf/m² e tf/cm²; aqui tudo está em kN, m, cm e MPa. As
// fórmulas são homogêneas, então a conversão não muda a física.
import { BORDOS, type Bordo, type Vinculo } from "../../../dominio/obra";
import { escolheMalha } from "../../barras";
import { type ClasseAco, epsYd } from "../../pilares/flexaoComposta";
import type {
  Barra,
  Etapa,
  LajeArmadura,
  LajeEntrada,
  LajeEsforcos,
  MateriaisCalc,
} from "../../tipos";
import { GAMA_F } from "./materiais";

const V1 = "V1 LAJCALC.BM";
const V1_CA = "V1 CALCCA.BM";

// Parâmetros do SISTRUT.LAP padrão da V1 (build/SISTRUT.LAP).
/** i = Mneg/Mpos dos bordos engastados: o .LAP manda começar pelo máximo (2,00). */
export const COEF_ENGASTE = 2;
/** Fator (1 + φ) da flecha permanente. O .LAP padrão liga a deformação lenta
 *  (NB-1/78 4.2.3.1.b); φ = 2 é suposição da reconstrução V1 (LAJECALC.BAS). */
export const FATOR_FLUENCIA = 3;
/** Limites de flecha: vão/300 com carga total e vão/500 com a acidental. */
export const REL_FLECHA_TOTAL = 300;
export const REL_FLECHA_ACIDENTAL = 500;
/** Acréscimo ao cobrimento até o início da altura útil, cm (d = h − c − 0,5). */
export const ACRESCIMO_COBRIMENTO = 0.5;
/** Taxas mínimas de armadura sobre 100·h (0,15 % positiva, 0,10 % negativa). */
export const TAXA_MIN_POSITIVA = 0.0015;
export const TAXA_MIN_NEGATIVA = 0.001;
/** Armadura de distribuição das lajes armadas numa direção: ≥ 1/5 da principal e ≥ 0,9 cm²/m. */
export const DISTRIBUICAO_MIN = 0.9;
/** Espessura mínima do .LAP e máxima da busca de LcEspessura, cm. */
export const H_MIN = 6;
export const H_MAX_BUSCA = 60;
/** ψ4 de τwu1 = ψ4·√fck (fck em MPa) da laje sem estribos (V1 LcTauWu1#). */
export const PSI4_LAJE = 0.07;
/** Critério de escolha da malha (V1 LAJEPROC.BAS): φ ≥ 5 mm, 7 cm ≤ s ≤ 20 cm. */
export const MALHA = { phiMin: 5, sMin: 7, sMax: 20 } as const;

/** Classificação da V1 (LcTipo$): cruz, uma direção vencendo lx (ux) ou ly
 *  (uy), balanço vencendo lx (bx) ou ly (by). */
export type TipoLaje = "cruz" | "ux" | "uy" | "bx" | "by";

const ehHorizontal = (b: Bordo) => b === "inferior" || b === "superior";

/**
 * Tipo da laje pelos vínculos e pela relação dos vãos (V1 LcTipo$). `null`
 * para combinações que a V1 não trata: dois bordos livres, quatro livres ou
 * três livres sem engaste no quarto.
 */
export function tipoLaje(lx: number, ly: number, v: Record<Bordo, Vinculo>): TipoLaje | null {
  const livres = BORDOS.filter((b) => v[b] === "livre");
  if (livres.length === 0) return ly / lx > 2 ? "ux" : ly / lx < 0.5 ? "uy" : "cruz";
  // Um livre: vence o vão entre os dois bordos adjacentes a ele.
  if (livres.length === 1) return livres[0] === "esquerdo" || livres[0] === "direito" ? "uy" : "ux";
  if (livres.length === 3) {
    const apoio = BORDOS.find((b) => v[b] !== "livre");
    if (apoio !== undefined && v[apoio] === "engastado") return ehHorizontal(apoio) ? "by" : "bx";
  }
  return null;
}

/** Vão que governa flecha e espessura, m: o menor em cruz, o da direção armada
 *  numa direção e 2× o balanço (V1 LcVaoRef#). */
export function vaoReferencia(lx: number, ly: number, tipo: TipoLaje): number {
  switch (tipo) {
    case "ux":
      return lx;
    case "uy":
      return ly;
    case "bx":
      return 2 * lx;
    case "by":
      return 2 * ly;
    case "cruz":
      return Math.min(lx, ly);
  }
}

const zeros = (): Record<Bordo, number> => ({ esquerdo: 0, inferior: 0, direito: 0, superior: 0 });

/**
 * Momentos característicos, kN·m/m, para a carga `p` kN/m² (V1 LcMomentosOrto).
 * Vãos reduzidos: lxr = 2 lx / (√(1+i₁) + √(1+i₃)), lyr idem com i₂, i₄.
 * Cruz (Johansen): m = p a²/24 · (√(3 + (a/b)²) − a/b)², a = menor vão reduzido.
 * Com armadura ortótropa (μ = my/mx ≠ 1), pelo teorema da afinidade a laje equivale
 * à isótropa de momento mx com lyr dividido por √μ; my = μ·mx, negativos em y = i·my.
 * X = i·m. Uma direção: m = p l_r²/8. Balanço: X = p l²/2 (μ não entra).
 */
export function momentosCharneiras(
  lx: number,
  ly: number,
  v: Record<Bordo, Vinculo>,
  p: number,
  iE = COEF_ENGASTE,
  mu = 1,
) {
  const i = (b: Bordo) => (v[b] === "engastado" ? iE : 0);
  const lxr = (2 * lx) / (Math.sqrt(1 + i("esquerdo")) + Math.sqrt(1 + i("direito")));
  const lyr = (2 * ly) / (Math.sqrt(1 + i("inferior")) + Math.sqrt(1 + i("superior")));
  const tipo = tipoLaje(lx, ly, v);
  const negativos = zeros();
  let mx = 0;
  let my = 0;
  switch (tipo) {
    case "cruz": {
      const u = mu > 0 ? mu : 1;
      const lyAfim = lyr / Math.sqrt(u);
      const [a, b] = lxr < lyAfim ? [lxr, lyAfim] : [lyAfim, lxr];
      const m = ((p * a * a) / 24) * (Math.sqrt(3 + (a / b) ** 2) - a / b) ** 2;
      mx = m;
      my = u * m;
      for (const k of BORDOS) negativos[k] = i(k) * (ehHorizontal(k) ? my : mx);
      break;
    }
    case "ux":
      mx = (p * lxr * lxr) / 8;
      negativos.esquerdo = i("esquerdo") * mx;
      negativos.direito = i("direito") * mx;
      break;
    case "uy":
      my = (p * lyr * lyr) / 8;
      negativos.inferior = i("inferior") * my;
      negativos.superior = i("superior") * my;
      break;
    case "bx":
      negativos[v.esquerdo === "engastado" ? "esquerdo" : "direito"] = (p * lx * lx) / 2;
      break;
    case "by":
      negativos[v.inferior === "engastado" ? "inferior" : "superior"] = (p * ly * ly) / 2;
      break;
    case null:
      break;
  }
  return { tipo, lxr, lyr, mx, my, negativos };
}

/** Lado da malha das reações (V1 LcReacoes: NMALHA = 300). */
const MALHA_REACOES = 300;

/**
 * Reações nos 4 bordos, kN/m, para a carga `p` kN/m², pelo processo das áreas
 * (V1 LcReacoes): cada célula da malha vai para o bordo de menor
 * distância/peso (√3 engastado, 1 apoiado, 1e-9 livre), o que reproduz as
 * retas a 45° e 60°. Empate: vence o primeiro na ordem esquerdo, inferior,
 * direito, superior.
 */
export function reacoesAreas(lx: number, ly: number, v: Record<Bordo, Vinculo>, p: number) {
  const peso = (b: Bordo) => (v[b] === "engastado" ? Math.sqrt(3) : v[b] === "livre" ? 1e-9 : 1);
  const w = BORDOS.map(peso);
  const area = [0, 0, 0, 0];
  const dx = lx / MALHA_REACOES;
  const dy = ly / MALHA_REACOES;
  for (let ix = 1; ix <= MALHA_REACOES; ix++) {
    const xc = (ix - 0.5) * dx;
    for (let iy = 1; iy <= MALHA_REACOES; iy++) {
      const yc = (iy - 0.5) * dy;
      const d = [xc, yc, lx - xc, ly - yc];
      let kmin = 0;
      let melhor = d[0]! / w[0]!;
      for (let k = 1; k < 4; k++) {
        const r = d[k]! / w[k]!;
        if (r < melhor) {
          melhor = r;
          kmin = k;
        }
      }
      area[kmin]! += dx * dy;
    }
  }
  return {
    esquerdo: (p * area[0]!) / ly,
    inferior: (p * area[1]!) / lx,
    direito: (p * area[2]!) / ly,
    superior: (p * area[3]!) / lx,
  };
}

/** Coeficiente da flecha de uma faixa (base 384): 5 apoiada-apoiada,
 *  2 apoiada-engastada, 1 biengastada (V1 LcCoefFaixa#). */
const coefFaixa = (b1: Vinculo, b2: Vinculo) => {
  const n = (b1 === "engastado" ? 1 : 0) + (b2 === "engastado" ? 1 : 0);
  return n === 0 ? 5 : n === 1 ? 2 : 1;
};

/**
 * Flecha elástica imediata, cm, para a carga `p` kN/m², espessura `h` cm e
 * módulo `ecs` MPa, seção bruta (V1 LcFlecha#). Em cruz a carga se reparte
 * entre as faixas pela igualdade das flechas no centro (Marcus/Grashof):
 * kx = cy ly⁴ / (cx lx⁴ + cy ly⁴), f = cx kx p lx⁴ / (384 EI). `null` para
 * tipo não suportado.
 */
export function flechaElastica(
  lx: number,
  ly: number,
  v: Record<Bordo, Vinculo>,
  p: number,
  h: number,
  ecs: number,
): number | null {
  const ei = (ecs * 1000 * (h / 100) ** 3) / 12; // kN·m²/m
  const cx = coefFaixa(v.esquerdo, v.direito);
  const cy = coefFaixa(v.inferior, v.superior);
  let f: number;
  switch (tipoLaje(lx, ly, v)) {
    case "cruz": {
      const kx = (cy * ly ** 4) / (cx * lx ** 4 + cy * ly ** 4);
      f = (cx * kx * p * lx ** 4) / (384 * ei);
      break;
    }
    case "ux":
      f = (cx * p * lx ** 4) / (384 * ei);
      break;
    case "uy":
      f = (cy * p * ly ** 4) / (384 * ei);
      break;
    case "bx":
      f = (p * lx ** 4) / (8 * ei);
      break;
    case "by":
      f = (p * ly ** 4) / (8 * ei);
      break;
    case null:
      return null;
  }
  return f * 100;
}

export interface EspessuraEntrada {
  lx: number;
  ly: number;
  vinculos: Record<Bordo, Vinculo>;
  /** Permanente SEM o peso próprio e acidental, kN/m². */
  gAdicional: number;
  q: number;
}

/**
 * Menor espessura inteira, cm, a partir de `hMin`, que atende flecha total ≤
 * vão/300 e flecha acidental ≤ vão/500, com peso próprio h·γc (V1
 * LcEspessura#). A parcela permanente da flecha total é multiplicada por
 * `fluencia`. `null` se nem 60 cm atende ou o tipo não é suportado.
 */
export function lajeEspessuraNb178(
  e: EspessuraEntrada,
  mat: MateriaisCalc,
  pesoConcreto: number,
  fluencia = FATOR_FLUENCIA,
  hMin = H_MIN,
): number | null {
  const tipo = tipoLaje(e.lx, e.ly, e.vinculos);
  if (tipo === null) return null;
  const vao = vaoReferencia(e.lx, e.ly, tipo) * 100;
  const flecha = (p: number, h: number) =>
    flechaElastica(e.lx, e.ly, e.vinculos, p, h, mat.ecs) ?? Infinity;
  for (let h = Math.floor(hMin + 0.999); h <= H_MAX_BUSCA; h++) {
    const fa = flecha(e.q, h);
    const ft = flecha((h / 100) * pesoConcreto + e.gAdicional, h) * fluencia + fa;
    if (ft <= vao / REL_FLECHA_TOTAL && fa <= vao / REL_FLECHA_ACIDENTAL) return h;
  }
  return null;
}

const NOME_TIPO: Record<TipoLaje, string> = {
  cruz: "armada em cruz",
  ux: "armada numa direção (vence lx)",
  uy: "armada numa direção (vence ly)",
  bx: "balanço (vence lx)",
  by: "balanço (vence ly)",
};

/**
 * Esforços característicos de uma laje pela NB-1/78 (V1 LcCalculaTodas, parte
 * de cada laje antes da compatibilização): momentos por charneiras, reações
 * pelo processo das áreas e flecha com fluência. `e.g` já inclui o peso próprio.
 * `mu` = relação de ortotropia my/mx das lajes em cruz (1 = isótropa; V1 LcMu#).
 */
export function lajeEsforcosNb178(e: LajeEntrada, mat: MateriaisCalc, mu = 1): LajeEsforcos {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const p = e.g + e.q;
  const mom = momentosCharneiras(e.lx, e.ly, e.vinculos, p, COEF_ENGASTE, mu);
  if (mom.tipo === null) {
    avisos.push(
      `${e.nome}: configuração de bordos não suportada (dois livres, ou balanço sem engaste).`,
    );
    return {
      mx: 0,
      my: 0,
      negativos: zeros(),
      reacoes: zeros(),
      flecha: 0,
      flechaLimite: 0,
      avisos,
      memoria: [
        { descricao: "Configuração de bordos não suportada pela V1", ref: `${V1} (LcTipo$)` },
      ],
    };
  }
  const tipo = mom.tipo;
  memoria.push(
    { descricao: `Tipo: ${NOME_TIPO[tipo]}`, ref: `${V1} (LcTipo$)` },
    {
      descricao: "Carga total p = g + q",
      formula: `${fmt(e.g)} + ${fmt(e.q)}`,
      valor: p,
      unidade: "kN/m²",
    },
    {
      descricao: "Vão reduzido lxr",
      formula: "2 lx / (√(1+i_esq) + √(1+i_dir)), i = 2 no engaste",
      valor: mom.lxr,
      unidade: "m",
      ref: `${V1} (LcMomentos)`,
    },
    {
      descricao: "Vão reduzido lyr",
      formula: "2 ly / (√(1+i_inf) + √(1+i_sup))",
      valor: mom.lyr,
      unidade: "m",
      ref: `${V1} (LcMomentos)`,
    },
  );
  const formulaPositivo =
    tipo === "cruz"
      ? mu === 1
        ? "Johansen: p a²/24 · (√(3 + (a/b)²) − a/b)², a = menor vão reduzido"
        : `Johansen ortótropa (μ = ${fmt(mu)}): lyr/√μ na laje afim; my = μ·mx`
      : tipo === "ux"
        ? "p lxr²/8"
        : "p lyr²/8";
  if (tipo !== "bx" && tipo !== "by") {
    memoria.push(
      {
        descricao: "Momento positivo mx",
        formula: formulaPositivo,
        valor: mom.mx,
        unidade: "kN·m/m",
        ref: `${V1} (LcMomentos)`,
      },
      {
        descricao: "Momento positivo my",
        formula: formulaPositivo,
        valor: mom.my,
        unidade: "kN·m/m",
        ref: `${V1} (LcMomentos)`,
      },
    );
  }
  for (const b of BORDOS) {
    if (mom.negativos[b] > 0) {
      memoria.push({
        descricao: `Momento negativo no bordo ${b}`,
        formula: tipo === "bx" || tipo === "by" ? "p l²/2" : "X = i · m, i = 2",
        valor: mom.negativos[b],
        unidade: "kN·m/m",
        ref: `${V1} (LcMomentos)`,
      });
    }
  }
  const reacoes = reacoesAreas(e.lx, e.ly, e.vinculos, p);
  for (const b of BORDOS) {
    memoria.push({
      descricao: `Reação no bordo ${b}`,
      formula: "processo das áreas (45°/60°): p · área / comprimento do bordo",
      valor: reacoes[b],
      unidade: "kN/m",
      ref: `NB-1/78; ${V1} (LcReacoes)`,
    });
  }
  // Tipo suportado: flechaElastica não devolve null aqui.
  const fg = flechaElastica(e.lx, e.ly, e.vinculos, e.g, e.h, mat.ecs) ?? 0;
  const fq = flechaElastica(e.lx, e.ly, e.vinculos, e.q, e.h, mat.ecs) ?? 0;
  const flecha = fg * FATOR_FLUENCIA + fq;
  const vao = vaoReferencia(e.lx, e.ly, tipo) * 100;
  const flechaLimite = vao / REL_FLECHA_TOTAL;
  const limiteAcidental = vao / REL_FLECHA_ACIDENTAL;
  memoria.push(
    {
      descricao: "Módulo de elasticidade secante Ec",
      formula: "0,9 · 6600 √(fck + 3,5)",
      valor: mat.ecs,
      unidade: "MPa",
      ref: "NB-1/78 8.2.5",
    },
    {
      descricao: "Flecha imediata da carga permanente",
      formula: "Marcus/Grashof, seção bruta",
      valor: fg,
      unidade: "cm",
      ref: `${V1} (LcFlecha#)`,
    },
    {
      descricao: "Flecha imediata da carga acidental",
      valor: fq,
      unidade: "cm",
      ref: `${V1} (LcFlecha#)`,
    },
    {
      descricao: "Flecha total com deformação lenta",
      formula: `f_g · ${FATOR_FLUENCIA} + f_q`,
      valor: flecha,
      unidade: "cm",
      ref: "NB-1/78 4.2.3.1.b; fator (1+φ) = 3 suposto pela V1",
    },
    {
      descricao: "Flecha limite (carga total)",
      formula: `l / ${REL_FLECHA_TOTAL}`,
      valor: flechaLimite,
      unidade: "cm",
      ref: "V1 SISTRUT.LAP",
    },
  );
  if (flecha > flechaLimite) {
    avisos.push(
      `${e.nome}: flecha total ${fmt(flecha)} cm acima do limite ${fmt(flechaLimite)} cm (l/${REL_FLECHA_TOTAL}).`,
    );
  }
  if (fq > limiteAcidental) {
    avisos.push(
      `${e.nome}: flecha da carga acidental ${fmt(fq)} cm acima do limite ${fmt(limiteAcidental)} cm (l/${REL_FLECHA_ACIDENTAL}).`,
    );
  }
  return {
    mx: mom.mx,
    my: mom.my,
    negativos: mom.negativos,
    reacoes,
    flecha,
    flechaLimite,
    avisos,
    memoria,
  };
}

/** Negativo compatibilizado entre duas lajes contínuas: max((Xa + Xb)/2; 0,8 max(Xa, Xb))
 *  (V1 LcCompatibiliza#). */
export function compatibilizaNegativoNb178(xa: number, xb: number): number {
  return Math.max((xa + xb) / 2, 0.8 * Math.max(xa, xb));
}

// ---- flexão simples (V1 CALCCA.BM) ---------------------------------------------
// Entradas em kN·cm, cm e MPa; internamente as tensões vão para kN/cm² (MPa/10).

/** x/d limite entre os domínios 3 e 4: 0,0035 / (0,0035 + εyd), εyd = fyd/Es na
 *  classe A e fyd/Es + 2‰ na classe B (V1 CcaXdLim#). */
export const xdLimite = (fyd: number, es: number, classe: ClasseAco = "A") =>
  0.0035 / (0.0035 + epsYd({ fyd, es, classe }));

/**
 * Linha neutra, cm, da seção b × d sob `md` kN·cm (V1 CcaLinhaNeutra#):
 * r = Md / (0,425 b d² fcd), x = 1,25 d (1 − √(1 − r)). `null` se r ≥ 1 ou
 * x/d passa do limite (seria preciso armadura dupla ou mais altura).
 */
export function linhaNeutra(
  md: number,
  b: number,
  d: number,
  fcd: number,
  fyd: number,
  es: number,
  classe: ClasseAco = "A",
): number | null {
  if (md <= 0) return 0;
  const r = md / (0.425 * b * d * d * (fcd / 10));
  if (r >= 1) return null;
  const x = 1.25 * d * (1 - Math.sqrt(1 - r));
  return x / d > xdLimite(fyd, es, classe) ? null : x;
}

/** Armadura de tração, cm², na flexão simples: As = Md / (fyd (d − 0,4 x)) (V1 CcaAsFlexao#). */
export function asFlexao(
  md: number,
  b: number,
  d: number,
  fcd: number,
  fyd: number,
  es: number,
  classe: ClasseAco = "A",
): number | null {
  // dentro do x/d limite o aço escoa nas duas classes: σs = fyd
  const x = linhaNeutra(md, b, d, fcd, fyd, es, classe);
  if (x === null) return null;
  if (x === 0) return 0;
  return md / ((fyd / 10) * (d - 0.4 * x));
}

/** Momento resistente máximo sem armadura de compressão, kN·cm (V1 CcaMdLim#). */
export function mdLimite(
  b: number,
  d: number,
  fcd: number,
  fyd: number,
  es: number,
  classe: ClasseAco = "A",
): number {
  const x = xdLimite(fyd, es, classe) * d;
  return 0.85 * (fcd / 10) * b * 0.8 * x * (d - 0.4 * x);
}

/**
 * Armadura por metro, cm²/m, para o momento característico `m` kN·m/m na laje
 * de espessura `h` e altura útil `d` (cm), com mínimo taxa·100·h (V1 LcAs#).
 * Md = γf · m · 100 kN·cm/m. Momento nulo dá 0 (sem mínimo, como na V1).
 * `NaN` se a seção não resiste.
 */
function asLaje(
  m: number,
  h: number,
  d: number,
  mat: MateriaisCalc,
  taxa: number,
  classe: ClasseAco,
): number {
  if (m <= 0) return 0;
  const a = asFlexao(GAMA_F * m * 100, 100, d, mat.fcd, mat.fyd, mat.es, classe);
  if (a === null) return Number.NaN;
  return Math.max(a, taxa * 100 * h);
}

const SEM_BARRA: Barra = { phi: 0, espacamento: 0 };

/**
 * Armaduras da laje a partir dos esforços já compatibilizados (V1
 * LcCalculaTodas, parte final, e LAJEPROC/CcaEscolheMalha para as barras).
 * d = h − cobrimento − 0,5 cm. Nas lajes armadas numa direção a secundária é
 * a de distribuição: max(principal/5; 0,9 cm²/m). Seção insuficiente dá `NaN`
 * na posição e aviso.
 */
export function lajeArmaduraNb178(
  e: LajeEntrada,
  esf: LajeEsforcos,
  mat: MateriaisCalc,
  cobrimento: number,
  classe: ClasseAco = "A",
): LajeArmadura {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  // [VERIFICAR] d único nas duas direções e nos negativos, como a V1 (LcCalculaTodas):
  // a camada de cima da malha positiva tem d menor em ~φ. Mantido para a paridade
  // com a V1; a 6118 usa duas camadas (nbr6118-2023/lajes.ts, alturasUteisPositivas).
  const d = e.h - cobrimento - ACRESCIMO_COBRIMENTO;
  memoria.push({
    descricao: "Altura útil d (a mesma nas duas direções, como a V1)",
    formula: `h − c − ${ACRESCIMO_COBRIMENTO} = ${fmt(e.h)} − ${fmt(cobrimento)} − ${ACRESCIMO_COBRIMENTO}`,
    valor: d,
    unidade: "cm",
    ref: `${V1} (LcCalculaTodas)`,
  });
  const tipo = tipoLaje(e.lx, e.ly, e.vinculos);
  let asx = asLaje(esf.mx, e.h, d, mat, TAXA_MIN_POSITIVA, classe);
  let asy = asLaje(esf.my, e.h, d, mat, TAXA_MIN_POSITIVA, classe);
  const formulaAs = `As = Md / (fyd (d − 0,4x)), Md = ${GAMA_F} m; mínimo taxa · 100 h`;
  memoria.push(
    {
      descricao: "Armadura positiva asx",
      formula: formulaAs,
      valor: asx,
      unidade: "cm²/m",
      ref: `${V1_CA} (CcaAsFlexao#); ${V1} (LcAs#)`,
    },
    {
      descricao: "Armadura positiva asy",
      formula: formulaAs,
      valor: asy,
      unidade: "cm²/m",
      ref: `${V1_CA} (CcaAsFlexao#); ${V1} (LcAs#)`,
    },
  );
  if (tipo === "ux" && asx >= 0) {
    asy = Math.max(asx / 5, DISTRIBUICAO_MIN);
    memoria.push({
      descricao: "Armadura de distribuição asy",
      formula: "max(asx/5; 0,9)",
      valor: asy,
      unidade: "cm²/m",
      ref: `NB-1/78; ${V1} (LcCalculaTodas)`,
    });
  }
  if (tipo === "uy" && asy >= 0) {
    asx = Math.max(asy / 5, DISTRIBUICAO_MIN);
    memoria.push({
      descricao: "Armadura de distribuição asx",
      formula: "max(asy/5; 0,9)",
      valor: asx,
      unidade: "cm²/m",
      ref: `NB-1/78; ${V1} (LcCalculaTodas)`,
    });
  }
  const asNegativos = zeros();
  for (const b of BORDOS) {
    asNegativos[b] = asLaje(esf.negativos[b], e.h, d, mat, TAXA_MIN_NEGATIVA, classe);
    if (esf.negativos[b] > 0) {
      memoria.push({
        descricao: `Armadura negativa no bordo ${b}`,
        formula: formulaAs,
        valor: asNegativos[b],
        unidade: "cm²/m",
        ref: `${V1} (LcAs#)`,
      });
    }
  }
  if (mat.aco === "CA-25")
    // [VERIFICAR] pendencias.md item 7 só traz a taxa de flexão de vigas (0,25 % para
    // CA-25, fonte secundária); para lajes não há fonte. Mantidas as taxas da V1.
    avisos.push(
      `${e.nome}: taxas mínimas da V1 (0,15 % e 0,10 %) com CA-25 não conferidas na NB-1/78; confira As,mín.`,
    );
  if ([asx, asy, ...BORDOS.map((b) => asNegativos[b])].some(Number.isNaN)) {
    avisos.push(
      `${e.nome}: seção insuficiente, aumente a espessura${classe === "B" ? " (x/d limite do aço classe B)" : ""}.`,
    );
  }

  // Cortante na laje sem estribos (V1 LcTauWd#, LcTauWu1#): só aviso, as armaduras
  // não mudam. τwd = γf·r/(100 d) com a maior reação; τwu1 = ψ4·√fck. A V1 marca ψ4 =
  // 0,07 como RECONSTRUCAO (o menor ψ1 das vigas; item das lajes não confirmado).
  const rMax = Math.max(...BORDOS.map((b) => esf.reacoes[b]));
  const tauWd = ((GAMA_F * rMax) / (100 * d)) * 10;
  const tauWu1 = PSI4_LAJE * Math.sqrt(mat.fck);
  memoria.push(
    {
      descricao: "Tensão de cisalhamento de cálculo (maior reação)",
      formula: `τwd = ${GAMA_F} r / (100 d)`,
      valor: tauWd,
      unidade: "MPa",
      ref: `${V1} (LcTauWd#)`,
    },
    {
      descricao: "Limite da laje sem armadura transversal",
      formula: `τwu1 = ${PSI4_LAJE} √fck [RECONSTRUCAO V1]`,
      valor: tauWu1,
      unidade: "MPa",
      ref: `${V1} (LcTauWu1#)`,
    },
  );
  if (tauWd > tauWu1)
    avisos.push(
      `${e.nome}: cortante τwd = ${tauWd.toFixed(3)} MPa > τwu1 = ${tauWu1.toFixed(3)} MPa, laje sem estribos; aumente a espessura.`,
    );

  const malha = (as: number, posicao: string): Barra | null => {
    if (!(as > 0)) return null;
    const barra = escolheMalha(as, MALHA.phiMin, MALHA.sMin, MALHA.sMax);
    if (barra === null)
      avisos.push(
        `${e.nome}: nenhuma malha de φ ≥ ${MALHA.phiMin} mm com s ≥ ${MALHA.sMin} cm atende ${posicao}.`,
      );
    return barra;
  };
  const barrasX = malha(asx, "asx") ?? SEM_BARRA;
  const barrasY = malha(asy, "asy") ?? SEM_BARRA;
  const barrasNegativos: Partial<Record<Bordo, Barra>> = {};
  for (const b of BORDOS) {
    const barra = malha(asNegativos[b], `o negativo do bordo ${b}`);
    if (barra !== null) barrasNegativos[b] = barra;
  }
  return { asx, asy, asNegativos, barrasX, barrasY, barrasNegativos, avisos, memoria };
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

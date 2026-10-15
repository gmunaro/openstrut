// Seção do pilar no formato do original e integração das tensões no estado
// último: geometria girada pelo ângulo da linha neutra, bloco 0,8x do concreto,
// lei do aço e soma das barras. Unidades: cm, t, t/cm², t·cm.
//
// Fonte: PILAR.BAS S_2552e (4122-4372), S_206fb (3360-3484), S_2012d (3315-3355),
// S_27521 (4389-4430); PILAREDI.BAS S_2267a (1674-1830), S_203ed (1477-1604),
// S_20146 (1452-1476), S_25d0d (2137-2182), que são cópias com outros nomes.
// Livro: livros_viga_pilar.md 2.2, 2.7 (U48-014, U49-018, U51-073).
//
// Modo original: cada atribuição a variável `!` passa por `sng` (as expressões
// rodam em float64 no lugar da pilha x87); as constantes literais são SINGLE.
import { atribuicao, sng } from "../base/f32";
import type { ModoSistrut, Ponto, SecaoPilar } from "../base/tipos";

/** Arredondamento de atribuição do modo (sng no original). */
export type Arredonda = (x: number) => number;

/** Constantes literais do código, em SINGLE no original e decimais no corrigido. */
export function constantes(modo: ModoSistrut) {
  const c = modo === "original" ? sng : (x: number) => x;
  return {
    /** π = 4·ATN(1) gravado em SINGLE (V_0e5a, PILAR.BAS:588). */
    pi: modo === "original" ? sng(4 * Math.atan(1)) : Math.PI,
    c08: c(0.8),
    c085: c(0.85),
    c07: c(0.7),
    c09: c(0.9),
    c01: c(0.1),
    c002: c(0.002),
    c0035: c(0.0035),
    c0135: c(0.0135),
    c001: c(0.01),
    c0005: c(0.005),
    c00001: c(0.0001),
    /** ξ entre os domínios 2 e 3 = 7/27 (0,259259). */
    xi23: c(7 / 27),
    /** 3/7 do domínio 6. */
    c37: c(3 / 7),
    inv2100: c(1 / 2100),
    c14: c(1.4),
    c103: c(1.03),
    c105: c(1.05),
    c11: c(1.1),
    c12: c(1.2),
    c16: c(1.6),
    c0976: c(0.976),
    c02: c(0.2),
    c03: c(0.3),
    c04: c(0.4),
    c06: c(0.6),
    /** e = 2,71828198 (literal SINGLE da fluência, PILAR.BAS:4820). */
    e: c(Math.E),
  };
}
export type Constantes = ReturnType<typeof constantes>;

/** Materiais no formato do original: t/cm² e coeficientes de segurança. */
export interface MateriaisPilar {
  fck: number;
  fyk: number;
  /** "A" bilinear; qualquer outro texto é o aço B (PILAR.BAS:4406, U48-015). */
  aco: "A" | "B";
  /** Csf, Csc, Csa. */
  csf: number;
  csc: number;
  csa: number;
  /** Coeficiente de unidade de tensão (V_0dec, 1 no padrão). */
  coefTensao: number;
}

/** Barra com a área já resolvida pela tabela de bitolas. */
export interface BarraCalculo {
  x: number;
  y: number;
  area: number;
}

/** Seção como o original guarda: tipo 1 retangular e 3 poligonal são polígonos
 *  (vértices no sentido horário, o primeiro repetido no fim); 2 é circular. */
export type SecaoCalculo =
  | { tipo: 1 | 3; vertices: Ponto[]; barras: BarraCalculo[] }
  | { tipo: 2; diametro: number; diametroInterno: number; barras: BarraCalculo[] };

/** Contexto numérico de uma verificação: modo, arredondamento e materiais. */
export interface Contexto {
  modo: ModoSistrut;
  s: Arredonda;
  k: Constantes;
  mat: MateriaisPilar;
  /** Conta as integrações; o original não tem teto (D-2, U49-009). */
  integracoes: number;
}

export function criaContexto(modo: ModoSistrut, mat: MateriaisPilar): Contexto {
  return { modo, s: atribuicao(modo), k: constantes(modo), mat, integracoes: 0 };
}

/** Seção posicionada num ângulo e o estado de deformação em avaliação. Os nomes
 *  ao lado são as variáveis do PILAR.BAS. */
export interface Estado {
  secao: SecaoCalculo;
  /** Ângulo de giro, graus (V_19f4). */
  theta: number;
  /** Vértices girados e transladados para o mínimo (A_17a2), com o fecho. */
  vertices: Ponto[];
  /** Barras giradas (A_17d0). */
  barras: BarraCalculo[];
  /** Altura na direção girada (V_1a54) e altura útil (V_19fc), cm. */
  altura: number;
  d: number;
  /** Centróide (V_19c4 = ȳ, V_19c8 = x̄) e área (V_19cc). */
  yc: number;
  xc: number;
  area: number;
  /** 0,85 ou 0,80 (V_19dc). */
  rusch: number;
  /** ξ = x/d (V_1a3c) e curvatura 1/r em 1/cm (V_1a38). */
  xi: number;
  kappa: number;
  /** Deformação do concreto no topo (V_1a30). */
  epsC: number;
  /** Concreto: normal e momentos em torno de x' e y' (A_18b6, A_1912). */
  nc: number;
  mcx: number;
  mcy: number;
  /** Aço: normal, momentos (A_18e4, A_1940) e maior deformação, tração > 0 (V_1a00). */
  ns: number;
  msx: number;
  msy: number;
  epsAcoMax: number;
}

/** Cria o estado de uma seção (ângulo 0, sem posicionar). */
export function novoEstado(secao: SecaoCalculo): Estado {
  return {
    secao,
    theta: 0,
    vertices: [],
    barras: [],
    altura: 0,
    d: 0,
    yc: 0,
    xc: 0,
    area: 0,
    rusch: 0,
    xi: 0,
    kappa: 0,
    epsC: 0,
    nc: 0,
    mcx: 0,
    mcy: 0,
    ns: 0,
    msx: 0,
    msy: 0,
    epsAcoMax: 0,
  };
}

/** Gira a seção pelo ângulo θ (graus) e a translada para o mínimo (0, 0): altura,
 *  d, centróide, área e fator de Rüsch (PILAR.BAS:4122-4372, S_2552e;
 *  PILAREDI.BAS:1674-1830, S_2267a com barras). Área pelos vértices não girados,
 *  com sinal: positiva no sentido horário (D-6 no anti-horário). */
export function posiciona(ctx: Contexto, est: Estado, theta: number) {
  const { s, k } = ctx;
  const sec = est.secao;
  est.theta = theta;
  const ang = (k.pi * theta) / 180;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  if (sec.tipo === 2) {
    const D = sec.diametro;
    const bx = s((cos * D) / 2 + ((sin * D) / 2 - D / 2));
    const by = s((cos * D) / 2 - (sin * D) / 2 - D / 2);
    let minY = D;
    est.barras = sec.barras.map((b) => {
      const x = s(s(cos * b.x + sin * b.y) - bx);
      const y = s(s(cos * b.y - sin * b.x) - by);
      minY = y < minY ? y : minY;
      return { x, y, area: b.area };
    });
    est.altura = D;
    est.d = s(D - minY);
    est.area = s(((D ** 2 - sec.diametroInterno ** 2) * k.pi) / 4);
    est.yc = s(D / 2);
    est.xc = s(D / 2);
    est.rusch = k.c08;
    est.vertices = [];
    return;
  }
  const v0 = sec.vertices;
  const n = v0.length - 1;
  const rot = v0.map((p) => ({ x: s(cos * p.x + sin * p.y), y: s(cos * p.y - sin * p.x) }));
  let minX = rot[0]!.x;
  let minY = rot[0]!.y;
  for (let i = 1; i < n; i++) {
    minX = minX < rot[i]!.x ? minX : rot[i]!.x;
    minY = minY < rot[i]!.y ? minY : rot[i]!.y;
  }
  let altura = 0;
  est.vertices = rot.map((p) => {
    const q = { x: s(p.x - minX), y: s(p.y - minY) };
    altura = altura > q.y ? altura : q.y;
    return q;
  });
  est.altura = altura;
  let menorBarra = altura;
  est.barras = sec.barras.map((b) => {
    const x = s(s(cos * b.x + sin * b.y) - minX);
    const y = s(s(cos * b.y - sin * b.x) - minY);
    menorBarra = menorBarra < y ? menorBarra : y;
    return { x, y, area: b.area };
  });
  est.d = s(altura - menorBarra);
  let sy = 0;
  let sx = 0;
  let a = 0;
  const v = est.vertices;
  for (let i = 0; i < n; i++) {
    const p = v[i]!;
    const q = v[i + 1]!;
    const cruz = p.x * q.y - q.x * p.y;
    sy = s(((p.y + q.y) * cruz) / 6 + sy);
    sx = s(((p.x + q.x) * cruz) / 6 + sx);
    a = s(((v0[i]!.x + v0[i + 1]!.x) * (v0[i]!.y - v0[i + 1]!.y)) / 2 + a);
  }
  est.area = a;
  est.yc = s(Math.abs(sy / a));
  est.xc = s(Math.abs(sx / a));
  est.rusch = k.c085;
  for (let i = 0; i < n; i++) {
    const p = v[i]!;
    const q = v[i + 1]!;
    if (Math.abs(p.y - q.y) > k.c01 && p.x < q.x - k.c01) {
      est.rusch = k.c08;
      break;
    }
  }
}

/** Inércia em torno do eixo horizontal do centróide da seção girada de θ, cm⁴, e a
 *  distância do centróide à fibra do topo (PILAREDI.BAS:1795-1808, S_2267a com
 *  V_11ae% = 1; PILAR.BAS:5604-5622). Circular: π(D⁴ − Di⁴)/64. */
export function inerciaGirada(ctx: Contexto, est: Estado, theta: number) {
  const { s, k } = ctx;
  const sec = est.secao;
  posiciona(ctx, est, theta);
  if (sec.tipo === 2) {
    const j = s(((sec.diametro ** 4 - sec.diametroInterno ** 4) * k.pi) / 64);
    return { j, topo: s(sec.diametro / 2) };
  }
  const v = est.vertices;
  let j = 0;
  for (let i = 0; i < v.length - 1; i++) {
    const p = v[i]!;
    const q = v[i + 1]!;
    j = s((p.x - q.x) * (p.y ** 3 / 3 + (q.y - p.y) ** 3 / 12) + j);
    j = s(
      ((p.x - q.x) * (q.y - p.y) * (((q.y - p.y) / 3 + p.y) ** 2 - ((q.y - p.y) / 3) ** 2)) / 2 + j,
    );
  }
  return { j: s(Math.abs(j) - est.yc ** 2 * est.area), topo: s(est.altura - est.yc) };
}

/** Momentos de inércia em torno dos eixos x e y do centróide, cm⁴ (PILAR.BAS:5601-5629,
 *  GOSUB L_37269; PILAREDI.BAS:5427-5466): a seção a 0° e a 90°. Devolve também a
 *  área com sinal. */
export function inercias(ctx: Contexto, est: Estado) {
  const jx = inerciaGirada(ctx, est, 0).j;
  const area = est.area;
  const jy = inerciaGirada(ctx, est, 90).j;
  return { jx, jy, area };
}

/** Normal e momentos do concreto comprimido para (ξ, κ) do estado: zona acima de
 *  altura − 0,8x recortada do polígono (ou segmento de coroa circular), tensão
 *  uniforme igual à da parábola na fibra do topo, ÷ Csc e ÷ Csf
 *  (PILAR.BAS:3360-3484, S_206fb; livros_viga_pilar.md 2.7). */
export function integraConcreto(ctx: Contexto, est: Estado) {
  const { s, k, mat } = ctx;
  const xi = est.xi;
  est.epsC = xi > 10 ? k.c002 : s(est.d * xi * est.kappa);
  const corte = est.altura - k.c08 * xi * est.d;
  let area = 0;
  let ay = 0;
  let ax = 0;
  const sec = est.secao;
  if (sec.tipo !== 2) {
    const v = est.vertices;
    const zona = recortaPoligono(s, v, corte);
    for (let i = 0; i < zona.length - 1; i++) {
      const p = zona[i]!;
      const q = zona[i + 1]!;
      const cruz = p.x * q.y - q.x * p.y;
      ay = s(((p.y + q.y) * cruz) / 6 + ay);
      ax = s(((p.x + q.x) * cruz) / 6 + ax);
      area = s(((p.x + q.x) * (p.y - q.y)) / 2 + area);
    }
    ay = s(Math.abs(ay / area));
    ax = s(Math.abs(ax / area));
  } else {
    const seg = segmentoCircular(ctx, sec.diametro, sec.diametroInterno, xi * est.d * k.c08);
    area = seg.area;
    ay = seg.yc;
    ax = s(sec.diametro / 2);
  }
  const sigma =
    est.epsC >= k.c002
      ? s((mat.coefTensao * mat.fck) / mat.csc)
      : s(((1 - (1 - est.epsC / k.c002) ** 2) * mat.coefTensao * mat.fck) / mat.csc);
  est.nc = s((area * est.rusch * sigma) / mat.csf);
  est.mcx = s((ay - est.yc) * est.nc);
  est.mcy = s((ax - est.xc) * est.nc);
}

/** Parte do polígono acima da reta y = corte, na ordem do original (A_17fe,
 *  PILAR.BAS:3365-3440); o primeiro ponto repetido no fim. */
function recortaPoligono(s: Arredonda, v: readonly Ponto[], corte: number) {
  const z: Ponto[] = [];
  const cortaEm = (a: Ponto, b: Ponto) => ({
    x: s((b.x - a.x) / ((b.y - corte) / (corte - a.y) + 1) + a.x),
    y: s(corte),
  });
  let dentro = false;
  for (let i = 1; i < v.length; i++) {
    const p = v[i - 1]!;
    const q = v[i]!;
    if (i === 1 && v[1]!.y < corte && v[0]!.y > corte) {
      z.length = 0;
      z.push(v[0]!);
      dentro = true;
    }
    if (!dentro && q.y < corte) continue;
    if (dentro) {
      if (q.y >= corte) z.push(q);
      else {
        z.push(cortaEm(p, q));
        dentro = false;
      }
    } else {
      z.push(p.y < corte ? cortaEm(p, q) : p, q);
      dentro = true;
    }
  }
  if (z.length > 0) z.push(z[0]!);
  return z;
}

/** Área e ȳ da zona comprimida de profundidade z = 0,8·ξ·d numa coroa circular
 *  (PILAR.BAS:3441-3473). As faixas comparam z gravado em SINGLE (L_BP22); as
 *  fórmulas usam z da pilha. */
function segmentoCircular(ctx: Contexto, D: number, Di: number, z: number) {
  const { s, k } = ctx;
  const zs = s(z);
  const meia = (D - Di) / 2;
  const angulo = (dd: number, h: number) => {
    const b = s(Math.sqrt(dd * h - h ** 2));
    return s(Math.atan(b / (dd / 2 - h)) + (dd / 2 - h < 0 ? k.pi : 0));
  };
  const parte = (dd: number, a: number) => dd ** 2 * (a - Math.sin(a) * Math.cos(a));
  if (meia >= zs) {
    const a = angulo(D, z);
    return {
      area: s(parte(D, a) / 4),
      yc: s(D / 2 + (Math.sin(a) ** 3 * D) / ((a - Math.sin(a) * Math.cos(a)) * 3)),
    };
  }
  let a: number;
  let b: number;
  let area: number;
  if (meia <= zs && meia + Di >= zs) {
    a = angulo(D, z);
    b = angulo(Di, z - meia);
    area = s(parte(D, a) / 4 - parte(Di, b) / 4);
  } else if (meia + Di <= zs && D >= zs) {
    a = angulo(D, z);
    b = k.pi;
    area = s(parte(D, a) / 4 - (Di ** 2 * k.pi) / 4);
  } else {
    return { area: s(((D ** 2 - Di ** 2) * k.pi) / 4), yc: s(D / 2) };
  }
  let yc = s(D ** 3 * Math.sin(a) ** 3 - Di ** 3 * Math.sin(b) ** 3);
  yc = s(yc / ((parte(D, a) - parte(Di, b)) * 3));
  return { area, yc: s(D / 2 + yc) };
}

/** Tensão e deformação de uma barra à profundidade `prof` (cm) do topo: deformação
 *  linear da LN; aço A bilinear (Es = 2100 t/cm²); aço B linear até 0,7·fyd e curva
 *  ε = σ/Es + (σ/fyd − 0,7)²/45 até fyd/Es + 0,2 %. Abaixo da LN a tensão sai
 *  negativa (tração); acima, a deformação sai negativa (PILAR.BAS:4389-4430, S_27521). */
export function leiAco(ctx: Contexto, est: Estado, prof: number) {
  const { s, k, mat } = ctx;
  const xi = est.xi;
  const xd = xi * est.d;
  let eps: number;
  if (xi > 10) eps = est.epsC;
  else if (prof / est.d <= xi) eps = s((1 - prof / xd) * est.epsC);
  else eps = s((prof / xd - 1) * est.epsC);
  const ct = mat.coefTensao;
  let sigma: number;
  if (mat.aco === "A") {
    sigma = s(2100 * eps);
    if ((ct / (mat.csa * 2100)) * mat.fyk < eps) sigma = s((ct * mat.fyk) / mat.csa);
  } else if ((k.c07 / (mat.csa * 2100)) * mat.fyk * ct >= eps) {
    sigma = s(eps * 2100);
  } else if ((ct / (mat.csa * 2100)) * mat.fyk + k.c002 <= eps) {
    sigma = s((ct * mat.fyk) / mat.csa);
  } else {
    const a = k.inv2100 - (k.c14 / (mat.fyk * ct * 45)) * mat.csa;
    sigma = s(a ** 2 - ((mat.csa ** 2 * (k.c07 ** 2 / 45 - eps)) / ((ct * mat.fyk) ** 2 * 45)) * 4);
    sigma = s(
      ((((k.c14 / (mat.fyk * ct * 45)) * mat.csa - k.inv2100 + raiz(sigma)) * (ct * mat.fyk) ** 2) /
        (mat.csa ** 2 * 2)) *
        45,
    );
  }
  if (xd < prof) sigma = -sigma;
  else eps = -eps;
  return { sigma, eps };
}

/** SQR de negativo dá NaN sem erro, como o x87 com exceções mascaradas (RT_SQR##). */
export const raiz = (x: number) => (x < 0 ? Number.NaN : Math.sqrt(x));

/** Soma das barras: normal, momentos e maior deformação (PILAR.BAS:3337-3355, S_2012d). */
export function integraAco(ctx: Contexto, est: Estado) {
  const { s, mat } = ctx;
  let ns = 0;
  let msx = 0;
  let msy = 0;
  let maior = -100;
  for (const b of est.barras) {
    const prof = s(est.altura - b.y);
    const { sigma, eps } = leiAco(ctx, est, prof);
    ns = s((b.area * sigma) / mat.csf + ns);
    msx = s(((b.y - est.yc) * b.area * sigma) / mat.csf + msx);
    msy = s(((b.x - est.xc) * b.area * sigma) / mat.csf + msy);
    if (eps > maior) maior = eps;
  }
  est.ns = ns;
  est.msx = msx;
  est.msy = msy;
  est.epsAcoMax = maior;
}

/** Integra concreto e aço no (ξ, κ) do estado. */
export function integra(ctx: Contexto, est: Estado) {
  ctx.integracoes += 1;
  integraConcreto(ctx, est);
  integraAco(ctx, est);
}

/** Normal resistente do estado (Nc + Ns, sem gravar: soma da pilha). */
export const normal = (est: Estado) => est.nc + est.ns;

/** Área (com sinal) de um polígono fechado pela fórmula do original: positiva no
 *  sentido horário (PILAR.BAS:4192). */
function areaHoraria(v: readonly Ponto[]) {
  let a = 0;
  for (let i = 0; i < v.length - 1; i++)
    a += ((v[i]!.x + v[i + 1]!.x) * (v[i]!.y - v[i + 1]!.y)) / 2;
  return a;
}

/** Converte a seção do contrato para a do original: retangular vira o polígono
 *  (0,0) (0,h) (b,h) (b,0), como o PILDADOS grava (horário); a área de cada barra
 *  vem da tabela pela bitola (PILAR.BAS:3340-3346). Poligonal anti-horária: no
 *  original fica como está (área negativa, D-6); no corrigido os vértices são
 *  invertidos. Bitola fora da tabela é erro (o original reusaria a área anterior). */
export function secaoCalculo(
  secao: SecaoPilar,
  bitolas: readonly { bitola: number; area: number }[],
  modo: ModoSistrut,
): SecaoCalculo {
  const s = atribuicao(modo);
  const barras = secao.barras.map((b) => {
    const t = bitolas.find((x) => s(x.bitola) === s(b.bitola));
    if (!t) throw new Error(`Bitola ${b.bitola} mm fora da tabela do pilar`);
    return { x: s(b.x), y: s(b.y), area: t.area };
  });
  if (secao.tipo === "circular")
    return { tipo: 2, diametro: s(secao.d), diametroInterno: s(secao.dInterno), barras };
  if (secao.tipo === "retangular") {
    const b = s(secao.b);
    const h = s(secao.h);
    const vertices = [
      { x: 0, y: 0 },
      { x: 0, y: h },
      { x: b, y: h },
      { x: b, y: 0 },
      { x: 0, y: 0 },
    ];
    return { tipo: 1, vertices, barras };
  }
  let vertices = secao.vertices.map((p) => ({ x: s(p.x), y: s(p.y) }));
  vertices.push(vertices[0]!);
  if (modo === "corrigido" && areaHoraria(vertices) < 0) vertices = vertices.reverse();
  return { tipo: 3, vertices, barras };
}

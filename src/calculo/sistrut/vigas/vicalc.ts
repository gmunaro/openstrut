// VICALC: análise da viga contínua do VIGA.EXE (S_40243) pelo método dos focos.
// Porta passo a passo `viga/VIGA.BAS:6984-7785` da V1 nova; a especificação está em
// C:/tmp/v2-paridade/apoio/livros_viga_pilar.md 1.1-1.4 (contas à mão em 3.1) e nos
// livros U61-U64 (U64-001..016). Unidades do original: t, m, tm.
//
// Modo "original": toda atribuição passa por `sng` (SINGLE do QB4.5), na ordem em
// que o .BAS escreve cada expressão; é o que faz o V4 do caso b sair com x = 1,88 e
// o V6 com x = 1,87 (livros_viga_pilar.md 3.1). Modo "corrigido": mesmo algoritmo em
// float64, trocando só R6 (redução dos negativos limitada a 0,15..1; % de acidental
// gerada limitada a 4..96). R5 fica em `rep.ts`.
//
// Índices: como no original, a "viga de trabalho" tem os tramos 0..n+1, em que 0 e
// n+1 são os balanços, e os apoios 0..n. As divisões de carga ficam numa lista
// única (1-based) na ordem do registro do .VIG: balanço esquerdo, tramos 1..n e
// balanço direito (A_0e82/A_0eb0/A_0ede/A_0f68/A_0f96 com o índice acumulado A_0f3a).
import type { Etapa } from "../../tipos";
import { atribuicao, qbCint, qbInt, qbStr } from "../base/f32";
import type {
  AnalisaViga,
  AnalisaVigas,
  AnaliseViga,
  DadosViga,
  DivisaoCarga,
  EnvoltoriaTramo,
  ModoSistrut,
  ParametrosVicalc,
  TramoAnalisado,
  TramoViga,
} from "../base/tipos";

// ---------------------------------------------------------------- tipos locais
// O contrato (base/tipos.ts) não tem tudo o que o original imprime. Os tipos abaixo
// o estendem sem quebrar a atribuição a `AnaliseViga` (mudanças de contrato
// sugeridas no relatório da T3).

/** Linha da tabela "Esforcos de Engastamento Perfeito" (VIGA.BAS:7138-7182, 7636-7640):
 *  o original imprime tramo, Ve, x, M+ e Vd. `mEsquerdo` é o momento do apoio esquerdo
 *  no estado de engastamento (V_1c04 antes do GOSUB); `mDireito` não é calculado pelo
 *  original: sai por simetria, −((bf0+bf4)·B·bf4 − A·bf0·bf4)/(bf0+bf4+1), sem Mext. */
export interface LinhaEngastamentoPerfeito {
  tramo: number;
  ve: number;
  x: number;
  mPositivo: number;
  vd: number;
  mEsquerdo: number;
  mDireito: number;
}

/** Linha "max" da envoltória com a flecha f·EJ da envoltória (ST_1a8c(t+14), VIGA.BAS:7591). */
export interface EnvoltoriaTramoSistrut extends EnvoltoriaTramo {
  fEJ: number;
}

export interface TramoAnalisadoSistrut extends TramoAnalisado {
  envoltoria?: EnvoltoriaTramoSistrut;
}

/** Análise com os campos que o contrato não traz: vão de cada tramo (para o .REP),
 *  linha do engastamento perfeito completa e flecha da envoltória. */
export interface AnaliseVigaSistrut extends AnaliseViga {
  tramos: TramoAnalisadoSistrut[];
  engastamentoPerfeito: LinhaEngastamentoPerfeito[];
  /** Vãos dos tramos 1..n, m (o .REP escreve "[L]" do tramo extremo). */
  vaos: number[];
}

/** Texto do "Momento Engastamento Perfeito apoio(k)" do relatório:
 *  STR$(INT(MEP·100)/100), piso em 2 casas (VIGA.BAS:7559, 7612). −0,648 → "-.65". */
export function textoMep(mep: number, modo: ModoSistrut) {
  return qbStr(atribuicao(modo)(qbInt(mep * 100) / 100)).trimStart();
}

// ---------------------------------------------------------------- viga de trabalho

interface Divisao {
  p: number;
  d: number;
  f: number;
  pac: number;
  fac: number;
}

/** Viga como o VICALC a enxerga (A_0e26, A_0e54, A_0f0c, A_0f3a e as divisões). */
interface VigaTrabalho {
  n: number;
  balEsq: 0 | 1;
  balDir: 0 | 1;
  engEsq: 0 | 1;
  engDir: 0 | 1;
  /** L e J dos tramos 0..n+1 (0 e n+1 = balanços, 0 quando não há). */
  vao: number[];
  inercia: number[];
  /** Número de divisões e índice acumulado da última divisão de cada tramo 0..n+1. */
  nDiv: number[];
  fim: number[];
  /** Divisões 1-based (índice 0 é a posição de rascunho A_0e82(0)). */
  div: Divisao[];
  mext: [number, number];
}

const DIVISAO_VAZIA: Divisao = { p: 0, d: 0, f: 0, pac: 0, fac: 0 };

function montaTrabalho(viga: DadosViga): VigaTrabalho {
  const n = viga.tramos.length;
  const vazio: TramoViga = { vao: 0, inercia: 0, divisoes: [] };
  const todos = [viga.balancoEsquerdo ?? vazio, ...viga.tramos, viga.balancoDireito ?? vazio];
  const div: Divisao[] = [DIVISAO_VAZIA];
  const nDiv: number[] = [];
  const fim: number[] = [];
  for (const tramo of todos) {
    for (const d of tramo.divisoes) {
      div.push({ p: d.p, d: d.d, f: d.f, pac: d.pAcidental, fac: d.fAcidental });
    }
    nDiv.push(tramo.divisoes.length);
    fim.push(div.length - 1);
  }
  return {
    n,
    balEsq: viga.balancoEsquerdo ? 1 : 0,
    balDir: viga.balancoDireito ? 1 : 0,
    engEsq: viga.engasteEsquerdo ? 1 : 0,
    engDir: viga.engasteDireito ? 1 : 0,
    vao: todos.map((t) => t.vao),
    inercia: todos.map((t) => t.inercia),
    nDiv,
    fim,
    div,
    mext: viga.momentosExternos,
  };
}

/** Booleano do QB4.5: verdadeiro = −1, falso = 0 (as fórmulas do .BAS somam isso). */
const qb = (c: boolean) => (c ? -1 : 0);

/** Vetor 0..14 zerado (REDIM A_xxxx!(0 TO 14)). */
const zeros = (tamanho = 15) => Array.from({ length: tamanho }, () => 0);

const em = (arr: number[], i: number) => arr[i] ?? 0;

// ---------------------------------------------------------------- parâmetros (R6)

/** Fator de redução dos negativos efetivo. Original: o do VIGA.INI, MIN(v, 15) sem piso
 *  (VIGA.BAS:610-614; livros 5.1 V-2). Corrigido (R6): limitado a 0,15..1. */
export function fatorReducaoNegativos(parametros: ParametrosVicalc, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const v = parametros.reducaoNegativos;
  return modo === "original" ? s(Math.min(v, s(15))) : Math.max(0.15, Math.min(1, v));
}

/** % de acidental gerada efetiva (V_12d2%). Original: o valor em memória, CINT(v), sem
 *  limite: a tela (opção 8) testa `VAL > 96 AND VAL < 4`, que nunca recusa (VIGA.BAS:≈5434;
 *  U62-025; caso v2par_viga_r6 com 150 %). A leitura do VIGA.INI já grava
 *  CINT(MAX(4, MIN(96, v))) (VIGA.BAS:617-629): quem monta os parâmetros a partir do INI
 *  aplica esse limite. Corrigido (R6): 4..96. */
export function porcentagemAcidentalGerada(parametros: ParametrosVicalc, modo: ModoSistrut) {
  const v = parametros.porcentagemAcidentalGerada;
  return modo === "original" ? qbCint(v) : Math.max(4, Math.min(96, v));
}

/** Acidental gerada de uma divisão, na entrada da viga: Pac = pct·P/100 e, fora da carga
 *  indexada, Fac = pct·F/100 (VIGA.BAS:1294-1298; U61-016). Uso: montar a viga quando o
 *  VIGA.INI diz "G"; o VICALC lê Pac e Fac prontos do .VIG. */
export function divisaoComAcidentalGerada(
  divisao: DivisaoCarga,
  parametros: ParametrosVicalc,
  modo: ModoSistrut,
): DivisaoCarga {
  const s = atribuicao(modo);
  const pct = porcentagemAcidentalGerada(parametros, modo);
  return {
    ...divisao,
    pAcidental: s((pct * divisao.p) / 100),
    fAcidental: divisao.indexada ? divisao.fAcidental : s((pct * divisao.f) / 100),
  };
}

/** J relativo pedido com '*' na entrada: MAX(b1·h1³/(b2·h2³), b2·h2³/(b1·h1³)), cada razão
 *  com INT(x·100)/100, e o resultado volta ao campo como STR$ e é relido com VAL
 *  (VIGA.BAS:1396-1406, 1197; U61-014). Seções em cm. Ex. (caso p3): 20×40 e 20×50 → 1,95. */
export function inerciaPorSecoes(
  b1: number,
  h1: number,
  b2: number,
  h2: number,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const r12 = s(qbInt(((h1 ** 3 * b1) / (h2 ** 3 * b2)) * 100) / 100);
  const r21 = s(qbInt(((h2 ** 3 * b2) / (h1 ** 3 * b1)) * 100) / 100);
  const maior = s(Math.max(r21, r12));
  return modo === "original" ? s(Number(qbStr(maior))) : maior;
}

// ---------------------------------------------------------------- passos do S_40243

interface TermosCarga {
  re: number;
  rd: number;
  a: number;
  b: number;
}

/** Passo 1: reações isostáticas Re/Rd e termos de carga A (ST_1a1c) e B (ST_1a54) de
 *  um tramo, somando as divisões (VIGA.BAS:7016-7038; acidentais: 7252-7270). */
function termosDeCarga(
  vt: VigaTrabalho,
  t: number,
  acidental: boolean,
  s: (x: number) => number,
): TermosCarga {
  let re = 0;
  let rd = 0;
  let A = 0;
  let B = 0;
  if (em(vt.nDiv, t) === 0) return { re, rd, a: A, b: B };
  const L = em(vt.vao, t);
  let a = 0;
  for (let k = em(vt.fim, t) - em(vt.nDiv, t) + 1; k <= em(vt.fim, t); k++) {
    const dv = vt.div[k] ?? DIVISAO_VAZIA;
    const q = acidental ? dv.pac : dv.p;
    const F = acidental ? dv.fac : dv.f;
    const b = dv.d;
    re = s(((b - a) * q * (L - (b + a) / 2)) / L + re);
    rd = s(((b - a) * q * (b + a)) / (L * 2) + rd);
    A = s(A + ((b ** 2 * (L * 2 - b) ** 2 - a ** 2 * (L * 2 - a) ** 2) * q) / (L ** 2 * 4));
    B = s(
      B + ((b ** 2 * (L ** 2 * 2 - b ** 2) - a ** 2 * (L ** 2 * 2 - a ** 2)) * q) / (L ** 2 * 4),
    );
    re = s(((L - b) * F) / L + re);
    rd = s((b * F) / L + rd);
    A = s(A + (F * b * (L - b) * (L * 2 - b)) / L ** 2);
    B = s(B + (F * b * (L - b) * (L + b)) / L ** 2);
    a = b;
  }
  return { re, rd, a: A, b: B };
}

/** Passo 2: momento no apoio (acumulado sobre `m0`, o que já está no apoio) e carga
 *  total de um balanço; a e b medidos a partir do apoio. Esquerdo: divisões de A_0f3a(0) até 1 (o registro guarda da ponta livre para
 *  o apoio); direito: em ordem (VIGA.BAS:7048-7073; acidentais: 7280-7305). */
function balanco(
  vt: VigaTrabalho,
  lado: "esquerdo" | "direito",
  acidental: boolean,
  m0: number,
  s: (x: number) => number,
) {
  const ks: number[] = [];
  if (lado === "esquerdo") for (let k = em(vt.fim, 0); k >= 1; k--) ks.push(k);
  else for (let k = em(vt.fim, vt.n) + 1; k <= em(vt.fim, vt.n + 1); k++) ks.push(k);
  let m = m0;
  let carga = 0;
  let a = 0;
  for (const k of ks) {
    const dv = vt.div[k] ?? DIVISAO_VAZIA;
    const q = acidental ? dv.pac : dv.p;
    const F = acidental ? dv.fac : dv.f;
    const b = dv.d;
    m = s(m - ((b - a) ** 2 * q) / 2 - (b - a) * q * a - F * b);
    carga = s((b - a) * q + carga + F);
    a = b;
  }
  return { m, carga };
}

/** Passo 3: razões focais. `fiE[t + 1]` é o foco esquerdo do tramo t (ST_19a0) e `fiD[t]`
 *  o direito (ST_19e0); os extremos valem 0,5 com engaste (VIGA.BAS:7075-7092). */
function razoesFocais(vt: VigaTrabalho, fiE1: number, fiDn: number, s: (x: number) => number) {
  const { n, vao: L, inercia: J } = vt;
  const fiE = zeros(16);
  const fiD = zeros(16);
  fiE[2] = fiE1;
  fiD[n] = fiDn;
  if (n !== 1) {
    for (let t = 2; t <= n; t++) {
      fiE[t + 1] = s(
        1 / ((em(L, t - 1) * em(J, t) * (2 - em(fiE, t))) / (em(J, t - 1) * em(L, t)) + 2),
      );
    }
    for (let t = n - 1; t >= 1; t--) {
      fiD[t] = s(
        1 / ((em(L, t + 1) * em(J, t) * (2 - em(fiD, t + 1))) / (em(J, t + 1) * em(L, t)) + 2),
      );
    }
  }
  return { fiE, fiD };
}

/** Passo 7 (L_45ed7, VIGA.BAS:7681-7743): x do cortante nulo e M+ exato do tramo t com
 *  cortante V0 e momento M0 no apoio esquerdo e as cargas TOTAIS do tramo. Sem zero no
 *  vão, ou x fora de 0..L: x = 0 e M+ = 0. */
function momentoPositivo(
  vt: VigaTrabalho,
  t: number,
  V0: number,
  M0: number,
  s: (x: number) => number,
  avisos: string[],
) {
  const ini = em(vt.fim, t) - em(vt.nDiv, t) + 1;
  const ult = em(vt.fim, t);
  let V = V0;
  let a = 0;
  let caso = 0;
  let kz = ini;
  for (let k = ini; k <= ult; k++) {
    const dv = vt.div[k] ?? DIVISAO_VAZIA;
    if (V - (dv.d - a) * dv.p <= 0) {
      caso = 1;
      kz = k;
      break;
    }
    if (V - (dv.d - a) * dv.p - dv.f <= 0) {
      caso = 2;
      kz = k;
      break;
    }
    V = s(V - (dv.d - a) * dv.p - dv.f);
    a = dv.d;
  }
  if (caso === 0) return { x: 0, m: 0 };
  const dz = vt.div[kz] ?? DIVISAO_VAZIA;
  const x = caso === 1 ? s(V / dz.p + a) : dz.d;
  if (!Number.isFinite(x)) {
    // q = 0 com V ≤ 0: no original é a divisão V/q por zero (erro 11 do QB).
    avisos.push(
      `Tramo ${t}: cortante nulo numa divisão sem carga distribuída (V/0 no original); M+ = 0.`,
    );
    return { x: 0, m: 0 };
  }
  if (em(vt.vao, t) < x || x < 0) return { x: 0, m: 0 };
  a = 0;
  let m = s(V0 * x + M0);
  let kk = -1;
  for (let k = ini; k <= ult; k++) {
    const dv = vt.div[k] ?? DIVISAO_VAZIA;
    if (dv.d >= x) {
      kk = k;
      break;
    }
    m = s(m - ((dv.d - a) ** 2 * dv.p) / 2);
    m = s(m - (dv.d - a) * dv.p * (x - dv.d));
    m = s(m - (x - dv.d) * dv.f);
    a = dv.d;
  }
  if (kk < 0) return { x, m: 0 };
  m = s(m - ((x - a) ** 2 * (vt.div[kk] ?? DIVISAO_VAZIA).p) / 2);
  return { x, m };
}

/** Passo 9 (L_464ab, VIGA.BAS:7744-7783): soma dos termos de carga da flecha f·EJ no x
 *  do tramo t a partir de S0 (os termos dos momentos de apoio) e devolve MAX(0, −S). */
function flecha(vt: VigaTrabalho, t: number, x: number, S0: number, s: (x: number) => number) {
  const L = em(vt.vao, t);
  let S = S0;
  let a = 0;
  for (let k = em(vt.fim, t - 1) + 1; k <= em(vt.fim, t); k++) {
    const { p: q, d: b, f: F } = vt.div[k] ?? DIVISAO_VAZIA;
    if (b >= x) {
      S = s(S + ((L - b) * F * x ** 3) / (L * 6));
      S = s(S + ((b ** 2 * F) / 2 - (b ** 3 * F) / (L * 6) - (F * b * L) / 3) * x);
      S = s(S + (q * b * (L - b / 2) * x ** 3) / (L * 6));
      S = s(S - (x ** 4 * q) / 24);
      S = s(S + ((-q * b ** 4) / (L * 24) - (b ** 2 * q * L) / 6 + (b ** 3 * q) / 6) * x);
    } else {
      S = s(S - (F * b * x ** 3) / (L * 6) + (F * b * x ** 2) / 2);
      S = s(S - ((b ** 3 * F) / (L * 6) + (F * b * L) / 3) * x + (b ** 3 * F) / 6);
      S = s(S - (b ** 2 * q * x ** 3) / (L * 12) + (b ** 2 * q * x ** 2) / 4);
      S = s(S + ((-q * b ** 4) / (L * 24) - (b ** 2 * q * L) / 6) * x);
      S = s(S - (b ** 2 * q * L ** 2) / 6 + (b ** 4 * q) / 24 + (b ** 2 * q * L ** 2) / 6);
    }
    let c = 0;
    if (a > 0) {
      if (x <= a) {
        c = s((((L - a / 2) * q * x ** 3) / (L * 6)) * a);
        c = s(c - (x ** 4 * q) / 24);
        c = s(((-q * a ** 4) / (L * 24) - (a ** 2 * q * L) / 6 + (a ** 3 * q) / 6) * x + c);
      } else {
        c = s((-q * a ** 2 * x ** 3) / (L * 12) + (a ** 2 * q * x ** 2) / 4);
        c = s(((-q * a ** 4) / (L * 24) - (a ** 2 * q * L) / 6) * x + c);
        c = s(c - (a ** 2 * q * L ** 2) / 6 + (a ** 4 * q) / 24 + (a ** 2 * q * L ** 2) / 6);
      }
    }
    S = s(S - c);
    a = b;
  }
  return s(Math.max(0, -S));
}

// ---------------------------------------------------------------- análise

/** Análise de uma viga contínua pelo método dos focos, como o VICALC (S_40243,
 *  VIGA.BAS:6984-7785): momentos nos apoios (já reduzidos), cortantes, M+ e x por
 *  cortante nulo, reações estática/máx./mín., f·EJ, envoltória de acidentais (só com
 *  acidentais "S"), MEP dos extremos e momentos levados aos pilares extremos.
 *  Caso b, V1 (livros_viga_pilar.md 3.1): M(1) −0,97; Ve 0,73; x 1,50; M+ 0,55. */
export const analisaViga = ((viga, parametros, modo): AnaliseVigaSistrut => {
  const s = atribuicao(modo);
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const vt = montaTrabalho(viga);
  const { n, balEsq: bE, balDir: bD, engEsq: eE, engDir: eD, vao: L, mext } = vt;
  const fator = fatorReducaoNegativos(parametros, modo);
  const acidentais = parametros.acidentais;
  const mextAtivo = parametros.momentosExternos && !acidentais;

  if (n === 0) avisos.push(`${viga.nome}: viga sem tramos internos (só balanço).`);
  if (bE && eE)
    avisos.push(`${viga.nome}: balanço e engaste no lado esquerdo (o original recusa).`);
  if (bD && eD) avisos.push(`${viga.nome}: balanço e engaste no lado direito (o original recusa).`);
  const todas = [viga.balancoEsquerdo, ...viga.tramos, viga.balancoDireito];
  if (todas.some((t) => t?.divisoes.some((d) => d.indexada))) {
    avisos.push(
      `${viga.nome}: carga indexada não resolvida; o F gravado foi usado como está (use analisaVigas).`,
    );
  }

  // Passo 1: termos de carga dos tramos internos (VIGA.BAS:7016-7039).
  const re = zeros();
  const rd = zeros();
  const A = zeros();
  const B = zeros();
  for (let t = 1; t <= n; t++) {
    const tc = termosDeCarga(vt, t, false, s);
    re[t] = tc.re;
    rd[t] = tc.rd;
    A[t] = tc.a;
    B[t] = tc.b;
  }

  // Passo 2: balanços (VIGA.BAS:7040-7073).
  const M = zeros();
  let balancoEsquerdo: { mApoio: number; carga: number } | undefined;
  let balancoDireito: { mApoio: number; carga: number } | undefined;
  if (bE) {
    const bal = balanco(vt, "esquerdo", false, 0, s);
    M[0] = bal.m;
    rd[0] = bal.carga;
    balancoEsquerdo = { mApoio: bal.m, carga: bal.carga };
  }
  if (bD) {
    const bal = balanco(vt, "direito", false, em(M, n), s);
    balancoDireito = { mApoio: s(bal.m - em(M, n)), carga: bal.carga };
    M[n] = bal.m;
    re[n + 1] = bal.carga;
  }

  // Passo 3: razões focais (VIGA.BAS:7075-7092).
  const meio = s(0.5);
  const { fiE, fiD } = razoesFocais(vt, eE ? meio : 0, eD ? meio : 0, s);

  // Passo 4: momentos nos apoios, ida e volta (VIGA.BAS:7094-7124).
  if (mextAtivo) M[0] = s(em(M, 0) + mext[0]);
  if (!(eD === 0 && n === 1)) {
    for (let t = 1; t <= eD + n - 1; t++) {
      M[t] = s(
        (em(fiD, t) * (em(fiE, t + 1) * em(A, t) - em(B, t))) / (1 - em(fiD, t) * em(fiE, t + 1)),
      );
      M[t] = s(em(M, t) - em(fiD, t) * em(M, t - 1));
    }
  }
  if (mextAtivo) M[n] = s(em(M, n) + mext[1]);
  let mDir = em(M, n);
  if (eD === 1) mDir = s(-qb(mextAtivo) * mext[1]);
  if (!(eE === 0 && n === 1)) {
    for (let t = n; t >= 2 - eE; t--) {
      const m = s(
        (em(fiE, t + 1) * (em(fiD, t) * em(B, t) - em(A, t))) / (1 - em(fiD, t) * em(fiE, t + 1)),
      );
      M[t - 1] = s(m - em(fiE, t + 1) * mDir + em(M, t - 1));
      mDir = s(m - em(fiE, t + 1) * mDir);
    }
  }

  // Passo 5: redução dos negativos nos apoios internos e engastes (VIGA.BAS:7126-7131).
  for (let k = 1 - eE; k <= eD + n - 1; k++) M[k] = s(em(M, k) * fator);
  if (fator !== 1) {
    memoria.push({
      descricao: "Momentos dos apoios internos e engastes multiplicados pelo fator de redução",
      valor: fator,
      ref: "VIGA.BAS:7126-7131 (U64-004)",
    });
  }

  // Passo 6: engastamento perfeito, MEP, cortantes e M+ por tramo (VIGA.BAS:7133-7183).
  const fator101 = s(1.01);
  const engastamentoPerfeito: LinhaEngastamentoPerfeito[] = [];
  const xs = zeros();
  const mpos = zeros();
  let mepEsquerdo = 0;
  let mepDireito = 0;
  for (let t = 1; t <= n; t++) {
    const bf0 = eE === 0 && bE === 0 && t === 1 ? 0 : 1;
    const bf4 = eD === 0 && bD === 0 && n === t ? 0 : 1;
    const At = em(A, t);
    const Bt = em(B, t);
    const Lt = em(L, t);
    let mEsq = s(-(((bf0 + bf4) * At * bf0 - Bt * bf0 * bf4) / (bf0 + bf4 + 1)));
    let vePerf = s(((At * bf0 - Bt * bf4) * (bf0 + bf4)) / (Lt * 2) + em(re, t));
    if (mextAtivo) {
      if (t === 1) {
        mEsq = s(mext[0] + mEsq);
        vePerf = s(vePerf + ((qb(bf4 === 0) + (qb(bf4 === 1) * 3) / 2) * mext[0]) / Lt);
      }
      if (n === t) {
        if (t > 1) mEsq = s(mEsq - mext[1] / 2);
        vePerf = s(vePerf - ((qb(bf0 === 0) + (qb(bf0 === 1) * 3) / 2) * mext[1]) / Lt);
      }
    }
    if (t === 1) mepEsquerdo = s(-((At * 2 - Bt) / 3));
    if (n === t) mepDireito = s(-((Bt * 2 - At) / 3));
    const perf = momentoPositivo(vt, t, vePerf, mEsq, s, avisos);
    const linhaPerf: LinhaEngastamentoPerfeito = {
      tramo: t,
      ve: vePerf,
      x: perf.x,
      mPositivo: perf.m,
      vd: s(em(rd, t) - vePerf + em(re, t)),
      mEsquerdo: mEsq,
      mDireito: s(-(((bf0 + bf4) * Bt * bf4 - At * bf0 * bf4) / (bf0 + bf4 + 1))),
    };
    re[t] = s((em(M, t) - em(M, t - 1)) / Lt + em(re, t));
    rd[t] = s((em(M, t - 1) - em(M, t)) / Lt + em(rd, t));
    const mp = momentoPositivo(vt, t, em(re, t), em(M, t - 1), s, avisos);
    xs[t] = mp.x;
    mpos[t] = mp.m;
    if (linhaPerf.mPositivo > mp.m * fator101) engastamentoPerfeito.push(linhaPerf);
  }

  // Passo 8: reações e estado inicial da envoltória (VIGA.BAS:7196-7224).
  const mMax = M.slice();
  const ve5 = Array.from({ length: 15 }, (_, k) => [
    em(re, k),
    em(rd, k),
    em(re, k),
    em(re, k),
    em(rd, k),
  ]);
  const alt = Array.from({ length: 15 }, (_, k) =>
    k > 0 && k < n + 1 ? [em(re, k), em(M, k - 1)] : [0, 0],
  );
  const R = zeros(13);
  const rMax = zeros(13);
  const rMin = zeros(13);
  for (let k = 0; k <= n; k++) {
    R[k] = s(em(rd, k) + em(re, k + 1));
    rMax[k] = em(R, k);
    rMin[k] = em(R, k);
  }

  // Passo 9: flecha f·EJ no x do M+ (VIGA.BAS:7225-7233).
  const fEJ = zeros();
  for (let t = 1; t <= n; t++) {
    const x = em(xs, t);
    const Lt = em(L, t);
    const mi = em(M, t - 1);
    const mj = em(M, t);
    let S = s((x ** 2 * mi) / 2 - (x ** 3 * mi) / (Lt * 6) - (mi * Lt * x) / 3);
    S = s(S + ((x ** 3 * mj) / (Lt * 6) - (mj * Lt * x) / 6));
    fEJ[t] = flecha(vt, t, x, S, s);
  }

  // Passo 10: envoltória de acidentais, só com acidentais "S" (VIGA.BAS:7234-7461).
  if (acidentais) {
    envoltoria(vt, parametros, fator, s, { mMax, ve5, alt, rMax, rMin });
  }

  // M+ da envoltória (ou do caso total, sem acidentais) e flecha da envoltória
  // (VIGA.BAS:7462-7486).
  const xEnv = zeros();
  const mEnv = zeros();
  const fEJEnv = zeros();
  for (let t = 1; t <= n; t++) {
    const [vAlt = 0, mAlt = 0] = alt[t] ?? [];
    const mp = momentoPositivo(vt, t, vAlt, mAlt, s, avisos);
    xEnv[t] = mp.x;
    mEnv[t] = mp.m;
  }
  if (acidentais) {
    for (let t = 1; t <= n; t++) {
      const [vAlt = 0, mAlt = 0] = alt[t] ?? [];
      const x = em(xEnv, t);
      const Lt = em(L, t);
      let S = s((x ** 2 * mAlt) / 2 - (x ** 3 * mAlt) / (Lt * 6) - (mAlt * Lt * x) / 3);
      let mj = s(vAlt * Lt + mAlt);
      let a = 0;
      for (let k = em(vt.fim, t - 1) + 1; k <= em(vt.fim, t); k++) {
        const dv = vt.div[k] ?? DIVISAO_VAZIA;
        mj = s(mj - ((dv.d - a) ** 2 * dv.p) / 2 - ((dv.d - a) * dv.p + dv.f) * (Lt - dv.d));
        a = dv.d;
      }
      S = s(S + ((x ** 3 / (Lt * 6)) * mj - (Lt * x * mj) / 6));
      fEJEnv[t] = flecha(vt, t, x, S, s);
    }
  }

  // Soma das reações estáticas (VIGA.BAS:7503).
  let somaReacoes = 0;
  for (let k = 0; k <= n; k++) somaReacoes = s(em(R, k) + somaReacoes);

  // Passo 11: momentos levados aos pilares extremos (VIGA.BAS:7666-7679).
  const mult = parametros.multiplicadorMomentosPilar;
  let pEsq = s(qbInt(mult * 100 * mepEsquerdo) / 10000);
  if ((bD === 1 && n === 0) || eE === 1) pEsq = s(Math.abs(em(mMax, 0)));
  if (bE === 1 && n > 0) pEsq = 0;
  let pDir = s(qbInt(mult * 100 * mepDireito) / 10000);
  if ((bE === 1 && n === 0) || eD === 1) pDir = s(Math.abs(em(mMax, n)));
  if (bD === 1 && n > 0) pDir = 0;

  // Saída nos índices do contrato.
  const coefFlecha = (v: number) =>
    s(v * parametros.coeficienteMedida ** 3 * parametros.coeficienteForca);
  const tramos: TramoAnalisadoSistrut[] = [];
  for (let t = 1; t <= n; t++) {
    const e5 = ve5[t] ?? [0, 0, 0, 0, 0];
    const [eVe = 0, eVd = 0, , eVeMin = 0, eVdMin = 0] = e5;
    const tramo: TramoAnalisadoSistrut = {
      ve: em(re, t),
      vd: em(rd, t),
      x: em(xs, t),
      mPositivo: em(mpos, t),
      fEJ: coefFlecha(em(fEJ, t)),
    };
    if (acidentais) {
      // Linha "max": Ve/Vd de maior módulo entre máximo e mínimo (VIGA.BAS:7583-7591).
      tramo.envoltoria = {
        ve: Math.abs(eVeMin) > eVe ? eVeMin : eVe,
        vd: Math.abs(eVdMin) > eVd ? eVdMin : eVd,
        x: em(xEnv, t),
        mPositivo: em(mEnv, t),
        fEJ: coefFlecha(em(fEJEnv, t)),
      };
    }
    tramos.push(tramo);
    memoria.push({
      descricao: `Tramo ${t}: M+ no cortante nulo (x = ${em(xs, t)} m)`,
      formula: "M+ = M(t−1) + Ve·x − Σ cargas até x",
      valor: em(mpos, t),
      unidade: "tm",
      ref: "VIGA.BAS:7172-7178, 7681-7743 (U64-006)",
    });
  }
  const apoios = [];
  for (let k = 0; k <= n; k++) {
    apoios.push({
      m: em(M, k),
      r: em(R, k),
      rMax: em(rMax, k),
      rMin: em(rMin, k),
      mMax: em(mMax, k),
    });
    memoria.push({
      descricao: `Apoio ${k}: momento (método dos focos) e reação estática`,
      valor: em(M, k),
      unidade: "tm",
      ref: "VIGA.BAS:7094-7124, 7220 (U64-001, U64-010)",
    });
  }

  const resultado: AnaliseVigaSistrut = {
    nome: viga.nome,
    apoios,
    tramos,
    somaReacoes,
    mepEsquerdo,
    mepDireito,
    momentosPilar: [pEsq, pDir],
    engastamentoPerfeito,
    vaos: viga.tramos.map((t) => t.vao),
    avisos,
    memoria,
  };
  if (balancoEsquerdo) resultado.balancoEsquerdo = balancoEsquerdo;
  if (balancoDireito) resultado.balancoDireito = balancoDireito;
  return resultado;
}) satisfies AnalisaViga;

interface EstadoEnvoltoria {
  /** A_1924: momento máximo (negativo) por apoio. */
  mMax: number[];
  /** A_196c(k, 0..4): Ve máx., Vd máx., Ve com o próprio tramo descarregado, Ve mín., Vd mín. */
  ve5: number[][];
  /** A_1982(t, 0..1): Ve e M(t−1) do carregamento alternado que dá o M+ máximo. */
  alt: number[][];
  rMax: number[];
  rMin: number[];
}

/** Passo 10: casos de carga acidental (um por tramo/balanço) e de momento externo; tira
 *  do caso total as parcelas favoráveis (VIGA.BAS:7234-7461; U64-005, U64-008, U64-011).
 *  O defeito U64-009 (A_1936 com índice fixo 0) só alimenta o diagrama e não é portado. */
function envoltoria(
  vt: VigaTrabalho,
  parametros: ParametrosVicalc,
  fator: number,
  s: (x: number) => number,
  est: EstadoEnvoltoria,
) {
  const { n, balEsq: bE, balDir: bD, engEsq: eE, engDir: eD, vao: L, mext } = vt;
  const ultimoCaso = n - qb(parametros.momentosExternos) * 2 + bD;
  const meio = s(0.5);
  for (let c = 1 - bE; c <= ultimoCaso; c++) {
    const Mc = zeros();
    const RE = Array.from({ length: 15 }, () => [0, 0]);
    const Ac = zeros(14);
    const Bc = zeros(14);
    const casoMext = bD + n < c;
    if (!casoMext) {
      for (let t = 1; t <= n; t++) {
        if (t !== c || em(vt.nDiv, t) === 0) continue;
        const tc = termosDeCarga(vt, t, true, s);
        RE[t] = [tc.re, tc.rd];
        Ac[t] = tc.a;
        Bc[t] = tc.b;
      }
    } else if (bD + n + 1 === c) Mc[0] = mext[0];
    else Mc[n] = mext[1];
    if (bE && c === 0 && em(vt.nDiv, 0) !== 0) {
      const bal = balanco(vt, "esquerdo", true, em(Mc, 0), s);
      Mc[0] = bal.m;
      RE[0] = [0, bal.carga];
    }
    if (bD && n + 1 === c && em(vt.nDiv, n + 1) !== 0) {
      const bal = balanco(vt, "direito", true, em(Mc, n), s);
      Mc[n] = bal.m;
      RE[n + 1] = [bal.carga, 0];
    }
    const fiE1 = bD + n + 1 === c || eE === 0 ? 0 : meio;
    const fiDn = bD + n + 2 === c || eD === 0 ? 0 : meio;
    const { fiE, fiD } = razoesFocais(vt, fiE1, fiDn, s);
    if (!(eD === 0 && n === 1)) {
      const ate = n - qb(bD + n + 2 !== c) * eD - 1;
      for (let t = 1; t <= ate; t++) {
        Mc[t] = s(
          (em(fiD, t) * (em(fiE, t + 1) * em(Ac, t) - em(Bc, t))) /
            (1 - em(fiD, t) * em(fiE, t + 1)),
        );
        Mc[t] = s(em(Mc, t) - em(fiD, t) * em(Mc, t - 1));
      }
    }
    let mDir = em(Mc, n);
    if (bD + n + 2 !== c && bD === 0) mDir = 0;
    if (!(eE === 0 && n === 1)) {
      const desde = qb(bD + n + 1 !== c) * eE + 2;
      for (let t = n; t >= desde; t--) {
        const m = s(
          (em(fiE, t + 1) * (em(fiD, t) * em(Bc, t) - em(Ac, t))) /
            (1 - em(fiD, t) * em(fiE, t + 1)),
        );
        Mc[t - 1] = s(m - em(fiE, t + 1) * mDir + em(Mc, t - 1));
        mDir = s(m - em(fiE, t + 1) * mDir);
      }
    }
    if (bD + n >= c) for (let k = 1 - eE; k <= eD + n - 1; k++) Mc[k] = s(em(Mc, k) * fator);
    for (let t = 1; t <= n; t++) {
      const r = RE[t] ?? [0, 0];
      r[0] = s((em(Mc, t) - em(Mc, t - 1)) / em(L, t) + (r[0] ?? 0));
      r[1] = s((em(Mc, t - 1) - em(Mc, t)) / em(L, t) + (r[1] ?? 0));
    }

    for (let k = 0; k <= n + 1; k++) {
      const [re0 = 0, rd0 = 0] = RE[k] ?? [];
      const e = est.ve5[k] ?? [];
      const al = est.alt[k] ?? [];
      const mck = em(Mc, k);
      const rc = n + 1 > k ? rd0 + (RE[k + 1]?.[0] ?? 0) : 0;
      if (!casoMext) {
        if (mck > 0) est.mMax[k] = s(em(est.mMax, k) - mck);
        if (re0 < 0) e[0] = s(em(e, 0) - re0);
        if (rd0 < 0) e[1] = s(em(e, 1) - rd0);
        if (k === c) e[2] = s(em(e, 2) - re0);
        if (re0 > 0) e[3] = s(em(e, 3) - re0);
        if (rd0 > 0) e[4] = s(em(e, 4) - rd0);
        if (n + 1 > k) {
          if (rc < 0) est.rMax[k] = s(em(est.rMax, k) - rc);
          else est.rMin[k] = s(em(est.rMin, k) - rc);
        }
        // Carregamento alternado: tira a acidental do caso quando (k + c) é ímpar.
        if ((k + c) % 2 === 0) continue;
        if (k > 0) {
          al[0] = s(em(al, 0) - re0);
          al[1] = s(em(al, 1) - em(Mc, k - 1));
        }
        continue;
      }
      if (mck < 0) est.mMax[k] = s(em(est.mMax, k) + mck);
      if (re0 > 0) e[0] = s(em(e, 0) + re0);
      if (rd0 > 0) e[1] = s(em(e, 1) + rd0);
      if (re0 > 0) e[2] = s(em(e, 2) + re0);
      if (re0 < 0) e[3] = s(em(e, 3) + re0);
      if (rd0 < 0) e[4] = s(em(e, 4) + rd0);
      if (n + 1 > k) {
        if (rc > 0) est.rMax[k] = s(rc + em(est.rMax, k));
        else est.rMin[k] = s(rc + em(est.rMin, k));
      }
      // Mext: soma o caso nos tramos pela paridade da distância à extremidade
      // (VIGA.BAS:7435-7451).
      const m0 = em(Mc, 0);
      const mn = em(Mc, n);
      const esq = bD + n + 1 === c && (((k + 1) % 2 === 0 && m0 > 0) || (k % 2 === 0 && m0 < 0));
      const dir =
        bD + n + 2 === c && (((n - k) % 2 === 0 && mn > 0) || ((n - k + 1) % 2 === 0 && mn < 0));
      if ((esq || dir) && k > 0) {
        al[0] = s(em(al, 0) + re0);
        al[1] = s(em(al, 1) + em(Mc, k - 1));
      }
    }
  }
}

// ---------------------------------------------------------------- várias vigas

/** Resultado de `analisaVigasComPendencias`: as análises na ordem em que o original as
 *  processa e as vigas que ficaram sem processar ("AS VIGAS ... NAO FORAM PROCESSADAS"). */
export interface AnaliseDeVigas {
  analises: AnaliseVigaSistrut[];
  naoProcessadas: string[];
  /** As vigas da entrada, na mesma ordem, com as cargas indexadas resolvidas (F e Fac
   *  gravados, sem `indexada`): o .VIG que o DESDIM lê depois do VIGA. */
  vigas: DadosViga[];
}

/** Processa as vigas como a opção 2 do VIGA (VIGA.BAS:1610-1669): em passadas sobre a
 *  lista, calcula cada viga sem carga indexada pendente e, logo depois, resolve as
 *  cargas das outras vigas que apontam para ela (L_15d8a, VIGA.BAS:1670-1706):
 *  F = INT(R·1000)/1000 (estática) ou, com acidentais "S" e reação "M",
 *  F = INT(Rmax·1000)/1000 e Fac = INT((Rmax − Rmin)·1000)/1000; no corrigido, sem o
 *  INT (como o R5). Apoio inexistente na viga de origem deixa a carga pendente (U61-019). */
export function analisaVigasComPendencias(
  vigas: readonly DadosViga[],
  parametros: ParametrosVicalc,
  modo: ModoSistrut,
): AnaliseDeVigas {
  const s = atribuicao(modo);
  const trabalho = vigas.map((v) => structuredClone(v));
  const feitas = new Set<number>();
  const analises: AnaliseVigaSistrut[] = [];
  const pendente = (v: DadosViga) =>
    [v.balancoEsquerdo, ...v.tramos, v.balancoDireito].some((t) =>
      t?.divisoes.some((d) => d.indexada),
    );
  let houve = true;
  while (houve) {
    houve = false;
    for (const [i, viga] of trabalho.entries()) {
      if (feitas.has(i) || pendente(viga)) continue;
      feitas.add(i);
      houve = true;
      const analise = analisaViga(viga, parametros, modo);
      analises.push(analise);
      for (const outra of trabalho) {
        for (const tramo of [outra.balancoEsquerdo, ...outra.tramos, outra.balancoDireito]) {
          for (const d of tramo?.divisoes ?? []) {
            if (d.indexada?.viga !== viga.nome) continue;
            const apoio = analise.apoios[d.indexada.apoio];
            if (viga.tramos.length < d.indexada.apoio || !apoio) continue;
            // Original: INT(R·1000)/1000, perde até 1 kg por transferência. Corrigido
            // (mesma correção do R5): a reação inteira, para o equilíbrio fechar.
            const corta = (x: number) => (modo === "original" ? s(qbInt(x * 1000) / 1000) : x);
            if (parametros.acidentais && parametros.reacaoNoPilar === "maxima") {
              d.f = corta(apoio.rMax);
              d.fAcidental = corta(apoio.rMax - apoio.rMin);
            } else {
              d.f = corta(apoio.r);
              d.fAcidental = 0;
            }
            delete d.indexada;
          }
        }
      }
    }
  }
  const naoProcessadas = trabalho.filter((_, i) => !feitas.has(i)).map((v) => v.nome);
  return { analises, naoProcessadas, vigas: trabalho };
}

/** Contrato T3: analisa todas as vigas resolvendo as cargas indexadas na ordem de
 *  dependência (VIGA.BAS:1610-1706). As vigas que não puderam ser processadas viram
 *  aviso em cada análise devolvida (o contrato não tem campo para elas). */
export const analisaVigas = ((vigas, parametros, modo) => {
  const { analises, naoProcessadas } = analisaVigasComPendencias(vigas, parametros, modo);
  if (naoProcessadas.length > 0) {
    const aviso = `Vigas não processadas (carga indexada sem origem): ${naoProcessadas.join(", ")}.`;
    for (const a of analises) a.avisos.push(aviso);
  }
  return analises;
}) satisfies AnalisaVigas;

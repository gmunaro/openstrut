// Vigas da montagem (LAJEMONT; livros_laje.md 1.15; PLANO M2-M4): pontos do eixo,
// códigos de nó, tramos, inércia relativa J, peso próprio em kg/m inteiro, divisões
// de carga, alvenaria sobre a viga, reação indexada de viga sobre viga e o registro
// do .VIG como `DadosViga`.
//
// Códigos de nó do original (A_1a2c, L_312b3): 0 nada, 1000+p pilar p, 2000+k esta
// viga se apoia na viga k, 3000+k a viga k se apoia aqui, 4000+k isoladas (cruzam
// sem apoio). Na V2 o `EixoViga` diz o apoio de cada ponto; "isoladas" é `null`, que
// para a montagem age igual ao código 0.
import type { DadosViga, DivisaoCarga, EixoViga, PesoProprioVigas, TramoViga } from "../base/tipos";
import { qbCint } from "../base/f32";
import { distancia, maior, menor, type Tolerancias } from "./geometria";
import type { TrechoAlvenaria } from "./cargas";

/** J do .VIG quando o apoio não tem número de pilar: 1 + 471/100000 em SINGLE
 *  (LAJEMONT.BAS:4125; o 471 é a marca de apoio '*' que o VIGA opção 7 reconhece). */
const J_SEM_PILAR = 1.00471;

/** Peso próprio de viga digitado (t/m) como o original guarda: kg/m inteiro,
 *  CINT(v·dec/de8·1000) (LAJEMONT.BAS:5124; livros_laje D12). Para a T7 montar
 *  `PesoProprioVigas`. */
export const pesoKgPorM = (tPorM: number) => qbCint(tPorM * 1000);

/** VAL$ do QuickBASIC sobre o nome do pilar: o número do começo do texto (0 se não
 *  houver). O original guarda o pilar sem o "P" (A_1128$ = "7") e só o imprime com
 *  "P"; aqui o "P" inicial seguido de número é ignorado. */
export function numeroDoPilar(nome: string) {
  const sem = nome.replace(/^\s*P(?=\s*[\d.])/i, "");
  const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)/.exec(sem);
  return m ? Number(m[0]) : 0;
}

/** Uma viga em montagem, com os vetores do original indexados como lá. */
export interface VigaMontagem {
  nome: string;
  /** Pontos 1..m (índice 0 sem uso). */
  x: number[];
  y: number[];
  cod: number[];
  /** kg/m inteiro. */
  kg: number;
  // saídas do S_2a7a8: A_1bda (0 tramos, 1 Be, 2 Bd, 3 Ee, 4 Ed), por tramo t
  // (0..13) A_1c64 divisões, A_1c92 acumulado, A_1c08 vão, A_1c36 J; por divisão k
  // A_1af4 P, A_1b50 D, A_1b22 Pac, A_1ac6 alvenaria.
  bda: number[];
  c64: number[];
  c92: number[];
  c08: number[];
  c36: number[];
  af4: number[];
  b50: number[];
  b22: number[];
  ac6: number[];
  /** Carga indexada por divisão (A_1b7e = k + aa/100 com A_1bac = −100). */
  indexada: ({ viga: number; apoio: number } | undefined)[];
}

const zeros = (n: number) => Array.from({ length: n }, () => 0);

/** Números dos pilares por nome (A_1156/A_1128$): índice 1-based na ordem em que
 *  aparecem nos eixos. */
export function tabelaPilares(eixos: readonly EixoViga[]) {
  const nomes: string[] = [""];
  for (const e of eixos)
    for (const a of e.apoios)
      if (a && "pilar" in a && !nomes.includes(a.pilar)) nomes.push(a.pilar);
  return nomes;
}

/** Pontos e códigos de cada viga (S_3014b: L_305c9 insere no eixo os vértices que
 *  caem nele, LAJEMONT.BAS:4721-4818; L_312b3 classifica, 4819-5108). Os candidatos são
 *  os vértices das lajes e os pontos das outras vigas. */
export function montaPontos(
  eixos: readonly EixoViga[],
  verticesLajes: readonly { x: number; y: number }[],
  pilares: readonly string[],
  pesos: PesoProprioVigas,
  t: Tolerancias,
  avisos: string[],
): VigaMontagem[] {
  const { s, tol, eps } = t;
  const indiceViga = new Map(eixos.map((e, i) => [e.nome, i + 1]));
  const vigas = eixos.map((e): VigaMontagem => {
    const x = [0];
    const y = [0];
    const cod = [0];
    e.pontos.forEach((p, j) => {
      x.push(s(p.x));
      y.push(s(p.y));
      const a = e.apoios[j];
      let c = 0;
      if (a && "pilar" in a) c = 1000 + pilares.indexOf(a.pilar);
      else if (a && "viga" in a) {
        const k = indiceViga.get(a.viga);
        if (k === undefined)
          avisos.push(`Viga ${e.nome}: apoio na viga ${a.viga}, que não existe.`);
        else c = 2000 + k;
      }
      cod.push(c);
    });
    const kg = pesos.excecoes[e.nome] ?? pesos.predominanteKgPorM;
    const v: VigaMontagem = {
      nome: e.nome,
      x,
      y,
      cod,
      kg,
      bda: zeros(5),
      c64: zeros(16),
      c92: zeros(16),
      c08: zeros(16),
      c36: zeros(16),
      af4: zeros(64),
      b50: zeros(64),
      b22: zeros(64),
      ac6: zeros(64),
      indexada: [],
    };
    return v;
  });
  const candidatos = [
    ...verticesLajes.map((p) => ({ x: s(p.x), y: s(p.y) })),
    ...eixos.flatMap((e) => e.pontos.map((p) => ({ x: s(p.x), y: s(p.y) }))),
  ];
  for (const v of vigas) {
    const m0 = v.x.length - 1;
    if (m0 < 2) continue;
    const x0 = v.x[1] ?? 0;
    const y0 = v.y[1] ?? 0;
    const x1 = v.x[m0] ?? 0;
    const y1 = v.y[m0] ?? 0;
    // posição ao longo do eixo, do primeiro ao último ponto dado
    const dx = x1 - x0;
    const dy = y1 - y0;
    const param = (px: number, py: number) => (px - x0) * dx + (py - y0) * dy;
    for (const c of candidatos) {
      if ((c.y === y1 && c.x === x1) || (c.y === y0 && c.x === x0)) continue;
      if (x0 === x1) {
        if (Math.abs(c.x - x0) > tol) continue;
        if (c.y > maior(s, y0, y1) || c.y < menor(s, y0, y1)) continue;
      } else if (y0 === y1) {
        if (Math.abs(c.y - y0) > tol) continue;
        if (c.x > maior(s, x0, x1) || c.x < menor(s, x0, x1)) continue;
      } else {
        if (Math.abs(x1 - c.x) < tol || Math.abs(x0 - c.x) < tol) continue;
        if (c.y < menor(s, y0, y1) || c.y > maior(s, y0, y1)) continue;
        if (c.x < menor(s, x0, x1) || c.x > maior(s, x0, x1)) continue;
        if (Math.abs(c.y - (((y1 - y0) * (c.x - x0)) / (x1 - x0) + y0)) > eps) continue;
      }
      let existe = false;
      for (let j = 1; j < v.x.length; j++) {
        if (Math.abs((v.x[j] ?? 0) - c.x) < tol && Math.abs((v.y[j] ?? 0) - c.y) < tol)
          existe = true;
      }
      if (existe) continue;
      const pc = param(c.x, c.y);
      let j = 1;
      while (j < v.x.length && !(param(v.x[j] ?? 0, v.y[j] ?? 0) > pc)) j += 1;
      v.x.splice(j, 0, c.x);
      v.y.splice(j, 0, c.y);
      v.cod.splice(j, 0, 0);
    }
  }
  // viga sobre viga: a viga apoiada tem 2000+k; a que recebe, 3000+(apoiada)
  vigas.forEach((v, iv) => {
    for (let j = 1; j < v.x.length; j++) {
      const c = v.cod[j] ?? 0;
      if (c < 2000 || c >= 3000) continue;
      const w = vigas[c - 2000 - 1];
      if (!w) continue;
      let achou = false;
      for (let k = 1; k < w.x.length; k++) {
        if (
          Math.abs((w.x[k] ?? 0) - (v.x[j] ?? 0)) < tol &&
          Math.abs((w.y[k] ?? 0) - (v.y[j] ?? 0)) < tol
        ) {
          w.cod[k] = 3000 + iv + 1;
          achou = true;
          break;
        }
      }
      if (!achou)
        avisos.push(`Viga ${v.nome}: o ponto de apoio na viga ${w.nome} não está no eixo dela.`);
    }
  });
  return vigas;
}

const milhar = (c: number) => Math.floor(c / 1000) * 1000;

/** Tramos, J, peso próprio e divisões de uma viga (S_2a7a8, LAJEMONT.BAS:4069-4231).
 *  Devolve o peso próprio total da viga (parcela de V_19ea). */
export function montaTramos(
  v: VigaMontagem,
  pilares: readonly string[],
  t: Tolerancias,
  acumulado: number,
) {
  const { s } = t;
  const m = v.x.length - 1;
  const J = (cod: number) => {
    const val = numeroDoPilar(pilares[cod - 1000] ?? "");
    return val > 0 ? s(val / 100000 + 1) : s(J_SEM_PILAR);
  };
  const pesoDiv = s(v.kg / 1000);
  let pp = acumulado;
  let x16 = 0;
  let y1a = 0;
  let k = 1; // V_0f14: divisão corrente
  let tr = 0; // L_BP22: tramo corrente
  let bp1e = -1; // último pilar
  for (let j = 1; j <= m; j++) {
    const cod = v.cod[j] ?? 0;
    const f04 = milhar(cod);
    if (j === 1) {
      x16 = v.x[1] ?? 0;
      y1a = v.y[1] ?? 0;
      k = 1;
      bp1e = -1;
      if (f04 === 0 || f04 === 4000 || f04 === 3000) {
        tr = 0;
        v.bda[1] = 1;
        if (f04 === 3000) v.indexada[k] = { viga: cod - 3000, apoio: 0 };
      } else {
        tr = 1;
        if (f04 === 1000) bp1e = cod;
      }
      continue;
    }
    if (cod === bp1e && f04 === 1000) {
      // mesmo pilar do ponto anterior (pilar-parede): engaste, sem divisão
      x16 = v.x[j] ?? 0;
      y1a = v.y[j] ?? 0;
      if (j === 2) v.bda[3] = 1;
    } else {
      v.c64[tr] = (v.c64[tr] ?? 0) + 1;
      v.b50[k] = s(distancia(v.x[j] ?? 0, v.y[j] ?? 0, x16, y1a));
      v.af4[k] = pesoDiv;
      if (f04 === 3000) v.indexada[k + (tr === 0 ? 1 : 0)] = { viga: cod - 3000, apoio: 0 };
      if (f04 === 2000 || f04 === 1000) {
        if (tr > 0) v.bda[0] = (v.bda[0] ?? 0) + 1;
        v.c08[tr] = v.b50[k] ?? 0;
        pp = s((v.kg * (v.c08[tr] ?? 0)) / 1000 + pp);
        v.c36[tr] = s(J_SEM_PILAR);
        if (cod !== bp1e && f04 === 1000) v.c36[tr] = J(cod);
        if (v.bda[1] === 0 && tr === 1) {
          v.c36[0] = s(J_SEM_PILAR);
          if (bp1e < 2000 && bp1e > 1000) v.c36[0] = J(bp1e);
        }
        v.c92[tr] = tr > 0 ? (v.c64[tr] ?? 0) + (v.c92[tr - 1] ?? 0) : (v.c64[tr] ?? 0);
        if (tr === 0 && (v.c64[0] ?? 0) > 1) {
          for (let d = v.c64[0] ?? 0; d >= 2; d--)
            v.b50[d] = s((v.c08[0] ?? 0) - (v.b50[d - 1] ?? 0));
          v.b50[1] = v.c08[0] ?? 0;
        }
        x16 = v.x[j] ?? 0;
        y1a = v.y[j] ?? 0;
        tr += 1;
      }
      k += 1;
    }
    if (j === m) {
      if (f04 === 0 || f04 === 4000 || f04 === 3000) {
        v.bda[2] = 1;
        v.c92[tr] = (v.c64[tr] ?? 0) + (v.c92[tr - 1] ?? 0);
        v.c08[tr] = v.b50[k - 1] ?? 0;
        pp = s((v.kg * (v.c08[tr] ?? 0)) / 1000 + pp);
        v.c36[tr] = 1;
        if (tr === 1) {
          v.c36[0] = s(J_SEM_PILAR);
          if (bp1e < 2000 && bp1e > 1000) v.c36[0] = J(bp1e);
        }
      }
      if (cod === bp1e && f04 === 1000) v.bda[4] = 1;
    }
    if (f04 === 1000) bp1e = cod;
  }
  if (v.bda[0] === 0) {
    v.bda[3] = 0;
    v.bda[4] = 0;
  }
  return pp;
}

/** Número de apoios antes do ponto da viga `w` onde a viga `alvo` se apoia (o "aa" da
 *  carga indexada *n.aa; LAJEMONT.BAS:4199-4231). */
export function resolveIndexacao(vigas: VigaMontagem[]) {
  vigas.forEach((v, iv) => {
    v.indexada.forEach((ix) => {
      if (!ix) return;
      const w = vigas[ix.viga - 1];
      if (!w) return;
      let bp1e = -1;
      let n = 0;
      for (let j = 1; j < w.x.length; j++) {
        const c = w.cod[j] ?? 0;
        if (c === 2000 + iv + 1) {
          ix.apoio = n;
          return;
        }
        const f04 = milhar(c);
        if (f04 === 2000 || f04 === 1000) {
          if (c === bp1e && f04 === 1000) continue;
          n += 1;
          if (f04 === 1000) bp1e = c;
        }
      }
    });
  });
}

/** Índice da divisão do trecho que começa no ponto j (L_2a2d6 e L_2cf60): conta os
 *  pontos 1..j que fecham divisão (o mesmo pilar em pontos seguidos não fecha). */
export function divisaoDoTrecho(v: VigaMontagem, j: number) {
  let n = 0;
  for (let p = 1; p <= j; p++) {
    const c = v.cod[p] ?? 0;
    const cProx = v.cod[p + 1] ?? 0;
    if ((c !== cProx && milhar(c) === 1000) || milhar(c) !== 1000) n += 1;
  }
  return n;
}

/** Número de divisões gravadas (A_1c92 do último tramo). */
export const totalDivisoes = (v: VigaMontagem) => v.c92[(v.bda[2] ?? 0) + (v.bda[0] ?? 0)] ?? 0;

/** Carga das alvenarias sobre o trecho (x1, y1)-(x2, y2) de viga, t (L_2db80,
 *  LAJEMONT.BAS:4440-4575): só trechos colineares e sobrepostos, pelo comprimento
 *  comum. */
export function alvenariaNoTrecho(
  x16: number,
  y1a: number,
  x50: number,
  y54: number,
  alvenarias: readonly TrechoAlvenaria[],
  t: Tolerancias,
) {
  const { s, eps } = t;
  const mn = (a: number, b: number) => menor(s, a, b);
  const mx = (a: number, b: number) => maior(s, a, b);
  let total = 0;
  for (const a of alvenarias) {
    const { x1, y1, x2, y2 } = a;
    if (mn(x16, x50) > mx(x1, x2) || mx(x16, x50) < mn(x1, x2)) continue;
    if (mn(y1a, y54) > mx(y1, y2) || mx(y1a, y54) < mn(y1, y2)) continue;
    let ax: number;
    let ay: number;
    let bx: number;
    let by: number;
    if (x16 === x50) {
      if (x1 !== x2) continue;
      if (mn(y1a, y54) === mx(y1, y2) || mx(y1a, y54) === mn(y1, y2)) continue;
      ax = x16;
      bx = x16;
      ay = mn(mx(y1a, y54), mx(y1, y2));
      by = mx(mn(y1a, y54), mn(y1, y2));
    } else {
      if (x1 === x2) continue;
      if (Math.abs((y2 - y1) / (x2 - x1) - (y54 - y1a) / (x50 - x16)) > eps) continue;
      if (x16 !== x2 && x16 !== x1) {
        if (Math.abs((y2 - y1a) / (x2 - x16) - (y1a - y1) / (x16 - x1)) > eps) continue;
      } else if (y1a !== y2 && y1a !== y1) {
        continue;
      }
      ax = x16;
      ay = y1a;
      if (x50 < x16) {
        ax = x50;
        ay = y54;
      }
      if (x1 < x2) {
        if (x1 > ax) {
          ax = x1;
          ay = y1;
        }
      } else if (x2 > ax) {
        ax = x2;
        ay = y2;
      }
      bx = x16;
      by = y1a;
      if (x50 > x16) {
        bx = x50;
        by = y54;
      }
      if (x1 > x2) {
        if (x1 < bx) {
          bx = x1;
          by = y1;
        }
      } else if (x2 < bx) {
        bx = x2;
        by = y2;
      }
    }
    total = s(total + a.carga * distancia(ax, ay, bx, by));
  }
  return total;
}

/** Ponto inicial do trecho que fecha a divisão k (L_2cf60). */
export function trechoDaDivisao(v: VigaMontagem, k: number) {
  let n = 0;
  for (let j = 1; j < v.x.length - 1; j++) {
    const c = v.cod[j] ?? 0;
    const cProx = v.cod[j + 1] ?? 0;
    if ((c !== cProx && milhar(c) === 1000) || milhar(c) !== 1000) {
      n += 1;
      if (n === k) return j;
    }
  }
  return -1;
}

/** `DadosViga` com o J bruto de todos os apoios (o .VIG grava J(0) mesmo sem balanço;
 *  o contrato `DadosViga` só tem J por tramo). */
export interface DadosVigaMontagem extends DadosViga {
  /** A_1c36(0..n+1) como gravado no .VIG. */
  inerciasBrutas: number[];
}

/** Registro do .VIG da viga como `DadosViga` (S_33d84, LAJEMONT.BAS:5170-5393): por
 *  tramo o vão, o J bruto e as divisões (P, D, F, Pac, Fac). Balanço esquerdo com as
 *  divisões na ordem do registro: da ponta para o apoio, D medido a partir do apoio. */
export function dadosViga(
  v: VigaMontagem,
  vigas: readonly VigaMontagem[],
  pilares: readonly string[],
): DadosVigaMontagem {
  const n = v.bda[0] ?? 0;
  const be = v.bda[1] === 1;
  const bd = v.bda[2] === 1;
  const divisoes = (tr: number): DivisaoCarga[] => {
    const ini = tr === 0 ? 1 : (v.c92[tr - 1] ?? 0) + 1;
    const fim = v.c92[tr] ?? 0;
    const lista: DivisaoCarga[] = [];
    for (let k = ini; k <= fim; k++) {
      const ix = v.indexada[k];
      const alvo = ix ? vigas[ix.viga - 1] : undefined;
      lista.push({
        p: v.af4[k] ?? 0,
        d: v.b50[k] ?? 0,
        f: 0,
        pAcidental: v.b22[k] ?? 0,
        fAcidental: 0,
        ...(ix && alvo ? { indexada: { viga: alvo.nome, apoio: ix.apoio } } : {}),
      });
    }
    return lista;
  };
  const tramo = (tr: number): TramoViga => ({
    vao: v.c08[tr] ?? 0,
    inercia: v.c36[tr] ?? 0,
    divisoes: divisoes(tr),
  });
  const tramos: TramoViga[] = [];
  for (let tr = 1; tr <= n; tr++) tramos.push(tramo(tr));
  // pilares dos apoios: os pontos que fecham tramo (pilar ou viga), sem repetir pilar-parede
  const apoios: (string | null)[] = [];
  let bp1e = -1;
  for (let j = 1; j < v.x.length; j++) {
    const c = v.cod[j] ?? 0;
    const f04 = milhar(c);
    if (f04 !== 1000 && f04 !== 2000) continue;
    if (c === bp1e && f04 === 1000) continue;
    apoios.push(f04 === 1000 ? (pilares[c - 1000] ?? null) : null);
    if (f04 === 1000) bp1e = c;
  }
  return {
    nome: v.nome,
    tramos,
    ...(be ? { balancoEsquerdo: tramo(0) } : {}),
    ...(bd ? { balancoDireito: tramo(n + 1) } : {}),
    engasteEsquerdo: v.bda[3] === 1,
    engasteDireito: v.bda[4] === 1,
    momentosExternos: [0, 0],
    pilares: apoios,
    inerciasBrutas: v.c36.slice(0, n + 1 + (bd ? 1 : 0)),
  };
}

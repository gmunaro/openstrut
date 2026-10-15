// Detalhamento longitudinal e transversal da viga: porte do DESINIT (DESINI2 S_40132,
// DESINIT.BAS:1567-3355; faces S_30132, :942-1013; estribos S_343BE, :1417-1566;
// porta-estribos S_338ED, :1300-1416). Monta, a partir dos grupos de corte do DESAUXDI
// (`desinitCorte.ts`), as posições de barras em cm: negativas (A_1AF2), positivas
// (A_1AC4), dobras, grampos, pele, porta-estribos e trechos de estribos.
// Especificação: livros_arm_forma_des.md 4.3 (U17-D-01..06, U18-001..015).
//
// Porte linha a linha (nomes = endereços do original, ver `desinitComum.ts`). As
// variáveis locais de S_40132 (L_BPxx) que passam de uma sub-rotina para outra ficam em
// `Locais`. O defeito R11 (U18-015, 0x46D2B) está em `grampoPositivoDireita`.
import { ErroQB, qbCint, qbClng } from "../base/f32";
import type { ModoSistrut } from "../base/tipos";
import { type Comum, qb } from "./desinitComum";

const menor = (a: number, b: number) => (a < b ? a : b);
const maior = (a: number, b: number) => (a > b ? a : b);

/** VAL$ do QuickBASIC: número no começo do texto, ignorando espaços ("2#10" → 2,
 *  "#5/12" → 0, "5/12" → 5). */
export function qbVal(texto: string) {
  const t = texto.replace(/[ \t]/g, "");
  const m = /^[+-]?(\d+\.?\d*|\.\d+)([ED][+-]?\d+)?/i.exec(t);
  if (!m) return 0;
  return Number(m[0].replace(/d/i, "e"));
}

/** Texto depois do primeiro "#" (RT_MID2$(s, INSTR(1, s, "#") + 1)); sem "#", o texto todo. */
const depoisDoSustenido = (s: string) => s.slice(s.indexOf("#") + 1);

/** Locais de S_40132 que atravessam sub-rotinas (L_BP0E, L_BP12, L_BP16, L_BP1C e o
 *  limite do laço de L_4634E, L_BP1F4, usado pelo salto do defeito R11). */
interface Locais {
  bp0e: number;
  bp12: number;
  bp16: number;
  bp1c: number;
  bp1f4: number;
}

/** Índice 1..9 da bitola na tabela A_1C62 (0 para 4 mm ou bitola fora da tabela). */
export function indiceDobra(c: Comum, b: number) {
  // −((b = φ9)·9 + ... + (b = φ1)): soma os índices de todas as bitolas iguais
  // (DESINIT.BAS:2000, 2238, 2320, 2403)
  let i = 0;
  for (let j = 9; j >= 1; j--) if (b === c.bitola.g(j)) i += j;
  return i;
}

/** L_BP12 + n·(área das bitolas iguais a `b`), em duas atribuições SINGLE como o original:
 *  φ0..φ4 e depois φ5..φ9 (a expressão −(b = φ0)·a0 − ...; DESINIT.BAS:2123-2124). */
export function somaArea(c: Comum, b: number, n: number, acumulado: number) {
  const parcial = (de: number, ate: number) => {
    let a = 0;
    for (let i = de; i <= ate; i++) if (b === c.bitola.g(i)) a += c.area.g(i);
    return a;
  };
  const meio = c.s(parcial(0, 4) * n + acumulado);
  return c.s(parcial(5, 9) * n + meio);
}

/** Nº de estribos lado a lado / mínimo de barras pela largura (2, 4 ou 6). */
const minimoPorLargura = (c: Comum, bw: number) => 2 - qb(bw > c.v0f3e) * 2 - qb(bw > c.v0f42) * 2;

/** τbu: lb = φ·fyk/(40·0,9·γs·(fck/γc)^(2/3)) em cm (sem o multiplicador). */
function lbBase(c: Comum, phi: number) {
  return (
    (phi / (((c.v0eba * c.v0ec6 * 1000) / c.v0f5e) ** c.k(2 / 3) * 40 * c.v0f66 * c.k(0.9))) *
    c.v0ebe *
    c.v0ec6 *
    1000
  );
}

/** Ancoragem (cm) pela bitola e o multiplicador (< 0 fixa; > 100 diâmetros); grava V_0E20
 *  (L_41CF5 negativas, L_4320C positivas; DESINIT.BAS:1844-1856, 1977-1989; U18-001/002). */
function ancoragemCm(c: Comum, phi: number, mult: number) {
  if (mult < 0) c.v0e20 = c.s(-mult);
  else if (mult > 100) c.v0e20 = c.s(((mult - 100) * phi) / 10);
  else c.v0e20 = c.s(c.int(lbBase(c, phi) * mult));
}

/** Nº de barras da camada V_0E28 com V_0EE2 barras na seção de largura V_0E92 (L_4F64E,
 *  DESINIT.BAS:3273-3306; U18-006). */
function barrasNaCamada(c: Comum) {
  let g = 0;
  if (c.v0e92 > c.v0f4a) g = 1;
  if (c.v0e92 > c.v0f4e) g = 2;
  if (c.v0f46 > 3 && c.v0e92 > c.v0f52) g = 3;
  if (c.v0f46 > 4 && c.v0e92 > c.v0f56) g = 4;
  if (c.v0f46 > 5 && c.v0e92 > c.v0f5a) g = 5;
  const i = menor(7, c.s(c.v0ee2 - 2));
  c.v0e44 = c.a14e4.g(i, g);
  if (c.a14e4.g(i, g) * c.v0e28 > c.v0ee2) c.v0e44 = c.s(c.v0ee2 - (c.v0e28 - 1) * c.a14e4.g(i, g));
}

/** Faces do vão livre de cada tramo, cm (S_30132, DESINIT.BAS:979-990; U17-D-01). */
export function faces(c: Comum) {
  const s = c.s;
  const fim = s(c.v0ddc + c.v0de4);
  for (c.v0e14 = s(1 - c.v0de0); c.v0e14 <= fim; c.v0e14 = s(c.v0e14 + 1)) {
    const t = c.v0e14;
    if (t === 0) {
      c.a1a0c.p(t, 1, c.a1926.g(t, 1));
    } else {
      c.a1a0c.p(t, 0, c.a1a0c.g(t - 1, 1) + c.a1926.g(t - 1, 0));
      c.a1a0c.p(t, 1, c.a1a0c.g(t, 0) + c.a1926.g(t, 1));
    }
  }
  if (c.v0de4 === 0) {
    const t = c.v0e14;
    c.a1a0c.p(t, 0, c.a1a0c.g(t - 1, 1) + c.a1926.g(t - 1, 0));
    c.a1a0c.p(t, 1, c.a1a0c.g(t, 0));
  }
}

// ======================================================================= negativas

/** Barras negativas dos apoios a partir dos grupos de A_1318 (L_401D3,
 *  DESINIT.BAS:1644-1722; U18-004). */
function negativas(c: Comum, l: Locais) {
  const s = c.s;
  c.v185e = 0;
  const extE = qb(c.a1148.g(0) < 0 && c.v0e74 === "S");
  const extD = qb(c.a1148.g(1) < 0 && c.v0e74 === "S");
  const ini = menor(0, maior(c.v0ddc, s(1 - c.v0de0 - c.v0de8 + extE)));
  const fim = maior(c.v0ddc, menor(0, s(c.v0ddc - 1 + c.v0de4 + (c.v0dec - extD))));
  if (!(ini > fim)) {
    for (c.v0e14 = ini; c.v0e14 <= fim; c.v0e14 = s(c.v0e14 + 1)) {
      const k = c.v0e14;
      if (c.a12bc.g(k, 0) + c.a12bc.g(k, 2) === 0) continue;
      let contadas = 0;
      const ng = c.a1318.g(k, 0, 0);
      for (c.v0e28 = 1; c.v0e28 <= ng; c.v0e28 = s(c.v0e28 + 1)) {
        c.v0ee2 = s(c.a12bc.g(k, 0) + c.a12bc.g(k, 2));
        c.v0e92 = c.a1260.g(k, 0);
        barrasNaCamada(c);
        c.v185e = s(c.v185e + 1);
        const p = c.v185e;
        c.a1af2.p(p, 0, c.v0e44);
        c.a1af2.p(p, 1, c.a12bc.g(k, 1));
        if (contadas >= c.a12bc.g(k, 0) && c.a12bc.g(k, 2) > 0) c.a1af2.p(p, 1, c.a12bc.g(k, 3));
        contadas = qbCint(contadas + c.v0e44);
        ancoragemCm(c, c.a1af2.g(p, 1), c.v18ae);
        const g = menor(c.v0e28, 13);
        c.a1af2.p(
          p,
          2,
          c.a1a0c.g(k, 0) - c.a19de.g(k) + (c.a1006.g(k) * c.v0fa2 - c.a1318.g(k, g, 1)) * 100,
        );
        if (k === 0) {
          c.a1af2.p(p, 2, c.a19de.g(k) - c.a1318.g(k, g, 1) * 100 + c.a1a0c.g(k, 1));
          if (c.v0de0 === 0) c.a1af2.p(p, 2, c.a1a0c.g(k + 1, 0) - c.v0e20);
        }
        c.a1af2.p(p, 3, c.a1a0c.g(k, 1) + c.v0e20);
        if (c.v0de4 === 1 || k < c.v0ddc) {
          c.a1af2.p(p, 3, c.a1a0c.g(k + 1, 0) - c.a19de.g(k + 1) + c.a1318.g(k, g, 2) * 100);
        }
        desnivelNegativa(c);
        c.a1af2.p(c.v185e, 2, c.int(c.a1af2.g(c.v185e, 2)));
        c.a1af2.p(c.v185e, 3, c.int(c.a1af2.g(c.v185e, 3)));
      }
    }
  }
  extremidades(c, l);
}

/** Apoio com desnível da face superior: a negativa se parte em duas (L_40B51,
 *  DESINIT.BAS:1723-1758). */
function desnivelNegativa(c: Comum) {
  const s = c.s;
  const k = c.v0e14;
  if (c.a19b0.g(k) === c.a19b0.g(k + 1)) return;
  const p = c.v185e;
  c.a1af2.copiaLinha(p, p + 1);
  const pilar = c.a1982.g(k, 1) > 0 && c.a1954[k]!.slice(0, 1) === "P";
  if (!(c.a19b0.g(k) < c.a19b0.g(k + 1))) {
    c.a1af2.p(p + 1, 2, c.a1a0c.g(k, 1) + c.v0eaa);
    if (pilar) c.a1af2.p(p + 1, 2, c.a1a0c.g(k, 1) + c.a1982.g(k, 2) + c.v0eaa);
    ancoragemCm(c, c.a1af2.g(p, 1), c.v18ae);
    c.a1af2.p(p, 3, menor(s(c.a1a0c.g(k + 1, 1) - c.v0eaa), s(c.a1a0c.g(k + 1, 0) + c.v0e20)));
  } else {
    ancoragemCm(c, c.a1af2.g(p, 1), c.v18ae);
    c.a1af2.p(p + 1, 2, maior(s(c.a1a0c.g(k, 0) + c.v0eaa), s(c.a1a0c.g(k, 1) - c.v0e20)));
    c.a1af2.p(p, 3, c.a1926.g(k, 0) - c.v0eaa + c.a1a0c.g(k, 1));
    if (pilar) c.a1af2.p(p, 3, c.a1a0c.g(k, 1) + c.a1982.g(k, 2) + (c.a1982.g(k, 1) - c.v0eaa));
  }
  c.v185e = s(c.v185e + 1);
}

/** Bitola da barra superior de extremidade pela altura do tramo (L_41A0A,
 *  DESINIT.BAS:1823-1843). */
function bitolaExtremidade(c: Comum, t: number) {
  const h = c.a1232.g(t, 1);
  c.v0e44 = c.v0ece;
  if (c.area.g(5) > 0 && h > c.a1d1a.g(4)) c.v0e44 = c.bitola.g(5);
  if (c.area.g(4) > 0 && h <= c.a1d1a.g(4)) c.v0e44 = c.bitola.g(4);
  if (c.area.g(3) > 0 && h <= c.a1d1a.g(3)) c.v0e44 = c.bitola.g(3);
  if (c.area.g(2) > 0 && h <= c.a1d1a.g(2)) c.v0e44 = c.bitola.g(2);
  if (c.area.g(1) > 0 && h <= c.a1d1a.g(1)) c.v0e44 = c.bitola.g(1);
  if (c.area.g(0) > 0 && h <= c.a1d1a.g(0)) c.v0e44 = c.bitola.g(0);
}

/** Barras superiores nos apoios extremos sem negativo: n = CINT(MIN(taxa·bw·d; As do
 *  tramo)/a), mínimo 2/4/6 (L_41135, DESINIT.BAS:1759-1822; U18-014). */
function extremidades(c: Comum, l: Locais) {
  const s = c.s;
  const pula = (ext: boolean, bal: number, eng: number) =>
    ext || bal === 1 || eng === 1 || c.v0ddc === 0 || c.v18b2 <= 0;
  const quantidade = (t: number) => {
    const p = c.v185e;
    const a = s(((c.a1232.g(t, 1) - c.v0ea6) * c.a1232.g(t, 0) * c.v18b2) / l.bp0e);
    const b = s(c.a128e.g(t, 6) / l.bp0e);
    c.a1af2.p(p, 0, qbCint(menor(a, b)));
    c.a1af2.p(p, 0, maior(c.a1af2.g(p, 0), minimoPorLargura(c, c.a1232.g(t, 0))));
  };
  if (!pula(c.a1148.g(0) < 0 && c.v0e74 === "S", c.v0de0, c.v0de8)) {
    c.v185e = s(c.v185e + 1);
    const p = c.v185e;
    l.bp0e = 1;
    bitolaExtremidade(c, 1);
    c.a1af2.p(p, 1, c.v0e44);
    l.bp0e = c.areaDaBitola(c.v0e44);
    ancoragemCm(c, c.a1af2.g(p, 1), c.v18ae);
    const pilar = qb(c.a1954[0]!.slice(0, 1) === "P");
    c.a1af2.p(
      p,
      2,
      c.int(
        c.a1a0c.g(1, 0) - c.v0e20 + pilar * (c.a1a0c.g(1, 0) - c.a1982.g(0, 1) - c.a1982.g(0, 2)),
      ),
    );
    const l9c = s(c.a1af2.g(p, 1) * 2 + c.a1232.g(1, 1));
    c.a1af2.p(p, 3, c.int(c.a1a0c.g(1, 0) + maior(c.v0e20, l9c)));
    quantidade(1);
  }
  if (!pula(c.a1148.g(1) < 0 && c.v0e74 === "S", c.v0de4, c.v0dec)) {
    c.v185e = s(c.v185e + 1);
    const p = c.v185e;
    const n = c.v0ddc;
    l.bp0e = n;
    bitolaExtremidade(c, n);
    c.a1af2.p(p, 1, c.v0e44);
    l.bp0e = c.areaDaBitola(c.v0e44);
    ancoragemCm(c, c.a1af2.g(p, 1), c.v18ae);
    const lbe = s(c.a1af2.g(p, 1) * 2 + c.a1232.g(n, 1));
    c.a1af2.p(p, 2, c.int(c.a1a0c.g(n, 1) - maior(c.v0e20, lbe)));
    const pilar = qb(c.a1954[n]!.slice(0, 1) === "P");
    c.a1af2.p(p, 3, c.int(c.v0e20 - pilar * c.a1982.g(n, 2) + c.a1a0c.g(n, 1)));
    quantidade(n);
  }
}

// ======================================================================= positivas

/** Barras positivas dos tramos a partir dos grupos de A_12EA; até 1/3 da As vai ao apoio
 *  (L_41E26, DESINIT.BAS:1857-1932; U18-005). */
function positivas(c: Comum, l: Locais) {
  const s = c.s;
  c.v1866 = 0;
  const nT = c.v0ddc;
  for (c.v0e14 = 1; c.v0e14 <= nT; c.v0e14 = s(c.v0e14 + 1)) {
    const t = c.v0e14;
    l.bp12 = 0;
    let contadas = 0;
    const ng = c.a12ea.g(t, 0, 0);
    for (c.v0e28 = 1; c.v0e28 <= ng; c.v0e28 = s(c.v0e28 + 1)) {
      c.v0ee2 = s(c.a128e.g(t, 0) + c.a128e.g(t, 2));
      c.v0e92 = c.a1232.g(t, 0);
      barrasNaCamada(c);
      c.v1866 = s(c.v1866 + 1);
      const p = c.v1866;
      c.a1ac4.p(p, 0, c.v0e44);
      c.a1ac4.p(p, 1, c.a128e.g(t, 1));
      if (contadas >= c.a128e.g(t, 0) && c.a128e.g(t, 2) > 0) c.a1ac4.p(p, 1, c.a128e.g(t, 3));
      ancoragemCm(c, c.a1ac4.g(p, 1), c.v18aa);
      contadas = qbCint(contadas + c.v0e44);
      const g = menor(c.v0e28, 13);
      c.a1ac4.p(p, 2, c.a1a0c.g(t, 0) - c.a19de.g(t) + c.a12ea.g(t, g, 1) * 100);
      if (c.a1a0c.g(t, 0) - c.a1ac4.g(p, 2) > c.v0e20) c.a1ac4.p(p, 2, c.a1a0c.g(t, 0) - c.v0e20);
      c.a1ac4.p(p, 3, c.a1a0c.g(t, 0) - c.a19de.g(t) + c.a12ea.g(t, g, 2) * 100);
      if (c.a1ac4.g(p, 3) - c.a1a0c.g(t, 1) > c.v0e20) c.a1ac4.p(p, 3, c.a1a0c.g(t, 1) + c.v0e20);
      if (c.a128e.g(t, 6) / 3 >= l.bp12) {
        if (c.a1ac4.g(p, 2) > c.a1a0c.g(t, 0)) c.a1ac4.p(p, 2, c.a1a0c.g(t, 0) - 1);
        if (c.a1ac4.g(p, 3) < c.a1a0c.g(t, 1)) c.a1ac4.p(p, 3, c.a1a0c.g(t, 1) + 1);
      }
      c.v0e44 = c.areaDaBitola(c.a1ac4.g(p, 1));
      l.bp12 = s(c.a1ac4.g(p, 0) * c.v0e44 + l.bp12);
      c.a1ac4.p(p, 2, c.int(c.a1ac4.g(p, 2)));
      c.a1ac4.p(p, 3, c.int(c.a1ac4.g(p, 3)));
    }
  }
  if (c.v0de4 === 0 && c.v0de0 === 0) return;
  const fimD = c.v1866;
  for (c.v0e14 = 1; c.v0e14 <= fimD; c.v0e14 = s(c.v0e14 + 1)) {
    const p = c.v0e14;
    if (c.a1ac4.g(p, 0) > 1 && c.v0de4 === 1 && c.a1ac4.g(p, 3) >= c.a1a0c.g(nT, 1)) {
      positivaBalancoDireito(c, p);
      break;
    }
  }
  if (c.v0de4 === 1 && nT === 0) novaPositivaBalancoDireito(c);
  const fimE = c.v1866;
  for (c.v0e14 = 1; c.v0e14 <= fimE; c.v0e14 = s(c.v0e14 + 1)) {
    const p = c.v0e14;
    if (c.a1ac4.g(p, 0) > 1 && c.v0de0 === 1 && c.a1ac4.g(p, 2) <= c.a1a0c.g(1, 0)) {
      positivaBalancoEsquerdo(c, p);
      break;
    }
  }
  if (c.v0de0 === 1 && nT === 0) novaPositivaBalancoEsquerdo(c);
}

/** Positiva que chega ao balanço direito: segue até a ponta, ou uma barra nova (L_428EE,
 *  DESINIT.BAS:1933-1941). */
function positivaBalancoDireito(c: Comum, p: number) {
  const n = c.v0ddc;
  const fimBal = c.a1a0c.g(n + 1, 1);
  if (
    fimBal - c.v0eaa - c.a1ac4.g(p, 2) > c.v187e ||
    c.a19b0.g(n) + c.a1232.g(n, 1) !== c.a19b0.g(n + 1) + c.a1232.g(n + 1, 1)
  ) {
    novaPositivaBalancoDireito(c);
    return;
  }
  const mesma =
    c.a1ac4.g(p, 0) === minimoPorLargura(c, c.a1232.g(n, 0)) &&
    c.a1ac4.g(p, 1) < c.bitola.g(5) &&
    c.a1232.g(n, 0) === c.a1232.g(n + 1, 0);
  if (qbVal(c.a13d0[n]!) === 0 && mesma) {
    c.a1ac4.p(p, 3, c.int(fimBal - c.v0eaa - 1));
    return;
  }
  novaPositivaBalancoDireito(c);
}

/** L_42BD6 (DESINIT.BAS:1942-1954). */
function novaPositivaBalancoDireito(c: Comum) {
  const s = c.s;
  const n = c.v0ddc;
  c.v1866 = s(c.v1866 + 1);
  const p = c.v1866;
  c.a1ac4.p(p, 0, minimoPorLargura(c, c.a1232.g(n, 0)));
  c.a1ac4.p(p, 1, maior(c.v0ece, c.bitola.g(2)));
  c.a1ac4.p(
    p,
    2,
    maior(s(c.a1a0c.g(n, 1) + c.v0eaa), s(c.a1a0c.g(n + 1, 0) - qbCint((c.v18d2 * c.v0ece) / 10))),
  );
  c.a1ac4.p(p, 3, c.int(c.a1a0c.g(n + 1, 1) - c.v0eaa - 1));
}

/** L_42DDC (DESINIT.BAS:1955-1963). */
function positivaBalancoEsquerdo(c: Comum, p: number) {
  if (
    c.a1ac4.g(p, 3) - c.a1a0c.g(0, 0) - c.v0eaa > c.v187e ||
    c.a19b0.g(0) + c.a1232.g(0, 1) !== c.a19b0.g(1) + c.a1232.g(1, 1)
  ) {
    novaPositivaBalancoEsquerdo(c);
    return;
  }
  const mesma =
    c.a1ac4.g(p, 0) === minimoPorLargura(c, c.a1232.g(0, 0)) &&
    c.a1ac4.g(p, 1) < c.bitola.g(5) &&
    c.a1232.g(0, 0) === c.a1232.g(1, 0);
  if (qbVal(c.a13d0[0]!) === 0 && mesma) {
    c.a1ac4.p(p, 2, c.int(c.a1a0c.g(0, 0) + c.v0eaa + 1));
    return;
  }
  novaPositivaBalancoEsquerdo(c);
}

/** L_43041 (DESINIT.BAS:1964-1976). */
function novaPositivaBalancoEsquerdo(c: Comum) {
  const s = c.s;
  c.v1866 = s(c.v1866 + 1);
  const p = c.v1866;
  c.a1ac4.p(p, 0, minimoPorLargura(c, c.a1232.g(0, 0)));
  c.a1ac4.p(p, 1, maior(c.v0ece, c.bitola.g(2)));
  c.a1ac4.p(p, 2, c.int(c.a1a0c.g(0, 0) + c.v0eaa + 1));
  c.a1ac4.p(
    p,
    3,
    menor(s(c.a1a0c.g(1, 0) - c.v0eaa), s(qbCint((c.v18d2 * c.v0ece) / 10) + c.a1a0c.g(0, 1))),
  );
}

// ======================================================================= armadura comprimida

/** Armadura comprimida do tramo (A_13A2$): estende uma negativa que já passa pela
 *  zona ou cria uma barra nova com 70 φ (L_4D11A, DESINIT.BAS:3008-3069; U18-012). */
function comprimidaNosTramos(c: Comum) {
  const s = c.s;
  const nT = c.v0ddc;
  for (c.v0e14 = 1; c.v0e14 <= nT; c.v0e14 = s(c.v0e14 + 1)) {
    const t = c.v0e14;
    const texto = c.a13a2[t]!;
    if (qbVal(texto) === 0) continue;
    c.v0e44 = qbVal(depoisDoSustenido(texto));
    c.v0e2c = s(c.v0e44 / 10);
    c.v0e44 = c.areaDaBitola(c.v0e44);
    c.v0e20 = s(c.v0e44 * qbVal(texto));
    c.v0f7e = s(c.int(c.a12ea.g(t, 14, 1) * 100 - c.a19de.g(t)));
    c.v0f82 = s(qbCint(c.a12ea.g(t, 14, 2) * 100 - c.a19de.g(t)));
    const vl3 = c.a1926.g(t, 1) / 3;
    let estendeu = false;
    const fim = c.v185e;
    for (c.v0e28 = 1; c.v0e28 <= fim; c.v0e28 = s(c.v0e28 + 1)) {
      const p = c.v0e28;
      if (c.a1af2.g(p, 2) > c.a1a0c.g(t, 1) - vl3 || c.a1af2.g(p, 3) < vl3 + c.a1a0c.g(t, 0))
        continue;
      if (c.a1af2.g(p, 3) >= c.a1a0c.g(t, 1) - vl3 && c.a1af2.g(p, 2) <= vl3 + c.a1a0c.g(t, 0))
        continue;
      if (
        1 - c.v0de0 < t &&
        c.a1af2.g(p, 2) < c.a1a0c.g(t - 1, 1) &&
        c.a19b0.g(t - 1) > c.a19b0.g(t)
      ) {
        continue;
      }
      if (
        c.v0ddc - 1 + c.v0de4 > t &&
        c.a1af2.g(p, 3) > c.a1a0c.g(t + 1, 0) &&
        c.a19b0.g(t) < c.a19b0.g(t + 1)
      ) {
        continue;
      }
      c.v0e44 = c.areaDaBitola(c.a1af2.g(p, 1));
      if (c.a1af2.g(p, 0) * c.v0e44 < c.v0e20) continue;
      const ext = c.int((70 / (c.a1af2.g(p, 0) * c.v0e44)) * c.v0e2c * c.v0e20);
      if (c.a1af2.g(p, 3) < c.a1a0c.g(t, 0) + c.v0f82) {
        c.a1af2.p(p, 3, maior(c.a1af2.g(p, 3), s(c.a1a0c.g(t, 0) + c.v0f82 + ext)));
      } else {
        c.a1af2.p(p, 2, menor(c.a1af2.g(p, 2), s(c.v0f7e - ext + c.a1a0c.g(t, 0))));
      }
      estendeu = true;
      break;
    }
    if (estendeu) continue;
    c.v185e = s(c.v185e + 1);
    const p = c.v185e;
    c.a1af2.p(p, 0, qbVal(texto));
    c.a1af2.p(p, 1, qbVal(depoisDoSustenido(texto)));
    c.a1af2.p(p, 2, c.v0f7e - c.int(70 * c.v0e2c) + c.a1a0c.g(t, 0));
    c.a1af2.p(p, 3, c.a1a0c.g(t, 0) + c.v0f82 + c.int(70 * c.v0e2c));
  }
}

/** Armadura comprimida do apoio (A_13D0$): estende uma positiva ou cria uma barra nova
 *  (L_4DB54, DESINIT.BAS:3070-3155). */
function comprimidaNosApoios(c: Comum) {
  const s = c.s;
  const extE = qb(c.a1148.g(0) < 0 && c.v0e74 === "S");
  const extD = qb(c.a1148.g(1) < 0 && c.v0e74 === "S");
  const ini = menor(0, maior(c.v0ddc, s(1 - c.v0de0 - c.v0de8 + extE)));
  const fim = maior(c.v0ddc, menor(0, s(c.v0ddc - 1 + c.v0de4 + (c.v0dec - extD))));
  if (ini > fim) return;
  const nT = c.v0ddc;
  for (c.v0e14 = 0; c.v0e14 <= nT; c.v0e14 = s(c.v0e14 + 1)) {
    const k = c.v0e14;
    const texto = c.a13d0[k]!;
    if (qbVal(texto) === 0) continue;
    c.v0e44 = qbVal(depoisDoSustenido(texto));
    c.v0e2c = s(c.v0e44 / 10);
    c.v0e44 = c.areaDaBitola(c.v0e44);
    c.v0e20 = s(c.v0e44 * qbVal(texto));
    c.v0f7e = s(qbCint(c.a1318.g(k, 14, 1) * 100));
    c.v0f82 = s(qbCint(c.a1318.g(k, 14, 2) * 100));
    let estendeu = false;
    const fimP = c.v1866;
    for (c.v0e28 = 1; c.v0e28 <= fimP; c.v0e28 = s(c.v0e28 + 1)) {
      const p = c.v0e28;
      const f8 = c.a1ac4.g(p, 1) * 8;
      if (c.a1ac4.g(p, 3) < c.a1a0c.g(k, 1) - f8 || c.a1ac4.g(p, 2) > f8 + c.a1a0c.g(k + 1, 0))
        continue;
      const hk = c.a19b0.g(k) + c.a1232.g(k, 1);
      const hk1 = c.a19b0.g(k + 1) + c.a1232.g(k + 1, 1);
      if (c.a1ac4.g(p, 3) - c.a1a0c.g(k, 1) > c.a1a0c.g(k, 1) - c.a1ac4.g(p, 2) && hk < hk1)
        continue;
      if (c.a1a0c.g(k + 1, 0) - c.a1ac4.g(p, 2) > c.a1ac4.g(p, 3) - c.a1a0c.g(k + 1, 0) && hk > hk1)
        continue;
      c.v0e44 = c.areaDaBitola(c.a1ac4.g(p, 1));
      if (c.a1ac4.g(p, 0) * c.v0e44 < c.v0e20) continue;
      const ext = c.int((70 / (c.a1ac4.g(p, 0) * c.v0e44)) * c.v0e2c * c.v0e20);
      if (c.a1ac4.g(p, 2) < c.a1a0c.g(k, 1) - f8) {
        c.a1ac4.p(p, 3, maior(c.a1ac4.g(p, 3), s(c.a1a0c.g(k + 1, 0) + c.v0f82 + ext)));
      } else {
        c.a1ac4.p(p, 2, menor(c.a1ac4.g(p, 2), s(c.a1a0c.g(k, 1) - c.v0f7e - ext)));
      }
      estendeu = true;
      break;
    }
    if (estendeu) continue;
    c.v1866 = s(c.v1866 + 1);
    const p = c.v1866;
    c.a1ac4.p(p, 0, qbVal(texto));
    c.a1ac4.p(p, 1, qbVal(depoisDoSustenido(texto)));
    c.a1ac4.p(p, 2, c.a1a0c.g(k, 1) - c.v0f7e - c.int(70 * c.v0e2c));
    if (k === 0) c.a1ac4.p(p, 2, maior(c.a1ac4.g(p, 2), s(c.a1a0c.g(k, 0) + c.v0eaa)));
    c.a1ac4.p(p, 3, c.a1a0c.g(k + 1, 0) + c.v0f82 + c.int(70 * c.v0e2c));
    if (k === c.v0ddc) c.a1ac4.p(p, 3, menor(c.a1ac4.g(p, 3), s(c.a1a0c.g(k + 1, 1) - c.v0eaa)));
  }
}

// ======================================================================= pele

/** Armadura de pele por tramo: As = taxa·bw·hw por face, n = MAX(1, CINT(As/a)) com
 *  espaçamento > 8 cm; pontas a MIN(apoio/2; 20) (L_4E82C, DESINIT.BAS:3156-3272; U18-013). */
function pele(c: Comum) {
  const s = c.s;
  c.v186e = 0;
  const fim = s(c.v0ddc + c.v0de4);
  for (c.v0e14 = s(1 - c.v0de0); c.v0e14 <= fim; c.v0e14 = s(c.v0e14 + 1)) {
    const t = c.v0e14;
    const h = c.a1232.g(t, 1);
    if (h < c.v18ce) continue;
    c.v0e44 = s(c.a1232.g(t, 0) * h * c.v18b6);
    let feito = false;
    for (let i = 0; i <= 4 && !feito; i++) {
      if (!(h <= c.a1d48.g(i) && c.area.g(i) > 0)) continue;
      c.a1c34.p(t, 0, maior(1, qbCint(c.v0e44 / c.area.g(i))));
      c.a1c34.p(t, 1, c.bitola.g(i));
      if ((h - 2 * c.v0ea6) / (c.a1c34.g(t, 0) + 1) > 8) feito = true;
    }
    if (!feito && c.area.g(5) > 0) {
      c.a1c34.p(t, 0, maior(1, qbCint(c.v0e44 / c.area.g(5))));
      c.a1c34.p(t, 1, c.bitola.g(5));
    }
    const pe = menor(s(c.a1926.g(maior(0, t - 1), 0) / 2), 20);
    // INT(A_1A0C(t,0) − (t=0)·c + (t>0)·MIN(apoio/2; 20)) com os booleanos do QB (−1)
    c.a1c34.p(t, 2, c.int(c.a1a0c.g(t, 0) - qb(t === 0) * c.v0eaa + qb(t > 0) * pe));
    const pd = menor(s(c.a1926.g(t, 0) / 2), 20);
    c.a1c34.p(
      t,
      3,
      c.int(qb(c.v0ddc + 1 === t) * c.v0eaa - qb(t <= c.v0ddc) * pd + c.a1a0c.g(t, 1)),
    );
  }
  for (c.v0e14 = s(1 - c.v0de0); c.v0e14 <= fim; c.v0e14 = s(c.v0e14 + 1)) {
    const t = c.v0e14;
    for (let i = 0; i <= 5; i++) {
      if (c.a1c34.g(t, 1) === c.bitola.g(i)) c.a1a96.p(i, c.a1a96.g(i) + 1);
    }
  }
  for (let i = 0; i <= 5; i++) c.v186e = s(c.v186e - qb(c.a1a96.g(i) > 0));
}

// ======================================================================= junções e emendas

/** Junta negativas de mesma bitola que se sobrepõem (comprimento ≤ V_187E) (L_4A292,
 *  DESINIT.BAS:2638-2756; U18-008). */
function juntaNegativas(c: Comum) {
  juntaBarras(
    c,
    c.a1af2,
    () => c.v185e,
    (n) => (c.v185e = n),
    false,
    conflitoNegativas,
  );
}

/** Junta positivas de mesma bitola (L_4B484, DESINIT.BAS:2775-2890). */
function juntaPositivas(c: Comum) {
  juntaBarras(
    c,
    c.a1ac4,
    () => c.v1866,
    (n) => (c.v1866 = n),
    true,
    conflitoPositivas,
  );
}

/** Laço comum de L_4A292 (negativas) e L_4B484 (positivas). Diferenças do original: na
 *  negativa o teste de comprimento vem antes do de barras iguais e a barra de 1 só não
 *  vira a longa (DESINIT.BAS:2655-2690); na positiva o teste de barras iguais vem antes
 *  e não há a restrição (:2783-2830); folga de 100 cm na negativa e 40 na positiva. */
function juntaBarras(
  c: Comum,
  a: Comum["a1af2"],
  n: () => number,
  muda: (n: number) => void,
  positiva: boolean,
  conflito: (c: Comum) => boolean,
) {
  const s = c.s;
  if (n() === 0) return;
  const folga = positiva ? 40 : 100;
  let guarda = 0;
  c.v0e14 = 1;
  for (;;) {
    c.v0e1c = 1;
    for (;;) {
      if (++guarda > 1_000_000) throw new Error("DESINIT: laço sem fim na junção das barras");
      const i = c.v0e14;
      const j = c.v0e1c;
      const longa = maior(a.g(i, 3), a.g(j, 3)) - menor(a.g(i, 2), a.g(j, 2)) > c.v187e;
      const iguais = a.g(i, 3) === a.g(j, 3) && a.g(i, 2) === a.g(j, 2);
      let acao: "avanca" | "junta" | "soma" | "repete" = "avanca";
      const resto = () => {
        if (
          (a.g(i, 3) <= a.g(j, 3) && a.g(i, 2) >= a.g(j, 2)) ||
          (a.g(i, 3) >= a.g(j, 3) && a.g(i, 2) <= a.g(j, 2)) ||
          a.g(j, 2) > a.g(i, 3) + folga ||
          a.g(i, 2) > a.g(j, 3) + folga
        ) {
          return "avanca" as const;
        }
        if (conflito(c)) return "avanca" as const;
        if (a.g(i, 0) === a.g(j, 0)) return "junta" as const;
        // a de menos barras vira a barra longa; a outra perde essas barras
        const m = a.g(i, 0) > a.g(j, 0) ? j : i;
        if (!positiva && a.g(m, 0) === 1) return "avanca" as const;
        if (m === i) a.p(j, 0, a.g(j, 0) - a.g(i, 0));
        else a.p(i, 0, a.g(i, 0) - a.g(j, 0));
        const ini = menor(a.g(i, 2), a.g(j, 2));
        const fim = maior(a.g(i, 3), a.g(j, 3));
        a.p(m, 2, ini);
        a.p(m, 3, fim);
        return "repete" as const;
      };
      if (positiva) {
        if (a.g(i, 1) !== a.g(j, 1) || j === i) acao = "avanca";
        else if (iguais) acao = "soma";
        else if (longa) acao = "avanca";
        else acao = resto();
      } else if (longa || j === i) {
        acao = "avanca";
      } else if (a.g(i, 1) !== a.g(j, 1)) {
        acao = "avanca";
      } else if (iguais) {
        acao = "soma";
      } else {
        acao = resto();
      }
      if (acao === "repete") continue;
      if (acao === "junta" || acao === "soma") {
        const m = menor(i, j);
        if (acao === "soma") a.p(m, 0, a.g(i, 0) + a.g(j, 0));
        const ini = menor(a.g(i, 2), a.g(j, 2));
        const fim = maior(a.g(i, 3), a.g(j, 3));
        a.p(m, 2, ini);
        a.p(m, 3, fim);
        const mx = maior(i, j);
        if (!(mx >= n())) {
          const ultimo = n();
          for (let q = mx + 1; q <= ultimo; q++) a.copiaLinha(q, q - 1);
        }
        muda(s(n() - 1));
        if (c.v0e14 <= n() && c.v0e1c <= n()) continue;
      }
      // L_4AFB7 / L_4C16F
      if (c.v0e14 <= n() && c.v0e1c < n()) {
        c.v0e1c = s(c.v0e1c + 1);
        continue;
      }
      break;
    }
    if (c.v0e14 < n()) {
      c.v0e14 = s(c.v0e14 + 1);
      continue;
    }
    return;
  }
}

/** As duas negativas atravessam juntas um apoio de face superior desnivelada (L_4B060,
 *  DESINIT.BAS:2757-2774). */
function conflitoNegativas(c: Comum) {
  const s = c.s;
  const i = c.v0e14;
  const j = c.v0e1c;
  const a = c.a1af2;
  for (c.v0e28 = 0; ; c.v0e28 = s(c.v0e28 + 1)) {
    const k = c.v0e28;
    const face = c.a1a0c.g(k + 1, 0);
    const antes = face - c.a1926.g(k, 0);
    if (a.g(j, 2) < antes && a.g(j, 3) > face && a.g(i, 3) > face && a.g(i, 2) < antes) return true;
    const cruza =
      (a.g(i, 3) > face && a.g(j, 2) < antes) || (a.g(j, 3) > face && a.g(i, 2) < antes);
    if (cruza && c.a19b0.g(k) !== c.a19b0.g(k + 1)) return true;
    if (!(k < c.v0ddc)) return false;
  }
}

/** As duas positivas não se juntam se uma não chega à outra dentro de um tramo ou se
 *  passam por um apoio com mudança de altura (L_4C218, DESINIT.BAS:2891-2960). */
function conflitoPositivas(c: Comum) {
  const s = c.s;
  const i = c.v0e14;
  const j = c.v0e1c;
  const a = c.a1ac4;
  for (c.v0e28 = 1; ; c.v0e28 = s(c.v0e28 + 1)) {
    const t = c.v0e28;
    const fimMin = menor(a.g(j, 3), a.g(i, 3));
    const iniMax = maior(a.g(j, 2), a.g(i, 2));
    if (Math.abs(a.g(j, 2) - a.g(i, 2)) < fimMin - iniMax) return true;
    const fimMin2 = menor(a.g(j, 3), a.g(i, 3));
    const iniMax2 = maior(a.g(j, 2), a.g(i, 2));
    if (Math.abs(a.g(j, 3) - a.g(i, 3)) < fimMin2 - iniMax2) return true;
    if (
      (a.g(i, 3) < c.a1a0c.g(t, 1) && a.g(j, 2) > c.a1a0c.g(t, 0)) ||
      (a.g(j, 3) < c.a1a0c.g(t, 1) && a.g(i, 2) > c.a1a0c.g(t, 0))
    ) {
      return true;
    }
    if (!(t < c.v0ddc)) break;
  }
  if (c.v0ddc === 1) return false;
  let conflito = false;
  const fim = s(c.v0ddc - 1 + c.v0de4);
  for (c.v0e28 = s(1 - c.v0de0); c.v0e28 <= fim; c.v0e28 = s(c.v0e28 + 1)) {
    const k = c.v0e28;
    if (c.a19b0.g(k) + c.a1232.g(k, 1) === c.a19b0.g(k + 1) + c.a1232.g(k + 1, 1)) continue;
    const iniMin = menor(a.g(i, 2), a.g(j, 2));
    const fimMax = maior(a.g(i, 3), a.g(j, 3));
    if (c.a1a0c.g(k + 1, 0) < fimMax && c.a1a0c.g(k, 1) > iniMin) conflito = true;
  }
  return conflito;
}

/** Emenda das negativas por traspasse (15 cm; folga até 70 cm) (L_4CA62,
 *  DESINIT.BAS:2961-3007; U18-009). */
function emendaNegativas(c: Comum) {
  const s = c.s;
  if (c.v185e === 0) return;
  const fim = c.v185e;
  for (c.v0e14 = 1; c.v0e14 <= fim; c.v0e14 = s(c.v0e14 + 1)) {
    const i = c.v0e14;
    const a = c.a1af2;
    c.v0e28 = 70;
    c.v0e30 = 0;
    if (a.g(i, 0) === 1) continue;
    const fim2 = c.v185e;
    for (c.v0e1c = 1; c.v0e1c <= fim2; c.v0e1c = s(c.v0e1c + 1)) {
      const j = c.v0e1c;
      if (a.g(j, 0) === 1 || a.g(i, 3) >= a.g(j, 3) || i === j) continue;
      if (a.g(i, 3) >= a.g(j, 2)) {
        c.v0e30 = 0;
        break;
      }
      if (
        (a.g(j, 3) - a.g(i, 3) + 15 <= c.v187e || a.g(j, 2) - a.g(i, 2) + 15 <= c.v187e) &&
        a.g(j, 2) - a.g(i, 3) <= c.v0e28
      ) {
        c.v0e28 = s(a.g(j, 2) - a.g(i, 3));
        c.v0e30 = j;
        break;
      }
    }
    if (c.v0e30 === 0) continue;
    const j = c.v0e30;
    const meio = (a.g(j, 2) + a.g(i, 3)) / 2;
    const cabe = qb(meio + (8 - a.g(i, 2)) <= c.v187e);
    if ((qbClng(a.g(j, 3) - 8 - meio) & cabe) !== 0) {
      c.v0e1c = a.g(i, 3);
      a.p(i, 3, (a.g(j, 2) + a.g(i, 3)) / 2 + 8);
      a.p(j, 2, (a.g(j, 2) + c.v0e1c) / 2 - 8);
    } else if (15 - a.g(i, 2) + a.g(j, 2) <= c.v187e) {
      a.p(i, 3, a.g(j, 2) + 15);
    } else {
      a.p(j, 2, a.g(i, 3) - 15);
    }
  }
}

// ======================================================================= dobras e grampos

/** Dobras das positivas nas pontas (tabela A_1C62 limitada a h − 2(c + acréscimo)) e
 *  entrada mínima nos apoios; depois os grampos positivos (L_4333D,
 *  DESINIT.BAS:1990-2091; U18-007). */
function dobrasPositivas(c: Comum, l: Locais, modo: ModoSistrut) {
  const s = c.s;
  const fimP = c.v1866;
  for (c.v0e14 = 1; c.v0e14 <= fimP; c.v0e14 = s(c.v0e14 + 1)) {
    const p = c.v0e14;
    const a = c.a1ac4;
    const d = c.a1b20;
    l.bp0e = qbCint(a.g(p, 1));
    l.bp1c = a.g(p, 1);
    const id = indiceDobra(c, l.bp1c);
    const fimT = s(c.v0ddc + c.v0de4);
    for (c.v0e28 = s(1 - c.v0de0); c.v0e28 <= fimT; c.v0e28 = s(c.v0e28 + 1)) {
      const t = c.v0e28;
      c.v0e20 = qbCint(c.a1232.g(t, 1) - 2 * c.v0ea6);
      c.v0e44 = menor(c.v0e20, c.a1c62.g(id, 2));
      c.v0e20 = menor(c.v0e20, c.a1c62.g(id, 3));
      if (a.g(p, 2) < c.a1a0c.g(t, 0) + c.v0eaa && t === 0) {
        a.p(p, 2, c.a1a0c.g(t, 0) + c.v0eaa);
        d.p(p, 0, c.v0e44);
      }
      if (a.g(p, 3) > c.a1a0c.g(t, 1) - c.v0eaa && c.v0ddc + 1 === t) {
        a.p(p, 3, c.a1a0c.g(t, 1) - c.v0eaa);
        d.p(p, 1, c.v0e44);
      }
      if (c.v0de0 === 0 && t === 1) {
        if (a.g(p, 2) < c.a1a0c.g(t, 0) - c.a1926.g(t - 1, 0) + c.v0eaa) {
          a.p(p, 2, c.a1a0c.g(t, 0) - c.a1926.g(t - 1, 0) + c.v0eaa);
          d.p(p, 0, c.v0e44);
        }
      }
      if (c.v0de4 === 0 && t === c.v0ddc) {
        if (a.g(p, 3) > c.a1926.g(t, 0) - c.v0eaa + c.a1a0c.g(t, 1)) {
          a.p(p, 3, c.a1926.g(t, 0) - c.v0eaa + c.a1a0c.g(t, 1));
          d.p(p, 1, c.v0e44);
        }
      }
      // L_43B72: apoio à esquerda com face superior mais baixa
      if (!(t === 0 || (c.v0de0 === 0 && t === 1))) {
        const hAnt = c.a19b0.g(t - 1) + c.a1232.g(t - 1, 1);
        const hT = c.a19b0.g(t) + c.a1232.g(t, 1);
        if (!(hAnt >= hT)) {
          const fora =
            a.g(p, 2) > c.a1a0c.g(t, 0) ||
            c.a1a0c.g(t - 1, 1) - a.g(p, 2) + 1 >= a.g(p, 3) - c.a1a0c.g(t, 0);
          if (!fora && a.g(p, 2) < c.a1a0c.g(t - 1, 1) + c.v0eaa) {
            a.p(p, 2, maior(s(a.g(p, 2) + l.bp0e), s(c.a1a0c.g(t - 1, 1) + c.v0eaa)));
            d.p(p, 0, c.v0e20);
          }
        }
      }
      // L_43E77: apoio à direita com face superior mais baixa
      if (!(c.v0ddc + 1 === t || (c.v0de4 === 0 && t === c.v0ddc))) {
        const hT = c.a19b0.g(t) + c.a1232.g(t, 1);
        const hSeg = c.a19b0.g(t + 1) + c.a1232.g(t + 1, 1);
        if (!(hT <= hSeg)) {
          const fora =
            a.g(p, 3) - c.a1a0c.g(t + 1, 0) + 1 >= c.a1a0c.g(t, 1) - a.g(p, 2) ||
            a.g(p, 3) < c.a1a0c.g(t, 1);
          if (!fora && a.g(p, 3) > c.a1926.g(t, 0) - c.v0eaa + c.a1a0c.g(t, 1)) {
            a.p(p, 3, menor(s(a.g(p, 3) - l.bp0e), s(c.a1926.g(t, 0) - c.v0eaa + c.a1a0c.g(t, 1))));
            d.p(p, 1, c.v0e20);
          }
        }
      }
      // L_441C6: entrada mínima no apoio à esquerda (V_18D2 diâmetros)
      if (t > 0) {
        const entrada = (a.g(p, 1) * c.v18d2) / 10;
        if (a.g(p, 2) > c.a1a0c.g(t, 0) - entrada && a.g(p, 2) <= c.a1a0c.g(t, 0)) {
          const mesmaAltura =
            c.a19b0.g(t) + c.a1232.g(t, 1) <= c.a19b0.g(t - 1) + c.a1232.g(t - 1, 1) &&
            1 - c.v0de0 < t;
          if (mesmaAltura || c.a1926.g(t - 1, 0) - c.v0eaa >= entrada) {
            a.p(p, 2, c.a1a0c.g(t, 0) - entrada);
          } else {
            a.p(p, 2, c.a1a0c.g(t, 0) - c.a1926.g(t - 1, 0) + c.v0eaa);
            if (d.g(p, 0) === 0) d.p(p, 0, c.v0e20);
          }
        }
      }
      // L_44518: entrada mínima no apoio à direita
      if (c.v0ddc + 1 > t) {
        const entrada = (a.g(p, 1) * c.v18d2) / 10;
        if (a.g(p, 3) < entrada + c.a1a0c.g(t, 1) && a.g(p, 3) >= c.a1a0c.g(t, 1)) {
          const mesmaAltura =
            c.a19b0.g(t) + c.a1232.g(t, 1) <= c.a19b0.g(t + 1) + c.a1232.g(t + 1, 1) &&
            c.v0ddc + c.v0de4 > t;
          if (mesmaAltura || c.a1926.g(t, 0) - c.v0eaa >= entrada) {
            a.p(p, 3, entrada + c.a1a0c.g(t, 1));
          } else {
            a.p(p, 3, c.a1926.g(t, 0) - c.v0eaa + c.a1a0c.g(t, 1));
            if (d.g(p, 1) === 0) d.p(p, 1, c.v0e20);
          }
        }
      }
    }
  }
  grampos(c, l, modo);
}

/** As das positivas que atravessam a face (cm²) e a maior bitola, nos apoios à esquerda
 *  (`lado` 0) ou à direita (1) do tramo V_0E28 (laços de L_448E0). */
function asNaFace(c: Comum, l: Locais, lado: 0 | 1) {
  const s = c.s;
  const t = c.v0e28;
  l.bp12 = 0;
  l.bp0e = 0;
  const fim = c.v1866;
  for (c.v0e18 = 1; c.v0e18 <= fim; c.v0e18 = s(c.v0e18 + 1)) {
    const p = c.v0e18;
    const a = c.a1ac4;
    const face = c.a1a0c.g(t, lado);
    if (a.g(p, 3) <= face || a.g(p, 2) >= face) continue;
    if (lado === 0) {
      if (
        a.g(p, 2) < c.a1a0c.g(t, 0) - c.a1926.g(t - 1, 0) &&
        c.a19b0.g(t - 1) + c.a1232.g(t - 1, 1) < c.a1232.g(t, 1) - 5 + c.a19b0.g(t)
      ) {
        continue;
      }
    } else if (
      a.g(p, 3) > c.a1a0c.g(t, 1) + c.a1926.g(t, 0) &&
      c.a19b0.g(t) + c.a1232.g(t, 1) > c.a19b0.g(t + 1) + c.a1232.g(t + 1, 1) + 5
    ) {
      continue;
    }
    c.v0e20 = a.g(p, 1);
    l.bp12 = somaArea(c, c.v0e20, a.g(p, 0), l.bp12);
    l.bp0e = maior(l.bp0e, a.g(p, 1));
  }
}

/** Grampos nos apoios: área exigida MAX(Vd/(2fyd); As/3; taxa mín./3); ancoragem
 *  lb·MAX(0,33; Anec/Aef) − φ, mínimo MAX(1,35φ; 6) (L_448E0, DESINIT.BAS:2092-2225;
 *  U18-010, U18-011). */
function grampos(c: Comum, l: Locais, modo: ModoSistrut) {
  const s = c.s;
  c.v1876 = 0;
  if (c.v1916 === "N" && c.v1912 === "N") return;
  const nT = c.v0ddc;
  const exigida = (v: number, t: number) =>
    maior(
      s((v / (2 * c.v0ec6 * c.v0ebe)) * c.v0fa6 * c.v0f62 * c.v0f66),
      maior(
        s(c.a128e.g(t, 6) / 3),
        s(((c.a1232.g(t, 1) - c.v0ea6) * c.a1232.g(t, 0) * c.v18a2) / 3),
      ),
    );
  const ancoragemGrampo = () => {
    if (l.bp12 === 0) throw new ErroQB(11, "Division by zero");
    const r = maior(c.k(0.33), s(c.v0e44 / l.bp12));
    l.bp16 = s(lbBase(c, l.bp0e) * r - l.bp0e);
    l.bp16 = maior(l.bp16, maior(s(l.bp0e * c.k(1.35)), 6));
  };
  for (c.v0e28 = 1; c.v0e28 <= nT; c.v0e28 = s(c.v0e28 + 1)) {
    const t = c.v0e28;
    // apoio à esquerda do tramo
    c.v0e44 = exigida(c.a1796.g(t, 0), t);
    asNaFace(c, l, 0);
    if (!(l.bp0e <= c.bitola.g(3))) {
      if (l.bp12 < c.v0e44) grampoPositivoEsquerda(c, l);
      ancoragemGrampo();
      const apoio = c.a1926.g(t - 1, 0) - c.v0eaa;
      if (l.bp16 + l.bp0e <= apoio && c.v1916 === "S") reduzPositivasEsquerda(c, l);
      if (c.v1912 === "S" && (apoio < l.bp16 || l.bp12 < c.v0e44)) {
        const desce =
          (c.v0de0 === 1 && t === 1) || t > 1
            ? c.a19b0.g(t - 1) + c.a1232.g(t - 1, 1) >= c.a1232.g(t, 1) - 5 + c.a19b0.g(t)
            : false;
        if (!desce) novoGrampoPositivo(c, l, 0);
      }
    }
    // apoio à direita do tramo
    c.v0e44 = exigida(c.a1796.g(t, 1), t);
    asNaFace(c, l, 1);
    if (l.bp0e <= c.bitola.g(3)) continue;
    if (l.bp12 < c.v0e44) grampoPositivoDireita(c, l, modo);
    ancoragemGrampo();
    const apoio = c.a1926.g(t, 0) - c.v0eaa;
    if (l.bp16 + l.bp0e <= apoio && c.v1916 === "S") reduzPositivasDireita(c, l);
    if (c.v1912 === "S" && (apoio < l.bp16 || l.bp12 < c.v0e44)) {
      const desce =
        (c.v0de4 === 1 && t === c.v0ddc) || t < c.v0ddc
          ? c.a19b0.g(t) + c.a1232.g(t, 1) <= c.a19b0.g(t + 1) + c.a1232.g(t + 1, 1) + 5
          : false;
      if (!desce) novoGrampoPositivo(c, l, 1);
    }
  }
}

/** Leva positivas até o apoio à esquerda, com dobra, até cobrir a área exigida
 *  (L_45B0C, DESINIT.BAS:2226-2261). */
function grampoPositivoEsquerda(c: Comum, l: Locais) {
  const s = c.s;
  const fim = c.v1866;
  for (c.v0e18 = 1; c.v0e18 <= fim; c.v0e18 = s(c.v0e18 + 1)) {
    if (corpoGrampoEsquerda(c, l)) return;
  }
}

/** Corpo do laço de L_45B0C para a barra V_0E18; true quando a área já basta. */
function corpoGrampoEsquerda(c: Comum, l: Locais) {
  const t = c.v0e28;
  const p = c.v0e18;
  const a = c.a1ac4;
  const umTerco = c.a128e.g(t, 6) / 3 <= l.bp12;
  if (
    a.g(p, 2) >= c.a1a0c.g(t, 1) ||
    a.g(p, 2) < c.a1a0c.g(t, 0) ||
    (umTerco && a.g(p, 2) - c.a1a0c.g(t, 0) > l.bp0e * 6)
  ) {
    return false;
  }
  const inicioApoio = c.s(c.a1a0c.g(t, 0) - c.a1926.g(t - 1, 0) + c.v0eaa);
  if (a.g(p, 3) - inicioApoio + c.a1b20.g(p, 0) + c.a1b20.g(p, 1) > c.v187e && umTerco)
    return false;
  a.p(p, 2, inicioApoio);
  c.v0e20 = c.int(c.a1232.g(t, 1) - 2 * c.v0eaa);
  l.bp1c = a.g(p, 1);
  c.v0e20 = menor(c.v0e20, c.a1c62.g(indiceDobra(c, l.bp1c), qb(t === 1) + 3));
  if (c.a128e.g(t, 6) / 3 <= l.bp12) {
    c.a1b20.p(p, 0, c.v0e20);
  } else {
    a.p(p, 2, maior(inicioApoio, c.s(c.a1a0c.g(t, 0) - qbCint((a.g(p, 1) * c.v18d2) / 10))));
  }
  c.v0e20 = a.g(p, 1);
  l.bp12 = somaArea(c, c.v0e20, a.g(p, 0), l.bp12);
  return l.bp12 >= c.v0e44;
}

/** Reduz a entrada das positivas no apoio à esquerda (L_4634E, DESINIT.BAS:2262-2281). */
function reduzPositivasEsquerda(c: Comum, l: Locais) {
  const s = c.s;
  l.bp1f4 = c.v1866;
  for (c.v0e18 = 1; c.v0e18 <= l.bp1f4; c.v0e18 = s(c.v0e18 + 1)) corpoReduzEsquerda(c, l);
}

/** Corpo do laço de L_4634E para a barra V_0E18. */
function corpoReduzEsquerda(c: Comum, l: Locais) {
  const t = c.v0e28;
  const p = c.v0e18;
  const a = c.a1ac4;
  if (a.g(p, 2) >= c.a1a0c.g(t, 0) || a.g(p, 2) < c.a1a0c.g(t, 0) - c.a1926.g(t - 1, 0)) return;
  const entrada = maior(c.s(l.bp16 + l.bp0e), c.s((a.g(p, 1) * c.v18d2) / 10));
  a.p(p, 2, maior(a.g(p, 2), c.s(c.a1a0c.g(t, 0) - c.int(entrada))));
  c.a1b20.p(p, 0, 0);
}

/** Leva positivas até o apoio à direita (L_46AD0, DESINIT.BAS:2308-2343). DEFEITO R11
 *  (U18-015, 0x46D2B): no ramo "barra longa demais" o original salta para o NEXT do
 *  laço de L_4634E (DESINIT.BAS:2320, GOTO L_4656F): segue com o corpo de L_4634E nas
 *  barras seguintes, até o limite que esse laço guardou (L_BP1F4), e volta. O modo
 *  corrigido passa para a barra seguinte deste laço, como o lado esquerdo (L_45C64). */
function grampoPositivoDireita(c: Comum, l: Locais, modo: ModoSistrut) {
  const s = c.s;
  const fim = c.v1866;
  for (c.v0e18 = 1; c.v0e18 <= fim; c.v0e18 = s(c.v0e18 + 1)) {
    const t = c.v0e28;
    const p = c.v0e18;
    const a = c.a1ac4;
    const umTerco = c.a128e.g(t, 6) / 3 <= l.bp12;
    if (
      a.g(p, 3) <= c.a1a0c.g(t, 0) ||
      a.g(p, 3) > c.a1a0c.g(t, 1) ||
      (umTerco && c.a1a0c.g(t, 1) - a.g(p, 3) > l.bp0e * 6)
    ) {
      continue;
    }
    const fimApoio = c.s(c.a1926.g(t, 0) - c.v0eaa + c.a1a0c.g(t, 1));
    if (fimApoio - a.g(p, 2) + c.a1b20.g(p, 0) + c.a1b20.g(p, 1) > c.v187e && umTerco) {
      if (modo === "corrigido") continue;
      // R11: GOTO L_4656F (NEXT V_0E18 de L_4634E) e RETURN no fim daquele laço
      for (c.v0e18 = s(c.v0e18 + 1); c.v0e18 <= l.bp1f4; c.v0e18 = s(c.v0e18 + 1)) {
        corpoReduzEsquerda(c, l);
      }
      return;
    }
    a.p(p, 3, fimApoio);
    c.v0e20 = c.int(c.a1232.g(t, 1) - 2 * c.v0eaa);
    l.bp1c = a.g(p, 1);
    c.v0e20 = menor(c.v0e20, c.a1c62.g(indiceDobra(c, l.bp1c), qb(t === c.v0ddc) + 3));
    if (c.a128e.g(t, 6) / 3 <= l.bp12) {
      c.a1b20.p(p, 1, c.v0e20);
    } else {
      a.p(p, 3, menor(fimApoio, s(qbCint((a.g(p, 1) * c.v18d2) / 10) + c.a1a0c.g(t, 1))));
    }
    c.v0e20 = a.g(p, 1);
    l.bp12 = somaArea(c, c.v0e20, a.g(p, 0), l.bp12);
    if (l.bp12 >= c.v0e44) return;
  }
}

/** Reduz a entrada das positivas no apoio à direita (L_4730F, DESINIT.BAS:2344-2363). */
function reduzPositivasDireita(c: Comum, l: Locais) {
  const s = c.s;
  const fim = c.v1866;
  for (c.v0e18 = 1; c.v0e18 <= fim; c.v0e18 = s(c.v0e18 + 1)) {
    const t = c.v0e28;
    const p = c.v0e18;
    const a = c.a1ac4;
    if (a.g(p, 3) <= c.a1a0c.g(t, 1) || a.g(p, 3) > c.a1a0c.g(t, 1) + c.a1926.g(t, 0)) continue;
    const entrada = maior(s(l.bp16 + l.bp0e), s((a.g(p, 1) * c.v18d2) / 10));
    a.p(p, 3, menor(a.g(p, 3), s(c.int(entrada) + c.a1a0c.g(t, 1))));
    c.a1b20.p(p, 1, 0);
  }
}

/** Grampo novo no apoio à esquerda (lado 0, L_465AF) ou à direita (lado 1, L_4757C):
 *  bitola 5/6,3/8 pela bitola das barras, quantidade pela área que falta, 7,5 φ
 *  (DESINIT.BAS:2282-2307, 2364-2389). */
function novoGrampoPositivo(c: Comum, l: Locais, lado: 0 | 1) {
  novoGrampo(c, l, c.a1baa, () => (c.v1876 = c.s(c.v1876 + 1)), lado, 7.5);
}

/** Grampo novo (positivo: 7,5 φ em A_1BAA; negativo: 12 φ em A_1BD8). */
function novoGrampo(
  c: Comum,
  l: Locais,
  g: Comum["a1baa"],
  proximo: () => number,
  lado: 0 | 1,
  diametros: number,
) {
  const s = c.s;
  const t = c.v0e28;
  const i = proximo();
  g.p(
    i,
    1,
    -qb(l.bp0e <= c.bitola.g(4)) * c.bitola.g(1) -
      qb(l.bp0e > c.bitola.g(4) && l.bp0e <= c.bitola.g(6)) * c.bitola.g(2) -
      qb(l.bp0e > c.bitola.g(6)) * c.bitola.g(3),
  );
  if (c.area.g(1) === 0 && g.g(i, 1) === c.bitola.g(1)) g.p(i, 1, c.bitola.g(2));
  if (c.area.g(2) === 0 && g.g(i, 1) === c.bitola.g(2)) g.p(i, 1, c.bitola.g(3));
  c.v0e20 = g.g(i, 1);
  c.v0e20 = s(
    -qb(c.v0e20 === c.bitola.g(1)) * c.area.g(1) -
      qb(c.v0e20 === c.bitola.g(2)) * c.area.g(2) -
      qb(c.v0e20 === c.bitola.g(3)) * c.area.g(3),
  );
  if (c.v0e20 === 0) throw new ErroQB(11, "Division by zero (área do grampo 0)");
  l.bp16 = s(
    (l.bp0e / (((c.v0ec6 * c.v0eba * 1000) / c.v0f5e) ** c.k(2 / 3) * 40 * c.v0f66 * c.k(0.9))) *
      c.v0ec6 *
      c.v0ebe *
      1000,
  );
  const apoio = lado === 0 ? c.a1926.g(t - 1, 0) : c.a1926.g(t, 0);
  const q = s(((l.bp16 / (apoio - c.v0eaa + l.bp0e)) * c.v0e44 - l.bp12) / (c.v0e20 * 2));
  g.p(i, 0, c.int(maior(1, q)));
  const comp = qbCint(g.g(i, 1) * diametros);
  if (lado === 0) {
    g.p(i, 2, c.a1a0c.g(t, 0) - c.a1926.g(t - 1, 0) + c.v0eaa);
    g.p(i, 3, menor(s(comp + c.a1a0c.g(t, 0)), s(c.a1a0c.g(t, 1) - c.v0eaa)));
    g.p(i, 4, 0);
  } else {
    g.p(i, 3, c.a1926.g(t, 0) - c.v0eaa + c.a1a0c.g(t, 1));
    g.p(i, 2, maior(s(c.a1a0c.g(t, 1) - comp), s(c.a1a0c.g(t, 0) + c.v0eaa)));
    g.p(i, 4, 1);
  }
  g.p(i, 5, c.int(c.a1232.g(t, 0) - 2 * c.v0eaa - c.v0ece / 5));
}

/** Dobras das negativas nas pontas e nos apoios com desnível; depois os grampos
 *  negativos (L_47A97, DESINIT.BAS:2390-2486). */
function dobrasNegativas(c: Comum, l: Locais) {
  const s = c.s;
  if (c.v185e === 0) return;
  const fimP = c.v185e;
  for (c.v0e14 = 1; c.v0e14 <= fimP; c.v0e14 = s(c.v0e14 + 1)) {
    const p = c.v0e14;
    const a = c.a1af2;
    const d = c.a1b4e;
    l.bp0e = qbCint(a.g(p, 1));
    l.bp1c = a.g(p, 1);
    const id = indiceDobra(c, l.bp1c);
    const fimT = s(c.v0ddc + c.v0de4);
    for (c.v0e28 = s(1 - c.v0de0); c.v0e28 <= fimT; c.v0e28 = s(c.v0e28 + 1)) {
      const t = c.v0e28;
      c.v0e20 = qbCint(c.a1232.g(t, 1) - 2 * c.v0ea6);
      c.v0e44 = menor(c.v0e20, c.a1c62.g(id, 0));
      c.v0e20 = menor(c.v0e20, c.a1c62.g(id, 1));
      if (a.g(p, 2) <= c.a1a0c.g(t, 0) + c.v0eaa && t === 0) {
        a.p(p, 2, c.a1a0c.g(t, 0) + c.v0eaa);
        d.p(p, 0, c.v0e44);
      }
      if (a.g(p, 3) >= c.a1a0c.g(t, 1) - c.v0eaa && c.v0ddc + 1 === t) {
        a.p(p, 3, c.a1a0c.g(t, 1) - c.v0eaa);
        d.p(p, 1, c.v0e44);
      }
      if (c.v0de0 === 0 && t === 1) {
        const lim = c.a1a0c.g(t, 0) - c.a1926.g(t - 1, 0) + c.v0eaa;
        if (a.g(p, 2) < lim) {
          a.p(p, 2, maior(s(a.g(p, 2) + l.bp0e), s(lim)));
          const semMomento = (c.v0e74 === "N" || c.a1148.g(0) >= 0) && c.v0de8 === 0;
          d.p(p, 0, semMomento ? c.v0e20 : c.v0e44);
        }
      }
      if (c.v0de4 === 0 && t === c.v0ddc) {
        const lim = c.a1926.g(t, 0) - c.v0eaa + c.a1a0c.g(t, 1);
        if (a.g(p, 3) > lim) {
          a.p(p, 3, menor(s(a.g(p, 3) - l.bp0e), s(lim)));
          const semMomento = (c.v0e74 === "N" || c.a1148.g(1) >= 0) && c.v0dec === 0;
          d.p(p, 1, semMomento ? c.v0e20 : c.v0e44);
        }
      }
      // L_484D8: apoio à esquerda com face superior mais alta (desnível)
      if (!(t === 0 || (c.v0de0 === 0 && t === 1))) {
        if (!(c.a19b0.g(t - 1) <= c.a19b0.g(t))) {
          if (!(a.g(p, 2) > c.a1a0c.g(t, 0) || a.g(p, 2) < c.a1a0c.g(t - 1, 1))) {
            a.p(p, 2, c.a1a0c.g(t - 1, 1) + c.v0eaa);
            if (c.a1982.g(t - 1, 0) === 1 && c.a1954[t - 1]!.slice(0, 1) === "P") {
              a.p(p, 2, a.g(p, 2) + c.a1982.g(t - 1, 2));
            }
            d.p(p, 0, c.v0e20);
          }
        }
      }
      // L_48791: apoio à direita
      if (!(c.v0ddc + 1 === t || (c.v0de4 === 0 && t === c.v0ddc))) {
        if (!(c.a19b0.g(t) >= c.a19b0.g(t + 1))) {
          if (!(a.g(p, 3) > c.a1a0c.g(t + 1, 0) || a.g(p, 3) < c.a1a0c.g(t, 1))) {
            a.p(p, 3, c.a1926.g(t, 0) - c.v0eaa + c.a1a0c.g(t, 1));
            if (c.a1982.g(t, 0) === 1 && c.a1954[t]!.slice(0, 1) === "P") {
              a.p(p, 3, a.g(p, 3) - (c.a1926.g(t, 0) - c.a1982.g(t, 1) - c.a1982.g(t, 2)));
            }
            d.p(p, 1, c.v0e20);
          }
        }
      }
    }
  }
  gramposNegativos(c, l);
}

/** Grampos negativos nos apoios com desnível (L_48B27, DESINIT.BAS:2487-2637). */
function gramposNegativos(c: Comum, l: Locais) {
  const s = c.s;
  c.v1872 = 0;
  if (c.v1912 === "N") return;
  const fimT = s(c.v0ddc + c.v0de4);
  const ancora = () => {
    if (l.bp12 === 0) throw new ErroQB(11, "Division by zero");
    const r = maior(c.k(0.33), s(c.v0e44 / l.bp12));
    l.bp16 = s(lbBase(c, l.bp0e) * r * 1.5 - l.bp0e);
    l.bp16 = maior(l.bp16, maior(s(l.bp0e * c.k(1.35)), 6));
  };
  for (c.v0e28 = s(1 - c.v0de0); c.v0e28 <= fimT; c.v0e28 = s(c.v0e28 + 1)) {
    const t = c.v0e28;
    c.v0e44 = s((c.a1232.g(t, 1) - c.v0ea6) * c.a1232.g(t, 0) * c.v18b2);
    if (!(t === 0) && !(c.a19b0.g(t) >= c.a19b0.g(t - 1))) {
      somaNegativasNaFace(c, l, 0);
      ancora();
      if (c.a1926.g(t - 1, 0) - c.v0eaa < l.bp16 || l.bp12 < c.v0e44) {
        novoGrampo(c, l, c.a1bd8, () => (c.v1872 = s(c.v1872 + 1)), 0, 12);
      }
    }
    if (c.v0ddc + 1 === t) continue;
    if (c.a19b0.g(t) >= c.a19b0.g(t + 1)) continue;
    somaNegativasNaFace(c, l, 1);
    ancora();
    if (c.a1926.g(t, 0) - c.v0eaa < l.bp16 || l.bp12 < c.v0e44) {
      novoGrampo(c, l, c.a1bd8, () => (c.v1872 = s(c.v1872 + 1)), 1, 12);
    }
  }
}

/** As das negativas que atravessam a face do tramo V_0E28 (laços de L_48B27). */
function somaNegativasNaFace(c: Comum, l: Locais, lado: 0 | 1) {
  const s = c.s;
  const t = c.v0e28;
  l.bp12 = 0;
  l.bp0e = 0;
  const fim = c.v185e;
  for (c.v0e18 = 1; c.v0e18 <= fim; c.v0e18 = s(c.v0e18 + 1)) {
    const p = c.v0e18;
    const a = c.a1af2;
    const face = c.a1a0c.g(t, lado);
    if (a.g(p, 3) <= face || a.g(p, 2) >= face) continue;
    if (lado === 0) {
      if (a.g(p, 2) < c.a1a0c.g(t, 0) - c.a1926.g(t - 1, 0) && c.a19b0.g(t - 1) > c.a19b0.g(t))
        continue;
    } else if (a.g(p, 3) > c.a1a0c.g(t, 1) + c.a1926.g(t, 0) && c.a19b0.g(t) > c.a19b0.g(t + 1)) {
      continue;
    }
    c.v0e20 = a.g(p, 1);
    l.bp12 = somaArea(c, c.v0e20, a.g(p, 0), l.bp12);
    l.bp0e = maior(l.bp0e, a.g(p, 1));
  }
}

// ======================================================================= estribos e porta-estribos

/** Trechos de estribos por tramo: zona esquerda, central (bitola e s mínimos) e direita;
 *  numera as posições iguais (S_343BE, DESINIT.BAS:1417-1566; U07-029, U17-D). */
export function estribos(c: Comum) {
  const s = c.s;
  c.v186a = 0;
  const ramos = (bw: number) => (bw > c.v0f3e ? (bw > c.v0f42 ? 3 : 2) : 1);
  const novo = (t: number, bitola: number, esp: number) => {
    c.v186a = s(c.v186a + 1);
    const r = c.v186a;
    c.a1c06.p(r, 5, c.int(c.a1232.g(t, 0)) + c.a1232.g(t, 1) * c.k(0.0001));
    c.a1c06.p(r, 2, bitola);
    c.a1c06.p(r, 3, esp);
    c.a1c06.p(r, 4, ramos(c.a1232.g(t, 0)));
    return r;
  };
  const fimT = s(c.v0ddc + c.v0de4);
  for (c.v0e14 = s(1 - c.v0de0); c.v0e14 <= fimT; c.v0e14 = s(c.v0e14 + 1)) {
    const t = c.v0e14;
    const e = c.a1374;
    if (!(e.g(t, 1) * 100 <= c.a19de.g(t) || t === 0 || e.g(t, 1) === 0)) {
      const r = novo(t, e.g(t, 0), e.g(t, 2));
      c.a1c06.p(r, 0, c.a1a0c.g(t, 0));
      const l16 = maior(c.v18ee, s(e.g(t, 1) * 100 - c.a19de.g(t)));
      const l22 = maior(1, e.g(t, 2));
      c.a1c06.p(
        r,
        1,
        menor(s(c.int(qbCint(l16 / l22) * e.g(t, 2)) + c.a1a0c.g(t, 0)), c.a1a0c.g(t, 1)),
      );
    }
    if (!(e.g(t, 1) === e.g(t, 4))) {
      const r = novo(t, e.g(t, 3), e.g(t, 5));
      c.a1c06.p(r, 0, maior(c.a1c06.g(r - 1, 1), c.a1a0c.g(t, 0)));
      if (
        !(e.g(t, 4) * 100 >= c.a19de.g(t) + c.a1926.g(t, 1) || e.g(t, 4) >= c.a1006.g(t) * c.v0fa2)
      ) {
        const l46 = menor(s(c.a1926.g(t, 1) - c.v18ee), s(e.g(t, 4) * 100));
        const l52 = maior(1, e.g(t, 7));
        c.a1c06.p(
          r,
          1,
          c.a1926.g(t, 1) -
            c.int(qbCint((c.a1926.g(t, 1) - l46 + c.a19de.g(t)) / l52) * e.g(t, 7)) +
            c.a1a0c.g(t, 0),
        );
      } else {
        c.a1c06.p(r, 1, c.a1a0c.g(t, 1));
      }
      if (c.a1c06.g(r, 0) >= c.a1c06.g(r, 1)) c.v186a = s(c.v186a - 1);
    }
    if (
      !(e.g(t, 4) * 100 >= c.a19de.g(t) + c.a1926.g(t, 1) || e.g(t, 4) === c.a1006.g(t) * c.v0fa2)
    ) {
      const r = novo(t, e.g(t, 6), e.g(t, 7));
      c.a1c06.p(r, 0, maior(c.a1c06.g(r - 1, 1), c.a1a0c.g(t, 0)));
      c.a1c06.p(r, 1, c.a1a0c.g(t, 1));
    }
  }
  // numeração: trechos com mesmos ramos, bitola e seção recebem o mesmo número
  // Sem trecho nenhum o original segue até estourar a matriz (erro 9), como aqui.
  c.v0e28 = 1;
  c.v0e20 = 0;
  for (;;) {
    c.v0e20 = s(c.v0e20 + 1);
    c.a1c06.p(c.v0e28, 6, c.v0e20);
    if (!(c.v0e28 + 1 > c.v186a)) {
      const fim = c.v186a;
      for (c.v0e14 = s(c.v0e28 + 1); c.v0e14 <= fim; c.v0e14 = s(c.v0e14 + 1)) {
        const a = c.a1c06;
        const r = c.v0e28;
        const q = c.v0e14;
        if (a.g(r, 4) === a.g(q, 4) && a.g(r, 2) === a.g(q, 2) && a.g(r, 5) === a.g(q, 5)) {
          a.p(q, 6, a.g(r, 6));
        }
      }
    }
    for (;;) {
      if (c.v0e28 === c.v186a) return;
      c.v0e28 = s(c.v0e28 + 1);
      if (!(c.a1c06.g(c.v0e28, 6) > 0)) break;
    }
  }
}

/** Porta-estribos onde as negativas não seguram os estribos: 2/4/6 barras de bitola
 *  MAX(estribo; ordem mínima), pontas + traspasse (S_338ED, DESINIT.BAS:1300-1416;
 *  U17-D-03..06). */
export function portaEstribos(c: Comum) {
  const s = c.s;
  c.v1862 = 0;
  if (c.v190a === "N") return;
  const nT = c.v0ddc;
  for (c.v0e14 = 1; c.v0e14 <= nT; c.v0e14 = s(c.v0e14 + 1)) {
    const t = c.v0e14;
    const bw = c.a1232.g(t, 0);
    c.v0e24 = bw > c.v0f3e ? (bw > c.v0f42 ? 6 : 4) : 2;
    c.v0e28 = c.a1a0c.g(t, 0);
    c.v0e18 = c.a1a0c.g(t, 1);
    if (!(c.v185e === 0)) {
      let guarda = 0;
      for (;;) {
        if (++guarda > 100000) throw new Error("DESINIT: laço sem fim nos porta-estribos");
        c.v0e30 = c.v0e28;
        c.v0e34 = c.v0e18;
        let somaE = 0;
        let somaD = 0;
        let l12 = c.a1a0c.g(t, 1);
        let l16 = c.a1a0c.g(t, 0);
        const fim = c.v185e;
        for (c.v0e1c = 1; c.v0e1c <= fim; c.v0e1c = s(c.v0e1c + 1)) {
          const p = c.v0e1c;
          const a = c.a1af2;
          if (a.g(p, 3) > c.v0e28 && a.g(p, 2) <= c.v0e28) {
            somaE = qbCint(somaE + a.g(p, 0));
            l12 = menor(l12, a.g(p, 3));
            if (somaE >= c.v0e24) {
              c.v0e28 = l12;
              somaE = 0;
              l12 = c.a1a0c.g(t, 1);
            }
          }
          if (a.g(p, 3) >= c.v0e18 && a.g(p, 2) < c.v0e18) {
            somaD = qbCint(somaD + a.g(p, 0));
            l16 = maior(l16, a.g(p, 2));
            if (somaD >= c.v0e24) {
              c.v0e18 = l16;
              somaD = 0;
              l16 = c.a1a0c.g(t, 0);
            }
          }
          if (c.v0e18 <= c.v0e28) break;
        }
        if (!(c.v0e18 !== c.v0e34 || c.v0e28 !== c.v0e30)) break;
      }
    }
    if (c.v0e18 <= c.v0e28) continue;
    c.v1862 = s(c.v1862 + 1);
    const r = c.v1862;
    const b = c.a1b7c;
    b.p(r, 0, c.v0e24);
    const minima =
      c.v18da >= 0 && c.v18da <= 6 && qbCint(c.v18da) === c.v18da ? c.bitola.g(c.v18da) : 0;
    b.p(r, 1, maior(c.v0ece, minima));
    const trasp =
      -qb(c.v18de < 100) * c.v18de - (qb(c.v18de > 100) * ((c.v18de - 100) * b.g(r, 1))) / 10;
    b.p(r, 2, c.int(c.v0e28 - trasp));
    if (c.a1a0c.g(t, 0) === c.v0e28) {
      b.p(r, 2, maior(b.g(r, 2), s(c.v0e28 - c.a1926.g(t - 1, 0) + c.v0eaa)));
    }
    b.p(r, 3, c.int(trasp + c.v0e18));
    if (c.a1a0c.g(t, 1) === c.v0e18) {
      b.p(r, 3, menor(b.g(r, 3), s(c.a1926.g(t, 0) - c.v0eaa + c.v0e18)));
    }
  }
}

/** Só os grampos positivos (L_448E0) sobre as positivas já gravadas em A_1AC4; para testar
 *  o ramo do defeito R11 isolado. */
export function gramposPositivos(c: Comum, modo: ModoSistrut) {
  grampos(c, { bp0e: 0, bp12: 0, bp16: 0, bp1c: 0, bp1f4: 0 }, modo);
}

/** DESINI2 (S_40132): negativas, positivas, comprimidas, pele, junções, emendas, dobras e
 *  grampos, na ordem do original (DESINIT.BAS:1630-1641). */
export function detalhaLongitudinal(c: Comum, modo: ModoSistrut) {
  const l: Locais = { bp0e: 0, bp12: 0, bp16: 0, bp1c: 0, bp1f4: 0 };
  negativas(c, l);
  positivas(c, l);
  comprimidaNosTramos(c);
  comprimidaNosApoios(c);
  pele(c);
  juntaNegativas(c);
  juntaPositivas(c);
  emendaNegativas(c);
  dobrasPositivas(c, l, modo);
  dobrasNegativas(c, l);
  if (c.v185e > 60 || c.v1866 > 60) throw new ErroQB(9, "Subscript out of range");
}

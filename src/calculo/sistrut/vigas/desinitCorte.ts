// Corte das barras sobre o diagrama de 21 pontos e zonas de estribos: porte do módulo
// DESAUXDI do DESDIM (S_4035E, DESDIM.BAS:4978-5753), que grava no COMMON os grupos de
// barras positivas (A_12EA), negativas (A_1318) e os limites das zonas de estribo
// (A_1374) que o DESINIT detalha. Especificação: livros_arm_forma_des.md 4.3 (U04-007..013).
//
// Porte linha a linha: os nomes são os endereços do original (ver `desinitComum.ts`) e
// cada rotina leva o rótulo do .BAS. Abscissas do corte em m, a partir do apoio
// esquerdo do tramo.
import { ErroQB } from "../base/f32";
import { type Comum, qb } from "./desinitComum";

/** Menor e maior do MIXT (MIXT_0877_Menor, MIXT_082A_Maior): o segundo vence no empate. */
const menor = (a: number, b: number) => (a < b ? a : b);
const maior = (a: number, b: number) => (a > b ? a : b);

/** Divisão inteira de CLNG por CLNG (RT_IDIVL&), que dá erro 11 com divisor 0. */
function divInteira(a: number, b: number) {
  const bi = Math.round(b);
  if (bi === 0) throw new ErroQB(11, "Division by zero");
  return Math.trunc(Math.round(a) / bi);
}

/** Primeiro e último apoio com negativo dimensionado (DESDIM.BAS:5271-5288): apoios
 *  internos, mais os extremos com balanço, engaste ou momento externo negativo. */
export function apoiosComNegativo(c: Comum) {
  const extE = qb(c.a1148.g(0) < 0 && c.v0e74 === "S");
  const extD = qb(c.a1148.g(1) < 0 && c.v0e74 === "S");
  const ini = maior(0, menor(c.v0ddc, c.s(1 - c.v0de0 - c.v0de8 + extE)));
  const fim = menor(c.v0ddc, maior(0, c.s(c.v0ddc - 1 + c.v0de4 + (c.v0dec - extD))));
  return { ini, fim };
}

/** −M(x) no tramo V_0E14 com o M do apoio esquerdo e o Ve do início do tramo (A_17C4) e
 *  as cargas do tramo; no balanço esquerdo, só as cargas. Grava V_1886 (S_2303D,
 *  DESDIM.BAS:4410-4456). */
export function momentoNoTramo(c: Comum) {
  const s = c.s;
  const t = c.v0e14;
  const x = c.v0e30;
  if (!(t > 0)) {
    c.v1886 = 0;
    if (c.a0faa.g(0) === 0) return;
    const fim = c.a0faa.g(0);
    for (c.v0e48 = 1; c.v0e48 <= fim; c.v0e48 = s(c.v0e48 + 1)) {
      const i = c.v0e48;
      const l0 = s(c.a0faa.g(0) === i ? 0 : c.a10be.g(i + 1));
      const d = c.a10be.g(i);
      const p = c.a1062.g(i);
      const f = c.a10ec.g(i);
      const lb = c.a1006.g(0);
      if (lb - l0 < x) {
        c.v1886 = s(((d - (lb - x)) ** 2 * p) / 2 + c.v1886 + (d - (lb - x)) * f);
        return;
      }
      c.v1886 = s(
        ((d - l0) ** 2 * p) / 2 + c.v1886 + (d - (lb - x)) * f + (d - l0) * p * (l0 - (lb - x)),
      );
    }
    return;
  }
  c.v1886 = s(-(c.a17c4.g(t, 0) * x) - c.a17c4.g(t, 1));
  let l0 = 0;
  const fim = c.a0fd8.g(t);
  for (c.v0e48 = s(1 + (c.a0fd8.g(t) - c.a0faa.g(t))); c.v0e48 <= fim; c.v0e48 = s(c.v0e48 + 1)) {
    const i = c.v0e48;
    const d = c.a10be.g(i);
    const p = c.a1062.g(i);
    if (d > x) {
      c.v1886 = s(((x - l0) ** 2 * p) / 2 + c.v1886);
      return;
    }
    c.v1886 = s(((d - l0) ** 2 * p) / 2 + c.v1886 + ((d - l0) * p + c.a10ec.g(i)) * (x - d));
    l0 = d;
  }
}

/** −M(x) mínimo (o pior negativo) no tramo V_0E14: pela esquerda (Ve e M do apoio
 *  esquerdo) e pela direita (Vd e M do apoio direito), e pela envoltória das
 *  acidentais se V_0E70 = "S". Grava V_1882 (S_22581, DESDIM.BAS:4324-4409). */
export function momentoNegativoNoTramo(c: Comum) {
  const s = c.s;
  const t = c.v0e14;
  const x = c.v0e30;
  if (!(t > 0)) {
    c.v1882 = 0;
    if (c.a0faa.g(0) === 0) return;
    const fim = c.a0faa.g(0);
    for (c.v0e48 = 1; c.v0e48 <= fim; c.v0e48 = s(c.v0e48 + 1)) {
      const i = c.v0e48;
      const l0 = s(c.a0faa.g(0) === i ? 0 : c.a10be.g(i + 1));
      const d = c.a10be.g(i);
      const p = c.a1062.g(i);
      const f = c.a10ec.g(i);
      const lb = c.a1006.g(0);
      if (lb - l0 < x) {
        c.v1882 = s(((d - (lb - x)) ** 2 * p) / 2 + c.v1882 + (d - (lb - x)) * f);
        return;
      }
      c.v1882 = s(
        ((d - l0) ** 2 * p) / 2 + c.v1882 + (d - (lb - x)) * f + (d - l0) * p * (l0 - (lb - x)),
      );
    }
    return;
  }
  c.v1882 = s(-(c.a1796.g(t, 0) * x) - c.a16de.g(t - 1));
  let direita = s(-c.a1796.g(t, 1) * (c.a1006.g(t) - x) - c.a16de.g(t));
  let acidental = s(-(c.a1796.g(t, 2) * x) - c.a170c.g(t - 1));
  let l0 = 0;
  const ini = s(1 + (c.a0fd8.g(t) - c.a0faa.g(t)));
  const fim = c.a0fd8.g(t);
  for (c.v0e48 = ini; c.v0e48 <= fim; c.v0e48 = s(c.v0e48 + 1)) {
    const i = c.v0e48;
    const d = c.a10be.g(i);
    const p = c.a1062.g(i);
    const pg = p - c.a1090.g(i);
    if (d > x) {
      c.v1882 = s(((x - l0) ** 2 * p) / 2 + c.v1882);
      acidental = s((pg * (x - l0) ** 2) / 2 + acidental);
      break;
    }
    c.v1882 = s(((d - l0) ** 2 * p) / 2 + c.v1882 + ((d - l0) * p + c.a10ec.g(i)) * (x - d));
    acidental = s(
      (pg * (d - l0) ** 2) / 2 +
        acidental +
        (pg * (d - l0) + (c.a10ec.g(i) - c.a111a.g(i))) * (x - d),
    );
    l0 = d;
  }
  l0 = 0;
  for (c.v0e48 = ini; c.v0e48 <= fim; c.v0e48 = s(c.v0e48 + 1)) {
    const i = c.v0e48;
    const d = c.a10be.g(i);
    if (d <= x) continue;
    const m = maior(l0, x);
    direita = s(
      ((d - m) ** 2 * c.a1062.g(i)) / 2 +
        direita +
        (d - m) * c.a1062.g(i) * (m - x) +
        (d - m) * c.a10ec.g(i),
    );
    l0 = d;
  }
  c.v1882 = maior(c.v1882, direita);
  if (c.v0e70 === "S") c.v1882 = maior(c.v1882, acidental);
}

/** Diagrama de 21 pontos do tramo V_0E14 em A_1346 (x em m, M em tm), com o M do tramo
 *  (positivo) ou o M mínimo (negativo) (L_40B14 e L_43602, DESDIM.BAS:5050-5079, 5346-5375). */
function diagrama(c: Comum, negativo: boolean) {
  const s = c.s;
  const t = c.v0e14;
  if (c.a1006.g(t) === 0) return;
  const m = () => {
    if (negativo) {
      momentoNegativoNoTramo(c);
      return -c.v1882;
    }
    momentoNoTramo(c);
    return -c.v1886;
  };
  c.v0e28 = 0;
  const limite = s(c.a1006.g(t) - c.a1006.g(t) / 20 + c.k(0.01));
  const passo = s(c.a1006.g(t) / 20);
  for (
    c.v0e30 = 0;
    passo < 0 ? !(c.v0e30 < limite) : !(c.v0e30 > limite);
    c.v0e30 = s(c.v0e30 + passo)
  ) {
    const y = m();
    c.a1346.p(c.v0e28, 0, c.v0e30);
    c.a1346.p(c.v0e28, 1, y);
    c.v0e28 = s(c.v0e28 + 1);
  }
  c.v0e30 = c.a1006.g(t);
  const y = m();
  c.a1346.p(20, 0, c.v0e30);
  c.a1346.p(20, 1, y);
}

/** Abscissas em que o diagrama A_1346 cruza V_0E2C subindo (V_0F7E) e descendo (V_0F82)
 *  (L_419DC, DESDIM.BAS:5160-5171). Os valores iniciais vêm de quem chama. */
function cruzamentos(c: Comum) {
  const s = c.s;
  const v = c.v0e2c;
  for (c.v0e1c = 1; c.v0e1c <= 20; c.v0e1c = s(c.v0e1c + 1)) {
    const j = c.v0e1c;
    const x0 = c.a1346.g(j - 1, 0);
    const y0 = c.a1346.g(j - 1, 1);
    const x1 = c.a1346.g(j, 0);
    const y1 = c.a1346.g(j, 1);
    if (y0 < y1 && y1 >= v && y0 <= v) c.v0f7e = s(((v - y0) * (x1 - x0)) / (y1 - y0) + x0);
    if (y0 > y1 && y1 <= v && y0 >= v) c.v0f82 = s(((v - y0) * (x1 - x0)) / (y1 - y0) + x0);
  }
}

/** L_4189D: cruzamentos a partir de 0 e do vão do tramo (positivas). */
function cruzaPositivo(c: Comum) {
  c.v0f7e = 0;
  c.v0f82 = c.a1006.g(c.v0e14);
  cruzamentos(c);
}

/** L_418E7: cruzamentos a partir do vão do tramo seguinte no último apoio com negativo
 *  (ou 0) e de 0 (negativas). */
function cruzaNegativo(c: Comum) {
  const { fim } = apoiosComNegativo(c);
  c.v0f7e = c.s(-qb(c.v0e14 >= fim) * c.a1006.g(c.v0e14 + 1));
  c.v0f82 = 0;
  cruzamentos(c);
}

/** Intervalo de bw da tabela de grupos de corte (V_0E48 de L_40D41 e L_43BB1). */
function intervaloBw(c: Comum, bw: number) {
  let g = 0;
  if (c.v0f46 > 1 && bw > c.v0f4a) g = 1;
  if (c.v0f46 > 2 && bw > c.v0f4e) g = 2;
  if (c.v0f46 > 3 && bw > c.v0f52) g = 3;
  if (c.v0f46 > 4 && bw > c.v0f56) g = 4;
  if (c.v0f46 > 5 && bw > c.v0f5a) g = 5;
  return g;
}

/** Ancoragem lb (m) com τbu = 0,9·(fck/γc)^(2/3) e o multiplicador `mult` (< 0 = fixa em
 *  m; > 100 = diâmetros) (DESDIM.BAS:5232-5235 e 5590-5593; U04-009). */
function ancoragem(c: Comum, mult: number) {
  const s = c.s;
  if (mult < 0) return s(-mult);
  if (mult > 100) return s(((mult - 100) * c.v0ea2) / 1000);
  const lb = s(
    (c.v0ea2 / (((c.v0eba * c.v0ec6 * 1000) / c.v0f5e) ** c.k(2 / 3) * 40 * c.v0f66 * c.k(0.9))) *
      c.v0ebe *
      c.v0ec6 *
      1000,
  );
  return s((c.int(lb) * mult) / 100);
}

/** Momento-limite da armadura simples da seção (bw, hw) do tramo ou apoio, tm, com ξ fixo
 *  0,6283663 (aço A) ou 0,4623514 (B) e a mesa (L_40816, DESDIM.BAS:5035-5045; U04-006). */
function momentoLimite(c: Comum, bw: number, hw: number, bf: number, hf: number) {
  const s = c.s;
  let xi = c.k(0.628366291522979736328125);
  if (c.v0ec2 === "B") xi = c.k(0.462351381778717041015625);
  const d = hw - c.v0ea6;
  let m = s(d * bw * (d - d * c.k(0.4) * xi) * c.k(0.8) * xi);
  if (bf > bw) m = s(((bf - bw) * hf * hf * d) / 2 + m);
  return s((m / (c.v0f5e * c.v0f62 * 100)) * c.k(0.85) * c.v0eba * c.v0ec6);
}

/** Corte das barras positivas de cada tramo (L_403D9, DESDIM.BAS:4998-5049). A troca do
 *  M do apoio e do Ve pelo engastamento perfeito (DESDIM.BAS:5011-5032) não muda o
 *  resultado: o diagrama usa A_17C4, que a troca não toca; por isso não foi portada. */
function cortaPositivas(c: Comum) {
  const s = c.s;
  const nT = c.v0ddc;
  for (c.v0e14 = 1; c.v0e14 <= nT; c.v0e14 = s(c.v0e14 + 1)) {
    const t = c.v0e14;
    c.a128e.p(t, 5, c.a128e.g(t, 0) * c.areaDaBitola(c.a128e.g(t, 1)));
    if (c.a128e.g(t, 3) > 0) {
      c.a128e.p(t, 5, c.a128e.g(t, 2) * c.areaDaBitola(c.a128e.g(t, 3)) + c.a128e.g(t, 5));
    }
    diagrama(c, false);
    gruposPositivos(c);
    ajustaPositivos(c);
    if (c.a13a2[t]!.length > 0) {
      c.v0e2c = momentoLimite(
        c,
        c.a1232.g(t, 0),
        c.a1232.g(t, 1),
        c.a1232.g(t, 2),
        c.a1232.g(t, 3),
      );
      cruzaPositivo(c);
      c.a12ea.p(t, 14, 1, c.v0f7e * c.v0fa2);
      c.a12ea.p(t, 14, 2, c.v0f82 * c.v0fa2);
    }
  }
}

/** Grupos de barras positivas do tramo e o trecho em que cada grupo é necessário
 *  (L_40D41, DESDIM.BAS:5080-5147). */
function gruposPositivos(c: Comum) {
  const s = c.s;
  const t = c.v0e14;
  c.v0e48 = intervaloBw(c, c.a1232.g(t, 0));
  const n = s(c.a128e.g(t, 2) - 2 + c.a128e.g(t, 0));
  c.v0e48 = c.a14e4.g(menor(7, n), c.v0e48);
  const total = c.a128e.g(t, 0) + c.a128e.g(t, 2);
  if (c.v0e48 === 0) throw new ErroQB(11, "Division by zero");
  c.a12ea.p(t, 0, 0, c.int(total / c.v0e48));
  if (total > c.a12ea.g(t, 0, 0) * c.v0e48) c.a12ea.p(t, 0, 0, c.a12ea.g(t, 0, 0) + 1);

  const passo = (barra: number, base: number) => {
    c.a12ea.p(
      t,
      c.v0e28,
      0,
      (((barra - base - 1) * c.a128e.g(t, 4)) / (c.a128e.g(t, 5) * c.v0fa2 * c.v0fa6)) * c.v0e44 +
        (base > 0 ? c.a12ea.g(t, 0, 1) : 0),
    );
    c.v0e2c = c.a12ea.g(t, c.v0e28, 0);
    cruzaPositivo(c);
    c.a12ea.p(t, c.v0e28, 1, c.v0f7e * c.v0fa2);
    c.a12ea.p(t, c.v0e28, 2, c.v0f82 * c.v0fa2);
    const primeiro = c.v0e28 === 1;
    if ((barra - 1) / c.v0e48 === divInteira(barra - 1, c.v0e48) || primeiro)
      c.v0e28 = s(c.v0e28 + 1);
    c.a12ea.p(t, c.v0e28, 3, c.v0f7e * c.v0fa2);
    c.a1318.p(t, c.v0e28, 3, c.v0f82 * c.v0fa2);
  };

  c.v0e44 = c.areaDaBitola(c.a128e.g(t, 1));
  c.v0e28 = 1;
  const n1 = c.a128e.g(t, 0);
  for (c.v0e24 = 1; c.v0e24 <= n1; c.v0e24 = s(c.v0e24 + 1)) {
    passo(c.v0e24, 0);
    c.v0e24 = s(-qb(c.v0e28 < 13) * c.v0e24 + -qb(c.v0e28 > 12) * c.a128e.g(t, 0));
  }
  if (c.a128e.g(t, 2) === 0) return;
  c.a12ea.p(
    t,
    0,
    1,
    ((c.a128e.g(t, 4) * c.a128e.g(t, 0)) / (c.a128e.g(t, 5) * c.v0fa2 * c.v0fa6)) * c.v0e44,
  );
  c.v0e44 = c.areaDaBitola(c.a128e.g(t, 3));
  c.v0e28 = s(c.v0e28 + 1);
  const fim = s(c.a128e.g(t, 2) + c.a128e.g(t, 0));
  for (c.v0e24 = s(c.a128e.g(t, 0) + 1); c.v0e24 <= fim; c.v0e24 = s(c.v0e24 + 1)) {
    passo(c.v0e24, c.a128e.g(t, 0));
  }
}

/** Decalagem, ancoragem, 10 φ além do corte anterior e pontas a 0,1 m das positivas
 *  (L_41D95, DESDIM.BAS:5172-5268). */
function ajustaPositivos(c: Comum) {
  const s = c.s;
  const t = c.v0e14;
  const ng = c.a12ea.g(t, 0, 0);
  for (c.v0e28 = 1; c.v0e28 <= ng; c.v0e28 = s(c.v0e28 + 1)) {
    const g = c.v0e28;
    c.a12ea.p(t, g, 3, c.a12ea.g(t, g, 1) - c.a12ea.g(t, g, 3));
    c.a1318.p(t, g, 3, c.a1318.g(t, g, 3) - c.a12ea.g(t, g, 2));
  }
  c.v0e28 = 1;
  const total = s(c.a128e.g(t, 0) + c.a128e.g(t, 2));
  const passo = c.v0e48;
  let guarda = 0;
  for (
    c.v0e24 = 1;
    passo < 0 ? !(c.v0e24 < total) : !(c.v0e24 > total);
    c.v0e24 = s(c.v0e24 + passo)
  ) {
    if (++guarda > 10000) throw new Error("DESAUXDI: laço sem fim no corte das positivas");
    const g = c.v0e28;
    c.v0ea2 = c.a128e.g(t, 1);
    if (c.a128e.g(t, 0) < menor(s(c.v0e24 * c.v0e48), total)) c.v0ea2 = c.a128e.g(t, 3);
    if (c.v18a6 < 0) {
      c.a12ea.p(t, g, 1, c.a12ea.g(t, g, 1) + c.v18a6);
      c.a12ea.p(t, g, 2, c.a12ea.g(t, g, 2) - c.v18a6);
    }
    if (c.v18a6 > 100) {
      c.a12ea.p(t, g, 1, c.a12ea.g(t, g, 1) - ((c.v18a6 - 100) * c.v0ea2) / 1000);
      c.a12ea.p(t, g, 2, ((c.v18a6 - 100) * c.v0ea2) / 1000 + c.a12ea.g(t, g, 2));
    }
    if (c.v18a6 < 100 && c.v18a6 > 0) {
      const dec = ((c.a1232.g(t, 1) - c.v0ea6) * c.v18a6) / 100;
      c.a12ea.p(t, g, 1, c.a12ea.g(t, g, 1) - dec);
      c.a12ea.p(t, g, 2, dec + c.a12ea.g(t, g, 2));
    }
    c.v0e28 = s(c.v0e28 + 1);
    c.v0e24 = s(-qb(c.v0e28 < 13) * c.v0e24 + -qb(c.v0e28 > 12) * c.a128e.g(t, 0));
  }
  for (c.v0e28 = ng; c.v0e28 >= 1; c.v0e28 = s(c.v0e28 - 1)) {
    const g = c.v0e28;
    c.v0ea2 = c.a128e.g(t, 1);
    if (c.a128e.g(t, 0) < menor(s(g * c.v0e48), total)) c.v0ea2 = c.a128e.g(t, 3);
    c.v0e38 = ancoragem(c, c.v18aa);
    c.a12ea.p(t, g, 1, c.a12ea.g(t, g, 1) - c.v0e38);
    c.a12ea.p(t, g, 2, c.a12ea.g(t, g, 2) + c.v0e38);
    if (c.v188a === "S" && g > 1) {
      const ini = c.a12ea.g(t, g, 1);
      if (c.v0e38 - c.a12ea.g(t, g, 3) + ini - ini < c.v0ea2 / 100) {
        c.a12ea.p(t, g, 1, c.v0e38 - c.a12ea.g(t, g, 3) - c.v0ea2 / 100 + c.a12ea.g(t, g, 1));
      }
      const fim = c.a12ea.g(t, g, 2);
      if (fim - (fim - c.v0e38 + c.a1318.g(t, g, 3)) < c.v0ea2 / 100) {
        c.a12ea.p(t, g, 2, fim - c.v0e38 + c.a1318.g(t, g, 3) + c.v0ea2 / 100);
      }
    }
    c.a12ea.p(t, g, 1, c.int(c.a12ea.g(t, g, 1) * 10) / 10);
    c.a12ea.p(t, g, 2, c.int(c.a12ea.g(t, g, 2) * 10) / 10 + c.k(0.1));
  }
  const vao = c.a1006.g(t) * c.v0fa2;
  if (c.a12ea.g(t, 1, 1) > 0) c.a12ea.p(t, 1, 1, 0);
  if (c.a12ea.g(t, 1, 2) < vao) c.a12ea.p(t, 1, 2, vao);
  const bw = c.a1232.g(t, 0);
  if (c.a12ea.g(t, 2, 1) > 0 && c.v0e48 < 4 && bw > c.v0f3e) c.a12ea.p(t, 2, 1, 0);
  if (c.a12ea.g(t, 2, 2) < vao && c.v0e48 < 4 && bw > c.v0f3e) c.a12ea.p(t, 2, 2, vao);
  if (c.a12ea.g(t, 3, 1) > 0 && c.v0e48 < 3 && bw > c.v0f42) c.a12ea.p(t, 3, 1, 0);
  if (c.a12ea.g(t, 3, 2) < vao && c.v0e48 < 3 && bw > c.v0f42) c.a12ea.p(t, 3, 2, vao);
}

/** Corte das barras negativas dos apoios e a extensão sobre tramos sem M+ (L_42F62,
 *  DESDIM.BAS:5269-5345). */
function cortaNegativas(c: Comum) {
  const s = c.s;
  const { ini, fim } = apoiosComNegativo(c);
  if (ini > fim) return;
  for (c.v0e14 = ini; c.v0e14 <= fim; c.v0e14 = s(c.v0e14 + 1)) {
    const k = c.v0e14;
    if (c.a16de.g(k) > 0) {
      c.v0e14 = s(k + 1);
      diagrama(c, true);
      c.v0e14 = k;
    } else {
      c.a12bc.p(k, 4, c.a12bc.g(k, 0) * c.areaDaBitola(c.a12bc.g(k, 1)));
      if (c.a12bc.g(k, 3) > 0) {
        c.a12bc.p(k, 4, c.a12bc.g(k, 2) * c.areaDaBitola(c.a12bc.g(k, 3)) + c.a12bc.g(k, 4));
      }
      if (!(c.v0de0 === 0 && k === 0)) {
        if (k === apoiosComNegativo(c).ini) diagrama(c, true);
        gruposNegativos(c, "esquerda");
      }
      if (k + 1 <= c.v0ddc + c.v0de4) {
        c.v0e14 = s(k + 1);
        diagrama(c, true);
        c.v0e14 = k;
        gruposNegativos(c, "direita");
      }
    }
    ajustaNegativos(c);
  }
  for (c.v0e14 = 1; c.v0e14 <= c.v0ddc; c.v0e14 = s(c.v0e14 + 1)) {
    if (c.v0e70 !== "S" && c.a1626.g(c.v0e14) <= 0) estendeSemPositivo(c);
  }
}

/** Tramo sem M+: as negativas do apoio de maior bitola atravessam o tramo (L_4382F,
 *  DESDIM.BAS:5376-5396). */
function estendeSemPositivo(c: Comum) {
  const s = c.s;
  const t = c.v0e14;
  const k = c.a12bc.g(t - 1, 1) > c.a12bc.g(t, 1) ? t - 1 : t;
  const col = k === t ? 1 : 2;
  const ng = c.a1318.g(k, 0, 0);
  for (c.v0e28 = 1; c.v0e28 <= ng; c.v0e28 = s(c.v0e28 + 1)) {
    if (c.a1318.g(k, c.v0e28, 0) >= c.a1626.g(t))
      c.a1318.p(k, c.v0e28, col, c.a1006.g(t) * c.v0fa2);
    c.v0e28 = s(-qb(c.v0e28 < 13) * c.v0e28 + -qb(c.v0e28 > 12) * c.a1318.g(k, 0, 0));
  }
}

/** Grupos de barras negativas do apoio V_0E14 e o trecho necessário à esquerda (no
 *  tramo k, L_43BB1) ou à direita (no tramo k+1, L_44811) (DESDIM.BAS:5397-5546). */
function gruposNegativos(c: Comum, lado: "esquerda" | "direita") {
  const s = c.s;
  const k = c.v0e14;
  c.v0e48 = intervaloBw(c, c.a1260.g(k, 0));
  const n = s(c.a12bc.g(k, 2) - 2 + c.a12bc.g(k, 0));
  c.v0e48 = c.a14e4.g(menor(7, n), c.v0e48);
  const total = c.a12bc.g(k, 0) + c.a12bc.g(k, 2);
  if (c.v0e48 === 0) throw new ErroQB(11, "Division by zero");
  c.a1318.p(k, 0, 0, c.int(total / c.v0e48));
  if (total > c.a1318.g(k, 0, 0) * c.v0e48) c.a1318.p(k, 0, 0, c.a1318.g(k, 0, 0) + 1);

  const passo = (barra: number, base: number) => {
    c.a1318.p(
      k,
      c.v0e28,
      0,
      (((barra - base - 1) * c.a16de.g(k)) / c.a12bc.g(k, 4)) * c.v0e44 +
        (base > 0 ? c.a1318.g(k, 0, 1) : 0),
    );
    c.v0e2c = c.a1318.g(k, c.v0e28, 0);
    cruzaNegativo(c);
    if (lado === "esquerda") c.a1318.p(k, c.v0e28, 1, (c.a1006.g(k) - c.v0f82) * c.v0fa2);
    else c.a1318.p(k, c.v0e28, 2, c.v0f7e * c.v0fa2);
    const primeiro = c.v0e28 === 1;
    if ((barra - 1) / c.v0e48 === divInteira(barra - 1, c.v0e48) || primeiro)
      c.v0e28 = s(c.v0e28 + 1);
    // L_43BB1 grava a coluna 3 em A_12EA (DESDIM.BAS:5444); L_44811, em A_1318 (:5503).
    if (lado === "esquerda") c.a12ea.p(k, c.v0e28, 3, (c.a1006.g(k) - c.v0f82) * c.v0fa2);
    else c.a1318.p(k, c.v0e28, 3, c.v0f7e * c.v0fa2);
  };

  c.v0e44 = c.areaDaBitola(c.a12bc.g(k, 1));
  c.v0e28 = 1;
  const n1 = c.a12bc.g(k, 0);
  for (c.v0e24 = 1; c.v0e24 <= n1; c.v0e24 = s(c.v0e24 + 1)) {
    passo(c.v0e24, 0);
    c.v0e24 = s(-qb(c.v0e28 < 13) * c.v0e24 + -qb(c.v0e28 > 12) * c.a12bc.g(k, 0));
  }
  if (c.a12bc.g(k, 2) !== 0) {
    c.a1318.p(k, 0, 1, ((c.a16de.g(k) * c.a12bc.g(k, 0)) / c.a12bc.g(k, 4)) * c.v0e44);
    c.v0e44 = c.areaDaBitola(c.a12bc.g(k, 3));
    c.v0e28 = s(c.v0e28 + 1);
    const fim = s(c.a12bc.g(k, 2) + c.a12bc.g(k, 0));
    for (c.v0e24 = s(c.a12bc.g(k, 0) + 1); c.v0e24 <= fim; c.v0e24 = s(c.v0e24 + 1)) {
      passo(c.v0e24, c.a12bc.g(k, 0));
    }
  }
  if (c.a13d0[k]!.length > 0) {
    c.v0e2c = s(-momentoLimite(c, c.a1260.g(k, 0), c.a1260.g(k, 1), 0, 0));
    cruzaNegativo(c);
    if (lado === "esquerda") c.a1318.p(k, 14, 1, (c.a1006.g(k) - c.v0f82) * c.v0fa2);
    else c.a1318.p(k, 14, 2, c.v0f7e * c.v0fa2);
  }
}

/** Decalagem, ancoragem ×1,50, 10 φ e pontas a 0,1 m das negativas do apoio V_0E14
 *  (L_453EA, DESDIM.BAS:5547-5631). */
function ajustaNegativos(c: Comum) {
  const s = c.s;
  const k = c.v0e14;
  const ng = c.a1318.g(k, 0, 0);
  for (c.v0e28 = 1; c.v0e28 <= ng; c.v0e28 = s(c.v0e28 + 1)) {
    const g = c.v0e28;
    c.a12ea.p(k, g, 3, c.a12ea.g(k, g, 3) - c.a1318.g(k, g, 1));
    c.a1318.p(k, g, 3, c.a1318.g(k, g, 3) - c.a1318.g(k, g, 2));
  }
  c.v0e28 = 1;
  const total = s(c.a12bc.g(k, 0) + c.a12bc.g(k, 2));
  const passo = c.v0e48;
  let guarda = 0;
  for (
    c.v0e24 = 1;
    passo < 0 ? !(c.v0e24 < total) : !(c.v0e24 > total);
    c.v0e24 = s(c.v0e24 + passo)
  ) {
    if (++guarda > 10000) throw new Error("DESAUXDI: laço sem fim no corte das negativas");
    const g = c.v0e28;
    c.v0ea2 = c.a12bc.g(k, 1);
    if (c.a12bc.g(k, 0) < menor(s(c.v0e24 * c.v0e48), total)) c.v0ea2 = c.a12bc.g(k, 3);
    if (c.v18a6 < 0) {
      c.a1318.p(k, g, 1, c.a1318.g(k, g, 1) - c.v18a6);
      c.a1318.p(k, g, 2, c.a1318.g(k, g, 2) - c.v18a6);
    }
    if (c.v18a6 > 100) {
      const dec = ((c.v18a6 - 100) * c.v0ea2) / 1000;
      c.a1318.p(k, g, 1, dec + c.a1318.g(k, g, 1));
      c.a1318.p(k, g, 2, dec + c.a1318.g(k, g, 2));
    }
    if (c.v18a6 < 100 && c.v18a6 > 0) {
      const dec = ((c.a1260.g(k, 1) - c.v0ea6) * c.v18a6) / 100;
      c.a1318.p(k, g, 1, dec + c.a1318.g(k, g, 1));
      c.a1318.p(k, g, 2, dec + c.a1318.g(k, g, 2));
    }
    c.v0e28 = s(c.v0e28 + 1);
    c.v0e24 = s(-qb(c.v0e28 < 13) * c.v0e24 + -qb(c.v0e28 > 12) * c.a12bc.g(k, 0));
  }
  for (c.v0e28 = ng; c.v0e28 >= 1; c.v0e28 = s(c.v0e28 - 1)) {
    const g = c.v0e28;
    c.v0ea2 = c.a12bc.g(k, 1);
    if (c.a12bc.g(k, 0) < menor(s(g * c.v0e48), total)) c.v0ea2 = c.a12bc.g(k, 3);
    c.v0e38 = ancoragem(c, c.v18ae);
    c.a1318.p(k, g, 1, c.a1318.g(k, g, 1) + c.v0e38);
    c.a1318.p(k, g, 2, c.a1318.g(k, g, 2) + c.v0e38);
    if (c.v188a === "S" && g > 1) {
      const a = c.a1318.g(k, g, 1);
      if (a - (a - c.v0e38 + c.a12ea.g(k, g, 3)) < c.v0ea2 / 100) {
        c.a1318.p(k, g, 1, a - c.v0e38 + c.a12ea.g(k, g, 3) + c.v0ea2 / 100);
      }
      const b = c.a1318.g(k, g, 2);
      if (b - (b - c.v0e38 + c.a1318.g(k, g, 3)) < c.v0ea2 / 100) {
        c.a1318.p(k, g, 2, b - c.v0e38 + c.a1318.g(k, g, 3) + c.v0ea2 / 100);
      }
    }
    c.a1318.p(k, g, 1, c.int(c.a1318.g(k, g, 1) * 10) / 10 + c.k(0.1));
    c.a1318.p(k, g, 2, c.int(c.a1318.g(k, g, 2) * 10) / 10 + c.k(0.1));
    if (c.a1318.g(k, g, 1) > c.a1006.g(k) * c.v0fa2) c.a1318.p(k, g, 1, c.a1006.g(k) * c.v0fa2);
    if (c.a1318.g(k, g, 2) > c.a1006.g(k + 1) * c.v0fa2)
      c.a1318.p(k, g, 2, c.a1006.g(k + 1) * c.v0fa2);
  }
}

/** Cortante −V(x) no tramo V_0E14 em V_0E38 (L_46F40, DESDIM.BAS:5705-5753). */
function cortanteNoTramo(c: Comum) {
  const s = c.s;
  const t = c.v0e14;
  const x = c.v0e30;
  if (!(t > 0)) {
    c.v0e38 = 0;
    if (c.a0faa.g(0) === 0) return;
    const fim = c.a0faa.g(0);
    for (c.v0e48 = 1; c.v0e48 <= fim; c.v0e48 = s(c.v0e48 + 1)) {
      const i = c.v0e48;
      let l0 = 0;
      if (c.a0faa.g(0) > i) l0 = c.a10be.g(i + 1);
      const lb = c.a1006.g(0);
      if (lb - l0 < x) {
        c.v0e38 = s((c.a10be.g(i) - (lb - x)) * c.a1062.g(i) + c.v0e38);
        if (c.a10be.g(i) !== lb - x) c.v0e38 = s(c.a10ec.g(i) + c.v0e38);
        return;
      }
      c.v0e38 = s((c.a10be.g(i) - l0) * c.a1062.g(i) + c.v0e38 + c.a10ec.g(i));
    }
    return;
  }
  c.v0e38 = s(-c.a1654.g(t, 0));
  let l0 = 0;
  const fim = c.a0fd8.g(t);
  for (c.v0e48 = s(1 + (c.a0fd8.g(t) - c.a0faa.g(t))); c.v0e48 <= fim; c.v0e48 = s(c.v0e48 + 1)) {
    const i = c.v0e48;
    if (c.a10be.g(i) >= x) {
      c.v0e38 = s((x - l0) * c.a1062.g(i) + c.v0e38);
      return;
    }
    c.v0e38 = s((c.a10be.g(i) - l0) * c.a1062.g(i) + c.v0e38);
    c.v0e38 = s(c.a10ec.g(i) + c.v0e38);
    l0 = c.a10be.g(i);
  }
}

/** Zonas de estribo de cada tramo pelo cortante em L/30 (fim da zona esquerda e início
 *  da zona direita, m, em A_1374 colunas 1 e 4) (L_462B0, DESDIM.BAS:5632-5704; U04-012). */
function zonasDeEstribo(c: Comum) {
  const s = c.s;
  const fimT = s(c.v0ddc + c.v0de4);
  for (c.v0e14 = s(1 - c.v0de0); c.v0e14 <= fimT; c.v0e14 = s(c.v0e14 + 1)) {
    const t = c.v0e14;
    const n1 = c.v0ddc + 1;
    const vao = c.a1006.g(t) * c.v0fa2;
    if (t === 0) c.a1374.p(t, 1, 0);
    if (n1 === t) c.a1374.p(t, 4, vao);
    const limite = s(c.a1006.g(t) + c.k(0.001));
    const passo = s(c.a1006.g(t) / 30);
    for (
      c.v0e30 = 0;
      passo < 0 ? !(c.v0e30 < limite) : !(c.v0e30 > limite);
      c.v0e30 = s(c.v0e30 + passo)
    ) {
      if (passo === 0) throw new Error("DESAUXDI: vão nulo nas zonas de estribo");
      if (c.a1006.g(t) < c.v0e30) c.v0e30 = c.a1006.g(t);
      cortanteNoTramo(c);
      if (t <= c.v0ddc && t > 0) {
        c.v0e38 = s(
          c.v0e38 -
            qb(c.v0e38 > 0) * (c.a1796.g(t, 1) - c.a1654.g(t, 1)) +
            qb(c.v0e38 <= 0) * (c.a1796.g(t, 0) - c.a1654.g(t, 0)),
        );
      }
      if (t > 0 && c.v0e38 < 0 && Math.abs(c.v0e38) * c.v0fa6 > c.a1374.g(t, 8)) {
        c.a1374.p(t, 1, c.int((c.a1006.g(t) / 30 + c.v0e30) * 10 * c.v0fa2) / 10);
        if (c.a1374.g(t, 1) > vao) c.a1374.p(t, 1, vao);
      }
      if (n1 > t && c.v0e38 * c.v0fa6 <= c.a1374.g(t, 8)) {
        c.a1374.p(t, 4, vao - c.int((c.a1006.g(t) - c.v0e30) * 10 * c.v0fa2) / 10);
      }
    }
    const h = c.a1232.g(t, 1) / 100;
    if (c.a1374.g(t, 1) < h && t > 0) c.a1374.p(t, 1, h);
    if (vao - c.a1374.g(t, 4) < h && n1 > t) c.a1374.p(t, 4, vao - h);
    if (Math.abs(c.a1540.g(t, 0) * c.v0fa6) <= c.a1374.g(t, 8) && t > 0) c.a1374.p(t, 1, 0);
    if (Math.abs(c.a1540.g(t, 1) * c.v0fa6) <= c.a1374.g(t, 8) && n1 > t) c.a1374.p(t, 4, vao);
    if (c.a1374.g(t, 4) - c.a1374.g(t, 1) < h && t > 0) c.a1374.p(t, 1, c.a1374.g(t, 4));
    if (c.a1374.g(t, 4) - c.a1374.g(t, 1) < h && n1 > t) c.a1374.p(t, 4, c.a1374.g(t, 1));
    if (
      c.a1374.g(t, 2) === c.a1374.g(t, 7) &&
      c.a1374.g(t, 1) === c.a1374.g(t, 4) &&
      c.a1374.g(t, 0) === c.a1374.g(t, 6)
    ) {
      if (t === 0) {
        c.a1374.p(t, 1, 0);
        c.a1374.p(t, 4, 0);
      } else {
        c.a1374.p(t, 1, vao);
        c.a1374.p(t, 4, vao);
      }
    }
  }
}

/** DESAUXDI completo (S_4035E): corte das positivas, das negativas e zonas de estribo. */
export function cortaBarras(c: Comum) {
  cortaPositivas(c);
  cortaNegativas(c);
  zonasDeEstribo(c);
}

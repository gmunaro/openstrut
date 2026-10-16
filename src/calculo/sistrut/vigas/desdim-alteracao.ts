// Armadura que o usuário altera nas telas do DESDIM, quando o DESENHO tem "Altero a
// armadura que será optada pela Parametrização" S (DESENHO.BAS:1707):
// - "Altero a Armação" (DESDIM.BAS:3082-3098): S_60137 nos apoios (6701-7071) e S_61fbe
//   nos tramos (7073-7400). Por elemento: "Bitola(mm) Tracionada" (Enter = a mesma, "="
//   mantém a armadura, "a+b" mistura), "Numero de Barras" (Enter = o necessário, "n+m") e
//   "Armadura Comprimida" ("-" anula, "a#b");
// - "Modifico as Armaduras" da fissuração (S_20137, 3909-4230), só quando a abertura de
//   algum apoio (ou tramo) passou do limite: bitola (Enter = a mesma) e quantidade.
// Depois disso o DESDIM refaz a passada com V_187a = 2 (3104-3106): imprime o arranjo
// montado pelos números (STR$, 2862-2873 e 3027-3037) e calcula a flecha (L_19577) com
// as barras novas. O que a tela recusaria ("BITOLA NAO PADRONIZADA", "ARMADURA
// INSUFICIENTE", "CORTADAS CADA") vira aviso e a alteração não entra.
import { num } from "../../texto";
import type { AlteracaoArmadura, BarrasArranjo, ModoSistrut, ParametrosDsp } from "../base/tipos";
import { atribuicao, ErroQB, qbInt, qbStr } from "../base/f32";
import { areaBitola } from "./desdim-barras";

/** Um elemento alterável: as que o DESDIM dimensionou (apoio do laço ou tramo interno). */
export interface ElementoArmadura {
  em: "apoio" | "tramo";
  numero: number;
  /** As necessária (A_12bc(k,6) / A_128e(t,6)), cm². */
  as: number;
  /** bw do elemento (A_1260(k,0) / A_1232(t,0)), cm. */
  bw: number;
  barras: BarrasArranjo;
  arranjo: string;
  arranjoCompressao: string;
  /** Fissuração do elemento com as barras atuais (undefined sem a verificação). */
  fissuraOk?: () => boolean | undefined;
}

/** Arranjo como a 2ª passada do DESDIM o imprime (DESDIM.BAS:2862-2873). */
export function textoArranjo(b: BarrasArranjo) {
  const t = (x: number) => qbStr(x).slice(1);
  let texto = `${t(b.n1)}#${t(b.bitola1)}`;
  if (b.n2 > 0) texto += b.n2 === 1 ? `+#${t(b.bitola2)}` : `+${t(b.n2)}#${t(b.bitola2)}`;
  return texto;
}

/** Aplica as alterações aos elementos (em ordem: as de "Altero a Armação" dos apoios e
 *  dos tramos, depois as de "Modifico as Armaduras" dos apoios e dos tramos). Devolve os
 *  elementos alterados. */
export function aplicaAlteracoes(
  alteracoes: readonly AlteracaoArmadura[],
  elementos: readonly ElementoArmadura[],
  parametros: ParametrosDsp,
  modo: ModoSistrut,
  aviso: (texto: string) => void,
) {
  const s = atribuicao(modo);
  const p = parametros;
  const alterados = new Set<ElementoArmadura>();
  const achar = (a: AlteracaoArmadura) => {
    const e = elementos.find((x) => x.em === a.em && x.numero === a.numero);
    if (!e) aviso(`${a.em} ${a.numero}: o DESDIM não dimensiona esse ${a.em}; alteração ignorada.`);
    return e;
  };
  /** Área pela tabela do .DSP (S_40141); a bitola fora dela volta igual. */
  const area = (b: number) => areaBitola(b, p, modo);
  const padronizada = (b: number) => area(b) !== b;
  /** Intervalo de bw para o grupo de corte (DESDIM.BAS:6869-6874: V_0f3e, V_0f42). */
  const intervalo = (bw: number) =>
    bw > p.larguraEstriboSimples ? (bw > p.larguraEstriboDuplo ? 2 : 1) : 0;
  /** A_14e4(MIN(m − 2 + n, 7), intervalo) (DESDIM.BAS:6875-6878). */
  const grupo = (n: number, m: number, iv: number) => {
    const linha = Math.min(m - 2 + n, 7);
    const g = p.grupoDeCorte[iv]?.[linha];
    if (linha < 0 || g === undefined)
      throw new ErroQB(9, `Subscript out of range (grupo de corte ${linha}, ${iv})`);
    return g;
  };
  const idiv = (a: number, b: number) => {
    if (Math.round(b) === 0) throw new ErroQB(11, "Division by zero (grupo de corte 0)");
    return Math.trunc(Math.round(a) / Math.round(b));
  };
  const divide = (a: number, b: number) => {
    if (b === 0) throw new ErroQB(11, "Division by zero (área da bitola 0)");
    return a / b;
  };

  // ---- "Altero a Armação": apoios (S_60137) e depois tramos (S_61fbe)
  const telas = [...alteracoes].sort(
    (a, b) => (a.em === "apoio" ? 0 : 1) - (b.em === "apoio" ? 0 : 1),
  );
  for (const a of telas) {
    if (a.tracionada === undefined && a.comprimida === undefined) continue;
    const e = achar(a);
    if (!e) continue;
    const onde = `${a.em} ${a.numero}`;
    const t = a.tracionada;
    if (t) {
      const As = e.as;
      let b1: number;
      let b2 = 0;
      let a2 = 0;
      if (t.bitola === undefined) {
        // Enter: a mesma bitola, sem mistura (DESDIM.BAS:6855-6862)
        b1 = e.barras.bitola1;
        if (t.bitolaMistura !== undefined)
          aviso(`${onde}: mistura sem a bitola principal; vale a bitola do arranjo.`);
      } else {
        b1 = s(t.bitola);
        if (!padronizada(b1)) {
          aviso(
            `${onde}: bitola ${t.bitola} não está no .DSP ("BITOLA NAO PADRONIZADA"); alteração ignorada.`,
          );
          continue;
        }
        if (t.bitolaMistura !== undefined) {
          b2 = s(t.bitolaMistura);
          if (!padronizada(b2)) {
            aviso(
              `${onde}: bitola ${t.bitolaMistura} não está no .DSP ("BITOLA NAO PADRONIZADA"); alteração ignorada.`,
            );
            continue;
          }
          if (b1 <= b2) {
            aviso(
              `${onde}: na mistura a+b, a bitola a tem que ser maior que b; alteração ignorada.`,
            );
            continue;
          }
          a2 = area(b2);
        }
      }
      const a1 = area(b1);
      const iv = intervalo(e.bw);
      let barras: BarrasArranjo;
      if (t.barras === undefined) {
        // o necessário: INT(x) − (INT(x) < x) − (INT(x) = 0), x = As/a (DESDIM.BAS:6913)
        const x = divide(As, a1);
        let n1 = qbInt(x) + (qbInt(x) < x ? 1 : 0) + (qbInt(x) === 0 ? 1 : 0);
        let n2 = 0;
        if (n1 > 2 && a2 > 0) {
          // mistura: n1 múltiplo do grupo de corte (DESDIM.BAS:6918-6955)
          let g = grupo(n1, n2, iv);
          if (n1 > g) {
            let e2 = 0;
            n1 = idiv(n1, g) * g;
            for (let volta = 0; ; volta++) {
              if (volta > 1000)
                throw new ErroQB(5, "Illegal function call (laço do grupo de corte)");
              n1 = n1 - e2;
              const y = divide(As - n1 * a1, a2);
              n2 = qbInt(y) + (qbInt(y) < y ? 1 : 0);
              g = grupo(n1, n2, iv);
              if (n1 / g !== idiv(n1, g) && n1 > g) {
                e2 += 1;
                continue;
              }
              break;
            }
          }
        }
        barras = { n1, bitola1: b1, n2, bitola2: b2 };
      } else {
        const n = t.barras;
        if (n < 2) {
          aviso(`${onde}: o número de barras tem que ser 2 ou mais; alteração ignorada.`);
          continue;
        }
        const m = a2 > 0 ? (t.barrasMistura ?? 0) : 0;
        if (t.barrasMistura !== undefined && a2 === 0)
          aviso(`${onde}: "+m" barras sem a bitola de mistura; vale só n.`);
        if (n * a1 + m * a2 < As) {
          aviso(
            `${onde}: ${n}#${t.bitola ?? b1}${m ? `+${m}` : ""} não cobre As = ${num(As, 2)} cm² ("ARMADURA INSUFICIENTE"); alteração ignorada.`,
          );
          continue;
        }
        if (m > 0) {
          const g = grupo(n, m, iv);
          if (n < g || n / g !== idiv(n, g)) {
            aviso(
              `${onde}: ${n}+${m} barras com corte a cada ${g} ("CORTADAS CADA"); alteração ignorada.`,
            );
            continue;
          }
        }
        barras = { n1: n, bitola1: b1, n2: m, bitola2: b2 };
      }
      e.barras = barras;
      e.arranjo = textoArranjo(barras);
      alterados.add(e);
    }
    if (a.comprimida !== undefined) {
      const c = a.comprimida;
      if (c !== "-") {
        const k = c.indexOf("#");
        const bit = s(Number.parseFloat(c.slice(k + 1)) || 0);
        if (k < 0 || !(Number.parseFloat(c) > 0) || !padronizada(bit)) {
          aviso(
            `${onde}: armadura comprimida "${c}" fora do formato a#b com a > 0 e bitola do .DSP; alteração ignorada.`,
          );
          continue;
        }
      }
      e.arranjoCompressao = c;
      alterados.add(e);
    }
  }

  // ---- "Modifico as Armaduras" da fissuração (S_20137): só se o grupo não passou
  for (const em of ["apoio", "tramo"] as const) {
    const pedidas = alteracoes.filter((a) => a.em === em && a.fissuracao);
    if (pedidas.length === 0) continue;
    const grupoEl = elementos.filter((x) => x.em === em);
    const naoPassou = grupoEl.some((x) => x.fissuraOk?.() === false);
    if (!naoPassou) {
      aviso(
        `fissuração dos ${em}s sem abertura acima do limite (ou sem verificação): o DESDIM não pergunta "Modifico as Armaduras"; alteração ignorada.`,
      );
      continue;
    }
    for (const a of pedidas) {
      const e = achar(a);
      if (!e) continue;
      const f = a.fissuracao!;
      const onde = `${a.em} ${a.numero}`;
      const b = f.bitola === undefined ? e.barras.bitola1 : s(f.bitola);
      const ar = area(b);
      if (ar === b || ar === 0) {
        aviso(`${onde}: bitola ${f.bitola ?? b} fora do .DSP ou com área 0; alteração ignorada.`);
        continue;
      }
      if (ar * f.quantidade < e.as) {
        aviso(
          `${onde}: ${f.quantidade} barras de ${b} mm não cobrem As = ${num(e.as, 2)} cm²; alteração ignorada.`,
        );
        continue;
      }
      e.barras = { n1: f.quantidade, bitola1: b, n2: 0, bitola2: 0 };
      e.arranjo = textoArranjo(e.barras);
      alterados.add(e);
    }
  }
  return alterados;
}

// LAJEPROC, item 1 (escolha automática das armaduras de todas as lajes).
// Especificação: livros_laje.md 1.16 e 2.5; PLANO L10 e R2 (U45-001..008).
//
// Refaz o As de cada posição a partir de H e M+ gravados, escolhe a barra pelas
// tabelas e grava UMA negativa por continuidade, com o maior As dos dois lados e a
// barra pelo H da laje corrente. Não calcula peso de aço (U45-009).
//
// Detalhes do original reproduzidos nos dois modos:
// - a flexão do LAJEPROC (L_15279) não toca o As quando a seção não passa: a
//   negativa fica com o As da posição calculada antes (o "registro" abaixo);
// - cada continuidade é processada pelas duas lajes, e vale a última (o código da
//   primeira, negativo, não conta como imposto).
// Defeito R2: o original só recalcula o vizinho se o lado dele tem número diferente
// do lado atual (LAJEPROC.BAS:836, `V_16a8 <> V_0efc`); o corrigido sempre recalcula.
import type { Etapa } from "../../tipos";
import { atribuicao } from "../base/f32";
import type {
  BarraDeLaje,
  CodigoBarraLaje,
  Lajeproc,
  PosicaoLajeproc,
  ResultadoLajeproc,
} from "../base/tipos";
import {
  barraDoCodigo,
  barraImpostaNaContinuidade,
  escolheBarraLaje,
  textoBarraLaje,
} from "./barras";
import { flexaoLaje } from "./flexao";

const REF = "LAJEPROC.BAS:298-1060; livros_laje.md 1.16";

/**
 * Escolha automática das armaduras do LAJEPROC (LAJEPROC.BAS:336-377 e as
 * sub-rotinas L_11984, L_11ecb, L_13ee1). Pula os tipos 1, 2 e 3 e as lajes sem H.
 * - positiva principal com max(M+, 0) e secundária com M+·μ (μ < 1) ou M+/μ:
 *   seção que não passa sai '*' com As 0; positiva imposta (código negativo) fica se
 *   área/s·100 ≥ As (LAJEPROC.BAS:437-476, 477-518);
 * - negativa por bordo engastado: M− = |M+|·(código − 2)·fator/10 (LAJEPROC.BAS:798);
 *   usa o As do vizinho se As_viz = 0 ou As_viz > As > 0 (LAJEPROC.BAS:835-859);
 *   armadura imposta pelo LAJECALC (código > 0) é só conferida, com aviso se não basta
 *   (LAJEPROC.BAS:865-889); senão grava −(1000·bitola + espaçamento) (892).
 * E2E L1: # 6.3 c/ 20, c/ 20, c/12.5 (com L2), c/17.5 (com L3) (livros_laje.md 2.5).
 */
export const lajeproc: Lajeproc = (esforcos, materiais, parametros, modo) => {
  const s = atribuicao(modo);
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const lajes = new Map(esforcos.lajes.map((l) => [l.nome, l]));
  const codigosNegativos: CodigoBarraLaje[] = esforcos.continuidades.map(
    (c) => c.armaduraImposta ?? 0,
  );
  const negativas: ResultadoLajeproc["negativas"] = esforcos.continuidades.map((continuidade) => ({
    mTcm: 0,
    as: 0,
    barra: { ok: false },
    continuidade,
  }));
  const positivas: ResultadoLajeproc["positivas"] = {};

  // V_13f2: o As da última flexão do LAJEPROC que passou (LAJEPROC.BAS:1008-1022).
  let registro = 0;
  const flexao = (mTcm: number, h: number, negativa: boolean) => {
    const f = flexaoLaje({ mTcm, h, negativa }, materiais, parametros, modo);
    if (f.passa) registro = f.as;
    return f.passa;
  };

  /** Positiva (L_11984/L_11ecb): '*' se não passa; a imposta fica se basta. */
  const positiva = (mTcm: number, h: number, imposta?: CodigoBarraLaje): PosicaoLajeproc => {
    const passa = flexao(mTcm, h, false);
    const automatica = escolheBarraLaje(registro, h, parametros, modo);
    if (!passa) {
      registro = 0;
      return { mTcm, as: 0, barra: { ok: false } };
    }
    if (imposta !== undefined && imposta < 0) {
      const barra = barraDoCodigo(imposta, parametros, modo);
      // Imposta: troca pela automática se As > 100/s·área (LAJEPROC.BAS:455).
      if (
        barra.ok &&
        !(registro > (100 / barra.espacamento) * parametros.bitolas[barra.indiceBitola]!.area)
      )
        return { mTcm, as: registro, barra };
    }
    return { mTcm, as: registro, barra: automatica };
  };

  for (const laje of esforcos.lajes) {
    // LAJEPROC.BAS:347: pula pré-moldada (1) e "comum não calculada" (3); o tipo 2
    // fica fora da numeração.
    if (laje.tipo !== 0) continue;
    const m = esforcos.momentos[laje.nome];
    if (m === undefined || !(m.h > 0)) {
      avisos.push(`${laje.nome}: sem H; o LAJEPROC não detalha a laje.`);
      continue;
    }
    const h = m.h;
    const mPositivo = m.mPositivoPrincipalTcm;
    const mSecundario =
      mPositivo > 0 ? s(laje.mu < 1 ? mPositivo * laje.mu : mPositivo / laje.mu) : 0;
    positivas[laje.nome] = {
      principal: positiva(mPositivo > 0 ? mPositivo : 0, h, laje.armaduraImposta?.principal),
      secundaria: positiva(mSecundario, h, laje.armaduraImposta?.secundaria),
    };

    // Negativas (L_13ee1, LAJEPROC.BAS:791-980).
    laje.codigos.forEach((codigo, bordo) => {
      if (!(codigo > 2)) return;
      const fator = m.bordos[bordo]?.fatorDirecao ?? 1;
      let mNegativo = s((Math.abs(mPositivo) * (codigo - 2) * fator) / 10);
      flexao(mNegativo, h, true);
      let as = registro;

      const indice = esforcos.continuidades.findIndex(
        (c) =>
          (c.lajeA === laje.nome && c.bordoA === bordo) ||
          (c.lajeB === laje.nome && c.bordoB === bordo),
      );
      const c = esforcos.continuidades[indice];
      if (c === undefined) {
        avisos.push(
          `${laje.nome}, lado ${bordo + 1}: engastado sem continuidade registrada; sem negativa.`,
        );
        return;
      }
      const ladoA = c.lajeA === laje.nome && c.bordoA === bordo;
      const vizinho = ladoA ? c.lajeB : c.lajeA;
      const bordoVizinho = ladoA ? (c.lajeB === null ? c.bordoA : c.bordoB) : c.bordoA;
      // R2: o original pula o vizinho quando o lado dele tem o mesmo número.
      const recalculaVizinho = vizinho !== null && (modo === "corrigido" || bordoVizinho !== bordo);
      const naoRecalculado = vizinho !== null && !recalculaVizinho ? vizinho : undefined;
      if (vizinho !== null && !recalculaVizinho) {
        avisos.push(
          `${laje.nome}, lado ${bordo + 1}: o vizinho ${vizinho} tem o mesmo número de lado e não foi ` +
            "recalculado, como no SISTRUT original: a negativa pode sair só com a armadura desta laje.",
        );
        memoria.push({
          descricao: `${laje.nome}, lado ${bordo + 1}: vizinho ${vizinho} não recalculado (R2)`,
          ref: "LAJEPROC.BAS:836, 855",
        });
      }
      if (recalculaVizinho) {
        const mv = esforcos.momentos[vizinho];
        const lv = lajes.get(vizinho);
        if (mv === undefined || lv === undefined) {
          avisos.push(
            `${laje.nome}, lado ${bordo + 1}: vizinho ${vizinho} sem momentos; usado só o As próprio.`,
          );
        } else {
          const codigoVizinho = lv.codigos[bordoVizinho] ?? 0;
          const fatorVizinho = mv.bordos[bordoVizinho]?.fatorDirecao ?? 1;
          const mVizinho = s(
            (Math.abs(mv.mPositivoPrincipalTcm) * (codigoVizinho - 2) * fatorVizinho) / 10,
          );
          flexao(mVizinho, mv.h, true);
          // LAJEPROC.BAS:856: As_viz = 0 ou (As_viz > As e As > 0).
          if (registro === 0 || (registro > as && as > 0)) {
            as = registro;
            mNegativo = mVizinho;
          }
        }
      }
      registro = as;
      const automatica = escolheBarraLaje(as, h, parametros, modo);
      const imposta = codigosNegativos[indice] ?? 0;
      let barra: BarraDeLaje;
      if (imposta > 0) {
        // Imposta pelo LAJECALC: só confere (LAJEPROC.BAS:865-889).
        barra = barraImpostaNaContinuidade(imposta, parametros, modo);
        const area = barra.ok ? parametros.bitolas[barra.indiceBitola]!.area : 0;
        if (!barra.ok || as > (area * 100) / barra.espacamento || as === 0) {
          avisos.push(
            `Continuidade ${c.lajeA} × ${c.lajeB ?? "engaste"}: armadura negativa imposta menor que a ` +
              "necessária; rode a otimização dos negativos.",
          );
          memoria.push({
            descricao: `Continuidade ${c.lajeA} × ${c.lajeB ?? "engaste"}: negativa imposta insuficiente`,
            ref: "LAJEPROC.BAS:881-882",
          });
        }
      } else {
        // LAJEPROC.BAS:892: CINT(−1000·bitola − espaçamento); "NAO" grava −10000 (D7).
        codigosNegativos[indice] = automatica.ok ? -automatica.codigo : -10000;
        barra = as === 0 ? { ok: false } : automatica;
      }
      negativas[indice] = {
        mTcm: mNegativo,
        as,
        barra,
        continuidade: { ...c, armaduraImposta: codigosNegativos[indice] ?? 0 },
        ...(naoRecalculado ? { vizinhoNaoRecalculado: naoRecalculado } : {}),
      };
      memoria.push({
        descricao: `${laje.nome}, negativa com ${vizinho ?? "engaste"}: ${barra.ok ? textoBarraLaje(barra) : "*"}`,
        formula: "maior As dos dois lados; barra pelo H da laje corrente",
        valor: as,
        unidade: "cm²/m",
        ref: REF,
      });
    });
  }

  return { positivas, negativas, avisos, memoria };
};

// Espessura mínima de uma laje (LAJECALC opção 3). Especificação: livros_laje.md
// 1.11 e 2.4; PLANO L6 e R1 (U32-010, U32-014, U32-015).
//
// Original: procura H de Hmin a Hmax, passo 1, só pela flexão (negativa máxima e
// positiva). O .LAP declara L/f 300/500, deformação lenta e Ec × 0,9, mas nenhum
// módulo usa esses valores (defeito R1; a coluna L/f imprime 0).
// Corrigido (R1): a mesma procura, e o H também precisa atender a flecha.
import type { Bordo, Vinculo } from "../../../dominio/obra";
import { atribuicao } from "../base/f32";
import type {
  DadosFlechaLaje,
  EspessuraMinimaLaje,
  MateriaisSistrut,
  MomentosDeLaje,
  ParametrosLaje,
} from "../base/tipos";
import { MPA_POR_TCM2 } from "../base/unidades";
import {
  cargaPorCoeficiente,
  relacoesNegativas,
  type SecaoComBarra,
  secaoComBarra,
} from "./armaduras";

// ---------------------------------------------------------------- flecha (R1)
// Cópia de `flechaElastica`/`tipoLaje`/`vaoReferencia` de
// `src/calculo/normas/nb1-78/lajes.ts` (V1 LcFlecha#, LcTipo$, LcVaoRef#), em t e cm.

type TipoFlecha = "cruz" | "ux" | "uy" | "bx" | "by";
const BORDOS: readonly Bordo[] = ["esquerdo", "inferior", "direito", "superior"];

/** Tipo pelos vínculos e pela relação dos vãos; null nos casos que a V1 não trata. */
function tipoFlecha(lx: number, ly: number, v: Record<Bordo, Vinculo>): TipoFlecha | null {
  const livres = BORDOS.filter((b) => v[b] === "livre");
  if (livres.length === 0) return ly / lx > 2 ? "ux" : ly / lx < 0.5 ? "uy" : "cruz";
  if (livres.length === 1) return livres[0] === "esquerdo" || livres[0] === "direito" ? "uy" : "ux";
  if (livres.length === 3) {
    const apoio = BORDOS.find((b) => v[b] !== "livre");
    if (apoio !== undefined && v[apoio] === "engastado")
      return apoio === "inferior" || apoio === "superior" ? "by" : "bx";
  }
  return null;
}

/** Vão que governa a flecha, m: o menor em cruz, o da direção armada, 2× o balanço. */
function vaoFlecha(lx: number, ly: number, tipo: TipoFlecha) {
  if (tipo === "ux") return lx;
  if (tipo === "uy") return ly;
  if (tipo === "bx") return 2 * lx;
  if (tipo === "by") return 2 * ly;
  return Math.min(lx, ly);
}

/** Coeficiente da faixa (base 384): 5 apoiada-apoiada, 2 apoiada-engastada, 1 biengastada. */
const coefFaixa = (b1: Vinculo, b2: Vinculo) => {
  const n = (b1 === "engastado" ? 1 : 0) + (b2 === "engastado" ? 1 : 0);
  return n === 0 ? 5 : n === 1 ? 2 : 1;
};

/** Flecha elástica imediata, cm, da carga `p` (t/m²) na laje de espessura `h` (cm),
 *  seção bruta, faixa de 100 cm, Ec em t/cm²; Marcus/Grashof em cruz. */
function flechaElasticaTcm(
  dados: DadosFlechaLaje,
  tipo: TipoFlecha,
  p: number,
  h: number,
  ec: number,
) {
  const { lx, ly, vinculos: v } = dados;
  const ei = (ec * 100 * h ** 3) / 12; // t·cm²
  const w = p / 100; // t/cm na faixa de 1 m
  const l4 = (l: number) => (l * 100) ** 4;
  const cx = coefFaixa(v.esquerdo, v.direito);
  const cy = coefFaixa(v.inferior, v.superior);
  if (tipo === "cruz") {
    const kx = (cy * ly ** 4) / (cx * lx ** 4 + cy * ly ** 4);
    return (cx * kx * w * l4(lx)) / (384 * ei);
  }
  if (tipo === "ux") return (cx * w * l4(lx)) / (384 * ei);
  if (tipo === "uy") return (cy * w * l4(ly)) / (384 * ei);
  if (tipo === "bx") return (w * l4(lx)) / (8 * ei);
  return (w * l4(ly)) / (8 * ei);
}

/** Fator (1 + φ) da parcela permanente com deformação lenta ligada: φ = 2, o mesmo
 *  de `FATOR_FLUENCIA` da V2 (NB-1/78 4.2.3.1.b; suposição da reconstrução V1). */
const FATOR_FLUENCIA = 3;

/**
 * Flecha total (permanente × (1 + φ) + acidental) e limite vão/L/f total, cm, e o
 * veredito com o limite vão/L/f acidental na parcela acidental (R1, PLANO 4.2;
 * parâmetros de flecha do .LAP, LAJE.BAS:1333-1336). Ec = mult·6600·√(fck + 3,5) MPa
 * (NB-1/78 8.2.5), convertido para t/cm². null se o tipo não é tratado.
 */
export function verificaFlechaLaje(
  dados: DadosFlechaLaje,
  q: number,
  h: number,
  materiais: MateriaisSistrut,
  parametros: ParametrosLaje,
) {
  const tipo = tipoFlecha(dados.lx, dados.ly, dados.vinculos);
  if (tipo === null) return null;
  const { lfTotal, lfAcidental, multiplicadorEc, deformacaoLenta } = parametros.flecha;
  const fckMpa = materiais.fck * MPA_POR_TCM2;
  const ec = (multiplicadorEc * 6600 * Math.sqrt(fckMpa + 3.5)) / MPA_POR_TCM2;
  const permanente = flechaElasticaTcm(dados, tipo, q - dados.acidental, h, ec);
  const acidental = flechaElasticaTcm(dados, tipo, dados.acidental, h, ec);
  const flecha = permanente * (deformacaoLenta ? FATOR_FLUENCIA : 1) + acidental;
  const vao = vaoFlecha(dados.lx, dados.ly, tipo) * 100;
  const limite = vao / lfTotal;
  return { flecha, limite, atende: flecha <= limite && acidental <= vao / lfAcidental };
}

// ---------------------------------------------------------------- procura de H

/**
 * Menor H de Hmin a Hmax (passo 1) em que a negativa máxima (M = 100·|p|·c_max, se
 * houver engaste) e a positiva (M = 100·p, 0 se p ≤ 0) passam na flexão; fica a
 * seção de MAIOR x, com o x/d e a barra dela (LAJECALC.BAS:819-869; livros_laje.md
 * 1.11). Sem H até Hmax: `ok: false` ("H necessario > H maximo configurado", H = −1;
 * LAJECALC.BAS:800-809). `momentosComH(h)` dá q, coeficiente e bordos com esse H.
 * Corrigido (R1): com `flecha`, o H também precisa atender vão/300 e vão/500.
 * E2E: H 7,0, x/d 0,382, # 6.3 c/ 7.5, pp 0,17, p 0,43 (livros_laje.md 2.4).
 */
export const espessuraMinimaLaje: EspessuraMinimaLaje = (
  momentosComH,
  materiais,
  parametros,
  modo,
  flecha,
) => {
  const s = atribuicao(modo);
  // FOR H = Hmin TO Hmax com H SINGLE (LAJECALC.BAS:823).
  for (let h = parametros.hMin; h <= parametros.hMax; h = s(h + 1)) {
    const momentos: MomentosDeLaje = momentosComH(h);
    const p = cargaPorCoeficiente(momentos, modo);
    const { maior } = relacoesNegativas(momentos.bordos, modo);
    let negativa: SecaoComBarra = { x: 0, xd: 0, as: 0, barra: { ok: false } };
    if (maior > 0) {
      negativa = secaoComBarra(s(100 * Math.abs(p) * maior), h, true, materiais, parametros, modo);
      if (negativa.x === -1) continue;
    }
    const positiva = secaoComBarra(p > 0 ? s(100 * p) : 0, h, false, materiais, parametros, modo);
    if (positiva.x === -1) continue;
    // LAJECALC.BAS:860-866: positiva com x menor que o da negativa volta para a negativa
    // (x, bitola e espaçamento); o "NAO" da escolha continua o da positiva.
    const secao = positiva.x < negativa.x ? negativa : positiva;
    const barra = positiva.barra.ok ? secao.barra : positiva.barra;
    let verificacao: { flecha: number; limite: number } | undefined;
    if (modo === "corrigido" && flecha !== undefined) {
      const f = verificaFlechaLaje(flecha, momentos.q, h, materiais, parametros);
      if (f !== null) {
        if (!f.atende) continue;
        verificacao = { flecha: f.flecha, limite: f.limite };
      }
    }
    return {
      ok: true,
      h,
      // x/d só é impresso com x > 0 (LAJECALC.BAS:745-750).
      xd: secao.x > 0 ? secao.xd : 0,
      barra,
      pesoProprio: momentos.pesoProprio,
      q: momentos.q,
      ...(verificacao ? { flecha: verificacao } : {}),
    };
  }
  return { ok: false };
};

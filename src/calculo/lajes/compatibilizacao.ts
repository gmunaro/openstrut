// Compatibilização dos momentos negativos entre lajes contínuas de um
// pavimento, como na V1 (LAJCALC.BM, LcCalculaTodas). A regra do valor
// compatibilizado vem da norma (Norma.compatibilizaNegativo); o resto é comum.
import { BORDOS, type Bordo, type Vinculo } from "../../dominio/obra";
import type { Etapa, LajeEsforcos } from "../tipos";
import { contatos, TOL, type GeometriaLaje } from "./vinculacao";

const REF = "V1 LAJCALC.BM (LcCalculaTodas)";
const REF_ALIVIO = "prática de projeto (revisão do SISTRUT V2) [VERIFICAR]";

/** Abaixo desta fração do negativo próprio o bordo é tratado como apoiado (com
 *  `recalcular`). [VERIFICAR] 50 % é critério de prática, sem item de norma nas
 *  fontes de docs/norma. */
export const LIMITE_ALIVIO = 0.5;

export interface LajeParaCompatibilizar {
  laje: GeometriaLaje & { nome: string };
  vinculos: Record<Bordo, Vinculo>;
  esforcos: LajeEsforcos;
}

/** Balanço: três bordos livres (o quarto é o engaste). */
const ehBalanco = (v: Record<Bordo, Vinculo>) =>
  BORDOS.filter((b) => v[b] === "livre").length === 3;

/** Laje sem cálculo (configuração não suportada): todos os esforços nulos, como
 *  a V1 deixa ao marcar temRes = 0. Ela fica fora da compatibilização. */
const semCalculo = (e: LajeEsforcos) =>
  BORDOS.every((b) => e.reacoes[b] === 0 && e.negativos[b] === 0);

const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/**
 * Devolve os esforços de cada laje (mesma ordem da entrada) com os negativos
 * compatibilizados e os positivos corrigidos (V1 LcCalculaTodas):
 * 1. Em cada bordo engastado com laje vizinha também engastada no bordo oposto,
 *    na mesma linha e com trecho comum > 1 mm, X = compatibiliza(X_própria,
 *    X_vizinha); com vários vizinhos vale o maior. Balanço não é reduzido: o
 *    bordo do balanço e o da laje vizinha ficam com o momento do balanço.
 * 2. Simetria: os dois lados do bordo comum ficam com o maior dos dois valores.
 * 3. Se o negativo de um bordo diminuiu ΔX, o positivo da mesma direção (mx
 *    para esquerdo/direito, my para inferior/superior) recebe ΔX/2. Não vale
 *    para balanço.
 * Na V1 os dois bordos também precisam ter a mesma viga; aqui isso já decorre
 * de estarem na mesma linha com trecho comum (LAJEGEOT junta numa viga só os
 * bordos colineares que se tocam).
 *
 * `recalcular` (opcional; a V1 não faz, então a NB-1/78 não passa) trata o
 * bordo cujo negativo compatibilizado ficou abaixo de LIMITE_ALIVIO do próprio
 * (caso típico: laje ao lado de balanço curto, que impõe o seu X pequeno). A
 * laje não está de fato engastada nesse bordo: `recalcular(laje, vinculos)`
 * devolve os esforços com esses bordos apoiados e
 * - mx, my, reações e flecha ficam com o maior entre o valor corrigido acima e o
 *   recalculado (os positivos sobem);
 * - os negativos dos outros bordos engastados ficam com o maior dos dois, e a
 *   simetria é refeita para a vizinha receber o mesmo valor;
 * - o bordo aliviado mantém o X compatibilizado (o do balanço).
 */
export function compatibilizaLajes(
  lajes: readonly LajeParaCompatibilizar[],
  compatibiliza: (xa: number, xb: number) => number,
  recalcular?: (laje: LajeParaCompatibilizar, vinculos: Record<Bordo, Vinculo>) => LajeEsforcos,
): LajeEsforcos[] {
  const indice = new Map(lajes.map((l, i) => [l.laje.id, i]));
  const ativa = lajes.map((l) => !semCalculo(l.esforcos));
  const balanco = lajes.map((l) => ehBalanco(l.vinculos));
  const engastado = (i: number, b: Bordo) => lajes[i]!.vinculos[b] === "engastado";
  // Pares (i, bordo) × (j, bordo oposto), ambos engastados e calculados, na ordem dos laços da V1.
  const pares = contatos(lajes.map((l) => l.laje))
    .filter((c) => c.sobreposicao > TOL)
    .map((c) => ({
      i: indice.get(c.laje)!,
      bordo: c.bordo,
      j: indice.get(c.vizinha)!,
      bordoVizinha: c.bordoVizinha,
    }))
    .filter(
      (p) => ativa[p.i] && ativa[p.j] && engastado(p.i, p.bordo) && engastado(p.j, p.bordoVizinha),
    );

  const xn = lajes.map((l) => ({ ...l.esforcos.negativos }));
  const xf = lajes.map((l) => ({ ...l.esforcos.negativos }));

  // 1. compatibilização com cada vizinho; vale o maior
  const achou = new Set<string>();
  for (const p of pares) {
    const xc = balanco[p.i]
      ? xn[p.i]![p.bordo]
      : balanco[p.j]
        ? xn[p.j]![p.bordoVizinha]
        : compatibiliza(xn[p.i]![p.bordo], xn[p.j]![p.bordoVizinha]);
    const chave = `${p.i}|${p.bordo}`;
    if (!achou.has(chave) || xc > xf[p.i]![p.bordo]) xf[p.i]![p.bordo] = xc;
    achou.add(chave);
  }
  // 2. simetria (mesma ordem e mesma atualização sequencial da V1)
  const simetria = () => {
    for (const p of pares) {
      const a = xf[p.i]!;
      const b = xf[p.j]!;
      if (b[p.bordoVizinha] > a[p.bordo]) a[p.bordo] = b[p.bordoVizinha];
      else b[p.bordoVizinha] = a[p.bordo];
    }
  };
  simetria();
  // 2b. bordos aliviados: recalcula a laje com eles apoiados (só com `recalcular`)
  const recalculo = lajes.map((l, i) => {
    if (!recalcular || !ativa[i] || balanco[i]) return null;
    const aliviados = BORDOS.filter((b) => xn[i]![b] > 0 && xf[i]![b] < LIMITE_ALIVIO * xn[i]![b]);
    if (aliviados.length === 0) return null;
    const vinculos = { ...l.vinculos };
    for (const b of aliviados) vinculos[b] = "apoiado";
    const esforcos = recalcular(l, vinculos);
    for (const b of BORDOS)
      if (!aliviados.includes(b) && l.vinculos[b] === "engastado")
        xf[i]![b] = Math.max(xf[i]![b], esforcos.negativos[b]);
    return { aliviados, esforcos };
  });
  if (recalculo.some((r) => r !== null)) simetria();
  // 3. aplica os negativos finais e corrige o positivo da mesma direção
  return lajes.map((l, i) => {
    if (!ativa[i]) return l.esforcos;
    const e = l.esforcos;
    const memoria: Etapa[] = [];
    let mx = e.mx;
    let my = e.my;
    let reacoes = e.reacoes;
    let flecha = e.flecha;
    for (const b of BORDOS) {
      const antes = xn[i]![b];
      const depois = xf[i]![b];
      if (depois === antes) continue;
      const vizinhas = pares
        .filter((p) => p.i === i && p.bordo === b)
        .map((p) => lajes[p.j]!.laje.nome)
        .join(", ");
      memoria.push({
        descricao: `Negativo do bordo ${b} compatibilizado com ${vizinhas}`,
        formula: balanco[i] ? "momento do balanço" : `${fmt(antes)} → ${fmt(depois)}`,
        valor: depois,
        unidade: "kN·m/m",
        ref: REF,
      });
      const dx = antes - depois;
      if (dx > 0 && !balanco[i]) {
        const horizontal = b === "inferior" || b === "superior";
        if (horizontal) my += dx / 2;
        else mx += dx / 2;
        memoria.push({
          descricao: `Positivo ${horizontal ? "my" : "mx"} corrigido pela redução do negativo do bordo ${b}`,
          formula: `m + ΔX/2, ΔX = ${fmt(dx)}`,
          valor: horizontal ? my : mx,
          unidade: "kN·m/m",
          ref: REF,
        });
      }
    }
    const rc = recalculo[i];
    if (rc) {
      const r = rc.esforcos;
      memoria.push({
        descricao: `Negativo compatibilizado < ${LIMITE_ALIVIO * 100} % do próprio no(s) bordo(s) ${rc.aliviados.join(", ")}: laje recalculada com esse(s) bordo(s) apoiado(s); vale o maior de cada esforço`,
        formula: `mx = max(${fmt(mx)}; ${fmt(r.mx)}); my = max(${fmt(my)}; ${fmt(r.my)})`,
        ref: REF_ALIVIO,
      });
      mx = Math.max(mx, r.mx);
      my = Math.max(my, r.my);
      reacoes = { ...reacoes };
      for (const b of BORDOS) reacoes[b] = Math.max(reacoes[b], r.reacoes[b]);
      flecha = Math.max(flecha, r.flecha);
    }
    if (memoria.length === 0) return e;
    return {
      ...e,
      mx,
      my,
      reacoes,
      flecha,
      negativos: xf[i]!,
      avisos: [...e.avisos],
      memoria: [...e.memoria, ...memoria],
    };
  });
}

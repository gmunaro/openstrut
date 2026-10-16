// Montagem das cargas de um pavimento: lajes → vigas → pilares. Portada da V1
// (LAJMONT.BM, LmMonta; VIGA.BAS, VigResumoPilares) com uma extensão: viga
// apoiada em outra viga vira carga concentrada na viga de apoio (a V1 só
// relatava esse caso, VIGA.BAS:839).
//
// A análise da viga (contínua, por rigidez) entra como parâmetro: a montagem
// não depende de como ela é feita, só das reações por apoio.
import {
  BORDOS,
  type Bordo,
  type Laje,
  type Pavimento,
  type Pilar,
  type Viga,
} from "../dominio/obra";
import type { TrechoPilar } from "../dominio/obra";
import {
  TOL,
  colineares,
  cruzamento,
  eixoDaViga,
  eixoDoBordo,
  type Eixo,
  pontoDoEixo,
  posicaoNoEixo,
  sobreposicao,
} from "../dominio/gerar";
import type { ComMemoria, Etapa, LajeEsforcos } from "./tipos";

const REF_V1 = "V1 LAJMONT.BM";

/** Parcela permanente (g) e acidental (q) de uma carga, características. */
export interface CargaGQ {
  g: number;
  q: number;
}

export interface MontagemEntrada {
  pavimento: Pavimento;
  /** Reações características por bordo, kN/m, indexadas pelo id da laje. */
  reacoes: Readonly<Record<string, LajeEsforcos["reacoes"]>>;
  /** Peso específico do concreto armado, kN/m³ (Norma.pesoConcreto). */
  pesoConcreto: number;
}

export type ApoioMontado =
  | { tipo: "pilar"; id: string; nome: string }
  | { tipo: "viga"; id: string; nome: string }
  /** Extremidade livre: o tramo vizinho é um balanço. */
  | { tipo: "livre" };

/** Reação de uma viga apoiada, aplicada na viga de apoio. g e q são a reação de
 *  projeto (g + q desfavorável, AnaliseVigaMinima.reacoesProjeto). */
export interface CargaConcentrada extends CargaGQ {
  /** Distância ao nó inicial do tramo, m. */
  a: number;
  /** A mesma reação com q em todos os tramos (AnaliseVigaMinima.reacoes), kN;
   *  g + q − total é o acréscimo da envoltória que entra no equilíbrio. */
  total: number;
  /** Nome da viga que se apoia aqui. */
  origem: string;
}

/** Tramo entre dois nós. g e q são as cargas distribuídas totais, kN/m:
 *  g = lajes.g + pesoProprio + cargaLinear; q = lajes.q. */
export interface TramoMontado extends CargaGQ {
  vao: number;
  /** Reações das lajes (média sobre o tramo, como a V1), kN/m. */
  lajes: CargaGQ;
  /** bw · h · γc, kN/m. */
  pesoProprio: number;
  /** Carga linear da viga (parede etc.), kN/m. */
  cargaLinear: number;
  concentradas: CargaConcentrada[];
}

export interface VigaMontada {
  id: string;
  nome: string;
  /** Seção, cm. */
  bw: number;
  h: number;
  /** Eixo da viga e a posição de cada nó ao longo dele, m (nTramos + 1 nós). */
  eixo: Eixo;
  nos: number[];
  /** Um apoio por nó; "livre" só nas extremidades. */
  apoios: ApoioMontado[];
  tramos: TramoMontado[];
}

/** O mínimo que a montagem precisa da análise de uma viga, por nó (kN, 0 nos
 *  livres), separado em g e q:
 *  - `reacoes`: acidental em todos os tramos; a soma fecha com a soma das
 *    cargas e é o que verificarEquilibrio confere;
 *  - `reacoesProjeto`: g + q desfavorável (envoltória, o que a V1 somava nos
 *    pilares); é a carga levada aos pilares (Nk) e às vigas de apoio. Com a
 *    sobrecarga alternada fica acima da anterior (apoio interno de 3 vãos
 *    iguais: 1,2qL contra 1,1qL; apoio vizinho a balanço: bem mais). */
export interface AnaliseVigaMinima {
  reacoes: CargaGQ[];
  reacoesProjeto: CargaGQ[];
}

export type VigaCalculada<R extends AnaliseVigaMinima> = VigaMontada & { analise: R };

/** Carga de um pilar vinda das vigas do pavimento. g, q e n somam as reações
 *  com q em todos os tramos (equilíbrio); nProjeto soma as de projeto (Nk). */
export interface CargaPilar extends CargaGQ {
  id: string;
  nome: string;
  x: number;
  y: number;
  /** g + q, kN. */
  n: number;
  /** Σ reações de projeto (g + q desfavorável), kN: a carga do pilar para o Nk. */
  nProjeto: number;
}

export interface Montagem<R extends AnaliseVigaMinima> extends ComMemoria {
  /** Vigas analisadas, na ordem de cálculo (as que se apoiam em outras antes). */
  vigas: VigaCalculada<R>[];
  /** Vigas montadas mas não analisadas (apoios insuficientes, ciclo de apoios). */
  naoCalculadas: VigaMontada[];
  /** Carga de cada pilar do pavimento vinda das vigas. */
  pilares: CargaPilar[];
}

/** Cargas de superfície de uma laje, kN/m²: g = peso próprio + revestimento; q = sobrecarga. */
export function cargaLaje(l: Laje, pesoConcreto: number): CargaGQ {
  return { g: (l.h / 100) * pesoConcreto + l.revestimento, q: l.sobrecarga };
}

const somaGQ = (a: CargaGQ, b: CargaGQ) => ({ g: a.g + b.g, q: a.q + b.q });
const total = (c: CargaGQ) => c.g + c.q;

const pilarEm = (pilares: readonly Pilar[], x: number, y: number) =>
  pilares.find((p) => Math.abs(p.x - x) <= TOL && Math.abs(p.y - y) <= TOL);

const extremidade = (e: Eixo, s: number) => Math.abs(s - e.s1) <= TOL || Math.abs(s - e.s2) <= TOL;

interface VigaEixo {
  viga: Viga;
  eixo: Eixo;
}

/** Escolha explícita do par (`Viga.apoiaEm`, o "Vx apoia em Vy" do LAJEMONT): true se
 *  `a` se apoia em `b`, false se `b` se apoia em `a`, undefined sem escolha. */
const escolha = (a: VigaEixo, b: VigaEixo) =>
  a.viga.apoiaEm?.includes(b.viga.id)
    ? true
    : b.viga.apoiaEm?.includes(a.viga.id)
      ? false
      : undefined;

/** O ponto está no trecho do pilar-parede (tolerância TOL), como o LAJEMONT o procura
 *  (pilarDoPonto, LAJEMONT.BAS:4831-4920): faixa exata na direção do trecho. */
function noTrecho(t: TrechoPilar, x: number, y: number) {
  const { inicio: a, fim: b } = t;
  const dentro = (v: number, p: number, q: number) => v >= Math.min(p, q) && v <= Math.max(p, q);
  if (Math.abs(a.x - b.x) <= TOL) return Math.abs(x - a.x) <= TOL && dentro(y, a.y, b.y);
  if (Math.abs(a.y - b.y) <= TOL) return Math.abs(y - a.y) <= TOL && dentro(x, a.x, b.x);
  const naReta = Math.abs(y - (((b.y - a.y) * (x - a.x)) / (b.x - a.x) + a.y)) <= TOL;
  return naReta && dentro(x, a.x, b.x) && dentro(y, a.y, b.y);
}

/** Num cruzamento sem pilar, decide se `a` se apoia em `b` (regra da V2; a V1
 *  punha pilar em todo cruzamento). A viga que termina no ponto se apoia na que
 *  passa; se as duas passam, a de menor h se apoia na de maior h (empate: a mais
 *  curta na mais longa; persistindo, a vertical na horizontal). Se as duas
 *  terminam no ponto, aqui nenhuma se apoia; `geometriaDasVigas` depois apoia a que
 *  ficaria sem 2 apoios na outra (viga sobre as pontas de balanços). */
function apoiaEm(a: VigaEixo, b: VigaEixo, sa: number, sb: number) {
  const escolhida = escolha(a, b);
  if (escolhida !== undefined) return escolhida;
  const aTermina = extremidade(a.eixo, sa);
  const bTermina = extremidade(b.eixo, sb);
  if (aTermina !== bTermina) return aTermina;
  if (aTermina) return false;
  if (a.viga.h !== b.viga.h) return a.viga.h < b.viga.h;
  const la = a.eixo.s2 - a.eixo.s1;
  const lb = b.eixo.s2 - b.eixo.s1;
  if (Math.abs(la - lb) > TOL) return la < lb;
  return !a.eixo.horizontal;
}

/** Uma viga do pavimento com o eixo, os nós e o apoio de cada nó (sem cargas). */
export interface GeometriaViga extends VigaEixo {
  /** Posição de cada nó ao longo do eixo, m, em ordem crescente. */
  nos: number[];
  /** Um apoio por nó; "livre" só nas extremidades. */
  apoios: ApoioMontado[];
}

/** Nós e apoios das vigas do pavimento (regra da V2): pilares sobre o eixo e as
 *  vigas em que ela se apoia nos cruzamentos sem pilar (`apoiaEm`, e a viga sem apoios
 *  que termina na ponta de outra); ponta sem apoio
 *  vira extremidade livre (balanço). Viga que não é horizontal nem vertical fica de
 *  fora, com aviso. A montagem da V2 e o caminho do SISTRUT (`sistrut/obra.ts`) usam
 *  esta função, para que os dois vejam os mesmos apoios. */
export function geometriaDasVigas(pavimento: Pavimento): {
  vigas: GeometriaViga[];
  avisos: string[];
} {
  const avisos: string[] = [];
  const vigasEixo: VigaEixo[] = [];
  for (const viga of pavimento.vigas) {
    const eixo = eixoDaViga(viga);
    if (eixo) vigasEixo.push({ viga, eixo });
    else avisos.push(`Viga ${viga.nome} não é horizontal nem vertical: ignorada.`);
  }

  // pilares-parede (`Pavimento.trechosPilares`): apoio em cada ponto do eixo sobre o
  // trecho, como o LAJEMONT (L_312b3, LAJEMONT.BAS:4819-4920): as pontas da viga, os
  // cruzamentos com outras vigas e os vértices das lajes que caem nele; o centro, onde
  // fica o pilar da V2, não é ponto do eixo
  const paredes = (pavimento.trechosPilares ?? []).flatMap((t) => {
    const p = pavimento.pilares.find((x) => x.id === t.pilar);
    return p ? [{ t, p }] : [];
  });
  const paredeEm = (x: number, y: number) => paredes.find((w) => noTrecho(w.t, x, y))?.p;
  const temPilar = (x: number, y: number) =>
    pilarEm(pavimento.pilares, x, y) !== undefined || paredeEm(x, y) !== undefined;
  const verticesDasLajes = pavimento.lajes.flatMap(
    (l) =>
      l.poligono ?? [
        { x: l.x, y: l.y },
        { x: l.x, y: l.y + l.ly },
        { x: l.x + l.lx, y: l.y + l.ly },
        { x: l.x + l.lx, y: l.y },
      ],
  );
  const apoiosNasParedes = (ve: VigaEixo) => {
    if (paredes.length === 0) return [];
    const ss = [ve.eixo.s1, ve.eixo.s2];
    for (const outra of vigasEixo) {
      if (outra.eixo.horizontal === ve.eixo.horizontal) continue;
      const ponto = ve.eixo.horizontal
        ? cruzamento(ve.eixo, outra.eixo)
        : cruzamento(outra.eixo, ve.eixo);
      if (ponto) ss.push(ve.eixo.horizontal ? ponto.x : ponto.y);
    }
    for (const v of verticesDasLajes) {
      const s = posicaoNoEixo(ve.eixo, v.x, v.y);
      if (s !== undefined) ss.push(s);
    }
    const apoios: { s: number; apoio: ApoioMontado }[] = [];
    for (const s of ss) {
      if (apoios.some((a) => Math.abs(a.s - s) <= TOL)) continue;
      const { x, y } = pontoDoEixo(ve.eixo, s);
      const p = paredeEm(x, y);
      if (p) apoios.push({ s, apoio: { tipo: "pilar", id: p.id, nome: p.nome } });
    }
    return apoios;
  };

  // apoios de cada viga: pilares sobre o eixo e vigas em que ela se apoia
  const apoiosPorViga = vigasEixo.map((ve) => {
    const apoios: { s: number; apoio: ApoioMontado }[] = apoiosNasParedes(ve);
    for (const p of pavimento.pilares) {
      if (paredes.some((w) => w.p.id === p.id)) continue;
      const s = posicaoNoEixo(ve.eixo, p.x, p.y);
      if (s !== undefined) apoios.push({ s, apoio: { tipo: "pilar", id: p.id, nome: p.nome } });
    }
    for (const outra of vigasEixo) {
      if (outra.eixo.horizontal === ve.eixo.horizontal) continue;
      const ponto = ve.eixo.horizontal
        ? cruzamento(ve.eixo, outra.eixo)
        : cruzamento(outra.eixo, ve.eixo);
      if (!ponto || temPilar(ponto.x, ponto.y)) continue;
      const s = ve.eixo.horizontal ? ponto.x : ponto.y;
      const so = outra.eixo.horizontal ? ponto.x : ponto.y;
      if (apoiaEm(ve, outra, s, so))
        apoios.push({ s, apoio: { tipo: "viga", id: outra.viga.id, nome: outra.viga.nome } });
    }
    return apoios.sort((a, b) => a.s - b.s);
  });

  // Duas vigas que terminam no mesmo ponto sem pilar: nenhuma se apoia na outra, a
  // menos que uma delas fique sem os 2 apoios de que precisa e a outra os tenha. Então
  // a primeira se apoia na segunda (viga sobre as pontas de balanços; no SISTRUT é a
  // escolha "Vx apoia em Vy" do LAJEMONT, caso v2par_viga_fluxo).
  const reais = (i: number) => apoiosPorViga[i]?.length ?? 0;
  const precisa = vigasEixo.map((_, i) => reais(i) < 2);
  vigasEixo.forEach((ve, i) => {
    if (!precisa[i]) return;
    for (const [j, outra] of vigasEixo.entries()) {
      if (outra.eixo.horizontal === ve.eixo.horizontal || precisa[j]) continue;
      // com escolha explícita do par, vale ela (já aplicada em `apoiaEm`)
      if (escolha(ve, outra) !== undefined) continue;
      const ponto = ve.eixo.horizontal
        ? cruzamento(ve.eixo, outra.eixo)
        : cruzamento(outra.eixo, ve.eixo);
      if (!ponto || temPilar(ponto.x, ponto.y)) continue;
      const s = ve.eixo.horizontal ? ponto.x : ponto.y;
      const so = outra.eixo.horizontal ? ponto.x : ponto.y;
      if (!extremidade(ve.eixo, s) || !extremidade(outra.eixo, so)) continue;
      apoiosPorViga[i]!.push({
        s,
        apoio: { tipo: "viga", id: outra.viga.id, nome: outra.viga.nome },
      });
    }
    apoiosPorViga[i]!.sort((a, b) => a.s - b.s);
  });

  const vigas = vigasEixo.map(({ viga, eixo }, iv): GeometriaViga => {
    const nos: number[] = [];
    const apoios: ApoioMontado[] = [];
    const apoiosViga = apoiosPorViga[iv] ?? [];
    if (!apoiosViga.some((a) => Math.abs(a.s - eixo.s1) <= TOL)) {
      nos.push(eixo.s1);
      apoios.push({ tipo: "livre" });
    }
    for (const a of apoiosViga) {
      if (nos.length > 0 && Math.abs(a.s - (nos.at(-1) ?? 0)) <= TOL) continue;
      nos.push(a.s);
      apoios.push(a.apoio);
    }
    if (Math.abs((nos.at(-1) ?? eixo.s1) - eixo.s2) > TOL) {
      nos.push(eixo.s2);
      apoios.push({ tipo: "livre" });
    }
    return { viga, eixo, nos, apoios };
  });
  return { vigas, avisos };
}

/** Monta as vigas do pavimento (apoios, tramos, cargas distribuídas), analisa cada
 *  uma com `analisar` na ordem certa (a viga apoiada antes da viga de apoio, que
 *  recebe a reação como carga concentrada) e soma as reações nos pilares.
 *  Regras da V1 (LmMonta): carga de laje por bordo dividida em g = r·(p−q)/p e
 *  q = r·q/p; carga de cada tramo = média das cargas sobre ele (preserva o total);
 *  viga com menos de 2 apoios não é calculada. */
export function montarPavimento<R extends AnaliseVigaMinima>(
  entrada: MontagemEntrada,
  analisar: (v: VigaMontada) => R,
): Montagem<R> {
  const { pavimento, reacoes, pesoConcreto } = entrada;
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const pilaresVazios = (): CargaPilar[] =>
    pavimento.pilares.map((p): CargaPilar => ({
      id: p.id,
      nome: p.nome,
      x: p.x,
      y: p.y,
      g: 0,
      q: 0,
      n: 0,
      nProjeto: 0,
    }));

  const semCalculo = pavimento.lajes.filter((l) => !reacoes[l.id]).map((l) => l.nome);
  if (semCalculo.length > 0) {
    avisos.push(
      `Lajes sem cálculo (${semCalculo.join(", ")}): calcule as lajes antes da montagem.`,
    );
    return { vigas: [], naoCalculadas: [], pilares: pilaresVazios(), avisos, memoria };
  }

  const geometria = geometriaDasVigas(pavimento);
  avisos.push(...geometria.avisos);
  const montadas = geometria.vigas.map(({ viga, eixo, nos, apoios }): VigaMontada => {
    const pesoProprio = viga.pesoProprio ?? ((viga.bw * viga.h) / 10_000) * pesoConcreto;
    const tramos = nos.slice(1).map((fim, k): TramoMontado => {
      const inicio = nos[k] ?? eixo.s1;
      const lajes = cargaDasLajesNoTramo(eixo, inicio, fim);
      return {
        vao: fim - inicio,
        lajes,
        pesoProprio,
        cargaLinear: viga.cargaLinear,
        g: lajes.g + pesoProprio + viga.cargaLinear,
        q: lajes.q,
        concentradas: [],
      };
    });
    return { id: viga.id, nome: viga.nome, bw: viga.bw, h: viga.h, eixo, nos, apoios, tramos };
  });
  const vigasEixo = geometria.vigas;

  /** Reações das lajes sobre [s1, s2] do eixo, média no trecho (V1 LmMonta passo 4). */
  function cargaDasLajesNoTramo(eixo: Eixo, s1: number, s2: number): CargaGQ {
    const L = s2 - s1;
    let c = { g: 0, q: 0 };
    if (L <= TOL) return c;
    for (const l of pavimento.lajes) {
      const p = cargaLaje(l, pesoConcreto);
      const pTotal = total(p);
      if (pTotal <= 0) continue;
      for (const b of BORDOS) {
        const r = reacoes[l.id]?.[b] ?? 0;
        const eb = eixoDoBordo(l, b);
        if (r === 0 || !colineares(eixo, eb)) continue;
        const ov = sobreposicao(s1, s2, eb.s1, eb.s2);
        if (ov <= 0) continue;
        c = somaGQ(c, { g: (r * (p.g / pTotal) * ov) / L, q: (r * (p.q / pTotal) * ov) / L });
      }
    }
    return c;
  }
  // bordos com reação que não caem (inteiros) sobre vigas (V1: "bordo com reação e sem viga de apoio")
  for (const l of pavimento.lajes) {
    for (const b of BORDOS) {
      const r = reacoes[l.id]?.[b] ?? 0;
      if (Math.abs(r) <= TOL) continue;
      const eb = eixoDoBordo(l, b);
      const coberto = vigasEixo
        .filter((ve) => colineares(ve.eixo, eb))
        .reduce((s, ve) => s + sobreposicao(ve.eixo.s1, ve.eixo.s2, eb.s1, eb.s2), 0);
      if (coberto < eb.s2 - eb.s1 - TOL) avisos.push(nomeBordo(l, b));
    }
  }

  // ordem de cálculo: a viga apoiada antes da viga de apoio
  // (ordenação topológica: cada viga espera as vigas que se apoiam nela)
  const indice = new Map(montadas.map((v, i) => [v.id, i]));
  const apoiaNas = montadas.map((v) =>
    v.apoios.flatMap((a) => (a.tipo === "viga" ? [indice.get(a.id) ?? -1] : [])),
  );
  const espera = montadas.map(() => 0);
  for (const js of apoiaNas) for (const j of js) if (j >= 0) espera[j] = (espera[j] ?? 0) + 1;
  const ordem: number[] = [];
  const fila = montadas.map((_, i) => i).filter((i) => espera[i] === 0);
  while (fila.length > 0) {
    const i = fila.shift() ?? 0;
    ordem.push(i);
    for (const j of apoiaNas[i] ?? []) {
      if (j < 0) continue;
      espera[j] = (espera[j] ?? 0) - 1;
      if (espera[j] === 0) fila.push(j);
    }
  }

  const vigas: VigaCalculada<R>[] = [];
  const naoCalculadas: VigaMontada[] = [];
  const ciclo = montadas.filter((_, i) => !ordem.includes(i));
  if (ciclo.length > 0) {
    avisos.push(
      `Vigas não calculadas por apoios em ciclo (uma se apoia na outra): ${ciclo.map((v) => v.nome).join(", ")}. Ponha um pilar num dos cruzamentos.`,
    );
    naoCalculadas.push(...ciclo);
  }

  const cargaPilar = new Map(pilaresVazios().map((p) => [p.id, p]));
  const calculada = new Set<string>();
  const naoCalc = new Set(ciclo.map((v) => v.id));
  // V1 VcCaso%: viga precisa de 2 apoios reais. Marcadas antes do laço para que
  // a reação de quem se apoia nelas seja acusada como perdida.
  for (const i of ordem) {
    const v = montadas[i];
    if (!v || v.apoios.filter((a) => a.tipo !== "livre").length >= 2) continue;
    avisos.push(`Viga ${v.nome} sem apoios suficientes: não calculada.`);
    naoCalculadas.push(v);
    naoCalc.add(v.id);
  }

  for (const i of ordem) {
    const v = montadas[i];
    if (!v || naoCalc.has(v.id)) continue;
    for (const t of v.tramos) {
      memoria.push({
        descricao: `${v.nome}: carga distribuída no tramo de ${fmt(t.vao)} m (lajes ${fmt(t.lajes.g)} + ${fmt(t.lajes.q)}, peso próprio ${fmt(t.pesoProprio)}, linear ${fmt(t.cargaLinear)})`,
        formula: "g = g_lajes + bw·h·γc + carga linear; q = q_lajes",
        valor: total(t),
        unidade: "kN/m",
        ref: REF_V1,
      });
    }
    const analise = analisar(v);
    if (analise.reacoes.length !== v.nos.length || analise.reacoesProjeto.length !== v.nos.length)
      throw new Error(
        `Análise da viga ${v.nome} devolveu ${analise.reacoes.length}/${analise.reacoesProjeto.length} reações para ${v.nos.length} nós.`,
      );
    vigas.push({ ...v, analise });
    calculada.add(v.id);

    analise.reacoes.forEach((reacao, k) => {
      const apoio = v.apoios[k];
      if (!apoio || apoio.tipo === "livre") return;
      const projeto = analise.reacoesProjeto[k] ?? reacao;
      memoria.push({
        descricao: `${v.nome}: reação de projeto no apoio ${apoio.nome} (g + q desfavorável; com q em todos os tramos: ${fmt(total(reacao))} kN)`,
        valor: total(projeto),
        unidade: "kN",
        ref: apoio.tipo === "pilar" ? "V1 VIGA.BAS (VigResumoPilares)" : "V2: viga apoiada em viga",
      });
      if (apoio.tipo === "pilar") {
        const p = cargaPilar.get(apoio.id);
        if (p)
          Object.assign(p, somaGQ(p, reacao), {
            n: p.n + total(reacao),
            nProjeto: p.nProjeto + total(projeto),
          });
        return;
      }
      const j = indice.get(apoio.id);
      const apoioViga = j === undefined ? undefined : montadas[j];
      if (!apoioViga || naoCalc.has(apoioViga.id) || calculada.has(apoioViga.id)) {
        avisos.push(
          `${v.nome} se apoia em ${apoio.nome}, que não foi calculada: ${fmt(total(projeto))} kN não chegam aos pilares.`,
        );
        return;
      }
      const ponto = pontoDoEixo(v.eixo, v.nos[k] ?? 0);
      const s = apoioViga.eixo.horizontal ? ponto.x : ponto.y;
      const t = apoioViga.nos.findIndex(
        (n, m) =>
          m + 1 < apoioViga.nos.length && s >= n - TOL && s <= (apoioViga.nos[m + 1] ?? n) + TOL,
      );
      const tramo = apoioViga.tramos[t];
      if (!tramo) return;
      tramo.concentradas.push({
        a: s - (apoioViga.nos[t] ?? 0),
        g: projeto.g,
        q: projeto.q,
        total: total(reacao),
        origem: v.nome,
      });
    });
  }

  const pilares = [...cargaPilar.values()];
  for (const p of pilares) {
    if (p.nProjeto !== 0)
      memoria.push({
        descricao: `Pilar ${p.nome}: soma das reações de projeto das vigas (com q em todos os tramos: ${fmt(p.n)} kN)`,
        valor: p.nProjeto,
        unidade: "kN",
        ref: "V1 VIGA.BAS (VigResumoPilares)",
      });
  }
  return { vigas, naoCalculadas, pilares, avisos, memoria };
}

const nomeBordo = (l: Laje, b: Bordo) => `${l.nome}: bordo ${b} com reação e sem viga de apoio.`;

const fmt = (x: number) => x.toFixed(2);

export interface Equilibrio extends ComMemoria {
  /** Σ (g + q) · lx · ly das lajes, kN. */
  cargaLajes: number;
  /** Σ reação · comprimento de todos os bordos das lajes, kN. */
  reacoesLajes: number;
  /** Parte das reações das lajes que chegou às vigas, kN. */
  lajesNasVigas: number;
  /** Σ cargas distribuídas das vigas (lajes + peso próprio + linear) · vão, kN. */
  cargaVigas: number;
  /** Σ N dos pilares com q em todos os tramos, kN. */
  cargaPilares: number;
  /** Acréscimo da envoltória nas reações levadas de viga a viga, kN: entra na
   *  viga de apoio e chega aos pilares, por isso cargaPilares = cargaVigas + ele. */
  acrescimoTransferido: number;
  /** Σ N de projeto dos pilares (reações g + q desfavorável), kN: o que vai ao Nk. */
  cargaPilaresProjeto: number;
  ok: boolean;
}

/** Confere as somas de carga do pavimento:
 *  - reações das lajes x carga das lajes (aviso se faltar mais de 3%, como a V1
 *    LmMonta passo 5, ou se sobrar mais de 8%: as tabelas elásticas sobram 4–7%);
 *  - reações das lajes x o que chegou às vigas;
 *  - cargas das vigas (+ acréscimo da envoltória levado de viga a viga) x carga
 *    nos pilares, as duas com q em todos os tramos.
 *  As duas últimas usam a tolerância relativa dada. A soma de projeto nos pilares
 *  (envoltória, que vai ao Nk) e o acréscimo dela só entram na memória. */
export function verificarEquilibrio<R extends AnaliseVigaMinima>(
  entrada: MontagemEntrada,
  montagem: Montagem<R>,
  tolerancia = 1e-6,
): Equilibrio {
  const { pavimento, reacoes, pesoConcreto } = entrada;
  let cargaLajes = 0;
  let reacoesLajes = 0;
  for (const l of pavimento.lajes) {
    cargaLajes += total(cargaLaje(l, pesoConcreto)) * l.lx * l.ly;
    for (const b of BORDOS) {
      const eb = eixoDoBordo(l, b);
      reacoesLajes += (reacoes[l.id]?.[b] ?? 0) * (eb.s2 - eb.s1);
    }
  }
  const tramos = [...montagem.vigas, ...montagem.naoCalculadas].flatMap((v) => v.tramos);
  const lajesNasVigas = tramos.reduce((s, t) => s + total(t.lajes) * t.vao, 0);
  const cargaVigas = tramos.reduce((s, t) => s + total(t) * t.vao, 0);
  const cargaPilares = montagem.pilares.reduce((s, p) => s + p.n, 0);
  const cargaPilaresProjeto = montagem.pilares.reduce((s, p) => s + p.nProjeto, 0);
  const acrescimoTransferido = montagem.vigas
    .flatMap((v) => v.tramos.flatMap((t) => t.concentradas))
    .reduce((s, c) => s + total(c) - c.total, 0);

  const avisos: string[] = [];
  const difere = (a: number, b: number, tol: number) =>
    Math.abs(a - b) > tol * Math.max(Math.abs(a), Math.abs(b), 1e-9);
  // Reações das lajes x carga: abaixo da carga é erro (carga perdida); acima,
  // até 8% é a folga a favor da segurança das tabelas elásticas (Pinheiro/Bares,
  // NBR 6118: alívios considerados pela metade) e não reprova; a V1 (charneiras)
  // fecha exato. Fora disso, aviso.
  const excesso = cargaLajes > 0 ? (reacoesLajes - cargaLajes) / cargaLajes : 0;
  if (cargaLajes > 0 && (excesso < -0.03 || excesso > 0.08))
    avisos.push(
      `A somatória das reações das lajes (${fmt(reacoesLajes)} kN) difere da carga total das lajes (${fmt(cargaLajes)} kN) em ${(excesso * 100).toFixed(1)}%.`,
    );
  if (difere(lajesNasVigas, reacoesLajes, tolerancia))
    avisos.push(
      `Reações das lajes (${fmt(reacoesLajes)} kN) diferem da carga que chega às vigas (${fmt(lajesNasVigas)} kN).`,
    );
  if (difere(cargaPilares, cargaVigas + acrescimoTransferido, tolerancia))
    avisos.push(
      `Carga nos pilares (${fmt(cargaPilares)} kN) difere da carga das vigas (${fmt(cargaVigas + acrescimoTransferido)} kN).`,
    );

  const etapa = (descricao: string, valor: number, formula: string): Etapa => ({
    descricao,
    formula,
    valor,
    unidade: "kN",
    ref: REF_V1,
  });
  return {
    cargaLajes,
    reacoesLajes,
    lajesNasVigas,
    cargaVigas,
    cargaPilares,
    acrescimoTransferido,
    cargaPilaresProjeto,
    ok: avisos.length === 0,
    avisos,
    memoria: [
      etapa("Carga total das lajes", cargaLajes, "Σ (g + q) · lx · ly"),
      etapa("Reações das lajes nos bordos", reacoesLajes, "Σ r · comprimento do bordo"),
      etapa("Reações das lajes nas vigas", lajesNasVigas, "Σ (g + q)_lajes · vão"),
      etapa("Carga total das vigas", cargaVigas, "Σ (g + q) · vão"),
      etapa(
        "Acréscimo da envoltória nas reações levadas de viga a viga",
        acrescimoTransferido,
        "Σ (R projeto − R com q em todos os tramos)",
      ),
      etapa("Carga nos pilares (q em todos os tramos)", cargaPilares, "Σ N"),
      etapa(
        "Carga de projeto nos pilares (g + q desfavorável, vai ao Nk)",
        cargaPilaresProjeto,
        "Σ N projeto",
      ),
      etapa(
        "Acréscimo da envoltória nos pilares",
        cargaPilaresProjeto - cargaPilares,
        "Σ N projeto − Σ N",
      ),
    ],
  };
}

// Quantitativos da obra: volume de concreto, área de forma e ESTIMATIVA do peso
// de aço de lajes, vigas e pilares, por pavimento (com as repetições) e no total.
// O peso de aço sai das barras adotadas no dimensionamento com comprimentos
// convencionais (abaixo); não é tabela de aço: o detalhamento de barras é fase 2.
//
// Convenções (todas aproximações, na memória de cálculo):
// - Geometria pelos eixos: laje lx·ly; viga de eixo a eixo; pilar com o pé-direito
//   (piso a piso). Os cruzamentos viga-pilar entram nos dois elementos.
// - Laje: concreto lx·ly·h; forma = fundo lx·ly.
// - Viga: concreto L·bw·(h − hlaje), com hlaje = a maior espessura das lajes com
//   bordo sobre a viga (0 se nenhuma), porque a faixa da laje já está na laje;
//   forma = fundo L·bw + 2 laterais L·(h − hlaje), descontando a laje dos dois lados.
// - Pilar: concreto b·h·pé-direito; forma = perímetro 2(b + h)·(pé-direito − hviga),
//   com hviga = a maior viga que passa pelo pilar (a fôrma dela cobre esse trecho).
// - Aço de laje: área adotada por metro (φ, s) × dimensões: positivas em toda a
//   laje; negativa de cada bordo ao longo do bordo, entrando 0,25·lmenor na laje
//   (a laje vizinha conta o seu lado); total + 10 % de ancoragens e emendas.
// - Aço de viga, por tramo: barras positivas × vão; negativas de cada apoio ×
//   0,25·vão (no balanço, × vão inteiro); estribos: n = ⌈vão/s⌉ de perímetro
//   2(bw − 2c) + 2(h − 2c), sem ganchos. Porta-estribos não entram.
// - Aço de pilar, por nível: barras × (pé-direito + emenda de 40φ); estribos
//   n = ⌈pé-direito/s⌉ de perímetro 2(b − 2c) + 2(h − 2c), sem ganchos.
// - Peso por metro de barra: π φ²/4 · 7850 kg/m³ (NBR 6118:2023, 8.3.3).
import type { Laje, Obra, Pavimento, Pilar, Viga } from "../dominio/obra";
import { BORDOS, type Bordo } from "../dominio/obra";
import { alturaVigaNoPilar, espessuraLajeNaViga, formaPilar } from "./formas";
export { espessuraLajeNaViga };
import type { ResultadoObra, ResultadoTramo, ResultadoViga } from "./fluxo";
import type { ApoioMontado, TramoMontado } from "./montagem";
import type { Barra, BarrasLongitudinais, ComMemoria, Etapa, LajeArmadura } from "./tipos";

/** Massa específica do aço, kg/m³ (NBR 6118:2023, 8.3.3). */
export const MASSA_ACO = 7850;
/** Acréscimo de ancoragens e emendas no aço das lajes. */
export const ACRESCIMO_LAJE = 0.1;
/** Fração do vão (laje: lmenor) coberta pela armadura negativa de cada lado do apoio. */
export const FRACAO_NEGATIVO = 0.25;
/** Comprimento de emenda das barras de pilar, em diâmetros. */
export const EMENDA_PILAR = 40;

const REF = "estimativa (detalhamento: fase 2)";
const REF_ACO = "NBR 6118:2023, 8.3.3";

/** Concreto (m³), forma (m²) e aço estimado (kg). */
export interface Quantidades {
  concreto: number;
  forma: number;
  aco: number;
}

export interface QuantidadesPorTipo {
  lajes: Quantidades;
  vigas: Quantidades;
  pilares: Quantidades;
  total: Quantidades;
}

/** Um pavimento já multiplicado pelas repetições. */
export interface QuantitativoPavimento extends QuantidadesPorTipo, ComMemoria {
  nome: string;
  repeticoes: number;
}

export interface Quantitativos extends QuantidadesPorTipo, ComMemoria {
  pavimentos: QuantitativoPavimento[];
}

const zero = (): Quantidades => ({ concreto: 0, forma: 0, aco: 0 });
const soma = (...qs: Quantidades[]): Quantidades =>
  qs.reduce(
    (a, q) => ({ concreto: a.concreto + q.concreto, forma: a.forma + q.forma, aco: a.aco + q.aco }),
    zero(),
  );
const vezes = (q: Quantidades, k: number): Quantidades => ({
  concreto: q.concreto * k,
  forma: q.forma * k,
  aco: q.aco * k,
});

/** Taxa de aço, kg/m³ de concreto (NaN sem concreto). */
export const taxaAco = (q: Quantidades) => (q.concreto > 0 ? q.aco / q.concreto : NaN);

/** Peso por metro de uma barra de bitola φ (mm), kg/m: π φ²/4 · 7850. */
export const pesoPorMetro = (phi: number) => ((Math.PI * (phi / 1000) ** 2) / 4) * MASSA_ACO;

/** Área de aço por metro de uma malha φ c/s, cm²/m (0 se não há barra). */
const areaPorMetro = (b: Barra) =>
  b.phi > 0 && b.espacamento > 0 ? ((Math.PI * (b.phi / 10) ** 2) / 4) * (100 / b.espacamento) : 0;

/** Peso de aço de uma malha φ c/s cobrindo `largura` × `comprimento` (m), kg. */
const pesoMalha = (b: Barra, largura: number, comprimento: number) =>
  (areaPorMetro(b) / 10_000) * largura * comprimento * MASSA_ACO;

const temBarra = (b: Barra) => b.phi > 0 && b.espacamento > 0;
const f = (x: number, casas = 2) => x.toFixed(casas);

/** Resultado de um elemento (uma ocorrência, sem repetições). */
export interface QuantElemento extends Quantidades, ComMemoria {}

/** Laje: concreto, forma de fundo e aço das malhas adotadas + 10 %. */
export function quantLaje(
  laje: Pick<Laje, "nome" | "lx" | "ly" | "h">,
  armadura: Pick<LajeArmadura, "barrasX" | "barrasY" | "barrasNegativos"> | undefined,
): QuantElemento {
  const { nome, lx, ly } = laje;
  const h = laje.h / 100;
  const concreto = lx * ly * h;
  const forma = lx * ly;
  const memoria: Etapa[] = [
    {
      descricao: `${nome}: concreto`,
      formula: `lx·ly·h = ${f(lx)}·${f(ly)}·${f(h, 3)}`,
      valor: concreto,
      unidade: "m³",
      ref: REF,
    },
    {
      descricao: `${nome}: forma (fundo)`,
      formula: `lx·ly`,
      valor: forma,
      unidade: "m²",
      ref: REF,
    },
  ];
  const avisos: string[] = [];
  if (!armadura) {
    avisos.push(`${nome}: sem armadura calculada; aço não estimado.`);
    return { concreto, forma, aco: 0, avisos, memoria };
  }
  // barras X correm em x (comprimento lx) distribuídas em ly; Y o contrário
  let bruto = pesoMalha(armadura.barrasX, ly, lx) + pesoMalha(armadura.barrasY, lx, ly);
  if (!temBarra(armadura.barrasX) || !temBarra(armadura.barrasY))
    avisos.push(`${nome}: armadura positiva sem barra adotada; aço subestimado.`);
  const entrada = FRACAO_NEGATIVO * Math.min(lx, ly);
  const negativos: string[] = [];
  for (const b of BORDOS) {
    const barra = armadura.barrasNegativos[b];
    if (!barra) continue;
    if (!temBarra(barra)) {
      avisos.push(`${nome}: negativa do bordo ${b} sem barra adotada; aço subestimado.`);
      continue;
    }
    bruto += pesoMalha(barra, comprimentoBordo(laje, b), entrada);
    negativos.push(b);
  }
  const aco = bruto * (1 + ACRESCIMO_LAJE);
  memoria.push({
    descricao: `${nome}: aço estimado (positivas${negativos.length ? ` + negativas ${negativos.join(", ")} com ${f(entrada)} m na laje` : ""}) × 1,10`,
    formula: `Σ as·largura·comprimento·${MASSA_ACO} × (1 + ${ACRESCIMO_LAJE})`,
    valor: aco,
    unidade: "kg",
    ref: REF,
  });
  return { concreto, forma, aco, avisos, memoria };
}

const comprimentoBordo = (l: Pick<Laje, "lx" | "ly">, b: Bordo) =>
  b === "esquerdo" || b === "direito" ? l.ly : l.lx;

/** O que a estimativa usa do dimensionamento da viga. */
export interface VigaArmada {
  viga: { apoios: readonly ApoioMontado[]; tramos: readonly Pick<TramoMontado, "vao">[] };
  tramos: readonly Pick<ResultadoTramo, "positivo" | "negativoEsq" | "negativoDir" | "estribo">[];
}

/** Viga: concreto e forma abaixo da laje, aço das barras adotadas e estribos.
 *  `hLaje` em cm, `cobrimento` em cm. */
export function quantViga(
  viga: Pick<Viga, "nome" | "x1" | "y1" | "x2" | "y2" | "bw" | "h">,
  hLaje: number,
  armada: VigaArmada | undefined,
  cobrimento: number,
): QuantElemento {
  const { nome } = viga;
  const comprimento = Math.hypot(viga.x2 - viga.x1, viga.y2 - viga.y1);
  const bw = viga.bw / 100;
  const alma = Math.max(0, viga.h - hLaje) / 100;
  const concreto = comprimento * bw * alma;
  const forma = comprimento * (bw + 2 * alma);
  const memoria: Etapa[] = [
    {
      descricao: `${nome}: concreto abaixo da laje (h laje = ${f(hLaje, 1)} cm)`,
      formula: `L·bw·(h − hlaje) = ${f(comprimento)}·${f(bw, 3)}·${f(alma, 3)}`,
      valor: concreto,
      unidade: "m³",
      ref: REF,
    },
    {
      descricao: `${nome}: forma (fundo + 2 laterais abaixo da laje)`,
      formula: `L·(bw + 2(h − hlaje)) = ${f(comprimento)}·(${f(bw, 3)} + 2·${f(alma, 3)})`,
      valor: forma,
      unidade: "m²",
      ref: REF,
    },
  ];
  const avisos: string[] = [];
  if (!armada || armada.tramos.length === 0) {
    avisos.push(`${nome}: sem armadura calculada; aço não estimado.`);
    return { concreto, forma, aco: 0, avisos, memoria };
  }
  const perimetroEstribo = 2 * (viga.bw - 2 * cobrimento) + 2 * (viga.h - 2 * cobrimento);
  const ultimo = armada.tramos.length - 1;
  let aco = 0;
  armada.tramos.forEach((t, i) => {
    const vao = armada.viga.tramos[i]?.vao ?? 0;
    const balanco =
      (i === 0 && armada.viga.apoios[0]?.tipo === "livre") ||
      (i === ultimo && armada.viga.apoios.at(-1)?.tipo === "livre");
    const lNeg = balanco ? vao : FRACAO_NEGATIVO * vao;
    const barras = (b: Pick<BarrasLongitudinais, "n" | "phi"> | null, l: number) =>
      b ? b.n * l * pesoPorMetro(b.phi) : 0;
    const longitudinal =
      barras(t.positivo.barras, vao) +
      barras(t.negativoEsq.barras, lNeg) +
      barras(t.negativoDir.barras, lNeg);
    const e = t.estribo;
    const nEstribos = e && e.espacamento > 0 ? Math.ceil((vao * 100) / e.espacamento) : 0;
    const estribos = e ? ((nEstribos * perimetroEstribo) / 100) * pesoPorMetro(e.phi) : 0;
    if (!e) avisos.push(`${nome} tramo ${i + 1}: sem estribo adotado; aço subestimado.`);
    for (const s of [t.positivo, t.negativoEsq, t.negativoDir])
      if (s.flexao && !s.barras)
        avisos.push(`${nome} tramo ${i + 1}: armadura sem barras adotadas; aço subestimado.`);
    aco += longitudinal + estribos;
    memoria.push({
      descricao: `${nome} tramo ${i + 1}: aço estimado (positiva × ${f(vao)} m, negativas × ${f(lNeg)} m, ${nEstribos} estribos de ${f(perimetroEstribo, 1)} cm)`,
      formula: `${f(longitudinal)} + ${f(estribos)}`,
      valor: longitudinal + estribos,
      unidade: "kg",
      ref: REF,
    });
  });
  return { concreto, forma, aco, avisos: [...new Set(avisos)], memoria };
}

/** O que a estimativa usa do dimensionamento do pilar num nível. */
export interface PilarArmado {
  barras: Pick<BarrasLongitudinais, "n" | "phi">;
  estribo: Barra;
}

/** Um lance de pilar (um nível): concreto, forma e aço com emenda de 40φ.
 *  `peDireito` em m, `cobrimento` e `hViga` (maior viga no pilar) em cm. */
export function quantPilar(
  pilar: Pick<Pilar, "nome" | "b" | "h">,
  peDireito: number,
  armado: PilarArmado | undefined,
  cobrimento: number,
  hViga = 0,
): QuantElemento {
  const { nome } = pilar;
  const b = pilar.b / 100;
  const h = pilar.h / 100;
  const concreto = b * h * peDireito;
  const forma = formaPilar(pilar, peDireito, hViga);
  const memoria: Etapa[] = [
    {
      descricao: `${nome}: concreto`,
      formula: `b·h·pé-direito = ${f(b, 3)}·${f(h, 3)}·${f(peDireito)}`,
      valor: concreto,
      unidade: "m³",
      ref: REF,
    },
    {
      descricao: `${nome}: forma`,
      formula: `2(b + h)·(pé-direito − hviga) = 2(${f(b, 3)} + ${f(h, 3)})·(${f(peDireito)} − ${f(hViga / 100)})`,
      valor: forma,
      unidade: "m²",
      ref: REF,
    },
  ];
  const avisos: string[] = [];
  if (!armado || armado.barras.n === 0 || armado.barras.phi <= 0) {
    avisos.push(`${nome}: sem armadura dimensionada; aço não estimado.`);
    return { concreto, forma, aco: 0, avisos, memoria };
  }
  const { n, phi } = armado.barras;
  const lBarra = peDireito + (EMENDA_PILAR * phi) / 1000;
  const longitudinal = n * lBarra * pesoPorMetro(phi);
  const e = armado.estribo;
  const perimetro = 2 * (pilar.b - 2 * cobrimento) + 2 * (pilar.h - 2 * cobrimento);
  const nEstribos = e.espacamento > 0 ? Math.ceil((peDireito * 100) / e.espacamento) : 0;
  const estribos = e.phi > 0 ? ((nEstribos * perimetro) / 100) * pesoPorMetro(e.phi) : 0;
  if (!(e.phi > 0 && e.espacamento > 0))
    avisos.push(`${nome}: sem estribo adotado; aço subestimado.`);
  memoria.push({
    descricao: `${nome}: aço estimado (${n} φ${phi} × ${f(lBarra)} m com emenda 40φ, ${nEstribos} estribos de ${f(perimetro, 1)} cm)`,
    formula: `${f(longitudinal)} + ${f(estribos)}`,
    valor: longitudinal + estribos,
    unidade: "kg",
    ref: REF,
  });
  return { concreto, forma, aco: longitudinal + estribos, avisos, memoria };
}

const chave = (p: Pick<Pilar, "x" | "y">) => `${p.x.toFixed(3)};${p.y.toFixed(3)}`;

/** Quantitativos de um pavimento, já multiplicados pelas repetições. Lajes e
 *  vigas são iguais em todas as repetições; o aço dos pilares vem de cada nível. */
function quantPavimento(
  pav: Pavimento,
  obra: Obra,
  r: ResultadoObra,
  rp: ResultadoObra["pavimentos"][number] | undefined,
): QuantitativoPavimento {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const rep = Number.isInteger(pav.repeticoes) && pav.repeticoes >= 1 ? pav.repeticoes : 0;
  if (rep === 0)
    avisos.push(`Repetições inválidas (${pav.repeticoes}); pavimento fora dos quantitativos.`);
  const junta = (q: QuantElemento) => {
    avisos.push(...q.avisos);
    memoria.push(...q.memoria);
    return q;
  };

  const lajes = soma(
    ...pav.lajes.map((l) =>
      junta(quantLaje(l, rp?.lajes.find((x) => x.laje.id === l.id)?.armadura)),
    ),
  );
  const vigasCalc = new Map<string, ResultadoViga>(rp?.vigas.map((v) => [v.viga.id, v]) ?? []);
  const vigas = soma(
    ...pav.vigas.map((v) =>
      junta(
        quantViga(
          v,
          espessuraLajeNaViga(v, pav.lajes),
          vigasCalc.get(v.id),
          obra.materiais.cobrimentoViga,
        ),
      ),
    ),
  );
  let pilares = zero();
  for (const p of pav.pilares)
    for (let k = 1; k <= rep; k++) {
      const res = r.pilares.find(
        (x) => x.pavimentoId === pav.id && x.repeticao === k && chave(x.pilar) === chave(p),
      )?.resultado;
      const nome = rep > 1 ? `${p.nome} (${k}/${rep})` : p.nome;
      const q = junta(
        quantPilar(
          { ...p, nome },
          pav.peDireito,
          res,
          obra.materiais.cobrimentoPilar,
          alturaVigaNoPilar(p, pav.vigas),
        ),
      );
      pilares = soma(pilares, q);
    }

  const porTipo = {
    lajes: vezes(lajes, rep),
    vigas: vezes(vigas, rep),
    pilares,
  };
  if (rep > 1)
    memoria.push({
      descricao: `Lajes e vigas multiplicadas pelas ${rep} repetições; pilares somados nível a nível`,
      valor: rep,
      ref: REF,
    });
  return {
    nome: pav.nome,
    repeticoes: pav.repeticoes,
    ...porTipo,
    total: soma(porTipo.lajes, porTipo.vigas, porTipo.pilares),
    avisos: [...new Set(avisos)],
    memoria,
  };
}

/** Quantitativos de concreto, forma e aço (estimado) da obra calculada. */
export function calcularQuantitativos(obra: Obra, r: ResultadoObra): Quantitativos {
  const pavimentos = obra.pavimentos.map((p) =>
    quantPavimento(
      p,
      obra,
      r,
      r.pavimentos.find((rp) => rp.pavimento.id === p.id),
    ),
  );
  const lajes = soma(...pavimentos.map((p) => p.lajes));
  const vigas = soma(...pavimentos.map((p) => p.vigas));
  const pilares = soma(...pavimentos.map((p) => p.pilares));
  const memoria: Etapa[] = [
    {
      descricao:
        "O peso de aço é ESTIMATIVA: barras adotadas com comprimentos convencionais; o detalhamento de barras é fase 2",
      ref: REF,
    },
    {
      descricao: "Peso por metro de barra: π φ²/4 · 7850 kg/m³",
      valor: MASSA_ACO,
      unidade: "kg/m³",
      ref: REF_ACO,
    },
    {
      descricao: `Lajes: + ${ACRESCIMO_LAJE * 100} % de ancoragens e emendas; negativas entram ${FRACAO_NEGATIVO}·lmenor na laje`,
      ref: REF,
    },
    {
      descricao: `Vigas: negativas × ${FRACAO_NEGATIVO}·vão de cada lado do apoio (balanço: vão inteiro); estribos sem ganchos; sem porta-estribos`,
      ref: REF,
    },
    {
      descricao: `Pilares: barras × (pé-direito + ${EMENDA_PILAR}φ de emenda); estribos sem ganchos`,
      ref: REF,
    },
    {
      descricao:
        "Concreto e forma pelos eixos; viga abaixo da laje mais espessa que se apoia nela; forma de viga = fundo + 2 laterais",
      ref: REF,
    },
  ];
  return {
    pavimentos,
    lajes,
    vigas,
    pilares,
    total: soma(lajes, vigas, pilares),
    avisos: pavimentos.flatMap((p) => p.avisos.map((a) => `${p.nome}: ${a}`)),
    memoria,
  };
}

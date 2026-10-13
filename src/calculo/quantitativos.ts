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
// - Pilar: concreto b·h·pé-direito; forma pela regra certa de formas.ts (faces até
//   o fundo da laje, descontada a faixa de cada viga que chega).
// - Aço de laje: área adotada por metro (φ, s) × dimensões: positivas em toda a
//   laje; negativa de cada bordo ao longo do bordo, entrando 0,25·lmenor na laje
//   (a laje vizinha conta o seu lado). Laje em balanço (bordo oposto livre): a
//   barra é dela e vai da borda livre até 0,25·x dentro da vizinha, x = o maior dos
//   menores vãos das duas (a regra do detalhamento); a vizinha não conta esse bordo.
//   Total + 10 % de ancoragens e emendas.
// - Aço de viga, por tramo: barras positivas × vão; negativas de cada apoio ×
//   0,25·vão (no balanço, × vão inteiro); estribos: n = ⌈vão/s⌉ de perímetro
//   2(bw − 2c) + 2(h − 2c), sem ganchos. Porta-estribos não entram.
// - Aço de pilar, por nível: barras × (pé-direito + emenda de 40φ); estribos
//   n = ⌈pé-direito/s⌉ de perímetro 2(b − 2c) + 2(h − 2c), sem ganchos.
// - Peso por metro de barra: π φ²/4 · 7850 kg/m³ (NBR 6118:2023, 8.3.3).
//
// Modo "original" (Obra.modoCalculo; docs/MODO-CALCULO.md, itens E e F): como o
// SISTRUT de 1991, cada laje conta a negativa de cada bordo inteira, 0,25·lmenor
// para cada lado (V1 LAJEPROC ImprimeLinha), e a vizinha conta a mesma barra de
// novo; volume e fôrma por tipo saem pela regra da impressão (FORMIMP) e a tela
// (FORMEDCA) tem os seus totais em volumeTela e formaTela.
import type {
  Bordo,
  Laje,
  ModoCalculo,
  Obra,
  Pavimento,
  Pilar,
  Viga,
  Vinculo,
} from "../dominio/obra";
import { BORDOS } from "../dominio/obra";
import {
  encontroNoPilar,
  espessuraLajeNaViga,
  formaPilar,
  formulaFormaPilar,
  hLajeDaViga,
  SEM_ENCONTRO,
  type EncontroPilar,
  type RegraQuantitativo,
} from "./formas";
export { espessuraLajeNaViga };
import type { ResultadoObra, ResultadoPavimento, ResultadoTramo, ResultadoViga } from "./fluxo";
import { BORDO_OPOSTO, contatos, linhaDoBordo, TOL } from "./lajes/vinculacao";
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
  /** Modo de cálculo da obra (Obra.modoCalculo). */
  modoCalculo: ModoCalculo;
  /** Volume de concreto (m³) e área de fôrma (m²) da obra para a TELA e para o
   *  RELATÓRIO (item F de docs/MODO-CALCULO.md). No modo "corrigido" os dois pares
   *  são o total certo (= total). No "original", como o SISTRUT de 1991: a tela
   *  pela regra do editor de formas (FORMEDCA: volume sem os pilares; fôrma com o
   *  pilar no pé-direito inteiro) e o relatório pela da impressão (FORMIMP: viga
   *  com a altura inteira, contando de novo a faixa da laje; = total). */
  volumeTela: number;
  volumeRelatorio: number;
  formaTela: number;
  formaRelatorio: number;
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

/** Vizinhança da laje que muda a conta das negativas (montada por quantPavimento). */
export interface VizinhancaLaje {
  /** Vínculos do cálculo (ResultadoLaje.entrada.vinculos): bordo engastado com o
   *  oposto livre é bordo de balanço. */
  vinculos: Record<Bordo, Vinculo>;
  /** Maior dos menores vãos (m) das lajes vizinhas de cada bordo de balanço. */
  vaoMenorVizinha: Partial<Record<Bordo, number>>;
  /** Bordos cuja negativa é a barra da laje vizinha em balanço, contada lá. */
  negativaNoBalanco: readonly Bordo[];
}

/** Bordo engastado com o oposto livre: a negativa dele é a armadura do balanço. */
const bordoDeBalanco = (v: Record<Bordo, Vinculo>, b: Bordo) =>
  v[b] === "engastado" && v[BORDO_OPOSTO[b]] === "livre";

/** Comprimento da negativa do bordo b contado nesta laje, m, e a regra usada:
 *  - bordo de balanço (D, nos dois modos): da borda livre (vão inteiro na direção
 *    da barra) até 0,25·x dentro da vizinha, x = máx(lmenor; vão da vizinha);
 *  - "corrigido": 0 se a barra é da vizinha em balanço; senão 0,25·lmenor, o lado
 *    desta laje (a vizinha conta o dela);
 *  - "original" (E): 2 · 0,25·lmenor, a barra inteira, como a V1 LAJEPROC; a
 *    vizinha conta a mesma barra de novo. */
function comprimentoNegativa(
  laje: Pick<Laje, "lx" | "ly">,
  b: Bordo,
  viz: VizinhancaLaje | undefined,
  modo: ModoCalculo,
) {
  const lMenor = Math.min(laje.lx, laje.ly);
  if (viz && bordoDeBalanco(viz.vinculos, b)) {
    const vao = b === "esquerdo" || b === "direito" ? laje.lx : laje.ly;
    const x = Math.max(lMenor, viz.vaoMenorVizinha[b] ?? 0);
    return { l: vao + FRACAO_NEGATIVO * x, regra: `balanço ${f(vao)} + 0,25·${f(x)}` };
  }
  if (modo === "original") return { l: 2 * FRACAO_NEGATIVO * lMenor, regra: "2·0,25·lmenor" };
  if (viz?.negativaNoBalanco.includes(b)) return { l: 0, regra: "na laje em balanço" };
  return { l: FRACAO_NEGATIVO * lMenor, regra: "0,25·lmenor" };
}

/** Laje: concreto, forma de fundo e aço das malhas adotadas + 10 %. Sem
 *  `vizinhanca`, nenhum bordo é tratado como balanço. */
export function quantLaje(
  laje: Pick<Laje, "nome" | "lx" | "ly" | "h">,
  armadura: Pick<LajeArmadura, "barrasX" | "barrasY" | "barrasNegativos"> | undefined,
  vizinhanca?: VizinhancaLaje,
  modo: ModoCalculo = "corrigido",
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
  const negativos: string[] = [];
  for (const b of BORDOS) {
    const barra = armadura.barrasNegativos[b];
    if (!barra) continue;
    if (!temBarra(barra)) {
      avisos.push(`${nome}: negativa do bordo ${b} sem barra adotada; aço subestimado.`);
      continue;
    }
    const { l, regra } = comprimentoNegativa(laje, b, vizinhanca, modo);
    bruto += pesoMalha(barra, comprimentoBordo(laje, b), l);
    negativos.push(`${b} ${f(l)} m (${regra})`);
  }
  const aco = bruto * (1 + ACRESCIMO_LAJE);
  memoria.push({
    descricao: `${nome}: aço estimado (positivas${negativos.length ? ` + negativas: ${negativos.join("; ")}` : ""}) × 1,10`,
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
 *  `peDireito` em m, `cobrimento` em cm; `encontro` = laje e vigas que a fôrma
 *  desconta (formas.ts; padrão: nenhuma, perímetro × pé-direito). */
export function quantPilar(
  pilar: Pick<Pilar, "nome" | "b" | "h">,
  peDireito: number,
  armado: PilarArmado | undefined,
  cobrimento: number,
  encontro: EncontroPilar = SEM_ENCONTRO,
): QuantElemento {
  const { nome } = pilar;
  const b = pilar.b / 100;
  const h = pilar.h / 100;
  const concreto = b * h * peDireito;
  const forma = formaPilar(pilar, peDireito, encontro);
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
      formula: formulaFormaPilar(pilar, peDireito, encontro),
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

/** Vizinhança das lajes calculadas do pavimento, por id: bordos de balanço com o
 *  vão das vizinhas e, nas vizinhas, o bordo cuja negativa a laje em balanço conta
 *  (só quando o bordo do balanço cobre o bordo inteiro da vizinha e ela não é
 *  balanço nesse bordo; no contato parcial as duas contam). */
export function vizinhancaLajes(rp: Pick<ResultadoPavimento, "lajes">) {
  const porId = new Map(rp.lajes.map((r) => [r.laje.id, r]));
  const viz = new Map<string, VizinhancaLaje>(
    rp.lajes.map((r) => [
      r.laje.id,
      { vinculos: r.entrada.vinculos, vaoMenorVizinha: {}, negativaNoBalanco: [] },
    ]),
  );
  for (const c of contatos(rp.lajes.map((r) => r.laje))) {
    const a = porId.get(c.laje);
    const b = porId.get(c.vizinha);
    const va = viz.get(c.laje);
    const vb = viz.get(c.vizinha);
    if (!a || !b || !va || !vb || !bordoDeBalanco(a.entrada.vinculos, c.bordo)) continue;
    va.vaoMenorVizinha[c.bordo] = Math.max(
      va.vaoMenorVizinha[c.bordo] ?? 0,
      Math.min(b.laje.lx, b.laje.ly),
    );
    const linha = linhaDoBordo(b.laje, c.bordoVizinha);
    const cobre = c.sobreposicao >= linha.fim - linha.inicio - TOL;
    if (
      cobre &&
      b.entrada.vinculos[c.bordoVizinha] === "engastado" &&
      !bordoDeBalanco(b.entrada.vinculos, c.bordoVizinha)
    )
      vb.negativaNoBalanco = [...vb.negativaNoBalanco, c.bordoVizinha];
  }
  return viz;
}

/** Quantitativos de um pavimento, já multiplicados pelas repetições, pela regra
 *  de volume e fôrma (formas.ts). Lajes e vigas são iguais em todas as
 *  repetições; o aço dos pilares vem de cada nível. Na regra "editor" (FORMEDCA)
 *  os pilares não entram no volume. */
function quantPavimento(
  pav: Pavimento,
  obra: Obra,
  r: ResultadoObra,
  rp: ResultadoObra["pavimentos"][number] | undefined,
  regra: RegraQuantitativo,
): QuantitativoPavimento {
  const modo = obra.modoCalculo ?? "corrigido";
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

  const viz = rp ? vizinhancaLajes(rp) : new Map<string, VizinhancaLaje>();
  const lajes = soma(
    ...pav.lajes.map((l) =>
      junta(quantLaje(l, rp?.lajes.find((x) => x.laje.id === l.id)?.armadura, viz.get(l.id), modo)),
    ),
  );
  const vigasCalc = new Map<string, ResultadoViga>(rp?.vigas.map((v) => [v.viga.id, v]) ?? []);
  const vigas = soma(
    ...pav.vigas.map((v) =>
      junta(
        quantViga(
          v,
          hLajeDaViga(regra, v, pav.lajes),
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
          regra === "certa" ? encontroNoPilar(p, pav) : SEM_ENCONTRO,
        ),
      );
      pilares = soma(pilares, regra === "editor" ? { ...q, concreto: 0 } : q);
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
  const modo = obra.modoCalculo ?? "corrigido";
  const porRegra = (regra: RegraQuantitativo) =>
    obra.pavimentos.map((p) =>
      quantPavimento(
        p,
        obra,
        r,
        r.pavimentos.find((rp) => rp.pavimento.id === p.id),
        regra,
      ),
    );
  // por tipo: a regra certa ou, no original, a do relatório do SISTRUT (FORMIMP)
  const pavimentos = porRegra(modo === "original" ? "impressao" : "certa");
  const lajes = soma(...pavimentos.map((p) => p.lajes));
  const vigas = soma(...pavimentos.map((p) => p.vigas));
  const pilares = soma(...pavimentos.map((p) => p.pilares));
  const total = soma(lajes, vigas, pilares);
  const tela = modo === "original" ? soma(...porRegra("editor").map((p) => p.total)) : total;
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
      descricao: `Lajes: + ${ACRESCIMO_LAJE * 100} % de ancoragens e emendas; negativas entram ${FRACAO_NEGATIVO}·lmenor na laje; a de balanço vai da borda livre a ${FRACAO_NEGATIVO}·x dentro da vizinha (x = maior dos menores vãos) e só a laje em balanço a conta`,
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
    modo === "original"
      ? {
          descricao:
            "Modo original (SISTRUT de 1991): concreto e forma por tipo como a impressão (FORMIMP: viga com a altura inteira, pilar no pé-direito inteiro); a tela usa a regra do editor (FORMEDCA: volume sem pilares, viga sem a laje de referência); negativas das lajes contadas em cada laje do bordo (2·0,25·lmenor)",
          ref: "V1 FORMIMP.BAS, FORMCALC.BM e LAJEPROC.BAS (docs/MODO-CALCULO.md)",
        }
      : {
          descricao:
            "Concreto e forma pelos eixos; viga abaixo da laje mais espessa que se apoia nela; forma de viga = fundo + 2 laterais; pilar até o fundo da laje, descontada a faixa de cada viga que chega",
          ref: REF,
        },
  ];
  return {
    pavimentos,
    lajes,
    vigas,
    pilares,
    total,
    modoCalculo: modo,
    volumeTela: tela.concreto,
    volumeRelatorio: total.concreto,
    formaTela: tela.forma,
    formaRelatorio: total.forma,
    avisos: pavimentos.flatMap((p) => p.avisos.map((a) => `${p.nome}: ${a}`)),
    memoria,
  };
}

// Dimensionamento de viga do SISTRUT 4.0 (DESDIM, FUN_1000_13f7): flexão por apoio e
// por tramo (seção T, armadura dupla, As,mín), cisalhamento com ψ = 0,225 + 15ρ,
// estribos, flecha e fissuração. Os esforços saem do DESCALC (`desinitDescalc.ts`),
// que o DESDIM roda a partir do .VIG antes de dimensionar (DESDIM.BAS:795-797).
// Fonte: V1 nova, `_Arquivo/Sistrust/dist/src-original/desenho/DESDIM.BAS`;
// livros_arm_forma_des.md 1 e 4.3 (U03, U04-005, U05-007/010); PLANO D1-D6, R8, R9, H.
// Unidades do original: m e t nos esforços, cm e t/cm² nas seções, M em t·cm dentro
// do dimensionamento.
import { atribuicao } from "../base/f32";
import type {
  ApoioDimensionado,
  BarrasArranjo,
  CisalhamentoViga,
  DimensionaViga,
  EntradaDesdim,
  EsforcosDesdim,
  EsforcosTramoDesdim,
  FissuracaoViga,
  FlexaoViga,
  ModoSistrut,
  SecaoViga,
  TramoDimensionado,
} from "../base/tipos";
import type { Etapa } from "../../tipos";
import { areaBitola, arranjoCompressao, arranjoTracao, leArranjo } from "./desdim-barras";
import {
  aswCortante,
  bitolasEstriboViga,
  estribosLadoALado,
  estriboLado,
} from "./desdim-cisalhamento";
import { type SecaoCalculo, flexaoSecao, taxaArmaduraMinima, xiLimite } from "./desdim-flexao";
import { type Fissuracao, fissuracao, flechaEJ, flechaTramo, moduloEc } from "./desdim-flecha";
import { aplicaAlteracoes, type ElementoArmadura } from "./desdim-alteracao";
import { analisaDescalc } from "./desinitDescalc";

// ---------------------------------------------------------------- esforços do DESCALC

/** Seção de cálculo de um índice de tramo do original. Balanço sem seção própria
 *  herda bw e hw do apoio vizinho (A_1260(MAX(0, t − 1)), DESDIM.BAS:2919-2929). */
export function secaoDoTramo(entrada: EntradaDesdim, indice: number): SecaoViga {
  const n = entrada.viga.tramos.length;
  const { secoes } = entrada;
  const propria =
    indice === 0
      ? secoes.balancoEsquerdo
      : indice === n + 1
        ? secoes.balancoDireito
        : secoes.tramos[indice - 1];
  if (propria && propria.bw > 0 && propria.hw > 0) return propria;
  const balanco = indice === 0 || indice === n + 1;
  const apoio = balanco ? secoes.apoios[Math.max(0, indice - 1)] : undefined;
  if (!apoio) throw new Error(`Viga ${entrada.viga.nome}: sem seção para o tramo ${indice}`);
  return { bw: apoio.bw, hw: apoio.hw, bf: propria?.bf ?? 0, hf: propria?.hf ?? 0 };
}

/** Esforços do DESDIM: o DESCALC refaz a análise a partir do .VIG (`analisaDescalc`,
 *  DESDIM.BAS:795, 5777-6582: focos, redução dos negativos, engastamento perfeito,
 *  envoltória das acidentais e alívio do cortante) e o dimensionamento lê do COMMON o
 *  M− (A_16DE), o M+ (A_1768 ou A_11A8), x e o carregamento do M+ (A_173A, A_17C4) e
 *  os cortantes (A_1796, A_1540), como FUN_1000_13F7 (DESDIM.BAS:2707-3057). */
export function esforcosDesdim(entrada: EntradaDesdim, modo: ModoSistrut): EsforcosDesdim {
  const c = analisaDescalc(entrada, modo);
  const { viga } = entrada;
  const n = viga.tramos.length;
  const momentosApoio = Array.from({ length: n + 1 }, (_, k) => c.a16de.g(k));
  const tramos: EsforcosTramoDesdim[] = [];
  const balE = viga.balancoEsquerdo ? 1 : 0;
  const balD = viga.balancoDireito ? 1 : 0;
  for (let t = 1 - balE; t <= n + balD; t++) {
    const tramo =
      t === 0 ? viga.balancoEsquerdo : t === n + 1 ? viga.balancoDireito : viga.tramos[t - 1];
    if (!tramo) throw new Error(`Viga ${viga.nome}: sem o tramo ${t}`);
    const interno = t >= 1 && t <= n;
    let mPositivo = interno ? c.a1768.g(t) : 0;
    for (let i = 1; interno && i <= c.v1176; i++) {
      if (c.a11d6.g(i) !== t) continue;
      if (c.a11a8.g(i) > mPositivo) mPositivo = c.a11a8.g(i);
      break;
    }
    tramos.push({
      indice: t,
      vao: c.a1006.g(t),
      mPositivo,
      x: interno ? c.a173a.g(t) : 0,
      ve: c.a1796.g(t, 0),
      vd: c.a1796.g(t, 1),
      vkEsquerda: c.a1540.g(t, 0),
      vkDireita: c.a1540.g(t, 1),
      veFlecha: c.a17c4.g(t, 0),
      mEsquerdo: c.a17c4.g(t, 1),
      divisoes: tramo.divisoes,
    });
  }
  return { momentosApoio, tramos };
}

// ---------------------------------------------------------------- dimensionamento

const SEM_FLEXAO: FlexaoViga = {
  xd: 0,
  mk: 0,
  as: 0,
  asCompressao: 0,
  arranjo: "",
  arranjoCompressao: "",
  barras: { n1: 0, bitola1: 0, n2: 0, bitola2: 0 },
  ramo: "nenhum",
};

/** Dimensiona a viga como o DESDIM (FUN_1000_13f7, DESDIM.BAS:2696-3125): primeiro a
 *  flecha (EJ·f) e a bitola de estribo da viga; depois os apoios (M−, As,mín
 *  0,0015·bw·hw do .DSP em todo apoio do laço, barras) e os tramos (M+, As,mín,
 *  barras, Asw e estribos dos dois lados, flecha). Modo corrigido: R8 (σs elástico
 *  sem ÷ γs), R9 (áreas de φ4 e φ32) e H (As,mín 0,25 % com CA-25). */
export const dimensionaViga: DimensionaViga = (entrada, modo, alteracoes) => {
  const s = atribuicao(modo);
  const { viga, materiais, parametros: p } = entrada;
  const mult = p.multiplicadorUnidade;
  const n = viga.tramos.length;
  const balE = viga.balancoEsquerdo ? 1 : 0;
  const balD = viga.balancoDireito ? 1 : 0;
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const cobrimentoTotal = s(p.cobrimento + p.acrescimo);
  const secaoCalculo = (sec: SecaoViga): SecaoCalculo => ({
    bw: sec.bw,
    h: sec.hw,
    bf: sec.bf,
    hf: sec.hf,
    d: s(sec.hw - cobrimentoTotal),
  });
  const esforcos = esforcosDesdim(entrada, modo);
  const ec = moduloEc(materiais, p, modo);
  const xiLim = xiLimite(materiais, mult, modo);
  const taxaMin = taxaArmaduraMinima(p.taxaArmaduraMinima, materiais, modo);
  memoria.push(
    {
      descricao: "Ec do concreto",
      formula: "21·√(1000·fck + 35)·k",
      valor: ec,
      unidade: "t/cm²",
      ref: "DESDIM.BAS:2713",
    },
    {
      descricao: "ξlim (x/d limite)",
      formula: "INT(1000/((fyd/Es + 2‰ B)/3,5 + 1))/1000",
      valor: xiLim,
      ref: "DESDIM.BAS:3678",
    },
    {
      descricao: "Taxa de armadura mínima",
      formula: "As,mín = taxa·bw·hw",
      valor: taxaMin,
      ref: "DESENHO.BAS:4820",
    },
  );

  // EJ·f por tramo interno (S_113f7, DESDIM.BAS:2716-2765).
  const ejfPorTramo = new Map<number, number>();
  for (const t of esforcos.tramos) {
    if (t.indice < 1 || t.indice > n) continue;
    ejfPorTramo.set(t.indice, flechaEJ({ ...t, ve: t.veFlecha }, modo));
  }

  // Asw de cada lado e bitolas da viga. ρ do ψ: no original a coluna 5 de A_128e, que
  // o DESAUXDI só grava depois do dimensionamento (DESDIM.BAS:5004), ainda é 0 e ρ fica
  // no piso 0,001 (defeito D-ψ, T7). Corrigido: ρ = As/(3·bw·h) com a As de flexão do
  // tramo (o terço da positiva que chega ao apoio) ou, no balanço, a do apoio vizinho
  // (NB-1/78: τc = ψ·√fck cresce com a taxa da armadura longitudinal de tração;
  // U03-026, livros_arm_forma_des.md 4.3).
  const asDeFlexao = (m: number, sec: SecaoCalculo) => {
    const r = flexaoSecao(m, sec, materiais, mult, modo);
    return Math.max(r.as, taxaMin * sec.bw * sec.h);
  };
  const asRhoDo = (t: EsforcosTramoDesdim, sec: SecaoCalculo) => {
    if (modo === "original") return 0;
    if (t.indice >= 1 && t.indice <= n)
      return asDeFlexao(t.mPositivo * 100 * p.coeficienteMedida * p.coeficienteForca, sec);
    const mApoio = esforcos.momentosApoio[t.indice === 0 ? 0 : n] ?? 0;
    return mApoio < 0
      ? asDeFlexao(-mApoio * 100 * p.coeficienteMedida * p.coeficienteForca, sec)
      : 0;
  };
  const aswDos = (t: EsforcosTramoDesdim) => {
    const sec = secaoCalculo(secaoDoTramo(entrada, t.indice));
    const asRho = asRhoDo(t, sec);
    return {
      sec,
      aswEsquerda: aswCortante(t.vkEsquerda, sec, asRho, materiais, p, p.coeficienteForca, modo),
      aswDireita: aswCortante(t.vkDireita, sec, asRho, materiais, p, p.coeficienteForca, modo),
    };
  };
  const bitolas = bitolasEstriboViga(
    esforcos.tramos.map((t) => {
      const a = aswDos(t);
      return { bw: a.sec.bw, aswEsquerda: a.aswEsquerda, aswDireita: a.aswDireita };
    }),
    p,
    modo,
  );
  memoria.push(
    {
      descricao: "Bitola máxima de estribo da viga",
      valor: bitolas.maxima,
      unidade: "mm",
      ref: "DESDIM.BAS:3336",
    },
    {
      descricao: "Bitola mínima de estribo da viga",
      valor: bitolas.minima,
      unidade: "mm",
      ref: "DESDIM.BAS:3350",
    },
  );

  const asEfetiva = (b: BarrasArranjo, segundoSeMaisDeUm: boolean) =>
    s(
      b.n1 * areaBitola(b.bitola1, p, modo) +
        (b.n2 > (segundoSeMaisDeUm ? 1 : 0) ? b.n2 * areaBitola(b.bitola2, p, modo) : 0),
    );
  const avisaFlexao = (r: ReturnType<typeof flexaoSecao>, onde: string) => {
    if (r.acimaDoLimite)
      avisos.push(
        `${viga.nome} ${onde}: momento aplicado acima de 40% do momento limite da armadura simples.`,
      );
    if (r.tensaoInvalida)
      avisos.push(
        `${viga.nome} ${onde}: a curva σ×ε do aço B não teve solução (σs = −1 no original).`,
      );
  };
  const avisaArranjo = (arranjo: string, onde: string) => {
    if (arranjo === "***")
      avisos.push(
        `${viga.nome} ${onde}: armadura acima da maior da tabela de arranjos do .DSP ("***").`,
      );
  };

  // ---- apoios (DESDIM.BAS:2798-2889)
  const mExt = viga.momentosExternos;
  const externoNeg = (k: 0 | 1) => p.momentosExternos && mExt[k] < 0;
  const engE = viga.engasteEsquerdo ? 1 : 0;
  const engD = viga.engasteDireito ? 1 : 0;
  const ini = Math.max(0, Math.min(n, 1 - balE - engE + (externoNeg(0) ? -1 : 0)));
  const fim = Math.min(n, Math.max(0, n - 1 + balD + engD + (externoNeg(1) ? 1 : 0)));
  const simples = !balE && !balD && !engE && !engD && n <= 1 && !externoNeg(0) && !externoNeg(1);
  const apoios: ApoioDimensionado[] = [];
  /** Momento e seção de cálculo de cada apoio dimensionado (para refazer a fissuração). */
  const calcApoio = new Map<number, { m: number; sec: SecaoCalculo }>();
  for (let k = 0; k <= n; k++) {
    if (k < ini || k > fim) {
      apoios.push({ ...SEM_FLEXAO, apoio: k, dimensionado: false });
      continue;
    }
    const secApoio = entrada.secoes.apoios[k];
    if (!secApoio) throw new Error(`Viga ${viga.nome}: sem seção no apoio ${k}`);
    const sec = secaoCalculo({ bw: secApoio.bw, hw: secApoio.hw, bf: 0, hf: 0 });
    const mApoio = esforcos.momentosApoio[k] ?? 0;
    const m = mApoio < 0 ? s(-mApoio * 100 * p.coeficienteMedida * p.coeficienteForca) : 0;
    const r = flexaoSecao(m, sec, materiais, mult, modo);
    avisaFlexao(r, `apoio ${k}`);
    let as = r.as;
    if (taxaMin * sec.bw * sec.h > as) as = s(taxaMin * sec.bw * sec.h);
    const arranjo = arranjoTracao(as, sec.bw, p, modo);
    avisaArranjo(arranjo, `apoio ${k}`);
    const apoio: ApoioDimensionado = {
      apoio: k,
      dimensionado: true,
      xd: r.xd,
      mk: s(mApoio < 0 ? -mApoio : 0),
      as,
      asCompressao: r.asc,
      arranjo: arranjo.trim(),
      arranjoCompressao: arranjoCompressao(r.asc, sec.bw, p, modo),
      barras: leArranjo(arranjo),
      ramo: r.ramo,
    };
    calcApoio.set(k, { m, sec });
    if (p.verificaFissuracao && !simples) {
      apoio.fissuracao = paraMm(
        fissuracao(
          m,
          sec,
          asEfetiva(apoio.barras, false),
          apoio.barras.bitola1,
          materiais,
          p,
          modo,
        ),
      );
      if (!apoio.fissuracao.ok)
        avisos.push(`${viga.nome} apoio ${k}: abertura de fissuras acima do limite.`);
    }
    memoria.push({
      descricao: `Apoio ${k}: x/d ${r.xd.toFixed(3)}, Mk ${apoio.mk.toFixed(2)} tm, ${apoio.arranjo}`,
      formula: "As = máx(As flexão; taxa·bw·hw)",
      valor: as,
      unidade: "cm²",
      ref: "DESDIM.BAS:2836-2850",
    });
    apoios.push(apoio);
  }

  // ---- tramos (DESDIM.BAS:2917-3057)
  const tramos: TramoDimensionado[] = [];
  /** Momento, seção e EJ·f de cada tramo interno (para refazer flecha e fissuração). */
  const calcTramo = new Map<number, { m: number; sec: SecaoCalculo; ejf: number }>();
  let balancoEsquerdo: TramoDimensionado | undefined;
  let balancoDireito: TramoDimensionado | undefined;
  for (const t of esforcos.tramos) {
    const { sec, aswEsquerda, aswDireita } = aswDos(t);
    const interno = t.indice >= 1 && t.indice <= n;
    let flexao: FlexaoViga = SEM_FLEXAO;
    let m = 0;
    if (interno) {
      m = s(t.mPositivo * 100);
      m = s(m * p.coeficienteMedida * p.coeficienteForca);
      const r = flexaoSecao(m, sec, materiais, mult, modo);
      avisaFlexao(r, `tramo ${t.indice}`);
      let as = r.as;
      if (taxaMin * sec.bw * sec.h > as) as = s(taxaMin * sec.bw * sec.h);
      const arranjo = arranjoTracao(as, sec.bw, p, modo);
      avisaArranjo(arranjo, `tramo ${t.indice}`);
      flexao = {
        xd: r.xd,
        mk: s(s(m / 100) / (p.coeficienteMedida * p.coeficienteForca)),
        as,
        asCompressao: r.asc,
        arranjo: arranjo.trim(),
        arranjoCompressao: arranjoCompressao(r.asc, sec.bw, p, modo),
        barras: leArranjo(arranjo),
        ramo: r.ramo,
      };
    }
    // Estribos (L_15122, L_16b55); o lado sem apoio do balanço não sai.
    const esq = estriboLado(aswEsquerda, sec, bitolas, p, modo);
    const dir = estriboLado(aswDireita, sec, bitolas, p, modo);
    const temEsquerda = t.indice > 0;
    const temDireita = t.indice < n + 1;
    // τwd ≥ 0,25·fcd com o cortante sem alívio (DESDIM.BAS:2984-2988).
    const tauAcima = (v: number) =>
      (v / (sec.d * sec.bw)) * p.coeficienteForca * materiais.gamaF * 1000 >=
      (250 * mult * materiais.fck) / materiais.gamaC;
    if ((temEsquerda && tauAcima(t.ve)) || (temDireita && tauAcima(t.vd)))
      avisos.push(`${viga.nome} tramo ${t.indice}: tensão de cisalhamento acima do limite.`);
    const lado = estribosLadoALado(sec.bw, p);
    const cisalhamento: CisalhamentoViga = {
      vkEsquerda: temEsquerda ? s(Math.abs(t.vkEsquerda)) : 0,
      vkDireita: temDireita ? s(Math.abs(t.vkDireita)) : 0,
      aswEsquerda: temEsquerda ? aswEsquerda : 0,
      aswDireita: temDireita ? aswDireita : 0,
      estribo: {
        bitola: temEsquerda ? esq.bitola : dir.bitola,
        ramos: lado === 1 ? 2 : lado === 2 ? 4 : 6,
        espacamentoEsquerda: temEsquerda ? esq.espacamento : 0,
        espacamentoDireita: temDireita ? dir.espacamento : 0,
      },
      estriboEsquerda: temEsquerda ? esq : { ...esq, texto: "" },
      estriboDireita: temDireita ? dir : { ...dir, texto: "" },
    };

    let flecha = 0;
    let flechaTexto = "";
    let ejf = 0;
    let fiss: FissuracaoViga | undefined;
    if (interno) {
      ejf = ejfPorTramo.get(t.indice) ?? 0;
      // Deformação lenta: EJf·(1 + 2ξ) (DESDIM.BAS:3018-3019).
      if (p.flechaDeformacaoLenta) ejf = s((2 * flexao.xd + 1) * ejf);
      const f = flechaTramo(
        ejf,
        sec,
        ec,
        asEfetiva(flexao.barras, true),
        p.flechaInerciaFissurada,
        p.coeficienteMedida,
        p.coeficienteForca,
        modo,
      );
      flecha = f.valor;
      flechaTexto = f.texto;
      calcTramo.set(t.indice, { m, sec, ejf });
      if (p.verificaFissuracao) {
        fiss = paraMm(
          fissuracao(
            m,
            sec,
            asEfetiva(flexao.barras, false),
            flexao.barras.bitola1,
            materiais,
            p,
            modo,
          ),
        );
        if (!fiss.ok)
          avisos.push(`${viga.nome} tramo ${t.indice}: abertura de fissuras acima do limite.`);
      }
      memoria.push({
        descricao: `Tramo ${t.indice}: x/d ${flexao.xd.toFixed(3)}, Mk ${flexao.mk.toFixed(2)} tm, ${flexao.arranjo}; estribos ${esq.texto} / ${dir.texto}; flecha ${flechaTexto.trim()} cm`,
        formula: "Asw = (|V|/(bw·d)·γs·γf − (0,225 + 15ρ)·√(1000 fck)/1000)/fyk·bw·100·γs",
        valor: flexao.as,
        unidade: "cm²",
        ref: "DESDIM.BAS:2917-3057, 3184",
      });
    }
    const tramo: TramoDimensionado = {
      indice: t.indice,
      flexao,
      cisalhamento,
      flecha,
      flechaTexto,
      ejf,
      ...(fiss ? { fissuracao: fiss } : {}),
    };
    if (t.indice === 0) balancoEsquerdo = tramo;
    else if (t.indice === n + 1) balancoDireito = tramo;
    else tramos.push(tramo);
  }

  if (alteracoes && alteracoes.length > 0) {
    // As alterações das telas do DESDIM (vigas/desdim-alteracao.ts), com a fissuração e a
    // flecha refeitas com as barras novas, como a 2ª passada (DESDIM.BAS:3082-3106)
    const fissuraDe = (m: number, sec: SecaoCalculo, b: BarrasArranjo) =>
      paraMm(fissuracao(m, sec, asEfetiva(b, false), b.bitola1, materiais, p, modo));
    const elementos: ElementoArmadura[] = [
      ...apoios
        .filter((a) => a.dimensionado)
        .map((a): ElementoArmadura => {
          const c = calcApoio.get(a.apoio)!;
          const e: ElementoArmadura = {
            em: "apoio",
            numero: a.apoio,
            as: a.as,
            bw: c.sec.bw,
            barras: a.barras,
            arranjo: a.arranjo,
            arranjoCompressao: a.arranjoCompressao,
          };
          if (a.fissuracao) e.fissuraOk = () => fissuraDe(c.m, c.sec, e.barras).ok;
          return e;
        }),
      ...tramos.map((t): ElementoArmadura => {
        const c = calcTramo.get(t.indice)!;
        const e: ElementoArmadura = {
          em: "tramo",
          numero: t.indice,
          as: t.flexao.as,
          bw: c.sec.bw,
          barras: t.flexao.barras,
          arranjo: t.flexao.arranjo,
          arranjoCompressao: t.flexao.arranjoCompressao,
        };
        if (t.fissuracao) e.fissuraOk = () => fissuraDe(c.m, c.sec, e.barras).ok;
        return e;
      }),
    ];
    const aviso = (texto: string) => avisos.push(`${viga.nome} ${texto}`);
    for (const e of aplicaAlteracoes(alteracoes, elementos, p, modo, aviso)) {
      if (e.em === "apoio") {
        const a = apoios[e.numero]!;
        const c = calcApoio.get(e.numero)!;
        Object.assign(a, {
          barras: e.barras,
          arranjo: e.arranjo,
          arranjoCompressao: e.arranjoCompressao,
        });
        if (a.fissuracao) a.fissuracao = fissuraDe(c.m, c.sec, e.barras);
        continue;
      }
      const t = tramos.find((x) => x.indice === e.numero)!;
      const c = calcTramo.get(e.numero)!;
      t.flexao = {
        ...t.flexao,
        barras: e.barras,
        arranjo: e.arranjo,
        arranjoCompressao: e.arranjoCompressao,
      };
      const fl = flechaTramo(
        c.ejf,
        c.sec,
        ec,
        asEfetiva(e.barras, true),
        p.flechaInerciaFissurada,
        p.coeficienteMedida,
        p.coeficienteForca,
        modo,
      );
      t.flecha = fl.valor;
      t.flechaTexto = fl.texto;
      if (t.fissuracao) t.fissuracao = fissuraDe(c.m, c.sec, e.barras);
    }
  }

  return {
    nome: viga.nome,
    tramos,
    apoios,
    ...(balancoEsquerdo ? { balancoEsquerdo } : {}),
    ...(balancoDireito ? { balancoDireito } : {}),
    bitolasEstribo: bitolas,
    xiLimite: xiLim,
    esforcos,
    avisos,
    memoria,
  };
};

/** w do original (décimos de mm, comparados com a classe 1/2/3) em mm. */
function paraMm(f: Fissuracao): FissuracaoViga {
  return { w1: f.w1 / 10, w2: f.w2 / 10, limite: f.limite / 10, ok: f.ok };
}

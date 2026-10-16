// Lajes maciças retangulares pela NBR 6118:2023, análise elástica por tabelas:
// - momentos e reações pelas tabelas de Bares/Pinheiro (tabelasBares.ts),
//   interpoladas linearmente em λ = ly/lx; λ > 2 usa a linha "> 2,00", que no
//   vão principal é a faixa como viga (pl²/8, 9pl²/128 e −pl²/8, pl²/24 e
//   −pl²/12);
// - balanço (três bordos livres e o quarto engastado): faixa engastada, pl²/2;
// - outras vinculações com bordo livre não têm tabela de reações transcrita:
//   esforços nulos e aviso (o fluxo trata como laje sem cálculo);
// - flecha imediata pelo α da Tabela A-1 com a rigidez de Branson quando
//   Ma > Mr, diferida por αf, limite l/250;
// - armaduras por flexão simples com o bloco retangular e as taxas mínimas da
//   Tabela 19.1.
// Fontes: docs/norma/durabilidade-lajes.md (seções 4 a 6) e
// bares-reacoes-flechas.md, da apostila de Bastos, *Lajes de Concreto*
// (UNESP, out/2023; "Bastos, Lajes", páginas impressas). A apostila declara a
// NBR 6118:2023 mas cita a numeração de 2014; nenhum item foi lido no texto de
// 2023, então todos os itens desta seção são [VERIFICAR] na edição 2023.
// Contas internas em kN, m e MPa (momentos em kN·m/m, faixa de 1 m); seções
// em cm.
import { BORDOS, type Bordo, type Vinculo } from "../../../dominio/obra";
import { escolheMalha } from "../../barras";
import type {
  Barra,
  Etapa,
  LajeArmadura,
  LajeEntrada,
  LajeEsforcos,
  MateriaisCalc,
} from "../../tipos";
import { fctkInf, fctm, GAMA_C, GAMA_G, GAMA_Q } from "./materiais";
import { BARES, CELULAS_SUSPEITAS, type ColunasBares, type TipoBares } from "./tabelasBares";
import { lambda6118, rhoMin6118, xdLimite6118 } from "./vigas";

const LAJES = "Bastos, Lajes";
const TAB = `Bares/Pinheiro (1994), ${LAJES}, Anexo`;
const REF_ESPESSURA = `6118 13.2.4.1 (${LAJES}, item 3.5, p. 11)`;
const REF_GAMA_N = `6118 Tabela 13.2 (${LAJES}, Tabela 4, p. 11)`;
const REF_MOMENTOS = `${TAB}, Tabelas A-8 a A-10, pp. 90-92; Eq. 21, p. 18`;
const REF_REACOES = `${TAB}, Tabelas A-5 a A-7, pp. 87-89`;
const REF_BALANCO = `${LAJES}, ex. 3.17, L1, pp. 45 e 58-59`;
const REF_MR = `6118 17.3.1 (${LAJES}, Eq. 25 e 26, p. 22)`;
const REF_BRANSON = `6118 17.3.2.1.1 (${LAJES}, Eq. 31, p. 23)`;
const REF_ESTADIO_II = `${LAJES}, Eq. 37 e 38, p. 24`;
const REF_FLECHA = `${TAB}, Tabela A-1, p. 83; Eq. 46 e 48, p. 27`;
const REF_DIFERIDA = `6118 17.3.2.1.2 (${LAJES}, Eq. 39 e 49, pp. 24 e 27; Tabela 8, p. 25)`;
const REF_LIMITE = `6118 13.3, Tabela 13.3 (${LAJES}, Tabela 9 e notas 1, 2 e 5, pp. 26-27)`;
const REF_PSI2 = "6118:2023 11.8.3, Tabela 11.2 (docs/norma/vigas-pilares.md)";
const REF_FLEXAO = `6118 17.2.2 (${LAJES}; Bastos, Flexão Simples, Eq. 23 e 25)`;
const REF_XD = `6118 14.6.4.3 (${LAJES}, Eq. 50, p. 28)`;
const REF_MINIMA = `6118 19.3.3.2, Tabela 19.1 e Tabela 17.3 (${LAJES}, Tabelas 10 e 11, p. 33)`;
const REF_DETALHE = `6118 20.1 (${LAJES}, itens 3.12.2 e 3.12.3, p. 33)`;
const REF_VRD1 = `6118 (${LAJES}, item 3.11.2.1, Eq. 56 a 62, pp. 30-31)`;

/** γf das ações no ELU: g e q chegam somados e γg = γq = 1,4 (Tabela 11.1). */
export const GAMA_F = Math.max(GAMA_G, GAMA_Q);
/** ψ2 da combinação quase permanente: edifícios sem predominância de
 *  equipamentos fixos nem de concentração de pessoas (Tabela 11.2).
 *  [VERIFICAR] o app não sabe o uso da laje; garagens e bibliotecas pedem 0,6. */
export const PSI2 = 0.3;
/** Coeficiente ξ(t): t0 = 1 mês (0,68) e t ≥ 70 meses (2) (Tabela 17.1). */
export const XI_T0 = 0.68;
export const XI_INFINITO = 2;
/** Fator de forma α da seção retangular no momento de fissuração (17.3.1). */
export const ALFA_FORMA = 1.5;
/** Limites de deslocamento: l/250 total (aceitabilidade visual) e l/350 da carga
 *  variável (vibração) (Tabela 13.3). */
export const REL_FLECHA = 250;
export const REL_VIBRACAO = 350;
/** α equivalente do balanço: a = p l⁴ / (8 EI) = (150 / 1200) p l⁴ / EI. */
export const ALFA_BALANCO = 150;
/** Bitola suposta para a altura útil, mm: d = h − c − φ/2 (sem escolha prévia). */
export const PHI_PADRAO = 10;
/** Cobrimento suposto para a armadura da rigidez de Branson nos esforços, cm.
 *  A interface `Norma.lajeEsforcos` não recebe o cobrimento; 2,5 cm é o da
 *  laje na CAA II (Tabela 7.2), o padrão do app. `lajeArmadura6118` refaz a
 *  flecha quando o cobrimento real é maior. */
export const COBRIMENTO_REF = 2.5;
/** Espessuras mínimas, cm (13.2.4.1): piso 8 (cobertura 7, não distinguida) e balanço 10. */
export const H_MIN = 8;
export const H_MIN_BALANCO = 10;
/** Armadura de distribuição das lajes armadas numa direção (Tabela 19.1). */
export const DISTRIBUICAO_REL = 0.2;
export const DISTRIBUICAO_MIN = 0.9;
/** Escolha da malha: φ ≥ 5 mm e s ≥ 7 cm (prática citada pela apostila, p. 34;
 *  não é norma); s ≤ min(2h, 20 cm) na principal e ≤ 33 cm na secundária. */
export const MALHA = { phiMin: 5, sMin: 7, sMaxPrincipal: 20, sMaxSecundaria: 33 } as const;

const EPS = 1e-9;
/** Passo de λ nas tabelas de Bares e posição da linha "> 2,00". */
const PASSO_LAMBDA = 0.05;
const LINHA_ACIMA_DE_2 = 21;

const zeros = (): Record<Bordo, number> => ({ esquerdo: 0, inferior: 0, direito: 0, superior: 0 });
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const ehHorizontal = (b: Bordo) => b === "inferior" || b === "superior";

// ---- classificação ---------------------------------------------------------------

/** Tipo de Bares pela quantidade de bordos engastados (nx, ny); ver tabelasBares.ts. */
const TIPO_POR_ENGASTES: Record<string, TipoBares> = {
  "00": "1",
  "01": "2A",
  "10": "2B",
  "11": "3",
  "02": "4A",
  "20": "4B",
  "12": "5A",
  "21": "5B",
  "22": "6",
};

export type ClasseLaje =
  | {
      metodo: "tabela";
      tipo: TipoBares;
      /** λ = ly/lx da tabela (≥ 1). */
      lambda: number;
      /** Vãos da tabela, m: lx é o menor. */
      lx: number;
      ly: number;
      /** A direção x da tabela é a y da planta (laje com lx > ly). */
      transposta: boolean;
      /** λ > 2: armada numa direção (linha "> 2,00"). */
      umaDirecao: boolean;
      /** Bordos da planta perpendiculares a lx e a ly da tabela. */
      bordosX: readonly [Bordo, Bordo];
      bordosY: readonly [Bordo, Bordo];
    }
  | { metodo: "balanco"; engaste: Bordo; /** comprimento do balanço, m */ vao: number }
  | { metodo: "sem-tabela"; motivo: string };

/**
 * Classifica a laje para as tabelas de Bares. Sem bordo livre: tipo 1 a 6
 * com lx = menor vão; se o menor vão é o y da planta, a tabela é transposta
 * (x-bordos da tabela = inferior/superior). Três livres e um engastado:
 * balanço. O resto (algum bordo livre) não tem tabela de reações transcrita.
 */
export function classificaLaje6118(lx: number, ly: number, v: Record<Bordo, Vinculo>): ClasseLaje {
  const livres = BORDOS.filter((b) => v[b] === "livre");
  if (livres.length === 3) {
    const engaste = BORDOS.find((b) => v[b] === "engastado");
    if (engaste !== undefined)
      return { metodo: "balanco", engaste, vao: ehHorizontal(engaste) ? ly : lx };
    return { metodo: "sem-tabela", motivo: "balanço sem bordo engastado" };
  }
  if (livres.length > 0) {
    return {
      metodo: "sem-tabela",
      motivo: `bordo livre (${livres.join(", ")}): as tabelas de reações transcritas (A-5 a A-7) só têm bordos apoiados e engastados`,
    };
  }
  const transposta = lx > ly;
  const bordosX = transposta
    ? (["inferior", "superior"] as const)
    : (["esquerdo", "direito"] as const);
  const bordosY = transposta
    ? (["esquerdo", "direito"] as const)
    : (["inferior", "superior"] as const);
  const engastes = (bs: readonly Bordo[]) => bs.filter((b) => v[b] === "engastado").length;
  const tipo = TIPO_POR_ENGASTES[`${engastes(bordosX)}${engastes(bordosY)}`]!;
  const [a, b] = transposta ? [ly, lx] : [lx, ly];
  const lambda = b / a;
  return {
    metodo: "tabela",
    tipo,
    lambda,
    lx: a,
    ly: b,
    transposta,
    umaDirecao: lambda > 2 + EPS,
    bordosX,
    bordosY,
  };
}

/** Coeficiente de uma coluna de Bares para λ: interpolação linear entre as
 *  linhas de 1,00 a 2,00; λ > 2 usa a linha "> 2,00" (ou "∞"). */
export function coeficienteBares(coluna: readonly number[], lambda: number): number {
  if (lambda > 2 + EPS) return coluna[LINHA_ACIMA_DE_2]!;
  const pos = (Math.max(lambda, 1) - 1) / PASSO_LAMBDA;
  const i = Math.min(Math.floor(pos + EPS), LINHA_ACIMA_DE_2 - 2);
  const t = pos - i;
  return coluna[i]! + t * (coluna[i + 1]! - coluna[i]!);
}

/** Células marcadas suspeitas (CELULAS_SUSPEITAS) que entram, com peso não nulo,
 *  na interpolação de `coeficienteBares` para esse tipo, coluna e λ. */
export function celulasSuspeitasUsadas(tipo: TipoBares, nome: keyof ColunasBares, lambda: number) {
  if (lambda > 2 + EPS) return [];
  const pos = (Math.max(lambda, 1) - 1) / PASSO_LAMBDA;
  const i = Math.min(Math.floor(pos + EPS), LINHA_ACIMA_DE_2 - 2);
  const t = pos - i;
  const usadas = [...(1 - t > EPS ? [i] : []), ...(t > EPS ? [i + 1] : [])];
  return CELULAS_SUSPEITAS.filter(
    (s) =>
      s.tipo === tipo &&
      s.coluna === nome &&
      usadas.some((k) => Math.abs(1 + k * PASSO_LAMBDA - s.lambda) < EPS),
  );
}

function colunaBares(tipo: TipoBares, nome: keyof ColunasBares): readonly number[] {
  const c = BARES[tipo][nome];
  if (c === undefined) throw new Error(`tabela de Bares sem a coluna ${nome} no tipo ${tipo}`);
  return c;
}

// ---- flecha ------------------------------------------------------------------------

/** Momento de fissuração da faixa de 1 m, kN·m/m: Mr = α fct,m Ic / yt, α = 1,5 (h em cm). */
export const momentoFissuracao = (fck: number, h: number) =>
  (ALFA_FORMA * fctm(fck) * 1000 * (h * 10) ** 2) / 6 / 1e6;

/** Linha neutra no estádio II, cm, faixa de 100 cm sem armadura comprimida (Eq. 37). */
export function linhaNeutraII(as: number, d: number, alfaE: number) {
  const a = (2 * alfaE * as) / 100;
  return (-a + Math.sqrt(a * a + 4 * a * d)) / 2;
}

/** Inércia no estádio II, cm⁴, faixa de 100 cm: b x³/12 + b x (x/2)² + αe As (d − x)² (Eq. 38). */
export const inerciaII = (x: number, as: number, d: number, alfaE: number) =>
  (100 * x ** 3) / 12 + 100 * x * (x / 2) ** 2 + alfaE * as * (d - x) ** 2;

/** Rigidez equivalente de Branson: Ecs [(Mr/Ma)³ Ic + (1 − (Mr/Ma)³) III] ≤ Ecs Ic
 *  (Eq. 31). Unidades livres, desde que coerentes. */
export function rigidezEquivalente(ecs: number, ic: number, iII: number, mr: number, ma: number) {
  if (ma <= mr) return ecs * ic;
  const r3 = (mr / ma) ** 3;
  return Math.min(ecs * (r3 * ic + (1 - r3) * iII), ecs * ic);
}

/** Flecha imediata, cm: a = α p l⁴ / (1200 EI), p kN/m², l m, EI kN·m²/m (Eq. 46 com b = 1 m). */
export const flechaImediata = (alfa: number, p: number, l: number, ei: number) =>
  ((alfa / 1200) * p * l ** 4 * 100) / ei;

/** Fator da flecha diferida αf = Δξ / (1 + 50 ρ'), Δξ = ξ(∞) − ξ(1 mês) = 1,32 (Eq. 39). */
export const fatorFluencia = (rhoLinha = 0) => (XI_INFINITO - XI_T0) / (1 + 50 * rhoLinha);

/** γn das lajes em balanço: 1,95 − 0,05 h (h em cm), 1 a partir de 19 cm (Tabela 13.2). */
export const gamaNBalanco = (h: number) => (h >= 19 ? 1 : 1.95 - 0.05 * h);

// ---- flexão ------------------------------------------------------------------------

interface Flexao {
  /** cm²/m; NaN se o concreto não resiste (μ > 0,5). */
  as: number;
  xd: number;
}

/**
 * Flexão simples da faixa de 100 cm com o bloco retangular: md em kN·m/m
 * (cálculo), d em cm. μ = Md / (b d² σcd); x/d = (1 − √(1 − 2μ)) / λ;
 * As = Md / (fyd (d − λx/2)). Sem armadura de compressão: x/d acima do
 * limite fica com aviso de quem chama.
 */
export function flexaoLaje(md: number, d: number, mat: MateriaisCalc): Flexao {
  if (md <= 0) return { as: 0, xd: 0 };
  const m = md * 100; // kN·cm/m
  const mu = m / (100 * d * d * (mat.sigmaCd / 10));
  if (mu > 0.5) return { as: Number.NaN, xd: Number.NaN };
  const lambda = lambda6118(mat.fck);
  const xd = (1 - Math.sqrt(1 - 2 * mu)) / lambda;
  return { as: m / ((mat.fyd / 10) * (d - (lambda * xd * d) / 2)), xd };
}

// ---- esforços ----------------------------------------------------------------------

const semCalculo = (e: LajeEntrada, motivo: string): LajeEsforcos => ({
  mx: 0,
  my: 0,
  negativos: zeros(),
  reacoes: zeros(),
  flecha: 0,
  flechaLimite: 0,
  avisos: [`${e.nome}: vinculação sem tabela (${motivo}); laje sem cálculo.`],
  memoria: [{ descricao: `Vinculação sem tabela: ${motivo}`, ref: TAB }],
});

/** Esforços pela classificação; `d` (cm) é a altura útil usada na rigidez de Branson. */
function calculaEsforcos(e: LajeEntrada, mat: MateriaisCalc, d: number): LajeEsforcos {
  const c = classificaLaje6118(e.lx, e.ly, e.vinculos);
  if (c.metodo === "sem-tabela") return semCalculo(e, c.motivo);
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const p = e.g + e.q;
  memoria.push({
    descricao: "Carga total p = g + q (característica)",
    formula: `${fmt(e.g)} + ${fmt(e.q)}`,
    valor: p,
    unidade: "kN/m²",
  });
  if (mat.fck > 50)
    avisos.push(`${e.nome}: fck = ${mat.fck} MPa > 50 (Grupo II): fora do escopo do app.`);
  const hMin = c.metodo === "balanco" ? H_MIN_BALANCO : H_MIN;
  memoria.push({
    descricao: c.metodo === "balanco" ? "Espessura mínima (balanço)" : "Espessura mínima (piso)",
    valor: hMin,
    unidade: "cm",
    ref: REF_ESPESSURA,
  });
  if (e.h < hMin)
    avisos.push(`${e.nome}: h = ${fmt(e.h)} cm abaixo do mínimo de ${hMin} cm (13.2.4.1).`);

  const negativos = zeros();
  const reacoes = zeros();
  let mx = 0;
  let my = 0;
  /** Momento da seção crítica (combinação rara) e direção da sua armadura. */
  let ma: number;
  let alfa: number;
  let vaoFlecha: number;
  let vaoLimite: number;
  /** Taxa mínima da armadura da seção crítica, fração de 100·h. */
  let taxaMinima: number;
  let gamaN = 1;

  if (c.metodo === "balanco") {
    const l = c.vao;
    negativos[c.engaste] = (p * l * l) / 2;
    reacoes[c.engaste] = p * l;
    memoria.push(
      {
        descricao: `Balanço engastado no bordo ${c.engaste}, l = ${fmt(l)} m`,
        ref: REF_BALANCO,
      },
      {
        descricao: `Momento negativo no bordo ${c.engaste}`,
        formula: "p l² / 2",
        valor: negativos[c.engaste],
        unidade: "kN·m/m",
        ref: REF_BALANCO,
      },
      {
        descricao: `Reação no bordo ${c.engaste}`,
        formula: "p l",
        valor: reacoes[c.engaste],
        unidade: "kN/m",
        ref: REF_BALANCO,
      },
    );
    ma = negativos[c.engaste];
    alfa = ALFA_BALANCO;
    vaoFlecha = l;
    vaoLimite = 2 * l;
    taxaMinima = rhoMin6118(mat.fck);
    gamaN = gamaNBalanco(e.h);
  } else {
    const suspeitas = new Set<string>();
    const coef = (nome: keyof ColunasBares) => {
      for (const s of celulasSuspeitasUsadas(c.tipo, nome, c.lambda))
        suspeitas.add(`tipo ${s.tipo}, ${nome}, λ = ${fmt(s.lambda)}: ${fmt(s.valor)}`);
      return coeficienteBares(colunaBares(c.tipo, nome), c.lambda);
    };
    const mBase = (p * c.lx * c.lx) / 100;
    const vBase = (p * c.lx) / 10;
    memoria.push(
      {
        descricao: `Tipo ${c.tipo} de Bares, ${c.umaDirecao ? "armada numa direção (λ > 2)" : "armada em cruz"}${c.transposta ? "; lx da tabela é o vão y da planta" : ""}`,
        ref: TAB,
      },
      {
        descricao: "λ = ly / lx (lx = menor vão)",
        formula: `${fmt(c.ly)} / ${fmt(c.lx)}`,
        valor: c.lambda,
        ref: TAB,
      },
    );
    const mxT = coef("mx") * mBase;
    const myT = coef("my") * mBase;
    mx = c.transposta ? myT : mxT;
    my = c.transposta ? mxT : myT;
    const linha = c.umaDirecao ? 'linha "> 2,00"' : "interpolado em λ";
    memoria.push(
      {
        descricao: `Momento positivo mx (μ = ${fmt(coef(c.transposta ? "my" : "mx"))}, ${linha})`,
        formula: "μ p lx² / 100",
        valor: mx,
        unidade: "kN·m/m",
        ref: REF_MOMENTOS,
      },
      {
        descricao: `Momento positivo my (μ = ${fmt(coef(c.transposta ? "mx" : "my"))}, ${linha})`,
        formula: "μ p lx² / 100",
        valor: my,
        unidade: "kN·m/m",
        ref: REF_MOMENTOS,
      },
    );
    const bordos = [
      ...c.bordosX.map((b) => [b, "x"] as const),
      ...c.bordosY.map((b) => [b, "y"] as const),
    ];
    for (const [b, dir] of bordos) {
      const engastado = e.vinculos[b] === "engastado";
      if (engastado) {
        const mu = coef(dir === "x" ? "mxNeg" : "myNeg");
        negativos[b] = mu * mBase;
        memoria.push({
          descricao: `Momento negativo no bordo ${b} (μ' = ${fmt(mu)})`,
          formula: "μ' p lx² / 100",
          valor: negativos[b],
          unidade: "kN·m/m",
          ref: REF_MOMENTOS,
        });
      }
      const nome = dir === "x" ? (engastado ? "vxNeg" : "vx") : engastado ? "vyNeg" : "vy";
      const nu = coef(nome);
      reacoes[b] = nu * vBase;
      memoria.push({
        descricao: `Reação no bordo ${b} (ν${engastado ? "'" : ""} = ${fmt(nu)})`,
        formula: "ν p lx / 10",
        valor: reacoes[b],
        unidade: "kN/m",
        ref: REF_REACOES,
      });
    }
    // Rodapé de A-5 a A-7: alívios pela metade, a soma passa da carga.
    const soma = BORDOS.reduce((s, b) => s + reacoes[b] * (ehHorizontal(b) ? e.lx : e.ly), 0);
    memoria.push({
      descricao: "Σ reações × comprimento / carga total (alívios pela metade nas tabelas)",
      formula: `${fmt(soma)} / ${fmt(p * e.lx * e.ly)}`,
      valor: soma / (p * e.lx * e.ly),
      ref: REF_REACOES,
    });
    ma = Math.max(mxT, myT);
    alfa = coef("alfa");
    for (const s of suspeitas) {
      avisos.push(
        `${e.nome}: coeficiente de Bares interpolado sobre célula suspeita da tabela (${s}); confira na fonte.`,
      );
      memoria.push({
        descricao: `Célula suspeita usada na interpolação [VERIFICAR]: ${s}`,
        ref: `${TAB} (valor impresso fora da tendência das vizinhas)`,
      });
    }
    vaoFlecha = c.lx;
    vaoLimite = c.lx;
    taxaMinima = (c.umaDirecao ? 1 : 0.67) * rhoMin6118(mat.fck);
  }

  // Flecha: Ma na combinação rara (g + q), p da flecha na quase permanente.
  const mr = momentoFissuracao(mat.fck, e.h);
  const ic = (e.h / 100) ** 3 / 12; // m⁴/m
  const eiBruta = mat.ecs * 1000 * ic; // kN·m²/m
  let ei = eiBruta;
  memoria.push(
    {
      descricao: "Momento de fissuração Mr",
      formula: `${ALFA_FORMA} · fct,m · Ic / yt, fct,m = ${fmt(fctm(mat.fck))} MPa`,
      valor: mr,
      unidade: "kN·m/m",
      ref: REF_MR,
    },
    {
      descricao: "Momento na seção crítica Ma (combinação rara, g + q)",
      valor: ma,
      unidade: "kN·m/m",
      ref: `${LAJES}, p. 23 e ex. 3.17, p. 56`,
    },
  );
  if (ma > mr) {
    const fl = flexaoLaje(GAMA_F * gamaN * ma, d, mat);
    if (Number.isNaN(fl.as))
      avisos.push(
        `${e.nome}: a seção não resiste a Ma no ELU (d = ${fmt(d)} cm): flecha não calculada, aumente a espessura.`,
      );
    const as = Math.max(fl.as, taxaMinima * 100 * e.h);
    const alfaE = mat.es / mat.ecs;
    const x = linhaNeutraII(as, d, alfaE);
    const iII = inerciaII(x, as, d, alfaE) * 1e-8; // m⁴/m
    ei = rigidezEquivalente(mat.ecs * 1000, ic, iII, mr, ma);
    memoria.push(
      {
        descricao: `Ma > Mr: estádio II; As da seção crítica com d = ${fmt(d)} cm`,
        valor: as,
        unidade: "cm²/m",
        ref: REF_ESTADIO_II,
      },
      {
        descricao: "Linha neutra no estádio II, αe = Es / Ecs",
        valor: x,
        unidade: "cm",
        ref: REF_ESTADIO_II,
      },
      {
        descricao: "Rigidez equivalente (EI)eq",
        formula: "Ecs [(Mr/Ma)³ Ic + (1 − (Mr/Ma)³) III] ≤ Ecs Ic",
        valor: ei,
        unidade: "kN·m²/m",
        ref: REF_BRANSON,
      },
    );
  } else {
    memoria.push({
      descricao: "Ma ≤ Mr: estádio I, EI = Ecs Ic",
      valor: ei,
      unidade: "kN·m²/m",
      ref: `${LAJES}, Eq. 48, p. 27`,
    });
  }
  const pQp = e.g + PSI2 * e.q;
  const ai = flechaImediata(alfa, pQp, vaoFlecha, ei);
  const aq = flechaImediata(alfa, e.q, vaoFlecha, ei);
  const af = fatorFluencia();
  const flecha = ai * (1 + af);
  const flechaLimite = (vaoLimite * 100) / REL_FLECHA;
  const limiteVibracao = (vaoLimite * 100) / REL_VIBRACAO;
  memoria.push(
    {
      descricao: "Carga quase permanente p = g + ψ2 q",
      formula: `${fmt(e.g)} + ${PSI2} · ${fmt(e.q)}`,
      valor: pQp,
      unidade: "kN/m²",
      ref: REF_PSI2,
    },
    {
      descricao: `Flecha imediata (α = ${fmt(alfa)}, l = ${fmt(vaoFlecha)} m)`,
      formula: "α p l⁴ / (12 EI), b = 1 m",
      valor: ai,
      unidade: "cm",
      ref: c.metodo === "balanco" ? REF_BALANCO : REF_FLECHA,
    },
    {
      descricao: "Fator da flecha diferida αf (t0 = 1 mês, t ≥ 70 meses, ρ' = 0)",
      formula: `(${XI_INFINITO} − ${XI_T0}) / (1 + 50 ρ')`,
      valor: af,
      ref: REF_DIFERIDA,
    },
    {
      descricao: "Flecha total",
      formula: "ai (1 + αf)",
      valor: flecha,
      unidade: "cm",
      ref: REF_DIFERIDA,
    },
    {
      descricao: `Flecha limite (aceitabilidade visual)${c.metodo === "balanco" ? ", vão = 2 × balanço" : ", menor vão"}`,
      formula: `l / ${REL_FLECHA}`,
      valor: flechaLimite,
      unidade: "cm",
      ref: REF_LIMITE,
    },
    {
      descricao: "Flecha imediata da carga variável (vibração)",
      formula: `limite l / ${REL_VIBRACAO} = ${fmt(limiteVibracao)} cm`,
      valor: aq,
      unidade: "cm",
      ref: REF_LIMITE,
    },
  );
  if (flecha > flechaLimite)
    avisos.push(
      `${e.nome}: flecha total ${fmt(flecha)} cm acima do limite ${fmt(flechaLimite)} cm (l/${REL_FLECHA}).`,
    );
  if (aq > limiteVibracao)
    avisos.push(
      `${e.nome}: flecha da carga variável ${fmt(aq)} cm acima de l/${REL_VIBRACAO} = ${fmt(limiteVibracao)} cm.`,
    );
  return { mx, my, negativos, reacoes, flecha, flechaLimite, avisos, memoria };
}

/** Altura útil, cm: d = h − c − φ/2 com φ = 10 mm (negativos e flecha). */
const alturaUtil = (h: number, cobrimento: number) => h - cobrimento - PHI_PADRAO / 20;

/**
 * Alturas úteis das duas camadas da malha positiva, cm. A de baixo (direção do
 * maior momento) tem d = h − c − φinf/2; a de cima fica apoiada nela:
 * d = h − c − φinf − φsup/2 (= d − φ com bitolas iguais). φ em mm.
 */
export function alturasUteisPositivas(
  h: number,
  cobrimento: number,
  phiInf: number,
  phiSup: number,
) {
  const inferior = h - cobrimento - phiInf / 20;
  return { inferior, superior: inferior - phiInf / 20 - phiSup / 20 };
}

/**
 * Esforços característicos de uma laje maciça pela NBR 6118:2023 (Norma.lajeEsforcos):
 * momentos e reações pelas tabelas de Bares com p = g + q (os esforços são
 * característicos; γf entra na armadura) e flecha total com o limite l/250.
 * `e.g` já inclui o peso próprio.
 */
export function lajeEsforcos6118(e: LajeEntrada, mat: MateriaisCalc): LajeEsforcos {
  return calculaEsforcos(e, mat, alturaUtil(e.h, COBRIMENTO_REF));
}

/**
 * Negativo único no bordo comum de duas lajes: o maior dos dois.
 * [VERIFICAR] A prática citada no plano (max(média; 0,8 maior)) não está nas
 * fontes; o único exemplo (Bastos, Lajes, ex. 3.17, p. 54, citando 14.7.6.2)
 * "adota a maior" das duas armaduras. O maior momento é a escolha conservadora
 * e nunca reduz o negativo, então o fluxo não corrige os positivos.
 */
export const compatibilizaNegativo6118 = (xa: number, xb: number) => Math.max(xa, xb);

// ---- armaduras ---------------------------------------------------------------------

const SEM_BARRA: Barra = { phi: 0, espacamento: 0 };

/**
 * Armaduras da laje a partir dos esforços já compatibilizados
 * (Norma.lajeArmadura). Positivas em duas camadas: a de baixo na direção do
 * maior momento (ou a principal), d = h − c − φ/2, e a de cima com d − φ
 * (`alturasUteisPositivas`); a 1ª passada supõe φ = 10 mm e a 2ª usa as
 * bitolas das malhas adotadas na 1ª. Negativas com d = h − c − φ/2, φ = 10 mm.
 * Md = γf γn Mk (γn só no balanço). Mínimos da Tabela 19.1 sobre ρmín · 100 h: positivas em cruz
 * 0,67 ρmín; principal numa direção ρmín e secundária max(20 % da principal;
 * 0,9 cm²/m; 0,5 ρmín); negativas ρmín; bordos apoiados (sem continuidade)
 * 0,67 ρmín. Barras com φ ≤ h/8 e s ≤ min(2h, 20 cm). Verifica VSd ≤ VRd1 em
 * cada bordo com reação. Seção insuficiente dá NaN e aviso.
 */
export function lajeArmadura6118(
  e: LajeEntrada,
  esf: LajeEsforcos,
  mat: MateriaisCalc,
  cobrimento: number,
): LajeArmadura {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const c = classificaLaje6118(e.lx, e.ly, e.vinculos);
  if (c.metodo === "sem-tabela") {
    return {
      asx: 0,
      asy: 0,
      asNegativos: zeros(),
      barrasX: SEM_BARRA,
      barrasY: SEM_BARRA,
      barrasNegativos: {},
      avisos,
      memoria: [{ descricao: "Laje sem cálculo: sem armadura", ref: TAB }],
    };
  }
  const d = alturaUtil(e.h, cobrimento);
  const balanco = c.metodo === "balanco";
  const gamaN = balanco ? gamaNBalanco(e.h) : 1;
  const asMin = rhoMin6118(mat.fck) * 100 * e.h;
  const xdLim = xdLimite6118(mat.fck);
  memoria.push(
    {
      descricao: "Altura útil d das negativas",
      formula: `h − c − φ/2 = ${fmt(e.h)} − ${fmt(cobrimento)} − ${PHI_PADRAO / 20} (φ ${PHI_PADRAO} mm suposto)`,
      valor: d,
      unidade: "cm",
      ref: LAJES,
    },
    {
      descricao: "Armadura mínima de referência ρmín · 100 h",
      formula: `ρmín = ${fmt(rhoMin6118(mat.fck) * 100)} %`,
      valor: asMin,
      unidade: "cm²/m",
      ref: REF_MINIMA,
    },
  );
  if (balanco)
    memoria.push({
      descricao: "Coeficiente adicional γn do balanço",
      formula: "1,95 − 0,05 h",
      valor: gamaN,
      ref: REF_GAMA_N,
    });
  if (mat.aco !== "CA-50")
    // [VERIFICAR] a Tabela 17.3 pressupõe CA-50; para outro aço ρmín deve ser recalculado.
    avisos.push(`${e.nome}: ρmín da Tabela 17.3 é para CA-50; com ${mat.aco} confira As,mín.`);

  /** As de um momento característico com altura útil `du`, com o mínimo dado;
   *  com `registra` põe avisos e memória (a 1ª passada das positivas não põe). */
  const dimensiona = (
    mk: number,
    minimo: number,
    nome: string,
    regraMin: string,
    du = d,
    registra = true,
  ) => {
    const md = GAMA_F * gamaN * mk;
    const fl = flexaoLaje(md, du, mat);
    const as = Number.isNaN(fl.as) ? Number.NaN : Math.max(fl.as, minimo);
    if (!registra) return as;
    if (Number.isNaN(fl.as)) {
      avisos.push(`${e.nome}: seção insuficiente para ${nome}, aumente a espessura.`);
    } else if (fl.xd > xdLim + EPS) {
      avisos.push(
        `${e.nome}: x/d = ${fmt(fl.xd)} > ${fmt(xdLim)} em ${nome} (dutilidade); aumente a espessura.`,
      );
    }
    memoria.push({
      descricao: `${nome}: Md = ${fmt(md)} kN·m/m, d = ${fmt(du)} cm, x/d = ${fmt(fl.xd)}, As calc = ${fmt(fl.as)}`,
      formula: `As = Md / (fyd (d − λx/2)) ≥ ${regraMin}`,
      valor: as,
      unidade: "cm²/m",
      ref: `${REF_FLEXAO}; ${REF_XD}; ${REF_MINIMA}`,
    });
    return as;
  };

  /** Direção da armadura secundária (de distribuição), se houver. */
  const secundaria: "x" | "y" | null =
    c.metodo === "tabela" && c.umaDirecao ? (c.transposta ? "x" : "y") : null;
  // camada de baixo: a principal (uma direção) ou a do maior momento (em cruz)
  const inferiorX = secundaria !== null ? secundaria === "y" : esf.mx >= esf.my;

  /** asx e asy com as alturas úteis dX e dY. */
  const positivas = (dX: number, dY: number, registra: boolean) => {
    if (c.metodo !== "tabela") return { asx: 0, asy: 0 };
    if (secundaria === null) {
      const min = 0.67 * asMin;
      const regra = "0,67 ρmín · 100 h";
      return {
        asx: dimensiona(esf.mx, min, "Armadura positiva asx", regra, dX, registra),
        asy: dimensiona(esf.my, min, "Armadura positiva asy", regra, dY, registra),
      };
    }
    const principalX = secundaria === "y";
    const principal = dimensiona(
      principalX ? esf.mx : esf.my,
      asMin,
      `Armadura principal as${principalX ? "x" : "y"}`,
      "ρmín · 100 h",
      principalX ? dX : dY,
      registra,
    );
    const dist = Math.max(DISTRIBUICAO_REL * principal, DISTRIBUICAO_MIN, 0.5 * asMin);
    const sec = dimensiona(
      principalX ? esf.my : esf.mx,
      dist,
      `Armadura secundária as${secundaria}`,
      "max(20 % da principal; 0,9 cm²/m; 0,5 ρmín · 100 h)",
      principalX ? dY : dX,
      registra,
    );
    return principalX ? { asx: principal, asy: sec } : { asx: sec, asy: principal };
  };
  /** dX e dY das duas camadas com as bitolas φx e φy (mm). */
  const alturasXY = (phiX: number, phiY: number) => {
    if (inferiorX) {
      const a = alturasUteisPositivas(e.h, cobrimento, phiX, phiY);
      return { dX: a.inferior, dY: a.superior };
    }
    const a = alturasUteisPositivas(e.h, cobrimento, phiY, phiX);
    return { dX: a.superior, dY: a.inferior };
  };
  const sMaxPrincipal = Math.min(2 * e.h, MALHA.sMaxPrincipal);
  const sMaxDe = (dir: "x" | "y") => (secundaria === dir ? MALHA.sMaxSecundaria : sMaxPrincipal);
  const phiAdotado = (as: number, dir: "x" | "y") =>
    (as > 0 ? escolheMalha(as, MALHA.phiMin, MALHA.sMin, sMaxDe(dir))?.phi : undefined) ??
    PHI_PADRAO;
  // 1ª passada com φ = 10 mm; a 2ª com as bitolas das malhas da 1ª (uma iteração)
  const d1 = alturasXY(PHI_PADRAO, PHI_PADRAO);
  const p1 = positivas(d1.dX, d1.dY, false);
  const phiX = phiAdotado(p1.asx, "x");
  const phiY = phiAdotado(p1.asy, "y");
  const { dX, dY } = alturasXY(phiX, phiY);
  if (c.metodo === "tabela") {
    const [inf, sup] = inferiorX ? (["x", "y"] as const) : (["y", "x"] as const);
    const dPor = { x: dX, y: dY };
    const phiPor = { x: phiX, y: phiY };
    memoria.push({
      descricao: `Alturas úteis das positivas: camada de baixo em ${inf} d${inf} = ${fmt(dPor[inf])} cm; camada de cima em ${sup} d${sup} = ${fmt(dPor[sup])} cm`,
      formula: `d${inf} = h − c − φ${inf}/2; d${sup} = d${inf} − φ${inf}/2 − φ${sup}/2 (φ${inf} = ${phiPor[inf]} mm, φ${sup} = ${phiPor[sup]} mm: malhas da 1ª passada, feita com φ ${PHI_PADRAO} mm)`,
      valor: dPor[inf],
      unidade: "cm",
      ref: LAJES,
    });
  }
  const { asx, asy } = positivas(dX, dY, true);

  const asNegativos = zeros();
  for (const b of BORDOS) {
    const v = e.vinculos[b];
    if (v === "engastado") {
      asNegativos[b] = dimensiona(
        esf.negativos[b],
        asMin,
        `Armadura negativa no bordo ${b}`,
        "ρmín · 100 h",
      );
    } else if (v === "apoiado") {
      asNegativos[b] = 0.67 * asMin;
      memoria.push({
        descricao: `Armadura de borda sem continuidade no bordo ${b} (até 0,15 do menor vão)`,
        formula: "0,67 ρmín · 100 h",
        valor: asNegativos[b],
        unidade: "cm²/m",
        ref: REF_MINIMA,
      });
    }
  }
  if (balanco) {
    const neg = asNegativos[c.engaste];
    memoria.push({
      descricao: "Armadura de distribuição da negativa do balanço (detalhamento)",
      formula: "max(20 % da principal; 0,9 cm²/m; 0,5 ρmín · 100 h)",
      valor: Math.max(DISTRIBUICAO_REL * neg, DISTRIBUICAO_MIN, 0.5 * asMin),
      unidade: "cm²/m",
      ref: REF_MINIMA,
    });
  }

  // barras
  const phiMax = (e.h * 10) / 8;
  memoria.push({
    descricao: "Detalhamento: φ ≤ h/8; s ≤ min(2h, 20 cm) na principal, ≤ 33 cm na secundária",
    formula: `φ ≤ ${fmt(phiMax)} mm; s ≤ ${fmt(sMaxPrincipal)} cm`,
    ref: REF_DETALHE,
  });
  const malha = (as: number, posicao: string, sMax: number): Barra | null => {
    if (!(as > 0)) return null;
    const barra = escolheMalha(as, MALHA.phiMin, MALHA.sMin, sMax);
    if (barra === null) {
      avisos.push(
        `${e.nome}: nenhuma malha de φ ≥ ${MALHA.phiMin} mm com s ≥ ${MALHA.sMin} cm atende ${posicao}.`,
      );
    } else if (barra.phi > phiMax + EPS) {
      avisos.push(`${e.nome}: φ ${fmt(barra.phi)} mm > h/8 = ${fmt(phiMax)} mm em ${posicao}.`);
    }
    return barra;
  };
  const barrasX = malha(asx, "asx", sMaxDe("x")) ?? SEM_BARRA;
  const barrasY = malha(asy, "asy", sMaxDe("y")) ?? SEM_BARRA;
  const barrasNegativos: Partial<Record<Bordo, Barra>> = {};
  for (const b of BORDOS) {
    const barra = malha(asNegativos[b], `o negativo do bordo ${b}`, sMaxPrincipal);
    if (barra !== null) barrasNegativos[b] = barra;
  }

  // força cortante sem armadura transversal: VSd ≤ VRd1
  const fctd = fctkInf(Math.min(mat.fck, 60)) / GAMA_C;
  const tauRd = 0.25 * fctd;
  memoria.push({
    descricao:
      "τRd = 0,25 fctd; k = 1,6 − d ≥ 1, d em m (toda a armadura positiva vai ao apoio; d da camada que chega ao bordo)",
    formula: `fctd = fctk,inf / γc = ${fmt(fctd)} MPa`,
    valor: tauRd,
    unidade: "MPa",
    ref: REF_VRD1,
  });
  for (const b of BORDOS) {
    if (!(esf.reacoes[b] > 0)) continue;
    const asTracao = balanco ? asNegativos[b] : ehHorizontal(b) ? asy : asx;
    const dv = balanco ? d : ehHorizontal(b) ? dY : dX;
    const k = Math.max(1.6 - dv / 100, 1);
    const rho1 = Math.min((Number.isNaN(asTracao) ? 0 : asTracao) / (100 * dv), 0.02);
    const vrd1 = tauRd * k * (1.2 + 40 * rho1) * dv * 10; // kN/m (MPa · mm · 1000 mm / 1000)
    const vsd = GAMA_F * gamaN * esf.reacoes[b];
    memoria.push({
      descricao: `Cortante no bordo ${b}: VSd = ${fmt(vsd)} kN/m, d = ${fmt(dv)} cm, k = ${fmt(k)}, ρ1 = ${fmt(rho1 * 100)} %`,
      formula: "VRd1 = τRd k (1,2 + 40 ρ1) bw d",
      valor: vrd1,
      unidade: "kN/m",
      ref: REF_VRD1,
    });
    if (vsd > vrd1)
      avisos.push(
        `${e.nome}: VSd = ${fmt(vsd)} kN/m > VRd1 = ${fmt(vrd1)} kN/m no bordo ${b}: laje exige armadura transversal (fora do escopo).`,
      );
  }

  // flecha com o cobrimento real, se ele reduz d em relação ao suposto nos esforços
  if (cobrimento > COBRIMENTO_REF + EPS) {
    const real = calculaEsforcos(e, mat, d);
    if (real.flecha > esf.flecha + EPS) {
      memoria.push({
        descricao: `Flecha total refeita com c = ${fmt(cobrimento)} cm (estádio II)`,
        valor: real.flecha,
        unidade: "cm",
        ref: REF_BRANSON,
      });
      if (real.flecha > real.flechaLimite)
        avisos.push(
          `${e.nome}: com c = ${fmt(cobrimento)} cm a flecha total é ${fmt(real.flecha)} cm, acima do limite ${fmt(real.flechaLimite)} cm.`,
        );
    }
  }

  return { asx, asy, asNegativos, barrasX, barrasY, barrasNegativos, avisos, memoria };
}

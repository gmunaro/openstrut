// Orçamento da estrutura: quantitativos × tabela de preços. Estimativa do custo da
// estrutura de concreto armado (concreto, aço, fôrma e a mão de obra de cada um),
// por pavimento, por tipo de elemento, por insumo e por elemento, com perdas,
// reaproveitamento de fôrma e BDI. Não é orçamento executivo (docs/ORCAMENTO.md).
//
// Puro: recebe o levantamento já montado (telas/orcamento/levantamento.ts monta a
// partir da obra calculada) e a tabela de preços; não lê a obra nem o motor.
//
// Composições: cada papel (concreto do fck, aço de uma bitola, fôrma de um tipo,
// mão de obra...) tem uma composição = lista de itens da tabela × coeficiente; o preço
// unitário do papel é Σ coeficiente × preço do item. Cada linha de custo é
// quantidade × preço unitário:
// - concreto: m³ × (1 + perda de concreto), composição do concreto do fck da obra;
// - concretagem (lançamento, adensamento e acabamento): m³ líquido;
// - aço: kg de cada categoria e bitola × (1 + perda de aço);
// - armação (mão de obra): kg líquido;
// - fôrma (fabricação) de laje, viga e pilar: área a fabricar × (1 + perda de fôrma),
//   com a área a fabricar do tipo = máx(maior área de um nível; área total ÷ usos),
//   rateada pelos elementos do tipo na proporção da área (reaproveitamento entre
//   pavimentos);
// - fôrma (montagem e desmontagem) de laje, viga e pilar: área total (cada uso);
// - fundação (paramétrica, opcional, só com o papel vinculado): carga na fundação, tf.
import type { Aco } from "./obra";

// ---- tabela de preços ---------------------------------------------------------------

/** Uma linha da tabela de preços. `preco` null = sem preço (o usuário preenche). */
export interface ItemPreco {
  codigo: string;
  descricao: string;
  unidade: string;
  preco: number | null;
}

/** Tabela de preços: a de referência (SINAPI) ou uma do usuário. */
export interface TabelaPrecos {
  id: string;
  nome: string;
  /** De onde vêm os preços (publicação, URL, "importada de arq.csv"). */
  fonte: string;
  /** Mês de referência, "AAAA-MM" ("" se não se aplica). */
  referencia: string;
  /** UF dos preços ("" se não se aplica). */
  uf: string;
  /** Desonerada (true), não desonerada (false) ou não se aplica (null). */
  desonerado: boolean | null;
  itens: ItemPreco[];
}

// ---- papéis: o que a composição precisa de preço -------------------------------------

/** Tipos de elemento com fôrma (a fabricação e a montagem custam diferente). */
export type TipoForma = "laje" | "viga" | "pilar";
export const TIPOS_FORMA: readonly TipoForma[] = ["laje", "viga", "pilar"];

/** Papel de preço: cada um tem uma composição de itens da tabela. */
export type Papel =
  | `concreto:${number}`
  | `aco:${Aco}:${number}`
  | `forma:${TipoForma}`
  | `mo-forma:${TipoForma}`
  | "mo-armacao"
  | "mo-concretagem"
  | "fundacao";

export const papelConcreto = (fck: number): Papel => `concreto:${fck}`;
export const papelAco = (aco: Aco, phi: number): Papel => `aco:${aco}:${phi}`;

/** Unidade da quantidade de cada papel. */
export function unidadePapel(p: Papel): string {
  if (p.startsWith("concreto:") || p === "mo-concretagem") return "m³";
  if (p.startsWith("aco:") || p === "mo-armacao") return "kg";
  if (p === "fundacao") return "tf";
  return "m²";
}

const DO_TIPO: Record<TipoForma, string> = { laje: "laje", viga: "viga", pilar: "pilar" };

/** Rótulo do papel para a tela: "Concreto fck 25 MPa", "Aço CA-50 φ 12,5 mm". */
export function rotuloPapel(p: Papel): string {
  const [base, a, b] = p.split(":");
  if (base === "concreto") return `Concreto fck ${a} MPa`;
  if (base === "aco") return `Aço ${a} φ ${String(b).replace(".", ",")} mm`;
  if (base === "forma") return `Fôrma de ${DO_TIPO[a as TipoForma]} (fabricação)`;
  if (base === "mo-forma") return `Fôrma de ${DO_TIPO[a as TipoForma]} (montagem e desmontagem)`;
  if (base === "mo-armacao") return "Armação: corte, dobra e montagem (sem o aço)";
  if (base === "mo-concretagem") return "Concretagem (lançamento e adensamento)";
  return "Fundação (paramétrica)";
}

/** Um item da composição de um papel: código da tabela × coeficiente
 *  (unidades do item por unidade do papel, ex. H de armador por kg). */
export interface Componente {
  codigo: string;
  coef: number;
}

// ---- configuração -------------------------------------------------------------------

/** Parâmetros do orçamento, editáveis na tela. Frações: 0,05 = 5 %. */
export interface ConfigOrcamento {
  /** Tabela de preços em uso. */
  tabelaId: string;
  /** Composição de cada papel. Sem composição (ou vazia), o papel fica sem preço. */
  vinculos: Partial<Record<Papel, Componente[]>>;
  perdaConcreto: number;
  perdaAco: number;
  perdaForma: number;
  /** Usos de cada jogo de fôrma (reaproveitamento entre pavimentos), inteiro ≥ 1. */
  usosForma: number;
  bdi: number;
}

/** Valores iniciais das perdas e do reaproveitamento: convenções do app, editáveis.
 *  Aço 10 %: a mesma perda da tabela de aço do detalhamento (PERDA_PADRAO). Fôrma: 4
 *  usos, as utilizações das composições de montagem da SINAPI padrão. BDI 0:
 *  o usuário informa o da obra dele. */
export const CONFIG_PADRAO: Omit<ConfigOrcamento, "tabelaId" | "vinculos"> = {
  perdaConcreto: 0.05,
  perdaAco: 0.1,
  perdaForma: 0.1,
  usosForma: 4,
  bdi: 0,
};

/**
 * BDI pela fórmula do Acórdão TCU 2622/2013:
 * BDI = (1 + AC + S + R + G)(1 + DF)(1 + L) / (1 − I) − 1.
 * AC administração central; S + R + G seguro, risco e garantia; DF despesas
 * financeiras; L lucro; I tributos sobre o preço de venda. Todas em fração.
 */
export function bdiTcu(p: {
  ac: number;
  s: number;
  r: number;
  g: number;
  df: number;
  l: number;
  i: number;
}) {
  return ((1 + p.ac + p.s + p.r + p.g) * (1 + p.df) * (1 + p.l)) / (1 - p.i) - 1;
}

// ---- levantamento: as quantidades que o orçamento recebe -----------------------------

export type TipoElemento = "laje" | "viga" | "pilar" | "fundacao";

export const ROTULO_TIPO: Record<TipoElemento, string> = {
  laje: "Lajes",
  viga: "Vigas",
  pilar: "Pilares",
  fundacao: "Fundação",
};

/** Massa de aço de uma categoria e bitola, kg, sem perda. */
export interface MassaAco {
  aco: Aco;
  phi: number;
  massa: number;
}

/** Um elemento, com as repetições do pavimento já multiplicadas. */
export interface ElementoQuant {
  /** Id do pavimento (PavimentoQuant.id): agrupa. O nome só rotula (pode repetir). */
  pavimentoId: string;
  pavimento: string;
  tipo: TipoElemento;
  nome: string;
  /** m³ */
  concreto: number;
  /** m² */
  forma: number;
  aco: MassaAco[];
  /** Fundação: carga na fundação, tf. */
  carga?: number;
}

export interface PavimentoQuant {
  id: string;
  nome: string;
  repeticoes: number;
  /** Área construída de um nível, m² (área das lajes pelos eixos). */
  area: number;
}

export interface Levantamento {
  /** fck da obra, MPa (escolhe o concreto). */
  fck: number;
  pavimentos: PavimentoQuant[];
  elementos: ElementoQuant[];
}

/// ---- resultado ----------------------------------------------------------------------

/** Uma linha de custo de um elemento. `custo` null quando o papel não tem preço. */
export interface LinhaCusto {
  elemento: number;
  papel: Papel;
  quantidade: number;
  unidade: string;
  preco: number | null;
  custo: number | null;
}

/** Soma de um grupo: o custo direto com preço e as linhas sem preço. */
export interface Grupo {
  chave: string;
  rotulo: string;
  custo: number;
  /** Linhas do grupo sem preço (o custo do grupo fica parcial). */
  semPreco: number;
}

export interface GrupoInsumo extends Grupo {
  papel: Papel;
  componentes: Componente[];
  quantidade: number;
  unidade: string;
  /** Preço unitário da composição (null sem preço). */
  preco: number | null;
}

export interface Orcamento {
  linhas: LinhaCusto[];
  elementos: ElementoQuant[];
  /** Custo direto (sem BDI). */
  custoDireto: number;
  bdi: number;
  /** Custo direto × (1 + BDI). */
  total: number;
  porPavimento: Grupo[];
  porTipo: Grupo[];
  porInsumo: GrupoInsumo[];
  porElemento: (Grupo & { pavimento: string; tipo: TipoElemento; nome: string })[];
  /** Papéis com quantidade e sem preço (sem composição, código fora da tabela ou preço vazio). */
  semPreco: Papel[];
  /** Composições de um item só com unidade diferente da do papel. */
  avisos: string[];
  indicadores: Indicadores;
  /** Área de fôrma a fabricar de cada tipo, com o reaproveitamento, m². */
  formaFabricada: Record<TipoForma, number>;
}

export interface Indicadores {
  /** m² */
  areaConstruida: number;
  /** R$/m² de área construída, com BDI (NaN sem área). */
  custoPorArea: number;
  /** kg de aço (sem perda) por m³ de concreto. */
  acoPorConcreto: number;
  /** m² de fôrma por m³ de concreto. */
  formaPorConcreto: number;
  concreto: number;
  forma: number;
  aco: number;
}

const div = (a: number, b: number) => (b > 0 ? a / b : NaN);

/**
 * Área de fôrma a fabricar, m²: cada jogo serve `usos` níveis, e é preciso ao
 * menos um jogo do maior nível. máx(maior nível; total ÷ usos), nunca acima do total.
 */
export function areaFormaFabricada(niveis: readonly number[], usos: number) {
  const total = niveis.reduce((a, b) => a + b, 0);
  const u = Number.isFinite(usos) && usos >= 1 ? Math.floor(usos) : 1;
  return Math.min(total, Math.max(Math.max(0, ...niveis), total / u));
}

/** Área de fôrma do tipo em cada nível (pavimento ÷ repetições, repetido), m². */
function niveisForma(lev: Levantamento, tipo: TipoForma) {
  const niveis: number[] = [];
  for (const p of lev.pavimentos) {
    const rep = Math.max(1, Math.floor(p.repeticoes));
    const area = lev.elementos
      .filter((e) => e.pavimentoId === p.id && e.tipo === tipo)
      .reduce((a, e) => a + e.forma, 0);
    for (let k = 0; k < rep; k++) niveis.push(area / rep);
  }
  return niveis;
}

/** Preço unitário de uma composição: Σ coef × preço; null se vazia ou com item sem preço. */
export function precoComposicao(
  componentes: readonly Componente[] | undefined,
  porCodigo: ReadonlyMap<string, ItemPreco>,
): number | null {
  if (!componentes || componentes.length === 0) return null;
  let soma = 0;
  for (const c of componentes) {
    const preco = porCodigo.get(c.codigo)?.preco;
    if (preco === null || preco === undefined || !Number.isFinite(c.coef)) return null;
    soma += c.coef * preco;
  }
  return soma;
}

/** Calcula o orçamento: linhas por elemento e papel, grupos, indicadores. */
export function orcar(lev: Levantamento, tabela: TabelaPrecos, cfg: ConfigOrcamento): Orcamento {
  const porCodigo = new Map(tabela.itens.map((i) => [i.codigo, i]));
  const avisos = new Set<string>();
  const precos = new Map<Papel, number | null>();
  const precoDo = (p: Papel): number | null => {
    const memo = precos.get(p);
    if (memo !== undefined) return memo;
    const comp = cfg.vinculos[p];
    // composição de um item com coeficiente 1: a unidade do item tem de ser a do papel
    const so =
      comp?.length === 1 && comp[0]?.coef === 1 ? porCodigo.get(comp[0].codigo) : undefined;
    if (so?.unidade && normalizaUnidade(so.unidade) !== normalizaUnidade(unidadePapel(p)))
      avisos.add(
        `${rotuloPapel(p)}: o item ${so.codigo} é em ${so.unidade}, e a quantidade em ${unidadePapel(p)}.`,
      );
    const preco = precoComposicao(comp, porCodigo);
    precos.set(p, preco);
    return preco;
  };

  const formaFabricada: Record<TipoForma, number> = { laje: 0, viga: 0, pilar: 0 };
  const fatorForma: Record<TipoForma, number> = { laje: 0, viga: 0, pilar: 0 };
  for (const t of TIPOS_FORMA) {
    const niveis = niveisForma(lev, t);
    const total = niveis.reduce((a, b) => a + b, 0);
    formaFabricada[t] = areaFormaFabricada(niveis, cfg.usosForma);
    fatorForma[t] = total > 0 ? formaFabricada[t] / total : 0;
  }

  const linhas: LinhaCusto[] = [];
  const linha = (elemento: number, papel: Papel, quantidade: number) => {
    if (!(quantidade > 0)) return;
    const preco = precoDo(papel);
    linhas.push({
      elemento,
      papel,
      quantidade,
      unidade: unidadePapel(papel),
      preco,
      custo: preco === null ? null : quantidade * preco,
    });
  };

  lev.elementos.forEach((e, i) => {
    linha(i, papelConcreto(lev.fck), e.concreto * (1 + cfg.perdaConcreto));
    linha(i, "mo-concretagem", e.concreto);
    const massa = e.aco.reduce((a, m) => a + m.massa, 0);
    for (const m of e.aco) linha(i, papelAco(m.aco, m.phi), m.massa * (1 + cfg.perdaAco));
    linha(i, "mo-armacao", massa);
    if (e.tipo !== "fundacao") {
      linha(i, `forma:${e.tipo}`, e.forma * fatorForma[e.tipo] * (1 + cfg.perdaForma));
      linha(i, `mo-forma:${e.tipo}`, e.forma);
    }
    // fundação é opcional: só entra com composição
    if (e.carga !== undefined && cfg.vinculos.fundacao?.length) linha(i, "fundacao", e.carga);
  });

  const custoDireto = linhas.reduce((a, l) => a + (l.custo ?? 0), 0);
  const agrupa = <K extends string>(chave: (l: LinhaCusto) => K, rotulo: (k: K) => string) => {
    const m = new Map<K, Grupo>();
    for (const l of linhas) {
      const k = chave(l);
      const g = m.get(k) ?? { chave: k, rotulo: rotulo(k), custo: 0, semPreco: 0 };
      if (l.custo === null) g.semPreco++;
      else g.custo += l.custo;
      m.set(k, g);
    }
    return m;
  };
  const el = (l: LinhaCusto) => lev.elementos[l.elemento]!;

  const nomePav = new Map(lev.pavimentos.map((p) => [p.id, p.nome]));
  const pav = agrupa(
    (l) => el(l).pavimentoId,
    (k) => nomePav.get(k) ?? k,
  );
  const porPavimento = lev.pavimentos.flatMap((p) => pav.get(p.id) ?? []);
  const tipos = agrupa(
    (l) => el(l).tipo,
    (k) => ROTULO_TIPO[k],
  );
  const porTipo = (Object.keys(ROTULO_TIPO) as TipoElemento[]).flatMap((t) => tipos.get(t) ?? []);
  const ins = agrupa((l) => l.papel, rotuloPapel);
  const porInsumo: GrupoInsumo[] = [...ins.values()]
    .map((g) => {
      const papel = g.chave as Papel;
      return {
        ...g,
        papel,
        componentes: cfg.vinculos[papel] ?? [],
        quantidade: linhas.filter((l) => l.papel === papel).reduce((a, l) => a + l.quantidade, 0),
        unidade: unidadePapel(papel),
        preco: precoDo(papel),
      };
    })
    .sort((a, b) => ordemPapel(a.papel) - ordemPapel(b.papel) || a.papel.localeCompare(b.papel));
  const elem = agrupa(
    (l) => String(l.elemento),
    (k) => lev.elementos[Number(k)]!.nome,
  );
  const porElemento = [...elem.values()].map((g) => {
    const e = lev.elementos[Number(g.chave)]!;
    return { ...g, pavimento: e.pavimento, tipo: e.tipo, nome: e.nome };
  });

  const concreto = lev.elementos.reduce((a, e) => a + e.concreto, 0);
  const forma = lev.elementos.reduce((a, e) => a + e.forma, 0);
  const aco = lev.elementos.reduce((a, e) => a + e.aco.reduce((s, m) => s + m.massa, 0), 0);
  const areaConstruida = lev.pavimentos.reduce((a, p) => a + p.area * Math.max(1, p.repeticoes), 0);
  const total = custoDireto * (1 + cfg.bdi);
  return {
    linhas,
    elementos: lev.elementos,
    custoDireto,
    bdi: cfg.bdi,
    total,
    porPavimento,
    porTipo,
    porInsumo,
    porElemento,
    semPreco: porInsumo.filter((g) => g.semPreco > 0).map((g) => g.papel),
    avisos: [...avisos],
    formaFabricada,
    indicadores: {
      areaConstruida,
      custoPorArea: div(total, areaConstruida),
      acoPorConcreto: div(aco, concreto),
      formaPorConcreto: div(forma, concreto),
      concreto,
      forma,
      aco,
    },
  };
}

const ORDEM_PAPEL: Record<string, number> = {
  concreto: 0,
  aco: 1,
  forma: 2,
  "mo-forma": 3,
  "mo-armacao": 4,
  "mo-concretagem": 5,
  fundacao: 6,
};
/** Ordem dos insumos: concreto, aço, fôrma, mão de obra, fundação. */
const ordemPapel = (p: Papel) => ORDEM_PAPEL[p.split(":")[0]!] ?? 9;

/** "M3" = "m³" = "m3"; "KG" = "kg"; "H" = "h". */
const normalizaUnidade = (u: string) =>
  u.trim().toLowerCase().replace("³", "3").replace("²", "2").replace(/\s/g, "");

/** Diferença entre dois orçamentos (b − a): custo direto, total com BDI e custo
 *  direto por tipo. */
export function diferenca(a: Orcamento, b: Orcamento) {
  const tipo = (o: Orcamento, t: string) => o.porTipo.find((g) => g.chave === t)?.custo ?? 0;
  return {
    direto: b.custoDireto - a.custoDireto,
    total: b.total - a.total,
    porTipo: (Object.keys(ROTULO_TIPO) as TipoElemento[])
      .map((t) => ({
        tipo: t,
        rotulo: ROTULO_TIPO[t],
        a: tipo(a, t),
        b: tipo(b, t),
        dif: tipo(b, t) - tipo(a, t),
      }))
      .filter((x) => x.a !== 0 || x.b !== 0),
  };
}

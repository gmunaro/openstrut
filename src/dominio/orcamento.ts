// Orçamento da estrutura: quantitativos × tabela de preços. Estimativa do custo da
// estrutura de concreto armado (concreto, aço, fôrma e a mão de obra de cada um),
// por pavimento, por tipo de elemento, por insumo e por elemento, com perdas,
// reaproveitamento de fôrma e BDI. Não é orçamento executivo (docs/ORCAMENTO.md).
//
// Puro: recebe o levantamento já montado (telas/orcamento/levantamento.ts monta a
// partir da obra calculada) e a tabela de preços; não lê a obra nem o motor.
//
// Composições (cada linha = quantidade × fator × preço unitário do item vinculado):
// - concreto: m³ × (1 + perda de concreto) × preço do concreto do fck da obra;
// - concretagem (mão de obra): m³ líquido × preço;
// - aço: kg de cada categoria e bitola × (1 + perda de aço) × preço da bitola;
// - armação (mão de obra): kg líquido × preço;
// - fôrma (material): área a fabricar × (1 + perda de fôrma) × preço, com a área a
//   fabricar = máx(maior área de um nível; área total ÷ usos), rateada pelos
//   elementos na proporção da área de cada um (reaproveitamento entre pavimentos);
// - fôrma (mão de obra: fabricação, montagem e desmontagem): área total × preço;
// - fundação (paramétrica, opcional, só com o papel vinculado): carga na fundação,
//   tf × preço por tf.
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

/** Papel de preço: cada um se vincula a um código da tabela. */
export type Papel =
  | `concreto:${number}`
  | `aco:${Aco}:${number}`
  | "forma"
  | "mo-forma"
  | "mo-armacao"
  | "mo-concretagem"
  | "fundacao";

export const papelConcreto = (fck: number): Papel => `concreto:${fck}`;
export const papelAco = (aco: Aco, phi: number): Papel => `aco:${aco}:${phi}`;

/** Unidade esperada do item de cada papel (aviso quando a do item é outra). */
export function unidadePapel(p: Papel): string {
  if (p.startsWith("concreto:") || p === "mo-concretagem") return "m³";
  if (p.startsWith("aco:") || p === "mo-armacao") return "kg";
  if (p === "fundacao") return "tf";
  return "m²";
}

/** Rótulo do papel para a tela: "Concreto fck 25 MPa", "Aço CA-50 φ 12,5 mm". */
export function rotuloPapel(p: Papel): string {
  if (p.startsWith("concreto:")) return `Concreto fck ${p.split(":")[1]} MPa`;
  if (p.startsWith("aco:")) {
    const [, aco, phi] = p.split(":");
    return `Aço ${aco} φ ${String(phi).replace(".", ",")} mm`;
  }
  return ROTULO_PAPEL_FIXO[p as keyof typeof ROTULO_PAPEL_FIXO];
}

const ROTULO_PAPEL_FIXO = {
  forma: "Fôrma (material)",
  "mo-forma": "Fôrma (mão de obra)",
  "mo-armacao": "Armação (mão de obra)",
  "mo-concretagem": "Concretagem (mão de obra)",
  fundacao: "Fundação (paramétrica)",
} as const;

// ---- configuração -------------------------------------------------------------------

/** Parâmetros do orçamento, editáveis na tela. Frações: 0,05 = 5 %. */
export interface ConfigOrcamento {
  /** Tabela de preços em uso. */
  tabelaId: string;
  /** Papel → código do item da tabela. Sem vínculo, o papel fica sem preço. */
  vinculos: Partial<Record<Papel, string>>;
  perdaConcreto: number;
  perdaAco: number;
  perdaForma: number;
  /** Usos de cada jogo de fôrma (reaproveitamento entre pavimentos), inteiro ≥ 1. */
  usosForma: number;
  bdi: number;
}

/** Valores iniciais das perdas e do reaproveitamento: convenções do app, editáveis.
 *  Aço 10 %: a mesma perda da tabela de aço do detalhamento (PERDA_PADRAO). BDI 0:
 *  o usuário informa o da obra dele. */
export const CONFIG_PADRAO: Omit<ConfigOrcamento, "tabelaId" | "vinculos"> = {
  perdaConcreto: 0.05,
  perdaAco: 0.1,
  perdaForma: 0.1,
  usosForma: 3,
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

// ---- resultado ----------------------------------------------------------------------

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
  porInsumo: (Grupo & {
    papel: Papel;
    codigo: string;
    quantidade: number;
    unidade: string;
    preco: number | null;
  })[];
  porElemento: (Grupo & { pavimento: string; tipo: TipoElemento; nome: string })[];
  /** Papéis com quantidade e sem preço (sem vínculo, código fora da tabela ou preço vazio). */
  semPreco: Papel[];
  /** Vínculos com unidade diferente da esperada ("Concreto fck 25 MPa: item em kg, esperado m³"). */
  avisos: string[];
  indicadores: Indicadores;
  /** Área de fôrma a fabricar com o reaproveitamento, m². */
  formaFabricada: number;
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

/** Área de fôrma de cada nível (pavimento ÷ repetições, repetido), m². */
function niveisForma(lev: Levantamento) {
  const niveis: number[] = [];
  for (const p of lev.pavimentos) {
    const rep = Math.max(1, Math.floor(p.repeticoes));
    const area = lev.elementos
      .filter((e) => e.pavimento === p.nome)
      .reduce((a, e) => a + e.forma, 0);
    for (let k = 0; k < rep; k++) niveis.push(area / rep);
  }
  return niveis;
}

/** Calcula o orçamento: linhas por elemento e papel, grupos, indicadores. */
export function orcar(lev: Levantamento, tabela: TabelaPrecos, cfg: ConfigOrcamento): Orcamento {
  const porCodigo = new Map(tabela.itens.map((i) => [i.codigo, i]));
  const avisos = new Set<string>();
  const itemDo = (p: Papel) => {
    const codigo = cfg.vinculos[p];
    const item = codigo === undefined ? undefined : porCodigo.get(codigo);
    if (
      item &&
      item.unidade &&
      normalizaUnidade(item.unidade) !== normalizaUnidade(unidadePapel(p))
    )
      avisos.add(
        `${rotuloPapel(p)}: o item ${item.codigo} é em ${item.unidade}, esperado ${unidadePapel(p)}.`,
      );
    return item;
  };

  const formaTotal = lev.elementos.reduce((a, e) => a + e.forma, 0);
  const formaFabricada = areaFormaFabricada(niveisForma(lev), cfg.usosForma);
  const fatorForma = formaTotal > 0 ? formaFabricada / formaTotal : 0;

  const linhas: LinhaCusto[] = [];
  const linha = (elemento: number, papel: Papel, quantidade: number) => {
    if (!(quantidade > 0)) return;
    const item = itemDo(papel);
    const preco = item?.preco ?? null;
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
    linha(i, "forma", e.forma * fatorForma * (1 + cfg.perdaForma));
    linha(i, "mo-forma", e.forma);
    // fundação é opcional: só entra com o papel vinculado a um item da tabela
    if (e.carga !== undefined && cfg.vinculos.fundacao) linha(i, "fundacao", e.carga);
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

  const pav = agrupa(
    (l) => el(l).pavimento,
    (k) => k,
  );
  const porPavimento = lev.pavimentos.flatMap((p) => pav.get(p.nome) ?? []);
  const tipos = agrupa(
    (l) => el(l).tipo,
    (k) => ROTULO_TIPO[k],
  );
  const porTipo = (Object.keys(ROTULO_TIPO) as TipoElemento[]).flatMap((t) => tipos.get(t) ?? []);
  const ins = agrupa((l) => l.papel, rotuloPapel);
  const porInsumo = [...ins.values()]
    .map((g) => {
      const papel = g.chave as Papel;
      const doPapel = linhas.filter((l) => l.papel === papel);
      return {
        ...g,
        papel,
        codigo: cfg.vinculos[papel] ?? "",
        quantidade: doPapel.reduce((a, l) => a + l.quantidade, 0),
        unidade: unidadePapel(papel),
        preco: doPapel[0]?.preco ?? null,
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
      formaPorConcreto: div(formaTotal, concreto),
      concreto,
      forma: formaTotal,
      aco,
    },
  };
}

/** Ordem dos insumos na tabela: concreto, aço, fôrma, mão de obra, fundação. */
function ordemPapel(p: Papel) {
  if (p.startsWith("concreto:")) return 0;
  if (p.startsWith("aco:")) return 1;
  return (
    { forma: 2, "mo-concretagem": 3, "mo-armacao": 4, "mo-forma": 5, fundacao: 6 }[p as string] ?? 9
  );
}

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

// Exportação do orçamento: as mesmas tabelas da tela, em XLSX (uma aba por tabela) e
// em CSV (as tabelas uma abaixo da outra, separadas por uma linha vazia).
import {
  diferenca,
  rotuloPapel,
  ROTULO_TIPO,
  type Orcamento,
  type TabelaPrecos,
} from "../../dominio/orcamento";
import { gerarCsv, gerarXlsx, type Aba, type Celula } from "./planilha";
import type { ResultadoOrcamento } from "./estado";
import { textoComposicao } from "./estado";

/** O aviso que acompanha o orçamento na tela, no relatório e nos arquivos. */
export const AVISO_ORCAMENTO =
  "Estimativa do custo da estrutura (concreto, aço e fôrmas, com a mão de obra de cada um), pelos quantitativos do cálculo e pela tabela de preços escolhida. Não substitui o orçamento executivo nem a conferência de engenheiro responsável.";

/** "Sem desoneração", "Com desoneração" ou "". */
export const textoDesoneracao = (t: Pick<TabelaPrecos, "desonerado">) =>
  t.desonerado === null ? "" : t.desonerado ? "Com desoneração" : "Sem desoneração";

/** "09/2026" a partir de "2026-09". */
export const textoMes = (ref: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(ref);
  return m ? `${m[2]}/${m[1]}` : ref;
};

const r2 = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const r4 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10_000) / 10_000 : null);

/** Comparação com o outro modo de cálculo, para exportar e mostrar. */
export interface Comparacao {
  /** Rótulos dos dois modos, na ordem (a, b): b − a é a diferença. */
  rotulos: [string, string];
  a: Orcamento;
  b: Orcamento;
  cargaA: number | null;
  cargaB: number | null;
}

/** As abas do orçamento (as mesmas tabelas da tela). */
export function abasOrcamento(
  nomeObra: string,
  r: ResultadoOrcamento,
  comp: Comparacao | null,
): Aba[] {
  const { orc, tabela, cfg } = r;
  const ind = orc.indicadores;
  const resumo: Celula[][] = [
    ["Orçamento da estrutura", nomeObra],
    ["Aviso", AVISO_ORCAMENTO],
    [],
    ["Tabela de preços", tabela.nome],
    ["Fonte", tabela.fonte],
    ["Mês de referência", textoMes(tabela.referencia)],
    ["UF", tabela.uf],
    ["Desoneração", textoDesoneracao(tabela)],
    [],
    ["Perda de concreto (%)", r2(cfg.perdaConcreto * 100)],
    ["Perda de aço (%)", r2(cfg.perdaAco * 100)],
    ["Perda de fôrma (%)", r2(cfg.perdaForma * 100)],
    ["Usos de cada jogo de fôrma", cfg.usosForma],
    ["BDI (%)", r2(cfg.bdi * 100)],
    [],
    ["Custo direto (R$)", r2(orc.custoDireto)],
    ["BDI (R$)", r2(orc.total - orc.custoDireto)],
    ["Total com BDI (R$)", r2(orc.total)],
    ["Insumos sem preço (fora do total)", orc.semPreco.map(rotuloPapel).join("; ")],
    [],
    ["Área construída (m²)", r2(ind.areaConstruida)],
    ["Custo por área (R$/m²)", r2(ind.custoPorArea)],
    ["Concreto (m³)", r2(ind.concreto)],
    ["Fôrma (m²)", r2(ind.forma)],
    ["Aço sem perda (kg)", r2(ind.aco)],
    ["Taxa de aço (kg/m³)", r2(ind.acoPorConcreto)],
    ["Fôrma por concreto (m²/m³)", r2(ind.formaPorConcreto)],
  ];
  const insumos: Celula[][] = [
    [
      "Insumo",
      "Composição (código × coeficiente)",
      "Quantidade",
      "Unidade",
      "Preço unitário (R$)",
      "Custo direto (R$)",
      "Linhas sem preço",
    ],
    ...orc.porInsumo.map((g) => [
      g.rotulo,
      textoComposicao(g.componentes),
      r4(g.quantidade),
      g.unidade,
      g.preco === null ? null : r4(g.preco),
      r2(g.custo),
      g.semPreco || null,
    ]),
  ];
  const grupo = (titulo: string, gs: Orcamento["porTipo"]): Celula[][] => [
    [titulo, "Custo direto (R$)", "Com BDI (R$)", "Linhas sem preço"],
    ...gs.map((g) => [g.rotulo, r2(g.custo), r2(g.custo * (1 + orc.bdi)), g.semPreco || null]),
    ["Total", r2(orc.custoDireto), r2(orc.total), null],
  ];
  const elementos: Celula[][] = [
    [
      "Pavimento",
      "Tipo",
      "Elemento",
      "Concreto (m³)",
      "Fôrma (m²)",
      "Aço sem perda (kg)",
      "Carga na fundação (tf)",
      "Custo direto (R$)",
    ],
    ...orc.porElemento.map((g) => {
      const e = orc.elementos[Number(g.chave)];
      return [
        g.pavimento,
        ROTULO_TIPO[g.tipo],
        g.nome,
        r4(e?.concreto ?? 0),
        r4(e?.forma ?? 0),
        r2(e?.aco.reduce((a, m) => a + m.massa, 0) ?? 0),
        e?.carga === undefined ? null : r2(e.carga),
        r2(g.custo),
      ];
    }),
  ];
  const linhas: Celula[][] = [
    [
      "Pavimento",
      "Elemento",
      "Insumo",
      "Quantidade",
      "Unidade",
      "Preço unitário (R$)",
      "Custo (R$)",
    ],
    ...orc.linhas.map((l) => {
      const e = orc.elementos[l.elemento]!;
      return [
        e.pavimento,
        e.nome,
        rotuloPapel(l.papel),
        r4(l.quantidade),
        l.unidade,
        l.preco === null ? null : r4(l.preco),
        l.custo === null ? null : r2(l.custo),
      ];
    }),
  ];
  const abas: Aba[] = [
    { nome: "Resumo", linhas: resumo },
    { nome: "Por insumo", linhas: insumos },
    { nome: "Por pavimento", linhas: grupo("Pavimento", orc.porPavimento) },
    { nome: "Por tipo", linhas: grupo("Tipo", orc.porTipo) },
    { nome: "Por elemento", linhas: elementos },
    { nome: "Linhas", linhas },
  ];
  if (comp) {
    const d = diferenca(comp.a, comp.b);
    abas.push({
      nome: "Comparação",
      linhas: [
        [
          "Custo direto por tipo",
          `${comp.rotulos[0]} (R$)`,
          `${comp.rotulos[1]} (R$)`,
          "Diferença (R$)",
        ],
        ...d.porTipo.map((x) => [x.rotulo, r2(x.a), r2(x.b), r2(x.dif)]),
        ["Custo direto", r2(comp.a.custoDireto), r2(comp.b.custoDireto), r2(d.direto)],
        ["Total com BDI", r2(comp.a.total), r2(comp.b.total), r2(d.total)],
        [
          "Carga na fundação (tf)",
          comp.cargaA === null ? null : r2(comp.cargaA),
          comp.cargaB === null ? null : r2(comp.cargaB),
          comp.cargaA === null || comp.cargaB === null ? null : r2(comp.cargaB - comp.cargaA),
        ],
      ],
    });
  }
  return abas;
}

/** CSV com as tabelas uma abaixo da outra (título da tabela, linhas, linha vazia). */
export const csvOrcamento = (abas: readonly Aba[]) =>
  gerarCsv(abas.flatMap((a) => [[a.nome], ...a.linhas, []]));

export const xlsxOrcamento = (abas: readonly Aba[]) => gerarXlsx(abas);

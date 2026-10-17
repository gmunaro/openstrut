// Estado do orçamento na tela: tabelas de preços e parâmetros guardados no navegador,
// a composição efetiva de cada papel (a padrão da SINAPI, ou a que o usuário editou)
// e o orçamento da obra calculada. useOrcamento serve à aba Orçamento e ao relatório.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResultadoObra } from "../../calculo/fluxo";
import {
  CONFIG_PADRAO,
  orcar,
  papelAco,
  papelConcreto,
  TIPOS_FORMA,
  type Componente,
  type ConfigOrcamento,
  type Orcamento,
  type Papel,
  type TabelaPrecos,
} from "../../dominio/orcamento";
import type { ModoCalculo, Obra } from "../../dominio/obra";
import type { DetalhamentoObra } from "../detalhamento";
import { gravarConfig, gravarTabelas, lerConfig, lerTabelas } from "./armazenamento";
import { levantamentoDaObra, levantamentoNoModo, type LevantamentoObra } from "./levantamento";
import { composicaoSinapi, ID_SINAPI, TABELA_SINAPI } from "./sinapi";

/** O que fica guardado: os parâmetros e só as composições que o usuário mudou. */
export type ConfigGuardada = Partial<ConfigOrcamento>;

/** Papéis que o levantamento usa (o da fundação só se há carga na fundação). */
export function papeisDoLevantamento(lev: LevantamentoObra): Papel[] {
  const acos = new Map<string, Papel>();
  for (const e of lev.elementos)
    for (const m of e.aco) acos.set(`${m.aco}|${m.phi}`, papelAco(m.aco, m.phi));
  const ordenados = [...acos.entries()]
    .sort(([a], [b]) => {
      const [ca, pa] = a.split("|");
      const [cb, pb] = b.split("|");
      return ca!.localeCompare(cb!) || Number(pa) - Number(pb);
    })
    .map(([, p]) => p);
  return [
    papelConcreto(lev.fck),
    ...ordenados,
    ...TIPOS_FORMA.map((t): Papel => `forma:${t}`),
    ...TIPOS_FORMA.map((t): Papel => `mo-forma:${t}`),
    "mo-armacao",
    "mo-concretagem",
    ...(lev.cargaFundacao !== null ? (["fundacao"] as const) : []),
  ];
}

const numero = (v: unknown, padrao: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : padrao;

const ehComposicao = (v: unknown): v is Componente[] =>
  Array.isArray(v) &&
  v.every(
    (c: unknown) =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as Componente).codigo === "string" &&
      typeof (c as Componente).coef === "number",
  );

/** Configuração em uso: a guardada (validada) sobre os padrões; composições de cada
 *  papel: a guardada ou a padrão da SINAPI. */
export function configEfetiva(guardada: ConfigGuardada, papeis: readonly Papel[]): ConfigOrcamento {
  const vinculos: ConfigOrcamento["vinculos"] = {};
  for (const p of papeis) {
    const g: unknown = guardada.vinculos?.[p];
    const v = ehComposicao(g) ? g : composicaoSinapi(p);
    if (v) vinculos[p] = v;
  }
  return {
    tabelaId: typeof guardada.tabelaId === "string" ? guardada.tabelaId : ID_SINAPI,
    vinculos,
    perdaConcreto: numero(guardada.perdaConcreto, CONFIG_PADRAO.perdaConcreto),
    perdaAco: numero(guardada.perdaAco, CONFIG_PADRAO.perdaAco),
    perdaForma: numero(guardada.perdaForma, CONFIG_PADRAO.perdaForma),
    usosForma: Math.max(1, Math.floor(numero(guardada.usosForma, CONFIG_PADRAO.usosForma))),
    bdi: numero(guardada.bdi, CONFIG_PADRAO.bdi),
  };
}

/** Composição em texto: "1527" ou "88262 × 0,635; 88239 × 0,116". */
export const textoComposicao = (c: readonly Componente[] | undefined) =>
  (c ?? [])
    .map((x) => (x.coef === 1 ? x.codigo : `${x.codigo} × ${String(x.coef).replace(".", ",")}`))
    .join("; ");

/** Lê o texto de uma composição ("código × coef; ..."; "*" vale como "×"). Devolve a
 *  mensagem de erro se algum trecho não é "código" ou "código × número". */
export function lerComposicao(texto: string): Componente[] | string {
  const partes = texto
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const comps: Componente[] = [];
  for (const p of partes) {
    const [codigo, coef, ...resto] = p.split(/[×*]/).map((s) => s.trim());
    const n = coef === undefined ? 1 : Number(coef.replace(",", "."));
    if (!codigo || resto.length > 0 || !Number.isFinite(n) || n < 0)
      return `"${p}": use código ou código × coeficiente (ex.: 88262 × 0,635).`;
    comps.push({ codigo, coef: n });
  }
  return comps;
}

/** Tabelas de preços (a de referência ou a cópia editada dela, e as importadas) e a
 *  configuração guardada, com as funções que gravam no navegador. */
export function useDadosOrcamento() {
  const [doUsuario, setDoUsuario] = useState<TabelaPrecos[]>([]);
  const [guardada, setGuardada] = useState<ConfigGuardada>({});
  const [carregado, setCarregado] = useState(false);
  useEffect(() => {
    let vivo = true;
    Promise.all([lerTabelas(), lerConfig()])
      .then(([t, c]) => {
        if (!vivo) return;
        setDoUsuario(t);
        setGuardada(c ?? {});
      })
      .catch(() => undefined)
      .finally(() => vivo && setCarregado(true));
    return () => {
      vivo = false;
    };
  }, []);

  const tabelas = useMemo(
    () => [
      doUsuario.find((t) => t.id === ID_SINAPI) ?? TABELA_SINAPI,
      ...doUsuario.filter((t) => t.id !== ID_SINAPI),
    ],
    [doUsuario],
  );
  const mudarTabelas = useCallback((novas: TabelaPrecos[]) => {
    setDoUsuario(novas);
    void gravarTabelas(novas);
  }, []);
  /** Grava a tabela (nova ou editada; a de referência vira cópia editada). */
  const salvarTabela = useCallback(
    (t: TabelaPrecos) =>
      mudarTabelas(
        doUsuario.some((x) => x.id === t.id)
          ? doUsuario.map((x) => (x.id === t.id ? t : x))
          : [...doUsuario, t],
      ),
    [doUsuario, mudarTabelas],
  );
  /** Apaga a tabela do usuário; na de referência, desfaz as edições. */
  const apagarTabela = useCallback(
    (id: string) => mudarTabelas(doUsuario.filter((x) => x.id !== id)),
    [doUsuario, mudarTabelas],
  );
  const mudarConfig = useCallback((c: ConfigGuardada) => {
    setGuardada(c);
    void gravarConfig(c as ConfigOrcamento);
  }, []);
  const editada = doUsuario.some((t) => t.id === ID_SINAPI);
  return { tabelas, guardada, carregado, salvarTabela, apagarTabela, mudarConfig, editada };
}

export interface ResultadoOrcamento {
  orc: Orcamento;
  lev: LevantamentoObra;
  tabela: TabelaPrecos;
  cfg: ConfigOrcamento;
  papeis: Papel[];
}

/** Orçamento de um levantamento com a tabela e a configuração guardadas. */
export function orcamentoDe(
  lev: LevantamentoObra,
  tabelas: readonly TabelaPrecos[],
  guardada: ConfigGuardada,
): ResultadoOrcamento {
  const papeis = papeisDoLevantamento(lev);
  const cfg = configEfetiva(guardada, papeis);
  const tabela = tabelas.find((t) => t.id === cfg.tabelaId) ?? tabelas[0] ?? TABELA_SINAPI;
  return {
    orc: orcar(lev, tabela, cfg),
    lev,
    tabela,
    cfg: { ...cfg, tabelaId: tabela.id },
    papeis,
  };
}

/**
 * Orçamento da obra calculada com as tabelas e a configuração guardadas no navegador.
 * null sem resultado. Para o relatório: `const o = useOrcamento(obra, resultado, det)`.
 */
export function useOrcamento(
  obra: Obra,
  resultado: ResultadoObra | null,
  detalhamento: DetalhamentoObra | null,
) {
  const dados = useDadosOrcamento();
  const lev = useMemo(
    () => (resultado ? levantamentoDaObra(obra, resultado, detalhamento) : null),
    [obra, resultado, detalhamento],
  );
  const atual = useMemo(
    () => (lev ? orcamentoDe(lev, dados.tabelas, dados.guardada) : null),
    [lev, dados.tabelas, dados.guardada],
  );
  return { ...dados, atual };
}

/** O outro modo de cálculo (NB-1/78), para a comparação. */
export const outroModo = (m: ModoCalculo | undefined): ModoCalculo =>
  (m ?? "corrigido") === "original" ? "corrigido" : "original";

/** Levantamento da obra no outro modo (só NB-1/78; null na NBR 6118 ou se falhar). */
export const levantamentoOutroModo = (obra: Obra) =>
  obra.norma === "nb1-78" ? levantamentoNoModo(obra, outroModo(obra.modoCalculo)) : null;

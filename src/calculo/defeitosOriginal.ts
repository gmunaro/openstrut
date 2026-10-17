// Erros do SISTRUT original que se manifestam numa obra: para cada um, o que o original
// fazia, o impacto nesta obra com números, o que a V2 faz no modo ativo (com o valor do
// outro modo ao lado) e o que o engenheiro deve fazer. Base: a tabela "Defeitos do
// original corrigidos no modo corrigido" de docs/MODO-CALCULO.md.
//
// Entrada: o resultado da obra calculado nos dois modos (`calcularObra` com
// `modoCalculo` "original" e "corrigido"). Os registros que isolam cada defeito saem do
// resultado do modo original (`resultado.sistrut`): `transicoes` (P-b), `rep[].parcelas
// [].semCorte` (R5), `cisalhamento.semDefeitoPsi` (D-ψ), `lajeproc.negativas[]
// .vizinhoNaoRecalculado` (R2), `otimizacaoParada` (R3) e `CasoPilar.erro` (D-2, D-3). O
// do modo corrigido dá a coluna "Modo corrigido" (que tem também as outras correções e
// os materiais SI) e a flecha das lajes (R1), que o original não calcula.
import type { ResultadoObra } from "./fluxo";
import type { CasoPilar, ModoSistrut } from "./sistrut/base/tipos";
import type { ResultadoSistrut } from "./sistrut/obra";
import { num } from "./texto";

/** Efeito do erro sobre a segurança do que o original calculou; "a conferir" quando a
 *  V2 não o avalia. */
export type SentidoDefeito = "a favor" | "contra" | "neutro" | "a conferir";

/** Uma linha da tabela de impacto: o elemento e o valor em cada situação (texto já
 *  formatado, com unidade). */
export interface LinhaImpacto {
  local: string;
  elemento: string;
  /** O que o SISTRUT original dá (o modo original da V2 reproduz). */
  original: string;
  /** O original sem este erro (as outras contas iguais); "—" quando não se isola. */
  semErro: string;
  /** O modo corrigido da V2 (este e os outros defeitos corrigidos, materiais SI); "—"
   *  sem o resultado do corrigido. */
  corrigido: string;
}

/** Explicação de um erro do original que se manifesta na obra (as 4 partes). */
export interface ErroDoOriginal {
  /** Id do defeito em docs/MODO-CALCULO.md (P-b, R5, D-ψ, R1, R2, R3, D-2, D-3). */
  id: string;
  titulo: string;
  /** 1. O que acontecia no SISTRUT. */
  mecanismo: string;
  /** 2. Impacto nesta obra: resumo com números, sentido e a tabela por elemento. */
  impacto: string;
  sentido: SentidoDefeito;
  /** Frase do sentido ("A favor da segurança: ..."). */
  sentidoTexto: string;
  /** O que a tabela mede (ex.: "carga que chega à fundação, t"). */
  grandeza: string;
  linhas: LinhaImpacto[];
  /** 3. O que a V2 faz no modo ativo, com o valor do outro modo. */
  v2Faz: string;
  /** 4. O que fazer. */
  oQueFazer: string;
  /** Linhas do .BAS do original. */
  referencia: string;
  /** Elementos marcados nas tabelas de resultados (pavimento e nome). */
  elementos: { local: string; elemento: string }[];
}

/** Ids dos defeitos que este painel confere, na ordem em que aparecem. */
export const DEFEITOS_CONFERIDOS = ["P-b", "R5", "R1", "R2", "R3", "D-ψ", "D-3", "D-2"] as const;

const t2 = (v: number) => `${num(v, 2)} t`;
/** "76 %" (inteiro); vazio quando a base não é positiva. */
const pct = (parte: number, base: number) => (base > 0 ? `${num((100 * parte) / base, 0)} %` : "");
const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

const modoAtivo = (ativo: ModoSistrut) =>
  ativo === "original" ? "Modo ativo: Como o SISTRUT original." : "Modo ativo: corrigido.";
const SEM_CORRIGIDO = "—";

/** Nome do pavimento pelo id, no resultado do SISTRUT. */
const nomePavimento = (r: ResultadoSistrut, id: string) =>
  r.pavimentos.find((p) => p.pavimentoId === id)?.nome ?? "";

// ---------------------------------------------------------------- P-b

function transicao(o: ResultadoSistrut, c: ResultadoSistrut | undefined, ativo: ModoSistrut) {
  const duplas = o.transicoes.filter((t) => t.continua && t.cobre);
  const conferir = o.transicoes.filter((t) => t.continua && !t.cobre);
  if (duplas.length === 0 && conferir.length === 0) return undefined;
  const fundacao = (r: ResultadoSistrut | undefined, pilarIdBase: string) =>
    r?.fundacoes.find((f) => f.pilarId === pilarIdBase)?.cargaAcumulada;
  const casos = duplas
    .map((t) => ({
      t,
      emDobro: Math.min(t.concentrada, t.cargaDeCima),
      fo: fundacao(o, t.pilarIdBase),
      fc: fundacao(c, t.pilarIdBase),
    }))
    .sort((a, b) => b.emDobro - a.emDobro);
  const linhas: LinhaImpacto[] = casos.map(({ t, emDobro, fo, fc }) => ({
    local: t.pavimento,
    elemento: `${t.pilar} (nasce na ${t.viga} do ${t.pavimentoViga})`,
    original: fo === undefined ? "—" : t2(fo),
    semErro: fo === undefined ? "—" : `${t2(fo - emDobro)} (${t2(emDobro)} a menos)`,
    corrigido: fc === undefined ? SEM_CORRIGIDO : t2(fc),
  }));
  const soma = casos.reduce((s, x) => s + x.emDobro, 0);
  const maior = casos[0];
  const partes: string[] = [];
  if (maior) {
    partes.push(
      `${plural(casos.length, "pilar", "pilares")} (${casos
        .map((x) => x.t.pilar)
        .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
        .join(", ")}) com a carga contada duas vezes na fundação: ${t2(soma)} a mais no total.`,
    );
    if (maior.fo !== undefined) {
      const certa = maior.fo - maior.emDobro;
      const quanto = pct(maior.emDobro, certa);
      partes.push(
        `Maior caso: ${maior.t.pilar}, que nasce na viga ${maior.t.viga} do ${maior.t.pavimentoViga}: fundação com ${t2(maior.fo)} no SISTRUT contra ${t2(certa)} sem a dupla contagem, ${t2(maior.emDobro)} a mais${quanto ? ` (${quanto} acima da carga certa)` : ""}.`,
      );
    }
  }
  if (conferir.length > 0)
    partes.push(
      `A conferir: ${conferir.map((t) => `${t.pilar} (${t.pavimento}, ${t2(t.concentrada)} na viga ${t.viga} contra ${t2(t.cargaDeCima)} de carga)`).join("; ")}: a concentrada não cobre a carga do pilar, e a V2 não sabe se ela é parte dessa carga; se for, também entra duas vezes.`,
    );
  const exemplo =
    maior && maior.fo !== undefined && maior.fc !== undefined
      ? ` No ${maior.t.pilar}: ${t2(maior.fo)} no SISTRUT e ${t2(maior.fc)} no modo corrigido.`
      : "";
  return {
    id: "P-b",
    titulo: "Carga em dobro na fundação de pilar sobre viga de transição",
    mecanismo:
      "O SISTRUT trata o pilar que nasce numa viga de transição como continuação do pilar de baixo, porque o .COL o declara com o mesmo número. A carga dele chega à fundação duas vezes: pelo pilar de baixo e pela reação da viga, onde o usuário a lançou como carga concentrada.",
    impacto: partes.join(" "),
    sentido: "a favor",
    sentidoTexto:
      "A favor da segurança: a fundação e os lances do pilar de baixo saem dimensionados para mais carga do que recebem. A viga de transição recebe a carga uma vez só.",
    grandeza: "carga que chega à fundação, sem o peso próprio do pilar, t",
    linhas,
    v2Faz:
      ativo === "original"
        ? `${modoAtivo(ativo)} A V2 reproduz a dupla contagem e marca os pilares. No modo corrigido, o pilar que nasce na viga não continua o pilar de baixo, e a carga dele chega à fundação só pela viga.${exemplo}`
        : `${modoAtivo(ativo)} A V2 não continua o pilar de baixo: a carga do pilar que nasce na viga chega à fundação uma vez, pela reação da viga.${exemplo}`,
    oQueFazer:
      "Se a fundação e os lances de baixo já foram executados com os valores do SISTRUT, estão a favor da segurança. Num projeto novo, use os valores do modo corrigido e confira que a carga concentrada lançada em cada viga de transição é a carga do pilar que nasce nela.",
    referencia: "PILGEEDI.BAS:567-579; PILAREDI.BAS:513-516, 3870-3872",
    elementos: duplas.concat(conferir).flatMap((t) => [
      { local: t.pavimento, elemento: t.pilar },
      { local: t.pavimentoViga, elemento: t.pilar },
    ]),
  } satisfies ErroDoOriginal;
}

// ---------------------------------------------------------------- R5

function reacoesTruncadas(
  o: ResultadoSistrut,
  c: ResultadoSistrut | undefined,
  ativo: ModoSistrut,
) {
  // o INT corta para baixo: a parcela gravada nunca passa da reação (a negativa fica
  // mais negativa), e semCorte − valor ≥ 0
  const perdas = o.pavimentos.flatMap((p) =>
    p.rep.flatMap((l) => {
      const cortes = l.parcelas.map((q) => Math.max((q.semCorte ?? q.valor) - q.valor, 0));
      const cortadas = cortes.filter((x) => x > 1e-7).length;
      if (cortadas === 0) return [];
      const perda = cortes.reduce((s, x) => s + x, 0);
      const corr = c?.pavimentos
        .find((q) => q.pavimentoId === p.pavimentoId)
        ?.rep.find((q) => q.pilar === l.pilar)?.total;
      const semCorte = l.total + perda;
      return [
        {
          pav: p.nome,
          pilar: l.pilar,
          total: l.total,
          semCorte,
          perda,
          cortadas,
          corr,
          // fração da carga do pilar; sem carga (|R| ~ 0), não entra na comparação
          fracao: Math.abs(semCorte) > 1e-6 ? perda / Math.abs(semCorte) : 0,
        },
      ];
    }),
  );
  if (perdas.length === 0) return undefined;
  perdas.sort((a, b) => b.fracao - a.fracao || b.perda - a.perda);
  const soma = perdas.reduce((s, x) => s + x.perda, 0);
  const n = perdas.reduce((s, x) => s + x.cortadas, 0);
  const maior = perdas[0]!;
  const tr = (v: number) => `${num(v, 3)} t`;
  const fr = `${num(100 * maior.fracao, 2)} %`;
  return {
    id: "R5",
    titulo: "Reações das vigas cortadas na segunda casa decimal no .REP",
    mecanismo:
      "O SISTRUT grava no .REP cada parcela de reação de viga em pilar cortada para baixo na segunda casa decimal, em toneladas (7,479 t vira 7,47 t). O pilar recebe a soma das parcelas já cortadas.",
    impacto: `${plural(n, "parcela cortada", "parcelas cortadas")} em ${plural(perdas.length, "linha", "linhas")} do .REP, ${tr(soma)} a menos no total da obra. Cada parcela perde menos de 0,01 t; o pilar perde até 0,01 t por viga que descarrega nele. Maior perda relativa: ${maior.pilar} no ${maior.pav}, ${tr(maior.perda)} em ${tr(maior.semCorte)} (${fr}).`,
    sentido: "contra",
    sentidoTexto: "Contra a segurança, mas pequeno: a carga do pilar sai sempre um pouco menor.",
    grandeza: "soma das reações das vigas no pilar, no .REP, t",
    linhas: perdas.map((x) => ({
      local: x.pav,
      elemento: x.pilar,
      original: tr(x.total),
      semErro: `${tr(x.semCorte)} (${plural(x.cortadas, "parcela", "parcelas")})`,
      corrigido: x.corr === undefined ? SEM_CORRIGIDO : tr(x.corr),
    })),
    v2Faz: `${modoAtivo(ativo)} ${
      ativo === "original"
        ? "A V2 corta as parcelas como o original. O modo corrigido soma as reações sem cortar."
        : "A V2 soma as reações sem cortar."
    } No ${maior.pilar} do ${maior.pav}: ${tr(maior.total)} no SISTRUT${maior.corr === undefined ? "" : ` e ${tr(maior.corr)} no modo corrigido, que tem também as outras correções`}.`,
    oQueFazer: `A maior perda nesta obra é ${fr} da carga de um pilar (${maior.pilar} no ${maior.pav}). Só confira a fundação ou o pilar que tenha folga menor que isso.`,
    referencia: "VIGA.BAS:2498-2501",
    elementos: perdas.map((x) => ({ local: x.pav, elemento: x.pilar })),
  } satisfies ErroDoOriginal;
}

// ---------------------------------------------------------------- D-ψ

function psiNoPiso(o: ResultadoSistrut, c: ResultadoSistrut | undefined, ativo: ModoSistrut) {
  const asw = (v: number, texto: string) => `${num(v, 2)} cm²/m${texto ? ` (${texto})` : ""}`;
  const linhas: (LinhaImpacto & { dif: number; mudaEstribo: boolean })[] = [];
  for (const p of o.pavimentos)
    for (const v of p.vigas)
      for (const t of v.dimensionamento?.tramos ?? []) {
        const x = t.cisalhamento.semDefeitoPsi;
        if (!x) continue;
        const ct = c?.pavimentos
          .find((q) => q.pavimentoId === p.pavimentoId)
          ?.vigas.find((q) => q.nome === v.nome)
          ?.dimensionamento?.tramos.find((q) => q.indice === t.indice)?.cisalhamento;
        for (const lado of ["Esquerda", "Direita"] as const) {
          const a = t.cisalhamento[`asw${lado}`];
          const b = x[`asw${lado}`];
          // só a diferença que aparece na casa impressa (cm²/m com 2 casas)
          if (!(a > b) || num(a, 2) === num(b, 2)) continue;
          const est = t.cisalhamento[`estribo${lado}`].texto;
          const estB = x[`estribo${lado}`];
          linhas.push({
            local: p.nome,
            elemento: v.nome,
            original: `tramo ${t.indice}, ${lado === "Esquerda" ? "esq." : "dir."}: ${asw(a, est)}`,
            semErro: asw(b, estB),
            corrigido: ct ? asw(ct[`asw${lado}`], ct[`estribo${lado}`].texto) : SEM_CORRIGIDO,
            dif: a - b,
            mudaEstribo: est !== estB,
          });
        }
      }
  if (linhas.length === 0) return undefined;
  const maior = [...linhas].sort((a, b) => b.dif - a.dif)[0]!;
  const mudam = linhas.filter((l) => l.mudaEstribo).length;
  return {
    id: "D-ψ",
    titulo: "Taxa de armadura do cortante sempre no mínimo",
    mecanismo:
      "Na resistência do concreto ao cortante, τc = ψ·√fck com ψ = 0,225 + 15ρ, o SISTRUT usa a taxa ρ da armadura de flexão antes de ela ser calculada. A taxa fica sempre no mínimo, ρ = 0,001 (0,1 %), e o concreto parece resistir menos ao cortante do que resiste.",
    impacto: `${plural(linhas.length, "lado de tramo", "lados de tramo")} com Asw acima do necessário. Maior diferença: ${maior.elemento} (${maior.local}), ${maior.original} no SISTRUT contra ${maior.semErro} com a taxa da armadura de flexão. ${mudam === 0 ? "Só o Asw muda: em nenhum deles o estribo escolhido muda." : `Em ${mudam} o estribo escolhido muda.`}`,
    sentido: "a favor",
    sentidoTexto: "A favor da segurança: os estribos saem iguais ou maiores que os necessários.",
    grandeza:
      'armadura de cortante Asw e estribo escolhido; a coluna "Modo corrigido" tem também as outras correções e os materiais SI',
    linhas: linhas.map(({ dif: _d, mudaEstribo: _m, ...l }) => l),
    v2Faz: `${modoAtivo(ativo)} ${
      ativo === "original"
        ? "A V2 usa a taxa no mínimo, como o original. O modo corrigido usa a taxa da armadura de flexão do tramo."
        : "A V2 usa a taxa da armadura de flexão do tramo."
    } Na ${maior.elemento} (${maior.local}): ${maior.original} no SISTRUT e ${maior.corrigido} no modo corrigido.`,
    oQueFazer:
      mudam === 0
        ? "Nada a revisar: os estribos detalhados são os mesmos."
        : "Os estribos executados com os valores do SISTRUT estão a favor da segurança. Num projeto novo, os do modo corrigido bastam.",
    referencia:
      "DESDIM.BAS:3194-3208 (ρ com o piso 0,001); 5048, 5053 (a coluna 5 de A_128e, a As, só é gravada depois)",
    elementos: linhas.map((l) => ({ local: l.local, elemento: l.elemento })),
  } satisfies ErroDoOriginal;
}

// ---------------------------------------------------------------- R1

function flechaNaoVerificada(corrigido: ResultadoObra | undefined, ativo: ModoSistrut) {
  const acima = (corrigido?.pavimentos ?? []).flatMap((p) =>
    p.lajes
      .filter((l) => l.esforcos.flechaLimite > 0 && l.esforcos.flecha > l.esforcos.flechaLimite)
      .map((l) => ({
        local: p.pavimento.nome,
        laje: l.laje.nome,
        h: l.laje.h,
        f: l.esforcos.flecha,
        lim: l.esforcos.flechaLimite,
        hMin: corrigido?.sistrut?.pavimentos.find((q) => q.pavimentoId === p.pavimento.id)
          ?.espessuras[l.laje.nome],
      })),
  );
  if (acima.length === 0) return undefined;
  const maior = [...acima].sort((a, b) => b.f / b.lim - a.f / a.lim)[0]!;
  const espessura = (x: (typeof acima)[number]) =>
    x.hMin?.ok === true
      ? `; espessura mínima ${num(x.hMin.h, 0)} cm (a obra tem ${num(x.h, 0)} cm)`
      : "";
  return {
    id: "R1",
    titulo: "Flecha das lajes nunca verificada",
    mecanismo:
      "O SISTRUT lê os limites de flecha do .LAP (vão/300 no total e vão/500 na acidental), mas não os usa: a espessura mínima da laje sai só da flexão, e a coluna L/f do relatório sai sempre 0.",
    impacto: `${plural(acima.length, "laje", "lajes")} com flecha acima do limite, pela verificação do modo corrigido; o SISTRUT não as aponta. Maior: ${maior.laje} (${maior.local}), h = ${num(maior.h, 0)} cm, flecha de ${num(maior.f, 2)} cm contra o limite de ${num(maior.lim, 2)} cm.`,
    sentido: "contra",
    sentidoTexto: "Contra a segurança em serviço: a laje pode deformar mais que o limite da norma.",
    grandeza: "flecha da laje com a espessura da obra, cm (calculada só no modo corrigido)",
    linhas: acima.map((x) => ({
      local: x.local,
      elemento: x.laje,
      original: "não verificada",
      semErro: "—",
      corrigido: `${num(x.f, 2)} cm > limite ${num(x.lim, 2)} cm${espessura(x)}`,
    })),
    v2Faz:
      ativo === "original"
        ? `${modoAtivo(ativo)} A V2 não verifica a flecha, como o original, e marca as lajes. O modo corrigido verifica (vão/300 e vão/500), avisa e procura a espessura mínima que também atende a flecha: na ${maior.laje}, ${num(maior.f, 2)} cm contra ${num(maior.lim, 2)} cm${espessura(maior)}.`
        : `${modoAtivo(ativo)} A V2 verifica a flecha (vão/300 e vão/500), avisa e procura a espessura mínima que também a atende: na ${maior.laje}, ${num(maior.f, 2)} cm contra ${num(maior.lim, 2)} cm${espessura(maior)}. O SISTRUT não verificaria.`,
    oQueFazer:
      "Confira a flecha dessas lajes. Aumente a espessura até a mínima indicada na coluna do modo corrigido, que atende a flecha; se ela não indicar espessura, justifique com contraflecha ou cálculo mais preciso.",
    referencia: "LAJE.BAS:1373-1374 (limites 300 e 500); LAJECALC.BAS:532-557 (coluna L/f)",
    elementos: acima.map((x) => ({ local: x.local, elemento: x.laje })),
  } satisfies ErroDoOriginal;
}

// ---------------------------------------------------------------- R2

function vizinhoNaoRefeito(
  o: ResultadoSistrut,
  c: ResultadoSistrut | undefined,
  ativo: ModoSistrut,
) {
  const asm = (v: number) => `${num(v, 2)} cm²/m`;
  type Neg = ResultadoSistrut["pavimentos"][number]["lajeproc"]["negativas"][number];
  const chave = (n: Neg) =>
    `${n.continuidade.lajeA}|${n.continuidade.bordoA}|${n.continuidade.lajeB}|${n.continuidade.bordoB}`;
  const nomeDe = (n: Neg) => `${n.continuidade.lajeA} × ${n.continuidade.lajeB || "engaste"}`;
  const casos: { local: string; n: Neg; nc: Neg | undefined }[] = [];
  for (const p of o.pavimentos)
    for (const n of p.lajeproc.negativas) {
      if (!n?.vizinhoNaoRecalculado) continue;
      const nc = c?.pavimentos
        .find((q) => q.pavimentoId === p.pavimentoId)
        ?.lajeproc.negativas.find((q) => q && chave(q) === chave(n));
      casos.push({ local: p.nome, n, nc });
    }
  if (casos.length === 0) return undefined;
  const menores = casos.filter((x) => x.nc && x.nc.as > x.n.as + 1e-6);
  const semComparacao = casos.filter((x) => !x.nc).length;
  const resumo =
    menores.length > 0
      ? `em ${menores.length === 1 ? "uma" : menores.length} delas a negativa ficou menor que a do modo corrigido`
      : semComparacao === casos.length
        ? "sem o modo corrigido para comparar"
        : "em nenhuma a negativa ficou menor que a do modo corrigido";
  const ex = menores[0] ?? casos[0]!;
  return {
    id: "R2",
    titulo: "Negativa de continuidade sem refazer a laje vizinha",
    mecanismo:
      "Na armadura negativa entre duas lajes, o LAJEPROC só recalcula a laje vizinha quando o lado dela na continuidade tem número diferente do lado da laje atual. Com o mesmo número, a negativa sai só com a armadura da laje atual, que pode ser a menor das duas.",
    impacto: `${plural(casos.length, "continuidade", "continuidades")} sem a vizinha refeita; ${resumo}${semComparacao > 0 && semComparacao < casos.length ? ` (${semComparacao} sem comparação)` : ""}.`,
    sentido: menores.length > 0 ? "contra" : semComparacao > 0 ? "a conferir" : "neutro",
    sentidoTexto:
      menores.length > 0
        ? "Contra a segurança: a negativa pode não cobrir o momento da laje vizinha."
        : semComparacao > 0
          ? "A conferir: sem o modo corrigido não há com o que comparar."
          : "Sem efeito nesta obra: a negativa da laje atual já é a maior das duas.",
    grandeza:
      'armadura negativa da continuidade; a coluna "Modo corrigido" tem também as outras correções e os materiais SI',
    linhas: casos.map(({ local, n, nc }) => ({
      local,
      elemento: nomeDe(n),
      original: `As ${asm(n.as)}`,
      semErro: "—",
      corrigido: nc ? `As ${asm(nc.as)}` : SEM_CORRIGIDO,
    })),
    v2Faz: `${modoAtivo(ativo)} ${
      ativo === "original"
        ? "A V2 não refaz a vizinha, como o original, e marca as lajes. O modo corrigido refaz sempre a vizinha, e a negativa é a maior das duas."
        : "A V2 refaz sempre a vizinha, e a negativa é a maior das duas."
    } Na ${nomeDe(ex.n)}: As ${asm(ex.n.as)} no SISTRUT${ex.nc ? ` e ${asm(ex.nc.as)} no modo corrigido` : ""}.`,
    oQueFazer:
      menores.length > 0
        ? "Confira a negativa dessas continuidades: use a As do modo corrigido, que cobre as duas lajes."
        : "Nada a revisar nesta obra.",
    referencia: "LAJEPROC.BAS:843-874 (V_16a8 <> V_0efc, linha 874)",
    elementos: casos.flatMap(({ local, n }) =>
      [n.continuidade.lajeA, n.continuidade.lajeB]
        .filter((x): x is string => !!x)
        .map((elemento) => ({ local, elemento })),
    ),
  } satisfies ErroDoOriginal;
}

// ---------------------------------------------------------------- R3

function otimizacaoSemFim(
  o: ResultadoSistrut,
  c: ResultadoSistrut | undefined,
  ativo: ModoSistrut,
) {
  const paradas = o.pavimentos.flatMap((p) =>
    p.otimizacaoParada ? [{ id: p.pavimentoId, pav: p.nome, parada: p.otimizacaoParada }] : [],
  );
  if (paradas.length === 0) return undefined;
  const noCorrigido = (id: string) => {
    const pc = c?.pavimentos.find((q) => q.pavimentoId === id);
    if (!pc) return SEM_CORRIGIDO;
    return pc.otimizacaoParada ? "também não termina" : "termina";
  };
  return {
    id: "R3",
    titulo: "Otimização dos negativos das lajes não termina",
    mecanismo:
      "Na otimização dos negativos (LAJECALC, opção 6), o SISTRUT reduz a relação entre o momento negativo e o positivo de um lado e grava essa relação arredondada para uma casa decimal. O valor gravado pode sair igual ao anterior: o mesmo lado é refeito sem parar, e o programa trava.",
    impacto: `${plural(paradas.length, "pavimento", "pavimentos")} em que a otimização não termina: ${paradas.map((x) => `${x.pav}, laje ${x.parada.laje}, lado ${x.parada.lado + 1}`).join("; ")}.`,
    sentido: "a conferir",
    sentidoTexto:
      "Efeito na segurança não avaliado pela V2: valem os momentos de antes da otimização, sem redistribuir os negativos.",
    grandeza: "otimização dos negativos do pavimento",
    linhas: paradas.map((x) => ({
      local: x.pav,
      elemento: x.parada.laje,
      original: `trava no lado ${x.parada.lado + 1} (relação ${num(x.parada.relacaoNova, 2)}, código ${x.parada.codigo})`,
      semErro: "—",
      corrigido: noCorrigido(x.id),
    })),
    v2Faz: `${modoAtivo(ativo)} ${
      ativo === "original"
        ? "A V2 para a otimização do pavimento no lado que trava e usa os esforços de antes dela, com aviso. O modo corrigido grava a relação sem arredondar"
        : "A V2 grava a relação sem arredondar"
    }; nesta obra a otimização no modo corrigido: ${paradas.map((x) => `${x.pav} ${noCorrigido(x.id)}`).join("; ")}.`,
    oQueFazer:
      "Se o projeto saiu do SISTRUT, esse pavimento foi calculado sem a otimização (o usuário teve de interrompê-la): confira os negativos e os positivos impressos. No modo corrigido a otimização vai até o fim.",
    referencia: "LAJECALC.BAS:2176, 2195 (relação com 2 casas); 2186 (código com CINT)",
    elementos: paradas.map((x) => ({ local: x.pav, elemento: x.parada.laje })),
  } satisfies ErroDoOriginal;
}

// ---------------------------------------------------------------- D-2, D-3

interface CasoComErro {
  local: string;
  elemento: string;
  caso: string;
  /** O mesmo caso no modo corrigido. */
  corrigido: string;
}

/** Casos de pilar com o erro dado no original: dos lances (PILAREDI) e das verificações
 *  (PILAR 6), cada um com o mesmo caso no corrigido. */
function casosComErro(
  o: ResultadoSistrut,
  c: ResultadoSistrut | undefined,
  nomes: Map<string, string>,
  erro: CasoPilar["erro"],
) {
  const noCorrigido = (caso: CasoPilar | undefined, temCorrigido: boolean) => {
    if (!temCorrigido) return SEM_CORRIGIDO;
    if (!caso) return "caso não calculado";
    if (caso.erro === "nao-converge") return "sem resultado (não termina também)";
    if (caso.erro === "nk-nulo") return "sem resultado";
    return `calculado: ${caso.veredito}`;
  };
  const achados: CasoComErro[] = [];
  for (const l of o.lances)
    for (const caso of l.dimensionamento?.casos ?? [])
      if (caso.erro === erro) {
        const lc = c?.lances.find(
          (x) => x.pilarId === l.pilarId && x.nivel === l.nivel && x.repeticao === l.repeticao,
        );
        achados.push({
          local: nomePavimento(o, l.pavimentoId),
          elemento: nomes.get(l.pilarId) ?? l.pilarId,
          caso: caso.rotulo,
          corrigido: noCorrigido(
            lc?.dimensionamento?.casos.find((x) => x.rotulo === caso.rotulo),
            c !== undefined,
          ),
        });
      }
  for (const v of o.verificacoes)
    for (const caso of v.resultado?.casos ?? [])
      if (caso.erro === erro) {
        const vc = c?.verificacoes.find(
          (x) =>
            x.pavimentoId === v.pavimentoId && x.pilarId === v.pilarId && x.indice === v.indice,
        );
        achados.push({
          local: nomePavimento(o, v.pavimentoId),
          elemento: nomes.get(v.pilarId) ?? v.pilarId,
          caso: caso.rotulo,
          corrigido: noCorrigido(
            vc?.resultado?.casos.find((x) => x.rotulo === caso.rotulo),
            c !== undefined,
          ),
        });
      }
  return achados;
}

function pilarSemResultado(
  o: ResultadoSistrut,
  c: ResultadoSistrut | undefined,
  nomes: Map<string, string>,
  ativo: ModoSistrut,
): ErroDoOriginal[] {
  const out: ErroDoOriginal[] = [];
  const lista = (xs: CasoComErro[]) =>
    xs.map((x) => `${x.elemento} (${x.local}, caso ${x.caso})`).join("; ");
  const linhas = (xs: CasoComErro[], original: string) =>
    xs.map((x) => ({
      local: x.local,
      elemento: x.elemento,
      original: `caso ${x.caso}: ${original}`,
      semErro: "—",
      corrigido: x.corrigido,
    }));
  const nk = casosComErro(o, c, nomes, "nk-nulo");
  if (nk.length > 0)
    out.push({
      id: "D-3",
      titulo: "Pilar com esforço normal nulo sem resultado",
      mecanismo:
        "Na verificação da seção do pilar, o SISTRUT divide pelo esforço normal do caso, Nk. Com Nk = 0 a conta divide por zero, e o original não chega a um resultado para o caso.",
      impacto: `${plural(nk.length, "caso", "casos")} de pilar sem resultado no SISTRUT: ${lista(nk)}.`,
      sentido: "contra",
      sentidoTexto: "Contra a segurança: o caso fica sem verificação no original.",
      grandeza: "verificação do caso de excentricidade",
      linhas: linhas(nk, "sem resultado"),
      v2Faz: `${modoAtivo(ativo)} ${
        ativo === "original"
          ? "A V2 deixa o caso sem resultado, como o original, com aviso. O modo corrigido confere o equilíbrio com uma tolerância sobre o maior entre |Nk| e 1 t e calcula o caso"
          : "A V2 confere o equilíbrio com uma tolerância sobre o maior entre |Nk| e 1 t e calcula o caso"
      }: ${nk.map((x) => `${x.elemento} caso ${x.caso}, ${x.corrigido}`).join("; ")}.`,
      oQueFazer:
        "Esses casos não têm resultado no original. Use o resultado do modo corrigido e confira a armadura do pilar nesse caso antes de usá-la.",
      referencia: "PILAR.BAS:5222, 5293; PILAREDI.BAS:5300, 5385",
      elementos: nk.map(({ local, elemento }) => ({ local, elemento })),
    });
  const laco = casosComErro(o, c, nomes, "nao-converge");
  if (laco.length > 0)
    out.push({
      id: "D-2",
      titulo: "Verificação do pilar que não termina",
      mecanismo:
        "Na verificação da seção do pilar, o SISTRUT procura a posição da linha neutra que equilibra o esforço. Em alguns casos essa procura não chega a um resultado, e o programa não termina.",
      impacto: `${plural(laco.length, "caso", "casos")} de pilar em que o original não termina: ${lista(laco)}.`,
      sentido: "contra",
      sentidoTexto: "Contra a segurança: o caso fica sem verificação.",
      grandeza: "verificação do caso de excentricidade",
      linhas: linhas(laco, "não termina"),
      v2Faz: `${modoAtivo(ativo)} A V2 para a procura nos dois modos e deixa o caso sem resultado, com aviso; a V2 não resolve este caso. No modo corrigido: ${laco.map((x) => `${x.elemento} caso ${x.caso}, ${x.corrigido}`).join("; ")}.`,
      oQueFazer:
        "Verifique esses pilares por outro meio, ou mude a seção ou a armadura até o caso ter resultado.",
      referencia: "PILAR.BAS:5152 (L_33b0f) em diante; PILAREDI.BAS:5237 (L_482e8) em diante",
      elementos: laco.map(({ local, elemento }) => ({ local, elemento })),
    });
  return out;
}

/**
 * Erros do SISTRUT original que se manifestam na obra, na ordem de `DEFEITOS_CONFERIDOS`.
 * `original` e `corrigido` são a obra calculada em cada modo; `ativo`, o modo da obra.
 * Sem o resultado do SISTRUT (NBR 6118), lista vazia.
 */
export function errosDoOriginal(
  original: ResultadoObra,
  corrigido: ResultadoObra | undefined,
  ativo: ModoSistrut,
): ErroDoOriginal[] {
  const o = original.sistrut;
  if (!o || o.modo !== "original") return [];
  const c = corrigido?.sistrut?.modo === "corrigido" ? corrigido.sistrut : undefined;
  const nomes = new Map(original.pilares.map((p) => [p.pilar.id, p.pilar.nome]));
  return [
    transicao(o, c, ativo),
    reacoesTruncadas(o, c, ativo),
    flechaNaoVerificada(c ? corrigido : undefined, ativo),
    vizinhoNaoRefeito(o, c, ativo),
    otimizacaoSemFim(o, c, ativo),
    psiNoPiso(o, c, ativo),
    ...pilarSemResultado(o, c, nomes, ativo),
  ].filter((e): e is ErroDoOriginal => e !== undefined);
}

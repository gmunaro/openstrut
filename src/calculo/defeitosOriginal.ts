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
// do modo corrigido dá a coluna "Modo corrigido" e a flecha das lajes (R1), que o
// original não calcula.
import type { ResultadoObra } from "./fluxo";
import type { CasoPilar, ModoSistrut } from "./sistrut/base/tipos";
import type { ResultadoSistrut } from "./sistrut/obra";
import { num } from "./texto";

/** Efeito do erro sobre a segurança do que o original calculou. */
export type SentidoDefeito = "a favor" | "contra" | "neutro";

/** Uma linha da tabela de impacto: o elemento e o valor em cada situação (texto já
 *  formatado, com unidade). */
export interface LinhaImpacto {
  local: string;
  elemento: string;
  /** O que o SISTRUT original dá (o modo original da V2 reproduz). */
  original: string;
  /** O original sem este erro (as outras contas iguais); "—" quando não se isola. */
  semErro: string;
  /** O modo corrigido da V2 (este e os outros defeitos corrigidos, materiais SI). */
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
  /** O que a coluna de valores mede (ex.: "carga na fundação, t"). */
  grandeza: string;
  linhas: LinhaImpacto[];
  /** 3. O que a V2 faz no modo ativo. */
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
const pct = (parte: number, todo: number) => (todo > 0 ? `${num((100 * parte) / todo, 0)} %` : "");

const modoAtivo = (ativo: ModoSistrut) =>
  ativo === "original" ? "Modo ativo: Como o SISTRUT original." : "Modo ativo: corrigido.";

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
  const linhas: LinhaImpacto[] = duplas.map((t) => {
    const emDobro = Math.min(t.concentrada, t.cargaDeCima);
    const fo = fundacao(o, t.pilarIdBase);
    const fc = fundacao(c, t.pilarIdBase);
    return {
      local: t.pavimento,
      elemento: `${t.pilar} (nasce na ${t.viga} do ${t.pavimentoViga})`,
      original: fo === undefined ? "—" : t2(fo),
      semErro: fo === undefined ? "—" : `${t2(fo - emDobro)} (${t2(emDobro)} a menos)`,
      corrigido: fc === undefined ? "—" : t2(fc),
    };
  });
  const maior = duplas
    .map((t) => ({
      t,
      emDobro: Math.min(t.concentrada, t.cargaDeCima),
      fo: fundacao(o, t.pilarIdBase),
    }))
    .sort((a, b) => b.emDobro - a.emDobro)[0];
  const soma = duplas.reduce((s, t) => s + Math.min(t.concentrada, t.cargaDeCima), 0);
  const partes: string[] = [];
  if (maior && maior.fo !== undefined) {
    const sem = maior.fo - maior.emDobro;
    partes.push(
      `${duplas.length === 1 ? "1 pilar" : `${duplas.length} pilares`} (${duplas.map((t) => t.pilar).join(", ")}) com a carga contada duas vezes na fundação, ${t2(soma)} a mais no total. ` +
        `Maior caso: ${maior.t.pilar}, que nasce na viga ${maior.t.viga} do ${maior.t.pavimentoViga}: fundação com ${t2(maior.fo)} no SISTRUT contra ${t2(sem)} sem a dupla contagem; superdimensionamento de ${t2(maior.emDobro)} (${pct(maior.emDobro, sem)}).`,
    );
  }
  if (conferir.length > 0)
    partes.push(
      `A conferir: ${conferir.map((t) => `${t.pilar} (${t.pavimento}, ${t2(t.concentrada)} na viga ${t.viga} contra ${t2(t.cargaDeCima)} de carga)`).join("; ")}: a concentrada não cobre a carga do pilar, e a V2 não sabe se ela é parte dessa carga; se for, também entra duas vezes.`,
    );
  return {
    id: "P-b",
    titulo: "Carga em dobro na fundação de pilar sobre viga de transição",
    mecanismo:
      "O SISTRUT trata o pilar que nasce numa viga de transição como continuação da coluna do pilar de baixo, porque o .COL o declara com o mesmo número. A carga dele chega à fundação duas vezes: pela coluna e pela reação da viga, onde o usuário a lançou como carga concentrada.",
    impacto: partes.join(" "),
    sentido: "a favor",
    sentidoTexto:
      "A favor da segurança: a fundação e os lances do pilar de baixo saem dimensionados para mais carga do que recebem. A viga de transição recebe a carga uma vez só.",
    grandeza: "carga na fundação da coluna, sem o peso próprio do pilar (resumo do PILAREDI), t",
    linhas,
    v2Faz:
      ativo === "original"
        ? `${modoAtivo(ativo)} A V2 reproduz a dupla contagem (coluna "SISTRUT original") e marca os pilares. No modo corrigido, o pilar que nasce na viga não continua a coluna de baixo e a carga dele chega à fundação só pela viga (coluna "Modo corrigido").`
        : `${modoAtivo(ativo)} A V2 não continua a coluna de baixo: a carga do pilar chega à fundação uma vez, pela reação da viga de transição. A coluna "SISTRUT original" mostra o que o original daria.`,
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
  const perdas = o.pavimentos.flatMap((p) =>
    p.rep.flatMap((l) => {
      const perda = l.parcelas.reduce(
        (s, q) => s + Math.max((q.semCorte ?? q.valor) - q.valor, 0),
        0,
      );
      const cortadas = l.parcelas.filter((q) => (q.semCorte ?? q.valor) - q.valor > 1e-7).length;
      if (cortadas === 0) return [];
      const corr = c?.pavimentos
        .find((q) => q.pavimentoId === p.pavimentoId)
        ?.rep.find((q) => q.pilar === l.pilar)?.total;
      return [{ pav: p.nome, pilar: l.pilar, total: l.total, perda, cortadas, corr }];
    }),
  );
  if (perdas.length === 0) return undefined;
  perdas.sort((a, b) => b.perda - a.perda);
  const soma = perdas.reduce((s, x) => s + x.perda, 0);
  const n = perdas.reduce((s, x) => s + x.cortadas, 0);
  const maior = perdas[0]!;
  const maiorPct = Math.max(...perdas.map((x) => (100 * x.perda) / (x.total + x.perda)));
  const tr = (v: number) => `${num(v, 3)} t`;
  return {
    id: "R5",
    titulo: "Reações das vigas cortadas em duas casas no .REP",
    mecanismo:
      "O SISTRUT grava no .REP cada parcela de reação de viga em pilar cortada em duas casas decimais (INT(R·100)/100), sempre para menos. O pilar soma as parcelas já cortadas.",
    impacto: `${n} parcelas cortadas em ${perdas.length} linhas do .REP, ${tr(soma)} a menos no total da obra. Maior perda: ${maior.pilar} no ${maior.pav}, ${tr(maior.perda)} em ${tr(maior.total + maior.perda)} (${num((100 * maior.perda) / (maior.total + maior.perda), 2)} %).`,
    sentido: "contra",
    sentidoTexto:
      "Contra a segurança, mas pequeno: no máximo 0,01 t por viga e apoio, sempre a menos na carga do pilar.",
    grandeza: "soma das reações das vigas no pilar (.REP), t",
    linhas: perdas.map((x) => ({
      local: x.pav,
      elemento: x.pilar,
      original: tr(x.total),
      semErro: `${tr(x.total + x.perda)} (${x.cortadas} parcela${x.cortadas > 1 ? "s" : ""})`,
      corrigido: x.corr === undefined ? "—" : tr(x.corr),
    })),
    v2Faz:
      ativo === "original"
        ? `${modoAtivo(ativo)} A V2 corta as parcelas como o original (coluna "SISTRUT original"). O modo corrigido soma as reações sem cortar (coluna "Modo corrigido", que inclui também as outras correções).`
        : `${modoAtivo(ativo)} A V2 soma as reações sem cortar. A coluna "SISTRUT original" mostra a soma com as parcelas cortadas.`,
    oQueFazer: `A perda chega a ${num(maiorPct, 2)} % da carga de um pilar nesta obra. Revise só o pilar ou a fundação que estiver no limite.`,
    referencia: "VIGA.BAS:2412-2420",
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
            corrigido: ct ? asw(ct[`asw${lado}`], ct[`estribo${lado}`].texto) : "—",
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
    titulo: "Taxa de armadura do ψ sempre no mínimo (cortante das vigas)",
    mecanismo:
      "No cálculo de τc = ψ·√fck, com ψ = 0,225 + 15ρ, o SISTRUT lê a taxa ρ da armadura longitudinal antes de calculá-la, e ela fica sempre no piso de 0,001. O concreto parece resistir menos ao cortante do que resiste.",
    impacto: `${linhas.length} ${linhas.length === 1 ? "lado de tramo" : "lados de tramo"} com Asw acima do necessário. Maior diferença: ${maior.elemento} (${maior.local}), ${maior.original} no SISTRUT contra ${maior.semErro} com a taxa real. ${mudam === 0 ? "Em nenhum deles o estribo escolhido muda." : `Em ${mudam} o estribo escolhido muda.`}`,
    sentido: "a favor",
    sentidoTexto: "A favor da segurança: os estribos saem iguais ou maiores que os necessários.",
    grandeza: "armadura de cortante Asw e estribo escolhido",
    linhas: linhas.map(({ dif: _d, mudaEstribo: _m, ...l }) => l),
    v2Faz:
      ativo === "original"
        ? `${modoAtivo(ativo)} A V2 usa o ρ no piso, como o original (coluna "SISTRUT original"). O modo corrigido usa a taxa da armadura de flexão do tramo (coluna "Modo corrigido").`
        : `${modoAtivo(ativo)} A V2 usa a taxa da armadura de flexão do tramo. A coluna "SISTRUT original" mostra o Asw com o ρ no piso.`,
    oQueFazer:
      mudam === 0
        ? "Nada a revisar: os estribos detalhados são os mesmos."
        : "Os estribos executados com os valores do SISTRUT estão a favor da segurança. Num projeto novo, os do modo corrigido bastam.",
    referencia: "DESDIM.BAS:5004",
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
  return {
    id: "R1",
    titulo: "Flecha das lajes nunca verificada",
    mecanismo:
      "O SISTRUT lê os limites de flecha do .LAP (vão/300 no total e vão/500 na acidental), mas não os usa: a espessura mínima da laje sai só da flexão, e a coluna L/f do relatório é sempre 0.",
    impacto: `${acima.length === 1 ? "1 laje" : `${acima.length} lajes`} com flecha acima do limite, que o SISTRUT não aponta. Maior: ${maior.laje} (${maior.local}), h = ${num(maior.h, 0)} cm, flecha de ${num(maior.f, 2)} cm contra o limite de ${num(maior.lim, 2)} cm.`,
    sentido: "contra",
    sentidoTexto: "Contra a segurança em serviço: a laje pode deformar mais que o limite da norma.",
    grandeza: "flecha da laje com a espessura da obra, cm",
    linhas: acima.map((x) => ({
      local: x.local,
      elemento: x.laje,
      original: "não verificada",
      semErro: `${num(x.f, 2)} cm > limite ${num(x.lim, 2)} cm`,
      corrigido:
        x.hMin?.ok === true
          ? `aviso; espessura mínima ${num(x.hMin.h, 0)} cm (a obra tem ${num(x.h, 0)} cm)`
          : "aviso",
    })),
    v2Faz:
      ativo === "original"
        ? `${modoAtivo(ativo)} A V2 não verifica a flecha, como o original, e marca as lajes; a flecha da coluna "Sem o erro" é a da verificação do modo corrigido. O modo corrigido avisa e procura a espessura mínima que atende também a flecha.`
        : `${modoAtivo(ativo)} A V2 verifica a flecha (vão/300 e vão/500), avisa e procura a espessura mínima que também a atende. O SISTRUT não verificaria.`,
    oQueFazer:
      "Confira a flecha dessas lajes: aumente a espessura (a mínima do modo corrigido atende a flecha) ou justifique com contraflecha ou cálculo mais preciso.",
    referencia: "LAJE.BAS:1374-1387; LAJECALC.BAS:752, 781",
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
  const linhas: (LinhaImpacto & { menor: boolean })[] = [];
  for (const p of o.pavimentos)
    p.lajeproc.negativas.forEach((n, i) => {
      if (!n?.vizinhoNaoRecalculado) return;
      const nc = c?.pavimentos.find((q) => q.pavimentoId === p.pavimentoId)?.lajeproc.negativas[i];
      const nome = `${n.continuidade.lajeA} × ${n.continuidade.lajeB ?? "engaste"}`;
      linhas.push({
        local: p.nome,
        elemento: nome,
        original: `As ${asm(n.as)}`,
        semErro: "—",
        corrigido: nc ? `As ${asm(nc.as)}` : "—",
        menor: nc !== undefined && nc.as > n.as + 1e-6,
      });
    });
  if (linhas.length === 0) return undefined;
  const menores = linhas.filter((l) => l.menor).length;
  return {
    id: "R2",
    titulo: "Negativa de continuidade sem refazer a laje vizinha",
    mecanismo:
      "Na armadura de continuidade entre duas lajes, o LAJEPROC só recalcula a vizinha quando o lado dela tem número diferente do lado atual. Com o mesmo número, a negativa sai só com a armadura da laje corrente, que pode ser a menor das duas.",
    impacto: `${linhas.length === 1 ? "1 continuidade" : `${linhas.length} continuidades`} sem a vizinha refeita; ${menores === 0 ? "em nenhuma a negativa ficou menor que a do modo corrigido" : `em ${menores} a negativa ficou menor que a do modo corrigido`}.`,
    sentido: menores > 0 ? "contra" : "neutro",
    sentidoTexto:
      menores > 0
        ? "Contra a segurança: a negativa pode não cobrir o momento da laje vizinha."
        : "Sem efeito nesta obra: a negativa da laje corrente já é a maior.",
    grandeza: "armadura negativa da continuidade",
    linhas: linhas.map(({ menor: _m, ...l }) => l),
    v2Faz:
      ativo === "original"
        ? `${modoAtivo(ativo)} A V2 não refaz a vizinha, como o original, e marca as lajes. O modo corrigido refaz sempre a vizinha e usa a maior das duas armaduras.`
        : `${modoAtivo(ativo)} A V2 refaz sempre a vizinha e usa a maior das duas armaduras.`,
    oQueFazer:
      menores > 0
        ? "Confira a negativa dessas continuidades: use a As do modo corrigido."
        : "Nada a revisar nesta obra.",
    referencia: "LAJEPROC.BAS:836, 855",
    elementos: linhas.flatMap((l) =>
      l.elemento
        .split(" × ")
        .filter((x) => x !== "engaste")
        .map((elemento) => ({ local: l.local, elemento })),
    ),
  } satisfies ErroDoOriginal;
}

// ---------------------------------------------------------------- R3

function otimizacaoSemFim(o: ResultadoSistrut, ativo: ModoSistrut) {
  const paradas = o.pavimentos.flatMap((p) =>
    p.otimizacaoParada ? [{ pav: p.nome, parada: p.otimizacaoParada }] : [],
  );
  if (paradas.length === 0) return undefined;
  return {
    id: "R3",
    titulo: "Otimização dos negativos das lajes em laço sem fim",
    mecanismo:
      "Na otimização dos negativos (LAJECALC, opção 6), o SISTRUT reduz o coeficiente do lado com duas casas e grava o código dele com uma. O mesmo lado volta sem fim e o programa trava.",
    impacto: `${paradas.length === 1 ? "1 pavimento" : `${paradas.length} pavimentos`} em que a otimização não termina: ${paradas.map((x) => `${x.pav}, laje ${x.parada.laje}, lado ${x.parada.lado + 1}`).join("; ")}.`,
    sentido: "neutro",
    sentidoTexto:
      "Não reduz a segurança: valem os momentos de antes da otimização, sem a redistribuição dos negativos.",
    grandeza: "otimização dos negativos",
    linhas: paradas.map((x) => ({
      local: x.pav,
      elemento: x.parada.laje,
      original: `trava no lado ${x.parada.lado + 1} (relação ${num(x.parada.relacaoNova, 2)}, código ${x.parada.codigo})`,
      semErro: "—",
      corrigido: "converge",
    })),
    v2Faz:
      ativo === "original"
        ? `${modoAtivo(ativo)} A V2 para no lado que trava e usa os esforços de antes da otimização, com aviso. O modo corrigido grava o código sem arredondar, e a otimização converge.`
        : `${modoAtivo(ativo)} A V2 grava o código sem arredondar, e a otimização converge.`,
    oQueFazer:
      "Se o projeto saiu do SISTRUT, esse pavimento foi calculado sem a otimização (o usuário teve de interrompê-la): confira os negativos impressos. No modo corrigido a otimização vai até o fim.",
    referencia: "LAJECALC.BAS:2113, 2123, 2145",
    elementos: paradas.map((x) => ({ local: x.pav, elemento: x.parada.laje })),
  } satisfies ErroDoOriginal;
}

// ---------------------------------------------------------------- D-2, D-3

/** Casos de pilar com erro, por código: dos lances (PILAREDI) e das verificações (PILAR 6). */
function casosComErro(r: ResultadoSistrut, nomes: Map<string, string>, erro: CasoPilar["erro"]) {
  const achados: { local: string; elemento: string; caso: string }[] = [];
  for (const l of r.lances)
    for (const c of l.dimensionamento?.casos ?? [])
      if (c.erro === erro)
        achados.push({
          local: nomePavimento(r, l.pavimentoId),
          elemento: nomes.get(l.pilarId) ?? l.pilarId,
          caso: c.rotulo,
        });
  for (const v of r.verificacoes)
    for (const c of v.resultado?.casos ?? [])
      if (c.erro === erro)
        achados.push({
          local: nomePavimento(r, v.pavimentoId),
          elemento: nomes.get(v.pilarId) ?? v.pilarId,
          caso: c.rotulo,
        });
  return achados;
}

function pilarSemResultado(
  o: ResultadoSistrut,
  nomes: Map<string, string>,
  ativo: ModoSistrut,
): ErroDoOriginal[] {
  const out: ErroDoOriginal[] = [];
  const nk = casosComErro(o, nomes, "nk-nulo");
  if (nk.length > 0)
    out.push({
      id: "D-3",
      titulo: "Pilar com Nk nulo: divisão por zero",
      mecanismo:
        "Na busca do equilíbrio da seção do pilar, o SISTRUT divide pelo Nk. Com Nk = 0 o programa para com erro de execução.",
      impacto: `${nk.length === 1 ? "1 caso" : `${nk.length} casos`} de pilar sem resultado no SISTRUT: ${nk.map((x) => `${x.elemento} (${x.local}, caso ${x.caso})`).join("; ")}.`,
      sentido: "contra",
      sentidoTexto: "Contra a segurança: o caso fica sem verificação no original.",
      grandeza: "verificação do caso de excentricidade",
      linhas: nk.map((x) => ({
        local: x.local,
        elemento: x.elemento,
        original: `caso ${x.caso}: sem resultado`,
        semErro: "—",
        corrigido: "calculado com |Nk| ≥ 1",
      })),
      v2Faz:
        ativo === "original"
          ? `${modoAtivo(ativo)} A V2 deixa o caso sem resultado, como o original, com aviso. O modo corrigido testa o equilíbrio com max(|Nk|, 1) e calcula o caso.`
          : `${modoAtivo(ativo)} A V2 testa o equilíbrio com max(|Nk|, 1) e calcula o caso.`,
      oQueFazer: "Confira esses pilares pelo modo corrigido.",
      referencia: "PILAR.BAS:5078, 5147; PILAREDI.BAS:5105",
      elementos: nk.map(({ local, elemento }) => ({ local, elemento })),
    });
  const laco = casosComErro(o, nomes, "nao-converge");
  if (laco.length > 0)
    out.push({
      id: "D-2",
      titulo: "Busca do equilíbrio do pilar sem fim",
      mecanismo:
        "Na busca do equilíbrio da seção do pilar, o ajuste pode não convergir, e o SISTRUT fica em laço sem fim.",
      impacto: `${laco.length === 1 ? "1 caso" : `${laco.length} casos`} de pilar em que o original não termina: ${laco.map((x) => `${x.elemento} (${x.local}, caso ${x.caso})`).join("; ")}.`,
      sentido: "contra",
      sentidoTexto: "Contra a segurança: o caso fica sem verificação.",
      grandeza: "verificação do caso de excentricidade",
      linhas: laco.map((x) => ({
        local: x.local,
        elemento: x.elemento,
        original: `caso ${x.caso}: não termina`,
        semErro: "—",
        corrigido: "sem resultado (para também)",
      })),
      v2Faz: `${modoAtivo(ativo)} A V2 para a busca nos dois modos e deixa o caso sem resultado, com aviso: este defeito não tem correção.`,
      oQueFazer:
        "Verifique esses pilares por outro meio, ou mude a seção ou a armadura até o caso ter resultado.",
      referencia: "PILAR.BAS:5015-5534; PILAREDI.BAS:5053-5425 (busca do equilíbrio)",
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
  const pilares = pilarSemResultado(o, nomes, ativo);
  return [
    transicao(o, c, ativo),
    reacoesTruncadas(o, c, ativo),
    flechaNaoVerificada(c ? corrigido : undefined, ativo),
    vizinhoNaoRefeito(o, c, ativo),
    otimizacaoSemFim(o, ativo),
    psiNoPiso(o, c, ativo),
    ...pilares,
  ].filter((e): e is ErroDoOriginal => e !== undefined);
}

// Situação de cada laje, viga e pilar no resultado do cálculo, para colorir a planta:
// ok (sem avisos), aviso (com avisos) ou falha (cálculo impossível ou ausente).
import type {
  ResultadoLaje,
  ResultadoPavimento,
  ResultadoPilar,
  ResultadoViga,
} from "../calculo/fluxo";
import { mesmoPonto } from "../dominio/gerar";
import type { Pavimento } from "../dominio/obra";

export type Situacao = "ok" | "aviso" | "falha";

export interface Diagnostico {
  situacao: Situacao;
  mensagens: string[];
}

/** Diagnóstico de quem não aparece no resultado (laje nova, viga sem apoios suficientes). */
export const SEM_CALCULO: Diagnostico = { situacao: "falha", mensagens: ["Sem cálculo."] };

const diagnostico = (falhas: string[], avisos: string[]): Diagnostico =>
  falhas.length > 0
    ? { situacao: "falha", mensagens: [...falhas, ...avisos] }
    : { situacao: avisos.length > 0 ? "aviso" : "ok", mensagens: avisos };

/** Laje: falha se algum esforço ou armadura não é finito ou se ela não tem reação
 *  nenhuma (sem cálculo: a carga não chegou às vigas, ResultadoPavimento.falhas);
 *  aviso se esforços ou armadura têm avisos. */
export function diagnosticoLaje(r: ResultadoLaje): Diagnostico {
  const { esforcos: e, armadura: a } = r;
  const falhas: string[] = [];
  const reacoes = Object.values(e.reacoes);
  if (!reacoes.every(Number.isFinite) || reacoes.every((x) => x === 0))
    falhas.push("Laje sem cálculo: a carga dela não chegou às vigas.");
  else if (![e.mx, e.my, a.asx, a.asy, ...Object.values(a.asNegativos)].every(Number.isFinite))
    falhas.push("Armadura impossível.");
  return diagnostico(falhas, [...e.avisos, ...a.avisos]);
}

/** Avisos da viga: os da análise (ligação viga-pilar, viga contínua) e os do
 *  dimensionamento. A mesma união de avisosViga (telas/calculo.ts), replicada aqui
 *  para a planta não depender das telas. */
const avisosViga = (r: ResultadoViga) => [...new Set([...r.analise.avisos, ...r.avisos])];

/** Viga: falha se a análise não fechou (analise.ok = false), se alguma seção não tem
 *  armadura possível (As infinito), se a biela esmaga ou se o pavimento tem falha
 *  (`falhasPavimento` = ResultadoPavimento.falhas: carga incompleta); aviso se há
 *  avisos da análise ou do dimensionamento. */
export function diagnosticoViga(
  r: ResultadoViga,
  falhasPavimento: readonly string[] = [],
): Diagnostico {
  const avisos = avisosViga(r);
  if (!r.analise.ok) return diagnostico(["Análise não realizada.", ...falhasPavimento], avisos);
  const falhas = [...falhasPavimento];
  for (const t of r.tramos) {
    const secoes = [t.positivo, t.negativoEsq, t.negativoDir];
    if (secoes.some((s) => s.flexao && !Number.isFinite(s.flexao.as)))
      falhas.push("Flexão sem armadura possível.");
    if (!t.cortante.bielaOk) falhas.push("Biela comprimida esmagada.");
  }
  return diagnostico([...new Set(falhas)], avisos);
}

/** Avisos dos pilares (normas/nb1-78/pilares.ts e nbr6118-2023/pilares.ts) que dizem
 *  que a seção não serve: armadura acima do máximo, barras que não cabem, dimensão ou
 *  área abaixo do mínimo da norma. */
const SECAO_INSUFICIENTE = /aumente a seção|não permitida|barras não cabem/;

/** Pilar num nível: falha se o Nk não inclui toda a carga (ResultadoPilar.falhas), se
 *  não há armadura possível (asNecessaria NaN) ou se um aviso diz que a seção é
 *  insuficiente; aviso se há outros avisos. */
export function diagnosticoPilar(r: ResultadoPilar): Diagnostico {
  const { asNecessaria, avisos } = r.resultado;
  const secao = avisos.filter((a) => SECAO_INSUFICIENTE.test(a));
  if (!Number.isFinite(asNecessaria) && secao.length === 0)
    secao.push(...(avisos.length > 0 ? avisos : ["Sem armadura possível."]));
  const falhas = [...r.falhas, ...secao];
  return diagnostico(
    falhas,
    avisos.filter((a) => !falhas.includes(a)),
  );
}

const GRAVIDADE: Record<Situacao, number> = { ok: 0, aviso: 1, falha: 2 };

/** Diagnóstico por id de pilar do pavimento: a pior situação entre os níveis dele
 *  (cada repetição de um pavimento-tipo é um nível). O nível é casado pelo id do
 *  pavimento (nomes podem se repetir) e o pilar pela posição, porque o mesmo pilar
 *  atravessa vários pavimentos. */
export function diagnosticosPilares(pav: Pavimento, resultados: readonly ResultadoPilar[]) {
  const mapa = new Map<string, Diagnostico>();
  for (const r of resultados) {
    if (r.pavimentoId !== pav.id) continue;
    const pilar = pav.pilares.find((p) => mesmoPonto(p, r.pilar));
    if (!pilar) continue;
    const d = diagnosticoPilar(r);
    const nivel = pav.repeticoes > 1 ? `${pav.nome} (${r.repeticao}/${pav.repeticoes}): ` : "";
    const mensagens = d.mensagens.map((m) => nivel + m);
    const antes = mapa.get(pilar.id);
    mapa.set(pilar.id, {
      situacao:
        antes && GRAVIDADE[antes.situacao] > GRAVIDADE[d.situacao] ? antes.situacao : d.situacao,
      mensagens: [...new Set([...(antes?.mensagens ?? []), ...mensagens])],
    });
  }
  return mapa;
}

/** Diagnósticos por id de laje, de viga e, com `pilares` (ResultadoObra.pilares), de pilar.
 *  Elemento ausente do mapa = SEM_CALCULO; sem `pilares`, os pilares ficam sem cor. */
export function diagnosticos(r: ResultadoPavimento, pilares?: readonly ResultadoPilar[]) {
  return {
    lajes: new Map(r.lajes.map((l) => [l.laje.id, diagnosticoLaje(l)])),
    vigas: new Map(r.vigas.map((v) => [v.viga.id, diagnosticoViga(v, r.falhas)])),
    pilares: pilares && diagnosticosPilares(r.pavimento, pilares),
  };
}

export type Diagnosticos = ReturnType<typeof diagnosticos>;

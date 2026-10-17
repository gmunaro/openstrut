// Dados de cada elemento da vista 3D a partir do cálculo: situação (mesma regra e cores
// da planta, planta/situacao.ts), o resultado principal (As, Nd ou momento), a grandeza
// do mapa de cor e as marcas dos defeitos do SISTRUT original (modo "original",
// docs/MODO-CALCULO.md). Puro: nada de three.js.
import type { ResultadoObra, ResultadoPilar } from "../../calculo/fluxo";
import { mesmoPonto } from "../../dominio/gerar";
import type { Obra } from "../../dominio/obra";
import {
  type Situacao,
  diagnosticoLaje,
  diagnosticoPilar,
  diagnosticoViga,
} from "../../planta/situacao";
import type { Calculo } from "../calculo";
import { formatarGrandeza, formatarNumero, type SistemaUnidades, unidade } from "../formato";
import type { Elemento3D, Modelo3D } from "./modelo";

/** "sem": sem cálculo (obra não calculada ou elemento fora do resultado). */
export type Estado = Situacao | "sem";

export type GrandezaMapa = "nkPilares" | "taxaVigas" | "momentoLajes";

export interface DadosElemento {
  estado: Estado;
  /** Avisos e falhas do elemento, como na planta. */
  mensagens: string[];
  /** Resultado principal, já formatado com unidade (ex.: "Nd = 812,40 kN"). */
  principal?: string;
  /** Valor SI da grandeza do mapa de cor do tipo (Nk, kN; taxa, %; momento, kN·m/m). */
  grandeza?: number;
  /** Defeitos do SISTRUT original que atingem o elemento (só no modo original). */
  defeitos: string[];
}

export const GRANDEZAS: Record<
  GrandezaMapa,
  { rotulo: string; tipo: Elemento3D["tipo"]; unidade: (s: SistemaUnidades) => string }
> = {
  nkPilares: { rotulo: "Nk nos pilares", tipo: "pilar", unidade: (s) => unidade("forca", s) },
  taxaVigas: { rotulo: "Taxa de armadura das vigas", tipo: "viga", unidade: () => "%" },
  momentoLajes: {
    rotulo: "Momento nas lajes",
    tipo: "laje",
    unidade: (s) => unidade("momentoLinear", s),
  },
};

/** Texto do aviso do motor no pilar que nasce sobre viga com a carga dele (defeito P-b). */
const CARGA_EM_DOBRO = /chegam à fundação duas vezes/;

const SEM: DadosElemento = { estado: "sem", mensagens: ["Sem cálculo."], defeitos: [] };

/** Dados por chave de elemento. Sem cálculo ok, todo elemento fica "sem". */
export function dadosDosElementos(
  modelo: Modelo3D,
  calculo: Calculo,
  obra: Obra,
  s: SistemaUnidades,
): Map<string, DadosElemento> {
  const mapa = new Map<string, DadosElemento>();
  if (calculo.tipo !== "ok") {
    for (const e of modelo.elementos) mapa.set(e.chave, SEM);
    return mapa;
  }
  const r = calculo.resultado;
  const original = obra.modoCalculo === "original";
  const defeitos = original ? defeitosDoOriginal(r) : new Map<string, string[]>();
  const pavRes = new Map(r.pavimentos.map((p) => [p.pavimento.id, p]));
  const vigaObra = new Map(
    obra.pavimentos.flatMap((p) => p.vigas.map((v) => [`${p.id}|${v.id}`, v])),
  );

  for (const e of modelo.elementos) {
    const rp = pavRes.get(e.pavimentoId);
    const def = defeitos.get(`${e.tipo}|${e.pavimentoId}|${e.id}`) ?? [];
    if (e.tipo === "laje") {
      const rl = rp?.lajes.find((l) => l.laje.id === e.id);
      if (!rl) {
        mapa.set(e.chave, { ...SEM, defeitos: def });
        continue;
      }
      const d = diagnosticoLaje(rl);
      const m = Math.max(Math.abs(rl.esforcos.mx), Math.abs(rl.esforcos.my));
      mapa.set(e.chave, {
        estado: d.situacao,
        mensagens: d.mensagens,
        principal: `mx = ${formatarGrandeza(rl.esforcos.mx, "momentoLinear", s)}, my = ${formatarGrandeza(rl.esforcos.my, "momentoLinear", s)} ${unidade("momentoLinear", s)}; As x/y = ${formatarNumero(rl.armadura.asx)}/${formatarNumero(rl.armadura.asy)} cm²/m`,
        grandeza: m,
        defeitos: def,
      });
    } else if (e.tipo === "viga" || e.tipo === "escada") {
      // a escada do SISTRUT são vigas do pavimento avulso, calculadas como as outras
      const rv = rp?.vigas.find((v) => v.viga.id === e.id);
      if (!rv) {
        mapa.set(e.chave, { ...SEM, defeitos: def });
        continue;
      }
      const d = diagnosticoViga(rv, rp?.falhas);
      // As máximo e taxa ρ = As / (bw·h) por tramo, com a seção do próprio tramo (.SEC na
      // mesma quantidade de tramos; senão a primeira seção ou bw × h da viga)
      const v = vigaObra.get(`${e.pavimentoId}|${e.id}`);
      const secoes = v?.secoes?.trechos ?? [];
      let as = 0;
      let taxa: number | undefined;
      rv.tramos.forEach((t, k) => {
        const asT = Math.max(
          0,
          ...[t.positivo, t.negativoEsq, t.negativoDir].map((x) =>
            x.flexao && Number.isFinite(x.flexao.as) ? x.flexao.as : 0,
          ),
        );
        as = Math.max(as, asT);
        const s = (secoes.length === rv.tramos.length ? secoes[k] : secoes[0]) ?? v ?? undefined;
        if (s && s.bw > 0 && s.h > 0) taxa = Math.max(taxa ?? 0, (100 * asT) / (s.bw * s.h));
      });
      mapa.set(e.chave, {
        estado: d.situacao,
        mensagens: d.mensagens,
        principal: `As máx = ${formatarNumero(as)} cm²${taxa !== undefined ? ` (ρ = ${formatarNumero(taxa)} % de bw·h)` : ""}`,
        ...(taxa !== undefined ? { grandeza: taxa } : {}),
        defeitos: def,
      });
    } else if (e.tipo === "pilar") {
      const nivel = modelo.niveis[e.nivel];
      const p = obra.pavimentos
        .find((q) => q.id === e.pavimentoId)
        ?.pilares.find((q) => q.id === e.id);
      const rpil =
        p &&
        r.pilares.find(
          (x: ResultadoPilar) =>
            x.pavimentoId === e.pavimentoId &&
            x.repeticao === nivel?.repeticao &&
            mesmoPonto(x.pilar, p),
        );
      if (!rpil) {
        mapa.set(e.chave, { ...SEM, defeitos: def });
        continue;
      }
      const d = diagnosticoPilar(rpil);
      const pb = rpil.resultado.avisos.filter((a) => CARGA_EM_DOBRO.test(a));
      mapa.set(e.chave, {
        estado: d.situacao,
        mensagens: d.mensagens,
        principal: `Nk = ${formatarGrandeza(rpil.nk, "forca", s)} ${unidade("forca", s)}, Nd = ${formatarGrandeza(rpil.resultado.nd, "forca", s)} ${unidade("forca", s)}; As = ${formatarNumero(rpil.resultado.asNecessaria)} cm² (${formatarNumero(rpil.resultado.taxa)} %)`,
        grandeza: rpil.nk,
        defeitos: original
          ? [
              ...def,
              ...pb.map((a) => `Carga em dobro na fundação (defeito P-b): ${a}`),
              ...defeitosVerificacao(rpil),
            ]
          : def,
      });
    } else mapa.set(e.chave, { estado: "sem", mensagens: [], defeitos: [] });
    // lance visual da escada e fundação não têm cálculo
  }
  return mapa;
}

/** Casos da verificação (PILAR opção 6) em que o original trava (D-2) ou divide por zero (D-3). */
function defeitosVerificacao(r: ResultadoPilar): string[] {
  const erros = new Set(
    (r.verificacoes ?? []).flatMap((v) => v.casos.flatMap((c) => (c.erro ? [c.erro] : []))),
  );
  return [...erros].map((e) =>
    e === "nao-converge"
      ? "Verificação sem resultado: a busca do equilíbrio não converge (defeito D-2)."
      : e === "nk-nulo"
        ? "Verificação sem resultado: Nk nulo, o original divide por zero (defeito D-3)."
        : `Verificação sem resultado (${e}).`,
  );
}

/** Defeitos do original por `tipo|pavimentoId|id`: otimização parada (R3) na laje, viga
 *  parada no "Continuo… S/N" e os avisos com opção (pilar sobre transição, viga acima do
 *  limite). */
function defeitosDoOriginal(r: ResultadoObra) {
  const mapa = new Map<string, string[]>();
  const add = (k: string, t: string) => mapa.set(k, [...(mapa.get(k) ?? []), t]);
  const obraPav = new Map(r.pavimentos.map((p) => [p.pavimento.id, p.pavimento]));
  for (const ps of r.sistrut?.pavimentos ?? []) {
    const parada = ps.otimizacaoParada;
    const pav = obraPav.get(ps.pavimentoId);
    if (parada && pav) {
      const laje = pav.lajes.find((l) => l.nome === parada.laje || l.id === parada.laje);
      if (laje)
        add(
          `laje|${ps.pavimentoId}|${laje.id}`,
          "A otimização dos negativos do original não converge nesta laje (defeito R3).",
        );
    }
    for (const v of ps.vigas)
      if (v.interrompida)
        add(
          `viga|${ps.pavimentoId}|${v.id}`,
          `O original para em "Continuo com o processamento desta Viga S/N" (${v.interrompida.motivos.join(" e ")}): sem detalhamento.`,
        );
  }
  for (const a of r.avisosComOpcao ?? []) {
    const k = `${a.elemento.tipo}|${a.pavimentoId}|${a.elemento.id}`;
    // a viga interrompida já tem o texto do laço acima
    if (a.id === "viga.continuar-acima-do-limite" && mapa.has(k)) continue;
    add(k, a.texto);
  }
  return mapa;
}

/** Estatística da grandeza do mapa: mínimo e máximo entre os elementos do tipo. */
export function faixaDaGrandeza(
  modelo: Modelo3D,
  dados: ReadonlyMap<string, DadosElemento>,
  g: GrandezaMapa,
): { min: number; max: number } | undefined {
  const valores = modelo.elementos
    .filter((e) => e.tipo === GRANDEZAS[g].tipo)
    .flatMap((e) => {
      const v = dados.get(e.chave)?.grandeza;
      return v !== undefined && Number.isFinite(v) ? [v] : [];
    });
  if (valores.length === 0) return undefined;
  return { min: Math.min(...valores), max: Math.max(...valores) };
}

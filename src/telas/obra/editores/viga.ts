// Formulário da entrada de viga do VIGA e do DESENHO do SISTRUT (docs/MODO-CALCULO.md,
// "Entrada de viga do VIGA e do DESENHO"): Viga → textos do formulário e de volta, com
// as regras do leitor do arquivo (src/armazenamento/arquivo.ts, entradaVigaSistrut).
// Trechos e apoios seguem o eixo crescente, como o .VIG: o trecho 0 é o primeiro (o
// balanço esquerdo, se houver) e o apoio 0 é o primeiro apoio.
import { geometriaDasVigas } from "../../../calculo/montagem";
import { eixoDaViga } from "../../../dominio/gerar";
import type {
  ArmaduraDigitada,
  CargaViga,
  FormaApoioViga,
  FormaTrechoViga,
  Pavimento,
  Viga,
} from "../../../dominio/obra";
import { formatarNumero } from "../../formato";
import {
  boolDe,
  Leitor,
  type LinhaForm,
  listaOuNada,
  semChaves,
  soDefinidos,
  textoDe,
  triDe,
  type TriEstado,
} from "./formulario";

/** Trechos e apoios da viga pela regra da V2 (`geometriaDasVigas`), para rotular as linhas. */
export interface GeometriaEditor {
  trechos: { rotulo: string; vao: number }[];
  apoios: string[];
}

/** Trechos ("Trecho 0: P1–P2, 4,00 m") e apoios ("Apoio 0: P1") da viga; undefined se a
 *  viga não entra na montagem (eixo inclinado). */
export function geometriaDaViga(pav: Pavimento, vigaId: string): GeometriaEditor | undefined {
  const g = geometriaDasVigas(pav).vigas.find((x) => x.viga.id === vigaId);
  if (!g) return undefined;
  const nomeNo = (k: number) => {
    const a = g.apoios[k];
    return !a || a.tipo === "livre" ? "ponta livre" : a.nome;
  };
  const trechos = g.nos.slice(1).map((fim, k) => {
    const vao = fim - (g.nos[k] ?? fim);
    return {
      vao,
      rotulo: `Trecho ${k}: ${nomeNo(k)}–${nomeNo(k + 1)}, ${formatarNumero(vao)} m`,
    };
  });
  const apoios = g.apoios
    .flatMap((a) => (a.tipo === "livre" ? [] : [a.nome]))
    .map((nome, k) => `Apoio ${k}: ${nome}`);
  return { trechos, apoios };
}

/** Outras vigas do pavimento que cruzam ou tocam o eixo desta: candidatas ao "apoia em". */
export function vigasQueCruzam(pav: Pavimento, v: Viga): Viga[] {
  const e = eixoDaViga(v);
  if (!e) return [];
  const TOL = 1e-6;
  return pav.vigas.filter((o) => {
    if (o.id === v.id) return false;
    const f = eixoDaViga(o);
    if (!f || f.horizontal === e.horizontal) return false;
    return f.c >= e.s1 - TOL && f.c <= e.s2 + TOL && e.c >= f.s1 - TOL && e.c <= f.s2 + TOL;
  });
}

type Dist = LinhaForm<"trecho" | "inicio" | "fim" | "total" | "acidental">;
type Conc = LinhaForm<"trecho" | "posicao" | "total" | "acidental">;
type Reac = LinhaForm<"trecho" | "posicao" | "viga" | "apoio">;
type SecTrecho = LinhaForm<"bw" | "h" | "bf" | "hf">;
type SecApoio = LinhaForm<"bw" | "h">;
type FormaTrecho = LinhaForm<"vaoLivre" | "pe" | "hle" | "pd" | "hld" | "eixo" | "alinhamento">;
type FormaApoio = LinhaForm<"largura" | "tipo" | "titulo" | "codigo" | "lps" | "dis">;
type ApoioRep = LinhaForm<"desconsiderado" | "pilar">;
/** Colunas de uma alteração de armadura do DESDIM. */
export type CampoArmadura =
  | "em"
  | "numero"
  | "bitola"
  | "bitolaMistura"
  | "barras"
  | "barrasMistura"
  | "comprimida"
  | "fisBitola"
  | "fisQuantidade";
type Armadura = LinhaForm<CampoArmadura>;

/** Tipos de apoio do .FOR: pilar, viga, outro, apoio. */
export const TIPOS_APOIO_FORMA = ["P", "V", "O", "A"] as const;

/** Abas do editor da viga: as mensagens de erro começam pelo rótulo da aba. */
export const ABAS_VIGA = {
  cargas: "Cargas",
  secoes: "Seções e fôrma",
  vaos: "Vãos e apoios",
  rodada: "Rodada",
  armadura: "Armadura alterada",
} as const;
export type AbaViga = keyof typeof ABAS_VIGA;

/** Abas que têm alguma das mensagens de erro (pelo prefixo "Aba → "). */
export const abasComErro = (erros: readonly string[]) =>
  (Object.keys(ABAS_VIGA) as AbaViga[]).filter((a) =>
    erros.some((e) => e.startsWith(`${ABAS_VIGA[a]} → `)),
  );

export type Engaste = "montagem" | "nenhum" | "esquerdo" | "direito" | "ambos";
export type LajesNoCorte = "planta" | "nao" | "mesa";

export interface FormViga {
  somenteCargasProprias: TriEstado;
  pesoProprio: string;
  distribuidas: Dist[];
  concentradas: Conc[];
  reacoes: Reac[];
  comSecoesTrechos: boolean;
  secoesTrechos: SecTrecho[];
  comSecoesApoios: boolean;
  secoesApoios: SecApoio[];
  lajesNoCorte: LajesNoCorte;
  comFormaTrechos: boolean;
  formaTrechos: FormaTrecho[];
  comFormaApoios: boolean;
  formaApoios: FormaApoio[];
  comVaos: boolean;
  vaos: LinhaForm<"vao">[];
  comInercias: boolean;
  inercias: LinhaForm<"j">[];
  engaste: Engaste;
  comMomentos: boolean;
  momentoEsquerdo: string;
  momentoDireito: string;
  apoios: ApoioRep[];
  continuaSeExcederLimite: TriEstado;
  apoiaEm: string[];
  repeticoes: string;
  armaduras: Armadura[];
}

/** Campos da viga que o editor controla (os outros passam intactos). */
const CAMPOS = [
  "pesoProprio",
  "apoiaEm",
  "cargas",
  "somenteCargasProprias",
  "vaos",
  "inercias",
  "engaste",
  "momentosExternos",
  "apoiosDesconsiderados",
  "pilaresNoRep",
  "repeticoes",
  "armaduraDigitada",
  "continuaSeExcederLimite",
  "secoes",
  "forma",
] as const satisfies readonly (keyof Viga)[];

/** `n` linhas: as dadas, completadas com `vazia` (ou cortadas, se sobram). */
function nLinhas<T>(dadas: T[], n: number, vazia: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => dadas[i] ?? vazia(i));
}

export const linhaDistribuida = (): Dist => ({
  trecho: "0",
  inicio: "0",
  fim: "",
  total: "",
  acidental: "",
});
export const linhaConcentrada = (): Conc => ({
  trecho: "0",
  posicao: "",
  total: "",
  acidental: "",
});
export const linhaReacao = (): Reac => ({ trecho: "0", posicao: "", viga: "", apoio: "0" });
export const linhaArmadura = (): Armadura => ({
  em: "apoio",
  numero: "0",
  bitola: "",
  bitolaMistura: "",
  barras: "",
  barrasMistura: "",
  comprimida: "",
  fisBitola: "",
  fisQuantidade: "",
});

/** Viga → formulário. As tabelas por trecho e por apoio têm o tamanho da geometria. */
export function formDaViga(v: Viga, geo: GeometriaEditor | undefined): FormViga {
  const nTrechos =
    geo?.trechos.length ?? Math.max(v.vaos?.length ?? 0, v.secoes?.trechos?.length ?? 0);
  const nApoios =
    geo?.apoios.length ?? Math.max(v.pilaresNoRep?.length ?? 0, v.secoes?.apoios?.length ?? 0);
  const cargas = v.cargas ?? [];
  const de = <T extends CargaViga["tipo"]>(t: T) =>
    cargas.filter((c): c is Extract<CargaViga, { tipo: T }> => c.tipo === t);
  const engaste: Engaste = !v.engaste
    ? "montagem"
    : v.engaste.esquerdo && v.engaste.direito
      ? "ambos"
      : v.engaste.esquerdo
        ? "esquerdo"
        : v.engaste.direito
          ? "direito"
          : "nenhum";
  return {
    somenteCargasProprias: triDe(v.somenteCargasProprias),
    pesoProprio: textoDe(v.pesoProprio),
    distribuidas: de("distribuida").map((c) => ({
      trecho: textoDe(c.trecho),
      inicio: textoDe(c.inicio),
      fim: textoDe(c.fim),
      total: textoDe(c.total),
      acidental: textoDe(c.acidental),
    })),
    concentradas: de("concentrada").map((c) => ({
      trecho: textoDe(c.trecho),
      posicao: textoDe(c.posicao),
      total: textoDe(c.total),
      acidental: textoDe(c.acidental),
    })),
    reacoes: de("reacao").map((c) => ({
      trecho: textoDe(c.trecho),
      posicao: textoDe(c.posicao),
      viga: c.viga,
      apoio: textoDe(c.apoio),
    })),
    comSecoesTrechos: v.secoes?.trechos !== undefined,
    secoesTrechos: nLinhas(
      (v.secoes?.trechos ?? []).map((s) => ({
        bw: textoDe(s.bw),
        h: textoDe(s.h),
        bf: textoDe(s.bf),
        hf: textoDe(s.hf),
      })),
      nTrechos,
      () => ({ bw: textoDe(v.bw), h: textoDe(v.h), bf: "0", hf: "0" }),
    ),
    comSecoesApoios: v.secoes?.apoios !== undefined,
    secoesApoios: nLinhas(
      (v.secoes?.apoios ?? []).map((s) => ({ bw: textoDe(s.bw), h: textoDe(s.h) })),
      nApoios,
      () => ({ bw: textoDe(v.bw), h: textoDe(v.h) }),
    ),
    lajesNoCorte: v.forma?.lajesNoCorte ?? "planta",
    comFormaTrechos: v.forma?.trechos !== undefined,
    formaTrechos: nLinhas(
      (v.forma?.trechos ?? []).map((f) => ({
        vaoLivre: textoDe(f.vaoLivre),
        pe: textoDe(f.pe),
        hle: textoDe(f.hle),
        pd: textoDe(f.pd),
        hld: textoDe(f.hld),
        eixo: textoDe(f.eixo),
        alinhamento: textoDe(f.alinhamento),
      })),
      nTrechos,
      () => ({ vaoLivre: "", pe: "", hle: "", pd: "", hld: "", eixo: "", alinhamento: "" }),
    ),
    comFormaApoios: v.forma?.apoios !== undefined,
    formaApoios: nLinhas(
      (v.forma?.apoios ?? []).map((a) => ({
        largura: textoDe(a.largura),
        tipo: a.tipo ?? "",
        titulo: a.titulo ?? "",
        codigo: textoDe(a.codigo),
        lps: textoDe(a.lps),
        dis: textoDe(a.dis),
      })),
      nApoios,
      () => ({ largura: "", tipo: "", titulo: "", codigo: "", lps: "", dis: "" }),
    ),
    comVaos: v.vaos !== undefined,
    vaos: nLinhas(
      (v.vaos ?? []).map((x) => ({ vao: textoDe(x) })),
      nTrechos,
      (i) => ({ vao: textoDe(geo?.trechos[i]?.vao) }),
    ),
    comInercias: v.inercias !== undefined,
    inercias: nLinhas(
      (v.inercias ?? []).map((x) => ({ j: textoDe(x) })),
      nTrechos,
      () => ({ j: "1" }),
    ),
    engaste,
    comMomentos: v.momentosExternos !== undefined,
    momentoEsquerdo: textoDe(v.momentosExternos?.esquerdo ?? 0),
    momentoDireito: textoDe(v.momentosExternos?.direito ?? 0),
    apoios: nLinhas([], nApoios, (k) => ({
      desconsiderado: v.apoiosDesconsiderados?.includes(k) ? "sim" : "nao",
      pilar: textoDe(v.pilaresNoRep?.[k]),
    })),
    continuaSeExcederLimite: triDe(v.continuaSeExcederLimite),
    apoiaEm: v.apoiaEm ?? [],
    repeticoes: textoDe(v.repeticoes),
    armaduras: (v.armaduraDigitada ?? []).map((a) => ({
      em: a.em,
      numero: textoDe(a.numero),
      bitola: textoDe(a.tracionada?.bitola),
      bitolaMistura: textoDe(a.tracionada?.bitolaMistura),
      barras: textoDe(a.tracionada?.barras),
      barrasMistura: textoDe(a.tracionada?.barrasMistura),
      comprimida: a.comprimida ?? "",
      fisBitola: textoDe(a.fissuracao?.bitola),
      fisQuantidade: textoDe(a.fissuracao?.quantidade),
    })),
  };
}

/**
 * Formulário → viga, ou a lista de problemas. As faixas são as do leitor do arquivo;
 * além delas, a carga precisa cair num trecho que existe (quando a geometria é conhecida).
 */
export function vigaDoForm(
  f: FormViga,
  v: Viga,
  geo: GeometriaEditor | undefined,
): Viga | string[] {
  const l = new Leitor();
  l.secao = ABAS_VIGA.cargas;
  const pesoProprio = l.opcional(f.pesoProprio, "Peso próprio", "naoNegativo");
  const trecho = (texto: string, rotulo: string) => {
    const k = l.numero(texto, `${rotulo}, trecho`, "naoNegativo", true);
    if (geo && Number.isInteger(k) && k >= geo.trechos.length)
      l.erro(
        `${rotulo}: a viga tem ${geo.trechos.length} trechos (0 a ${geo.trechos.length - 1}).`,
      );
    return k;
  };
  const cargas: CargaViga[] = [
    ...f.distribuidas.map((c, i): CargaViga => {
      const r = `Carga distribuída ${i + 1}`;
      const inicio = l.numero(c.inicio, `${r}, início`, "naoNegativo");
      const fim = l.numero(c.fim, `${r}, fim`, "naoNegativo");
      if (fim < inicio) l.erro(`${r}: o fim precisa ser maior ou igual ao início.`);
      return {
        tipo: "distribuida",
        trecho: trecho(c.trecho, r),
        inicio,
        fim,
        total: l.numero(c.total, `${r}, total`),
        ...soDefinidos({ acidental: l.opcional(c.acidental, `${r}, acidental`) }),
      };
    }),
    ...f.concentradas.map((c, i): CargaViga => {
      const r = `Carga concentrada ${i + 1}`;
      return {
        tipo: "concentrada",
        trecho: trecho(c.trecho, r),
        posicao: l.numero(c.posicao, `${r}, posição`, "naoNegativo"),
        total: l.numero(c.total, `${r}, total`),
        ...soDefinidos({ acidental: l.opcional(c.acidental, `${r}, acidental`) }),
      };
    }),
    ...f.reacoes.map((c, i): CargaViga => {
      const r = `Reação de viga apoiada ${i + 1}`;
      if (c.viga.trim() === "") l.erro(`${r}: escolha a viga apoiada.`);
      return {
        tipo: "reacao",
        trecho: trecho(c.trecho, r),
        posicao: l.numero(c.posicao, `${r}, posição`, "naoNegativo"),
        viga: c.viga.trim(),
        apoio: l.numero(c.apoio, `${r}, apoio`, "naoNegativo", true),
      };
    }),
  ];

  l.secao = ABAS_VIGA.secoes;
  const trechos = f.comSecoesTrechos
    ? f.secoesTrechos.map((s, i) => {
        const r = `Seção do trecho ${i}`;
        return {
          bw: l.numero(s.bw, `${r}, bw`, "naoNegativo"),
          h: l.numero(s.h, `${r}, h`, "naoNegativo"),
          bf: l.numero(s.bf, `${r}, bf`, "naoNegativo"),
          hf: l.numero(s.hf, `${r}, hf`, "naoNegativo"),
        };
      })
    : undefined;
  const apoiosSecao = f.comSecoesApoios
    ? f.secoesApoios.map((s, i) => ({
        bw: l.numero(s.bw, `Seção do apoio ${i}, bw`, "positivo"),
        h: l.numero(s.h, `Seção do apoio ${i}, h`, "positivo"),
      }))
    : undefined;
  const secoes = trechos || apoiosSecao ? soDefinidos({ trechos, apoios: apoiosSecao }) : undefined;

  const formaTrechos = f.comFormaTrechos
    ? f.formaTrechos.map((t, i): FormaTrechoViga =>
        soDefinidos({
          vaoLivre: l.opcional(t.vaoLivre, `Fôrma do trecho ${i}, vão livre`),
          pe: l.opcional(t.pe, `Fôrma do trecho ${i}, pe`),
          hle: l.opcional(t.hle, `Fôrma do trecho ${i}, Hle`),
          pd: l.opcional(t.pd, `Fôrma do trecho ${i}, pd`),
          hld: l.opcional(t.hld, `Fôrma do trecho ${i}, Hld`),
          eixo: l.opcional(t.eixo, `Fôrma do trecho ${i}, eixo`),
          alinhamento: l.opcional(t.alinhamento, `Fôrma do trecho ${i}, alinhamento`),
        }),
      )
    : undefined;
  const formaApoios = f.comFormaApoios
    ? f.formaApoios.map((a, i): FormaApoioViga => {
        const tipo = TIPOS_APOIO_FORMA.find((t) => t === a.tipo);
        return soDefinidos({
          largura: l.opcional(a.largura, `Fôrma do apoio ${i}, largura`),
          tipo,
          titulo: a.titulo.trim() === "" ? undefined : a.titulo,
          codigo: l.opcional(a.codigo, `Fôrma do apoio ${i}, código`),
          lps: l.opcional(a.lps, `Fôrma do apoio ${i}, LPs`),
          dis: l.opcional(a.dis, `Fôrma do apoio ${i}, Dis`),
        });
      })
    : undefined;
  const lajesNoCorte = f.lajesNoCorte === "planta" ? undefined : f.lajesNoCorte;
  const forma =
    formaTrechos || formaApoios || lajesNoCorte
      ? soDefinidos({ trechos: formaTrechos, apoios: formaApoios, lajesNoCorte })
      : undefined;

  l.secao = ABAS_VIGA.vaos;
  const vaos = f.comVaos
    ? f.vaos.map((x, i) => l.numero(x.vao, `Vão do trecho ${i}`, "positivo"))
    : undefined;
  vaos?.forEach((vao, i) => {
    const planta = geo?.trechos[i]?.vao;
    if (planta !== undefined && Math.abs(vao - planta) > 0.005)
      l.erro(
        `Vão do trecho ${i}: ${formatarNumero(vao, 3)} m não bate com a planta (${formatarNumero(planta, 3)} m); o motor só aceita até 5 mm de diferença.`,
      );
  });
  const inercias = f.comInercias
    ? f.inercias.map((x, i) => l.numero(x.j, `Inércia J do trecho ${i}`, "positivo"))
    : undefined;
  const engaste =
    f.engaste === "montagem"
      ? undefined
      : {
          esquerdo: f.engaste === "esquerdo" || f.engaste === "ambos",
          direito: f.engaste === "direito" || f.engaste === "ambos",
        };
  const momentosExternos = f.comMomentos
    ? {
        esquerdo: l.numero(f.momentoEsquerdo, "Momento externo no apoio esquerdo"),
        direito: l.numero(f.momentoDireito, "Momento externo no apoio direito"),
      }
    : undefined;
  const apoiosDesconsiderados = f.apoios.flatMap((a, k) => (a.desconsiderado === "sim" ? [k] : []));
  const pilares = f.apoios.map((a, k) =>
    a.pilar.trim() === ""
      ? null
      : l.numero(a.pilar, `Apoio ${k}, nº do pilar no .REP`, "positivo", true),
  );

  l.secao = ABAS_VIGA.rodada;
  const repeticoes = l.opcional(f.repeticoes, "Repetições da viga", "naoNegativo", true);
  l.secao = ABAS_VIGA.armadura;
  const armaduras = f.armaduras.map((a, i): ArmaduraDigitada => {
    const r = `Armadura alterada ${i + 1}`;
    const tracionada = soDefinidos({
      bitola: l.opcional(a.bitola, `${r}, bitola tracionada`, "positivo"),
      bitolaMistura: l.opcional(a.bitolaMistura, `${r}, bitola da mistura`, "positivo"),
      barras: l.opcional(a.barras, `${r}, número de barras`, "positivo"),
      barrasMistura: l.opcional(a.barrasMistura, `${r}, barras da mistura`, "positivo"),
    });
    const comFissuracao = a.fisBitola.trim() !== "" || a.fisQuantidade.trim() !== "";
    return {
      em: a.em === "tramo" ? "tramo" : "apoio",
      numero: l.numero(a.numero, `${r}, número do ${a.em}`, "naoNegativo", true),
      ...(Object.keys(tracionada).length > 0 ? { tracionada } : {}),
      ...(a.comprimida.trim() === "" ? {} : { comprimida: a.comprimida.trim() }),
      ...(comFissuracao
        ? {
            fissuracao: {
              ...soDefinidos({
                bitola: l.opcional(a.fisBitola, `${r}, bitola da fissuração`, "positivo"),
              }),
              quantidade: l.numero(
                a.fisQuantidade,
                `${r}, quantidade da fissuração`,
                "positivo",
                true,
              ),
            },
          }
        : {}),
    };
  });

  const nova: Viga = {
    ...semChaves(v, CAMPOS),
    ...soDefinidos({
      pesoProprio,
      apoiaEm: listaOuNada(f.apoiaEm),
      cargas: listaOuNada(cargas),
      somenteCargasProprias: boolDe(f.somenteCargasProprias),
      vaos,
      inercias,
      engaste,
      momentosExternos,
      apoiosDesconsiderados: listaOuNada(apoiosDesconsiderados),
      pilaresNoRep: pilares.some((p) => p !== null) ? pilares : undefined,
      repeticoes,
      armaduraDigitada: listaOuNada(armaduras),
      continuaSeExcederLimite: boolDe(f.continuaSeExcederLimite),
      secoes,
      forma,
    }),
  };
  return l.erros.length > 0 ? l.erros : nova;
}

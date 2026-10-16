// Formulário dos dados do pavimento que o SISTRUT lê do LAJEGEOM e do LAJECALC
// (docs/MODO-CALCULO.md, "Como montar uma obra que reproduz um caso do original"): cargas
// de ocupação por área, alvenarias em qualquer posição, trechos de pilar-parede e as
// continuidades confirmadas no LAJECALC 1. Pavimento → textos do formulário e de volta,
// com as regras do leitor do arquivo (src/armazenamento/arquivo.ts, `pavimento`).
import type {
  Alvenaria,
  CargaOcupacao,
  ContinuidadeLajes,
  Laje,
  Pavimento,
  Ponto,
  TrechoPilar,
} from "../../../dominio/obra";
import { formatarNumero, lerNumero } from "../../formato";
import {
  conferirPoligono,
  Leitor,
  type LinhaForm,
  lerPontos,
  linhaDoPonto,
  listaOuNada,
  semChaves,
  soDefinidos,
  textoDe,
} from "./formulario";

export type Vertice = LinhaForm<"x" | "y">;

/** Uma carga de ocupação: a tabela de vértices e as cargas. */
export interface FormCarga {
  vertices: Vertice[];
  total: string;
  acidental: string;
}
export type LinhaAlvenaria = LinhaForm<"x1" | "y1" | "x2" | "y2" | "carga">;
export type LinhaTrecho = LinhaForm<"pilar" | "x1" | "y1" | "x2" | "y2">;
/** lajeB "" = trecho engastado sem vizinha (e ladoB não conta). */
export type LinhaContinuidade = LinhaForm<"lajeA" | "ladoA" | "lajeB" | "ladoB">;

export interface FormPavimento {
  cargas: FormCarga[];
  alvenarias: LinhaAlvenaria[];
  trechos: LinhaTrecho[];
  continuidades: LinhaContinuidade[];
}

/** Campos do pavimento que o editor controla (os outros passam intactos). */
const CAMPOS = [
  "cargasOcupacao",
  "alvenarias",
  "trechosPilares",
  "continuidadesLajes",
] as const satisfies readonly (keyof Pavimento)[];

export const novaCarga = (): FormCarga => ({ vertices: [], total: "", acidental: "0" });
export const novoVertice = (): Vertice => ({ x: "", y: "" });
export const novaAlvenaria = (): LinhaAlvenaria => ({ x1: "", y1: "", x2: "", y2: "", carga: "" });
export const novoTrecho = (): LinhaTrecho => ({ pilar: "", x1: "", y1: "", x2: "", y2: "" });
export const novaContinuidade = (lajeA = ""): LinhaContinuidade => ({
  lajeA,
  ladoA: "0",
  lajeB: "",
  ladoB: "0",
});

/** Pavimento → formulário. */
export function formDoPavimento(p: Pavimento): FormPavimento {
  return {
    cargas: (p.cargasOcupacao ?? []).map((c) => ({
      vertices: c.poligono.map(linhaDoPonto),
      total: textoDe(c.total),
      acidental: textoDe(c.acidental),
    })),
    alvenarias: (p.alvenarias ?? []).map((a) => ({
      x1: textoDe(a.inicio.x),
      y1: textoDe(a.inicio.y),
      x2: textoDe(a.fim.x),
      y2: textoDe(a.fim.y),
      carga: textoDe(a.carga),
    })),
    trechos: (p.trechosPilares ?? []).map((t) => ({
      pilar: t.pilar,
      x1: textoDe(t.inicio.x),
      y1: textoDe(t.inicio.y),
      x2: textoDe(t.fim.x),
      y2: textoDe(t.fim.y),
    })),
    continuidades: (p.continuidadesLajes ?? []).map((c) => ({
      lajeA: c.lajeA,
      ladoA: textoDe(c.ladoA),
      lajeB: c.lajeB ?? "",
      ladoB: textoDe(c.ladoB ?? 0),
    })),
  };
}

/** Vértices de uma laje para preencher uma carga de ocupação: o polígono, se ela tem; senão
 *  o retângulo, a partir do canto inferior esquerdo em sentido horário (como o LAJEGEOM). */
export function verticesDaLaje(laje: Laje): Vertice[] {
  const { x, y, lx, ly } = laje;
  const pontos = laje.poligono ?? [
    { x, y },
    { x, y: y + ly },
    { x: x + lx, y: y + ly },
    { x: x + lx, y },
  ];
  return pontos.map(linhaDoPonto);
}

/** true se a acidental digitada passa do total (o total inclui a acidental). Só aviso: o
 *  arquivo aceita. */
export function acidentalAcimaDoTotal(c: FormCarga) {
  const total = lerNumero(c.total);
  const acidental = lerNumero(c.acidental);
  return total !== null && acidental !== null && acidental > total;
}

/** Lajes do pavimento com polígono: só elas entram nas continuidades. */
export const lajesComPoligono = (p: Pavimento) =>
  p.lajes.filter((l): l is Laje & { poligono: Ponto[] } => (l.poligono?.length ?? 0) > 0);

/** Rótulos dos lados do polígono da laje ("lado 0: (0,00; 0,00) → (0,00; 5,00)"). */
export function ladosDaLaje(laje: Laje): string[] {
  const p = laje.poligono ?? [];
  const pt = (v: Ponto) => `(${formatarNumero(v.x)}; ${formatarNumero(v.y)})`;
  return p.map((v, k) => `lado ${k}: ${pt(v)} → ${pt(p[(k + 1) % p.length] ?? v)}`);
}

/**
 * Formulário → pavimento, ou a lista de problemas. As faixas são as do leitor do arquivo;
 * além delas, o trecho de pilar-parede precisa apontar para um pilar do pavimento. Os
 * outros campos do pavimento passam intactos; lista vazia = campo ausente.
 */
export function pavimentoDoForm(f: FormPavimento, p: Pavimento): Pavimento | string[] {
  const l = new Leitor();
  const ponto = (x: string, y: string, rotulo: string): Ponto => ({
    x: l.numero(x, `${rotulo}, x`),
    y: l.numero(y, `${rotulo}, y`),
  });

  const cargas = f.cargas.map((c, i): CargaOcupacao => {
    const r = `Carga de ocupação ${i + 1}`;
    const poligono = lerPontos(l, c.vertices, r);
    conferirPoligono(l, poligono, r, false);
    return {
      poligono,
      total: l.numero(c.total, `${r}, total`, "naoNegativo"),
      acidental: l.numero(c.acidental, `${r}, acidental`, "naoNegativo"),
    };
  });

  const alvenarias = f.alvenarias.map((a, i): Alvenaria => {
    const r = `Alvenaria ${i + 1}`;
    return {
      inicio: ponto(a.x1, a.y1, `${r}, início`),
      fim: ponto(a.x2, a.y2, `${r}, fim`),
      carga: l.numero(a.carga, `${r}, carga`, "naoNegativo"),
    };
  });

  const pilares = new Set(p.pilares.map((x) => x.id));
  const trechos = f.trechos.map((t, i): TrechoPilar => {
    const r = `Pilar-parede ${i + 1}`;
    const pilar = t.pilar.trim();
    if (pilar === "") l.erro(`${r}: escolha o pilar.`);
    else if (!pilares.has(pilar)) l.erro(`${r}: o pilar ${pilar} não existe no pavimento.`);
    return {
      pilar,
      inicio: ponto(t.x1, t.y1, `${r}, início`),
      fim: ponto(t.x2, t.y2, `${r}, fim`),
    };
  });

  const lajes = new Map(p.lajes.map((x) => [x.id, x]));
  const lado = (lajeId: string, texto: string, rotulo: string) => {
    if (lajeId === "") {
      l.erro(`${rotulo}: escolha a laje.`);
      return 0;
    }
    const k = l.numero(texto, `${rotulo}, lado`, "naoNegativo", true);
    const laje = lajes.get(lajeId);
    const n = laje?.poligono?.length ?? 0;
    if (!laje) l.erro(`${rotulo}: a laje ${lajeId} não existe no pavimento.`);
    else if (n === 0)
      l.erro(`${rotulo}: a laje ${laje.nome} não tem polígono (edite-o no editor da laje).`);
    else if (Number.isInteger(k) && k >= n)
      l.erro(`${rotulo}: a laje ${laje.nome} tem ${n} lados (0 a ${n - 1}).`);
    return k;
  };
  const continuidades = f.continuidades.map((c, i): ContinuidadeLajes => {
    const r = `Continuidade ${i + 1}`;
    const ladoA = lado(c.lajeA, c.ladoA, `${r}, laje A`);
    if (c.lajeB === "") return { lajeA: c.lajeA, ladoA };
    return { lajeA: c.lajeA, ladoA, lajeB: c.lajeB, ladoB: lado(c.lajeB, c.ladoB, `${r}, laje B`) };
  });

  const novo: Pavimento = {
    ...semChaves(p, CAMPOS),
    ...soDefinidos({
      cargasOcupacao: listaOuNada(cargas),
      alvenarias: listaOuNada(alvenarias),
      trechosPilares: listaOuNada(trechos),
      continuidadesLajes: listaOuNada(continuidades),
    }),
  };
  return l.erros.length > 0 ? l.erros : novo;
}

// Formulário dos dados de laje do LAJEGEOM, do LAJECALC e do LAJEPROC do SISTRUT
// (docs/MODO-CALCULO.md, linhas laje.* de "Como montar uma obra que reproduz um caso do
// original"): Laje → textos do formulário e de volta, com as regras do leitor do arquivo
// (src/armazenamento/arquivo.ts, laje e lajeSistrut). Cada linha da tabela do polígono
// é um vértice e o lado que sai dele: o lado k vai do vértice k ao k+1, e o último fecha
// no primeiro, como o LAJEGEOM numera.
import type {
  BarraImposta,
  Laje,
  Pavimento,
  Ponto,
  TipoLaje,
  Vinculo,
} from "../../../dominio/obra";
import { alterarLaje, type Edicao } from "../../../planta/edicao";
import {
  boolDe,
  conferirPoligono,
  Leitor,
  type LinhaForm,
  lerPontos,
  semChaves,
  soDefinidos,
  textoDe,
  triDe,
  type TriEstado,
} from "./formulario";

/** Colunas de uma linha do polígono: o vértice e os campos do lado que sai dele. */
export type CampoLado = "x" | "y" | "vinculo" | "negBitola" | "negEspacamento" | "coeficiente";
type Lado = LinhaForm<CampoLado>;
type Barra = LinhaForm<"bitola" | "espacamento">;

/** Vínculos que um lado pode forçar; no formulário, "" = pela vizinhança. */
const VINCULOS: readonly Vinculo[] = ["engastado", "apoiado", "livre"];

export interface FormLaje {
  tipo: TipoLaje;
  anguloArmadura: string;
  grupo: string;
  muInformado: TriEstado;
  /** [principal, secundária]. */
  armaduraImposta: [Barra, Barra];
  comPoligono: boolean;
  lados: Lado[];
}

/** Campos da laje que o editor controla (os outros passam intactos). */
const CAMPOS = [
  "tipo",
  "anguloArmadura",
  "grupo",
  "muInformado",
  "armaduraImposta",
  "poligono",
  "vinculosLados",
  "negativasImpostas",
  "coeficientesLados",
] as const satisfies readonly (keyof Laje)[];

/** Linha de vértice sem os campos do lado (vínculo pela vizinhança, sem negativa, i máximo). */
export const linhaLado = (p?: Ponto): Lado => ({
  x: textoDe(p?.x),
  y: textoDe(p?.y),
  vinculo: "",
  negBitola: "",
  negEspacamento: "",
  coeficiente: "",
});

/** O retângulo da laje como polígono horário a partir do canto inferior esquerdo:
 *  (x, y), (x, y + ly), (x + lx, y + ly), (x + lx, y). */
export function poligonoDoRetangulo(l: Pick<Laje, "x" | "y" | "lx" | "ly">): Ponto[] {
  return [
    { x: l.x, y: l.y },
    { x: l.x, y: l.y + l.ly },
    { x: l.x + l.lx, y: l.y + l.ly },
    { x: l.x + l.lx, y: l.y },
  ];
}

/** Linhas da tabela do polígono criado a partir do retângulo da laje. */
export const linhaDoRetangulo = (l: Pick<Laje, "x" | "y" | "lx" | "ly">) =>
  poligonoDoRetangulo(l).map((p) => linhaLado(p));

/** Retângulo envolvente do polígono: o x, y, lx e ly que o arquivo grava na laje. */
export function envolvente(p: readonly Ponto[]) {
  const xs = p.map((v) => v.x);
  const ys = p.map((v) => v.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, lx: Math.max(...xs) - x, ly: Math.max(...ys) - y };
}

const barraForm = (b: BarraImposta | null | undefined): Barra => ({
  bitola: textoDe(b?.bitola),
  espacamento: textoDe(b?.espacamento),
});

/** Laje → formulário. Sem polígono, a tabela fica vazia até o usuário criar um. */
export function formDaLaje(l: Laje): FormLaje {
  return {
    tipo: l.tipo ?? "macica",
    anguloArmadura: textoDe(l.anguloArmadura),
    grupo: textoDe(l.grupo),
    muInformado: triDe(l.muInformado),
    armaduraImposta: [
      barraForm(l.armaduraImposta?.principal),
      barraForm(l.armaduraImposta?.secundaria),
    ],
    comPoligono: l.poligono !== undefined,
    lados: (l.poligono ?? []).map((p, k) => {
      const neg = barraForm(l.negativasImpostas?.[k]);
      return {
        ...linhaLado(p),
        vinculo: l.vinculosLados?.[k] ?? "",
        negBitola: neg.bitola,
        negEspacamento: neg.espacamento,
        coeficiente: textoDe(l.coeficientesLados?.[k]),
      };
    }),
  };
}

/** Rótulo do ângulo: na pré-moldada, é a inclinação das nervuras. */
export const rotuloAngulo = (tipo: TipoLaje) =>
  tipo === "pre-moldada" ? "Inclinação das nervuras" : "Ângulo da armadura principal";

/** Rótulo do lado k (0..n−1) nas mensagens: "Lado 2 (vértice 2 → 3)". */
const rotuloLado = (k: number, n: number) =>
  `Lado ${k + 1} (vértice ${k + 1} → ${((k + 1) % n) + 1})`;

/** Barra de laje opcional: os dois campos vazios = nenhuma; um só = problema. */
function lerBarra(l: Leitor, b: Barra, rotulo: string): BarraImposta | undefined {
  const vazioB = b.bitola.trim() === "";
  const vazioE = b.espacamento.trim() === "";
  if (vazioB && vazioE) return undefined;
  if (vazioB || vazioE) {
    l.erro(`${rotulo}: informe a bitola e o espaçamento, ou deixe os dois vazios.`);
    return undefined;
  }
  return {
    bitola: l.numero(b.bitola, `${rotulo}, bitola`, "positivo"),
    espacamento: l.numero(b.espacamento, `${rotulo}, espaçamento`, "positivo"),
  };
}

/** Lista por lado que só vai ao arquivo se algum lado tem valor. */
const porLado = <T>(l: (T | null)[]) => (l.some((v) => v !== null) ? l : undefined);

/**
 * Formulário → laje, ou a lista de problemas. As faixas são as do leitor do arquivo. Com
 * polígono, x, y, lx e ly passam a ser o envolvente dele; sem, a laje volta ao retângulo
 * que já tinha e os campos por lado somem.
 */
export function lajeDoForm(f: FormLaje, laje: Laje): Laje | string[] {
  const l = new Leitor();
  const rAngulo = rotuloAngulo(f.tipo);
  const anguloArmadura = l.opcional(f.anguloArmadura, rAngulo, "naoNegativo");
  if (anguloArmadura !== undefined && anguloArmadura >= 180)
    l.erro(`${rAngulo}: informe um ângulo menor que 180°.`);
  const grupo = l.opcional(f.grupo, "Grupo", "naoNegativo", true);
  const principal = lerBarra(l, f.armaduraImposta[0], "Positiva imposta principal");
  const secundaria = lerBarra(l, f.armaduraImposta[1], "Positiva imposta secundária");
  const armaduraImposta =
    principal || secundaria ? soDefinidos({ principal, secundaria }) : undefined;

  let poligono: Ponto[] | undefined;
  let vinculosLados: (Vinculo | null)[] | undefined;
  let negativasImpostas: (BarraImposta | null)[] | undefined;
  let coeficientesLados: (number | null)[] | undefined;
  if (f.comPoligono) {
    poligono = lerPontos(l, f.lados, "Polígono");
    conferirPoligono(l, poligono, "Polígono", true);
    const n = f.lados.length;
    vinculosLados = porLado(f.lados.map((s) => VINCULOS.find((v) => v === s.vinculo) ?? null));
    negativasImpostas = porLado(
      f.lados.map(
        (s, k) =>
          lerBarra(
            l,
            { bitola: s.negBitola, espacamento: s.negEspacamento },
            `${rotuloLado(k, n)}, negativa imposta`,
          ) ?? null,
      ),
    );
    coeficientesLados = porLado(
      f.lados.map(
        (s, k) =>
          l.opcional(s.coeficiente, `${rotuloLado(k, n)}, i (Mneg/Mpos)`, "positivo") ?? null,
      ),
    );
  }
  if (l.erros.length > 0) return l.erros;

  return {
    ...semChaves(laje, CAMPOS),
    ...(poligono ? envolvente(poligono) : {}),
    ...soDefinidos({
      tipo: f.tipo === "macica" ? undefined : f.tipo,
      anguloArmadura,
      grupo,
      muInformado: boolDe(f.muInformado),
      armaduraImposta,
      poligono,
      vinculosLados,
      negativasImpostas,
      coeficientesLados,
    }),
  };
}

/**
 * O pavimento com a laje editada, pelas regras do editor de planta (`alterarLaje`: nome,
 * vãos, sobreposição; regenera vigas e pilares se o envolvente mudou). `alterarLaje` junta
 * a laje antiga com a mudança, então a antiga entra sem os campos do editor: o que o
 * formulário tirou some de verdade.
 */
export function pavimentoComLaje(pav: Pavimento, nova: Laje): Edicao {
  const base = {
    ...pav,
    lajes: pav.lajes.map((l) => (l.id === nova.id ? semChaves(l, CAMPOS) : l)),
  };
  return alterarLaje(base, nova.id, nova);
}

const ROTULO_TIPO: Record<TipoLaje, string> = {
  macica: "maciça",
  "pre-moldada": "pré-moldada",
  "comum-nao-calculada": "comum não calculada",
};

/** Resumo dos dados do SISTRUT da laje, para o painel ("pré-moldada · 30° · polígono de
 *  6 lados"). */
export function resumoLaje(l: Laje): string {
  const partes: string[] = [];
  if (l.tipo && l.tipo !== "macica") partes.push(ROTULO_TIPO[l.tipo]);
  if (l.anguloArmadura !== undefined) partes.push(`${textoDe(l.anguloArmadura)}°`);
  if (l.grupo !== undefined) partes.push(`grupo ${l.grupo}`);
  if (l.muInformado) partes.push("μ informado");
  if (l.armaduraImposta?.principal || l.armaduraImposta?.secundaria)
    partes.push("positiva imposta");
  if (l.poligono) partes.push(`polígono de ${l.poligono.length} lados`);
  if (l.vinculosLados?.some((v) => v !== null)) partes.push("vínculo por lado");
  if (l.negativasImpostas?.some((v) => v !== null)) partes.push("negativa imposta");
  if (l.coeficientesLados?.some((v) => v !== null)) partes.push("i por lado");
  return partes.length > 0 ? partes.join(" · ") : "sem dados do SISTRUT (valem os da planta)";
}

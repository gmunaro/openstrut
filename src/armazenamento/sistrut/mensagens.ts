// Mensagens de erro da importação de obra do SISTRUT. A validação do arquivo da V2
// (`lerObra`) diz o caminho do campo, como "pavimentos[0].cargasOcupacao[3].poligono:
// esperados pelo menos 3 pontos, veio []."; quem importa não conhece esse caminho. Aqui
// ele vira o arquivo do SISTRUT, o item com o nome que o original mostra e o que fazer.
import type { Obra } from "../../dominio/obra";

/** Arquivos de onde veio cada pavimento (os que existirem). */
export interface OrigemPavimento {
  laj?: string;
  vig?: string;
  col?: string;
}

type Segmento = { campo: string; indice?: number };

/** "a.b[2].c" → [{a}, {b, 2}, {c}]. */
function segmentos(caminho: string): Segmento[] {
  return caminho.split(".").map((s) => {
    const m = /^(.*?)\[(\d+)\]$/.exec(s);
    return m ? { campo: m[1]!, indice: Number(m[2]) } : { campo: s };
  });
}

const CAMPOS: Record<string, string> = {
  poligono: "polígono",
  vertices: "vértices",
  h: "espessura",
  lx: "vão x",
  ly: "vão y",
  bw: "largura",
  b: "largura",
  x1: "início",
  y1: "início",
  x2: "fim",
  y2: "fim",
  total: "carga total",
  acidental: "parcela acidental",
  carga: "carga",
  inicio: "início",
  fim: "fim",
  revestimento: "carga permanente",
  peDireito: "pé-direito",
  cargas: "cargas",
  vaos: "vãos",
  inercias: "inércias",
  secoes: "seções",
  forma: "fôrma",
  cargaTopo: "carga no topo",
  cargaBase: "carga na base",
  vinculos: "vínculos",
  armadura: "armadura",
  barras: "barras",
  id: "identificação",
  materiais: "materiais",
  parametrosViga: "parâmetros de viga",
  parametrosPilar: "parâmetros de pilar",
  parametrosLaje: "parâmetros de laje",
};

/** Nome do campo para gente: o do dicionário ou o identificador separado em palavras. */
const nomeDoCampo = (c: string) => CAMPOS[c] ?? c.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** O valor que veio, dito em palavras ("nada", "uma lista vazia", "3 itens"). */
function valorLido(json: string): string {
  if (json === "nada") return "nada";
  try {
    const v: unknown = JSON.parse(json);
    if (Array.isArray(v)) return v.length === 0 ? "uma lista vazia" : `${v.length} itens`;
    if (typeof v === "number") return v.toLocaleString("pt-BR");
    if (typeof v === "string") return `"${v}"`;
    if (typeof v === "boolean") return v ? "sim" : "não";
    return "um valor de outro tipo";
  } catch {
    return json;
  }
}

/** Campos de viga que vêm do .VIG, .SEC ou .FOR (os outros são da planta, do .LAJ). */
const DA_VIGA = new Set([
  "cargas",
  "vaos",
  "inercias",
  "engaste",
  "momentosExternos",
  "secoes",
  "forma",
  "repeticoes",
  "pilaresNoRep",
  "apoiosDesconsiderados",
]);
/** Campos de pilar da planta (do .LAJ); os outros vêm do .COL. */
const DA_PLANTA = new Set(["x", "y", "id", "nome"]);

/** Item do pavimento com o nome do original e o arquivo de onde ele veio. */
function itemDoPavimento(
  obra: Obra,
  ip: number,
  seg: readonly Segmento[],
  origem: OrigemPavimento,
): { arquivo: string | undefined; item: string; programa: string; resto: readonly Segmento[] } {
  const pav = obra.pavimentos[ip];
  const [lista, campo] = seg;
  const j = lista?.indice ?? -1;
  const nomeDe = (xs: readonly { nome: string }[] | undefined) => xs?.[j]?.nome ?? `${j + 1}`;
  const doLaj = { arquivo: origem.laj, programa: "LAJEGEOM" };
  switch (lista?.campo) {
    case "lajes":
      return { ...doLaj, item: `laje ${nomeDe(pav?.lajes)}`, resto: seg.slice(1) };
    case "cargasOcupacao":
      return { ...doLaj, item: `carga de ocupação A${j + 1}`, resto: seg.slice(1) };
    case "alvenarias":
      return { ...doLaj, item: `alvenaria ${j + 1}`, resto: seg.slice(1) };
    case "trechosPilares":
      return {
        ...doLaj,
        item: `pilar-parede ${pav?.trechosPilares?.[j]?.pilar ?? j + 1}`,
        resto: seg.slice(1),
      };
    case "continuidadesLajes":
      return {
        arquivo: origem.laj,
        programa: "LAJECALC",
        item: `continuidade ${j + 1}`,
        resto: seg.slice(1),
      };
    case "vigas": {
      const daViga = campo && DA_VIGA.has(campo.campo);
      return {
        arquivo: daViga ? (origem.vig ?? origem.laj) : origem.laj,
        programa: daViga ? "VIGA" : "LAJEGEOM",
        item: `viga ${nomeDe(pav?.vigas)}`,
        resto: seg.slice(1),
      };
    }
    case "pilares": {
      const daPlanta = !campo || DA_PLANTA.has(campo.campo);
      return {
        arquivo: daPlanta ? origem.laj : (origem.col ?? origem.laj),
        programa: daPlanta ? "LAJEGEOM" : "PILGEEDI",
        item: `pilar ${nomeDe(pav?.pilares)}`,
        resto: seg.slice(1),
      };
    }
    default:
      return { ...doLaj, item: `pavimento ${pav?.nome ?? ip + 1}`, resto: seg };
  }
}

/** Reescreve os erros de `lerObra` sobre a `obra` importada: "<arquivo>, <item>
 *  (<campo>): <o que houve>. <o que fazer>". `origem(i)` diz os arquivos do pavimento i.
 *  Erro em outro formato passa como veio. */
export function explicarErros(
  erros: readonly string[],
  obra: Obra,
  origem: (indicePavimento: number) => OrigemPavimento = () => ({}),
): string[] {
  return erros.map((erro) => {
    const m = /^([A-Za-z][\w.[\]]*): (.*?)(?:, veio (.*))?\.$/.exec(erro);
    if (!m) return erro;
    const [, caminho, oque, veio] = m;
    const seg = segmentos(caminho!);
    const lido = veio === undefined ? "" : `; o arquivo deu ${valorLido(veio)}`;
    let arquivo: string | undefined;
    let item: string;
    let programa: string;
    let resto: readonly Segmento[];
    if (seg[0]?.campo === "pavimentos" && seg[0].indice !== undefined) {
      const ip = seg[0].indice;
      ({ arquivo, item, programa, resto } = itemDoPavimento(obra, ip, seg.slice(1), origem(ip)));
      arquivo ??= `pavimento ${obra.pavimentos[ip]?.nome ?? ip + 1}`;
    } else {
      const grupo = seg[0]?.campo;
      arquivo =
        grupo === "parametrosPilar"
          ? ".COL/.PIP"
          : grupo === "parametrosViga"
            ? ".DSP/VIGA.INI"
            : "dados da obra";
      programa =
        grupo === "parametrosPilar"
          ? "PILGEEDI"
          : grupo === "parametrosViga"
            ? "DESENHO"
            : "SISTRUT";
      item = nomeDoCampo(grupo ?? "obra");
      resto = seg.slice(1);
    }
    const campo = resto
      .map((s) => nomeDoCampo(s.campo) + (s.indice !== undefined ? ` ${s.indice + 1}` : ""))
      .join(", ");
    const fazer = /\.[A-Z]{3}$/.test(arquivo)
      ? `Abra o ${arquivo} no ${programa} do SISTRUT, corrija e grave de novo, ou importe sem ele.`
      : "Confira esse dado no SISTRUT e importe de novo.";
    return `${arquivo}, ${item}${campo ? ` (${campo})` : ""}: ${oque}${lido}. ${fazer}`;
  });
}

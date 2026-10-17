// Formulário dos parâmetros da obra pela NB-1/78 (docs/MODO-CALCULO.md): as opções da
// rodada (`otimizaNegativos` e as de `parametrosPilar`), o .LAP (`parametrosLaje`), o
// VIGA.INI e o .DSP (`parametrosViga`) e o PILAR.INI e o .PIP (`parametrosPilar`).
// Obra → textos do formulário e de volta, com as faixas do leitor do arquivo
// (src/armazenamento/arquivo.ts: obra, parametrosLaje, parametrosPilar, parametrosViga,
// conferenciaDsp, conformeTabela).
//
// Campo vazio = ausente = o de fábrica (sistrut/base/parametros.ts); cada campo presente
// substitui o de fábrica inteiro (uma tabela vem inteira). Objeto que fica vazio some da
// obra. O editor tira só as chaves que ele mostra e grava de novo as definidas: as que ele
// não mostra (no .DSP, `arranjosPorIntervalo` e `grupoDeCorte`) passam intactas.
import {
  PARAMETROS_DSP,
  PARAMETROS_LAJE,
  PARAMETROS_PILAR,
  PARAMETROS_PIP,
  PARAMETROS_VIGA,
} from "../../../calculo/sistrut/base/parametros";
import {
  FYK_CORRIGIDO_MPA,
  FYK_ORIGINAL_TCM2,
  KN_POR_TF,
} from "../../../calculo/sistrut/base/unidades";
import type {
  ClasseAco,
  IniPilar,
  Obra,
  ParametrosDsp,
  ParametrosLajeObra,
  ParametrosPilarObra,
  ParametrosVigaIni,
  ParametrosVigaObra,
  PipPilar,
} from "../../../dominio/obra";
import { VINCULOS_PILAR } from "../../../dominio/obra";
import { formatarNumero } from "../../formato";
import {
  boolDe,
  Leitor,
  type Limite,
  type LinhaForm,
  semChaves,
  soDefinidos,
  textoDe,
  triDe,
  type TriEstado,
} from "./formulario";

// ---------------------------------------------------------------- descritores

/** Chaves de `T` cujo valor é do tipo `V`. */
type ChavesDe<T, V> = { [K in keyof T]-?: NonNullable<T[K]> extends V ? K : never }[keyof T] &
  string;

/** Campo numérico de uma tabela de parâmetros. `faixa` = inteiro entre os dois valores;
 *  `original` = só vale no modo "Como o SISTRUT original"; `grupo` agrupa na tela. */
export interface DefNumero<K extends string> {
  chave: K;
  rotulo: string;
  unidade?: string;
  limite?: Limite;
  inteiro?: boolean;
  faixa?: readonly [number, number];
  original?: boolean;
  grupo?: string;
}

/** Campo sim/não de uma tabela de parâmetros; `sim` e `nao` são os rótulos das opções. */
export interface DefBool<K extends string> {
  chave: K;
  rotulo: string;
  sim?: string;
  nao?: string;
  original?: boolean;
  grupo?: string;
}

/** Coluna numérica de uma lista de parâmetros. */
export interface DefColuna<C extends string> {
  chave: C;
  rotulo: string;
  unidade?: string;
  limite?: Limite;
  inteiro?: boolean;
  faixa?: readonly [number, number];
  largura?: string;
}

/** Lista de parâmetros. `fixo` = o tamanho da tabela de fábrica (sem acrescentar nem
 *  remover linhas); sem ele, a lista cresce e encolhe, com ao menos `minimo` linhas. */
export interface DefLista<C extends string> {
  titulo: string;
  colunas: readonly DefColuna<C>[];
  fixo: boolean;
  minimo?: number;
  rotuloLinha: (i: number) => string;
}

/** Lista no formulário: `ligada` = a obra dá a tabela inteira; desligada vale a de
 *  fábrica. As linhas começam com as da obra ou, sem elas, com as de fábrica. */
export interface Lista<C extends string> {
  ligada: boolean;
  linhas: LinhaForm<C>[];
}

/** Números e booleanos de uma tabela no formulário. */
export interface Escalares<N extends string, B extends string> {
  numeros: Record<N, string>;
  booleanos: Record<B, TriEstado>;
}

/** Escolha com o padrão ("padrao" = ausente). */
export type ComPadrao<T extends string> = "padrao" | T;

const linha = (base: string) => (i: number) => `${base} ${i}`;
const linha1 = (base: string) => (i: number) => `${base} ${i + 1}`;
/** Colunas c0..c{n−1} de uma matriz. */
type Col5 = "c0" | "c1" | "c2" | "c3" | "c4";
type Col4 = "c0" | "c1" | "c2" | "c3";

// ---------------------------------------------------------------- .LAP

const NUM_LAJE = [
  {
    chave: "gamaF",
    rotulo: "γf das lajes",
    unidade: "coeficiente",
    limite: "positivo",
    grupo: "seg",
  },
  {
    chave: "gamaC",
    rotulo: "γc das lajes",
    unidade: "coeficiente",
    limite: "positivo",
    grupo: "seg",
  },
  {
    chave: "gamaS",
    rotulo: "γs das lajes",
    unidade: "coeficiente",
    limite: "positivo",
    grupo: "seg",
  },
  {
    chave: "acrescimo",
    rotulo: "Acréscimo ao cobrimento (altura útil)",
    unidade: "cm",
    limite: "naoNegativo",
    grupo: "seg",
  },
  {
    chave: "hMin",
    rotulo: "Espessura mínima: procura de",
    unidade: "cm",
    limite: "positivo",
    grupo: "h",
  },
  {
    chave: "hMax",
    rotulo: "Espessura mínima: procura até",
    unidade: "cm",
    limite: "positivo",
    grupo: "h",
  },
  {
    chave: "espacamentoMaximo",
    rotulo: "Espaçamento máximo (entrada manual)",
    unidade: "cm",
    limite: "positivo",
    grupo: "arm",
  },
  {
    chave: "taxaMinimaPositiva",
    rotulo: "Taxa mínima positiva",
    unidade: "cm²/m por cm de H",
    limite: "naoNegativo",
    grupo: "arm",
  },
  {
    chave: "taxaMinimaNegativa",
    rotulo: "Taxa mínima negativa",
    unidade: "cm²/m por cm de H",
    limite: "naoNegativo",
    grupo: "arm",
  },
  {
    chave: "fracaoLinhaNeutra",
    rotulo: "Fração do ξlim",
    unidade: "fração, 1 = 100 %",
    limite: "positivo",
    grupo: "arm",
  },
  {
    chave: "eficienciaNegativa",
    rotulo: "Eficiência da armadura negativa",
    unidade: "fração, 1 = 100 %",
    limite: "positivo",
    grupo: "arm",
  },
  {
    chave: "relacaoNegPosMin",
    rotulo: "Mneg/Mpos mínima (piso da otimização)",
    unidade: "Mneg/Mpos",
    limite: "positivo",
    grupo: "neg",
  },
  {
    chave: "relacaoNegPosMax",
    rotulo: "Mneg/Mpos máxima (i da continuidade)",
    unidade: "Mneg/Mpos",
    limite: "positivo",
    grupo: "neg",
  },
  {
    chave: "relacaoCantosReentrantes",
    rotulo: "Mneg/Mpos nos cantos reentrantes",
    unidade: "Mneg/Mpos",
    limite: "naoNegativo",
    grupo: "neg",
  },
  {
    chave: "toleranciaComprimento",
    rotulo: "Tolerância de comprimento",
    unidade: "m",
    limite: "positivo",
    grupo: "tol",
  },
  {
    chave: "toleranciaAngulo",
    rotulo: "Tolerância de ângulo",
    unidade: "inclinação",
    limite: "positivo",
    grupo: "tol",
  },
] as const satisfies readonly DefNumero<ChavesDe<ParametrosLajeObra, number>>[];
const BOOL_LAJE = [
  {
    chave: "limitaEspacamento2H",
    rotulo: "Limita o espaçamento a 2H",
    sim: "S: s ≤ 2H",
    nao: "N",
    grupo: "arm",
  },
] as const satisfies readonly DefBool<ChavesDe<ParametrosLajeObra, boolean>>[];
type NumLaje = (typeof NUM_LAJE)[number]["chave"];
type BoolLaje = (typeof BOOL_LAJE)[number]["chave"];

const LISTAS_LAJE = {
  bitolas: {
    titulo: "Bitolas",
    fixo: true,
    rotuloLinha: linha("Bitola"),
    colunas: [
      { chave: "bitola", rotulo: "φ", unidade: "mm", limite: "positivo" },
      { chave: "area", rotulo: "Área (0 desativa)", unidade: "cm²", limite: "naoNegativo" },
    ],
  },
  relacaoMu: {
    titulo: "Relação de vãos → μ",
    fixo: true,
    rotuloLinha: linha1("Linha"),
    colunas: [
      { chave: "relacao", rotulo: "Relação", unidade: "ly/lx", limite: "positivo" },
      { chave: "mu", rotulo: "μ", unidade: "Mneg/Mpos", limite: "positivo" },
    ],
  },
  espacamentoMinimoPorH: {
    titulo: "Espaçamento mínimo por H",
    fixo: true,
    rotuloLinha: linha1("Linha"),
    colunas: [
      { chave: "hAte", rotulo: "H até", unidade: "cm", limite: "positivo" },
      { chave: "espacamento", rotulo: "s mínimo", unidade: "cm", limite: "positivo" },
    ],
  },
  espacamentos: {
    titulo: "Espaçamentos",
    fixo: false,
    minimo: 1,
    rotuloLinha: linha1("Espaçamento"),
    colunas: [{ chave: "valor", rotulo: "s", unidade: "cm", limite: "positivo" }],
  },
  bitolaPorH: {
    titulo: "Bitola preferencial por H",
    fixo: true,
    rotuloLinha: linha1("Linha"),
    colunas: [
      { chave: "hAte", rotulo: "H até", unidade: "cm", limite: "positivo" },
      {
        chave: "indiceBitola",
        rotulo: "Bitola nº",
        unidade: "0 a 9",
        limite: "naoNegativo",
        faixa: [0, PARAMETROS_LAJE.bitolas.length - 1],
      },
    ],
  },
} as const satisfies Record<string, DefLista<string>>;

export interface FormFlecha {
  ligada: boolean;
  lfTotal: string;
  lfAcidental: string;
  multiplicadorEc: string;
  deformacaoLenta: "sim" | "nao";
}

export interface FormLaje extends Escalares<NumLaje, BoolLaje> {
  bitolas: Lista<"bitola" | "area">;
  relacaoMu: Lista<"relacao" | "mu">;
  espacamentoMinimoPorH: Lista<"hAte" | "espacamento">;
  espacamentos: Lista<"valor">;
  bitolaPorH: Lista<"hAte" | "indiceBitola">;
  flecha: FormFlecha;
}

// ---------------------------------------------------------------- VIGA.INI

const NUM_VIGA = [
  {
    chave: "reducaoNegativos",
    rotulo: "Redução dos negativos",
    unidade: "fator, 1 = 100 %",
  },
  {
    chave: "porcentagemAcidentalGerada",
    rotulo: "Acidental gerada sobre a carga total",
    unidade: "%",
  },
  { chave: "coeficienteMedida", rotulo: "Coeficiente de medida", unidade: "× m" },
  { chave: "coeficienteForca", rotulo: "Coeficiente de força", unidade: "× t" },
  {
    chave: "multiplicadorMomentosPilar",
    rotulo: "Momentos de extremidade levados ao pilar (opção 7)",
    unidade: "%",
  },
] as const satisfies readonly DefNumero<ChavesDe<ParametrosVigaIni, number>>[];
const BOOL_VIGA = [
  { chave: "acidentais", rotulo: "Acidentais (envoltória)", sim: "S", nao: "N" },
  {
    chave: "acidentalGerada",
    rotulo: "Acidental",
    sim: "G: gerada pelo %",
    nao: "F: fornecida",
  },
  {
    chave: "momentosExternos",
    rotulo: "Momentos externos nos apoios extremos",
    sim: "S",
    nao: "N",
  },
] as const satisfies readonly DefBool<ChavesDe<ParametrosVigaIni, boolean>>[];
type NumViga = (typeof NUM_VIGA)[number]["chave"];
type BoolViga = (typeof BOOL_VIGA)[number]["chave"];

export interface FormVigaIni extends Escalares<NumViga, BoolViga> {
  reacaoNoPilar: ComPadrao<ParametrosVigaIni["reacaoNoPilar"]>;
}

// ---------------------------------------------------------------- .DSP

const NUM_DSP = [
  {
    chave: "coeficienteMedida",
    rotulo: "Coeficiente de medida (DESENHO.INI)",
    unidade: "×",
    grupo: "analise",
  },
  {
    chave: "coeficienteForca",
    rotulo: "Coeficiente de força (DESENHO.INI)",
    unidade: "×",
    grupo: "analise",
  },
  {
    chave: "reducaoNegativos",
    rotulo: "Multiplicador dos negativos",
    unidade: "fator, 1 = 100 %",
    grupo: "analise",
  },
  {
    chave: "multiplicadorUnidade",
    rotulo: "Multiplicador de unidade",
    unidade: "×",
    grupo: "analise",
  },
  { chave: "fck", rotulo: "fck", unidade: "t/cm²", original: true, grupo: "mat" },
  { chave: "fyk", rotulo: "fyk", unidade: "t/cm²", original: true, grupo: "mat" },
  { chave: "gamaF", rotulo: "γf", unidade: "coeficiente", limite: "positivo", grupo: "mat" },
  { chave: "gamaC", rotulo: "γc", unidade: "coeficiente", limite: "positivo", grupo: "mat" },
  { chave: "gamaS", rotulo: "γs", unidade: "coeficiente", limite: "positivo", grupo: "mat" },
  { chave: "cobrimento", rotulo: "Cobrimento", unidade: "cm", original: true, grupo: "mat" },
  { chave: "acrescimo", rotulo: "Acréscimo (altura útil)", unidade: "cm", grupo: "mat" },
  { chave: "multiplicadorEc", rotulo: "Multiplicador de Ec", unidade: "×", grupo: "mat" },
  {
    chave: "taxaArmaduraMinima",
    rotulo: "As,mín (taxa)",
    unidade: "fração de bw·hw",
    grupo: "flexao",
  },
  {
    chave: "taxaMinimaNegativa",
    rotulo: "As,mín negativa (taxa)",
    unidade: "fração de bw·d",
    grupo: "flexao",
  },
  {
    chave: "decalagem",
    rotulo: "Decalagem",
    unidade: "× d; < 0 = m; > 100 = diâmetros",
    grupo: "flexao",
  },
  {
    chave: "ancoragemPositiva",
    rotulo: "Ancoragem das positivas",
    unidade: "× lb",
    grupo: "flexao",
  },
  {
    chave: "ancoragemNegativa",
    rotulo: "Ancoragem das negativas",
    unidade: "× lb",
    grupo: "flexao",
  },
  {
    chave: "gruposBitolas",
    rotulo: "Grupos de bitolas",
    unidade: "3 a 6",
    inteiro: true,
    faixa: [3, 6],
    grupo: "flexao",
  },
  {
    chave: "taxaEstriboMinima",
    rotulo: "Asw,mín",
    unidade: "cm²/m por cm de bw",
    grupo: "estribo",
  },
  {
    chave: "espacamentoEstriboMinimo",
    rotulo: "Espaçamento mínimo",
    unidade: "cm",
    grupo: "estribo",
  },
  {
    chave: "espacamentoEstriboMaximo",
    rotulo: "Espaçamento máximo",
    unidade: "cm",
    grupo: "estribo",
  },
  {
    chave: "larguraEstriboSimples",
    rotulo: "bw máximo do estribo simples",
    unidade: "cm",
    grupo: "estribo",
  },
  {
    chave: "larguraEstriboDuplo",
    rotulo: "bw máximo do estribo duplo",
    unidade: "cm",
    grupo: "estribo",
  },
  {
    chave: "distanciaMinimaEstribosExtremidade",
    rotulo: "Distância mínima dos estribos nas extremidades",
    unidade: "cm",
    grupo: "estribo",
  },
  {
    chave: "ordemMinimaPortaEstribo",
    rotulo: "Ordem mínima da bitola do porta-estribo",
    unidade: "ordem 0 a 9",
    grupo: "detalhe",
  },
  {
    chave: "traspassePortaEstribo",
    rotulo: "Traspasse do porta-estribo",
    unidade: "cm; > 100 = diâmetros",
    grupo: "detalhe",
  },
  {
    chave: "raioDobramento",
    rotulo: "Raio de dobramento a 90°",
    unidade: "diâmetros",
    grupo: "detalhe",
  },
  {
    chave: "alturaArmaduraPele",
    rotulo: "Pele a partir da altura",
    unidade: "cm",
    grupo: "detalhe",
  },
  {
    chave: "taxaArmaduraPele",
    rotulo: "Taxa da pele por face",
    unidade: "fração de bw·hw",
    grupo: "detalhe",
  },
  { chave: "traspassePele", rotulo: "Traspasse da pele", unidade: "cm", grupo: "detalhe" },
  {
    chave: "entradaMinimaApoio",
    rotulo: "Entrada mínima nos apoios",
    unidade: "diâmetros",
    grupo: "detalhe",
  },
  {
    chave: "ordemMaximaCA60",
    rotulo: "Maior ordem de bitola tratada como CA-60",
    unidade: "ordem 0 a 9",
    grupo: "detalhe",
  },
  {
    chave: "comprimentoMaximoBarra",
    rotulo: "Comprimento máximo da barra",
    unidade: "cm",
    grupo: "detalhe",
  },
] as const satisfies readonly DefNumero<ChavesDe<ParametrosDsp, number>>[];
const BOOL_DSP = [
  {
    chave: "alivioCortante",
    rotulo: "Alívio dos cortantes junto ao apoio",
    sim: "S",
    nao: "N",
    grupo: "analise",
  },
  {
    chave: "acidentaisEnvoltoria",
    rotulo: "Envoltória de acidentais",
    sim: "S",
    nao: "N",
    grupo: "analise",
  },
  {
    chave: "momentosExternos",
    rotulo: "Momentos externos",
    sim: "S",
    nao: "N",
    grupo: "analise",
  },
  {
    chave: "ancoragemMinimo10Diametros",
    rotulo: "Mínimo de 10 φ na ancoragem",
    sim: "S",
    nao: "N",
    grupo: "flexao",
  },
  {
    chave: "reduzAncoragemPositiva",
    rotulo: "Reduz a ancoragem positiva por Ase/Anec",
    sim: "S",
    nao: "N",
    grupo: "flexao",
  },
  {
    chave: "flechaInerciaFissurada",
    rotulo: "Flecha com inércia fissurada",
    sim: "S",
    nao: "N",
    grupo: "els",
  },
  {
    chave: "flechaDeformacaoLenta",
    rotulo: "Flecha com deformação lenta",
    sim: "S",
    nao: "N",
    grupo: "els",
  },
  {
    chave: "verificaFissuracao",
    rotulo: "Verifica a fissuração",
    sim: "S",
    nao: "N",
    grupo: "els",
  },
  {
    chave: "verificaGrampos",
    rotulo: "Grampos nos apoios",
    sim: "S",
    nao: "N",
    grupo: "estribo",
  },
  {
    chave: "portaEstribosAutomaticos",
    rotulo: "Porta-estribos automáticos",
    sim: "S",
    nao: "N",
    grupo: "detalhe",
  },
  {
    chave: "comprimentoDesenvolvido",
    rotulo: "Comprimento desenvolvido",
    sim: "S",
    nao: "N",
    grupo: "detalhe",
  },
] as const satisfies readonly DefBool<ChavesDe<ParametrosDsp, boolean>>[];
type NumDsp = (typeof NUM_DSP)[number]["chave"];
type BoolDsp = (typeof BOOL_DSP)[number]["chave"];

const LISTAS_DSP = {
  bitolas: {
    titulo: "Bitolas",
    fixo: true,
    rotuloLinha: linha("Bitola"),
    colunas: [
      { chave: "bitola", rotulo: "φ", unidade: "mm" },
      { chave: "area", rotulo: "Área (0 desativa)", unidade: "cm²" },
      { chave: "kgPorM", rotulo: "Massa", unidade: "kg/m" },
    ],
  },
  limitesIntervalos: {
    titulo: "Limites dos intervalos por bw",
    fixo: true,
    rotuloLinha: linha1("Intervalo"),
    colunas: [{ chave: "valor", rotulo: "bw até", unidade: "cm" }],
  },
  espacamentosEstribo: {
    titulo: "Espaçamentos de estribo",
    fixo: false,
    minimo: 2,
    rotuloLinha: linha1("Espaçamento"),
    colunas: [{ chave: "valor", rotulo: "s", unidade: "cm" }],
  },
  bitolasEstribo: {
    titulo: "Bitolas de estribo",
    fixo: true,
    rotuloLinha: linha("Linha"),
    colunas: [
      { chave: "maxima", rotulo: "Máxima", unidade: "mm" },
      { chave: "minima", rotulo: "Mínima", unidade: "mm" },
    ],
  },
  dobrasPorBitola: {
    titulo: "Dobras por bitola",
    fixo: true,
    rotuloLinha: linha("Bitola"),
    colunas: [
      { chave: "c0", rotulo: "Coluna 1", unidade: "cm", largura: "w-14" },
      { chave: "c1", rotulo: "Coluna 2", unidade: "cm", largura: "w-14" },
      { chave: "c2", rotulo: "Coluna 3", unidade: "cm", largura: "w-14" },
      { chave: "c3", rotulo: "Coluna 4", unidade: "cm", largura: "w-14" },
      { chave: "c4", rotulo: "Coluna 5", unidade: "cm", largura: "w-14" },
    ],
  },
  tabelaBitola1: {
    titulo: "Tabela 1 por bitola (4 a 12,5 mm)",
    fixo: true,
    rotuloLinha: linha1("Valor"),
    colunas: [{ chave: "valor", rotulo: "Valor", unidade: "sem rótulo no .DSP" }],
  },
  tabelaBitola2: {
    titulo: "Tabela 2 por bitola (4 a 12,5 mm)",
    fixo: true,
    rotuloLinha: linha1("Valor"),
    colunas: [{ chave: "valor", rotulo: "Valor", unidade: "sem rótulo no .DSP" }],
  },
} as const satisfies Record<string, DefLista<string>>;

export interface FormDsp extends Escalares<NumDsp, BoolDsp> {
  classeAco: ComPadrao<ClasseAco>;
  classeFissuracao: ComPadrao<"1" | "2" | "3">;
  comparaEspacamentoMaximo: ComPadrao<ParametrosDsp["comparaEspacamentoMaximo"]>;
  letraFerros: string;
  bitolas: Lista<"bitola" | "area" | "kgPorM">;
  limitesIntervalos: Lista<"valor">;
  espacamentosEstribo: Lista<"valor">;
  bitolasEstribo: Lista<"maxima" | "minima">;
  dobrasPorBitola: Lista<Col5>;
  tabelaBitola1: Lista<"valor">;
  tabelaBitola2: Lista<"valor">;
}

// ---------------------------------------------------------------- PILAR.INI

const NUM_INI = [
  {
    chave: "maximoBarras",
    rotulo: "Número máximo de barras numa seção",
    unidade: "barras",
    limite: "positivo",
    inteiro: true,
    grupo: "geral",
  },
  {
    chave: "maximoVariacoes",
    rotulo: "Número máximo de variações de armadura numa coluna",
    unidade: "variações",
    limite: "positivo",
    inteiro: true,
    grupo: "geral",
  },
  {
    chave: "coeficienteMedida",
    rotulo: "Coeficiente de medida",
    unidade: "×",
    limite: "positivo",
    grupo: "geral",
  },
  {
    chave: "coeficienteForca",
    rotulo: "Coeficiente de força",
    unidade: "×",
    limite: "positivo",
    grupo: "geral",
  },
  {
    chave: "coeficienteTensao",
    rotulo: "Multiplicador de fck e fyk para t/cm²",
    unidade: "×",
    limite: "positivo",
    grupo: "geral",
  },
  { chave: "fck", rotulo: "fck dos pilares", unidade: "MPa", limite: "positivo", grupo: "mat" },
  { chave: "fyk", rotulo: "fyk dos pilares", unidade: "MPa", limite: "positivo", grupo: "mat" },
  { chave: "gamaF", rotulo: "γf (Csf)", unidade: "coeficiente", limite: "positivo", grupo: "mat" },
  { chave: "gamaC", rotulo: "γc (Csc)", unidade: "coeficiente", limite: "positivo", grupo: "mat" },
  { chave: "gamaS", rotulo: "γs (Csa)", unidade: "coeficiente", limite: "positivo", grupo: "mat" },
  {
    chave: "multiplicadorEc",
    rotulo: "Multiplicador de Ec",
    unidade: "×",
    limite: "positivo",
    grupo: "mat",
  },
  {
    chave: "excentricidadeMinima",
    rotulo: "Excentricidade acidental mínima",
    unidade: "cm",
    limite: "naoNegativo",
    grupo: "exc",
  },
  {
    chave: "lambda2aOrdem",
    rotulo: "λ a partir do qual há 2ª ordem",
    unidade: "λ",
    limite: "naoNegativo",
    grupo: "lambda",
  },
  {
    chave: "lambdaFluencia",
    rotulo: "λ a partir do qual há fluência",
    unidade: "λ",
    limite: "naoNegativo",
    grupo: "lambda",
  },
  {
    chave: "lambdaProcessoExato",
    rotulo: "λ do processo exato",
    unidade: "λ",
    limite: "naoNegativo",
    grupo: "lambda",
  },
  {
    chave: "coeficienteFluencia",
    rotulo: "Coeficiente de fluência φ",
    unidade: "φ",
    limite: "naoNegativo",
    grupo: "lambda",
  },
  {
    chave: "fatorNkFluencia",
    rotulo: "Fator de Nk na fluência",
    unidade: "×",
    limite: "positivo",
    grupo: "lambda",
  },
  {
    chave: "fatorCargaFluencia",
    rotulo: "Fator da carga de fluência",
    unidade: "×",
    limite: "positivo",
    grupo: "lambda",
  },
] as const satisfies readonly DefNumero<ChavesDe<IniPilar, number>>[];
const BOOL_INI = [
  { chave: "verificaH30", rotulo: "Verifica h/30", sim: "S", nao: "N", grupo: "exc" },
  {
    chave: "secoesSimetricas",
    rotulo: "Seções retangulares e circulares simétricas",
    sim: "S",
    nao: "N",
    grupo: "exc",
  },
] as const satisfies readonly DefBool<ChavesDe<IniPilar, boolean>>[];
type NumIni = (typeof NUM_INI)[number]["chave"];
type BoolIni = (typeof BOOL_INI)[number]["chave"];

const LISTAS_INI = {
  bitolas: {
    titulo: "Bitolas",
    fixo: true,
    rotuloLinha: linha("Bitola"),
    colunas: [
      { chave: "bitola", rotulo: "φ", unidade: "mm", limite: "positivo" },
      { chave: "area", rotulo: "Área", unidade: "cm²", limite: "naoNegativo" },
    ],
  },
} as const satisfies Record<string, DefLista<string>>;

export interface FormIni extends Escalares<NumIni, BoolIni> {
  classeAco: ComPadrao<ClasseAco>;
  excentricidades: ComPadrao<IniPilar["excentricidades"]>;
  bitolas: Lista<"bitola" | "area">;
}

// ---------------------------------------------------------------- .PIP

const NUM_PIP = [
  {
    chave: "tensaoAdmissivelNormal",
    rotulo: "Tensão admissível Nk/A",
    unidade: "× fck",
    limite: "positivo",
    grupo: "predim",
  },
  {
    chave: "tensaoAdmissivelFlexao",
    rotulo: "Tensão admissível Nk/A + Mk/W",
    unidade: "× fck",
    limite: "positivo",
    grupo: "predim",
  },
  {
    chave: "taxaIdealPredimensionamento",
    rotulo: "Taxa ideal do predimensionamento",
    unidade: "%",
    limite: "naoNegativo",
    grupo: "predim",
  },
  {
    chave: "multiploMedida",
    rotulo: "Múltiplo da medida da seção",
    unidade: "cm",
    limite: "positivo",
    grupo: "predim",
  },
  {
    chave: "medidaMinima",
    rotulo: "Medida mínima da seção",
    unidade: "cm",
    limite: "positivo",
    grupo: "predim",
  },
  {
    chave: "cobrimento",
    rotulo: "Cobrimento",
    unidade: "cm",
    limite: "naoNegativo",
    grupo: "carga",
  },
  {
    chave: "densidade",
    rotulo: "Densidade do concreto (peso próprio)",
    unidade: "kN/m³",
    limite: "naoNegativo",
    grupo: "carga",
  },
  {
    chave: "porcentagemAcidental",
    rotulo: "Parcela acidental da carga total",
    unidade: "%",
    limite: "naoNegativo",
    grupo: "carga",
  },
  {
    chave: "taxaMinimaCalculada",
    rotulo: "Taxa mínima sobre a seção calculada",
    unidade: "%",
    limite: "naoNegativo",
    grupo: "arm",
  },
  {
    chave: "taxaMinimaReal",
    rotulo: "Taxa mínima sobre a seção real",
    unidade: "%",
    limite: "naoNegativo",
    grupo: "arm",
  },
  { chave: "taxaMaxima", rotulo: "Taxa máxima", unidade: "%", limite: "positivo", grupo: "arm" },
  {
    chave: "ordemBitolaMinima",
    rotulo: "Menor bitola longitudinal",
    unidade: "ordem 0 a 12",
    limite: "naoNegativo",
    faixa: [0, 12],
    grupo: "arm",
  },
] as const satisfies readonly DefNumero<ChavesDe<PipPilar, number>>[];
const BOOL_PIP = [
  {
    chave: "reduzAcidentalFundacao",
    rotulo: "Reduz a acidental para a fundação",
    sim: "S",
    nao: "N",
    grupo: "carga",
  },
  {
    chave: "reduzAcidentalDimensionamento",
    rotulo: "Reduz a acidental para o dimensionamento",
    sim: "S",
    nao: "N",
    grupo: "carga",
  },
  {
    chave: "pesoProprio",
    rotulo: "Acrescenta o peso próprio da coluna",
    sim: "S",
    nao: "N",
    grupo: "carga",
  },
  {
    chave: "traspasseNaTaxa",
    rotulo: "Traspasse no cálculo da taxa",
    sim: "S",
    nao: "N",
    grupo: "arm",
  },
  { chave: "misturaBitolas", rotulo: "Mistura de bitolas", sim: "S", nao: "N", grupo: "arm" },
] as const satisfies readonly DefBool<ChavesDe<PipPilar, boolean>>[];
type NumPip = (typeof NUM_PIP)[number]["chave"];
type BoolPip = (typeof BOOL_PIP)[number]["chave"];

/** Rótulo de vínculo na matriz de flambagem, na ordem de VINCULOS_PILAR. */
export const ROTULO_VINCULO: Record<(typeof VINCULOS_PILAR)[number], string> = {
  engaste: "engaste",
  semiEngaste: "semi-engaste",
  continuidade: "continuidade",
  livre: "livre",
};
const vinculo = (i: number) => {
  const v = VINCULOS_PILAR[i];
  return v ? ROTULO_VINCULO[v] : `vínculo ${i}`;
};

const LISTAS_PIP = {
  bitolas: {
    titulo: "Bitolas",
    fixo: true,
    rotuloLinha: linha("Bitola"),
    colunas: [
      { chave: "bitola", rotulo: "φ", unidade: "mm", limite: "positivo" },
      { chave: "area", rotulo: "Área", unidade: "cm²", limite: "naoNegativo" },
      {
        chave: "espacamentoMinimo",
        rotulo: "Espaçamento mínimo",
        unidade: "cm",
        limite: "naoNegativo",
      },
      { chave: "coluna4", rotulo: "4ª coluna", unidade: "cm", limite: "naoNegativo" },
    ],
  },
  coeficienteFlambagem: {
    titulo: "Coeficiente de flambagem (inferior × superior)",
    fixo: true,
    rotuloLinha: (i: number) => `Inferior ${vinculo(i)}`,
    colunas: [
      { chave: "c0", rotulo: `Superior ${vinculo(0)}`, unidade: "× l", limite: "positivo" },
      { chave: "c1", rotulo: `Superior ${vinculo(1)}`, unidade: "× l", limite: "positivo" },
      { chave: "c2", rotulo: `Superior ${vinculo(2)}`, unidade: "× l", limite: "positivo" },
      { chave: "c3", rotulo: `Superior ${vinculo(3)}`, unidade: "× l", limite: "positivo" },
    ],
  },
  estriboPorBitola: {
    titulo: "Estribo por bitola longitudinal",
    fixo: true,
    rotuloLinha: linha("Bitola"),
    colunas: [
      { chave: "bitola", rotulo: "φ estribo (0 = sem)", unidade: "mm", limite: "naoNegativo" },
      { chave: "espacamento", rotulo: "Espaçamento", unidade: "cm", limite: "naoNegativo" },
    ],
  },
} as const satisfies Record<string, DefLista<string>>;

export interface FormPip extends Escalares<NumPip, BoolPip> {
  bitolas: Lista<"bitola" | "area" | "espacamentoMinimo" | "coluna4">;
  coeficienteFlambagem: Lista<Col4>;
  estriboPorBitola: Lista<"bitola" | "espacamento">;
}

// ---------------------------------------------------------------- formulário inteiro

export type Predimensionamento = ComPadrao<NonNullable<ParametrosPilarObra["predimensionamento"]>>;

export interface FormParametros {
  otimizaNegativos: TriEstado;
  predimensionamento: Predimensionamento;
  variaArmadura: string;
  rlp: TriEstado;
  rigidezVigas: TriEstado;
  laje: FormLaje;
  viga: FormVigaIni;
  dsp: FormDsp;
  ini: FormIni;
  pip: FormPip;
}

/** Descritores que o diálogo usa para desenhar cada tabela. */
export const DEFS = {
  laje: { numeros: NUM_LAJE, booleanos: BOOL_LAJE, listas: LISTAS_LAJE },
  viga: { numeros: NUM_VIGA, booleanos: BOOL_VIGA },
  dsp: { numeros: NUM_DSP, booleanos: BOOL_DSP, listas: LISTAS_DSP },
  ini: { numeros: NUM_INI, booleanos: BOOL_INI, listas: LISTAS_INI },
  pip: { numeros: NUM_PIP, booleanos: BOOL_PIP, listas: LISTAS_PIP },
} as const;

/** Nome de cada tabela nas mensagens. */
const SECAO = {
  laje: ".LAP",
  viga: "VIGA.INI",
  dsp: ".DSP",
  ini: "PILAR.INI",
  pip: ".PIP",
} as const;

// ---------------------------------------------------------------- domínio → formulário

/** Textos dos campos numéricos ("" = ausente). */
function textos<N extends string>(
  defs: readonly { chave: N }[],
  v: Partial<Record<N, number>> | undefined,
): Record<N, string> {
  return Object.fromEntries(defs.map((d) => [d.chave, textoDe(v?.[d.chave])])) as Record<N, string>;
}

/** "padrão" / "sim" / "não" dos campos booleanos. */
function tris<B extends string>(
  defs: readonly { chave: B }[],
  v: Partial<Record<B, boolean>> | undefined,
): Record<B, TriEstado> {
  return Object.fromEntries(defs.map((d) => [d.chave, triDe(v?.[d.chave])])) as Record<
    B,
    TriEstado
  >;
}

/** Linha do formulário com o texto de cada coluna. */
function linhaDe<C extends string>(
  colunas: readonly { chave: C }[],
  valor: (c: C, j: number) => number | undefined,
) {
  return Object.fromEntries(
    colunas.map((c, j) => [c.chave, textoDe(valor(c.chave, j))]),
  ) as LinhaForm<C>;
}

/** Lista de objetos (bitolas etc.): as linhas da obra ou, sem elas, as de fábrica. */
function listaDeObjetos<C extends string>(
  def: DefLista<C>,
  obra: readonly Record<C, number>[] | undefined,
  fabrica: readonly Record<C, number>[],
): Lista<C> {
  return {
    ligada: obra !== undefined,
    linhas: (obra ?? fabrica).map((o) => linhaDe(def.colunas, (c) => o[c])),
  };
}

/** Lista de linhas de números (lista simples = uma coluna; matriz = uma coluna por índice). */
function listaDeMatriz<C extends string>(
  def: DefLista<C>,
  obra: readonly (readonly number[])[] | undefined,
  fabrica: readonly (readonly number[])[],
): Lista<C> {
  return {
    ligada: obra !== undefined,
    linhas: (obra ?? fabrica).map((r) => linhaDe(def.colunas, (_, j) => r[j])),
  };
}

const coluna = (l: readonly number[] | undefined) => l?.map((x) => [x]);

const escolhaDe = <T extends string>(v: T | undefined): ComPadrao<T> => v ?? "padrao";

/** Obra → formulário. */
export function formDosParametros(obra: Obra): FormParametros {
  const lap = obra.parametrosLaje;
  const vi = obra.parametrosViga?.viga;
  const dsp = obra.parametrosViga?.dsp;
  const pp = obra.parametrosPilar;
  const ini = pp?.ini;
  const pip = pp?.pip;
  const flecha = lap?.flecha ?? PARAMETROS_LAJE.flecha;
  return {
    otimizaNegativos: triDe(obra.otimizaNegativos),
    predimensionamento: escolhaDe(pp?.predimensionamento),
    variaArmadura: textoDe(pp?.variaArmadura),
    rlp: triDe(pp?.rlp),
    rigidezVigas: triDe(pp?.rigidezVigas),
    laje: {
      numeros: textos(NUM_LAJE, lap),
      booleanos: tris(BOOL_LAJE, lap),
      bitolas: listaDeObjetos(LISTAS_LAJE.bitolas, lap?.bitolas, PARAMETROS_LAJE.bitolas),
      relacaoMu: listaDeObjetos(LISTAS_LAJE.relacaoMu, lap?.relacaoMu, PARAMETROS_LAJE.relacaoMu),
      espacamentoMinimoPorH: listaDeObjetos(
        LISTAS_LAJE.espacamentoMinimoPorH,
        lap?.espacamentoMinimoPorH,
        PARAMETROS_LAJE.espacamentoMinimoPorH,
      ),
      espacamentos: listaDeMatriz(
        LISTAS_LAJE.espacamentos,
        coluna(lap?.espacamentos),
        coluna(PARAMETROS_LAJE.espacamentos) ?? [],
      ),
      bitolaPorH: listaDeObjetos(
        LISTAS_LAJE.bitolaPorH,
        lap?.bitolaPorH,
        PARAMETROS_LAJE.bitolaPorH,
      ),
      flecha: {
        ligada: lap?.flecha !== undefined,
        lfTotal: textoDe(flecha.lfTotal),
        lfAcidental: textoDe(flecha.lfAcidental),
        multiplicadorEc: textoDe(flecha.multiplicadorEc),
        deformacaoLenta: flecha.deformacaoLenta ? "sim" : "nao",
      },
    },
    viga: {
      numeros: textos(NUM_VIGA, vi),
      booleanos: tris(BOOL_VIGA, vi),
      reacaoNoPilar: escolhaDe(vi?.reacaoNoPilar),
    },
    dsp: {
      numeros: textos(NUM_DSP, dsp),
      booleanos: tris(BOOL_DSP, dsp),
      classeAco: escolhaDe(dsp?.classeAco),
      classeFissuracao:
        dsp?.classeFissuracao === 1 || dsp?.classeFissuracao === 2 || dsp?.classeFissuracao === 3
          ? `${dsp.classeFissuracao}`
          : "padrao",
      comparaEspacamentoMaximo: escolhaDe(dsp?.comparaEspacamentoMaximo),
      letraFerros: dsp?.letraFerros ?? "",
      bitolas: listaDeObjetos(LISTAS_DSP.bitolas, dsp?.bitolas, PARAMETROS_DSP.bitolas),
      limitesIntervalos: listaDeMatriz(
        LISTAS_DSP.limitesIntervalos,
        coluna(dsp?.limitesIntervalos),
        coluna(PARAMETROS_DSP.limitesIntervalos) ?? [],
      ),
      espacamentosEstribo: listaDeMatriz(
        LISTAS_DSP.espacamentosEstribo,
        coluna(dsp?.espacamentosEstribo),
        coluna(PARAMETROS_DSP.espacamentosEstribo) ?? [],
      ),
      bitolasEstribo: listaDeObjetos(
        LISTAS_DSP.bitolasEstribo,
        dsp?.bitolasEstribo,
        PARAMETROS_DSP.bitolasEstribo,
      ),
      dobrasPorBitola: listaDeMatriz(
        LISTAS_DSP.dobrasPorBitola,
        dsp?.dobrasPorBitola,
        PARAMETROS_DSP.dobrasPorBitola,
      ),
      tabelaBitola1: listaDeMatriz(
        LISTAS_DSP.tabelaBitola1,
        coluna(dsp?.tabelaBitola1),
        coluna(PARAMETROS_DSP.tabelaBitola1) ?? [],
      ),
      tabelaBitola2: listaDeMatriz(
        LISTAS_DSP.tabelaBitola2,
        coluna(dsp?.tabelaBitola2),
        coluna(PARAMETROS_DSP.tabelaBitola2) ?? [],
      ),
    },
    ini: {
      numeros: textos(NUM_INI, ini),
      booleanos: tris(BOOL_INI, ini),
      classeAco: escolhaDe(ini?.classeAco),
      excentricidades: escolhaDe(ini?.excentricidades),
      bitolas: listaDeObjetos(LISTAS_INI.bitolas, ini?.bitolas, PARAMETROS_PILAR.bitolas),
    },
    pip: {
      numeros: textos(NUM_PIP, pip),
      booleanos: tris(BOOL_PIP, pip),
      bitolas: listaDeObjetos(LISTAS_PIP.bitolas, pip?.bitolas, PARAMETROS_PIP.bitolas),
      coeficienteFlambagem: listaDeMatriz(
        LISTAS_PIP.coeficienteFlambagem,
        pip?.coeficienteFlambagem,
        PARAMETROS_PIP.coeficienteFlambagem,
      ),
      estriboPorBitola: listaDeObjetos(
        LISTAS_PIP.estriboPorBitola,
        pip?.estriboPorBitola,
        PARAMETROS_PIP.estriboPorBitola,
      ),
    },
  };
}

// ---------------------------------------------------------------- padrões (placeholders)

/**
 * O que vale com o campo vazio, para mostrar apagado. Quase sempre o de fábrica; onde o
 * motor usa outra coisa, a da obra: fck, fyk e classe do .DSP (só no original) e do
 * PILAR.INI vêm de `obra.materiais`; a densidade e o cobrimento do .PIP, do modo
 * (`parametrosSistrut` em calculo/sistrut/obra.ts).
 */
export function padroesDosParametros(obra: Obra) {
  const m = obra.materiais;
  const original = obra.modoCalculo === "original";
  const classeAco: ClasseAco = m.aco === "CA-25" ? "A" : m.classeAco;
  return {
    laje: textos(NUM_LAJE, PARAMETROS_LAJE),
    flecha: PARAMETROS_LAJE.flecha,
    viga: textos(NUM_VIGA, PARAMETROS_VIGA),
    reacaoNoPilar: PARAMETROS_VIGA.reacaoNoPilar,
    dsp: {
      ...textos(NUM_DSP, PARAMETROS_DSP),
      fck: textoDe(m.fck / 100),
      fyk: textoDe(FYK_ORIGINAL_TCM2[m.aco]),
    },
    dspClasseAco: classeAco,
    classeFissuracao: PARAMETROS_DSP.classeFissuracao,
    comparaEspacamentoMaximo: PARAMETROS_DSP.comparaEspacamentoMaximo,
    letraFerros: PARAMETROS_DSP.letraFerros,
    ini: {
      ...textos(NUM_INI, PARAMETROS_PILAR),
      fck: textoDe(m.fck),
      fyk: textoDe(FYK_CORRIGIDO_MPA[m.aco]),
    },
    iniClasseAco: classeAco,
    excentricidades: PARAMETROS_PILAR.excentricidades,
    pip: {
      ...textos(NUM_PIP, PARAMETROS_PIP),
      // 2,5 t/m³ no original; 25 kN/m³ no corrigido
      densidade: original ? formatarNumero(PARAMETROS_PIP.densidade * KN_POR_TF) : "25",
      cobrimento: textoDe(original ? PARAMETROS_PIP.cobrimento : m.cobrimentoPilar),
    },
  };
}
export type PadroesParametros = ReturnType<typeof padroesDosParametros>;

// ---------------------------------------------------------------- formulário → domínio

/** Lê um número como o leitor do arquivo, mais a faixa de inteiros quando houver. */
function lerNumero(
  l: Leitor,
  texto: string,
  rotulo: string,
  d: { limite?: Limite; inteiro?: boolean; faixa?: readonly [number, number] },
  obrigatorio: boolean,
): number | undefined {
  const antes = l.erros.length;
  const inteiro = (d.inteiro ?? false) || d.faixa !== undefined;
  const n = obrigatorio
    ? l.numero(texto, rotulo, d.limite ?? "qualquer", inteiro)
    : l.opcional(texto, rotulo, d.limite ?? "qualquer", inteiro);
  if (n !== undefined && d.faixa && l.erros.length === antes) {
    const [min, max] = d.faixa;
    if (n < min || n > max) l.erro(`${rotulo}: informe um inteiro de ${min} a ${max}.`);
  }
  return n;
}

/** Campos numéricos preenchidos (os vazios ficam ausentes). */
function lerNumeros<N extends string>(
  l: Leitor,
  defs: readonly DefNumero<N>[],
  t: Record<N, string>,
  secao: string,
): Partial<Record<N, number>> {
  const r: Partial<Record<N, number>> = {};
  for (const d of defs) {
    const n = lerNumero(l, t[d.chave], `${secao}, ${d.rotulo}`, d, false);
    if (n !== undefined) r[d.chave] = n;
  }
  return r;
}

/** Campos booleanos escolhidos (os "padrão" ficam ausentes). */
function lerBooleanos<B extends string>(
  defs: readonly { chave: B }[],
  t: Record<B, TriEstado>,
): Partial<Record<B, boolean>> {
  const r: Partial<Record<B, boolean>> = {};
  for (const d of defs) {
    const b = boolDe(t[d.chave]);
    if (b !== undefined) r[d.chave] = b;
  }
  return r;
}

/** Linhas de uma lista ligada (undefined se desligada): cada célula é obrigatória. */
function lerLinhas<C extends string>(
  l: Leitor,
  def: DefLista<C>,
  lista: Lista<C>,
  secao: string,
): Record<C, number>[] | undefined {
  if (!lista.ligada) return undefined;
  const t = `${secao}, ${def.titulo}`;
  if (def.minimo !== undefined && lista.linhas.length < def.minimo)
    l.erro(`${t}: informe pelo menos ${def.minimo} ${def.minimo === 1 ? "valor" : "valores"}.`);
  return lista.linhas.map(
    (ln, i) =>
      Object.fromEntries(
        def.colunas.map((c) => [
          c.chave,
          lerNumero(l, ln[c.chave], `${t}, ${def.rotuloLinha(i)}, ${c.rotulo}`, c, true) ?? 0,
        ]),
      ) as Record<C, number>,
  );
}

/** Linhas de uma lista ligada como matriz, na ordem das colunas. */
function lerMatriz<C extends string>(l: Leitor, def: DefLista<C>, lista: Lista<C>, secao: string) {
  return lerLinhas(l, def, lista, secao)?.map((r) => def.colunas.map((c) => r[c.chave]));
}

/** Lista simples (uma coluna). */
function lerColuna(l: Leitor, def: DefLista<"valor">, lista: Lista<"valor">, secao: string) {
  return lerLinhas(l, def, lista, secao)?.map((r) => r.valor);
}

const escolha = <T extends string>(e: ComPadrao<T>): T | undefined =>
  e === "padrao" ? undefined : e;

/** Objeto sem chaves vira ausente (o campo some da obra). */
const objetoOuNada = <T extends object>(o: T): T | undefined =>
  Object.keys(o).length > 0 ? o : undefined;

const chaves = <K extends string>(...grupos: readonly (readonly { chave: K }[])[]) =>
  grupos.flatMap((g) => g.map((d) => d.chave));

/** Campos de cada tabela que o editor controla; os outros passam intactos. */
const CAMPOS_LAJE = [
  ...chaves<keyof ParametrosLajeObra>(NUM_LAJE, BOOL_LAJE),
  "bitolas",
  "relacaoMu",
  "espacamentoMinimoPorH",
  "espacamentos",
  "bitolaPorH",
  "flecha",
] as const satisfies readonly (keyof ParametrosLajeObra)[];
const CAMPOS_VIGA = [
  ...chaves<keyof ParametrosVigaIni>(NUM_VIGA, BOOL_VIGA),
  "reacaoNoPilar",
] as const satisfies readonly (keyof ParametrosVigaIni)[];
const CAMPOS_DSP = [
  ...chaves<keyof ParametrosDsp>(NUM_DSP, BOOL_DSP),
  "classeAco",
  "classeFissuracao",
  "comparaEspacamentoMaximo",
  "letraFerros",
  "bitolas",
  "limitesIntervalos",
  "espacamentosEstribo",
  "bitolasEstribo",
  "dobrasPorBitola",
  "tabelaBitola1",
  "tabelaBitola2",
] as const satisfies readonly (keyof ParametrosDsp)[];
const CAMPOS_INI = [
  ...chaves<keyof IniPilar>(NUM_INI, BOOL_INI),
  "classeAco",
  "excentricidades",
  "bitolas",
] as const satisfies readonly (keyof IniPilar)[];
const CAMPOS_PIP = [
  ...chaves<keyof PipPilar>(NUM_PIP, BOOL_PIP),
  "bitolas",
  "coeficienteFlambagem",
  "estriboPorBitola",
] as const satisfies readonly (keyof PipPilar)[];

function lerLaje(l: Leitor, f: FormLaje, atual: ParametrosLajeObra | undefined) {
  const s = SECAO.laje;
  const flecha = f.flecha.ligada
    ? {
        lfTotal:
          lerNumero(l, f.flecha.lfTotal, `${s}, Flecha, L/f total`, { limite: "positivo" }, true) ??
          0,
        lfAcidental:
          lerNumero(
            l,
            f.flecha.lfAcidental,
            `${s}, Flecha, L/f acidental`,
            { limite: "positivo" },
            true,
          ) ?? 0,
        multiplicadorEc:
          lerNumero(
            l,
            f.flecha.multiplicadorEc,
            `${s}, Flecha, multiplicador de Ec`,
            { limite: "positivo" },
            true,
          ) ?? 0,
        deformacaoLenta: f.flecha.deformacaoLenta === "sim",
      }
    : undefined;
  const r: ParametrosLajeObra = {
    ...semChaves(atual ?? {}, CAMPOS_LAJE),
    ...lerNumeros(l, NUM_LAJE, f.numeros, s),
    ...lerBooleanos(BOOL_LAJE, f.booleanos),
    ...soDefinidos({
      bitolas: lerLinhas(l, LISTAS_LAJE.bitolas, f.bitolas, s),
      relacaoMu: lerLinhas(l, LISTAS_LAJE.relacaoMu, f.relacaoMu, s),
      espacamentoMinimoPorH: lerLinhas(
        l,
        LISTAS_LAJE.espacamentoMinimoPorH,
        f.espacamentoMinimoPorH,
        s,
      ),
      espacamentos: lerColuna(l, LISTAS_LAJE.espacamentos, f.espacamentos, s),
      bitolaPorH: lerLinhas(l, LISTAS_LAJE.bitolaPorH, f.bitolaPorH, s),
      flecha,
    }),
  };
  return objetoOuNada(r);
}

function lerVigaIni(l: Leitor, f: FormVigaIni, atual: Partial<ParametrosVigaIni> | undefined) {
  const r: Partial<ParametrosVigaIni> = {
    ...semChaves(atual ?? {}, CAMPOS_VIGA),
    ...lerNumeros(l, NUM_VIGA, f.numeros, SECAO.viga),
    ...lerBooleanos(BOOL_VIGA, f.booleanos),
    ...soDefinidos({ reacaoNoPilar: escolha(f.reacaoNoPilar) }),
  };
  return objetoOuNada(r);
}

function lerDsp(l: Leitor, f: FormDsp, atual: Partial<ParametrosDsp> | undefined) {
  const s = SECAO.dsp;
  const numeros = lerNumeros(l, NUM_DSP, f.numeros, s);
  // o editor não mostra as listas por grupo: o número de grupos precisa bater com elas
  const grupos = numeros.gruposBitolas;
  if (grupos !== undefined && Number.isInteger(grupos) && grupos >= 3 && grupos <= 6) {
    const arranjos = (atual?.arranjosPorIntervalo ?? PARAMETROS_DSP.arranjosPorIntervalo).length;
    const corte = (atual?.grupoDeCorte ?? PARAMETROS_DSP.grupoDeCorte).length;
    if (arranjos !== grupos || corte !== grupos)
      l.erro(
        `${s}, Grupos de bitolas: com ${grupos} grupos o .DSP precisa de ${grupos} listas de arranjos e ${grupos} de grupo de corte, e a obra tem ${arranjos} e ${corte}; este editor não muda essas listas.`,
      );
  }
  const classeFissuracao = escolha(f.classeFissuracao);
  const r: Partial<ParametrosDsp> = {
    ...semChaves(atual ?? {}, CAMPOS_DSP),
    ...numeros,
    ...lerBooleanos(BOOL_DSP, f.booleanos),
    ...soDefinidos({
      classeAco: escolha(f.classeAco),
      classeFissuracao: classeFissuracao === undefined ? undefined : Number(classeFissuracao),
      comparaEspacamentoMaximo: escolha(f.comparaEspacamentoMaximo),
      letraFerros: f.letraFerros.trim() === "" ? undefined : f.letraFerros.trim(),
      bitolas: lerLinhas(l, LISTAS_DSP.bitolas, f.bitolas, s),
      limitesIntervalos: lerColuna(l, LISTAS_DSP.limitesIntervalos, f.limitesIntervalos, s),
      espacamentosEstribo: lerColuna(l, LISTAS_DSP.espacamentosEstribo, f.espacamentosEstribo, s),
      bitolasEstribo: lerLinhas(l, LISTAS_DSP.bitolasEstribo, f.bitolasEstribo, s),
      dobrasPorBitola: lerMatriz(l, LISTAS_DSP.dobrasPorBitola, f.dobrasPorBitola, s),
      tabelaBitola1: lerColuna(l, LISTAS_DSP.tabelaBitola1, f.tabelaBitola1, s),
      tabelaBitola2: lerColuna(l, LISTAS_DSP.tabelaBitola2, f.tabelaBitola2, s),
    }),
  };
  return objetoOuNada(r);
}

function lerIni(l: Leitor, f: FormIni, atual: Partial<IniPilar> | undefined) {
  const r: Partial<IniPilar> = {
    ...semChaves(atual ?? {}, CAMPOS_INI),
    ...lerNumeros(l, NUM_INI, f.numeros, SECAO.ini),
    ...lerBooleanos(BOOL_INI, f.booleanos),
    ...soDefinidos({
      classeAco: escolha(f.classeAco),
      excentricidades: escolha(f.excentricidades),
      bitolas: lerLinhas(l, LISTAS_INI.bitolas, f.bitolas, SECAO.ini),
    }),
  };
  return objetoOuNada(r);
}

function lerPip(l: Leitor, f: FormPip, atual: Partial<PipPilar> | undefined) {
  const s = SECAO.pip;
  const r: Partial<PipPilar> = {
    ...semChaves(atual ?? {}, CAMPOS_PIP),
    ...lerNumeros(l, NUM_PIP, f.numeros, s),
    ...lerBooleanos(BOOL_PIP, f.booleanos),
    ...soDefinidos({
      bitolas: lerLinhas(l, LISTAS_PIP.bitolas, f.bitolas, s),
      coeficienteFlambagem: lerMatriz(
        l,
        LISTAS_PIP.coeficienteFlambagem,
        f.coeficienteFlambagem,
        s,
      ),
      estriboPorBitola: lerLinhas(l, LISTAS_PIP.estriboPorBitola, f.estriboPorBitola, s),
    }),
  };
  return objetoOuNada(r);
}

/**
 * Formulário → obra, ou a lista de problemas (cada mensagem nomeia a tabela e o campo).
 * As faixas são as do leitor do arquivo. Só mexe em `otimizaNegativos`, `parametrosLaje`,
 * `parametrosViga` e `parametrosPilar`; dentro deles, só nos campos que o editor mostra.
 */
export function obraDosParametros(f: FormParametros, obra: Obra): Obra | string[] {
  const l = new Leitor();
  const pv: ParametrosVigaObra = obra.parametrosViga ?? {};
  const pp: ParametrosPilarObra = obra.parametrosPilar ?? {};

  const parametrosLaje = lerLaje(l, f.laje, obra.parametrosLaje);
  const parametrosViga = objetoOuNada<ParametrosVigaObra>({
    ...semChaves(pv, ["viga", "dsp"]),
    ...soDefinidos({ viga: lerVigaIni(l, f.viga, pv.viga), dsp: lerDsp(l, f.dsp, pv.dsp) }),
  });
  const parametrosPilar = objetoOuNada<ParametrosPilarObra>({
    ...semChaves(pp, ["ini", "pip", "predimensionamento", "variaArmadura", "rlp", "rigidezVigas"]),
    ...soDefinidos({
      ini: lerIni(l, f.ini, pp.ini),
      pip: lerPip(l, f.pip, pp.pip),
      predimensionamento: escolha(f.predimensionamento),
      variaArmadura: lerNumero(
        l,
        f.variaArmadura,
        "Rodada, Variação da armadura ao longo da coluna",
        { limite: "naoNegativo", inteiro: true },
        false,
      ),
      rlp: boolDe(f.rlp),
      rigidezVigas: boolDe(f.rigidezVigas),
    }),
  });

  const nova: Obra = {
    ...semChaves(obra, ["otimizaNegativos", "parametrosLaje", "parametrosViga", "parametrosPilar"]),
    ...soDefinidos({
      otimizaNegativos: boolDe(f.otimizaNegativos),
      parametrosLaje,
      parametrosViga,
      parametrosPilar,
    }),
  };
  return l.erros.length > 0 ? l.erros : nova;
}

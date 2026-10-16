// Modelo da obra: o que o usuário desenha e edita, e o que vai para o
// arquivo .openstrut.json. Geometria da planta em metros; seções em cm;
// cargas em kN/m² (lajes) e kN/m (vigas).

export type NormaId = "nb1-78" | "nbr6118-2023";
export type Aco = "CA-25" | "CA-50" | "CA-60";
/** Classe de agressividade ambiental (NBR 6118:2023, tabela 6.1). */
export type Caa = 1 | 2 | 3 | 4;
/** Classe do aço longitudinal pela NB-1/78: A (laminado a quente, patamar de escoamento)
 *  ou B (encruado a frio, diagrama curvo e εyd = fyd/Es + 2‰). A NBR 6118:2023 não
 *  distingue classes; lá o campo não entra no cálculo. */
export type ClasseAco = "A" | "B";

export interface Materiais {
  /** Resistência característica do concreto, MPa. */
  fck: number;
  aco: Aco;
  acoEstribo: Aco;
  /** Só a NB-1/78 usa (diagrama do aço classe B; V1 CcaAcoClasse%). */
  classeAco: ClasseAco;
  caa: Caa;
  /** Cobrimentos nominais, cm. */
  cobrimentoLaje: number;
  cobrimentoViga: number;
  cobrimentoPilar: number;
}

/** Bordos de uma laje retangular, no sentido da planta (x para a direita, y para cima). */
export type Bordo = "esquerdo" | "inferior" | "direito" | "superior";
export const BORDOS: readonly Bordo[] = ["esquerdo", "inferior", "direito", "superior"];
export type Vinculo = "engastado" | "apoiado" | "livre";

export interface Laje {
  id: string;
  nome: string;
  /** Canto inferior esquerdo e dimensões, m (eixos das vigas). */
  x: number;
  y: number;
  lx: number;
  ly: number;
  /** Espessura, cm. */
  h: number;
  /** Cargas além do peso próprio, kN/m². */
  revestimento: number;
  sobrecarga: number;
  /** Vínculo forçado por bordo; ausente = detectado pela vizinhança. */
  vinculos: Partial<Record<Bordo, Vinculo>>;
  /** Relação de ortotropia μ = my/mx das lajes armadas em cruz (charneiras plásticas,
   *  NB-1/78; V1 LcMu#). 1 = isótropa. A NBR 6118:2023 (tabelas elásticas) não usa. */
  mu: number;
}

export interface Viga {
  id: string;
  nome: string;
  /** Eixo horizontal ou vertical, m. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Seção, cm. */
  bw: number;
  h: number;
  /** Carga linear adicional (parede etc.), kN/m. */
  cargaLinear: number;
  /** Peso próprio digitado, kN/m. Ausente = bw·h·peso específico do concreto. O
   *  SISTRUT usa o peso que o usuário digita no LAJEGEOM (predominante e exceções,
   *  LAJEMONT.BAS:4110-4160), não o da seção. */
  pesoProprio?: number;
}

/** Ponto da planta, m. */
export interface Ponto {
  x: number;
  y: number;
}

export interface Pilar {
  id: string;
  nome: string;
  /** Centro, m. */
  x: number;
  y: number;
  /** Seção, cm: b na direção x, h na direção y. */
  b: number;
  h: number;
  // Campos só da NB-1/78 pelo SISTRUT (PILGEEDI/PILAREDI/PILAR); ausentes = o padrão
  // do original. O pilar de um pavimento é o lance que vai do nível de baixo até o
  // nível do pavimento. Ver docs/MODO-CALCULO.md, "Pilares".
  /** Seção circular ou poligonal (PILDADOS). Ausente = retângulo b × h. b e h ficam
   *  como a caixa da seção, para a planta e para o fluxo da V2. */
  secao?: SecaoNaoRetangular;
  /** Vínculo na base do lance (A_130a do PILGEEDI). Ausente = continuidade. */
  vinculos?: VinculosPilar;
  /** Vínculo no topo; só vale no último lance da coluna (nos outros, o topo de um
   *  lance é a base do de cima). Ausente = continuidade. */
  vinculosTopo?: VinculosPilar;
  /** Excentricidade desta seção em relação à do lance de baixo, cm (A_1338(s, 4|5)).
   *  Só entra onde a seção muda. */
  excentricidade?: { x: number; y: number };
  /** Vento do lance (A_12dc): normal, kN, e até dois momentos, kN·m, com o ângulo em
   *  graus (0 = direção x). */
  vento?: VentoPilar;
  /** Carga no topo do lance além da que vem das vigas do pavimento: a "Normal +
   *  Momento" do PILGEEDI (A_1280), ou a de um .REP de outra obra. Soma com o .REP. */
  cargaTopo?: CargaTopoPilar;
  /** PILAR opção 6: verificações da seção do lance com a armadura dada. */
  verificacoes?: VerificacaoPilarObra[];
}

/** Ponto de uma seção de pilar, cm. */
export interface PontoSecao {
  x: number;
  y: number;
}

/** Seção de pilar não retangular, cm: circular (com vazado, dInterno = 0 sem
 *  vazado) ou poligonal (vértices sem repetir o primeiro, sentido horário). */
export type SecaoNaoRetangular =
  | { tipo: "circular"; d: number; dInterno: number }
  | { tipo: "poligonal"; vertices: PontoSecao[] };

/** Vínculo de pilar num nível, a linha/coluna da matriz de flambagem do .PIP
 *  (PILAREDI.BAS:1877). */
export type VinculoPilar = "engaste" | "semiEngaste" | "continuidade" | "livre";
export const VINCULOS_PILAR: readonly [VinculoPilar, ...VinculoPilar[]] = [
  "engaste",
  "semiEngaste",
  "continuidade",
  "livre",
];
export interface VinculosPilar {
  x: VinculoPilar;
  y: VinculoPilar;
}

export interface VentoPilar {
  /** kN, soma na normal do lance. */
  normal: number;
  /** kN·m e graus; no máximo dois. */
  momentos: { m: number; angulo: number }[];
}

export interface CargaTopoPilar {
  /** kN. */
  normal: number;
  /** Até quatro momentos de viga: M (kN·m, sinal como no .REP), inclinação da viga
   *  (graus), vão adjacente (m) e numerador da rigidez da viga (cm⁴, 0 = o pilar leva
   *  todo o momento). */
  momentos: { m: number; inclinacao: number; vao: number; rigidez: number }[];
}

/** Barra longitudinal na seção: posição, cm (mesma origem dos vértices; na
 *  retangular, o canto inferior esquerdo), e bitola, mm. */
export interface BarraPilarObra {
  x: number;
  y: number;
  bitola: number;
}

/** Verificação da seção do lance com armadura dada (PILAR opção 6). */
export interface VerificacaoPilarObra {
  barras: BarraPilarObra[];
  /** Esforços característicos e comprimentos de flambagem digitados: kN, kN·m, m.
   *  Ausentes = os do lance calculado (Nk, Mk do caso "e" e le do PILAREDI). */
  esforcos?: { nk: number; mxk: number; myk: number; lex: number; ley: number };
}

export interface Pavimento {
  id: string;
  nome: string;
  /** Pé-direito (piso a piso), m. */
  peDireito: number;
  /** Quantas vezes este pavimento se repete (pavimento-tipo); 1 = único. */
  repeticoes: number;
  lajes: Laje[];
  vigas: Viga[];
  pilares: Pilar[];
  /** Posições (m) de pilares gerados que o usuário apagou: gerarEstrutura não os
   *  recria e a viga passa contínua sobre o ponto. Desenhar um pilar ali tira a posição. */
  pilaresRemovidos: Ponto[];
}

/** Modo de cálculo da obra nos pontos em que o SISTRUT de 1991 erra (a V1 reproduz
 *  o erro): "corrigido" (padrão) calcula certo; "original" reproduz o SISTRUT.
 *  O que cada modo faz, item por item, está em docs/MODO-CALCULO.md. */
export type ModoCalculo = "corrigido" | "original";

export interface Obra {
  versao: 3;
  nome: string;
  norma: NormaId;
  /** Arquivo sem o campo (obra anterior ao switch) é lido como "corrigido". */
  modoCalculo: ModoCalculo;
  /** NB-1/78: roda a otimização dos negativos das lajes (LAJECALC opção 6, um passo
   *  que o usuário do original escolhe rodar). Ausente = roda. */
  otimizaNegativos?: boolean;
  materiais: Materiais;
  /** Do topo (cobertura) para a base. */
  pavimentos: Pavimento[];
  /** NB-1/78: PILAR.INI, .PIP e predimensionamento dos pilares. Ausente = os de
   *  fábrica ("SISTRUT") e sem predimensionamento. */
  parametrosPilar?: ParametrosPilarObra;
}

/** Parâmetros dos pilares que o usuário do SISTRUT edita. Cada campo ausente vale o
 *  de fábrica (`sistrut/base/parametros.ts`); um campo presente vale nos dois modos. */
export interface ParametrosPilarObra {
  ini?: Partial<IniPilar>;
  pip?: Partial<PipPilar>;
  /** Predimensionamento (PILAREDI 3.1) de cada coluna desde a fundação: "tensoes" =
   *  só as tensões com a seção da obra (B e H digitados); "secao" = o quadrado que o
   *  PILAREDI escolhe passa a ser a seção da coluna. Ausente = não roda. */
  predimensionamento?: "tensoes" | "secao";
}

/** PILAR.INI (PILAR.BAS:566-588). fck e fyk em MPa (no original vão como MPa/100 =
 *  t/cm², a convenção de `materiais.fck`); ausentes = os de `obra.materiais`. */
export interface IniPilar {
  maximoBarras: number;
  coeficienteMedida: number;
  coeficienteForca: number;
  coeficienteTensao: number;
  fck: number;
  fyk: number;
  classeAco: ClasseAco;
  /** 13 bitolas, mm, e áreas, cm². */
  bitolas: { bitola: number; area: number }[];
  multiplicadorEc: number;
  /** cm. */
  excentricidadeMinima: number;
  verificaH30: boolean;
  excentricidades: "isoladas" | "simultaneas";
  secoesSimetricas: boolean;
  lambda2aOrdem: number;
  lambdaFluencia: number;
  lambdaProcessoExato: number;
  coeficienteFluencia: number;
  fatorNkFluencia: number;
  fatorCargaFluencia: number;
  gamaF: number;
  gamaC: number;
  gamaS: number;
}

/** .PIP do PILAREDI (PILAREDI.BAS:1834-1890). Densidade em kN/m³; o resto como no
 *  arquivo (cm, mm, cm², %, multiplicadores de fck). */
export interface PipPilar {
  tensaoAdmissivelNormal: number;
  tensaoAdmissivelFlexao: number;
  taxaIdealPredimensionamento: number;
  cobrimento: number;
  reduzAcidentalFundacao: boolean;
  reduzAcidentalDimensionamento: boolean;
  pesoProprio: boolean;
  densidade: number;
  porcentagemAcidental: number;
  multiploMedida: number;
  medidaMinima: number;
  taxaMinimaCalculada: number;
  taxaMinimaReal: number;
  taxaMaxima: number;
  traspasseNaTaxa: boolean;
  misturaBitolas: boolean;
  ordemBitolaMinima: number;
  /** 13 linhas: bitola mm, área cm², espaçamento mínimo e 4ª coluna, cm. */
  bitolas: { bitola: number; area: number; espacamentoMinimo: number; coluna4: number }[];
  /** 4 × 4, índices na ordem de VINCULOS_PILAR (inferior × superior). */
  coeficienteFlambagem: number[][];
  /** 13 linhas, uma por bitola longitudinal: estribo mm e espaçamento cm (0 = sem). */
  estriboPorBitola: { bitola: number; espacamento: number }[];
}

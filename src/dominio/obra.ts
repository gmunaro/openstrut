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
   *  NB-1/78; V1 LcMu#). 1 = isótropa. A NBR 6118:2023 (tabelas elásticas) não usa.
   *  No SISTRUT, 1 = não informado: pelas cordas na maciça, 0 na comum não calculada
   *  (o LAJECALC 2 só calcula o da maciça); na pré-moldada não entra. */
  mu: number;
  // ---- SISTRUT (NB-1/78): entradas do LAJEGEOM e do LAJECALC 2. Ausentes = laje
  // retangular, maciça, armadura principal em x. Ver docs/MODO-CALCULO.md.
  /** Polígono da laje, m, em sentido HORÁRIO: lado k = vértice k → k+1, e o último
   *  fecha no primeiro. O LAJEGEOM só aceita o horário (descarta o polígono com
   *  Σ(x_k + x_k+1)(y_k − y_k+1)/2 ≤ 0, LAJEGEOM.BAS:3107-3113). A ordem numera os
   *  lados (o LAJEPROC depende dela, defeito R2). O caminho do SISTRUT usa o polígono
   *  como está, sem acrescentar os cantos das vizinhas. Com polígono, x, y, lx e ly são
   *  o retângulo envolvente dele (o arquivo os recalcula), que a tela e o fluxo da
   *  NBR 6118 continuam usando. */
  poligono?: Ponto[];
  /** Vínculo forçado por lado do `poligono` (mesmo índice); null ou ausente = pela
   *  vizinhança. Com polígono, vale no lugar de `vinculos`. */
  vinculosLados?: (Vinculo | null)[];
  /** Ângulo da armadura principal, graus, 0 ≤ a < 180 (LAJECALC 2, A_1210(·,0));
   *  ausente = 0 na maciça e, na comum não calculada, o −1 que o LAJECALC 2 grava sem
   *  <D>ireção. Pré-moldada: inclinação das nervuras (A_10cc(·,5), LAJEGEOM.BAS:3532),
   *  ausente = 0. */
  anguloArmadura?: number;
  /** Tipo da laje no LAJEGEOM (A_10cc(·,1), LAJEGEOM.BAS:3490). Ausente = maciça. */
  tipo?: TipoLaje;
  /** Positivas impostas no LAJEPROC (A_12fc(·,2..3) negativos, LAJEPROC.BAS:451-456):
   *  ficam se bastam. */
  armaduraImposta?: { principal?: BarraImposta; secundaria?: BarraImposta };
  /** Negativa imposta no LAJECALC na continuidade de cada lado do `poligono`
   *  (A_11e0(c,4) positivo, CINT(1000·índice da bitola + espaçamento), LAJECALC.BAS:4166):
   *  a otimização reduz a relação Mneg/Mpos até ela bastar e o LAJEPROC só a confere. O
   *  espaçamento entra inteiro (CINT). null = nenhuma. O código negativo que o LAJEPROC
   *  grava ali é a escolha automática dele, refeita a cada rodada (LAJEPROC.BAS:892). */
  negativasImpostas?: (BarraImposta | null)[];
}

/** Barra de laje: bitola, mm, e espaçamento, cm. */
export interface BarraImposta {
  bitola: number;
  espacamento: number;
}

/** "macica" (0); "pre-moldada" (1): o LAJECALC não calcula, e a montagem leva a carga
 *  às vigas na direção das nervuras; "comum-nao-calculada" (3): "laje comum não
 *  calculada" do LAJEGEOM, que o LAJECALC calcula e o LAJEPROC não arma. */
export type TipoLaje = "macica" | "pre-moldada" | "comum-nao-calculada";

/** Carga de ocupação por área do LAJEGEOM 3 (A_1014): polígono próprio, m, e cargas,
 *  kN/m². Soma-se onde os polígonos se sobrepõem. */
export interface CargaOcupacao {
  poligono: Ponto[];
  /** Carga total e a parcela acidental dela, kN/m². */
  total: number;
  acidental: number;
}

/** Alvenaria do LAJEGEOM 3 (A_0fe6) em qualquer posição da planta: sobre uma viga vai
 *  para a viga, sobre a laje é distribuída pela montagem. Trecho em m, carga em kN/m. */
export interface Alvenaria {
  inicio: Ponto;
  fim: Ponto;
  carga: number;
}

/** Parâmetros do .LAP (LAJE 7 e LAJECALC 7) que a obra muda; cada campo ausente vale o
 *  de fábrica ("SISTRUT", `PARAMETROS_LAJE` em calculo/sistrut/base/parametros.ts, com
 *  os mesmos nomes). Unidades do .LAP: cm e frações. fck, fyk, classe do aço,
 *  cobrimento e densidade vêm de `Obra.materiais` e do modo de cálculo, não daqui. As
 *  tabelas indexadas têm o tamanho da de fábrica. */
export interface ParametrosLajeObra {
  /** γf, γc, γs das lajes. */
  gamaF?: number;
  gamaC?: number;
  gamaS?: number;
  /** Acréscimo ao cobrimento para a altura útil, cm. */
  acrescimo?: number;
  /** As 10 bitolas (mm) e áreas (cm²); área 0 desativa a bitola. */
  bitolas?: { bitola: number; area: number }[];
  /** As 15 linhas da relação de vãos → μ. */
  relacaoMu?: { relacao: number; mu: number }[];
  /** Faixa da espessura mínima, cm. */
  hMin?: number;
  hMax?: number;
  /** As 4 linhas de espaçamento mínimo por H, cm. */
  espacamentoMinimoPorH?: { hAte: number; espacamento: number }[];
  espacamentoMaximo?: number;
  /** Espaçamentos, cm (o índice entra no código da barra). */
  espacamentos?: number[];
  /** As 6 linhas de bitola preferencial por H (índice em `bitolas`). */
  bitolaPorH?: { hAte: number; indiceBitola: number }[];
  taxaMinimaPositiva?: number;
  taxaMinimaNegativa?: number;
  limitaEspacamento2H?: boolean;
  fracaoLinhaNeutra?: number;
  flecha?: {
    lfTotal: number;
    lfAcidental: number;
    multiplicadorEc: number;
    deformacaoLenta: boolean;
  };
  /** Relação Mneg/Mpos mínima (piso da otimização) e máxima (i da continuidade). */
  relacaoNegPosMin?: number;
  relacaoNegPosMax?: number;
  relacaoCantosReentrantes?: number;
  eficienciaNegativa?: number;
  /** Tolerâncias geométricas: comprimento, m, e ângulo. */
  toleranciaComprimento?: number;
  toleranciaAngulo?: number;
}

/** Trecho de um pilar-parede no LAJEGEOM (A_1156: x1, y1, x2, y2). O pilar da V2 fica
 *  no centro com a seção b × h; a montagem do SISTRUT usa o trecho (bordo de laje e
 *  alvenaria sobre o pilar-parede). */
export interface TrechoPilar {
  pilar: string;
  inicio: Ponto;
  fim: Ponto;
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
  /** SISTRUT (NB-1/78): cargas de ocupação com polígono próprio, além da sobrecarga de
   *  cada laje. Ausente = nenhuma. */
  cargasOcupacao?: CargaOcupacao[];
  /** SISTRUT (NB-1/78): alvenarias em qualquer posição, além da carga linear de cada
   *  viga. Ausente = nenhuma. */
  alvenarias?: Alvenaria[];
  /** SISTRUT (NB-1/78): trechos dos pilares-parede (id do pilar). Ausente = todos
   *  pontuais. */
  trechosPilares?: TrechoPilar[];
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
  /** NB-1/78: parâmetros do .LAP editados (ex.: piso Mneg/Mpos 0,35 do v2par_laje_r3).
   *  Ausente = os de fábrica. */
  parametrosLaje?: ParametrosLajeObra;
  materiais: Materiais;
  /** Do topo (cobertura) para a base. */
  pavimentos: Pavimento[];
}

// Contrato do motor de cálculo. Unidades: m (vãos, comprimentos), cm (seções,
// cobrimentos, flechas, espaçamentos), mm (bitolas), kN, kN/m, kN/m², kN·m,
// kN·m/m (lajes), MPa (tensões), cm² e cm²/m (armaduras).
import type { Aco, Bordo, ClasseAco, Materiais, NormaId, Vinculo } from "../dominio/obra";

/** Uma etapa da memória de cálculo. `ref` = item da norma ou fonte. */
export interface Etapa {
  descricao: string;
  formula?: string;
  valor?: number;
  unidade?: string;
  ref?: string;
}

export interface ComMemoria {
  /** Situações fora dos limites da norma ou que pedem atenção; nunca escondidas. */
  avisos: string[];
  memoria: Etapa[];
}

/** Valores de cálculo derivados dos materiais pela norma. */
export interface MateriaisCalc {
  fck: number;
  fcd: number;
  /** Tensão de cálculo do bloco de compressão (ex.: 0,85 fcd), MPa. */
  sigmaCd: number;
  fyk: number;
  fyd: number;
  fywd: number;
  /** Módulos de elasticidade, MPa. */
  ecs: number;
  es: number;
  aco: Aco;
  acoEstribo: Aco;
  /** Classe do aço longitudinal (NB-1/78: diagrama e x/d limite da classe B).
   *  Ausente = A. A NBR 6118:2023 não tem classes e ignora o campo. */
  classeAco?: ClasseAco;
}

export interface Barra {
  /** Bitola, mm. */
  phi: number;
  /** Espaçamento, cm (lajes, estribos). */
  espacamento: number;
}

export interface BarrasLongitudinais {
  n: number;
  /** mm */
  phi: number;
  /** Área efetiva, cm². */
  area: number;
}

/** Barras longitudinais do pilar com a distribuição nas faces que o cálculo
 *  verificou; o detalhamento (grampos, 18.2.4) usa a mesma. Cantos contam nas
 *  duas faces: n = 2·porFaceX + 2·porFaceY − 4. Sem solução: n = 0 e 0 por face. */
export interface BarrasPilar extends BarrasLongitudinais {
  /** Barras em cada face de comprimento h (perpendiculares a x; armam Mx). */
  porFaceX: number;
  /** Barras em cada face de comprimento b (perpendiculares a y; armam My). */
  porFaceY: number;
}

// ---- lajes -----------------------------------------------------------------

export interface LajeEntrada {
  nome: string;
  /** Vãos teóricos, m (lx na direção x da planta). */
  lx: number;
  ly: number;
  /** Espessura, cm. */
  h: number;
  /** Cargas de serviço, kN/m²: g inclui peso próprio. */
  g: number;
  q: number;
  vinculos: Record<Bordo, Vinculo>;
  /** Relação de ortotropia μ = my/mx (charneiras, NB-1/78). Ausente = 1 (isótropa).
   *  A NBR 6118:2023 (tabelas elásticas) ignora o campo. */
  mu?: number;
}

export interface LajeEsforcos extends ComMemoria {
  /** Momentos positivos característicos (de serviço, sem γf), kN·m/m.
   *  mx arma na direção x; my na direção y. */
  mx: number;
  my: number;
  /** Momento negativo característico por bordo, kN·m/m (magnitude ≥ 0; 0 se não engastado). */
  negativos: Record<Bordo, number>;
  /** Reação característica distribuída na viga de cada bordo, kN/m (0 se livre). */
  reacoes: Record<Bordo, number>;
  /** Flecha total (imediata + diferida) e limite, cm. */
  flecha: number;
  flechaLimite: number;
}

export interface LajeArmadura extends ComMemoria {
  /** cm²/m */
  asx: number;
  asy: number;
  asNegativos: Record<Bordo, number>;
  barrasX: Barra;
  barrasY: Barra;
  barrasNegativos: Partial<Record<Bordo, Barra>>;
}

// ---- vigas -------------------------------------------------------------------

export interface FlexaoResultado extends ComMemoria {
  /** Armadura tracionada e comprimida, cm². */
  as: number;
  asComprimida: number;
  /** Posição relativa da linha neutra x/d. */
  xd: number;
}

export interface CortanteResultado extends ComMemoria {
  /** Armadura transversal, cm²/m (já respeitando a mínima). */
  asw: number;
  /** Esmagamento da biela verificado. */
  bielaOk: boolean;
  /** Espaçamento máximo dos estribos pela norma, cm (ex.: 6118 18.3.3.2). */
  sMax: number;
}

// ---- pilares -----------------------------------------------------------------

export interface PilarEntrada {
  nome: string;
  /** Seção, cm: b na direção x, h na direção y. */
  b: number;
  h: number;
  /** Comprimentos de flambagem, m. */
  lex: number;
  ley: number;
  /** Força normal característica (compressão > 0), kN. */
  nk: number;
  /** Momentos característicos de 1ª ordem no topo e na base, kN·m. Sinal = face
   *  tracionada: M > 0 traciona a face de coordenada maior na direção do momento
   *  (+x para Mx, +y para My). Topo e base com o mesmo sinal = curvatura simples;
   *  sinais opostos = curvatura dupla (docs/LIGACAO-VIGA-PILAR.md). */
  mxTopo: number;
  mxBase: number;
  myTopo: number;
  myBase: number;
}

export interface PilarResultado extends ComMemoria {
  nd: number;
  lambdaX: number;
  lambdaY: number;
  /** Momentos totais de cálculo na seção crítica (1ª + mínimos + 2ª ordem), kN·m. */
  mdX: number;
  mdY: number;
  /** NB-1/78 pelo SISTRUT: o maior momento CARACTERÍSTICO atuante dos casos do PILAREDI
   *  (Mk com ea, o "Mx/My" impresso), kN·m; mdX/mdY = γf × estes. Ausente na 6118. */
  mkX?: number;
  mkY?: number;
  /** Armadura longitudinal total necessária e adotada. */
  asNecessaria: number;
  barras: BarrasPilar;
  estribo: Barra;
  /** Taxa geométrica adotada, %. */
  taxa: number;
}

// ---- norma -------------------------------------------------------------------

/** Tudo o que muda de uma norma para outra. A mecânica (viga contínua,
 *  áreas de influência, acumulação de cargas) é comum e fica fora daqui. */
export interface Norma {
  id: NormaId;
  nome: string;
  /** "sistrut": `calcularObra` usa o caminho do SISTRUT 4.0 (sistrut/obra.ts), nos dois
   *  modos da obra, e os métodos por elemento abaixo não entram no cálculo da obra.
   *  "v2": o fluxo da V2 com os métodos desta norma. */
  caminho: "sistrut" | "v2";
  /** Coeficientes de ponderação das ações no ELU. */
  gamaG: number;
  gamaQ: number;
  /** Peso específico do concreto armado, kN/m³. */
  pesoConcreto: number;
  /** Considera a ligação viga-pilar nos apoios extremos (6118 14.6.6.1 c):
   *  negativo de extremidade nas vigas e momentos de 1ª ordem nos pilares
   *  (vigas/ligacaoPilar.ts). A V1 (NB-1/78) não fazia: false mantém a paridade. */
  ligacaoVigaPilar: boolean;
  /** Na compatibilização, refaz como apoiado o bordo de laje cujo negativo caiu
   *  abaixo de LIMITE_ALIVIO do próprio (laje ao lado de balanço curto;
   *  lajes/compatibilizacao.ts). A V1 (NB-1/78) não fazia: false mantém a paridade. */
  recalculaBordoAliviado: boolean;
  materiais(m: Materiais): MateriaisCalc;
  /** Avisos dos materiais da obra fora do que a norma admite (ex.: fck abaixo da
   *  classe mínima). Ausente = nenhum. */
  avisosMateriais?(m: Materiais): string[];

  lajeEsforcos(e: LajeEntrada, mat: MateriaisCalc): LajeEsforcos;
  /** Momento negativo único no bordo comum de duas lajes (características). */
  compatibilizaNegativo(xa: number, xb: number): number;
  /** Armaduras a partir dos esforços já compatibilizados. */
  lajeArmadura(
    e: LajeEntrada,
    esf: LajeEsforcos,
    mat: MateriaisCalc,
    cobrimento: number,
  ): LajeArmadura;

  /** Md em kN·m (cálculo), seção bw x h em cm, d em cm. */
  vigaFlexao(md: number, bw: number, h: number, d: number, mat: MateriaisCalc): FlexaoResultado;
  /** Vd em kN (cálculo); asl = armadura longitudinal tracionada, cm². */
  vigaCortante(
    vd: number,
    bw: number,
    d: number,
    asl: number,
    mat: MateriaisCalc,
  ): CortanteResultado;

  /** dLinha = distância da face ao centro da barra longitudinal, cm (o fluxo
   *  usa cobrimento nominal + estribo + φ/2). */
  pilar(e: PilarEntrada, mat: MateriaisCalc, dLinha: number): PilarResultado;
}

// ---- pilares pela NB-1/78 (SISTRUT): verificação e predimensionamento em SI ----

/** PILAR opção 6 de uma `Pilar.verificacoes` (fluxoSistrut.ts), em SI: kN e kN·m.
 *  O completo, nas unidades do original, está em `ResultadoSistrut.verificacoes`. */
export interface VerificacaoPilarResultado {
  /** Índice em `Pilar.verificacoes`. */
  indice: number;
  /** true = esforços do lance calculado; false = os digitados. */
  esforcosDoLance: boolean;
  nk: number;
  /** Ausentes quando a verificação não concluiu (ver `avisos`). */
  lambdaX?: number;
  lambdaY?: number;
  situacao?: string;
  /** Um por caso de excentricidade acidental: atuante (com ea) e resistente reduzido
   *  da 2ª ordem; veredito como o PILAR imprime; `erro` onde o original trava (D-2)
   *  ou divide por zero (D-3). */
  casos: {
    rotulo: string;
    mx: number;
    my: number;
    mTotal: number;
    mrX: number;
    mrY: number;
    mrTotal: number;
    veredito: string;
    erro?: string;
  }[];
  avisos: string[];
}

/** Predimensionamento da coluna (PILAREDI 3.1), em SI: cm, MPa e kN. */
export interface PredimensionamentoPilarResultado {
  modo: "tensoes" | "secao";
  /** Lado do quadrado escolhido, cm; ausente com a seção da obra. */
  lado?: number;
  /** Ausentes quando o predimensionamento não concluiu (ver `avisos`). */
  tensoes?: {
    normal: number;
    normalAdmissivel: number;
    flexao: number;
    flexaoAdmissivel: number;
  };
  /** "CARGA" da tela, kN; ausente quando não concluiu. */
  carga?: number;
  avisos: string[];
}

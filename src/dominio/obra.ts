// Modelo da obra: o que o usuário desenha e edita, e o que vai para o
// arquivo .openstrut.json. Geometria da planta em metros; seções em cm;
// cargas em kN/m² (lajes) e kN/m (vigas).
import type { PARAMETROS_DSP, PARAMETROS_VIGA } from "../calculo/sistrut/base/parametros";

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
  // ---- Entrada do VIGA e do DESENHO do SISTRUT (NB-1/78). Trechos e apoios na ordem
  // do eixo crescente (x na viga horizontal, y na vertical), como o .VIG: trecho 0 é o
  // primeiro (o balanço esquerdo, se houver), apoio 0 é o primeiro apoio. Só o caminho
  // do SISTRUT (sistrut/obra.ts) lê estes campos.
  /** Cargas da própria viga (o que o usuário digita no VIGA), além das que a montagem
   *  leva. */
  cargas?: CargaViga[];
  /** true: a montagem não leva carga a esta viga (lajes, peso próprio, carga linear); a
   *  viga tem só `cargas` e a reação das vigas apoiadas nela. É o .VIG digitado no VIGA. */
  somenteCargasProprias?: boolean;
  /** Vão de cálculo de cada trecho, m, como digitado no VIGA. Ausente = a distância entre
   *  os nós da planta. Precisa bater com a planta a menos de 5 mm. */
  vaos?: number[];
  /** Inércia relativa J de cada trecho (VIGA). Ausente = a da montagem, que grava a marca
   *  do pilar, 1 + número/100000 (LAJEMONT.BAS:4125-4132). */
  inercias?: number[];
  /** Engaste perfeito nas pontas (Ee/Ed do VIGA). Ausente = o da montagem (pilar-parede). */
  engaste?: { esquerdo: boolean; direito: boolean };
  /** Momentos externos nos apoios extremos, kN·m (VIGA; só entram com
   *  `ParametrosVigaObra.viga.momentosExternos`). */
  momentosExternos?: { esquerdo: number; direito: number };
  /** Apoios cuja reação não vai a pilar nenhum (o "*" no número do pilar, VIGA opção 7). */
  apoiosDesconsiderados?: number[];
  /** Seção de cada trecho e de cada apoio no DESENHO (.SEC). Ausente = bw × h. */
  secoes?: { trechos?: SecaoTrechoViga[]; apoios?: SecaoApoioViga[] };
  /** Dados de forma do DESENHO (.FOR) que substituem os tirados da planta. */
  forma?: { trechos?: FormaTrechoViga[]; apoios?: FormaApoioViga[] };
}

/** Carga da viga num trecho: distribuída (kN/m) entre `inicio` e `fim` ou concentrada
 *  (kN) em `posicao`, em m a partir da ponta esquerda do trecho. `total` inclui a
 *  `acidental`; sem `acidental`, a parte acidental é a gerada pelo % do VIGA.INI
 *  (acidental "G") ou zero. São o P/Pac e o F/Fac das divisões do .VIG. */
export type CargaViga =
  | {
      tipo: "distribuida";
      trecho: number;
      inicio: number;
      fim: number;
      total: number;
      acidental?: number;
    }
  | { tipo: "concentrada"; trecho: number; posicao: number; total: number; acidental?: number };

/** Seção de viga num trecho, cm: alma bw × h e mesa bf × hf (0 = retangular). */
export interface SecaoTrechoViga {
  bw: number;
  h: number;
  bf: number;
  hf: number;
}
/** Seção de viga num apoio, cm. */
export interface SecaoApoioViga {
  bw: number;
  h: number;
}
/** Forma de um trecho (.FOR), cm: vão livre, rebaixo e espessura da laje de cada lado,
 *  eixo e alinhamento. Campo ausente = o da planta. */
export interface FormaTrechoViga {
  vaoLivre?: number;
  pe?: number;
  hle?: number;
  pd?: number;
  hld?: number;
  eixo?: number;
  alinhamento?: number;
}
/** Forma de um apoio (.FOR): largura na direção da viga (cm), tipo (P pilar, V viga, O
 *  outro, A apoio), título, código e LPs/Dis (cm). Campo ausente = o da planta. */
export interface FormaApoioViga {
  largura?: number;
  tipo?: "P" | "V" | "O" | "A";
  titulo?: string;
  codigo?: number;
  lps?: number;
  dis?: number;
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
  /** NB-1/78 pelo SISTRUT: parâmetros do VIGA.INI e do .DSP desta obra. Ausente (ou campo
   *  ausente) = o valor de fábrica (sistrut/base/parametros.ts). */
  parametrosViga?: ParametrosVigaObra;
}

/** VIGA.INI e .DSP editados: cada campo presente substitui o de fábrica inteiro (uma
 *  tabela vem inteira). Unidades do original (t/cm², cm, %). No modo corrigido, o fck,
 *  o fyk, a classe do aço e o cobrimento do .DSP não entram: valem os da obra. */
export interface ParametrosVigaObra {
  viga?: Partial<typeof PARAMETROS_VIGA>;
  dsp?: Partial<typeof PARAMETROS_DSP>;
}

// Ponto de extensão da vista 3D: "camadas" que acrescentam objetos, painel e
// comportamento à vista sem editar o núcleo (cena.ts, Vista3D.tsx). Cada camada é
// carregada sob demanda (import dinâmico) ao ser ligada na barra. O corte por pavimento
// é uma camada (camadas/corte.tsx). Contrato e exemplo em docs/VISTA-3D.md.
import type { ComponentType } from "react";
import type {
  Box3,
  Light,
  Material,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PosicaoGeometria } from "../../dominio/armaduraGeometria";
import type { Obra } from "../../dominio/obra";
import type {
  DetalhamentoLajeObra,
  DetalhamentoObra,
  DetalhamentoPilarObra,
  DetalhamentoVigaObra,
} from "../detalhamento";
import type { Calculo } from "../calculo";
import type { DadosElemento } from "./dados";
import type { Elemento3D, Modelo3D } from "./modelo";

/** Detalhamento de armadura de uma peça (o mesmo das abas Resultados e Relatório e do
 *  DXF de armação). Discrimine por `tipo` antes de ler o resto. Viga e escada: o da
 *  viga (`viga.detalhamento.posicoes`), igual em todas as repetições do pavimento. Laje:
 *  o da laje (`laje.detalhamento.posicoes`). Pilar e fundação: o do grupo de lances do
 *  pilar, com `lance` = índice deste lance em `pilar.lances` (0 = o de baixo), que é o
 *  `tramo` das posições (as deste lance: `pilar.detalhamento.posicoes.filter((p) =>
 *  p.tramo === lance)`); `niveis[i]` = o índice em `modelo.niveis` do lance i; e
 *  `cotaBase` = a cota do piso do lance de baixo, m, a origem das cotas `xInicio` e
 *  `xFim` (cm) das posições do pilar. */
export type DetalhamentoElemento =
  | { tipo: "viga"; viga: DetalhamentoVigaObra }
  | { tipo: "laje"; laje: DetalhamentoLajeObra }
  | {
      tipo: "pilar";
      pilar: DetalhamentoPilarObra;
      lance: number;
      niveis: number[];
      cotaBase: number;
    };

/** Uma posição de armadura da peça na cena: os dados da posição (nome, tipo, bitola em
 *  mm, aço, comprimento em cm) e cada barra como polilinha em coordenadas da cena, m,
 *  com o explodido desenhado agora. O estribo é uma polilinha aberta (termina 2φ antes
 *  do início). Calculado por dominio/armaduraGeometria.ts, o mesmo do exportador IFC. */
export interface ArmaduraNaCena extends Omit<PosicaoGeometria, "forma" | "copias"> {
  barras: Vector3[][];
}

/** Como uma peça aparece pelo foco e pela visibilidade por tipo e pavimento: sólida,
 *  transparente (contexto) ou oculta. Filtros e planos de corte não entram aqui. */
export type Exibicao = "solido" | "fantasma" | "oculto";

/** Papel de cada material do núcleo; `definirMateriais` troca qualquer um deles.
 *  "solido" e "fantasma" recebem a cor por vértice (atributo `color`). */
export type PapelMaterial = "solido" | "fantasma" | "arestas" | "destaque";
export type FabricaMateriais = (papel: PapelMaterial) => Material;

export type EventoVista =
  /** Seleção mudou (ctx.selecao). */
  | "selecao"
  /** A geometria foi refeita (modelo, cores, foco, tipos ou pavimentos ocultos, materiais).
   *  Os filtros (`definirFiltro`) não refazem a geometria nem emitem este evento. */
  | "cena"
  /** A câmera mexeu (órbita, vista, animação). */
  | "camera"
  /** Os níveis se moveram no explodido: a cada quadro da animação e no fim. */
  | "explodido"
  /** O que aparece pode ter mudado (`estaVisivel`): um filtro ou plano de corte de
   *  qualquer camada, ou, depois de "cena", o foco, os tipos e os pavimentos ocultos. Não
   *  refaz a geometria. A fonte da mudança não é avisada (ver `aoMudar`). */
  | "visibilidade"
  /** As legendas das camadas mudaram (`definirLegenda`). */
  | "legenda";

/** Legenda de uma camada, mostrada na legenda da vista. Com `substitui`, esconde a
 *  legenda da vista (situação ou grandeza): use quando a camada repinta todas as peças. */
export interface LegendaCamada {
  titulo: string;
  itens: { cor: string; rotulo: string }[];
  substitui?: boolean;
}

/** Fontes registradas pelas camadas, por `id` (para conferir em teste e depuração). */
export interface FontesAtivas {
  filtros: string[];
  cores: string[];
  transparencias: string[];
  materiais: string[];
  planos: string[];
  legendas: string[];
}

/** O que a vista expõe para uma camada. Objetos do three.js são os vivos: a camada pode
 *  ler e mexer, mas deve desfazer o que fez na limpeza (retorno de `ativar`).
 *  A cena tem Y para cima: X = x da planta, Y = z (cota), Z = −y da planta, em metros. */
export interface ContextoVista {
  readonly cena: Scene;
  readonly renderer: WebGLRenderer;
  /** A câmera atual (perspectiva ou ortográfica, conforme a vista). */
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly controles: OrbitControls;
  /** Níveis de baixo para cima (`modelo.niveis[i].indice === i`), elementos, colunas e
   *  eixos. `Elemento3D.nivel` é o índice do nível; fundação e escada sem posição ficam
   *  no nível 0. Troca quando a obra muda (evento "cena"). */
  readonly modelo: Modelo3D;
  readonly obra: Obra;
  readonly calculo: Calculo;
  /** Dados do cálculo por chave de elemento (situação, resultado principal). */
  readonly dados: ReadonlyMap<string, DadosElemento>;
  /** Detalhamento de armadura da obra calculada; null sem cálculo. */
  readonly detalhamento: DetalhamentoObra | null;
  /** Detalhamento da peça; undefined sem cálculo, para peça sem detalhamento (viga que
   *  não foi calculada ou parou no "Continuo… S/N" do original) e para o lance visual da
   *  escada. Unidades das posições: cm e mm (bitolas). */
  detalhamentoDe(chave: string): DetalhamentoElemento | undefined;
  /** Ponto da cena no eixo da face de cima da viga (ou da viga da escada) na abscissa
   *  `xCm` das posições do detalhamento (cm a partir do primeiro nó), com o explodido
   *  desenhado agora. A abscissa é proporcional entre o primeiro e o último nó, o que
   *  vale também para a viga inclinada da escada. Undefined se a peça não é viga. */
  pontoDaViga(chave: string, xCm: number): Vector3 | undefined;
  /** As barras e os estribos calculados da peça, prontos para desenhar: viga e viga da
   *  escada (todas as posições, menos grampos) ou o lance do pilar (longitudinais com o
   *  traspasse e estribos da região estribada). Undefined quando `detalhamentoDe` é
   *  undefined e para laje e fundação. Lista vazia para seção poligonal ou T de pilar. A
   *  regra de posição (cobrimento, estribo, distribuição) está em
   *  dominio/armaduraGeometria.ts. Para a coluna inteira, chame para cada lance de
   *  `modelo.colunas`. */
  barrasDe(chave: string, opcoes?: { semExplodido?: boolean }): ArmaduraNaCena[] | undefined;
  /** Cor com que a peça está desenhada agora (situação, grandeza ou a de uma camada), CSS. */
  corDe(chave: string): string | undefined;
  /** Os `id` das fontes registradas pelas camadas (filtros, cores, transparências,
   *  materiais, planos de corte e legendas). */
  fontesAtivas(): FontesAtivas;
  /** As luzes da vista (céu, ambiente e sol; valores em `LUZES`). A camada pode mudar a
   *  intensidade ou a visibilidade delas e deve devolver como achou na limpeza. */
  readonly luzes: readonly Light[];
  /** Os planos de corte de todas as fontes, juntos (o pórtico, a camada de corte e os de
   *  outras camadas), como o renderer usa. */
  planosCorte(): Plane[];
  /** Desenho da camada no lugar do `renderer.render(cena, camera)` do núcleo (ex.: sessão
   *  WebXR com `renderer.setAnimationLoop`). O núcleo continua com LOD, rótulos e planos
   *  de corte; só não desenha. `null` devolve o desenho ao núcleo. */
  assumirDesenho(f: (() => void) | null): void;
  /** O modelo visível em glTF binário (.glb), como o botão "glTF (.glb)" da vista. */
  exportarGlb(): Promise<ArrayBuffer>;
  /** Legenda desta fonte (`id`) na legenda da vista; `null` remove. Avisa "legenda". */
  definirLegenda(id: string, legenda: LegendaCamada | null): void;
  /** Chave do elemento selecionado. */
  readonly selecao: string | null;
  selecionar(chave: string | null): void;
  elemento(chave: string): Elemento3D | undefined;
  /** O grupo do nível (filhos dele andam com o explodido). Índice de modelo.niveis. Os
   *  grupos são recriados a cada evento "cena": guarde o índice, não o objeto. */
  grupoDoNivel(indice: number): Object3D | undefined;
  /** Altura na cena (Y) de uma cota do nível, com o deslocamento do explodido como está
   *  desenhado agora (durante a animação, "explodido" avisa a cada quadro). */
  alturaNaCena(indiceNivel: number, cota: number): number;
  /** Ponto da planta (x, y em m, como em `Elemento3D.solidos`; z = cota) na cena, sem o
   *  explodido: devolve (x, z, −y). Não serve para converter de volta. */
  paraCena(x: number, y: number, z: number): Vector3;
  /** Caixa do modelo inteiro na cena, sem o explodido. */
  caixaNaCena(): Box3;
  /** Esfera das peças sólidas visíveis (foco e filtros), com o explodido. */
  esferaVisivel(): Sphere;
  /** Caixa das lajes, vigas e pilares do nível `indice` na cena, com o explodido como
   *  está desenhado agora. Undefined se o nível não tem peças. */
  caixaDoNivel(indice: number): Box3 | undefined;
  /** O explodido ainda está animando: o aviso de "explodido" atual não é o último. */
  readonly explodidoEmAnimacao: boolean;
  /** Caixa da peça na cena, com o explodido como está desenhado agora (topo = max.y). */
  caixaDe(chave: string): Box3 | undefined;
  /** Sólida, transparente ou oculta pelo foco e pela visibilidade por tipo e pavimento. */
  exibicao(chave: string): Exibicao;
  /** A peça aparece: não está oculta (exibicao), passa em todos os filtros e alguma parte
   *  dela fica do lado mantido de todos os planos de corte (inclusive o do pórtico e o da
   *  camada de corte). Transparente conta como visível. */
  estaVisivel(chave: string): boolean;
  /** Redesenha no próximo quadro (a vista só desenha quando algo muda). */
  pedirRender(): void;
  /** Chamado a cada quadro enquanto registrado, com o tempo desde o quadro anterior em
   *  segundos (animação, path tracing); devolve o cancelamento. Enquanto houver algum, a
   *  vista desenha todo quadro. */
  aoQuadro(f: (dtSegundos: number) => void): () => void;
  /** Avisa nos eventos da vista; devolve o cancelamento. Com `fonte` igual ao `id` que a
   *  camada usa em `definirFiltro` e `definirPlanosCorte`, ela não é avisada da própria
   *  mudança (sem laço ao reagir a "visibilidade" com um filtro). */
  aoMudar(evento: EventoVista, f: () => void, fonte?: string): () => void;
  /** Leva a câmera a `posicao` olhando para `alvo` (coordenadas da cena). Anima em 0,45 s,
   *  salvo com prefers-reduced-motion ou `animar` false. Uma chamada nova cancela a em
   *  curso, cuja Promise resolve "cancelada". */
  moverCamera(
    posicao: Vector3,
    alvo: Vector3,
    animar?: boolean,
  ): Promise<"concluida" | "cancelada">;
  /** Enquadra uma caixa ou esfera da cena (`caixaDoNivel(i)`, `caixaDe(chave)`), com a
   *  direção atual da câmera e a mesma margem do botão Enquadrar. É um `moverCamera`:
   *  anima, cancela a câmera em curso e resolve "concluida" ou "cancelada". */
  enquadrarEm(alvo: Box3 | Sphere, animar?: boolean): Promise<"concluida" | "cancelada">;
  /** Liga ou desliga a órbita, o zoom e o pan do usuário (o tour e o 4D animam a câmera).
   *  Não trava os botões de vista nem `moverCamera`. */
  travarControles(travar: boolean): void;
  /** Materiais desta fonte (`id`). As fábricas formam uma pilha: vale a última definida;
   *  `null` tira a desta fonte e volta a valer a anterior (no fim, `materiaisPadrao`).
   *  Refaz a geometria. Para só deixar peças transparentes, use `definirTransparencia`,
   *  que não disputa os materiais com outra camada (ex.: o render PBR). */
  definirMateriais(id: string, f: FabricaMateriais | null): void;
  /** Peças transparentes desta fonte (`id`): a peça sólida para a qual `f` devolve true
   *  vira contexto transparente (papel "fantasma"), sem trocar os materiais. `null`
   *  remove. Refaz a geometria: não chame a cada quadro. */
  definirTransparencia(id: string, f: ((e: Elemento3D) => boolean) | null): void;
  /** Planos de corte desta fonte (`id`); a vista junta os de todas as fontes no renderer.
   *  Fica o que está do lado positivo de todos os planos. Lista vazia remove. Emite
   *  "visibilidade" para as outras fontes. */
  definirPlanosCorte(id: string, planos: Plane[]): void;
  /** Filtro de visibilidade desta fonte (`id`): a peça aparece só se todos os filtros
   *  devolvem true (interseção); `null` remove o filtro. Não refaz a geometria nem emite
   *  "cena" (custo linear nos vértices, alguns ms): dá para chamar a cada quadro. Emite
   *  "visibilidade" para as outras fontes. Peça filtrada não aparece, não é selecionável e
   *  perde a seleção. O filtro vale também para o modelo novo depois de editar a obra:
   *  confira índices contra `modelo.niveis`. */
  definirFiltro(id: string, f: ((e: Elemento3D) => boolean) | null): void;
  /** Cor desta fonte (`id`) por peça: `f` devolve uma cor CSS (ex.: "#ef4444") ou null
   *  para deixar a cor da vista. A última fonte registrada que der cor vale. `null`
   *  remove. Refaz a geometria (eventos "cena" e "visibilidade"): não chame a cada
   *  quadro. A legenda da vista não sabe dessas cores; a camada mostra a sua no Painel. */
  definirCores(id: string, f: ((e: Elemento3D) => string | null) | null): void;
}

export interface Camada {
  /** Liga a camada; devolve a limpeza (chamada ao desligar ou ao sair da vista). */
  ativar(ctx: ContextoVista): (() => void) | void;
  /** Controles da camada, no painel lateral enquanto ela estiver ligada. */
  Painel?: ComponentType<{ ctx: ContextoVista }>;
}

/** Entrada da barra: o botão liga/desliga e só então carrega o código da camada. */
export interface DefinicaoCamada {
  id: string;
  nome: string;
  descricao: string;
  carregar: () => Promise<Camada>;
}

/** As camadas da barra, na ordem. Cada recurso novo acrescenta uma linha aqui. */
export const CAMADAS: readonly DefinicaoCamada[] = [
  {
    id: "corte",
    nome: "Corte por pavimento",
    descricao: "Corta o prédio na horizontal acima de um pavimento, como a planta de fôrma.",
    carregar: () => import("./camadas/corte").then((m) => m.camada),
  },
  {
    id: "armadura",
    nome: "Armadura",
    descricao:
      "Mostra a armadura calculada dentro da viga ou da coluna selecionada, com as peças transparentes.",
    carregar: () => import("./armadura/camada").then((m) => m.camada),
  },
  {
    id: "sequencia",
    nome: "Sequência construtiva 4D",
    descricao: "Mostra a obra etapa por etapa (fundação, pilares, vigas e lajes), com datas.",
    carregar: () => import("./sequencia/camada").then((m) => m.camada),
  },
  {
    id: "comparar",
    nome: "Original × Corrigido",
    descricao:
      "Calcula a obra no outro modo da NB-1/78 e pinta as peças em que o SISTRUT original difere do corrigido.",
    carregar: () => import("./comparar/camada").then((m) => m.camada),
  },
  {
    id: "ar",
    nome: "Realidade aumentada",
    descricao: "Põe o prédio na mesa, como maquete, ou no terreno pela câmera do celular.",
    carregar: () => import("./ar/camada").then((m) => m.camada),
  },
];

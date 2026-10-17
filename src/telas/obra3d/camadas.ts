// Ponto de extensão da vista 3D: "camadas" que acrescentam objetos, painel e
// comportamento à vista sem editar o núcleo (cena.ts, Vista3D.tsx). Cada camada é
// carregada sob demanda (import dinâmico) ao ser ligada na barra. O corte por pavimento
// é uma camada (camadas/corte.tsx). Contrato e exemplo em docs/VISTA-3D.md.
import type { ComponentType } from "react";
import type {
  Box3,
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
import type { Obra } from "../../dominio/obra";
import type { Calculo } from "../calculo";
import type { DadosElemento } from "./dados";
import type { Elemento3D, Modelo3D } from "./modelo";

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
  | "visibilidade";

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
  /** Troca os materiais do núcleo (null volta aos padrão); refaz a geometria. */
  definirMateriais(f: FabricaMateriais | null): void;
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
];

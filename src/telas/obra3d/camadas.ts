// Ponto de extensão da vista 3D: "camadas" que acrescentam objetos, painel e
// comportamento à vista sem editar o núcleo (cena.ts, Vista3D.tsx). Cada camada é
// carregada sob demanda (import dinâmico) ao ser ligada na barra. O corte por pavimento
// é uma camada (camadas/corte.tsx). Contrato e exemplo em docs/VISTA-3D.md.
import type { ComponentType } from "react";
import type {
  Material,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Obra } from "../../dominio/obra";
import type { Calculo } from "../calculo";
import type { DadosElemento } from "./dados";
import type { Elemento3D, Modelo3D } from "./modelo";

/** Papel de cada material do núcleo; `definirMateriais` troca qualquer um deles.
 *  "solido" e "fantasma" recebem a cor por vértice (atributo `color`). */
export type PapelMaterial = "solido" | "fantasma" | "arestas" | "destaque";
export type FabricaMateriais = (papel: PapelMaterial) => Material;

export type EventoVista =
  /** Seleção mudou (ctx.selecao). */
  | "selecao"
  /** Modelo, cores, foco, explodido ou visibilidade mudaram: a cena foi refeita ou movida. */
  | "cena"
  /** A câmera mexeu (órbita, vista, animação). */
  | "camera";

/** O que a vista expõe para uma camada. Objetos do three.js são os vivos: a camada pode
 *  ler e mexer, mas deve desfazer o que fez na limpeza (retorno de `ativar`). */
export interface ContextoVista {
  readonly cena: Scene;
  readonly renderer: WebGLRenderer;
  /** A câmera atual (perspectiva ou ortográfica, conforme a vista). */
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly controles: OrbitControls;
  readonly modelo: Modelo3D;
  readonly obra: Obra;
  readonly calculo: Calculo;
  /** Dados do cálculo por chave de elemento (situação, resultado principal). */
  readonly dados: ReadonlyMap<string, DadosElemento>;
  /** Chave do elemento selecionado. */
  readonly selecao: string | null;
  selecionar(chave: string | null): void;
  elemento(chave: string): Elemento3D | undefined;
  /** O grupo do nível (filhos dele andam com o explodido). Índice de modelo.niveis. */
  grupoDoNivel(indice: number): Object3D | undefined;
  /** Altura na cena (Y) de uma cota do nível, já com o deslocamento do explodido. */
  alturaNaCena(indiceNivel: number, cota: number): number;
  /** Redesenha no próximo quadro (a vista só desenha quando algo muda). */
  pedirRender(): void;
  /** Chamado a cada quadro enquanto registrado (animação, path tracing); devolve o
   *  cancelamento. Enquanto houver algum, a vista desenha todo quadro. */
  aoQuadro(f: (dtSegundos: number) => void): () => void;
  /** Avisa nos eventos da vista; devolve o cancelamento. */
  aoMudar(evento: EventoVista, f: () => void): () => void;
  /** Leva a câmera a `posicao` olhando para `alvo` (coordenadas da cena). Anima, salvo
   *  com prefers-reduced-motion ou `animar` false. */
  moverCamera(posicao: Vector3, alvo: Vector3, animar?: boolean): Promise<void>;
  /** Liga ou desliga a órbita/zoom/pan do usuário (o tour e o 4D animam a câmera). */
  travarControles(travar: boolean): void;
  /** Troca os materiais do núcleo (null volta aos padrão). */
  definirMateriais(f: FabricaMateriais | null): void;
  /** Planos de corte desta fonte (`id`); a vista junta os de todas as fontes no renderer.
   *  Fica o que está do lado positivo de todos os planos. Lista vazia remove. */
  definirPlanosCorte(id: string, planos: Plane[]): void;
  /** Esconde os elementos para os quais `f` devolve false (null remove); a cena é refeita.
   *  Vários filtros (por `id`) valem juntos. */
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

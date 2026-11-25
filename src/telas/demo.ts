// Link de demonstração: abre a obra-exemplo já calculada numa aba e, na 3D, numa vista
// pronta, sem passo manual. Serve para mostrar o app num link direto ou embutido em outro
// site (iframe). Lido uma vez, ao carregar a página (beforeLoad de routes/__root.tsx):
//
//   ?exemplo=nbr6118-2023|nb1-78   abre o sobrado-exemplo dessa norma e vai para /obra
//   ?exemplo=edificio              abre o edifício de demonstração (dominio/edificio.ts)
//   &aba=planta|resultados|relatorio|3d|orcamento   aba ao abrir (padrão: planta)
//   &explodido=1                   3D com os níveis afastados
//   &cor=concreto|nkPilares|taxaVigas|momentoLajes   cor das peças na 3D
//   &camada=<id>[,<id>...]         liga camadas da 3D, na ordem (ids em obra3d/camadas.ts)
//   &tracado=1                     com a camada "render": path tracing ligado
//   &reproduzir=1                  com a camada "sequencia": a obra já se construindo
//   &foco=<tipo>~<pavimento>~<nome>  elemento em foco e selecionado, pelos nomes
//                                  (ex.: pilar~1º pavimento~P6); a camada "armadura" o mostra
//   &vista=perspectiva|frente|lado|topo   câmera da 3D
//   &painel=0                      3D sem o painel lateral (mais área para o prédio)
//   &moldura=0                     aba 3D sem o cabeçalho e a barra de pavimentos da obra
//   &embed=1                       modo embutido (vale sem `exemplo` também)
//
// O modo embutido vale até a página fechar: esconde as dicas de primeiro uso, não grava o
// rascunho no navegador e não pede confirmação ao sair. O aviso de conferência continua.
// Este módulo fica no carregamento inicial: a obra-exemplo e a sessão só carregam quando o
// link pede uma obra.
import { create } from "zustand";
import type { NormaId, Obra } from "../dominio/obra";
import type { OpcoesLink } from "./obra3d/camadas";
import type { ModoCor, Vista } from "./obra3d/cena";
import type { Ver3d } from "./obra3d/link";

export const ABAS = ["planta", "resultados", "relatorio", "3d", "orcamento"] as const;
export type Aba = (typeof ABAS)[number];

/** Obras que o link abre: o sobrado da tela inicial, por norma, ou o edifício. */
export type Exemplo = NormaId | "edificio";
const EXEMPLOS: readonly Exemplo[] = ["nbr6118-2023", "nb1-78", "edificio"];
const CORES: readonly CorLink[] = ["concreto", "nkPilares", "taxaVigas", "momentoLajes"];
const VISTAS: readonly Vista[] = ["perspectiva", "frente", "lado", "topo"];
const TIPOS_FOCO = ["laje", "viga", "pilar"] as const;

/** Cores que o link pede (a situação do cálculo é o padrão da vista). */
type CorLink = Exclude<ModoCor, "estado">;

/** Elemento pedido pelo nome; a tela da obra acha o id (`acharFoco`). */
export interface FocoPorNome {
  tipo: (typeof TIPOS_FOCO)[number];
  pavimento: string;
  nome: string;
}

/** Estado inicial da vista 3D pedido pelo link. */
export interface Inicio3d {
  explodido: boolean;
  cor: CorLink | null;
  /** Ids de camadas de CAMADAS, na ordem; um id desconhecido é ignorado pela vista. */
  camadas: string[];
  /** Opções que as camadas ligadas pelo link atendem (Camada.ativar). */
  opcoes: OpcoesLink;
  vista: Vista | null;
  /** false = começa com o painel lateral oculto. */
  painel: boolean;
}

/** O que o link pede ao abrir a obra. */
export interface PedidoDemo {
  aba: Aba;
  vista3d: Inicio3d;
  foco: FocoPorNome | null;
  /** false = a aba 3D sem o cabeçalho e a barra de pavimentos (as abas ficam). */
  moldura: boolean;
}

export interface LinkDemo {
  embutido: boolean;
  /** Obra a abrir; null = o link não abre obra. */
  exemplo: Exemplo | null;
  pedido: PedidoDemo;
}

const daLista = <T extends string>(lista: readonly T[], v: string | null): T | null =>
  lista.find((x) => x === v) ?? null;

const ligado = (v: string | null) => v !== null && v !== "0" && v !== "false";
/** Ligado quando ausente; só "0" ou "false" desligam. */
const padraoLigado = (v: string | null) => v === null || ligado(v);

/** "<tipo>~<pavimento>~<nome>" -> FocoPorNome, ou null se a forma não bate. */
function lerFoco(v: string | null): FocoPorNome | null {
  const [tipo, pavimento, nome, ...resto] = (v ?? "").split("~");
  const t = daLista(TIPOS_FOCO, tipo ?? null);
  return t && pavimento && nome && resto.length === 0 ? { tipo: t, pavimento, nome } : null;
}

/** O elemento do foco por nome na obra (o primeiro pavimento com esse nome), ou null. */
export function acharFoco(obra: Obra, f: FocoPorNome | null): Ver3d | null {
  const pav = f && obra.pavimentos.find((p) => p.nome === f.pavimento);
  if (!f || !pav) return null;
  const lista = f.tipo === "laje" ? pav.lajes : f.tipo === "viga" ? pav.vigas : pav.pilares;
  const el = lista.find((e) => e.nome === f.nome);
  return el ? { tipo: f.tipo, pavimentoId: pav.id, id: el.id } : null;
}

/** Lê os parâmetros de demonstração de `searchStr` ("?exemplo=..."). Aceita valores entre
 *  aspas, como o router serializa strings; valor fora da lista vale o padrão. */
export function lerLinkDemo(searchStr: string): LinkDemo {
  const p = new URLSearchParams(searchStr);
  const valor = (nome: string) => p.get(nome)?.replace(/^"|"$/g, "") ?? null;
  return {
    embutido: ligado(valor("embed")),
    exemplo: daLista(EXEMPLOS, valor("exemplo")),
    pedido: {
      aba: daLista(ABAS, valor("aba")) ?? "planta",
      vista3d: {
        explodido: ligado(valor("explodido")),
        cor: daLista(CORES, valor("cor")),
        camadas: (valor("camada") ?? "").split(",").filter((c) => c !== ""),
        opcoes: { tracado: ligado(valor("tracado")), reproduzir: ligado(valor("reproduzir")) },
        vista: daLista(VISTAS, valor("vista")),
        painel: padraoLigado(valor("painel")),
      },
      foco: lerFoco(valor("foco")),
      moldura: padraoLigado(valor("moldura")),
    },
  };
}

/** Modo embutido e o pedido do link que a tela da obra ainda não consumiu. */
export const useDemo = create<{ embutido: boolean; pedido: PedidoDemo | null }>()(() => ({
  embutido: false,
  pedido: null,
}));

/** O modo embutido está ligado (leitura fora do React). */
export const estaEmbutido = () => useDemo.getState().embutido;

/** Aplica o link: liga o modo embutido e abre a obra-exemplo pedida. Devolve true quando
 *  abriu uma obra (quem chama leva à tela da obra). */
export async function aplicarLinkDemo(searchStr: string): Promise<boolean> {
  const link = lerLinkDemo(searchStr);
  if (link.embutido) useDemo.setState({ embutido: true });
  if (!link.exemplo) return false;
  const exemplo = link.exemplo;
  const [obra, { abrirNaSessao }, { novoIdRascunho }] = await Promise.all([
    exemplo === "edificio"
      ? import("../dominio/edificio").then((m) => m.obraEdificio())
      : import("../dominio/exemplo").then((m) => m.obraExemplo(exemplo)),
    import("./acoes"),
    import("../armazenamento/rascunho"),
  ]);
  // rascunho novo, como o botão da tela inicial; embutido, ele não é gravado
  abrirNaSessao(obra, novoIdRascunho());
  useDemo.setState({ pedido: link.pedido });
  return true;
}

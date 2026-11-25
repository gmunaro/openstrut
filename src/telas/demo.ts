// Link de demonstração: abre a obra-exemplo já calculada numa aba e, na 3D, numa vista
// pronta, sem passo manual. Serve para mostrar o app num link direto ou embutido em outro
// site (iframe). Lido uma vez, ao carregar a página (beforeLoad de routes/__root.tsx):
//
//   ?exemplo=nbr6118-2023|nb1-78   abre a obra-exemplo dessa norma e vai para /obra
//   &aba=planta|resultados|relatorio|3d|orcamento   aba ao abrir (padrão: planta)
//   &explodido=1                   3D com os níveis afastados
//   &cor=nkPilares|taxaVigas|momentoLajes   mapa de cor da 3D
//   &camada=<id>                   liga uma camada da 3D (ids em obra3d/camadas.ts)
//   &embed=1                       modo embutido (vale sem `exemplo` também)
//
// O modo embutido vale até a página fechar: esconde as dicas de primeiro uso, não grava o
// rascunho no navegador e não pede confirmação ao sair. O aviso de conferência continua.
// Este módulo fica no carregamento inicial: a obra-exemplo e a sessão só carregam quando o
// link pede uma obra.
import { create } from "zustand";
import type { NormaId } from "../dominio/obra";
import type { GrandezaMapa } from "./obra3d/dados";

export const ABAS = ["planta", "resultados", "relatorio", "3d", "orcamento"] as const;
export type Aba = (typeof ABAS)[number];

const NORMAS: readonly NormaId[] = ["nbr6118-2023", "nb1-78"];
const CORES: readonly GrandezaMapa[] = ["nkPilares", "taxaVigas", "momentoLajes"];

/** Estado inicial da vista 3D pedido pelo link. */
export interface Inicio3d {
  explodido: boolean;
  cor: GrandezaMapa | null;
  /** Id de uma camada de CAMADAS; um id desconhecido é ignorado pela vista. */
  camada: string | null;
}

/** O que o link pede ao abrir a obra. */
export interface PedidoDemo {
  aba: Aba;
  vista3d: Inicio3d;
}

export interface LinkDemo {
  embutido: boolean;
  /** Norma da obra-exemplo a abrir; null = o link não abre obra. */
  exemplo: NormaId | null;
  pedido: PedidoDemo;
}

const daLista = <T extends string>(lista: readonly T[], v: string | null): T | null =>
  lista.find((x) => x === v) ?? null;

const ligado = (v: string | null) => v !== null && v !== "0" && v !== "false";

/** Lê os parâmetros de demonstração de `searchStr` ("?exemplo=..."). Aceita valores entre
 *  aspas, como o router serializa strings; valor fora da lista vale o padrão. */
export function lerLinkDemo(searchStr: string): LinkDemo {
  const p = new URLSearchParams(searchStr);
  const valor = (nome: string) => p.get(nome)?.replace(/^"|"$/g, "") ?? null;
  return {
    embutido: ligado(valor("embed")),
    exemplo: daLista(NORMAS, valor("exemplo")),
    pedido: {
      aba: daLista(ABAS, valor("aba")) ?? "planta",
      vista3d: {
        explodido: ligado(valor("explodido")),
        cor: daLista(CORES, valor("cor")),
        camada: valor("camada") || null,
      },
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
  const [{ obraExemplo }, { abrirNaSessao }, { novoIdRascunho }] = await Promise.all([
    import("../dominio/exemplo"),
    import("./acoes"),
    import("../armazenamento/rascunho"),
  ]);
  // rascunho novo, como o botão da tela inicial; embutido, ele não é gravado
  abrirNaSessao(obraExemplo(link.exemplo), novoIdRascunho());
  useDemo.setState({ pedido: link.pedido });
  return true;
}

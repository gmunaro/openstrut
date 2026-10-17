// Tipos públicos da vista 3D para quem escreve uma camada (docs/VISTA-3D.md, "Tipos").
// Importe daqui: `import type { Camada, ContextoVista, Elemento3D } from "../api";`.
export type {
  Camada,
  ContextoVista,
  DefinicaoCamada,
  DetalhamentoElemento,
  EventoVista,
  Exibicao,
  FabricaMateriais,
  PapelMaterial,
} from "./camadas";
export type { DadosElemento, Estado as EstadoElemento, GrandezaMapa } from "./dados";
export type {
  Coluna,
  Eixo3D,
  Elemento3D,
  Modelo3D,
  Nivel,
  Ponto3,
  Solido,
  TipoElemento,
} from "./modelo";
export type { Ponto } from "../../dominio/obra";
export type { Calculo } from "../calculo";
// Detalhamento de armadura (cm, mm), o mesmo de Resultados, Relatório e DXF de armação.
export type {
  DetalhamentoLajeObra,
  DetalhamentoObra,
  DetalhamentoPilarObra,
  DetalhamentoVigaObra,
  LanceDetalhadoObra,
} from "../detalhamento";
export type {
  PosicaoArmadura,
  TipoPosicao,
  VigaDetalhamento,
} from "../../calculo/detalhamento/vigas";
export type {
  LajeDetalhamento,
  PosicaoLaje,
  TipoPosicaoLaje,
} from "../../calculo/detalhamento/lajes";
export type {
  PilarDetalhamento,
  PosicaoPilar,
  TipoPosicaoPilar,
} from "../../calculo/detalhamento/pilares";

// Cores da vista, para marcas e legendas das camadas combinarem com as da vista e da planta.
export { COR_DEFEITO, COR_ESTADO, NEUTRO, RAMPA } from "./cores";
// Materiais, luzes e fundo padrão (para render PBR e camadas com luz própria).
export { COR_SELECAO, FUNDO, LUZES, materiaisPadrao } from "./materiais";

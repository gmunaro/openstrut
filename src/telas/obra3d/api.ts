// Tipos públicos da vista 3D para quem escreve uma camada (docs/VISTA-3D.md, "Tipos").
// Importe daqui: `import type { Camada, ContextoVista, Elemento3D } from "../api";`.
export type {
  Camada,
  ContextoVista,
  DefinicaoCamada,
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

// Tipos e constantes públicos da vista 3D para quem escreve uma camada. Importe daqui:
// `import type { Camada, ContextoVista } from "../api";`. O contrato completo está em
// docs/VISTA-3D.md ("Ponto de extensão: camadas"), que copia as declarações abaixo.
//
// Referência rápida (ctx: ContextoVista; chave = Elemento3D.chave):
// - ligar e limpar: `camada.ativar(ctx)` devolve a função de limpeza; `Painel({ ctx })`.
// - peças: `ctx.modelo.elementos` (Elemento3D[]), `ctx.elemento(chave)`, níveis em
//   `ctx.modelo.niveis` (0 = o de baixo), colunas em `ctx.modelo.colunas[k].chaves`.
// - seleção: `ctx.selecao` (string | null, a chave), `ctx.selecionar(chave | null)`.
// - eventos: `ctx.aoMudar("selecao" | "cena" | "visibilidade" | "explodido" | "camera",
//   f, fonte?)` devolve `() => void` (cancelar). `ctx.aoQuadro(f)` idem, f(dtSegundos).
// - cálculo: `ctx.calculo.tipo` ("ok" | "semNorma" | "erro"); `ctx.dados.get(chave)`
//   (estado "ok" | "aviso" | "falha" | "sem", principal, grandeza, defeitos).
// - armadura pronta: `ctx.barrasDe(chave)` → ArmaduraNaCena[] (tipo, phi mm, barras como
//   Vector3[][] na cena). Detalhamento cru: `ctx.detalhamentoDe(chave)`, discriminado por
//   `tipo`; no pilar, as posições do lance são as de `tramo === lance`.
// - visibilidade: `ctx.estaVisivel(chave)`, `ctx.definirFiltro(id, f | null)`,
//   `ctx.definirPlanosCorte(id, planos)`.
// - posição: `ctx.caixaDe(chave)`, `ctx.caixaDoNivel(i)` (Box3 na cena, com o explodido),
//   `ctx.alturaNaCena(i, cota)`, `ctx.paraCena(x, y, z)`, `ctx.pontoDaViga(chave, xCm)`.
// - câmera: `ctx.enquadrarEm(caixa)`, `ctx.moverCamera(pos, alvo)` ("concluida" |
//   "cancelada"), `ctx.travarControles(sim)`.
// - cores por peça: `ctx.definirCores(id, (e) => "#hex" | null)` (refaz a geometria).
// - transparência por peça: `ctx.definirTransparencia(id, (e) => boolean | null)`.
// - materiais: `ctx.definirMateriais(id, fabrica | null)` (pilha: a última vale), padrão em
//   `materiaisPadrao`. Para só ver através das peças, prefira `definirTransparencia`.
// - cor atual de uma peça: `ctx.corDe(chave)`; fontes registradas: `ctx.fontesAtivas()`.
// - legenda da camada: `ctx.definirLegenda(id, { titulo, itens, substitui? } | null)`.
// - redesenhar: `ctx.pedirRender()`; desenhar no lugar do núcleo (WebXR):
//   `ctx.assumirDesenho(f | null)`; planos de corte juntos: `ctx.planosCorte()`.
// - luzes da vista: `ctx.luzes`; exportar .glb: `ctx.exportarGlb()`; depois de cada
//   quadro: `ctx.depoisDoQuadro(f)`; ir a uma parte: `ctx.definirFoco(foco)`.
export type {
  ArmaduraNaCena,
  Camada,
  ContextoVista,
  FontesAtivas,
  LegendaCamada,
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
export type { Foco } from "./partes";
// Geometria das barras (a regra comum à vista 3D e ao IFC), no sistema local da peça.
export type { P3, PosicaoGeometria } from "../../dominio/armaduraGeometria";
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

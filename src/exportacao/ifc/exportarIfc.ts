// Entrada da exportação IFC, carregada sob demanda (import() no botão): monta o modelo
// BIM da obra e escreve o IFC4. Tudo o que pesa da exportação fica neste chunk.
import type { Obra } from "../../dominio/obra";
import { escreverIfc, type OpcoesEscrita } from "./escrever";
import { type CalculoIfc, modeloIfc, type OpcoesModelo } from "./modelo";

export type { CalculoIfc } from "./modelo";

/** IFC4 da obra e os avisos do exportador (o que ficou de fora ou foi aproximado). */
export function gerarIfc(
  obra: Obra,
  calculo: CalculoIfc | null,
  opcoes: OpcoesModelo & OpcoesEscrita = {},
): { conteudo: string; avisos: string[] } {
  const modelo = modeloIfc(obra, calculo, opcoes);
  return { conteudo: escreverIfc(modelo, opcoes), avisos: modelo.avisos };
}

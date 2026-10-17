// Botão "Exportar IFC": carrega a exportação sob demanda (o chunk de exportarIfc.ts só baixa no
// primeiro clique) e baixa "<obra>.ifc" pela pasta de downloads, como os DXF.
import { EXTENSAO } from "../../armazenamento/arquivo";
import type { Obra } from "../../dominio/obra";
import { descreverFalha, type FalhaDxf } from "../../telas/acoes";
import { nomeArquivoSugerido } from "../../telas/arquivoLocal";
import { type Calculo, obraSemElementos } from "../../telas/calculo";
import type { DetalhamentoVigasObra } from "../../telas/detalhamento";

/** Gera o IFC4 da obra (com os resultados e a armadura quando há cálculo) e baixa.
 *  Devolve a falha para a tela mostrar, ou null quando baixou. */
export async function baixarIfc(
  obra: Obra,
  calculo: Calculo,
  detalhamento: DetalhamentoVigasObra | null,
): Promise<FalhaDxf> {
  if (obraSemElementos(obra))
    return { erros: ["A obra ainda não tem elementos para exportar em IFC."], detalhe: null };
  try {
    const { gerarIfc } = await import("./exportarIfc");
    const { conteudo } = gerarIfc(
      obra,
      calculo.tipo === "ok" ? { resultado: calculo.resultado, detalhamento } : null,
    );
    const nome = `${nomeArquivoSugerido(obra.nome).slice(0, -EXTENSAO.length)}.ifc`;
    const url = URL.createObjectURL(new Blob([conteudo], { type: "application/x-step" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return null;
  } catch (e) {
    const { motivo, detalhe } = descreverFalha(e, "gravar");
    return { erros: [`Não foi possível exportar o IFC: ${motivo}`], detalhe };
  }
}

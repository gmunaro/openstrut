// O que a tela de importação do SISTRUT relata sozinha (components/relato/automatico.ts):
// a importação que dá erro ou lança exceção, e a obra importada cujo cálculo (o mesmo
// que a tela da obra roda ao abrir) lança exceção ou deixa pavimento com falha.
import { registrarErro } from "../components/relato/coletorErros";
import type { ProblemaImportacao } from "../components/relato/automatico";
import { calcular } from "./calculo";
import {
  importarObraSistrut,
  type ArquivoEntrada,
  type OpcoesImportacaoSistrut,
  type ResultadoImportacaoSistrut,
} from "./InicioSistrut";

/** `importarObraSistrut` sem deixar a exceção escapar: ela vira erro na tela (a
 *  primeira linha), e a exceção inteira, com a pilha, vai ao coletor de erros, que
 *  segue no diagnóstico do relato. */
export function importarSemExcecao(
  lidos: ArquivoEntrada[],
  opcoes?: OpcoesImportacaoSistrut,
): ResultadoImportacaoSistrut {
  try {
    return importarObraSistrut(lidos, opcoes);
  } catch (e) {
    registrarErro("erro", e);
    const texto = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return {
      ok: false,
      erros: [`Erro inesperado na importação: ${texto}`],
      resumo: { pavimentos: [], lidos: lidos.map((a) => a.nome).sort(), ignorados: [] },
    };
  }
}

/** O problema a relatar, ou null quando a obra importa e calcula sem erro. */
export function problemaDaImportacao(
  r: ResultadoImportacaoSistrut,
  arquivos: readonly ArquivoEntrada[],
): ProblemaImportacao | null {
  if (!r.ok) return { etapa: "importação", mensagens: r.erros, arquivos };
  const c = calcular(r.obra);
  if (c.tipo === "erro")
    return { etapa: "cálculo", mensagens: [c.mensagem], arquivos, obra: r.obra };
  if (c.tipo !== "ok") return null;
  const falhas = c.resultado.pavimentos.flatMap((p) =>
    p.falhas.map((f) => `${p.pavimento.nome}: ${f}`),
  );
  return falhas.length > 0 ? { etapa: "cálculo", mensagens: falhas, arquivos, obra: r.obra } : null;
}

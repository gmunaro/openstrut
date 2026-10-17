// Nome do produto e os avisos fixos, usados na moldura do app, na tela inicial e no
// relatório. Este módulo não importa nada: a moldura (routes/__root.tsx) o usa sem
// carregar o motor de cálculo na abertura do app.

export const NOME_APP = "OpenStrut V2";

/** Frase obrigatória na tela e no relatório (CLAUDE.md, inegociáveis). A mesma de
 *  telas/calculo.ts, que o relatório usa; marca.test.ts confere que as duas não se
 *  separam. */
export const AVISO_CONFERENCIA = "Os resultados exigem conferência de engenheiro responsável.";

export const AVISO_RECONSTRUCAO =
  "OpenStrut é uma reconstrução independente, por engenharia reversa, do SISTRUT 4.0 (1991). Sem vínculo com os autores do original.";

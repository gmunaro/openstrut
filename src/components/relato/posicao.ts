// Onde o botão flutuante fica sem cobrir controle: no canto do rodapé ou, se ali houver
// algo (a barra Aplicar/Cancelar de um diálogo ou folha em tela cheia no celular, por
// exemplo), subindo pela borda direita até o primeiro lugar livre.

/** O que o botão não pode cobrir: o que o usuário clica ou digita e as células de tabela. */
export const SELETOR_CONTROLE = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "summary",
  "label",
  '[contenteditable="true"]',
  "td",
  "th",
  ...[
    "button",
    "tab",
    "checkbox",
    "radio",
    "switch",
    "combobox",
    "menuitem",
    "option",
    "slider",
  ].map((r) => `[role="${r}"]`),
].join(",");

export interface Retangulo {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Passo da busca, px. */
const PASSO = 8;

/**
 * Deslocamento para cima (px) a partir da posição padrão: 0 se ela está livre; senão o
 * menor deslocamento livre até `maximo`; sem lugar livre, fica na padrão.
 */
export function deslocamentoLivre(
  padrao: Retangulo,
  ocupado: (r: Retangulo) => boolean,
  maximo: number,
) {
  for (let d = 0; d <= maximo; d += PASSO) {
    if (!ocupado({ ...padrao, top: padrao.top - d })) return d;
  }
  return 0;
}

/** Pontos de amostra do retângulo, com uma folga em volta: cantos, meios e centro. */
export function pontosDe(r: Retangulo, folga = 4) {
  const xs = [r.left - folga, r.left + r.width / 2, r.left + r.width + folga];
  const ys = [r.top - folga, r.top + r.height / 2, r.top + r.height + folga];
  return xs.flatMap((x) => ys.map((y) => ({ x, y })));
}

/**
 * O retângulo cobre um controle clicável? Usa a pilha de elementos em cada ponto,
 * ignorando o próprio botão. Atrás de um diálogo modal o body fica sem eventos de
 * ponteiro, então só contam os controles que o usuário consegue clicar.
 */
export function cobreControle(r: Retangulo, proprio: Element) {
  // DOM sem hit testing (testes no happy-dom): fica na posição padrão
  if (typeof document.elementsFromPoint !== "function") return false;
  return pontosDe(r).some(({ x, y }) => {
    const alvo = document.elementsFromPoint(x, y).find((el) => !proprio.contains(el));
    return alvo?.closest(SELETOR_CONTROLE) != null;
  });
}

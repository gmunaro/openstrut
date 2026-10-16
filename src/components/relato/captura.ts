// Print da tela no instante do clique em "Relatar problema": clona o DOM da página
// (com diálogos e menus abertos, SVG da planta e canvas) e desenha num PNG. Não usa
// getDisplayMedia, que pediria permissão ao usuário.
import { domToCanvas } from "modern-screenshot";

export const LARGURA_MAXIMA = 1600;
/** Elementos com este atributo ficam fora do print (o próprio botão de relatar). */
export const ATRIBUTO_IGNORAR = "data-relato-ignorar";

/** Escala do print: a densidade da tela, limitada para a largura não passar de 1600 px. */
export function escalaCaptura(largura: number, dpr: number) {
  return Math.min(dpr > 0 ? dpr : 1, LARGURA_MAXIMA / Math.max(1, largura));
}

/** Teto do PNG, o mesmo que o relay aceita (relato-worker/src/validar.ts). */
export const LIMITE_PRINT = 3 * 1024 * 1024;

const paraPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, falha) =>
    c.toBlob((b) => (b ? ok(b) : falha(new Error("canvas vazio"))), "image/png"),
  );

function reduzir(origem: HTMLCanvasElement, fator: number) {
  const c = document.createElement("canvas");
  c.width = Math.round(origem.width * fator);
  c.height = Math.round(origem.height * fator);
  c.getContext("2d")?.drawImage(origem, 0, 0, c.width, c.height);
  return c;
}

/**
 * O clone vira SVG serializado, que só leva atributos: o estado atual dos campos
 * (opção escolhida no select, caixa marcada, texto digitado no textarea) se perderia.
 * A biblioteca copia o valor para o atributo `value`; daqui ele vai para onde aparece.
 */
export function fixarEstadoDosCampos(clone: Node) {
  if (clone instanceof HTMLSelectElement) {
    const valor = clone.getAttribute("value");
    for (const o of clone.querySelectorAll("option")) {
      o.toggleAttribute("selected", o.value === valor);
    }
  } else if (
    clone instanceof HTMLInputElement &&
    (clone.type === "checkbox" || clone.type === "radio")
  ) {
    clone.toggleAttribute("checked", clone.checked);
  } else if (clone instanceof HTMLTextAreaElement) {
    clone.textContent = clone.getAttribute("value") ?? clone.value;
  }
}

/** PNG da janela como está agora; null se a captura falhar (o relato segue sem print).
 *  Tela muito carregada que passa de LIMITE_PRINT sai em resolução menor. */
export async function capturarTela(): Promise<Blob | null> {
  const corpo = document.body;
  try {
    let canvas = await domToCanvas(corpo, {
      scale: escalaCaptura(corpo.clientWidth || innerWidth, devicePixelRatio),
      // o tema escuro pinta o fundo no body; sem isso o PNG sai transparente
      backgroundColor: getComputedStyle(corpo).backgroundColor,
      filter: (n) => !(n instanceof Element && n.hasAttribute(ATRIBUTO_IGNORAR)),
      onCloneEachNode: fixarEstadoDosCampos,
      timeout: 10_000,
    });
    let png = await paraPng(canvas);
    while (png.size > LIMITE_PRINT && canvas.width > 400) {
      canvas = reduzir(canvas, Math.sqrt(LIMITE_PRINT / png.size) * 0.9);
      png = await paraPng(canvas);
    }
    return png;
  } catch (e) {
    console.warn("relato: o print da tela falhou", e);
    return null;
  }
}

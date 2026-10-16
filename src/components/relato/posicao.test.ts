import { describe, expect, test } from "vitest";
import { deslocamentoLivre, pontosDe, type Retangulo } from "./posicao";

// botão de 44 px no canto de uma tela de 360 × 800, com a base a 32 px do fundo
const padrao: Retangulo = { left: 304, top: 724, width: 44, height: 44 };

/** Barra de ações de y0 a y1 na largura toda: ocupa quem a intercepta. */
const barra = (y0: number, y1: number) => (r: Retangulo) => r.top < y1 && r.top + r.height > y0;

describe("posição livre do botão", () => {
  test("canto livre: fica na posição padrão", () => {
    expect(deslocamentoLivre(padrao, () => false, 700)).toBe(0);
  });

  test("barra Aplicar/Cancelar de 712 a 800: sobe até ficar acima dela", () => {
    // topo da barra em 712; o botão (44 px) precisa terminar acima: top ≤ 668 → d ≥ 56
    expect(deslocamentoLivre(padrao, barra(712, 800), 700)).toBe(56);
  });

  test("sem lugar livre até o máximo: fica na padrão", () => {
    expect(deslocamentoLivre(padrao, () => true, 700)).toBe(0);
  });

  test("amostra cantos, meios e centro com folga", () => {
    const p = pontosDe({ left: 0, top: 0, width: 40, height: 40 }, 4);
    expect(p).toHaveLength(9);
    expect(p).toContainEqual({ x: -4, y: -4 });
    expect(p).toContainEqual({ x: 20, y: 20 });
    expect(p).toContainEqual({ x: 44, y: 44 });
  });
});

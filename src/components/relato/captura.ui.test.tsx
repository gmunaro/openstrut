import { describe, expect, test } from "vitest";
import { escalaCaptura, fixarEstadoDosCampos } from "./captura";

// O clone da captura vira SVG serializado: só o que está em atributo aparece no print.
const serializar = (n: Node) => new XMLSerializer().serializeToString(n);

describe("captura", () => {
  test("a opção escolhida no select vai para o atributo selected", () => {
    const select = document.createElement("select");
    select.innerHTML =
      '<option value="0.25" selected>0,25 m</option><option value="0.5">0,50 m</option>';
    select.setAttribute("value", "0.5"); // o que a biblioteca copia do select original
    fixarEstadoDosCampos(select);
    const [a, b] = select.querySelectorAll("option");
    expect(a?.hasAttribute("selected")).toBe(false);
    expect(b?.hasAttribute("selected")).toBe(true);
  });

  test("caixa marcada e texto digitado aparecem na serialização", () => {
    const caixa = document.createElement("input");
    caixa.type = "checkbox";
    caixa.checked = true;
    fixarEstadoDosCampos(caixa);
    expect(serializar(caixa)).toContain("checked");

    const area = document.createElement("textarea");
    area.textContent = "padrão";
    area.setAttribute("value", "digitado");
    fixarEstadoDosCampos(area);
    expect(serializar(area)).toContain(">digitado<");
  });

  test("escala: densidade da tela, com a largura limitada a 1600 px", () => {
    expect(escalaCaptura(360, 3)).toBe(3); // 1080 px
    expect(escalaCaptura(1920, 1)).toBeCloseTo(1600 / 1920);
    expect(escalaCaptura(1280, 2)).toBe(1.25); // 1600 px
    expect(escalaCaptura(800, 0)).toBe(1);
  });
});

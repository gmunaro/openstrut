// Geometria do editor. Esperados contados à mão a partir das definições
// (tela = origem + mundo · escala, com y invertido).
import { describe, expect, it } from "vitest";
import { lajeNova, pavimentoNovo } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import {
  type Alvo,
  ESCALA_MAX,
  elementoEm,
  enquadrar,
  linhasDeSnap,
  mundoParaTela,
  normalizarRetangulo,
  passoVisivel,
  proximoAlvo,
  retanguloTela,
  medir,
  posicaoRotuloViga,
  snap,
  snapComGuias,
  sobrepoe,
  telaParaMundo,
  zoomNoPonto,
} from "./geometria";

const vista = { escala: 50, ox: 100, oy: 400 };

describe("mundo ↔ tela", () => {
  it("y do mundo para cima vira y da tela para baixo", () => {
    expect(mundoParaTela(vista, { x: 0, y: 0 })).toEqual({ x: 100, y: 400 });
    // 2 m à direita = +100 px; 3 m acima = −150 px
    expect(mundoParaTela(vista, { x: 2, y: 3 })).toEqual({ x: 200, y: 250 });
  });

  it("telaParaMundo é a inversa", () => {
    const p = { x: -1.25, y: 7.5 };
    expect(telaParaMundo(vista, mundoParaTela(vista, p))).toEqual(p);
  });

  it("zoom mantém parado o ponto sob o cursor", () => {
    const cursor = { x: 320, y: 180 };
    const antes = telaParaMundo(vista, cursor);
    const v = zoomNoPonto(vista, cursor, 2);
    expect(v.escala).toBe(100);
    const depois = telaParaMundo(v, cursor);
    expect(depois.x).toBeCloseTo(antes.x, 12);
    expect(depois.y).toBeCloseTo(antes.y, 12);
  });

  it("zoom respeita o limite", () => {
    expect(zoomNoPonto(vista, { x: 0, y: 0 }, 1e6).escala).toBe(ESCALA_MAX);
  });

  it("enquadrar centra a caixa e cabe na tela com margem", () => {
    // caixa 10 × 5 m numa tela 600 × 400 com margem 50: escala = min(500/10, 300/5) = 50
    const v = enquadrar({ xmin: 0, ymin: 0, xmax: 10, ymax: 5 }, 600, 400, 50);
    expect(v.escala).toBe(50);
    expect(mundoParaTela(v, { x: 5, y: 2.5 })).toEqual({ x: 300, y: 200 });
    expect(mundoParaTela(v, { x: 0, y: 5 })).toEqual({ x: 50, y: 75 });
  });

  it("retanguloTela tem canto superior esquerdo e lados positivos", () => {
    expect(retanguloTela(vista, { xmin: 1, ymin: 1, xmax: 3, ymax: 2 })).toEqual({
      x: 150,
      y: 300,
      width: 100,
      height: 50,
    });
  });
});

describe("retângulo arrastado", () => {
  it("normaliza em qualquer direção", () => {
    const r = { x: 1, y: 2, lx: 3, ly: 4 };
    expect(normalizarRetangulo({ x: 1, y: 2 }, { x: 4, y: 6 })).toEqual(r);
    expect(normalizarRetangulo({ x: 4, y: 6 }, { x: 1, y: 2 })).toEqual(r);
    expect(normalizarRetangulo({ x: 1, y: 6 }, { x: 4, y: 2 })).toEqual(r);
    expect(normalizarRetangulo({ x: 4, y: 2 }, { x: 1, y: 6 })).toEqual(r);
  });
});

describe("sobreposição", () => {
  const a = { x: 0, y: 0, lx: 4, ly: 5 };
  it("encostar bordo com bordo não é sobrepor", () => {
    expect(sobrepoe(a, { x: 4, y: 0, lx: 3, ly: 5 })).toBe(false);
    expect(sobrepoe(a, { x: 0, y: 5, lx: 4, ly: 2 })).toBe(false);
    // só um canto em comum
    expect(sobrepoe(a, { x: 4, y: 5, lx: 1, ly: 1 })).toBe(false);
  });
  it("área em comum é sobrepor", () => {
    expect(sobrepoe(a, { x: 3.5, y: 1, lx: 3, ly: 1 })).toBe(true);
    // contida
    expect(sobrepoe(a, { x: 1, y: 1, lx: 1, ly: 1 })).toBe(true);
    // contém
    expect(sobrepoe({ x: 1, y: 1, lx: 1, ly: 1 }, a)).toBe(true);
  });
});

describe("snap", () => {
  const linhas = { xs: [0, 4.13], ys: [0, 5] };
  it("sem laje por perto, vai à grade", () => {
    expect(snap({ x: 1.6, y: 2.2 }, 0.5, linhas, 0.1)).toEqual({ x: 1.5, y: 2 });
    expect(snap({ x: 1.6, y: 2.2 }, 1, linhas, 0.1)).toEqual({ x: 2, y: 2 });
    expect(snap({ x: 0.3, y: 0.3 }, 0.25, { xs: [], ys: [] }, 0.1)).toEqual({ x: 0.25, y: 0.25 });
  });
  it("bordo de laje tem prioridade sobre a grade dentro da tolerância", () => {
    // x = 4,08 → bordo 4,13 (a 0,05); y = 2,2 → grade 2,0
    expect(snap({ x: 4.08, y: 2.2 }, 0.5, linhas, 0.1)).toEqual({ x: 4.13, y: 2 });
    // canto: os dois eixos pegam o bordo
    expect(snap({ x: 4.2, y: 4.95 }, 0.5, linhas, 0.1)).toEqual({ x: 4.13, y: 5 });
    // fora da tolerância: grade
    expect(snap({ x: 3.9, y: 2.2 }, 0.5, linhas, 0.1)).toEqual({ x: 4, y: 2 });
  });
  it("guias: o eixo que pegou bordo de laje dá a linha; o que foi à grade, null", () => {
    expect(snapComGuias({ x: 4.08, y: 2.2 }, 0.5, linhas, 0.1)).toEqual({
      ponto: { x: 4.13, y: 2 },
      guias: { x: 4.13, y: null },
    });
    expect(snapComGuias({ x: 1.6, y: 2.2 }, 0.5, linhas, 0.1).guias).toEqual({ x: null, y: null });
    expect(snapComGuias({ x: 4.2, y: 4.95 }, 0.5, linhas, 0.1).guias).toEqual({ x: 4.13, y: 5 });
  });
  it("arredonda sem ruído de ponto flutuante", () => {
    expect(snap({ x: 0.3, y: 0.7 }, 0.1, { xs: [], ys: [] }, 0)).toEqual({ x: 0.3, y: 0.7 });
  });
  it("linhasDeSnap pega os bordos das lajes", () => {
    const p = pavimentoNovo("T");
    p.lajes.push(lajeNova(p, { x: 0, y: 0, lx: 4, ly: 5 }));
    p.lajes.push(lajeNova(p, { x: 4, y: 0, lx: 3.5, ly: 5 }));
    const l = linhasDeSnap(p.lajes);
    expect(l.xs.toSorted((a, b) => a - b)).toEqual([0, 4, 7.5]);
    expect(l.ys.toSorted((a, b) => a - b)).toEqual([0, 5]);
  });
});

describe("elementoEm", () => {
  const base = pavimentoNovo("T");
  base.lajes.push(lajeNova(base, { x: 0, y: 0, lx: 4, ly: 5 }));
  const p = gerarEstrutura(base);
  const tipo = (x: number, y: number) => elementoEm(p, { x, y }, 0.05)?.tipo;
  it("pilar no canto, viga no bordo, laje no meio, nada fora", () => {
    expect(tipo(0, 0)).toBe("pilar");
    expect(tipo(0.09, 0)).toBe("pilar"); // pilar 20 cm: meia largura 0,10 m
    expect(tipo(2, 0.04)).toBe("viga");
    expect(tipo(2, 2.5)).toBe("laje");
    expect(tipo(5, 2.5)).toBeUndefined();
  });
  it("devolve o id do elemento", () => {
    const sup = elementoEm(p, { x: 2, y: 5 }, 0.05);
    const v = p.vigas.find((x) => x.id === sup?.id);
    expect([v?.y1, v?.y2]).toEqual([5, 5]);
  });
});

describe("proximoAlvo", () => {
  const base = pavimentoNovo("T");
  base.lajes.push(lajeNova(base, { x: 0, y: 0, lx: 4, ly: 5 }));
  const p = gerarEstrutura(base);
  const ordem: Alvo[] = [
    ...p.lajes.map((l) => ({ tipo: "laje" as const, id: l.id })),
    ...p.vigas.map((v) => ({ tipo: "viga" as const, id: v.id })),
    ...p.pilares.map((q) => ({ tipo: "pilar" as const, id: q.id })),
  ];
  it("sem seleção, seta para frente pega o primeiro e para trás o último", () => {
    expect(proximoAlvo(p, null, 1)).toEqual(ordem[0]);
    expect(proximoAlvo(p, null, -1)).toEqual(ordem[ordem.length - 1]);
  });
  it("percorre laje → vigas → pilares e volta ao início", () => {
    let atual = proximoAlvo(p, null, 1);
    const visitados = [atual];
    for (let i = 1; i < ordem.length; i++) {
      atual = proximoAlvo(p, atual ?? null, 1);
      visitados.push(atual);
    }
    expect(visitados).toEqual(ordem);
    expect(proximoAlvo(p, atual ?? null, 1)).toEqual(ordem[0]);
  });
  it("seta para trás a partir da primeira volta ao último", () => {
    expect(proximoAlvo(p, ordem[0] ?? null, -1)).toEqual(ordem[ordem.length - 1]);
  });
  it("pavimento vazio não tem alvo", () => {
    expect(proximoAlvo(pavimentoNovo("V"), null, 1)).toBeUndefined();
  });
});

describe("passoVisivel", () => {
  it("dobra o passo até ficar legível", () => {
    expect(passoVisivel(0.5, 50)).toBe(0.5); // 25 px
    expect(passoVisivel(0.25, 10)).toBe(1); // 2,5 → 5 → 10 px
  });
});

describe("medir", () => {
  it("dá a distância e as componentes positivas (triângulo 3-4-5)", () => {
    expect(medir({ x: 4, y: 5 }, { x: 1, y: 1 })).toEqual({ d: 5, dx: 3, dy: 4 });
    expect(medir({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({ d: 0, dx: 0, dy: 0 });
  });
});

describe("posicaoRotuloViga", () => {
  const v = { x1: 0, y1: 0, x2: 8, y2: 0 };
  it("no meio quando não há pilar perto", () => {
    expect(
      posicaoRotuloViga(
        v,
        [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
        ],
        0.6,
      ),
    ).toEqual({ x: 4, y: 0 });
  });
  it("pilar no meio: vai para 1/4 do comprimento", () => {
    expect(posicaoRotuloViga(v, [{ x: 4, y: 0 }], 0.6)).toEqual({ x: 2, y: 0 });
  });
  it("pilares no meio e a 1/4: vai para 3/4", () => {
    expect(
      posicaoRotuloViga(
        v,
        [
          { x: 4, y: 0 },
          { x: 2, y: 0 },
        ],
        0.6,
      ),
    ).toEqual({ x: 6, y: 0 });
  });
});

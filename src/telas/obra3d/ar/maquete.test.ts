// Contas da maquete em AR com valores à mão. Caixa de referência: um prédio de 10 m em X,
// 6 m de altura e 10 m em Z (planta de 0 a 10 m em y → Z de −10 a 0), com a fundação
// descendo a −0,5 m. O centro da base é (5; −0,5; −5).
import { Box3, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  anguloDosToques,
  caixaDasVisiveis,
  diferencaAngular,
  ehHorizontal,
  fatorDaEscala,
  matrizDaMaquete,
  rotacaoDeFrente,
} from "./maquete";

const caixa = new Box3(new Vector3(0, -0.5, -10), new Vector3(10, 6, 0));
// ponto do hit-test: 1,4 m abaixo do celular (o chão), 2 m à frente
const ponto = new Vector3(1, -1.4, -2);

function perto(v: Vector3, x: number, y: number, z: number) {
  expect(v.x).toBeCloseTo(x, 10);
  expect(v.y).toBeCloseTo(y, 10);
  expect(v.z).toBeCloseTo(z, 10);
}

describe("escala", () => {
  it("1:50, 1:100, 1:200 e 1:1", () => {
    expect(fatorDaEscala("1:50")).toBe(0.02);
    expect(fatorDaEscala("1:100")).toBe(0.01);
    expect(fatorDaEscala("1:200")).toBe(0.005);
    expect(fatorDaEscala("1:1")).toBe(1);
  });
});

describe("matrizDaMaquete", () => {
  it("1:100 sem giro: centro da base no ponto, cantos a 1/100 da distância", () => {
    const m = matrizDaMaquete(caixa, ponto, 0.01, 0);
    perto(new Vector3(5, -0.5, -5).applyMatrix4(m), 1, -1.4, -2);
    // canto de cima: (10 − 5; 6 + 0,5; 0 + 5) × 0,01 = (0,05; 0,065; 0,05) somado ao ponto
    perto(new Vector3(10, 6, 0).applyMatrix4(m), 1.05, -1.335, -1.95);
    // canto de baixo oposto: (−0,05; 0; −0,05)
    perto(new Vector3(0, -0.5, -10).applyMatrix4(m), 0.95, -1.4, -2.05);
  });

  it("a base fica no plano do ponto e nada desce abaixo dele", () => {
    const m = matrizDaMaquete(caixa, ponto, 0.02, 0.7);
    const transformada = caixa.clone().applyMatrix4(m);
    expect(transformada.min.y).toBeCloseTo(-1.4, 10);
    // altura total 6,5 m × 0,02 = 0,13 m
    expect(transformada.max.y).toBeCloseTo(-1.4 + 0.13, 10);
  });

  it("1:100 girada 90°: o vetor (0,05; 0; 0,05) vira (0,05; 0; −0,05)", () => {
    // Ry(90°): (x, z) → (x cos θ + z sen θ, −x sen θ + z cos θ) = (z, −x)
    const m = matrizDaMaquete(caixa, ponto, 0.01, Math.PI / 2);
    perto(new Vector3(10, 6, 0).applyMatrix4(m), 1.05, -1.335, -2.05);
    perto(new Vector3(5, -0.5, -5).applyMatrix4(m), 1, -1.4, -2);
  });

  it("1:1 só translada", () => {
    const m = matrizDaMaquete(caixa, ponto, 1, 0);
    // (10; 6; 0) − (5; −0,5; −5) + (1; −1,4; −2) = (6; 5,1; 3)
    perto(new Vector3(10, 6, 0).applyMatrix4(m), 6, 5.1, 3);
  });
});

describe("rotacaoDeFrente", () => {
  it("olho em +Z do ponto: sem giro", () => {
    expect(rotacaoDeFrente(new Vector3(0, 0, 0), new Vector3(0, 1.4, 2))).toBeCloseTo(0, 12);
  });

  it("olho em +X: 90°, e a frente (+Z) passa a apontar para ele", () => {
    const p = new Vector3(1, -1.4, -2);
    const olho = new Vector3(4, 0, -2);
    const r = rotacaoDeFrente(p, olho);
    expect(r).toBeCloseTo(Math.PI / 2, 12);
    const m = matrizDaMaquete(new Box3(new Vector3(-1, 0, -1), new Vector3(1, 1, 1)), p, 1, r);
    // a frente da caixa (0; 0; 1) vai para p + (1; 0; 0), do lado do olho
    perto(new Vector3(0, 0, 1).applyMatrix4(m), 2, -1.4, -2);
  });

  it("olho na vertical do ponto: 0", () => {
    expect(rotacaoDeFrente(new Vector3(1, 0, 1), new Vector3(1, 5, 1))).toBe(0);
  });
});

describe("ehHorizontal", () => {
  it("chão (Y da pose para cima) sim; parede (Y na horizontal) e teto não", () => {
    // matriz em colunas: elementos 4, 5, 6 = eixo Y
    const chao = new Matrix4().makeTranslation(0, -1.4, -2).elements;
    expect(ehHorizontal(chao)).toBe(true);
    const parede = new Matrix4().makeRotationX(Math.PI / 2).elements; // Y → Z
    expect(ehHorizontal(parede)).toBe(false);
    const teto = new Matrix4().makeRotationX(Math.PI).elements; // Y → −Y
    expect(ehHorizontal(teto)).toBe(false);
    // inclinada 20°: cos 20° = 0,94 > 0,9; 30°: cos 30° = 0,87
    expect(ehHorizontal(new Matrix4().makeRotationZ((20 * Math.PI) / 180).elements)).toBe(true);
    expect(ehHorizontal(new Matrix4().makeRotationZ((30 * Math.PI) / 180).elements)).toBe(false);
  });
});

describe("gesto de dois dedos", () => {
  it("ângulo do segmento entre os toques, y da tela para baixo", () => {
    expect(anguloDosToques({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    // segundo dedo abaixo do primeiro: +90° (horário na tela)
    expect(anguloDosToques({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2, 12);
  });

  it("diferença sem salto ao passar de π para −π", () => {
    // de 170° para −170° o dedo andou +20°, não −340°
    const d = diferencaAngular((-170 * Math.PI) / 180, (170 * Math.PI) / 180);
    expect(d).toBeCloseTo((20 * Math.PI) / 180, 12);
    expect(diferencaAngular(0.3, 0.1)).toBeCloseTo(0.2, 12);
  });
});

describe("caixaDasVisiveis", () => {
  it("junta só as peças visíveis", () => {
    const caixas = new Map([
      ["a", new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1))],
      ["b", new Box3(new Vector3(5, 0, 0), new Vector3(6, 3, 1))],
      ["c", new Box3(new Vector3(-9, -9, -9), new Vector3(9, 9, 9))],
    ]);
    const c = caixaDasVisiveis(
      ["a", "b", "c", "sumiu"],
      (k) => k !== "c",
      (k) => caixas.get(k),
    );
    perto(c.min, 0, 0, 0);
    perto(c.max, 6, 3, 1);
  });

  it("nenhuma visível: caixa vazia", () => {
    expect(
      caixaDasVisiveis(
        ["a"],
        () => false,
        () => undefined,
      ).isEmpty(),
    ).toBe(true);
  });
});

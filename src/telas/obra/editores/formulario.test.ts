// Leitura dos campos dos editores: mensagens, texto dos números e polígono como o leitor
// do arquivo. Áreas feitas à mão: quadrado de lado 1 → área dupla ±2.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerObra } from "../../../armazenamento/arquivo";
import {
  areaDupla,
  conferirPoligono,
  Leitor,
  problemasNoArquivo,
  semChaves,
  soDefinidos,
  textoDe,
} from "./formulario";

describe("Leitor", () => {
  it("anota uma mensagem por campo, com o rótulo e a faixa", () => {
    const l = new Leitor();
    expect(l.numero("2,5", "bw", "positivo")).toBe(2.5);
    l.numero("", "h", "positivo");
    l.numero("0", "bw", "positivo");
    l.numero("-1", "Carga", "naoNegativo");
    l.numero("1,5", "Repetições", "naoNegativo", true);
    expect(l.opcional("  ", "Acidental")).toBeUndefined();
    expect(l.erros).toEqual([
      "h: informe um número.",
      "bw: informe um número maior que zero.",
      "Carga: informe um número maior ou igual a zero.",
      "Repetições: informe um número inteiro.",
    ]);
  });
});

describe("textoDe", () => {
  it("vírgula decimal, sem o ruído do float64 e vazio para ausente", () => {
    expect(textoDe(1.7999999999999998)).toBe("1,8");
    expect(textoDe(1.00005)).toBe("1,00005");
    expect(textoDe(-24)).toBe("-24");
    expect(textoDe(undefined)).toBe("");
    expect(textoDe(null)).toBe("");
  });
});

describe("soDefinidos e semChaves", () => {
  it("tiram as chaves undefined e as chaves pedidas", () => {
    expect(soDefinidos({ a: 1, b: undefined, c: 0 })).toEqual({ a: 1, c: 0 });
    expect(semChaves({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });
  });
});

describe("polígono", () => {
  const horario = [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
  ];

  it("área dupla com sinal: −2 no horário, +2 no anti-horário", () => {
    expect(areaDupla(horario)).toBe(-2);
    expect(areaDupla([...horario].reverse())).toBe(2);
  });

  it("laje: recusa anti-horário, sem área e com menos de 3 vértices", () => {
    const l = new Leitor();
    conferirPoligono(l, horario, "Polígono", true);
    conferirPoligono(l, [...horario].reverse(), "Polígono", true);
    conferirPoligono(
      l,
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      "Carga 1",
      false,
    );
    conferirPoligono(l, horario.slice(0, 2), "Carga 2", false);
    expect(l.erros).toEqual([
      "Polígono: os vértices estão em sentido anti-horário; o LAJEGEOM só aceita o horário.",
      "Carga 1: o polígono não tem área.",
      "Carga 2: informe pelo menos 3 vértices.",
    ]);
  });
});

describe("problemasNoArquivo", () => {
  it("obra válida: nada; obra que o arquivo recusa: a mensagem do leitor", () => {
    const r = lerObra(readFileSync("e2e/fixtures/laje-r3-original.openstrut.json", "utf8"));
    if (!r.ok) throw new Error(r.erros.join("; "));
    const obra = r.obra;
    expect(problemasNoArquivo(obra)).toEqual([]);
    const ruim = { ...obra, materiais: { ...obra.materiais, fck: -1 } };
    expect(problemasNoArquivo(ruim)).toEqual([
      "O arquivo recusaria a obra (materiais.fck: esperado um número maior que zero, veio -1.)",
    ]);
  });
});

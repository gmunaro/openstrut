// Operações de edição da planta. Esperados contados à mão sobre as regras de
// gerarEstrutura (vigas nos bordos não livres, pilares nas extremidades e cruzamentos).
import { describe, expect, it } from "vitest";
import { obraNova, pavimentoNovo } from "../dominio/criar";
import type { Pavimento } from "../dominio/obra";
import {
  acrescentarLaje,
  acrescentarPilar,
  alterarLaje,
  alterarPilar,
  alterarViga,
  apagarLaje,
  apagarPilar,
  apagarViga,
  substituirPavimento,
} from "./edicao";

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`esperava sucesso: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

function erro(r: { ok: true } | { ok: false; erro: string }) {
  if (r.ok) throw new Error("esperava erro");
  return r.erro;
}

/** Duas lajes lado a lado (a obra FLUXO da V1): L1 0..4 e L2 4..7,5, ambas com y 0..5. */
function duasLajes(): Pavimento {
  let p = pavimentoNovo("T");
  p = ok(acrescentarLaje(p, { x: 0, y: 0, lx: 4, ly: 5 })).pavimento;
  return ok(acrescentarLaje(p, { x: 4, y: 0, lx: 3.5, ly: 5 })).pavimento;
}

const vigaEm = (p: Pavimento, x1: number, y1: number, x2: number, y2: number) =>
  p.vigas.find((v) => v.x1 === x1 && v.y1 === y1 && v.x2 === x2 && v.y2 === y2);

describe("acrescentarLaje", () => {
  it("cria a laje e gera vigas e pilares no mesmo passo", () => {
    const p = duasLajes();
    expect(p.lajes.map((l) => l.nome)).toEqual(["L1", "L2"]);
    // 2 horizontais contínuas (0..7,5) + 3 verticais (x = 0; 4; 7,5)
    expect(p.vigas).toHaveLength(5);
    // pilares: 3 em cima e 3 embaixo
    expect(p.pilares).toHaveLength(6);
  });
  it("recusa sobreposição com mensagem", () => {
    expect(erro(acrescentarLaje(duasLajes(), { x: 3, y: 1, lx: 2, ly: 2 }))).toBe(
      "A laje se sobrepõe à L1. Encoste-a no bordo da L1 sem invadir (o snap prende no bordo) ou ajuste x, y, lx e ly no painel.",
    );
  });
  it("aceita laje encostada", () => {
    const r = ok(acrescentarLaje(duasLajes(), { x: 0, y: 5, lx: 4, ly: 3 }));
    expect(r.pavimento.lajes.find((l) => l.id === r.id)?.nome).toBe("L3");
  });
  it("recusa vão menor que 10 cm", () => {
    expect(erro(acrescentarLaje(duasLajes(), { x: 10, y: 0, lx: 0.05, ly: 2 }))).toMatch(/0,10 m/);
  });
});

describe("alterarLaje", () => {
  it("valida h > 0, sobrecarga ≥ 0 e nome", () => {
    const p = duasLajes();
    const id = p.lajes[0]!.id;
    expect(erro(alterarLaje(p, id, { h: 0 }))).toMatch(/maior que zero/);
    expect(erro(alterarLaje(p, id, { sobrecarga: -1 }))).toMatch(/negativa/);
    expect(erro(alterarLaje(p, id, { nome: "L2" }))).toMatch(/Já existe/);
    expect(erro(alterarLaje(p, id, { nome: " " }))).toMatch(/vazio/);
    expect(erro(alterarLaje(p, id, { h: Number.NaN }))).toBe(
      "Digite um número, com vírgula ou ponto decimal.",
    );
  });
  it("carga não regenera; geometria regenera", () => {
    const p = duasLajes();
    const id = p.lajes[1]!.id;
    const carga = ok(alterarLaje(p, id, { sobrecarga: 2.5 })).pavimento;
    expect(carga.vigas).toBe(p.vigas);
    // L2 passa a 4..8: as horizontais vão até 8 e a vertical da direita vai para x = 8
    const geo = ok(alterarLaje(p, id, { lx: 4 })).pavimento;
    expect(vigaEm(geo, 0, 5, 8, 5)).toBeDefined();
    expect(vigaEm(geo, 8, 0, 8, 5)).toBeDefined();
    expect(vigaEm(geo, 7.5, 0, 7.5, 5)).toBeUndefined();
  });
  it("recusa geometria que sobrepõe outra laje", () => {
    const p = duasLajes();
    expect(erro(alterarLaje(p, p.lajes[0]!.id, { lx: 4.5 }))).toMatch(
      /^A laje se sobrepõe à L2\. /,
    );
  });
});

describe("apagarLaje", () => {
  it("remove e regenera", () => {
    const p = duasLajes();
    const r = ok(apagarLaje(p, p.lajes[1]!.id)).pavimento;
    expect(r.lajes).toHaveLength(1);
    expect(r.vigas).toHaveLength(4);
    expect(r.pilares).toHaveLength(4);
  });
});

describe("apagarViga", () => {
  it("bordo de laje única vira livre e a viga não volta", () => {
    const p = duasLajes();
    const direita = vigaEm(p, 7.5, 0, 7.5, 5)!;
    const r = ok(apagarViga(p, direita.id)).pavimento;
    const l2 = r.lajes[1]!;
    expect(l2.vinculos).toEqual({ direito: "livre" });
    expect(r.lajes[0]!.vinculos).toEqual({});
    expect(vigaEm(r, 7.5, 0, 7.5, 5)).toBeUndefined();
    expect(r.vigas).toHaveLength(4);
    // os pilares da ponta direita continuam: são extremidades das horizontais
    expect(r.pilares).toHaveLength(6);
  });
  it("viga entre duas lajes: os dois bordos ficam livres", () => {
    const p = duasLajes();
    const meio = vigaEm(p, 4, 0, 4, 5)!;
    const r = ok(apagarViga(p, meio.id)).pavimento;
    expect(r.lajes[0]!.vinculos).toEqual({ direito: "livre" });
    expect(r.lajes[1]!.vinculos).toEqual({ esquerdo: "livre" });
    expect(vigaEm(r, 4, 0, 4, 5)).toBeUndefined();
  });
  it("viga contínua sobre duas lajes libera os bordos das duas", () => {
    const p = duasLajes();
    const inferior = vigaEm(p, 0, 0, 7.5, 0)!;
    const r = ok(apagarViga(p, inferior.id)).pavimento;
    expect(r.lajes.map((l) => l.vinculos)).toEqual([{ inferior: "livre" }, { inferior: "livre" }]);
    expect(vigaEm(r, 0, 0, 7.5, 0)).toBeUndefined();
    // os pilares de y = 0 ficam: são extremidades das vigas verticais
    expect(r.pilares).toHaveLength(6);
  });
  it("voltar o vínculo para auto recria a viga", () => {
    const p = duasLajes();
    const direita = vigaEm(p, 7.5, 0, 7.5, 5)!;
    const sem = ok(apagarViga(p, direita.id)).pavimento;
    const volta = ok(alterarLaje(sem, sem.lajes[1]!.id, { vinculos: {} })).pavimento;
    expect(vigaEm(volta, 7.5, 0, 7.5, 5)).toBeDefined();
  });
});

describe("pilares", () => {
  it("acrescenta pilar 20 × 20 sobre o eixo de uma viga, com nome livre", () => {
    const p = duasLajes();
    const r = ok(acrescentarPilar(p, { x: 2, y: 0 }));
    const novo = r.pavimento.pilares.find((q) => q.id === r.id)!;
    expect([novo.b, novo.h, novo.nome]).toEqual([20, 20, "P7"]);
  });
  it("recusa fora de viga e em cima de outro pilar", () => {
    const p = duasLajes();
    expect(erro(acrescentarPilar(p, { x: 2, y: 2 }))).toMatch(/eixo de uma viga/);
    expect(erro(acrescentarPilar(p, { x: 0, y: 0 }))).toMatch(/Já existe o pilar/);
  });
  it("apagar pilar gerado guarda a posição; pilar do usuário não", () => {
    const p = ok(acrescentarPilar(duasLajes(), { x: 2, y: 0 }));
    const canto = r(p.pavimento.pilares.find((q) => q.x === 0 && q.y === 0));
    const semCanto = ok(apagarPilar(p.pavimento, canto.id));
    expect(semCanto.gerado).toBe(true);
    expect(semCanto.pavimento.pilaresRemovidos).toEqual([{ x: 0, y: 0 }]);
    const meio = ok(apagarPilar(p.pavimento, p.id));
    expect(meio.gerado).toBe(false);
    expect(meio.pavimento.pilares).toHaveLength(6);
    expect(meio.pavimento.pilaresRemovidos).toEqual([]);
  });
  it("pilar apagado não volta ao regenerar; desenhar no ponto o traz de volta", () => {
    const p = duasLajes();
    const p2 = r(p.pilares.find((q) => q.x === 4 && q.y === 5));
    const sem = ok(apagarPilar(p, p2.id)).pavimento;
    // mudar a laje regenera: 5 pilares, nenhum em (4; 5)
    const regenerado = ok(
      alterarLaje(sem, sem.lajes[0]!.id, { vinculos: { esquerdo: "apoiado" } }),
    ).pavimento;
    expect(regenerado.pilares).toHaveLength(5);
    expect(regenerado.pilares.some((q) => q.x === 4 && q.y === 5)).toBe(false);
    expect(regenerado.pilaresRemovidos).toEqual([{ x: 4, y: 5 }]);
    // o ponto continua sobre a viga y = 5: desenhar ali tira a posição da lista
    const volta = ok(acrescentarPilar(regenerado, { x: 4, y: 5 })).pavimento;
    expect(volta.pilaresRemovidos).toEqual([]);
    const outra = ok(alterarLaje(volta, volta.lajes[0]!.id, { vinculos: {} })).pavimento;
    expect(outra.pilares).toHaveLength(6);
  });
  it("valida a seção", () => {
    const p = duasLajes();
    expect(erro(alterarPilar(p, p.pilares[0]!.id, { b: 0 }))).toMatch(/maiores que zero/);
    expect(ok(alterarPilar(p, p.pilares[0]!.id, { b: 30 })).pavimento.pilares[0]!.b).toBe(30);
  });
});

describe("alterarViga", () => {
  it("valida e altera sem regenerar", () => {
    const p = duasLajes();
    const id = p.vigas[0]!.id;
    expect(erro(alterarViga(p, id, { bw: -12 }))).toMatch(/bw/);
    expect(erro(alterarViga(p, id, { h: 0 }))).toMatch(/altura/);
    const r = ok(alterarViga(p, id, { cargaLinear: 5, nome: "VA" })).pavimento;
    expect(r.vigas[0]).toMatchObject({ cargaLinear: 5, nome: "VA" });
    expect(r.pilares).toBe(p.pilares);
  });
});

describe("substituirPavimento", () => {
  it("troca só o pavimento indicado", () => {
    const obra = obraNova("O", "nb1-78");
    const outro = pavimentoNovo("2");
    const o = { ...obra, pavimentos: [...obra.pavimentos, outro] };
    const novo = duasLajes();
    const r = substituirPavimento(o, outro.id, novo);
    expect(r.pavimentos[0]).toBe(o.pavimentos[0]);
    expect(r.pavimentos[1]).toBe(novo);
  });
});

function r<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("ausente");
  return v;
}

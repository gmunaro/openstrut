// Ligação viga-pilar no fluxo (NBR 6118:2023 14.6.6.1 c): negativo de extremidade
// das vigas e momentos de 1ª ordem dos pilares por nível; e o recálculo da laje
// ao lado de balanço curto. A NB-1/78 (V1) não faz nenhum dos dois.
// Valores esperados: as fórmulas de docs/LIGACAO-VIGA-PILAR.md feitas à mão com
// as cargas da montagem (no pavimento de um nível, conferidas também com
// ligacaoVigaPilar chamada com os lances do nível).
import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Obra } from "../dominio/obra";
import { calcularObra, type ResultadoObra } from "./fluxo";
import { nb178, nbr6118 } from "./normas";
import { ligacaoVigaPilar, type LancesDoPilar } from "./vigas/ligacaoPilar";

/** A obra de duas lajes (4 × 5 e 3,5 × 5 m, h 10, pilares 20 × 30, pé-direito 3 m). */
function obraDuasLajes(repeticoes = 1): Obra {
  const obra = obraNova("DUAS", "nbr6118-2023");
  let pav = { ...obra.pavimentos[0]!, nome: "TIPO", peDireito: 3, repeticoes };
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 });
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(pav, { x: 4, y: 0, lx: 3.5, ly: 5 });
  pav = gerarEstrutura({ ...pav, lajes: [l1, l2] });
  pav = { ...pav, pilares: pav.pilares.map((p) => ({ ...p, b: 20, h: 30 })) };
  return { ...obra, pavimentos: [pav] };
}

const pilarEm = (r: ResultadoObra, x: number, y: number, repeticao = 1) =>
  r.pilares.find((p) => p.pilar.x === x && p.pilar.y === y && p.repeticao === repeticao)!;

/** Viga montada horizontal (x) ou vertical (y) na coordenada c. */
const vigaEm = (r: ResultadoObra, horizontal: boolean, c: number) =>
  r.pavimentos[0]!.montagem.vigas.find(
    (v) => v.eixo.horizontal === horizontal && Math.abs(v.eixo.c - c) < 1e-9,
  )!;

// lance 20 × 30 de 3 m: r = I/(ℓ/2), ℓ/2 = 150 cm
const R_X = (30 * 20 ** 3) / 12 / 150; // 133,33 cm³ (b = 20 na direção x vai ao cubo)
const R_Y = (20 * 30 ** 3) / 12 / 150; // 300 cm³

describe("ligação viga-pilar no fluxo pela 6118: um pavimento", () => {
  const obra = obraDuasLajes();
  const r = calcularObra(obra, nbr6118);
  const pav = obra.pavimentos[0]!;
  // único nível: sem lance acima (cobertura) e lance mais baixo (base sem viga)
  const lances = Object.fromEntries(
    pav.pilares.map((p): [string, LancesDoPilar] => [
      p.id,
      { superior: null, inferior: { b: 20, h: 30, altura: 3 } },
    ]),
  );

  it("pilar de canto: Mx e My no topo pela repartição de Meng; base sem momento", () => {
    const v1 = vigaEm(r, true, 0); // y = 0, de x = 0 a 7,5 (pilar interno em x = 4)
    const v3 = vigaEm(r, false, 0); // x = 0, de y = 0 a 5
    // à mão: Meng = (g + q)·ℓ²/12; Minf = Meng·rinf/(rvig + rinf); viga saindo no
    // sentido + traciona a face − no topo do lance inferior
    const minf = (t: { g: number; q: number; vao: number }, bw: number, h: number, rp: number) => {
      const meng = ((t.g + t.q) * t.vao ** 2) / 12;
      const rv = (bw * h ** 3) / 12 / (t.vao * 100);
      return (meng * rp) / (rv + rp);
    };
    const mx = -minf(v1.tramos[0]!, v1.bw, v1.h, R_X);
    const my = -minf(v3.tramos[0]!, v3.bw, v3.h, R_Y);
    const p1 = pilarEm(r, 0, 0);
    expect(p1.momentos.mxTopo).toBeCloseTo(mx, 9);
    expect(p1.momentos.myTopo).toBeCloseTo(my, 9);
    expect(p1.momentos.mxBase).toBe(0);
    expect(p1.momentos.myBase).toBe(0);
    expect(Math.abs(mx)).toBeGreaterThan(1);
    // o mesmo valor por ligacaoVigaPilar chamada à mão
    const lig = ligacaoVigaPilar(v1, lances).extremidades.find((e) => e.no === 0)!;
    expect(p1.momentos.mxTopo).toBeCloseTo(lig.mTopoInferior, 12);
    expect(p1.resultado.memoria.some((e) => e.descricao.includes("[VERIFICAR]"))).toBe(true);
  });

  it("pilar de extremidade (x = 4): só My, da viga vertical que termina nele", () => {
    const v4 = vigaEm(r, false, 4);
    const p = pilarEm(r, 4, 0);
    const lig = ligacaoVigaPilar(v4, lances).extremidades.find((e) => e.no === 0)!;
    expect(lig.mTopoInferior).toBeLessThan(0);
    expect(p.momentos.myTopo).toBeCloseTo(lig.mTopoInferior, 12);
    // na viga horizontal y = 0 o pilar é interno: sem ligação
    expect(p.momentos.mxTopo).toBe(0);
    // no fim da viga (y = 5) a viga chega no sentido −: traciona a face +
    expect(pilarEm(r, 4, 5).momentos.myTopo).toBeCloseTo(-lig.mTopoInferior, 1);
    expect(pilarEm(r, 4, 5).momentos.myTopo).toBeGreaterThan(0);
  });

  it("vigas: negativo de extremidade = Mvig, dimensionado e no τc", () => {
    const v1 = r.pavimentos[0]!.vigas.find(
      (v) => v.viga.eixo.horizontal && Math.abs(v.viga.eixo.c) < 1e-9,
    )!;
    const lig = ligacaoVigaPilar(v1.viga, lances);
    const esq = lig.extremidades.find((e) => e.no === 0)!;
    const dir = lig.extremidades.find((e) => e.no === 2)!;
    // à mão: Mvig = Meng·rinf/(rvig + rinf) (sem lance superior)
    const t = v1.viga.tramos[0]!;
    const meng = ((t.g + t.q) * 16) / 12;
    const rv = (v1.viga.bw * v1.viga.h ** 3) / 12 / 400;
    expect(esq.mViga).toBeCloseTo((-meng * R_X) / (rv + R_X), 9);
    if (!v1.analise.ok) throw new Error("viga sem análise");
    // a envoltória rotulada dá 0 na ponta; vale Mvig
    expect(v1.analise.tramos[0]!.mNegEsq).toBeCloseTo(esq.mViga, 12);
    expect(v1.analise.tramos[1]!.mNegDir).toBeCloseTo(dir.mViga, 12);
    expect(v1.tramos[0]!.negativoEsq.flexao).not.toBeNull();
    expect(v1.tramos[1]!.negativoDir.flexao).not.toBeNull();
    expect(v1.analise.memoria.some((e) => e.formula === "M = mín(Menv; Mvig)")).toBe(true);
  });

  it("NB-1/78 (caminho do SISTRUT): sem ligação na viga; o pilar recebe o MEP do .REP", () => {
    const nb = calcularObra(obra, nb178);
    // a viga continua rotulada nos apoios extremos (VICALC)
    for (const v of nb.pavimentos[0]!.vigas) {
      if (!v.analise.ok) continue;
      expect(v.analise.tramos[0]!.mNegEsq).toBe(0);
      expect(v.tramos[0]!.negativoEsq.flexao).toBeNull();
    }
    // o .REP leva aos pilares extremos o momento de engastamento perfeito das vigas
    // (VIGA.BAS:7642-7656, 2416-2419; PLANO P12), que o PILGEEDI lê como Mk inicial
    const rep = nb.sistrut!.pavimentos[0]!.rep;
    const comMomento = rep.filter((l) => l.momentos.length > 0).map((l) => l.pilar);
    expect(comMomento.length).toBeGreaterThan(0);
    for (const p of nb.pilares) {
      const m = Math.abs(p.momentos.mxTopo) + Math.abs(p.momentos.myTopo);
      if (comMomento.includes(p.pilar.nome)) expect(m).toBeGreaterThan(0);
      else expect(m).toBe(0);
    }
  });
});

describe("ligação viga-pilar no fluxo pela 6118: pavimento-tipo repetido 3 vezes", () => {
  const obra = obraDuasLajes(3);
  const r = calcularObra(obra, nbr6118);
  const v1 = vigaEm(r, true, 0); // y = 0; P1 em x = 0 é o nó 0 (viga sai no sentido +)
  // à mão, em P1 na direção x: Meng = (g + q)·ℓ²/12 do 1º tramo; rvig = bw·h³/12/ℓ;
  // os lances acima e abaixo são 20 × 30 de 3 m (rsup = rinf = R_X).
  // 1ª repetição (topo, sem lance acima): Minf1 = Meng·R_X/(rvig + R_X)
  // 2ª e 3ª (lance do próprio tipo acima): Minf2 = Msup2 = Meng·R_X/(rvig + 2·R_X)
  // e Mvig2 = Meng·2·R_X/(rvig + 2·R_X). Sinais (viga saindo no sentido +): topo do
  // lance inferior −Minf; base do lance superior +Msup.
  const t = v1.tramos[0]!;
  const meng = ((t.g + t.q) * t.vao ** 2) / 12;
  const rv = (v1.bw * v1.h ** 3) / 12 / (t.vao * 100);
  const minf1 = (meng * R_X) / (rv + R_X);
  const m2 = (meng * R_X) / (rv + 2 * R_X); // Minf2 = Msup2
  const mvig2 = (meng * 2 * R_X) / (rv + 2 * R_X);

  it("Eq. 90 de Bastos: topo e base de cada lance com metade da outra ponta", () => {
    // lance 1 (sob a 1ª repetição): topo = −Minf1 − Msup2/2; base = Msup2 + Minf1/2
    const l1 = pilarEm(r, 0, 0, 1).momentos;
    expect(l1.mxTopo).toBeCloseTo(-minf1 - m2 / 2, 9);
    expect(l1.mxBase).toBeCloseTo(m2 + minf1 / 2, 9);
    // viga do mesmo lado nos dois níveis: sinais opostos (curvatura dupla)
    expect(Math.sign(l1.mxTopo)).toBe(-Math.sign(l1.mxBase));
    // lance 2: topo = −Minf2 − Msup2/2; base = Msup2 + Minf2/2 (Minf2 = Msup2)
    const l2 = pilarEm(r, 0, 0, 2).momentos;
    expect(l2.mxTopo).toBeCloseTo(-1.5 * m2, 9);
    expect(l2.mxBase).toBeCloseTo(1.5 * m2, 9);
    // lance mais baixo: só o topo, base sem momento
    const l3 = pilarEm(r, 0, 0, 3).momentos;
    expect(l3.mxTopo).toBeCloseTo(-m2, 9);
    expect(l3.mxBase).toBe(0);
    expect(m2).toBeGreaterThan(1);
  });

  it("viga do tipo: o maior |Mvig| entre as repetições", () => {
    // com lance acima, rinf + rsup cresce e Mvig também: Mvig2 > Mvig1 = Minf1
    expect(mvig2).toBeGreaterThan(minf1);
    const rv1 = r.pavimentos[0]!.vigas.find((v) => v.viga.id === v1.id)!;
    if (!rv1.analise.ok) throw new Error("viga sem análise");
    expect(rv1.analise.tramos[0]!.mNegEsq).toBeCloseTo(-mvig2, 9);
  });
});

describe("laje ao lado de balanço curto pela 6118: refeita com o bordo apoiado", () => {
  // L1 4 × 4 com o superior engastado no balanço L2 (0,2 m) = tipo 2A, λ = 1:
  // μx 2,91 (Bares A-8). O X do balanço (p·0,2²/2) é bem menor que o de L1 e a
  // compatibilização o impõe; com o bordo apoiado L1 é tipo 1: μx = 4,23.
  // p = 0,10·25 + 1 + 1,5 = 5 kN/m²; m = μ·p·lx²/100.
  function obraBalanco(norma: Obra["norma"]): Obra {
    const obra = obraNova("BAL", norma);
    let pav = obra.pavimentos[0]!;
    const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 4 });
    pav = { ...pav, lajes: [l1] };
    const l2 = lajeNova(
      pav,
      { x: 0, y: 4, lx: 4, ly: 0.2 },
      { vinculos: { esquerdo: "livre", direito: "livre", superior: "livre" } },
    );
    pav = gerarEstrutura({ ...pav, lajes: [l1, l2] });
    return { ...obra, pavimentos: [pav] };
  }
  const base = (5 * 16) / 100;

  it("mx sobe de 2,91 para 4,23 (Bares A-8) só na 6118", () => {
    const r = calcularObra(obraBalanco("nbr6118-2023"), nbr6118);
    const l1 = r.pavimentos[0]!.lajes.find((l) => l.laje.nome === "L1")!;
    expect(l1.esforcos.mx).toBeCloseTo(4.23 * base, 9);
    expect(l1.esforcos.negativos.superior).toBeCloseTo((5 * 0.2 ** 2) / 2, 9);
    // sem o recálculo (a mesma 6118 sem a flag) fica o tipo 2A
    const sem = calcularObra(obraBalanco("nbr6118-2023"), {
      ...nbr6118,
      recalculaBordoAliviado: false,
    });
    expect(sem.pavimentos[0]!.lajes.find((l) => l.laje.nome === "L1")!.esforcos.mx).toBeCloseTo(
      2.91 * base,
      9,
    );
  });
});

// A projeção do caminho do SISTRUT no ResultadoObra da V2 (fluxoSistrut.ts) contra o
// próprio resultado do original (`resultado.sistrut`), que sistrut/obra.test.ts confere
// contra o oráculo. Aqui o esperado é a conversão de unidades (1 t = 9,80665 kN), a
// estática de cada tramo sobre as cargas do .VIG e as regras de direção e de índice
// escritas em cada caso; nenhum número vem da própria projeção.
import { describe, expect, it } from "vitest";
import type { Obra } from "../dominio/obra";
import { calcularObra } from "./fluxo";
import { nb178 } from "./normas";
import { obraE2E } from "./sistrut/__e2e__/obraE2E";
import { obraVBX } from "./sistrut/__e2e__/obraVBX";
import type { DadosViga, TramoViga } from "./sistrut/base/tipos";
import { KN_POR_TF } from "./unidades";

const kn = (t: number) => t * KN_POR_TF;

/** Espelha a obra em x (x → 8 − x): o balanço direito vira esquerdo. */
function espelhada(obra: Obra): Obra {
  const pav = obra.pavimentos[0]!;
  const m = (x: number) => 8 - x;
  return {
    ...obra,
    pavimentos: [
      {
        ...pav,
        lajes: pav.lajes.map((l) => ({ ...l, x: m(l.x + l.lx) })),
        vigas: pav.vigas.map((v) => {
          const [a, b] = [m(v.x1), m(v.x2)];
          return { ...v, x1: Math.min(a, b), x2: Math.max(a, b) };
        }),
        pilares: pav.pilares.map((p) => ({ ...p, x: m(p.x) })),
      },
    ],
  };
}

/** Carga total de um tramo do .VIG, t (Σ P·ΔD + F). No balanço esquerdo o .VIG guarda
 *  da ponta para o apoio; a soma não depende da ordem se ela for percorrida no sentido
 *  em que D cresce. */
function cargaDoTramo(t: TramoViga) {
  const divs = [...t.divisoes].sort((a, b) => a.d - b.d);
  let anterior = 0;
  let total = 0;
  for (const d of divs) {
    total += d.p * (d.d - anterior) + d.f;
    anterior = d.d;
  }
  return total;
}
const cargaDaViga = (d: DadosViga) =>
  [d.balancoEsquerdo, ...d.tramos, d.balancoDireito].reduce(
    (s, t) => s + (t ? cargaDoTramo(t) : 0),
    0,
  );

describe.each([
  ["E2E", obraE2E("original")],
  ["VBX", obraVBX("original")],
  ["VBX espelhada (balanço esquerdo)", espelhada(obraVBX("original"))],
  ["VBX corrigido", obraVBX("corrigido")],
] as const)("projeção da obra %s", (_, obra) => {
  const r = calcularObra(obra, nb178);
  const rp = r.pavimentos[0]!;
  const ps = r.sistrut!.pavimentos[0]!;

  it("equilíbrio fecha e não há falha", () => {
    expect(rp.falhas).toEqual([]);
    expect(rp.equilibrio.avisos).toEqual([]);
    expect(rp.equilibrio.ok).toBe(true);
  });

  it("vigas: M e V das pontas de cada tramo e do balanço = os do VICALC, em kN", () => {
    for (const v of rp.vigas) {
      const a = ps.analises.find((x) => x.nome === v.viga.nome)!;
      if (!v.analise.ok) throw new Error(`${v.viga.nome} sem análise`);
      const dados = ps.vigasVig.find((x) => x.nome === v.viga.nome)!;
      const be = dados.balancoEsquerdo ? 1 : 0;
      v.analise.tramos.forEach((t, i) => {
        const ultimo = t.pontos.at(-1)!;
        if (!t.balanco) {
          const k = i - be;
          // diagrama: começa no M do apoio esquerdo e termina no do direito (estática)
          expect(t.pontos[0]!.mMax).toBeCloseTo(kn(a.apoios[k]!.m), 4);
          expect(ultimo.mMax).toBeCloseTo(kn(a.apoios[k + 1]!.m), 3);
          expect(t.vEsq).toBeCloseTo(kn(Math.abs(a.tramos[k]!.ve)), 6);
          expect(t.vDir).toBeCloseTo(kn(Math.abs(a.tramos[k]!.vd)), 6);
          return;
        }
        const esquerdo = i === 0 && be === 1;
        const bal = esquerdo ? a.balancoEsquerdo! : a.balancoDireito!;
        const mApoio = esquerdo ? a.apoios[0]!.m : a.apoios.at(-1)!.m;
        // cortante no apoio = carga do balanço; momento: o do apoio no lado do apoio, 0 na ponta
        // (a projeção soma o .VIG em float64; o VICALC guarda em SINGLE)
        expect(esquerdo ? t.vDir : t.vEsq).toBeCloseTo(kn(bal.carga), 4);
        expect(esquerdo ? t.mNegDir : t.mNegEsq).toBeCloseTo(kn(mApoio), 6);
        const [ponta, apoio] = esquerdo ? [t.pontos[0]!, ultimo] : [ultimo, t.pontos[0]!];
        expect(ponta.mMax).toBeCloseTo(0, 6);
        expect(apoio.mMax).toBeCloseTo(kn(mApoio), 3);
      });
    }
  });

  it("vigas montadas: Σ (g + q)·vão + concentradas = carga do .VIG", () => {
    for (const v of rp.montagem.vigas) {
      const dados = ps.vigasVig.find((x) => x.nome === v.nome)!;
      const projetada = v.tramos.reduce(
        (s, t) => s + (t.g + t.q) * t.vao + t.concentradas.reduce((c, f) => c + f.g + f.q, 0),
        0,
      );
      expect(projetada).toBeCloseTo(kn(cargaDaViga(dados)), 4);
    }
  });

  it("pilares: Nk e Mk do PILAREDI em kN; Md = γf·Mk; bitolas nominais", () => {
    for (const p of r.pilares) {
      const l = r.sistrut!.lances.find(
        (x) => x.pilarId === p.pilar.id && x.pavimentoId === p.pavimentoId,
      )!;
      expect(p.nk).toBeCloseTo(kn(l.carga.nk), 6);
      expect(p.resultado.mdX).toBeCloseTo(1.4 * p.resultado.mkX!, 6);
      expect([0, 10, 12.5, 16, 20, 25, 32]).toContain(p.resultado.barras.phi);
    }
  });
});

describe("balanço esquerdo com duas divisões de carga (caso check2 da revisão)", () => {
  // VBX espelhada com a laje sobre o balanço esquerdo dividida em duas (x 0..2 com
  // sobrecarga 5 kN/m² e 2..4 com 0,5): o .VIG grava as divisões da ponta para o apoio.
  // A divisa x = 2 não tem viga (falha esperada); aqui só as vigas importam.
  const base = espelhada(obraVBX("original"));
  const pav = base.pavimentos[0]!;
  const l0 = pav.lajes[0]!;
  const obra: Obra = {
    ...base,
    pavimentos: [
      {
        ...pav,
        lajes: [
          { ...l0, id: "La", nome: "La", x: 0, lx: 2, sobrecarga: 5 },
          { ...l0, id: "Lb", nome: "Lb", x: 2, lx: 2, sobrecarga: 0.5 },
          { ...l0, id: "Lc", nome: "Lc", x: 4, lx: 4 },
        ],
      },
    ],
  };
  const r = calcularObra(obra, nb178);
  const ps = r.sistrut!.pavimentos[0]!;
  it("o .VIG tem duas divisões no balanço esquerdo", () => {
    expect(ps.vigasVig.find((v) => v.nome === "V1")!.balancoEsquerdo!.divisoes).toHaveLength(2);
  });
  it("cortante e momento no apoio do balanço = os do VICALC; ponta livre com M = 0", () => {
    for (const nome of ["V1", "V2"]) {
      const v = r.pavimentos[0]!.vigas.find((x) => x.viga.nome === nome)!;
      const a = ps.analises.find((x) => x.nome === nome)!;
      if (!v.analise.ok) throw new Error("sem análise");
      const t = v.analise.tramos[0]!;
      expect(t.balanco).toBe(true);
      expect(t.vDir).toBeCloseTo(kn(a.balancoEsquerdo!.carga), 4);
      expect(t.pontos[0]!.mMax).toBeCloseTo(0, 6);
      expect(t.pontos.at(-1)!.mMax).toBeCloseTo(kn(a.apoios[0]!.m), 3);
    }
  });
  it("Σ cargas das vigas montadas = .VIG (sem inflar o balanço)", () => {
    for (const v of r.pavimentos[0]!.montagem.vigas) {
      const dados = ps.vigasVig.find((x) => x.nome === v.nome)!;
      const projetada = v.tramos.reduce(
        (s2, t) => s2 + (t.g + t.q) * t.vao + t.concentradas.reduce((c, f) => c + f.g + f.q, 0),
        0,
      );
      expect(projetada).toBeCloseTo(kn(cargaDaViga(dados)), 4);
    }
  });
});

describe("carga de viga sobre viga: g e q da reação indexada", () => {
  // V5 apoiada nas pontas dos balanços da V1 e da V2: a concentrada na ponta é a
  // reação da V5, e a parte permanente é a reação da V5 só com as cargas permanentes.
  const r = calcularObra(obraVBX("original"), nb178);
  const vigas = r.pavimentos[0]!.montagem.vigas;
  it("na ponta do balanço: g = reação permanente e q = acidental da V5", () => {
    const v5 = vigas.find((v) => v.nome === "V5")!;
    for (const [nome, no] of [
      ["V2", 0],
      ["V1", 1],
    ] as const) {
      const c = vigas.find((v) => v.nome === nome)!.tramos.at(-1)!.concentradas[0]!;
      expect(c.origem).toBe("V5");
      // o original trunca a indexada em 1 kg (INT(R·1000)/1000): tolerância de 0,01 kN
      expect(c.g).toBeCloseTo(v5.analise.reacoes[no]!.g, 1);
      expect(c.q).toBeCloseTo(v5.analise.reacoes[no]!.q, 1);
      expect(c.q).toBeGreaterThan(0);
    }
  });
});

describe("direção do M+ principal pelo μ", () => {
  // E2E com x e y trocados: lajes 5 × 4, a corda em x passa a ser a maior e o μ > 1;
  // o M+ sem redução age em y (lado vertical com fator 1/μ; fatorDeDirecao).
  const base = obraE2E("original");
  const pav = base.pavimentos[0]!;
  const trocada: Obra = {
    ...base,
    pavimentos: [
      {
        ...pav,
        lajes: pav.lajes.map((l) => ({ ...l, x: l.y, y: l.x, lx: l.ly, ly: l.lx })),
        vigas: pav.vigas.map((v) => ({ ...v, x1: v.y1, y1: v.x1, x2: v.y2, y2: v.x2 })),
        pilares: pav.pilares.map((p) => ({ ...p, x: p.y, y: p.x })),
      },
    ],
  };
  const casos = [
    ["μ < 1 (4 × 5): principal em x", base, false],
    ["μ > 1 (5 × 4): principal em y", trocada, true],
  ] as const;
  it.each(casos)("%s", (_, obra, emY) => {
    const r = calcularObra(obra, nb178);
    const ps = r.sistrut!.pavimentos[0]!;
    for (const l of r.pavimentos[0]!.lajes) {
      const m = ps.esforcos.momentos[l.laje.nome]!;
      const mu = ps.esforcos.lajes.find((x) => x.nome === l.laje.nome)!.mu;
      expect(mu > 1).toBe(emY);
      const [mx, my] = emY
        ? [m.mPositivoSecundarioTcm, m.mPositivoPrincipalTcm]
        : [m.mPositivoPrincipalTcm, m.mPositivoSecundarioTcm];
      expect(l.esforcos.mx).toBeCloseTo(kn(mx / 100), 6);
      expect(l.esforcos.my).toBeCloseTo(kn(my / 100), 6);
      // o vão curto leva o momento maior
      const curtoEmY = l.laje.ly < l.laje.lx;
      expect(l.esforcos.my > l.esforcos.mx).toBe(curtoEmY);
      const pos = ps.lajeproc.positivas[l.laje.nome]!;
      expect(l.armadura.asy).toBe((emY ? pos.principal : pos.secundaria).as);
    }
  });
});

describe("falhas que o caminho do SISTRUT marca", () => {
  it("pilar que some num pavimento do meio: nasce sobre viga de transição, carga da base como falha", () => {
    const base = obraE2E("original");
    const pav = base.pavimentos[0]!;
    const meio = {
      ...pav,
      id: "MEIO",
      nome: "MEIO",
      pilares: pav.pilares.filter((p) => p.nome !== "P5"),
    };
    const obra: Obra = {
      ...base,
      pavimentos: [
        { ...pav, id: "COB", nome: "COB" },
        meio,
        { ...pav, id: "TERREO", nome: "TERREO" },
      ],
    };
    const r = calcularObra(obra, nb178);
    const falhas = r.pavimentos.flatMap((p) => p.falhas.map((f) => `${p.pavimento.id}: ${f}`));
    // o P5 do COB é uma coluna que nasce no nível do MEIO (PILGEEDI com nível inferior
    // > 1): o PILAREDI a dimensiona; a carga na base, 17,37 + 0,20·0,20·3·2,5 = 17,67 t,
    // fica para a viga de transição do MEIO, e sem `transicao` é falha ali
    const daBase = falhas.find((f) => f.startsWith("MEIO: Pilar P5 do pavimento COB"));
    expect(daBase).toContain("17,67 t");
    // a falha aponta a opção do pilar, com id estável
    expect(r.avisosComOpcao?.filter((a) => a.elemento.tipo === "pilar")).toEqual([
      {
        id: "pilar.nasce-em-transicao",
        pavimentoId: "MEIO",
        elemento: {
          tipo: "pilar",
          id: obra.pavimentos.find((p) => p.id === "COB")!.pilares.find((q) => q.nome === "P5")!.id,
        },
        texto: daBase!.slice("MEIO: ".length),
      },
    ]);
    expect(daBase).toContain('marque "Nasce sobre viga de transição" no pilar');
    expect(falhas.some((f) => f.includes("não foi levada a nenhuma coluna"))).toBe(false);
    const p5 = r.pilares.filter((p) => p.pilar.nome === "P5");
    expect(p5.map((p) => p.pavimentoId).sort()).toEqual(["COB", "TERREO"]);
    // com `transicao`, a falha vira aviso no lance
    const comTransicao: Obra = {
      ...obra,
      pavimentos: obra.pavimentos.map((p) =>
        p.id !== "COB"
          ? p
          : {
              ...p,
              pilares: p.pilares.map((q) =>
                q.nome === "P5" ? { ...q, transicao: true as const } : q,
              ),
            },
      ),
    };
    const r2 = calcularObra(comTransicao, nb178);
    expect(r2.pavimentos.flatMap((p) => p.falhas).some((f) => f.includes("nasce acima"))).toBe(
      false,
    );
    const cob = r2.pilares.find((p) => p.pilar.nome === "P5" && p.pavimentoId === "COB")!;
    expect(cob.resultado.avisos.some((a) => a.includes("viga de transição"))).toBe(true);
  });

  it("laje com os quatro bordos livres: sem mecanismo, falha explícita e momentos 0", () => {
    const base = obraE2E("original");
    const pav = base.pavimentos[0]!;
    const livre = {
      esquerdo: "livre",
      inferior: "livre",
      direito: "livre",
      superior: "livre",
    } as const;
    const obra: Obra = {
      ...base,
      pavimentos: [{ ...pav, lajes: [{ ...pav.lajes[0]!, vinculos: livre }] }],
    };
    const rp = calcularObra(obra, nb178).pavimentos[0]!;
    const l = rp.lajes[0]!;
    expect(Number.isFinite(l.esforcos.mx)).toBe(true);
    expect(l.esforcos.mx).toBe(0);
    expect(rp.falhas.some((f) => f.startsWith(`Laje ${l.laje.nome} sem cálculo`))).toBe(true);
  });

  it("lajes contínuas sem viga embaixo: a reação da divisa vai ao 'total dos pilares' e é falha", () => {
    // VBX com a L2 (sobre os balanços) dividida em duas: a divisa x = 6 não tem viga
    const base = obraVBX("original");
    const pav = base.pavimentos[0]!;
    const l0 = pav.lajes[0]!;
    const obra: Obra = {
      ...base,
      pavimentos: [
        {
          ...pav,
          lajes: [
            { ...l0, id: "L1", nome: "L1", x: 0, lx: 4 },
            { ...l0, id: "Lb", nome: "Lb", x: 4, lx: 2 },
            { ...l0, id: "Lc", nome: "Lc", x: 6, lx: 2 },
          ],
        },
      ],
    };
    const r = calcularObra(obra, nb178);
    const ps = r.sistrut!.pavimentos[0]!;
    // os bordos de Lb e Lc sobre os balanços acham o trecho de viga (vértice inserido
    // em x = 6); só os da divisa vão aos pilares
    const semViga = ps.montagem.avisos.filter((a) => a.includes("nenhuma viga com trecho"));
    expect(semViga.map((a) => a.split(",")[0]).sort()).toEqual(["Laje Lb", "Laje Lc"]);
    expect(ps.montagem.totais.pilares).toBeGreaterThan(0);
    expect(r.pavimentos[0]!.falhas.some((f) => f.startsWith("Bordos de laje sem viga"))).toBe(true);
  });
});

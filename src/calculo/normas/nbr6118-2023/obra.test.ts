// Integração: a obra de duas lajes lado a lado (a FLUXO da V1, 4 × 5 e 3,5 × 5 m,
// h 10 cm, revestimento 1,0 e sobrecarga 1,5 kN/m²) calculada inteira pela
// NBR 6118:2023, com C25, CA-50 e cobrimento de laje 2,5 cm (padrão da obra
// nova), e comparada com a NB-1/78 da mesma obra.
//
// Diferenças esperadas em relação à NB-1/78 (o mesmo carregamento, p = 5 kN/m²):
// - momentos: a NB-1/78 usa charneiras plásticas com i = X/m = 2 e vãos
//   reduzidos; a 6118 usa a teoria elástica (tabelasBares). O positivo elástico do
//   tipo 2B fica ~25 % acima e o negativo ~60 % acima do plástico;
// - compatibilização: a NB-1/78 toma max(média; 0,8 maior); a 6118, o maior;
// - reações: as duas repartem pelo bordo engastado, mas as tabelas de Pinheiro
//   consideram os alívios pela metade, e a soma passa da carga em ~5 %;
// - flecha: a NB-1/78 multiplica a parcela permanente por 3 com Ec secante; a
//   6118 usa a combinação quase permanente (g + 0,3 q) e αf = 1,32.
import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../../../dominio/criar";
import { gerarEstrutura } from "../../../dominio/gerar";
import type { Obra } from "../../../dominio/obra";
import { calcularObra } from "../../fluxo";
import { nb178, nbr6118, normaPorId } from "..";

function obraDuasLajes(): Obra {
  const obra = obraNova("DUAS", "nbr6118-2023");
  let pav = { ...obra.pavimentos[0]!, nome: "TIPO", peDireito: 3 };
  const cargas = { h: 10, revestimento: 1, sobrecarga: 1.5 };
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 }, cargas);
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(pav, { x: 4, y: 0, lx: 3.5, ly: 5 }, cargas);
  pav = gerarEstrutura({ ...pav, lajes: [l1, l2] });
  pav = { ...pav, pilares: pav.pilares.map((p) => ({ ...p, b: 20, h: 30 })) };
  return { ...obra, pavimentos: [pav] };
}

const perto = (valor: number, esperado: number, tol: number) =>
  expect(Math.abs(valor - esperado)).toBeLessThanOrEqual(tol);

describe("obra de duas lajes pela NBR 6118:2023", () => {
  const obra = obraDuasLajes();
  const r = calcularObra(obra, nbr6118);
  const pav = r.pavimentos[0]!;
  const laje = (nome: string) => pav.lajes.find((l) => l.laje.nome === nome)!;
  const nb = calcularObra(obra, nb178).pavimentos[0]!;
  const lajeNb = (nome: string) => nb.lajes.find((l) => l.laje.nome === nome)!;

  it("a norma está registrada", () => {
    expect(normaPorId("nbr6118-2023")).toBe(nbr6118);
  });

  it("lajes: tipo 2B, com os coeficientes da tabela (conta à mão)", () => {
    // p = 0,10 · 25 + 1 + 1,5 = 5 kN/m². L1: λ = 1,25 → μx 4,56; μ'x 10,07; μy 2,51;
    // νx 3,06; ν'x 4,48; νy 1,83 (tabelasBares).
    const l1 = laje("L1").esforcos;
    perto(l1.mx, 4.56 * 0.8, 1e-9);
    perto(l1.my, 2.51 * 0.8, 1e-9);
    perto(l1.reacoes.direito, 4.48 * 2, 1e-9);
    perto(l1.reacoes.esquerdo, 3.06 * 2, 1e-9);
    perto(l1.reacoes.inferior, 1.83 * 2, 1e-9);
    // L2: λ = 5/3,5 = 1,4286, entre 1,40 (μ'x 10,76) e 1,45 (10,95): X = 6,66 < 8,06 de L1.
    // Compatibilizado: o maior, 10,07 · 0,8 = 8,056, nas duas.
    perto(l1.negativos.direito, 10.07 * 0.8, 1e-9);
    perto(laje("L2").esforcos.negativos.esquerdo, 10.07 * 0.8, 1e-9);
    // flecha L1: Ma = 3,64 < Mr = 6,41 (estádio I); α = 4,29 (2B, λ 1,25);
    // ai = 4,29/1200 · (3,5 + 0,3 · 1,5) · 4⁴ / (24 150 · 10³ · 0,1³/12) = 0,1797 cm;
    // at = 2,32 ai = 0,417 cm < 400/250 = 1,6 cm
    perto(l1.flecha, ((4.29 / 1200) * 3.95 * 256 * 100 * 2.32) / ((24150e3 * 0.001) / 12), 1e-9);
    expect(l1.flecha).toBeLessThan(l1.flechaLimite);
  });

  it("lajes: resultados finitos e plausíveis, sem avisos", () => {
    for (const l of pav.lajes) {
      const { esforcos: e, armadura: a } = l;
      expect(e.avisos).toEqual([]);
      expect(a.avisos).toEqual([]);
      expect(e.flecha).toBeGreaterThan(0);
      expect(e.flecha).toBeLessThan(e.flechaLimite);
      for (const v of [a.asx, a.asy, ...Object.values(a.asNegativos)]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
      expect(a.barrasX.phi).toBeGreaterThan(0);
      expect(a.barrasX.espacamento).toBeLessThanOrEqual(20);
    }
  });

  it("equilíbrio: lajes → vigas → pilares fecha; Σ reações das lajes passa da carga em ~5 %", () => {
    const eq = pav.equilibrio;
    perto(eq.lajesNasVigas / eq.reacoesLajes, 1, 1e-6);
    perto(eq.cargaPilares / eq.cargaVigas, 1, 1e-6);
    perto(eq.cargaLajes, 5 * (20 + 17.5), 1e-9);
    // L1: (6,12 + 8,96) · 5 + 3,66 · 2 · 4 = 104,68 kN; L2: (νx 3,2229 + ν'x 4,7143)
    // · 1,75 · 5 + 1,83 · 1,75 · 2 · 3,5 = 91,87 kN (interpolados em λ = 1,4286)
    perto(eq.reacoesLajes, 104.68 + 91.87, 0.02);
    // ~5 % acima da carga (alívios pela metade, scripts/bares/reacoes.ts): folga a favor
    // da segurança, aceita até 8 % por montagem.ts; o restante da cadeia fecha exato
    expect(eq.avisos).toEqual([]);
    expect(eq.ok).toBe(true);
  });

  it("vigas e pilares: calculados, finitos e sem esmagamento", () => {
    expect(pav.montagem.naoCalculadas).toEqual([]);
    for (const v of pav.vigas) {
      expect(v.analise.ok).toBe(true);
      for (const t of v.tramos) {
        if (t.positivo.flexao) expect(Number.isFinite(t.positivo.flexao.as)).toBe(true);
        expect(t.cortante.bielaOk).toBe(true);
        expect(t.estribo).not.toBeNull();
      }
    }
    expect(r.pilares.length).toBeGreaterThan(0);
    for (const p of r.pilares) {
      expect(p.nk).toBeGreaterThan(0);
      expect(Number.isFinite(p.resultado.asNecessaria)).toBe(true);
    }
  });

  it("ordens de grandeza contra a NB-1/78 da mesma obra", () => {
    const [a, b] = [laje("L1").esforcos, lajeNb("L1").esforcos];
    // positivo elástico (teoria de placas) acima do plástico: 3,65 contra ~3,4 da NB-1/78
    // pelo SISTRUT (padrão de charneiras com termos de canto e μ da tabela; a V1 antiga,
    // com Johansen e i = 2, dava ~2,9)
    expect(a.mx / b.mx).toBeGreaterThan(1.0);
    expect(a.mx / b.mx).toBeLessThan(1.5);
    // negativo elástico bem acima do plástico com i = 2: 8,06 contra ~5,0
    expect(a.negativos.direito / b.negativos.direito).toBeGreaterThan(1.3);
    expect(a.negativos.direito / b.negativos.direito).toBeLessThan(2);
    // reação no bordo engastado: as duas ~9 kN/m
    expect(a.reacoes.direito / b.reacoes.direito).toBeGreaterThan(0.9);
    expect(a.reacoes.direito / b.reacoes.direito).toBeLessThan(1.15);
    // carga total nos pilares: a 6118 ~5 % maior (alívios pela metade)
    const razao = pav.equilibrio.cargaPilares / nb.equilibrio.cargaPilares;
    expect(razao).toBeGreaterThan(1);
    expect(razao).toBeLessThan(1.06);
  });
});

// Viga sobre as pontas de dois balanços (a obra VBX do v2par_viga_fluxo, pela 6118):
// pilares só em x = 0 e x = 4; as vigas y = 0 e y = 5 têm balanço de 4 m e a x = 8
// termina nas pontas deles. Antes a V2 deixava a x = 8 sem apoio (não calculada, e a
// carga da laje sobre ela não chegava aos pilares); agora ela se apoia nas pontas
// (geometriaDasVigas), como no LAJEMONT. Conta à mão: viga x = 8 biapoiada de 5 m com
// carga uniforme w (média da V2) → cada ponta de balanço recebe 5w/2.
describe("NBR 6118: viga apoiada nas pontas de dois balanços", () => {
  const obra = obraNova("VBX", "nbr6118-2023");
  const base = { ...obra.pavimentos[0]!, peDireito: 3 };
  const cargas = { h: 10, revestimento: 1, sobrecarga: 1.5 };
  const l1 = lajeNova(base, { x: 0, y: 0, lx: 4, ly: 5 }, cargas);
  const l2 = lajeNova({ ...base, lajes: [l1] }, { x: 4, y: 0, lx: 4, ly: 5 }, cargas);
  const viga = (id: string, x1: number, y1: number, x2: number, y2: number) => ({
    id,
    nome: id,
    x1,
    y1,
    x2,
    y2,
    bw: 12,
    h: 40,
    cargaLinear: 0,
  });
  const pav = {
    ...base,
    lajes: [l1, l2],
    vigas: [
      viga("V1", 0, 5, 8, 5),
      viga("V2", 0, 0, 8, 0),
      viga("V3", 0, 0, 0, 5),
      viga("V4", 4, 0, 4, 5),
      viga("V5", 8, 0, 8, 5),
    ],
    pilares: [
      { id: "P1", nome: "P1", x: 0, y: 0, b: 20, h: 20 },
      { id: "P2", nome: "P2", x: 4, y: 0, b: 20, h: 20 },
      { id: "P3", nome: "P3", x: 4, y: 5, b: 20, h: 20 },
      { id: "P4", nome: "P4", x: 0, y: 5, b: 20, h: 20 },
    ],
  };
  const r = calcularObra({ ...obra, pavimentos: [pav] }, nbr6118).pavimentos[0]!;
  const montada = (nome: string) => r.montagem.vigas.find((v) => v.nome === nome)!;

  it("a V5 é calculada, apoiada em V2 e V1; nenhuma viga fica sem cálculo", () => {
    expect(r.montagem.naoCalculadas).toEqual([]);
    expect(montada("V5").apoios.map((a) => (a.tipo === "viga" ? a.nome : a.tipo))).toEqual([
      "V2",
      "V1",
    ]);
  });

  it("cada ponta de balanço recebe 5w/2 da V5 e o equilíbrio fecha", () => {
    const t = montada("V5").tramos[0]!;
    const w = t.g + t.q;
    for (const nome of ["V1", "V2"]) {
      const balanco = montada(nome).tramos.at(-1)!;
      expect(balanco.concentradas).toHaveLength(1);
      const c = balanco.concentradas[0]!;
      expect(c.origem).toBe("V5");
      expect(c.a).toBeCloseTo(4, 9);
      expect(c.g + c.q).toBeCloseTo((5 * w) / 2, 6);
    }
    expect(r.equilibrio.ok).toBe(true);
  });
});

// Ligação cálculo → detalhamento de vigas, lajes e pilares. A obra tem duas lajes (4 × 5 e
// 3,5 × 5 m) num pavimento-tipo repetido 2 vezes, com pilares 30 × 20 (b em x,
// h em y). As larguras dos apoios são escritas à mão: viga horizontal apoia na
// dimensão b = 30 dos pilares; vertical, na h = 20. Cada viga é conferida contra
// detalharViga chamado direto com essa entrada escrita no teste.
import { describe, expect, it } from "vitest";
import { detalharLaje, regrasLaje } from "../calculo/detalhamento/lajes";
import { detalharPilar, regrasPilar } from "../calculo/detalhamento/pilares";
import { detalharViga, regrasDetalhamento } from "../calculo/detalhamento/vigas";
import type { VigaMontada } from "../calculo/montagem";
import { lajeNova, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Bordo, Obra, Pavimento } from "../dominio/obra";
import { calcular, coletarAvisos } from "./calculo";
import {
  detalharLajesObra,
  detalharObra,
  detalharVigasObra,
  larguraApoios,
  tabelaAcoObra,
  type DetalhamentoObra,
} from "./detalhamento";

function obraDuasLajes(norma: Obra["norma"]): Obra {
  const obra = obraNova("Duas lajes", norma);
  let pav = { ...obra.pavimentos[0]!, nome: "Tipo", repeticoes: 2 };
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 });
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(pav, { x: 4, y: 0, lx: 3.5, ly: 5 });
  const gerado = gerarEstrutura({ ...pav, lajes: [l1, l2] });
  const pilares = gerado.pilares.map((p) => ({ ...p, b: 30, h: 20 }));
  return { ...obra, pavimentos: [{ ...gerado, pilares }] };
}

/** Σ quantidade × comprimento das posições, cm. */
const somaComprimentos = (ps: readonly { quantidade: number; comprimento: number }[]) =>
  ps.reduce((s, p) => s + p.quantidade * p.comprimento, 0);

describe.each<Obra["norma"]>(["nb1-78", "nbr6118-2023"])("detalharVigasObra pela %s", (norma) => {
  const obra = obraDuasLajes(norma);
  const c = calcular(obra);
  if (c.tipo !== "ok") throw new Error("cálculo falhou");
  const r = c.resultado;
  const rp = r.pavimentos[0]!;
  const det = detalharObra(r, obra);

  it("os avisos do detalhamento (vigas, lajes, pilares) entram na lista geral", () => {
    const doDetalhamento = [
      ...det.vigas.flatMap((v) => v.detalhamento.avisos),
      ...det.lajes.lajes.flatMap((l) => l.detalhamento.avisos),
      ...det.pilares.pilares.flatMap((p) => p.detalhamento.avisos),
    ];
    const textos = coletarAvisos(r, det).map((a) => a.texto);
    for (const t of doDetalhamento) expect(textos).toContain(t);
    expect(coletarAvisos(r, det)).toHaveLength(coletarAvisos(r).length + doDetalhamento.length);
  });

  it("detalha as 5 vigas (2 horizontais de 2 tramos, 3 verticais de 1)", () => {
    expect(det.vigas).toHaveLength(5);
    const tramos = det.vigas.map((v) => v.nos.length - 1).sort();
    expect(tramos).toEqual([1, 1, 1, 2, 2]);
  });

  it("cada viga bate com detalharViga chamado direto, com as larguras escritas à mão", () => {
    for (const rv of rp.vigas) {
      const horizontal = rv.viga.eixo.horizontal;
      // à mão: 3 pilares na horizontal (b = 30), 2 na vertical (h = 20)
      const larguras = horizontal ? [30, 30, 30] : [20, 20];
      const direto = detalharViga(
        {
          nome: rv.viga.nome,
          bw: 12,
          h: rv.viga.h,
          d: rv.d,
          cobrimento: obra.materiais.cobrimentoViga,
          larguraApoios: larguras,
          tramos: rv.analise.ok ? rv.analise.tramos : [],
          dimensionamento: rv.tramos,
          // γf = 1,4 nas duas normas (máx(γg, γq))
          gamaF: 1.4,
          mat: r.materiais,
        },
        regrasDetalhamento(norma),
      );
      const ligado = det.vigas.find((v) => v.vigaId === rv.viga.id);
      expect(ligado?.larguraApoios).toEqual(larguras);
      expect(ligado?.detalhamento.posicoes).toEqual(direto.posicoes);
      expect(direto.posicoes.length).toBeGreaterThan(0);
      const soma = somaComprimentos(direto.posicoes);
      expect(soma).toBeGreaterThan(0);
      expect(somaComprimentos(ligado?.detalhamento.posicoes ?? [])).toBe(soma);
    }
  });

  it("abscissas dos nós: 0, 400, 750 cm nas horizontais e 0, 500 nas verticais", () => {
    for (const v of det.vigas)
      expect([
        [0, 400, 750],
        [0, 500],
      ]).toContainEqual(v.nos);
  });

  it("tabela de aço das vigas multiplica pelas 2 repetições", () => {
    const umPavimento = det.vigas.reduce(
      (s, v) => s + somaComprimentos(v.detalhamento.posicoes),
      0,
    );
    expect(det.tabela.comprimentoTotal).toBeCloseTo((2 * umPavimento) / 100, 9);
    expect(det.tabela.massaComPerda).toBeCloseTo(det.tabela.massa * 1.1, 9);
    // o ponto de soma das origens: vigas + (lajes, pilares) vazios dá o mesmo
    expect(tabelaAcoObra([det.itens, [], []])).toEqual(det.tabela);
  });
});

describe("conta à mão (NB-1/78): vigas verticais de 5 m sobre pilares h = 20", () => {
  // c = 2,5; bw = 12; h = 50 (vão/10). Positivo de face externa a face externa
  // menos o cobrimento: 500 + 2 (10 − 2,5) = 515, com gancho de 10 φ em cada
  // ponta. Porta-estribos: o mesmo reto, sem gancho. Estribos de face a face:
  // 500 − 20 = 480 cm, n = ⌈480/s⌉ + 1, cada um 2 (12 − 5) + 2 (50 − 5) + 2 · 10 φt
  // = 14 + 90 + 10 = 114 cm com φt = 5 mm.
  const obra = obraDuasLajes("nb1-78");
  const c = calcular(obra);
  if (c.tipo !== "ok") throw new Error("cálculo falhou");
  const det = detalharVigasObra(c.resultado, obra);
  const verticais = det.vigas.filter((v) => v.nos.length === 2);

  it("posições e Σ quantidade × comprimento", () => {
    expect(verticais).toHaveLength(3);
    for (const v of verticais) {
      const [pos, porta, estribo] = v.detalhamento.posicoes;
      if (!pos || !porta || !estribo) throw new Error(`${v.nome} sem as 3 posições`);
      expect([pos.tipo, porta.tipo, estribo.tipo]).toEqual([
        "positiva",
        "porta-estribos",
        "estribo",
      ]);
      expect(pos.reto).toBe(515);
      expect(pos.comprimento).toBe(515 + 2 * pos.phi);
      expect(porta.comprimento).toBe(515);
      expect(estribo.phi).toBe(5);
      expect(estribo.comprimento).toBe(114);
      const s = estribo.espacamento ?? Number.NaN;
      expect(estribo.quantidade).toBe(Math.ceil(480 / s) + 1);
      const soma = pos.quantidade * (515 + 2 * pos.phi) + 2 * 515 + estribo.quantidade * 114;
      expect(somaComprimentos(v.detalhamento.posicoes)).toBe(soma);
    }
  });
});

describe("larguraApoios", () => {
  const pav: Pavimento = {
    id: "p",
    nome: "P",
    peDireito: 3,
    repeticoes: 1,
    lajes: [],
    vigas: [{ id: "v2", nome: "V2", x1: 2, y1: -1, x2: 2, y2: 1, bw: 15, h: 40, cargaLinear: 0 }],
    pilares: [{ id: "p1", nome: "P1", x: 4, y: 0, b: 25, h: 40 }],
    pilaresRemovidos: [],
  };
  const viga = (horizontal: boolean): VigaMontada => ({
    id: "v1",
    nome: "V1",
    bw: 12,
    h: 40,
    eixo: { horizontal, c: 0, s1: 0, s2: 4 },
    nos: [0, 2, 4],
    apoios: [
      { tipo: "livre" },
      { tipo: "viga", id: "v2", nome: "V2" },
      { tipo: "pilar", id: "p1", nome: "P1" },
    ],
    tramos: [],
  });

  it("livre = 0, viga de apoio = bw dela, pilar = b na horizontal e h na vertical", () => {
    expect(larguraApoios(viga(true), pav)).toEqual([0, 15, 25]);
    expect(larguraApoios(viga(false), pav)).toEqual([0, 15, 40]);
  });
});

// ---- lajes, pilares e a tabela de aço da obra ------------------------------------

describe.each<Obra["norma"]>(["nb1-78", "nbr6118-2023"])("detalharObra pela %s", (norma) => {
  const obra = obraDuasLajes(norma);
  const c = calcular(obra);
  if (c.tipo !== "ok") throw new Error("cálculo falhou");
  const r = c.resultado;
  const rp = r.pavimentos[0]!;
  const det = detalharObra(r, obra);
  const [l1, l2] = rp.lajes;
  if (!l1 || !l2) throw new Error("faltam as lajes");

  it("cada laje bate com detalharLaje chamado direto, com a entrada escrita à mão", () => {
    // à mão: todos os bordos têm viga gerada de bw = 12; L1 (4 × 5) engasta no
    // direito com L2 (3,5 × 5), cujo menor vão é 3,5 m, e vice-versa com 4 m. L1
    // vem antes: a negativa do bordo comum sai nela, e L2 a marca na vizinha.
    const larguras = { esquerdo: 12, inferior: 12, direito: 12, superior: 12 };
    const esperado = [
      { r: l1, vaoMenorVizinha: { direito: 3.5 }, negativoNaVizinha: [] as Bordo[] },
      { r: l2, vaoMenorVizinha: { esquerdo: 4 }, negativoNaVizinha: ["esquerdo"] as Bordo[] },
    ];
    for (const e of esperado) {
      const direto = detalharLaje(
        {
          nome: e.r.laje.nome,
          lx: e.r.laje.lx,
          ly: e.r.laje.ly,
          h: e.r.laje.h,
          cobrimento: obra.materiais.cobrimentoLaje,
          vinculos: e.r.entrada.vinculos,
          larguraApoios: larguras,
          armadura: e.r.armadura,
          reacoes: e.r.esforcos.reacoes,
          // γf = 1,4 nas duas normas (máx(γg, γq))
          gamaF: 1.4,
          vaoMenorVizinha: e.vaoMenorVizinha,
          negativoNaVizinha: e.negativoNaVizinha,
          mat: r.materiais,
        },
        regrasLaje(norma),
      );
      const ligado = det.lajes.lajes.find((l) => l.lajeId === e.r.laje.id);
      expect(ligado?.negativoNaVizinha).toEqual(e.negativoNaVizinha);
      expect(ligado?.repeticoes).toBe(2);
      expect(direto.posicoes.length).toBeGreaterThan(0);
      expect(ligado?.detalhamento.posicoes).toEqual(direto.posicoes);
      expect(ligado?.detalhamento.avisos).toEqual(direto.avisos);
    }
  });

  it("a negativa do bordo comum sai uma vez só (em L1)", () => {
    const negativas = det.lajes.lajes.flatMap((l) =>
      l.detalhamento.posicoes
        .filter((p) => p.tipo === "negativa")
        .map((p) => `${l.nome}|${p.bordo}`),
    );
    // os outros bordos são apoiados: a 6118 pode trazer negativa de borda neles
    const doBordoComum = negativas.filter((n) => n === "L1|direito" || n === "L2|esquerdo");
    expect(doBordoComum).toEqual(["L1|direito"]);
  });

  it("cada pilar bate com detalharPilar chamado direto, 2 lances de 300 cm", () => {
    // à mão: 6 pilares 30 × 20, cada um em 2 níveis (o tipo repete 2 vezes); o
    // nível de baixo é a repetição 2. Barras por face: as que o cálculo do pilar
    // verificou (resultado.barras), não a distribuição padrão do motor.
    expect(det.pilares.pilares).toHaveLength(6);
    for (const d of det.pilares.pilares) {
      const niveis = r.pilares.filter(
        (p) => `${p.pilar.x.toFixed(3)};${p.pilar.y.toFixed(3)}` === d.chave,
      );
      const base = niveis.find((p) => p.repeticao === 2);
      const topo = niveis.find((p) => p.repeticao === 1);
      if (!base || !topo) throw new Error(`${d.nome} sem os 2 níveis`);
      const lance = (p: typeof base) => ({ peDireito: 300, b: 30, h: 20, resultado: p.resultado });
      const direto = detalharPilar(
        {
          nome: base.pilar.nome,
          cobrimento: obra.materiais.cobrimentoPilar,
          lances: [lance(base), lance(topo)],
          mat: r.materiais,
        },
        regrasPilar(norma),
      );
      expect(d.detalhamento.posicoes).toEqual(direto.posicoes);
      expect(d.detalhamento.avisos).toEqual(direto.avisos);
      expect(d.lances.map((l) => [l.repeticao, l.peDireito, l.arranjo])).toEqual([
        [2, 300, "resultado"],
        [1, 300, "resultado"],
      ]);
      expect(d.lances.map((l) => [l.porFaceX, l.porFaceY])).toEqual(
        [base, topo].map((p) => [p.resultado.barras.porFaceX, p.resultado.barras.porFaceY]),
      );
      // traspasse = o que a barra do lance de baixo passa do topo dele
      const n1 = direto.posicoes.find((p) => p.tramo === 0 && p.tipo === "longitudinal");
      expect(d.lances[0]?.traspasse).toBe((n1?.reto ?? 0) - 300);
      expect(d.lances[0]?.traspasse).toBeGreaterThanOrEqual(20);
      expect(d.lances[1]?.traspasse).toBeNull();
    }
  });

  it("tabela de aço da obra = vigas × 2 + lajes × 2 + pilares, bitola a bitola", () => {
    // à mão: Σ quantidade × comprimento por (aço, φ), com as 2 repetições nas
    // vigas e lajes; os pilares já trazem um lance por repetição
    const metros = new Map<string, number>();
    const soma = (
      ps: readonly { phi: number; quantidade: number; comprimento: number; aco: string }[],
      vezes: number,
    ) => {
      for (const p of ps) {
        const k = `${p.aco}|${p.phi}`;
        metros.set(k, (metros.get(k) ?? 0) + (vezes * p.quantidade * p.comprimento) / 100);
      }
    };
    for (const v of det.vigas) soma(v.detalhamento.posicoes, 2);
    for (const l of det.lajes.lajes) soma(l.detalhamento.posicoes, 2);
    for (const p of det.pilares.pilares) soma(p.detalhamento.posicoes, 1);

    const linhas = det.tabelaObra.linhas;
    expect(linhas.map((l) => `${l.aco}|${l.phi}`).sort()).toEqual([...metros.keys()].sort());
    let massa = 0;
    for (const l of linhas) {
      const m = metros.get(`${l.aco}|${l.phi}`) ?? Number.NaN;
      expect(l.comprimento).toBeCloseTo(m, 9);
      // massa linear π φ²/4 · 7850 kg/m³
      const kgm = ((Math.PI * (l.phi / 1000) ** 2) / 4) * 7850;
      expect(l.massa).toBeCloseTo(m * kgm, 9);
      massa += m * kgm;
    }
    expect(det.tabelaObra.massa).toBeCloseTo(massa, 9);
    expect(det.tabelaObra.massa).toBeCloseTo(
      det.tabela.massa + det.lajes.tabela.massa + det.pilares.tabela.massa,
      9,
    );
    expect(det.tabelaObra.massaComPerda).toBeCloseTo(massa * 1.1, 9);
    expect(det.lajes.tabela.massa).toBeGreaterThan(0);
    expect(det.pilares.tabela.massa).toBeGreaterThan(0);
  });
});

describe("coletarAvisos com o detalhamento de lajes e pilares", () => {
  const obra = obraDuasLajes("nbr6118-2023");
  const c = calcular(obra);
  if (c.tipo !== "ok") throw new Error("cálculo falhou");
  const r = c.resultado;
  const det = detalharObra(r, obra);

  it("põe os avisos de cada laje e pilar com o local e o elemento", () => {
    // avisos acrescentados ao detalhamento real, para o teste não depender de a
    // obra gerar algum
    const comAvisos: DetalhamentoObra = {
      ...det,
      lajes: {
        ...det.lajes,
        lajes: det.lajes.lajes.map((l) => ({
          ...l,
          detalhamento: {
            ...l.detalhamento,
            avisos: [...l.detalhamento.avisos, `aviso ${l.nome}`],
          },
        })),
      },
      pilares: {
        ...det.pilares,
        pilares: det.pilares.pilares.map((p) => ({
          ...p,
          detalhamento: {
            ...p.detalhamento,
            avisos: [...p.detalhamento.avisos, `aviso ${p.nome}`],
          },
        })),
      },
    };
    const avisos = coletarAvisos(r, comAvisos);
    expect(avisos).toContainEqual({
      local: "Tipo",
      elemento: "L2 (detalhamento)",
      texto: "aviso L2",
    });
    const p = det.pilares.pilares[0]!;
    expect(avisos).toContainEqual({
      local: "Tipo (2/2) a Tipo (1/2)",
      elemento: `${p.nome} (detalhamento)`,
      texto: `aviso ${p.nome}`,
    });
    expect(avisos).toHaveLength(coletarAvisos(r, det).length + 2 + 6);
  });
});

describe("negativa de bordo comum com contato parcial", () => {
  // L1 (4 × 5) encosta em L2 (3,5 × 6) só em 5 dos 6 m do bordo esquerdo de L2:
  // L1 detalha a negativa nos 5 m dela, e L2 tem de detalhar a sua (o metro que
  // sobra ficaria sem armadura se L2 a marcasse como "na vizinha").
  const obra = obraNova("Contato parcial", "nb1-78");
  let pav = obra.pavimentos[0]!;
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 });
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(pav, { x: 4, y: 0, lx: 3.5, ly: 6 });
  const o: Obra = { ...obra, pavimentos: [gerarEstrutura({ ...pav, lajes: [l1, l2] })] };
  const c = calcular(o);
  if (c.tipo !== "ok") throw new Error("cálculo falhou");
  const det = detalharObra(c.resultado, o);

  it("os dois lados do bordo comum estão engastados", () => {
    const [r1, r2] = c.resultado.pavimentos[0]!.lajes;
    expect(r1?.entrada.vinculos.direito).toBe("engastado");
    expect(r2?.entrada.vinculos.esquerdo).toBe("engastado");
  });

  it("L2 detalha a própria negativa no bordo esquerdo", () => {
    const d2 = det.lajes.lajes.find((l) => l.lajeId === l2.id);
    expect(d2?.negativoNaVizinha).toEqual([]);
    expect(
      d2?.detalhamento.posicoes.some((p) => p.tipo === "negativa" && p.bordo === "esquerdo"),
    ).toBe(true);
  });
});

describe("negativa de bordo comum entre lajes de espessuras diferentes (regressão)", () => {
  // L1 (4 × 5, h = 12) e L2 (4 × 5, h = 8) com o bordo comum de 5 m engastado,
  // C25/CA-50, c = 2,5 cm. O X do bordo é forçado e cada laje arma com
  // Norma.lajeArmadura e o próprio d = h − c − φ/2 = h − 3 cm.
  // Md = 1,4 X; σcd = 0,85 · 25/1,4 = 15,18 MPa; fyd = 434,78 MPa;
  // μ = Md/(d² σcd); x/d = (1 − √(1 − 2μ))/0,8; As = 0,8 (x/d) d σcd/fyd;
  // As,min = 0,15% · 100 h (1,80 em h = 12; 1,20 em h = 8).
  const obra = obraNova("Espessuras diferentes", "nbr6118-2023");
  let pav = obra.pavimentos[0]!;
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 }, { h: 12 });
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(pav, { x: 4, y: 0, lx: 4, ly: 5 }, { h: 8 });
  const o: Obra = { ...obra, pavimentos: [gerarEstrutura({ ...pav, lajes: [l1, l2] })] };
  const c = calcular(o);
  if (c.tipo !== "ok") throw new Error("cálculo falhou");
  const r = c.resultado;
  const rp = r.pavimentos[0]!;
  const comum = (nome: string): Bordo => (nome === "L1" ? "direito" : "esquerdo");
  /** Detalhamento das duas lajes com o X do bordo comum = x kN·m/m. */
  const comX = (x: number) => {
    const lajes = rp.lajes.map((l) => {
      const k = comum(l.laje.nome);
      const esforcos = { ...l.esforcos, negativos: { ...l.esforcos.negativos, [k]: x } };
      const armadura = r.norma.lajeArmadura(
        l.entrada,
        esforcos,
        r.materiais,
        o.materiais.cobrimentoLaje,
      );
      return { ...l, esforcos, armadura };
    });
    const det = detalharLajesObra({ ...r, pavimentos: [{ ...rp, lajes }] }, o);
    const negativas = det.lajes.flatMap((l) =>
      l.detalhamento.posicoes
        .filter((p) => p.tipo === "negativa" && p.bordo === comum(l.nome))
        .map((p) => ({ laje: l.nome, ...p })),
    );
    return { lajes, det, negativas };
  };
  const asEf = (p: { phi: number; espacamento: number | null }) =>
    (Math.PI * (p.phi / 10) ** 2 * 100) / 4 / (p.espacamento ?? Number.NaN);

  it("X = 4: a negativa sai uma vez, na laje de 8 cm, com As ≥ 2,80 e gancho 3 cm", () => {
    // Md = 5,6 kN·m/m.
    // L1, d = 9: μ = 5,6/(0,09² · 15 180) = 0,0455; x/d = 0,0583;
    //   As = 0,8 · 0,0583 · 9 · 100 · 15,18/434,78 = 1,47 < 1,80 → 1,80 cm²/m.
    // L2, d = 5: μ = 5,6/(0,05² · 15 180) = 0,1476; x/d = 0,2005;
    //   As = 0,8 · 0,2005 · 5 · 100 · 15,18/434,78 = 2,80 cm²/m.
    // Antes saía só a barra de L1 (a primeira da lista): As,ef ≈ 1,87 < 2,80 e
    // gancho h − 2c = 12 − 5 = 7 cm, que não cabe na laje de 8 (8 − 5 = 3).
    const { lajes, det, negativas } = comX(4);
    expect(lajes[0]?.armadura.asNegativos.direito).toBeCloseTo(1.8, 2);
    expect(lajes[1]?.armadura.asNegativos.esquerdo).toBeCloseTo(2.8, 2);
    expect(negativas.map((p) => p.laje)).toEqual(["L2"]);
    const n = negativas[0]!;
    expect(asEf(n)).toBeGreaterThanOrEqual(2.8);
    expect([n.ganchoInicio, n.ganchoFim]).toEqual([3, 3]);
    expect(det.lajes.map((l) => l.negativoNaVizinha)).toEqual([["direito"], []]);
  });

  it("X = 1: a laje de 8 cm detalha com a As maior, a da laje de 12 cm (1,80)", () => {
    // Md = 1,4 kN·m/m. L1: As = 0,36 < 1,80 → 1,80; L2: As = 0,66 < 1,20 → 1,20.
    // A barra sai na laje de menor h (gancho 3 cm cabe nas duas) com a As de L1.
    const { lajes, det, negativas } = comX(1);
    expect(lajes[0]?.armadura.asNegativos.direito).toBeCloseTo(1.8, 2);
    expect(lajes[1]?.armadura.asNegativos.esquerdo).toBeCloseTo(1.2, 2);
    expect(negativas.map((p) => p.laje)).toEqual(["L2"]);
    const n = negativas[0]!;
    expect(asEf(n)).toBeGreaterThanOrEqual(1.8);
    expect([n.ganchoInicio, n.ganchoFim]).toEqual([3, 3]);
    expect(det.lajes.map((l) => l.negativoNaVizinha)).toEqual([["direito"], []]);
    const l2Det = det.lajes.find((l) => l.nome === "L2");
    expect(l2Det?.detalhamento.memoria.some((m) => m.descricao.includes("bordo comum"))).toBe(true);
  });
});

describe("negativa de contato parcial entre lajes de espessuras diferentes", () => {
  // L1 (4 × 5, h = 12, y de 0 a 5) encosta em L2 (3,5 × 6, h = 8, y de 1 a 7) só
  // em 4 m: nenhum dos dois bordos cobre o outro, e as duas detalham a negativa
  // do bordo comum. A barra de L1
  // entra em L2, então o gancho dela é o da laje mais fina:
  // h − 2c = 8 − 2 · 2,5 = 3 cm (com o h de L1 seria 12 − 5 = 7, que não cabe em L2).
  const obra = obraNova("Contato parcial, h diferentes", "nbr6118-2023");
  let pav = obra.pavimentos[0]!;
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 }, { h: 12 });
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(pav, { x: 4, y: 1, lx: 3.5, ly: 6 }, { h: 8 });
  const o: Obra = { ...obra, pavimentos: [gerarEstrutura({ ...pav, lajes: [l1, l2] })] };
  const c = calcular(o);
  if (c.tipo !== "ok") throw new Error("cálculo falhou");
  const det = detalharLajesObra(c.resultado, o);
  const negativa = (id: string, bordo: Bordo) =>
    det.lajes
      .find((l) => l.lajeId === id)
      ?.detalhamento.posicoes.find((p) => p.tipo === "negativa" && p.bordo === bordo);

  it("bordo comum engastado dos dois lados, c = 2,5 cm", () => {
    const [r1, r2] = c.resultado.pavimentos[0]!.lajes;
    expect(r1?.entrada.vinculos.direito).toBe("engastado");
    expect(r2?.entrada.vinculos.esquerdo).toBe("engastado");
    expect(o.materiais.cobrimentoLaje).toBe(2.5);
  });
  it("as duas detalham a negativa, ambas com gancho de 3 cm", () => {
    expect(det.lajes.map((l) => l.negativoNaVizinha)).toEqual([[], []]);
    const n1 = negativa(l1.id, "direito");
    const n2 = negativa(l2.id, "esquerdo");
    expect(n1 && [n1.ganchoInicio, n1.ganchoFim]).toEqual([3, 3]);
    expect(n2 && [n2.ganchoInicio, n2.ganchoFim]).toEqual([3, 3]);
  });
});

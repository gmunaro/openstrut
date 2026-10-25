// Testa a importação de uma obra do SISTRUT a partir dos arquivos escolhidos de uma vez.
// Obra E2E (4 lajes 4×5 m, vigas no contorno e no meio, 9 pilares): LAJ, VIG, SEC, FOR,
// COL, REP e RLP vêm de tests/retraducao/forma/obra (v1-par2); DSP e PIP de
// roteiros/e2e_10_forma.dados. O prédio de vários pavimentos é sintético: o .LAJ da E2E
// editado linha a linha para os casos das obras gravadas por usuários (vaga livre de
// A_1014 com o fechamento da última área, pavimento só com buracos) e um .COL montado
// aqui no formato do PIGRAEDI.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importarLaj } from "../armazenamento/sistrut/laje";
import { importarVigasSistrut } from "../armazenamento/sistrut/viga";
import { arquivoOraculo } from "../calculo/sistrut/__oraculo__/arquivosOraculo";
import { KN_POR_TF } from "../calculo/sistrut/base/unidades";
import { calcularObra } from "../calculo/fluxo";
import { nb178, nbr6118 } from "../calculo/normas";
import { obraExemplo } from "../dominio/exemplo";
import { calcularObraSistrut } from "../calculo/sistrut/obra";
import {
  arquivo,
  colPredio,
  COM_VAGA_SUJA,
  comNome,
  lajE2E,
  OBRA_E2E,
  PREDIO,
  semIds,
  SO_BURACOS,
} from "./__fixtures__/predioSistrut";
import { calcular } from "./calculo";
import { detalharObra } from "./detalhamento";
import { dspsAEscolher, importarObraSistrut, type ArquivoEntrada } from "./InicioSistrut";

/** .COL com um nível MEIO sem .LAJ entre BASE e TETO; seção 20, 25 e 30 cm nos lances
 *  1→2, 2→3 e 3→4. */
const COL_COM_MEIO = colPredio(
  [
    ["FUND", 0],
    ["BASE", 0.4],
    ["MEIO", 3.4],
    ["TETO", 6.4],
  ],
  9,
  [20, 25, 30],
);

const importa = (arquivos: readonly ArquivoEntrada[]) => {
  const r = importarObraSistrut(arquivos);
  if (!r.ok) throw new Error(r.erros.join("\n"));
  return r;
};

describe("importarObraSistrut", () => {
  it("viga com bw × h do .SEC (E2E: 12 × 40, não os 12 × 50 da planta) e o peso da montagem", () => {
    const { obra } = importa(OBRA_E2E);
    const vigas = obra.pavimentos[0]!.vigas;
    expect(vigas.map((v) => `${v.bw}x${v.h}`)).toEqual(Array(vigas.length).fill("12x40"));
    // V1 a V3: os 120 kg/m do .VIG; V4 a V6, sem peso digitado, o da seção provisória:
    // 0,12 · 0,50 · 2,5 = 0,15 t/m, e não o dos 12 × 40 (0,12 t/m)
    const tPorM = vigas.map((v) => Math.round((v.pesoProprio! / KN_POR_TF) * 1000));
    expect(tPorM).toEqual([120, 120, 120, 150, 150, 150]);
  });

  it("NBR 6118 na obra importada: as vigas levam as cargas do SISTRUT aos pilares", () => {
    const { obra } = importa(OBRA_E2E);
    // referência: as reações nos pilares do SISTRUT no modo corrigido (o VICALC com as
    // cargas do .VIG); com q em todos os tramos elas não dependem da alternância de q
    // que a análise da V2 faz e o VICALC não
    const sistrut = calcularObra({ ...obra, modoCalculo: "corrigido" }, nb178);
    const r6118 = calcularObra({ ...obra, norma: "nbr6118-2023" }, nbr6118);
    const n = (r: typeof r6118) =>
      Object.fromEntries(r.pavimentos[0]!.montagem.pilares.map((p) => [p.nome, p.n]));
    const esperado = n(sistrut);
    expect(Object.keys(esperado)).toHaveLength(9);
    for (const [nome, valor] of Object.entries(n(r6118)))
      expect(valor, nome).toBeCloseTo(esperado[nome]!, 6);
    expect(r6118.avisos).toContainEqual(expect.stringMatching(/^Obra com dados do SISTRUT/));
  });

  it("NBR 6118 na obra desenhada na V2: sem cargas do SISTRUT", () => {
    const avisos = calcularObra(obraExemplo(), nbr6118).avisos;
    expect(avisos.some((a) => a.includes("SISTRUT"))).toBe(false);
  });

  it("monta a obra da E2E com as lajes, vigas e pilares do pavimento", () => {
    const r = importarObraSistrut(OBRA_E2E);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [pav] = r.obra.pavimentos;
    expect(pav?.lajes).toHaveLength(4);
    expect(pav?.vigas.length).toBeGreaterThan(0);
    expect(pav?.pilares).toHaveLength(9);
  });

  it("não depende da ordem dos arquivos nem da caixa da extensão", () => {
    for (const obra of [OBRA_E2E, PREDIO]) {
      const direta = importarObraSistrut(obra);
      const embaralhada = importarObraSistrut([...obra].reverse());
      const minusculas = importarObraSistrut(
        obra.map((a) => ({ ...a, nome: a.nome.toLowerCase() })),
      );
      expect(direta.ok && embaralhada.ok && minusculas.ok).toBe(true);
      if (!direta.ok || !embaralhada.ok || !minusculas.ok) return;
      expect(semIds(embaralhada.obra)).toBe(semIds(direta.obra));
      expect(embaralhada.avisos).toEqual(direta.avisos);
      expect(semIds(minusculas.obra)).toBe(semIds(direta.obra));
    }
  });

  it("sem .LAJ, a obra sai do .VIG (só vigas); só com o .COL, do .COL (só pilares)", () => {
    const vigas = importa(OBRA_E2E.filter((a) => !a.nome.endsWith(".LAJ")));
    expect(vigas.obra.pavimentos.map((p) => p.nome)).toEqual(["E2E"]);
    expect(vigas.obra.pavimentos[0]!.vigas.length).toBeGreaterThan(0);
    const pilares = importa([arquivo("E2E.COL")]);
    expect(pilares.obra.pavimentos.flatMap((p) => p.pilares)).toHaveLength(9);
  });

  it("sem .LAJ, .VIG nem .COL não há obra, e o erro lista o que veio e por quê", () => {
    const r = importarObraSistrut([arquivo("E2E.SEC"), arquivo("E2E.FOR"), arquivo("E2E.REP")]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros[0]).toMatch(/^Nenhuma obra para abrir/);
    expect(r.erros).toContain("E2E.SEC: sem E2E.VIG nem E2E.LAJ; ignorados.");
    expect(r.erros).toContainEqual(expect.stringMatching(/^E2E.REP: sem o .COL/));
    expect(r.resumo.ignorados.map((i) => i.arquivo).sort()).toEqual([
      "E2E.FOR",
      "E2E.REP",
      "E2E.SEC",
    ]);
  });

  it(".LAJ ilegível fica de fora com aviso que começa pelo nome dele; o resto entra", () => {
    const r = importa([
      { nome: "E2E.LAJ", dados: new Uint8Array() },
      ...OBRA_E2E.filter((a) => !a.nome.endsWith(".LAJ")),
    ]);
    expect(r.avisos).toContainEqual(expect.stringMatching(/^E2E.LAJ: não é um .LAJ do SISTRUT/));
    expect(r.resumo.ignorados.map((i) => i.arquivo)).toContain("E2E.LAJ");
    expect(r.obra.pavimentos[0]!.vigas.length).toBeGreaterThan(0);
  });

  it("extensão desconhecida e .RLP sem .REP de mesmo nome viram aviso, não erro", () => {
    const r = importarObraSistrut([
      ...OBRA_E2E,
      { nome: "NOTAS.TXT", dados: new Uint8Array([65]) },
      { nome: "SOLTO.RLP", dados: new Uint8Array([65]) },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.avisos).toContain("NOTAS.TXT: extensão não reconhecida, arquivo ignorado.");
    expect(r.avisos).toContain("SOLTO.RLP: sem .REP de mesmo nome, arquivo ignorado.");
  });

  it("sem arquivos de pilar, os pilares são só os do .LAJ e nenhum aviso de pilar aparece", () => {
    const r = importarObraSistrut(OBRA_E2E.filter((a) => !/\.(COL|PIP|REP|RLP)$/.test(a.nome)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Os 9 pilares da planta vêm do próprio .LAJ (importarLaj); sem .COL não há cargas.
    expect(r.obra.pavimentos[0]?.pilares).toHaveLength(9);
    expect(r.avisos.filter((a) => /pilar|\.REP|\.RLP/i.test(a))).toEqual([]);
  });

  it("o .REP do pavimento não vira carga: o motor o refaz pelas vigas, e a carga não dobra", () => {
    // com o .REP da E2E como carga, a fundação do P1 dava 3,64 t, o dobro dos 1,82 t que o
    // original guarda no .COL (nível PAV1 do P1)
    const sem = importa(OBRA_E2E.filter((a) => !/\.(REP|RLP)$/.test(a.nome)));
    const com = importa(OBRA_E2E);
    expect(com.obra.pavimentos[0]!.pilares.every((p) => !p.cargaTopo && !p.cargaBase)).toBe(true);
    expect(com.avisos).toContainEqual(expect.stringMatching(/^E2E\.REP: .*não entram como carga/));
    const fundacao = (obra: typeof sem.obra) =>
      calcularObraSistrut(obra, { modo: "original" }).fundacoes.find((f) =>
        f.pilarId.endsWith("P1"),
      )!.cargaAcumulada;
    expect(fundacao(com.obra)).toBe(fundacao(sem.obra));
    expect(fundacao(com.obra)).toBeCloseTo(1.82, 2);
  });
});

describe("importarObraSistrut: obra de vários pavimentos", () => {
  it("vários .LAJ (o 1º erro do cliente): um pavimento por .LAJ, na ordem das cotas do .COL", () => {
    const r = importa(PREDIO);
    const pavs = r.obra.pavimentos.filter((p) => p.id !== "ESCADA");
    expect(pavs.map((p) => [p.nome, p.peDireito, p.lajes.length])).toEqual([
      ["TETO", 3, 4],
      ["BASE", 0.4, 0],
    ]);
    expect(r.avisos).toContain(
      "Pavimentos, do topo para a base: TETO (nível 3 do .COL, cota 3,4 m), BASE (nível 2 do .COL, cota 0,4 m) (pelas cotas do .COL).",
    );
    // as vigas de cada pavimento vêm do .VIG de mesmo nome; o BASE só tem as do .LAJ
    const teto = pavs[0]!;
    expect(teto.vigas.some((v) => v.secoes !== undefined)).toBe(true);
    expect(pavs[1]!.vigas.every((v) => v.secoes === undefined)).toBe(true);
    // ids únicos na obra inteira (a validação do arquivo exige)
    const ids = r.obra.pavimentos
      .flatMap((p) => [...p.lajes, ...p.vigas, ...p.pilares])
      .map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a vaga livre de A_1014 com o fechamento da área (o 2º erro do cliente) não vira área", () => {
    const r = importa([comNome("COB.LAJ", COM_VAGA_SUJA)]);
    expect(r.obra.pavimentos[0]!.cargasOcupacao?.map((c) => c.poligono.length)).toEqual([4]);
  });

  it("pavimento só com buracos: entra sem laje, com aviso", () => {
    const r = importa([comNome("TER.LAJ", SO_BURACOS)]);
    expect(r.obra.pavimentos[0]!.lajes).toEqual([]);
    expect(r.avisos).toContainEqual(expect.stringMatching(/^TER\.LAJ: Nenhuma laje: os 4 painéis/));
  });

  it("o .COL liga os pilares de cada pavimento ao nível de mesmo nome", () => {
    // seção 20, 25 e 30 cm nos lances 1→2, 2→3 e 3→4: o TETO (nível 4) fica com 30 (de
    // baixo para cima, sem os nomes, ficaria com 25)
    const r = importa([
      comNome("TETO.LAJ", COM_VAGA_SUJA),
      comNome("BASE.LAJ", SO_BURACOS),
      comNome("PREDIO.COL", COL_COM_MEIO),
    ]);
    const lado = (pav: string) =>
      r.obra.pavimentos.find((p) => p.id === pav)!.pilares.map((p) => p.b);
    expect(new Set(lado("TETO"))).toEqual(new Set([30]));
    expect(new Set(lado("BASE"))).toEqual(new Set([20]));
    expect(r.obra.pavimentos.find((p) => p.id === "TETO")!.peDireito).toBe(3);
    expect(r.avisos.filter((a) => /lances|não casou/.test(a))).toEqual([]);
  });

  it("nível do .COL sem .LAJ: pavimento sem planta, com os pilares, o lance e a carga do .REP dele", () => {
    // MEIO (nível 3) não tem .LAJ: sem ele, o lance 2→3 sumia com as cargas do MEIO.REP
    const arquivos = [
      comNome("TETO.LAJ", COM_VAGA_SUJA),
      comNome("BASE.LAJ", SO_BURACOS),
      comNome("PREDIO.COL", COL_COM_MEIO),
    ];
    const sem = importa(arquivos);
    const com = importa([...arquivos, comNome("MEIO.REP", arquivo("E2E.REP"))]);
    expect(com.obra.pavimentos.map((p) => [p.nome, p.peDireito, p.lajes.length])).toEqual([
      ["TETO", 3, 4],
      ["MEIO", 3, 0],
      ["BASE", 0.4, 0],
    ]);
    const meio = com.obra.pavimentos.find((p) => p.nome === "MEIO")!;
    // os pilares do .COL, nas posições dos de mesmo número nos outros pavimentos, com a
    // seção do lance 2→3
    expect(meio.pilares.map((p) => [p.nome, p.x, p.y, p.b])).toContainEqual(["P5", 4, 5, 25]);
    // a carga do P5 no E2E.REP é 17,37 t (o PILGEEDI a grava em A_1280 do nível)
    expect(meio.pilares.find((p) => p.nome === "P5")!.cargaTopo?.normal).toBeCloseTo(
      17.37 * KN_POR_TF,
      6,
    );
    expect(com.avisos).toContain(
      "Nível 3 do .COL (MEIO, cota 3,4 m) sem .LAJ de mesmo nome: entrou como pavimento sem planta, só com os 9 pilares do .COL, e as cargas dos pilares nesse nível são as do MEIO.REP. As vigas desse nível não estão na obra.",
    );
    expect(com.resumo.lidos).toContain("MEIO.REP");
    // a fundação do P5 recebe os 17,37 t a mais, e as colunas vão de BASE a TETO
    const fundacao = (obra: typeof sem.obra) => {
      const r = calcularObraSistrut(obra, { modo: "original" });
      expect(r.falhas).toEqual([]);
      return r.fundacoes.find((f) => f.pilarId.endsWith("/P5"))!.cargaAcumulada;
    };
    expect(fundacao(com.obra) - fundacao(sem.obra)).toBeCloseTo(17.37, 2);
  });

  it(".REP sem pavimento nem nível de mesmo nome: ignorado, com o motivo", () => {
    const r = importa([
      comNome("TETO.LAJ", COM_VAGA_SUJA),
      comNome("PREDIO.COL", COL_COM_MEIO),
      comNome("OUTRO.REP", arquivo("E2E.REP")),
    ]);
    expect(r.resumo.ignorados).toContainEqual({
      arquivo: "OUTRO.REP",
      motivo: expect.stringContaining(
        "não há pavimento nem nível do .COL chamado OUTRO (níveis: 1 FUND, 2 BASE, 3 MEIO, 4 TETO)",
      ),
    });
  });

  it(".LAJ com o nome do nível 1 do .COL (a base dos pilares): na base da obra, com aviso", () => {
    const r = importa([
      comNome("TETO.LAJ", COM_VAGA_SUJA),
      comNome("BALD.LAJ", SO_BURACOS),
      comNome(
        "P.COL",
        colPredio(
          [
            ["BALD", 0],
            ["TETO", 3],
          ],
          9,
        ),
      ),
    ]);
    expect(r.obra.pavimentos.map((p) => p.nome)).toEqual(["TETO", "BALD"]);
    expect(r.avisos).toContainEqual(
      expect.stringContaining("BALD.LAJ: é o nível 1 do .COL (1 BALD, 2 TETO), a base dos pilares"),
    );
  });

  it("níveis seguidos com o mesmo nome: o .LAJ é um pavimento-tipo, com as repetições", () => {
    const r = importa([
      comNome("TIPO.LAJ", COM_VAGA_SUJA),
      comNome("COB.LAJ", COM_VAGA_SUJA),
      comNome(
        "P.COL",
        colPredio(
          [
            ["FUND", 0],
            ["TIPO", 3],
            ["TIPO", 6],
            ["TIPO", 9],
            ["COB", 12],
          ],
          9,
        ),
      ),
    ]);
    expect(r.obra.pavimentos.map((p) => [p.nome, p.repeticoes])).toEqual([
      ["COB", 1],
      ["TIPO", 3],
    ]);
    expect(r.avisos.filter((a) => /sem planta|lances|não casou/.test(a))).toEqual([]);
    const c = calcularObraSistrut(r.obra, { modo: "original" });
    expect(c.falhas).toEqual([]);
    expect(new Set(c.lances.map((l) => l.nivel))).toEqual(new Set([0, 1, 2, 3]));
  });

  it(".LAJ que não abre, sem .COL: o aviso das vigas é o do piso, não o da escada", () => {
    const r = importa([
      comNome("TETO.LAJ", COM_VAGA_SUJA),
      { nome: "BASE.LAJ", dados: new Uint8Array([65]) },
      comNome("BASE.VIG", arquivo("E2E.VIG")),
    ]);
    const aviso = r.avisos.find((a) => a.startsWith("BASE.VIG: o BASE.LAJ não pôde ser lido"));
    expect(aviso).toMatch(
      /A reação delas não vai a pilar nem a viga nenhuma: no original, as vigas desse piso descarregam nos pilares pelo BASE\.REP, e sem a planta a carga delas não chega aos pilares\. Corrija o BASE\.LAJ e importe de novo\.$/,
    );
    expect(aviso).not.toMatch(/Como no SISTRUT|escada|já estão/);
  });

  it(".LAJ que não abre: o .VIG dele fica avulso com o motivo, e o nível entra sem planta", () => {
    const r = importa([
      comNome("TETO.LAJ", COM_VAGA_SUJA),
      { nome: "BASE.LAJ", dados: new Uint8Array([65]) },
      comNome("BASE.VIG", arquivo("E2E.VIG")),
      comNome("BASE.REP", arquivo("E2E.REP")),
      comNome("PREDIO.COL", COL_COM_MEIO),
    ]);
    expect(r.avisos).toContainEqual(
      expect.stringContaining(
        "BASE.VIG: o BASE.LAJ não pôde ser lido (ficou de fora), e as vigas não têm a planta.",
      ),
    );
    expect(r.avisos.join("\n")).not.toContain("não há BASE.LAJ");
    const base = r.obra.pavimentos.find((p) => p.nome === "BASE")!;
    expect(base.lajes).toEqual([]);
    expect(base.pilares.find((p) => p.nome === "P5")!.cargaTopo?.normal).toBeCloseTo(
      17.37 * KN_POR_TF,
      6,
    );
  });

  it("obra só de vigas com .COL: os pilares saem do .COL, nível a nível, com a carga calculada pelas vigas", () => {
    const r = importa([
      comNome("A.VIG", arquivo("E2E.VIG")),
      comNome("B.VIG", arquivo("E2E.VIG")),
      comNome(
        "P.COL",
        colPredio(
          [
            ["FUND", 0],
            ["A", 3],
            ["B", 6],
          ],
          9,
        ),
      ),
    ]);
    const doCol = r.obra.pavimentos.filter((p) => p.vigas.length === 0);
    expect(doCol.map((p) => p.nome)).toEqual(["B", "A"]);
    // o motor refaz o E2E.REP pelas vigas do E2E.VIG: P5 com 17,37 t em cada nível
    for (const p of doCol)
      expect(p.pilares.find((q) => q.nome === "P5")!.cargaTopo?.normal).toBeCloseTo(
        17.37 * KN_POR_TF,
        4,
      );
    expect(r.obra.pavimentos.filter((p) => p.vigas.length > 0).map((p) => p.nome)).toEqual([
      "B (vigas)",
      "A (vigas)",
    ]);
    const c = calcularObraSistrut(r.obra, { modo: "original" });
    expect(c.falhas).toEqual([]);
    expect(c.fundacoes.find((f) => f.coluna === "P 5")!.cargaAcumulada).toBeCloseTo(2 * 17.37, 2);
  });

  it("o .TAB de um pavimento grava as repetições só nas vigas dele", () => {
    const nomes = ["V1", "V2", "V3", "V4", "V5", "V6"];
    const tab = new Uint8Array(70 * nomes.length);
    nomes.forEach((n, i) => {
      tab.set(Buffer.from(`~${n}`.padEnd(10), "latin1"), i * 70);
      new DataView(tab.buffer).setFloat32(i * 70 + 10, 3, true);
    });
    const r = importa([
      comNome("BASE.LAJ", COM_VAGA_SUJA),
      comNome("TETO.LAJ", COM_VAGA_SUJA),
      comNome("TETO.VIG", arquivo("E2E.VIG")),
      { nome: "TETO.TAB", dados: tab },
    ]);
    const rept = (pav: string) =>
      r.obra.pavimentos.find((p) => p.nome === pav)!.vigas.map((v) => v.repeticoes);
    expect(new Set(rept("TETO"))).toEqual(new Set([3]));
    expect(new Set(rept("BASE"))).toEqual(new Set([undefined]));
  });

  it("sem .COL, a ordem é a alfabética, e o aviso a mostra", () => {
    const r = importa([comNome("TETO.LAJ", COM_VAGA_SUJA), comNome("BASE.LAJ", SO_BURACOS)]);
    expect(r.obra.pavimentos.map((p) => p.nome)).toEqual(["BASE", "TETO"]);
    expect(r.avisos).toContainEqual(
      expect.stringMatching(/^Pavimentos, do topo para a base: BASE, TETO \(em ordem alfabética/),
    );
  });

  it("viga avulsa (.VIG sem .LAJ): pavimento à parte no topo, fora da planta, sem levar carga ao prédio", () => {
    const r = importa(PREDIO);
    const [escada, ...predio] = r.obra.pavimentos;
    expect(escada!.id).toBe("ESCADA");
    expect(escada!.vigas.length).toBeGreaterThan(0);
    for (const v of escada!.vigas)
      expect(v.apoiosDesconsiderados).toEqual(
        Array.from({ length: v.vaos!.length + 1 }, (_, k) => k),
      );
    expect(escada!.pilares.every((p) => p.transicao)).toBe(true);
    const yPredio = predio.flatMap((p) => p.pilares.map((q) => q.y));
    expect(Math.max(...escada!.pilares.map((p) => p.y))).toBeLessThan(Math.min(...yPredio));
    expect(r.avisos).toContainEqual(
      expect.stringMatching(
        /^ESCADA\.VIG: não há ESCADA\.LAJ e o \.VIG não diz de que pavimento elas são\. .* entraram à parte, no pavimento "ESCADA", .*Como no SISTRUT, a reação delas não vai a viga nem a pilar nenhum: o usuário do original lança essas reações à mão nas vigas que as recebem.*, e elas já estão nas cargas do \.VIG dessas vigas\. Por isso os apoios de ESCADA não descarregam em pilar nem na fundação\./,
      ),
    );
    // os apoios de cálculo não viram coluna, não somam carga e não avisam de transição
    for (const modo of ["original", "corrigido"] as const) {
      const c = calcularObraSistrut(r.obra, { modo });
      const ids = new Set(escada!.pilares.map((p) => p.id));
      expect(c.lances.some((l) => ids.has(l.pilarId))).toBe(false);
      expect(c.fundacoes.some((f) => ids.has(f.pilarId))).toBe(false);
      expect(c.lances.flatMap((l) => l.avisos).join(" ")).not.toMatch(/viga de transição/);
    }
  });

  it("viga avulsa ilegível só gera aviso; o resto da obra entra", () => {
    const r = importa([...PREDIO, comNome("RUIM.VIG", "x")]);
    expect(r.obra.pavimentos.some((p) => p.id === "RUIM")).toBe(false);
    expect(r.avisos).toContainEqual(expect.stringMatching(/^RUIM\.VIG: .*ficaram de fora\.$/));
  });

  it(".BAK e .EDV ilegível ficam de fora com o motivo, no aviso e no resumo", () => {
    const r = importa(PREDIO);
    expect(r.avisos).toContain(
      "TETO.BAK: cópia de segurança do .LAJ ou do .COL anterior, que o LAJEGRAV e o PIGRAEDI guardam ao gravar (LAJEGRAV.BAS:484, PIGRAEDI.BAS:467); não usada.",
    );
    expect(r.avisos).toContainEqual(
      expect.stringMatching(
        /^R5__TETO\.EDV: armadura editada no DESEDCAO que não foi possível ler \(.*\); ficou de fora\.$/,
      ),
    );
    expect(r.resumo.ignorados.map((i) => i.arquivo)).toEqual(
      expect.arrayContaining(["TETO.BAK", "R5__TETO.EDV", "TETO.REP", "TETO.RLP"]),
    );
    expect(r.resumo.lidos).toEqual(
      expect.arrayContaining(["TETO.LAJ", "BASE.LAJ", "TETO.VIG", "PREDIO.COL", "ESCADA.VIG"]),
    );
    expect(r.resumo.pavimentos.map((p) => p.nome)).toEqual(["ESCADA", "TETO", "BASE"]);
  });

  it("a obra importada calcula nos dois modos, com o detalhamento", () => {
    const { obra } = importa(PREDIO);
    for (const modoCalculo of ["original", "corrigido"] as const) {
      const c = calcular({ ...obra, modoCalculo });
      expect(c.tipo).toBe("ok");
      if (c.tipo !== "ok") return;
      expect(() => detalharObra(c.resultado, { ...obra, modoCalculo })).not.toThrow();
      // as colunas do prédio vão da base ao topo: nenhuma carga fica sem chegar à fundação
      expect(c.resultado.sistrut?.falhas ?? []).toEqual([]);
    }
  });

  it("erro de validação sai em português, com o arquivo, o item e o que fazer", () => {
    // área de carga com 2 vértices: linhas 36 (n = 2) e 34 (5 linhas), sem 2 vértices
    const linhas = lajE2E({ 34: "5", 36: "2" }).split("\r\n");
    linhas.splice(43, 4);
    const r = importarObraSistrut([comNome("COB.LAJ", linhas.join("\r\n"))]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // o .LAJ ficou de fora, e sem ele não há obra: o motivo vem na lista
    expect(r.erros).toContain(
      "COB.LAJ: carga de ocupação A1 (polígono): esperados pelo menos 3 pontos; o arquivo deu 2 itens. Abra o COB.LAJ no LAJEGEOM do SISTRUT, corrija e grave de novo, ou importe sem ele. O pavimento COB ficou de fora.",
    );
    for (const e of r.erros) expect(e).not.toMatch(/pavimentos\[|cargasOcupacao|\[\]/);
  });
});

describe("importarVigasSistrut: a montagem calculada uma vez", () => {
  // a importação calcula a obra uma vez e passa a montagem de cada pavimento ao
  // importador de vigas, no lugar de recalcular o prédio inteiro a cada .VIG
  const laj = importarLaj(Buffer.from(arquivo("E2E.LAJ").dados).toString("latin1"), {
    pavimento: { id: "E2E", nome: "E2E" },
  });
  if (!laj.ok) throw new Error(laj.erros.join("\n"));
  const vig = arquivo("E2E.VIG");

  it("com a montagem dada, é ela que vale (vazia: nenhuma viga casa)", () => {
    const r = importarVigasSistrut([vig], laj.obra, "E2E", []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.avisos).toContain("Viga V1 do .VIG não existe no pavimento E2E: ignorada.");
  });

  it("a montagem certa dá a mesma obra que recalcular", () => {
    const montagem = calcularObraSistrut(laj.obra, { modo: "original" }).pavimentos[0]!.montagem
      .vigas;
    const dada = importarVigasSistrut([vig], laj.obra, "E2E", montagem);
    const recalculada = importarVigasSistrut([vig], laj.obra, "E2E");
    expect(dada.ok && recalculada.ok).toBe(true);
    if (!dada.ok || !recalculada.ok) return;
    expect(dada.obra).toEqual(recalculada.obra);
    expect(dada.avisos).toEqual(recalculada.avisos);
  });
});

describe("importarObraSistrut: armadura editada (.EDV)", () => {
  // obra E2E do oráculo só de vigas (.VIG/.SEC/.FOR/.TAB de retrad_des_menu) com o
  // R1__E2E.EDV e o E2E.TAB que o original gravou ao sair do DESEDCAO (retrad_des_edc)
  const doOraculo = (caminho: string): ArquivoEntrada => ({
    nome: caminho.replace(/^.*\//, ""),
    dados: new Uint8Array(readFileSync(arquivoOraculo(caminho))),
  });
  const caso = "oraculo/casos/retrad_des_menu.dados";
  const run = "oraculo/runs/retrad_des_edc-20261015-082513/obra";
  const arquivos = [
    ...["E2E.VIG", "E2E.SEC", "E2E.FOR"].map((n) => doOraculo(`${caso}/${n}`)),
    doOraculo(`${run}/R1__E2E.EDV`),
  ];

  it("a viga V1 recebe a edição e o quadro dela bate com o .TAB regravado pelo original", () => {
    const r = importa(arquivos);
    const v1 = r.obra.pavimentos[0]!.vigas.find((v) => v.nome === "V1");
    expect(v1?.armaduraEditada?.registro).toBe(1);
    expect(r.resumo.lidos).toContain("R1__E2E.EDV");
    expect(r.avisos).toContainEqual(
      expect.stringMatching(/^Armadura editada no DESEDCAO .* E2E V1:/),
    );
    const tab = readFileSync(arquivoOraculo(`${run}/E2E.TAB`));
    const comprimentos = Array.from({ length: 10 }, (_, i) => tab.readFloatLE(10 + 4 * (5 + i)));
    const res = calcularObraSistrut(r.obra, { modo: "original" });
    const q = res.pavimentos[0]!.vigas.find((v) => v.nome === "V1")?.quadro;
    expect(q?.comprimentoPorBitola).toEqual(comprimentos);
  });

  it(".TAB sem .DSP: avisa que a obra parece usar parâmetros próprios; com o .DSP, não", () => {
    const comTab = [...arquivos, doOraculo(`${caso}/E2E.TAB`)];
    const aviso =
      /^A obra parece usar parâmetros próprios \(há \.TAB do DESENHO e nenhum \.DSP\): selecione também os arquivos de C:\\SISTRUT\\EXEC40 /;
    expect(importa(comTab).avisos).toContainEqual(expect.stringMatching(aviso));
    expect(importa(arquivos).avisos).not.toContainEqual(
      expect.stringMatching(/parâmetros próprios/),
    );
    const dsp = doOraculo("oraculo/orig/SISTRUT.DSP");
    expect(importa([...comTab, dsp]).avisos).not.toContainEqual(
      expect.stringMatching(/parâmetros próprios/),
    );
  });
});

describe("importarObraSistrut: vários .DSP (a pasta EXEC40 junto com a obra)", () => {
  // ESC.DSP: o SISTRUT.DSP com cobrimento de 3 cm, para a escolha aparecer na obra
  const sistrut = arquivo("SISTRUT.DSP");
  const esc = comNome(
    "ESC.DSP",
    new TextDecoder("latin1")
      .decode(sistrut.dados)
      .replace(
        "2.00              COBRIMENTO DA ARMADURA-CM",
        "3.00              COBRIMENTO DA ARMADURA-CM",
      ),
  );
  const obra = [arquivo("E2E.LAJ"), arquivo("E2E.VIG"), sistrut, esc];
  const desenhoIni = (padrao: string) =>
    comNome(
      "DESENHO.INI",
      readFileSync(arquivoOraculo("oraculo/orig/DESENHO.INI"), "latin1").replace(
        /^SISTRUT=/,
        `${padrao}=`,
      ),
    );
  const colEsc = comNome(
    "E2E.COL",
    new TextDecoder("latin1").decode(arquivo("E2E.COL").dados).replace("{SISTRUT}", "{ESC}"),
  );
  /** Os parâmetros do desenho que a obra recebe com um .DSP só. */
  const dspDe = (dsp: ArquivoEntrada) =>
    importa([arquivo("E2E.LAJ"), arquivo("E2E.VIG"), dsp]).obra.parametrosViga?.dsp;
  const motivo = (r: ReturnType<typeof importa>, nome: string) =>
    r.resumo.ignorados.find((i) => i.arquivo === nome)?.motivo;

  it("vale o da linha 1 do DESENHO.INI, e o outro fica de fora com o motivo", () => {
    const arquivos = [...obra, desenhoIni("ESC")];
    expect(dspsAEscolher(arquivos)).toBeUndefined();
    const r = importa(arquivos);
    expect(r.obra.parametrosViga?.dsp).toEqual(dspDe(esc));
    expect(r.resumo.lidos).toContain("ESC.DSP");
    expect(motivo(r, "SISTRUT.DSP")).toBe(
      "outra parametrização do desenho; valeu o ESC.DSP, a parametrização padrão da linha 1 do DESENHO.INI.",
    );
  });

  it("sem DESENHO.INI, vale o da parametrização que o .COL usa", () => {
    const arquivos = [...obra, colEsc];
    expect(dspsAEscolher(arquivos)).toBeUndefined();
    const r = importa(arquivos);
    expect(r.resumo.lidos).toContain("ESC.DSP");
    expect(motivo(r, "SISTRUT.DSP")).toBe(
      "outra parametrização do desenho; valeu o ESC.DSP, a parametrização que o .COL usa (ESC).",
    );
  });

  it("sem nada que diga: a tela pergunta; sem a resposta vale o SISTRUT.DSP, com aviso", () => {
    expect(dspsAEscolher(obra)).toEqual(["ESC.DSP", "SISTRUT.DSP"]);
    const sem = importa(obra);
    expect(sem.obra.parametrosViga?.dsp).toEqual(dspDe(sistrut));
    expect(motivo(sem, "ESC.DSP")).toMatch(
      /^outra parametrização do desenho; nem o DESENHO\.INI nem o \.COL dizem qual a obra usou, e valeu o SISTRUT\.DSP\./,
    );
    const r = importarObraSistrut(obra, { dsp: "ESC.DSP" });
    if (!r.ok) throw new Error(r.erros.join("\n"));
    expect(r.obra.parametrosViga?.dsp).toBeDefined();
    expect(r.resumo.ignorados.find((i) => i.arquivo === "SISTRUT.DSP")?.motivo).toBe(
      "outra parametrização do desenho; valeu o ESC.DSP, a escolhida na importação.",
    );
  });

  it("o .COL com a parametrização SISTRUT (a tabela de fábrica) não escolhe o .DSP: pergunta", () => {
    expect(dspsAEscolher([...obra, arquivo("E2E.COL")])).toEqual(["ESC.DSP", "SISTRUT.DSP"]);
  });

  it("não pergunta sem .VIG nem com nomes repetidos (a importação recusa antes)", () => {
    expect(dspsAEscolher([arquivo("E2E.LAJ"), sistrut, esc])).toBeUndefined();
    const repetido = { ...arquivo("E2E.LAJ"), nome: "e2e.laj" };
    expect(dspsAEscolher([...obra, repetido])).toBeUndefined();
    expect(importarObraSistrut([...obra, repetido]).ok).toBe(false);
  });

  it("um .DSP só: entra sem aviso", () => {
    const r = importa([arquivo("E2E.LAJ"), arquivo("E2E.VIG"), esc]);
    expect(r.resumo.lidos).toContain("ESC.DSP");
    expect(r.avisos.join(" ")).not.toMatch(/parametrização do desenho/);
  });
});

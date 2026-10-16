// Testa a importação de uma obra do SISTRUT a partir dos arquivos escolhidos de uma vez.
// Obra E2E (4 lajes 4×5 m, vigas no contorno e no meio, 9 pilares): LAJ, VIG, SEC, FOR,
// COL, REP e RLP vêm de tests/retraducao/forma/obra (v1-par2); DSP e PIP de
// roteiros/e2e_10_forma.dados. O prédio de vários pavimentos é sintético: o .LAJ da E2E
// editado linha a linha para os casos das obras gravadas por usuários (vaga livre de
// A_1014 com o fechamento da última área, pavimento só com buracos) e um .COL montado
// aqui no formato do PIGRAEDI.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arquivoOraculo } from "../calculo/sistrut/__oraculo__/arquivosOraculo";
import { lerCol } from "../armazenamento/sistrut/pilar";
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
import { importarObraSistrut, type ArquivoEntrada } from "./InicioSistrut";

const importa = (arquivos: readonly ArquivoEntrada[]) => {
  const r = importarObraSistrut(arquivos);
  if (!r.ok) throw new Error(r.erros.join("\n"));
  return r;
};

describe("importarObraSistrut", () => {
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
    // um nível MEIO sem .LAJ entre BASE e TETO; seção 20, 25 e 30 cm nos lances 1→2, 2→3
    // e 3→4: o TETO (nível 4) fica com 30 (de baixo para cima, sem os nomes, ficaria com 25)
    const col = colPredio(
      [
        ["FUND", 0],
        ["BASE", 0.4],
        ["MEIO", 3.4],
        ["TETO", 6.4],
      ],
      9,
      [20, 25, 30],
    );
    expect(lerCol(col).ok).toBe(true);
    const r = importa([
      comNome("TETO.LAJ", COM_VAGA_SUJA),
      comNome("BASE.LAJ", SO_BURACOS),
      comNome("PREDIO.COL", col),
    ]);
    const lado = (pav: string) =>
      r.obra.pavimentos.find((p) => p.id === pav)!.pilares.map((p) => p.b);
    expect(new Set(lado("TETO"))).toEqual(new Set([30]));
    expect(new Set(lado("BASE"))).toEqual(new Set([20]));
    expect(r.obra.pavimentos.find((p) => p.id === "TETO")!.peDireito).toBe(3);
    expect(r.avisos.filter((a) => /lances|sem nível|não casou/.test(a))).toEqual([]);
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
      expect.stringMatching(/^ESCADA\.VIG: não há ESCADA\.LAJ e o \.VIG não diz de que pavimento/),
    );
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

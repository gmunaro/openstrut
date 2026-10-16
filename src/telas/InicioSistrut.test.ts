// Testa a importação de uma obra do SISTRUT a partir dos arquivos escolhidos de uma vez.
// Obra E2E (4 lajes 4×5 m, vigas no contorno e no meio, 9 pilares): LAJ, VIG, SEC, FOR,
// COL, REP e RLP vêm de tests/retraducao/forma/obra (v1-par2); DSP e PIP de
// roteiros/e2e_10_forma.dados. O prédio de vários pavimentos é sintético: o .LAJ da E2E
// editado linha a linha para os casos das obras gravadas por usuários (vaga livre de
// A_1014 com o fechamento da última área, pavimento só com buracos) e um .COL montado
// aqui no formato do PIGRAEDI.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lerCol } from "../armazenamento/sistrut/pilar";
import { calcularObraSistrut } from "../calculo/sistrut/obra";
import { calcular } from "./calculo";
import { detalharObra } from "./detalhamento";
import { importarObraSistrut, type ArquivoEntrada } from "./InicioSistrut";

const PASTA = fileURLToPath(new URL("./__fixtures__/sistrut/", import.meta.url));

/** Lê um arquivo da pasta de fixtures como o seletor do navegador o entregaria. */
const arquivo = (nome: string): ArquivoEntrada => ({
  nome,
  dados: new Uint8Array(readFileSync(`${PASTA}${nome}`)),
});
/** Arquivo com outro nome (o conteúdo de `origem`) ou com o texto dado. */
const comNome = (nome: string, origem: string | ArquivoEntrada): ArquivoEntrada => ({
  nome,
  dados: typeof origem === "string" ? new Uint8Array(Buffer.from(origem, "latin1")) : origem.dados,
});

const OBRA_E2E: ArquivoEntrada[] = [
  "E2E.LAJ",
  "E2E.VIG",
  "E2E.SEC",
  "SISTRUT.DSP",
  "E2E.COL",
  "SISTRUT.PIP",
  "E2E.REP",
  "E2E.RLP",
].map(arquivo);

/** Serialização sem os ids: importadores de viga e pilar geram ids novos a cada chamada. */
const semIds = (valor: unknown): string =>
  JSON.stringify(valor).replace(/"id":"[^"]*"/g, '"id":"_"');

// ---------------------------------------------------------------- prédio sintético

/** O E2E.LAJ com as linhas trocadas (número da linha → valor), em CRLF como o original. */
function lajE2E(troca: Record<number, string> = {}): string {
  const linhas = readFileSync(`${PASTA}E2E.LAJ`, "latin1").split(/\r?\n/);
  for (const [k, v] of Object.entries(troca)) linhas[Number(k) - 1] = ` ${v} `;
  return linhas.join("\r\n");
}
// linhas do E2E.LAJ: 34 = A_1014(0,0), a próxima linha livre; 35 = A_1014(0,1), o número
// de áreas; 36-49 = as linhas de A_1014 (n, total e acidental, 4 vértices e a livre); 78 =
// número de lajes; 147, 156, 165 e 174 = tipo de cada painel
/** Área começando em (8; 0): a linha livre fica com o ponto que fecha o polígono, como o
 *  LAJEGEOM a deixa, e a coluna 2 da linha do nº de vértices com lixo (o COB.LAJ de 1994
 *  que deu "cargasOcupacao[3].poligono: esperados pelo menos 3 pontos"). */
const COM_VAGA_SUJA = lajE2E({
  37: ".275",
  40: "8",
  41: "0",
  42: "8",
  43: "10",
  44: "0",
  45: "10",
  46: "0",
  47: "0",
  48: "8",
  49: "0",
});
/** Os 4 painéis como buraco (tipo 2): o térreo sobre o solo, só com vigas baldrame. */
const SO_BURACOS = lajE2E({ 78: "0", 147: "2", 156: "2", 165: "2", 174: "2" });

/** .COL do PIGRAEDI (PIGRAEDI.BAS:470-582) com os níveis dados, de baixo para cima, e as
 *  colunas P1..Pn do primeiro ao último nível, sem vínculos, cargas nem armaduras; com
 *  `secoes`, a seção quadrada de lado secoes[j] no lance j → j + 1 (1-based) de todas. */
function colPredio(niveis: [string, number][], colunas: number, secoes: number[] = []): string {
  const n = niveis.length;
  const secao = secoes.flatMap((lado, j) => [j + 2, lado, lado, 0, 0, 0, 1].map((x) => ` ${x} `));
  return [
    "SISTRUT Software e Tecnologia s/c Ltda",
    "Obra - PREDIO",
    "Arquivo com dados de PILARES inicializado em 01-01-1994 00:00:00",
    ` ${n} =NUMERO DE NIVEIS`,
    ` ${colunas} =NUMERO DE COLUNAS`,
    ` ${n} ,`,
    ...niveis.map(([nome, cota]) => ` ${cota} ,${nome}`),
    ...Array.from(
      { length: colunas },
      (_, i) => `P${i + 1},N ( 1 ) ${niveis[0]![0]},N ( ${n} ) ${niveis[n - 1]![0]}`,
    ),
    ...Array.from({ length: colunas }, () => " 0 , 0 , 0 , 0 , 0 , 0 "),
    " 0 [1] 3 [2] 4 [3] 40 [4] 0 [5] 0 [6] .15 [7] 5 [8]B[9]t/cm2[10] 2 [11]{SISTRUT}[12] 1 ",
    " 0 ", // sem cargas
    secoes.length > 0 ? " 1 " : " 0 ", // seções
    " 0 ", // poligonais
    ...(secoes.length > 0 ? Array.from({ length: colunas }, () => [...secao, " 0 "]).flat() : []),
    " 0 ", // sem armaduras
    "FIM",
  ].join("\r\n");
}

/** TETO (laje com a vaga de A_1014 suja, vigas do .VIG) sobre BASE (só buracos), com o
 *  .COL de níveis FUND (0), BASE (0,4 m) e TETO (3,4 m): BASE vem antes de TETO na ordem
 *  alfabética, e a ordem certa só sai das cotas. Mais um .REP e um .RLP do TETO, uma
 *  viga avulsa (ESCADA.VIG, sem .LAJ), uma cópia de segurança e um desenho editado. */
const PREDIO: ArquivoEntrada[] = [
  comNome("TETO.LAJ", COM_VAGA_SUJA),
  comNome("TETO.VIG", arquivo("E2E.VIG")),
  comNome("TETO.SEC", arquivo("E2E.SEC")),
  comNome("TETO.FOR", arquivo("E2E.FOR")),
  comNome("BASE.LAJ", SO_BURACOS),
  comNome(
    "PREDIO.COL",
    colPredio(
      [
        ["FUND", 0],
        ["BASE", 0.4],
        ["TETO", 3.4],
      ],
      9,
    ),
  ),
  comNome("TETO.REP", arquivo("E2E.REP")),
  comNome("TETO.RLP", arquivo("E2E.RLP")),
  comNome("ESCADA.VIG", arquivo("E2E.VIG")),
  comNome("TETO.BAK", COM_VAGA_SUJA),
  comNome("R5__TETO.EDV", " 1 \r\n"),
];

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

  it("sem .LAJ não monta nada e diz o que selecionar", () => {
    const r = importarObraSistrut(OBRA_E2E.filter((a) => !a.nome.endsWith(".LAJ")));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros).toEqual([expect.stringContaining("Nenhum .LAJ")]);
  });

  it("erro do .LAJ vem com o nome do arquivo na frente", () => {
    const r = importarObraSistrut([
      { nome: "E2E.LAJ", dados: new Uint8Array() },
      ...OBRA_E2E.filter((a) => !a.nome.endsWith(".LAJ")),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.length).toBeGreaterThan(0);
    for (const e of r.erros) expect(e).toMatch(/^E2E\.LAJ: /);
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

  it(".BAK e .EDV ficam de fora com o motivo", () => {
    const r = importa(PREDIO);
    expect(r.avisos).toContain(
      "TETO.BAK: cópia de segurança do .LAJ anterior, que o LAJEGRAV guarda ao gravar (LAJEGRAV.BAS:484); não usada.",
    );
    expect(r.avisos).toContain(
      "R5__TETO.EDV: desenho de armadura editado de uma viga, do DESEDCAO; não importado.",
    );
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
    expect(r.erros).toEqual([
      expect.stringMatching(
        /^COB\.LAJ, carga de ocupação A1 \(polígono\): .*Abra o COB\.LAJ no LAJEGEOM do SISTRUT, corrija e grave de novo, ou importe sem ele\.$/,
      ),
    ]);
    expect(r.erros[0]).not.toMatch(/pavimentos\[|cargasOcupacao|\[\]/);
  });
});

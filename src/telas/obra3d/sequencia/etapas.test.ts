// Sequência construtiva (etapas.ts) sobre um modelo montado de peças escritas à mão: as
// contagens e as chaves são conhecidas por construção. Os valores esperados saem de conta à
// mão (nos comentários), nunca da saída da função.
//
// Obra de teste, pavimentos do topo para a base (como em obra.pavimentos):
//   COB  (pé-direito 3, 1 repetição): pilares P1 (0,0) e P2 (4,0), laje L1, SEM vigas.
//   TIPO (pé-direito 3, 2 repetições): pilares P1 e P2, vigas V1 e V2, laje L1.
//
// niveisDaObra percorre da base ao topo e a repetição 2 é a mais baixa, então:
//   nível 0 "TIPO (2/2)" (cota 0 → 3), nível 1 "TIPO (1/2)" (3 → 6), nível 2 "COB" (6 → 9).
// Os pilares P1 e P2 nascem no nível 0 e seguem pelo mesmo nome nos níveis 1 e 2: há 2
// colunas, ambas chegam ao chão, logo 2 blocos de fundação. O COB não tem vigas: a etapa
// "Fôrma e vigas · COB" some.
//
// Chaves (Elemento3D.chave): pilar:<nível>:<id>, viga:<nível>:<id>, laje:<nível>:<id>, e
// fundacao:<chave do lance de baixo da coluna>. Nível = "TIPO#2", "TIPO#1" ou "COB#1"; id de
// pilar = "P1@0,0" e "P2@4,0" (helper pilar); id de viga e de laje = o nome.
//
// Etapas com DURACAO_PADRAO (fundação 7, pilares 3, vigas 4, lajes 5), início de obra
// 2026-10-26 (dia 0):
//   #  tipo      nível        peças  inicio  dias  dias de obra
//   1  fundacao  —            2      0       7     0..6
//   2  pilares   TIPO (2/2)   2      7       3     7..9
//   3  vigas     TIPO (2/2)   2      10      4     10..13
//   4  lajes     TIPO (2/2)   1      14      5     14..18
//   5  pilares   TIPO (1/2)   2      19      3     19..21
//   6  vigas     TIPO (1/2)   2      22      4     22..25
//   7  lajes     TIPO (1/2)   1      26      5     26..30
//   8  pilares   COB          2      31      3     31..33
//   9  lajes     COB          1      34      5     34..38
// totalDias = 34 + 5 = 39.
import { describe, expect, it } from "vitest";
import { obraNova, pavimentoNovo } from "../../../dominio/criar";
import type { Laje, Obra, Pavimento, Pilar, Viga } from "../../../dominio/obra";
import type { Modelo3D } from "../api";
import { montarModelo } from "../modelo";
import {
  cronogramaCsv,
  dataBr,
  datasDaEtapa,
  diasValidos,
  type Etapa,
  etapaNoDia,
  gerarEtapas,
  pecasNoDia,
  somarDias,
  totalDias,
} from "./etapas";

// Helpers de peças, iguais aos do topo de modelo.test.ts.
const pilar = (nome: string, x: number, y: number, extra: Partial<Pilar> = {}): Pilar => ({
  id: `${nome}@${x},${y}`,
  nome,
  x,
  y,
  b: 20,
  h: 40,
  ...extra,
});
const viga = (
  nome: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra: Partial<Viga> = {},
): Viga => ({
  id: nome,
  nome,
  x1,
  y1,
  x2,
  y2,
  bw: 12,
  h: 50,
  cargaLinear: 0,
  ...extra,
});
const laje = (
  nome: string,
  x: number,
  y: number,
  lx: number,
  ly: number,
  extra: Partial<Laje> = {},
): Laje => ({
  id: nome,
  nome,
  x,
  y,
  lx,
  ly,
  h: 10,
  revestimento: 1,
  sobrecarga: 2,
  vinculos: {},
  mu: 1,
  ...extra,
});
function pav(
  nome: string,
  peDireito: number,
  repeticoes: number,
  p: Partial<Pavimento>,
): Pavimento {
  return { ...pavimentoNovo(nome, peDireito, repeticoes), id: nome, ...p };
}
function obra(pavimentos: Pavimento[]): Obra {
  return { ...obraNova("Teste etapas", "nbr6118-2023"), pavimentos };
}

const obraTeste = obra([
  pav("COB", 3, 1, {
    lajes: [laje("L1", 0, 0, 4, 5)],
    pilares: [pilar("P1", 0, 0), pilar("P2", 4, 0)],
  }),
  pav("TIPO", 3, 2, {
    lajes: [laje("L1", 0, 0, 4, 5)],
    vigas: [viga("V1", 0, 0, 4, 0), viga("V2", 0, 5, 4, 5)],
    pilares: [pilar("P1", 0, 0), pilar("P2", 4, 0)],
  }),
]);
const modelo = montarModelo(obraTeste);

// Chaves esperadas, por etapa, escritas à mão.
const F = ["fundacao:pilar:TIPO#2:P1@0,0", "fundacao:pilar:TIPO#2:P2@4,0"];
const P0 = ["pilar:TIPO#2:P1@0,0", "pilar:TIPO#2:P2@4,0"];
const V0 = ["viga:TIPO#2:V1", "viga:TIPO#2:V2"];
const L0 = ["laje:TIPO#2:L1"];
const P1 = ["pilar:TIPO#1:P1@0,0", "pilar:TIPO#1:P2@4,0"];
const V1 = ["viga:TIPO#1:V1", "viga:TIPO#1:V2"];
const L1 = ["laje:TIPO#1:L1"];
const P2 = ["pilar:COB#1:P1@0,0", "pilar:COB#1:P2@4,0"];
const L2 = ["laje:COB#1:L1"];
const TODAS = [...F, ...P0, ...V0, ...L0, ...P1, ...V1, ...L1, ...P2, ...L2];

const INICIO_OBRA = "2026-10-26";

describe("premissas do modelo de teste", () => {
  it("níveis da base ao topo, 2 colunas e 2 blocos de fundação", () => {
    expect(modelo.niveis.map((n) => n.nome)).toEqual(["TIPO (2/2)", "TIPO (1/2)", "COB"]);
    expect(modelo.colunas).toHaveLength(2);
    expect(modelo.elementos.filter((e) => e.tipo === "fundacao").map((e) => e.chave)).toEqual(F);
  });
});

describe("gerarEtapas com DURACAO_PADRAO", () => {
  const etapas = gerarEtapas(modelo);

  it("ordem, nomes, tipo, nível e número de chaves de cada etapa", () => {
    expect(
      etapas.map((e) => ({
        tipo: e.tipo,
        nivel: e.nivel,
        servico: e.servico,
        nomeNivel: e.nomeNivel,
        nome: e.nome,
        numChaves: e.chaves.length,
      })),
    ).toEqual([
      {
        tipo: "fundacao",
        nivel: 0,
        servico: "Fundação",
        nomeNivel: "",
        nome: "Fundação",
        numChaves: 2,
      },
      {
        tipo: "pilares",
        nivel: 0,
        servico: "Pilares",
        nomeNivel: "TIPO (2/2)",
        nome: "Pilares · TIPO (2/2)",
        numChaves: 2,
      },
      {
        tipo: "vigas",
        nivel: 0,
        servico: "Fôrma e vigas",
        nomeNivel: "TIPO (2/2)",
        nome: "Fôrma e vigas · TIPO (2/2)",
        numChaves: 2,
      },
      {
        tipo: "lajes",
        nivel: 0,
        servico: "Lajes",
        nomeNivel: "TIPO (2/2)",
        nome: "Lajes · TIPO (2/2)",
        numChaves: 1,
      },
      {
        tipo: "pilares",
        nivel: 1,
        servico: "Pilares",
        nomeNivel: "TIPO (1/2)",
        nome: "Pilares · TIPO (1/2)",
        numChaves: 2,
      },
      {
        tipo: "vigas",
        nivel: 1,
        servico: "Fôrma e vigas",
        nomeNivel: "TIPO (1/2)",
        nome: "Fôrma e vigas · TIPO (1/2)",
        numChaves: 2,
      },
      {
        tipo: "lajes",
        nivel: 1,
        servico: "Lajes",
        nomeNivel: "TIPO (1/2)",
        nome: "Lajes · TIPO (1/2)",
        numChaves: 1,
      },
      {
        tipo: "pilares",
        nivel: 2,
        servico: "Pilares",
        nomeNivel: "COB",
        nome: "Pilares · COB",
        numChaves: 2,
      },
      {
        tipo: "lajes",
        nivel: 2,
        servico: "Lajes",
        nomeNivel: "COB",
        nome: "Lajes · COB",
        numChaves: 1,
      },
    ]);
  });

  it("chaves de cada etapa (sem fôrma no COB, que não tem vigas)", () => {
    expect(etapas.map((e) => e.chaves)).toEqual([F, P0, V0, L0, P1, V1, L1, P2, L2]);
  });

  it("início e duração: sequenciais em dias corridos, total 39", () => {
    expect(etapas.map((e) => e.inicio)).toEqual([0, 7, 10, 14, 19, 22, 26, 31, 34]);
    expect(etapas.map((e) => e.dias)).toEqual([7, 3, 4, 5, 3, 4, 5, 3, 5]);
    expect(totalDias(etapas)).toBe(39);
  });

  it("datas de cada etapa, cruzando a virada de mês (início 26/10/2026)", () => {
    expect(
      etapas.map((e) => {
        const d = datasDaEtapa(e, INICIO_OBRA);
        return [dataBr(d.inicio), dataBr(d.fim)];
      }),
    ).toEqual([
      ["26/10/2026", "01/11/2026"],
      ["02/11/2026", "04/11/2026"],
      ["05/11/2026", "08/11/2026"],
      ["09/11/2026", "13/11/2026"],
      ["14/11/2026", "16/11/2026"],
      ["17/11/2026", "20/11/2026"],
      ["21/11/2026", "25/11/2026"],
      ["26/11/2026", "28/11/2026"],
      ["29/11/2026", "03/12/2026"],
    ]);
    // Última etapa: início = 26/10 + 34 dias = 29/11; fim = início + 4 = 03/12.
    expect(datasDaEtapa(etapas[8]!, INICIO_OBRA)).toEqual({
      inicio: "2026-11-29",
      fim: "2026-12-03",
    });
  });
});

describe("gerarEtapas com durações editadas", () => {
  // fundação 10, pilares 2, vigas 3, lajes 6.
  const etapas = gerarEtapas(modelo, { fundacao: 10, pilares: 2, vigas: 3, lajes: 6 });

  it("início, duração e total", () => {
    expect(etapas.map((e) => e.inicio)).toEqual([0, 10, 12, 15, 21, 23, 26, 32, 34]);
    expect(etapas.map((e) => e.dias)).toEqual([10, 2, 3, 6, 2, 3, 6, 2, 6]);
    expect(totalDias(etapas)).toBe(40);
  });

  it("última etapa: início 34 = 29/11; fim 34 + 6 − 1 = 39 = 04/12", () => {
    const d = datasDaEtapa(etapas[8]!, INICIO_OBRA);
    expect([dataBr(d.inicio), dataBr(d.fim)]).toEqual(["29/11/2026", "04/12/2026"]);
  });
});

describe("pecasNoDia e etapaNoDia", () => {
  const etapas = gerarEtapas(modelo);
  // Etapas: F [0,7), P0 [7,10), V0 [10,14), L0 [14,19), P1 [19,22), V1 [22,26),
  // L1 [26,31), P2 [31,34), L2 [34,39).
  it.each([
    { dia: 0, idx: 0, visiveis: [F], emObra: [F] },
    { dia: 7, idx: 1, visiveis: [F, P0], emObra: [P0] },
    { dia: 9, idx: 1, visiveis: [F, P0], emObra: [P0] },
    { dia: 38, idx: 8, visiveis: [F, P0, V0, L0, P1, V1, L1, P2, L2], emObra: [L2] },
    { dia: 39, idx: -1, visiveis: [F, P0, V0, L0, P1, V1, L1, P2, L2], emObra: [] },
  ])("dia $dia: etapa $idx", ({ dia, idx, visiveis, emObra }) => {
    expect(etapaNoDia(etapas, dia)).toBe(idx);
    const r = pecasNoDia(etapas, dia);
    expect(r.visiveis).toEqual(new Set(visiveis.flat()));
    expect(r.emObra).toEqual(new Set(emObra.flat()));
  });

  it("antes do início da obra, nada aparece", () => {
    expect(etapaNoDia(etapas, -1)).toBe(-1);
    expect(pecasNoDia(etapas, -1).visiveis.size).toBe(0);
  });

  it("todas as chaves do modelo aparecem exatamente uma vez no cronograma", () => {
    expect(etapas.flatMap((e) => e.chaves).sort()).toEqual([...TODAS].sort());
    expect(new Set(TODAS).size).toBe(15);
  });
});

describe("escada", () => {
  // 2 níveis. Escada E0 no nível 0 (vai para as lajes do nível 1); escada E1 no último nível
  // (nível 1, lajes do último). Pelo clamp de min(nível + 1, último), E0 também cai no 1.
  // Chaves fictícias: o gerarEtapas só usa tipo, nível e chave.
  const elemento = (
    tipo: Modelo3D["elementos"][number]["tipo"],
    chave: string,
    nivel: number,
  ): Modelo3D["elementos"][number] => ({
    chave,
    tipo,
    id: chave,
    nome: chave,
    pavimentoId: nivel === 0 ? "A" : "B",
    nivel,
    repeticao: 1,
    solidos: [],
    secao: "",
    notas: [],
  });
  const modeloEscada: Modelo3D = {
    niveis: [
      {
        chave: "A#1",
        pavimentoId: "A",
        nome: "Térreo",
        repeticao: 1,
        indice: 0,
        cotaPiso: 0,
        cota: 3,
      },
      {
        chave: "B#1",
        pavimentoId: "B",
        nome: "Cobertura",
        repeticao: 1,
        indice: 1,
        cotaPiso: 3,
        cota: 6,
      },
    ],
    elementos: [
      elemento("escada", "escada:A#1:E0", 0),
      elemento("laje", "laje:A#1:L0", 0),
      elemento("laje", "laje:B#1:L1", 1),
      elemento("escada", "escada:B#1:E1", 1),
    ],
    colunas: [],
    eixos: [],
    avisos: [],
    caixa: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 6 } },
  };

  it("escada do nível 0 sai das lajes do nível 0 e entra nas lajes do último com 'Lajes e escada'", () => {
    const etapas = gerarEtapas(modeloEscada);
    expect(
      etapas.map((e) => ({
        servico: e.servico,
        nome: e.nome,
        chaves: e.chaves,
        inicio: e.inicio,
        dias: e.dias,
      })),
    ).toEqual([
      { servico: "Lajes", nome: "Lajes · Térreo", chaves: ["laje:A#1:L0"], inicio: 0, dias: 5 },
      {
        servico: "Lajes e escada",
        nome: "Lajes e escada · Cobertura",
        chaves: ["escada:A#1:E0", "laje:B#1:L1", "escada:B#1:E1"],
        inicio: 5,
        dias: 5,
      },
    ]);
  });
});

describe("cronogramaCsv", () => {
  it("cabeçalho, uma linha por etapa e datas em dd/mm/aaaa (padrão, início 26/10/2026)", () => {
    const esperado =
      [
        "Etapa;Serviço;Nível;Peças;Início;Fim;Dias",
        "1;Fundação;;2;26/10/2026;01/11/2026;7",
        "2;Pilares;TIPO (2/2);2;02/11/2026;04/11/2026;3",
        "3;Fôrma e vigas;TIPO (2/2);2;05/11/2026;08/11/2026;4",
        "4;Lajes;TIPO (2/2);1;09/11/2026;13/11/2026;5",
        "5;Pilares;TIPO (1/2);2;14/11/2026;16/11/2026;3",
        "6;Fôrma e vigas;TIPO (1/2);2;17/11/2026;20/11/2026;4",
        "7;Lajes;TIPO (1/2);1;21/11/2026;25/11/2026;5",
        "8;Pilares;COB;2;26/11/2026;28/11/2026;3",
        "9;Lajes;COB;1;29/11/2026;03/12/2026;5",
      ].join("\r\n") + "\r\n";
    expect(cronogramaCsv(gerarEtapas(modelo), INICIO_OBRA)).toBe(esperado);
  });

  it("campo com ';' e aspas vai entre aspas, com aspas dobradas", () => {
    const etapa: Etapa = {
      tipo: "lajes",
      nivel: 0,
      servico: "Lajes e escada",
      nomeNivel: 'Bloco "A"; ala',
      nome: 'Lajes e escada · Bloco "A"; ala',
      chaves: ["x"],
      inicio: 0,
      dias: 2,
    };
    // Início 0 → 26/10/2026; fim = 0 + 2 − 1 = 1 → 27/10/2026.
    expect(cronogramaCsv([etapa], INICIO_OBRA)).toBe(
      'Etapa;Serviço;Nível;Peças;Início;Fim;Dias\r\n1;Lajes e escada;"Bloco ""A""; ala";1;26/10/2026;27/10/2026;2\r\n',
    );
  });
});

describe("somarDias", () => {
  it("virada de ano, para frente e para trás", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("29 de fevereiro existe em 2028 e não existe em 2026", () => {
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2028-02-28", 2)).toBe("2028-03-01");
    expect(somarDias("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("zero dias devolve a mesma data e data inválida devolve a entrada", () => {
    expect(somarDias("2026-10-26", 0)).toBe("2026-10-26");
    expect(somarDias("não é data", 3)).toBe("não é data");
  });
});

describe("diasValidos", () => {
  it("mínimo de 1 dia, arredonda para inteiro, inválido vira 1", () => {
    expect(diasValidos(0)).toBe(1);
    expect(diasValidos(2.6)).toBe(3);
    expect(diasValidos(NaN)).toBe(1);
  });
});

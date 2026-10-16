// Arquivo da obra com os campos de laje do SISTRUT (polígono, vínculos por lado, ângulo,
// tipo, armaduras impostas, cargas de ocupação, alvenarias, trechos de pilar-parede e
// parâmetros do .LAP): ida e volta, arquivo antigo sem eles, o retângulo envolvente do
// polígono e as recusas da validação.
import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../dominio/criar";
import type { Obra } from "../dominio/obra";
import { lerObra, serializarObra } from "./arquivo";

function obraComLajeSistrut(): Obra {
  const obra = obraNova("POL", "nb1-78");
  const p = obra.pavimentos[0]!;
  const l = lajeNova(p, { x: 0, y: 0, lx: 6, ly: 5 });
  p.lajes.push({
    ...l,
    poligono: [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 3, y: 5 },
      { x: 3, y: 3 },
      { x: 6, y: 3 },
      { x: 6, y: 0 },
    ],
    vinculosLados: [null, "livre", null, null, "engastado", null],
    anguloArmadura: 30,
    tipo: "pre-moldada",
    armaduraImposta: { principal: { bitola: 8, espacamento: 10 } },
    negativasImpostas: [null, null, null, null, { bitola: 6.3, espacamento: 10 }, null],
  });
  p.trechosPilares = [{ pilar: "P1", inicio: { x: 0, y: 0 }, fim: { x: 2, y: 0 } }];
  p.cargasOcupacao = [
    {
      // a área de ocupação do LAJEGEOM pode vir no sentido anti-horário
      poligono: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 5 },
      ],
      total: 2.94,
      acidental: 1.96,
    },
  ];
  p.alvenarias = [{ inicio: { x: 2, y: 0 }, fim: { x: 2, y: 5 }, carga: 3.92 }];
  return {
    ...obra,
    parametrosLaje: {
      relacaoNegPosMin: 0.35,
      gamaF: 1.5,
      espacamentos: [7.5, 10, 15],
      flecha: { lfTotal: 250, lfAcidental: 350, multiplicadorEc: 0.9, deformacaoLenta: false },
    },
  };
}

const erros = (obra: unknown) => {
  const r = lerObra(JSON.stringify(obra));
  return r.ok ? [] : r.erros;
};

describe("campos de laje do SISTRUT no arquivo", () => {
  it("salvar e abrir devolve a mesma obra", () => {
    const obra = obraComLajeSistrut();
    const r = lerObra(serializarObra(obra));
    expect(r).toEqual({ ok: true, obra, versaoOrigem: 3, migrada: false });
  });

  it("arquivo sem os campos novos abre igual a antes (nada acrescentado)", () => {
    const obra = obraNova("FLUXO", "nb1-78");
    obra.pavimentos[0]!.lajes.push(lajeNova(obra.pavimentos[0]!, { x: 0, y: 0, lx: 4, ly: 5 }));
    const r = lerObra(serializarObra(obra));
    expect(r).toEqual({ ok: true, obra, versaoOrigem: 3, migrada: false });
    if (!r.ok) return;
    expect(r.obra.parametrosLaje).toBeUndefined();
    expect(r.obra.pavimentos[0]!).not.toHaveProperty("cargasOcupacao");
    expect(r.obra.pavimentos[0]!.lajes[0]!).not.toHaveProperty("poligono");
  });

  it("recusa polígono de laje anti-horário e vínculos que não casam com os lados", () => {
    const d = JSON.parse(serializarObra(obraComLajeSistrut()));
    const laje = d.pavimentos[0].lajes[0];
    laje.poligono.reverse();
    laje.vinculosLados = ["livre"];
    laje.anguloArmadura = 180;
    laje.tipo = "nervurada";
    expect(erros(d)).toEqual([
      "pavimentos[0].lajes[0].poligono: o polígono deve estar em sentido horário e ter área.",
      'pavimentos[0].lajes[0].vinculosLados: esperado um item por lado do polígono (6), veio ["livre"].',
      "pavimentos[0].lajes[0].anguloArmadura: esperado um ângulo de 0 a 180 graus (sem o 180), veio 180.",
      'pavimentos[0].lajes[0].tipo: esperado um de "macica", "pre-moldada", "comum-nao-calculada", veio "nervurada".',
    ]);
  });

  it("recusa parâmetro do .LAP desconhecido e os que vêm dos materiais (fck, cobrimento, densidade)", () => {
    const d = JSON.parse(serializarObra(obraComLajeSistrut()));
    d.parametrosLaje = { fck: 0.2, cobrimento: 2, densidade: 2.5, pisoInventado: 1 };
    const motivo =
      "parâmetro do .LAP desconhecido (fck, fyk, classe do aço, cobrimento e densidade vêm dos materiais)";
    expect(erros(d)).toEqual([
      `obra.parametrosLaje.fck: ${motivo}, veio "fck".`,
      `obra.parametrosLaje.cobrimento: ${motivo}, veio "cobrimento".`,
      `obra.parametrosLaje.densidade: ${motivo}, veio "densidade".`,
      `obra.parametrosLaje.pisoInventado: ${motivo}, veio "pisoInventado".`,
    ]);
  });

  it("tabelas indexadas com o tamanho de fábrica, índice de bitola existente e positivos onde há divisão", () => {
    const d = JSON.parse(serializarObra(obraComLajeSistrut()));
    d.parametrosLaje = {
      relacaoNegPosMin: "0,35",
      eficienciaNegativa: 0,
      bitolas: [{ bitola: 5, area: 0.2 }],
      relacaoMu: [{ relacao: 1, mu: 1 }],
      espacamentoMinimoPorH: [{ hAte: 10, espacamento: 7.5 }],
      bitolaPorH: [
        { hAte: 5, indiceBitola: 0 },
        { hAte: 5.5, indiceBitola: 1 },
        { hAte: 14, indiceBitola: 2 },
        { hAte: 25, indiceBitola: 3 },
        { hAte: 32, indiceBitola: 4 },
        { hAte: 40, indiceBitola: 10 },
      ],
      espacamentos: [7.5, 0],
    };
    expect(erros(d)).toEqual([
      'obra.parametrosLaje.bitolas: esperados 10 itens, como na tabela de fábrica, veio [{"bitola":5,"area":0.2}].',
      'obra.parametrosLaje.relacaoMu: esperados 15 itens, como na tabela de fábrica, veio [{"relacao":1,"mu":1}].',
      'obra.parametrosLaje.espacamentoMinimoPorH: esperados 4 itens, como na tabela de fábrica, veio [{"hAte":10,"espacamento":7.5}].',
      "obra.parametrosLaje.espacamentos[1]: esperado um número maior que zero, veio 0.",
      "obra.parametrosLaje.bitolaPorH[5].indiceBitola: esperado um índice inteiro de 0 a 9, veio 10.",
      'obra.parametrosLaje.relacaoNegPosMin: esperado um número, veio "0,35".',
      "obra.parametrosLaje.eficienciaNegativa: esperado um número maior que zero, veio 0.",
    ]);
  });

  it("laje com polígono: x, y, lx e ly saem do retângulo envolvente, ao abrir e ao salvar", () => {
    const obra = obraComLajeSistrut();
    const laje = obra.pavimentos[0]!.lajes[0]!;
    // o desenho moveu o retângulo, mas o polígono ficou: vale o polígono
    obra.pavimentos[0]!.lajes[0] = { ...laje, x: 9, y: 9, lx: 1, ly: 1 };
    const salvo = JSON.parse(serializarObra(obra));
    expect(salvo.pavimentos[0].lajes[0]).toMatchObject({ x: 0, y: 0, lx: 6, ly: 5 });
    salvo.pavimentos[0].lajes[0].lx = 2;
    const r = lerObra(JSON.stringify(salvo));
    expect(r.ok && r.obra.pavimentos[0]!.lajes[0]).toMatchObject({ x: 0, y: 0, lx: 6, ly: 5 });
  });

  it("armaduras impostas e trechos de pilar: forma e um item por lado", () => {
    const d = JSON.parse(serializarObra(obraComLajeSistrut()));
    const laje = d.pavimentos[0].lajes[0];
    laje.armaduraImposta = { principal: { bitola: 8 } };
    laje.negativasImpostas = [null];
    d.pavimentos[0].trechosPilares = [{ pilar: "P1", inicio: { x: 0, y: 0 } }];
    expect(erros(d)).toEqual([
      "pavimentos[0].lajes[0].negativasImpostas: esperado um item por lado do polígono (6), veio [null].",
      "pavimentos[0].lajes[0].armaduraImposta.principal.espacamento: esperado um número, veio nada.",
      "pavimentos[0].trechosPilares[0].fim: esperado um objeto, veio nada.",
      "pavimentos[0].trechosPilares[0].fim.x: esperado um número, veio nada.",
      "pavimentos[0].trechosPilares[0].fim.y: esperado um número, veio nada.",
    ]);
  });

  it("recusa carga de ocupação sem área e alvenaria com carga negativa", () => {
    const d = JSON.parse(serializarObra(obraComLajeSistrut()));
    d.pavimentos[0].cargasOcupacao[0].poligono = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    d.pavimentos[0].alvenarias[0].carga = -1;
    expect(erros(d)).toEqual([
      "pavimentos[0].cargasOcupacao[0].poligono: o polígono deve ter área.",
      "pavimentos[0].alvenarias[0].carga: esperado um número maior ou igual a zero, veio -1.",
    ]);
  });
});

describe("campos de laje do SISTRUT no arquivo, rodada 2", () => {
  /** A obra de exemplo com duas lajes com polígono, grupo, i por lado, μ informado, a
   *  lista do LAJECALC 1 e "apoia em". */
  function obraRodada2(): Obra {
    const obra = obraComLajeSistrut();
    const p = obra.pavimentos[0]!;
    const l = p.lajes[0]!;
    p.lajes[0] = {
      ...l,
      grupo: 1,
      coeficientesLados: [null, null, null, null, 1.5, null],
      mu: 1,
      muInformado: true,
    };
    p.continuidadesLajes = [{ lajeA: l.id, ladoA: 4 }];
    p.vigas = [
      { id: "V1", nome: "V1", x1: 0, y1: 0, x2: 6, y2: 0, bw: 12, h: 50, cargaLinear: 0 },
      {
        id: "V2",
        nome: "V2",
        x1: 3,
        y1: 0,
        x2: 3,
        y2: 3,
        bw: 12,
        h: 50,
        cargaLinear: 0,
        apoiaEm: ["V1"],
      },
    ];
    return obra;
  }

  it("salvar e abrir devolve a mesma obra", () => {
    const obra = obraRodada2();
    expect(lerObra(serializarObra(obra))).toEqual({
      ok: true,
      obra,
      versaoOrigem: 3,
      migrada: false,
    });
  });

  it("recusa referências que não existem e listas que não casam com os lados", () => {
    const d = JSON.parse(serializarObra(obraRodada2()));
    const p = d.pavimentos[0];
    const id = p.lajes[0].id;
    p.lajes[0].coeficientesLados = [1.5];
    p.continuidadesLajes = [
      { lajeA: id, ladoA: 6 },
      { lajeA: "L9", ladoA: 0 },
      { lajeA: id, ladoA: 0, ladoB: 1 },
    ];
    p.vigas[1].apoiaEm = ["V9"];
    expect(erros(d)).toEqual([
      "pavimentos[0].lajes[0].coeficientesLados: esperado um item por lado do polígono (6), veio [1.5].",
      `pavimentos[0].continuidadesLajes[0].ladoA: a laje ${id} tem 6 lados, veio 6.`,
      'pavimentos[0].continuidadesLajes[1]: laje L9 não existe no pavimento, veio "L9".',
      "pavimentos[0].continuidadesLajes[2].ladoB: sem lajeB, veio 1.",
      'pavimentos[0].vigas[1].apoiaEm[0]: esperado o id de outra viga do pavimento, veio "V9".',
    ]);
  });
});

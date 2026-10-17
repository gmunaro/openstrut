import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { abrirPlanilha, itensDaAba, juntarItens, metadadosSinapi, numeroCelula } from "./importar";
import { crc32, deszipar, gerarCsv, gerarXlsx, lerCsv, lerXlsx, zipar } from "./planilha";

const enc = new TextEncoder();

/** Zip com DEFLATE (como o Excel grava), montado aqui com o zlib do Node. */
function zipDeflate(arquivos: { nome: string; texto: string }[]) {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome);
    const bruto = Buffer.from(a.texto);
    const comp = deflateRawSync(bruto);
    const crc = crc32(bruto);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(bruto.length, 22);
    local.writeUInt16LE(nome.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(bruto.length, 24);
    cd.writeUInt16LE(nome.length, 28);
    cd.writeUInt32LE(offset, 42);
    partes.push(local, nome, comp);
    central.push(cd, nome);
    offset += 30 + nome.length + comp.length;
  }
  const tam = central.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tam, 12);
  fim.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...partes, ...central, fim]));
}

describe("zip", () => {
  it("CRC-32 de referência", () => {
    // valor de verificação do CRC-32/ISO-HDLC
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });

  it("lê DEFLATE e STORE", async () => {
    const z = zipDeflate([{ nome: "a.txt", texto: "olá ".repeat(100) }]);
    expect(new TextDecoder().decode((await deszipar(z)).get("a.txt"))).toBe("olá ".repeat(100));
  });
});

describe("XLSX", () => {
  it("ida e volta: texto com acento e caracteres de XML, números, vazios", async () => {
    const abas = [
      {
        nome: "Por insumo",
        linhas: [
          ["Código", "Descrição", "Preço"],
          ["94965", 'Concreto <fck> 25 & "bombeável"', 512.34],
          [null, "", -1.5e-3],
        ],
      },
      { nome: "Resumo/total?", linhas: [["Total", 1e6]] },
    ];
    const lidas = await lerXlsx(gerarXlsx(abas));
    expect(lidas.map((a) => a.nome)).toEqual(["Por insumo", "Resumo total "]);
    expect(lidas[0]?.linhas[1]).toEqual(["94965", 'Concreto <fck> 25 & "bombeável"', 512.34]);
    expect(lidas[0]?.linhas[2]).toEqual([null, null, -0.0015]);
    expect(lidas[1]?.linhas[0]).toEqual(["Total", 1000000]);
  });

  it("lê sharedStrings, colunas puladas e linha com r", async () => {
    const z = zipDeflate([
      {
        nome: "xl/workbook.xml",
        texto: `<workbook xmlns:r="x"><sheets><sheet name="ISD" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        nome: "xl/_rels/workbook.xml.rels",
        texto: `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      },
      {
        nome: "xl/sharedStrings.xml",
        texto: `<sst><si><t>Código do Insumo</t></si><si><r><t>Descrição</t></r><r><t xml:space="preserve"> do Insumo</t></r></si><si><t>Unidade</t></si><si><t>KG</t></si><si><t>AÇO CA-50 &amp; tal</t></si></sst>`,
      },
      {
        nome: "xl/worksheets/sheet1.xml",
        texto: `<worksheet><sheetData><row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3" t="s"><v>1</v></c><c r="C3" t="s"><v>2</v></c><c r="E3" t="inlineStr"><is><t>SP</t></is></c></row><row r="4"><c r="A4"><v>34</v></c><c r="B4" t="s"><v>4</v></c><c r="C4" t="s"><v>3</v></c><c r="E4"><v>7.5</v></c></row></sheetData></worksheet>`,
      },
    ]);
    const abas = await lerXlsx(z);
    expect(abas[0]?.linhas[2]).toEqual([
      "Código do Insumo",
      "Descrição do Insumo",
      "Unidade",
      null,
      "SP",
    ]);
    const imp = itensDaAba(abas[0]!, "SP");
    expect(imp).toMatchObject({
      ok: true,
      uf: "SP",
      itens: [{ codigo: "34", descricao: "AÇO CA-50 & tal", unidade: "KG", preco: 7.5 }],
    });
  });

  it("aba de composições da SINAPI: código no HYPERLINK, UF na linha de cima, metadados", async () => {
    // como a CSD 09/2026: B11 = HYPERLINK(...; 92267) com cache 0; "Custo (R$)" sob cada UF
    const z = zipDeflate([
      {
        nome: "xl/workbook.xml",
        texto: `<workbook xmlns:r="x"><sheets><sheet name="CSD" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        nome: "xl/_rels/workbook.xml.rels",
        texto: `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      },
      {
        nome: "xl/worksheets/sheet1.xml",
        texto: `<worksheet><sheetData><row r="3"><c r="A3" t="inlineStr"><is><t>Mês de Referência:</t></is></c><c r="B3" t="inlineStr"><is><t>09/2026</t></is></c></row><row r="9"><c r="E9" t="inlineStr"><is><t>AC</t></is></c><c r="G9" t="inlineStr"><is><t>SP</t></is></c></row><row r="10"><c r="B10" t="inlineStr"><is><t>Código da Composição</t></is></c><c r="C10" t="inlineStr"><is><t>Descrição</t></is></c><c r="D10" t="inlineStr"><is><t>Unidade</t></is></c><c r="E10" t="inlineStr"><is><t>Custo (R$)</t></is></c><c r="F10" t="inlineStr"><is><t>%AS</t></is></c><c r="G10" t="inlineStr"><is><t>Custo (R$)</t></is></c></row><row r="11"><c r="B11"><f>HYPERLINK("#"&amp;CELL("address",OFFSET(Analítico!$B$1,MATCH(92267,Analítico!$B:$B,0)-1,3)),92267)</f><v>0</v></c><c r="C11" t="inlineStr"><is><t>FABRICAÇÃO DE FÔRMA PARA LAJES</t></is></c><c r="D11" t="inlineStr"><is><t>M2</t></is></c><c r="E11"><v>50.1</v></c><c r="F11"><v>0</v></c><c r="G11"><v>44.25</v></c></row></sheetData></worksheet>`,
      },
    ]);
    const p = await abrirPlanilha("SINAPI_Referência_2026_09.xlsx", z);
    expect(p.nomes).toEqual(["CSD"]);
    const aba = await p.ler("CSD");
    expect(itensDaAba(aba, "SP")).toMatchObject({
      ok: true,
      uf: "SP",
      ufs: ["AC", "SP"],
      itens: [{ codigo: "92267", unidade: "M2", preco: 44.25 }],
    });
    // UF que a planilha não tem: a primeira (AC), avisada pela uf devolvida
    expect(itensDaAba(aba, "PR")).toMatchObject({ uf: "AC", itens: [{ preco: 50.1 }] });
    expect(metadadosSinapi(aba)).toEqual({ referencia: "2026-09", desonerado: false });
    expect(metadadosSinapi({ ...aba, nome: "ICD" }).desonerado).toBe(true);
  });

  it("HYPERLINK com referência no 2º argumento fica com o valor da célula", async () => {
    const z = zipDeflate([
      {
        nome: "xl/workbook.xml",
        texto: `<workbook xmlns:r="x"><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        nome: "xl/_rels/workbook.xml.rels",
        texto: `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      },
      {
        nome: "xl/worksheets/sheet1.xml",
        texto: `<worksheet><sheetData><row r="1"><c r="A1" t="str"><f>HYPERLINK("http://x",B1)</f><v>texto do link</v></c><c r="B1"><f>HYPERLINK("#a","92267")</f><v>0</v></c></row></sheetData></worksheet>`,
      },
    ]);
    const abas = await lerXlsx(z);
    expect(abas[0]?.linhas[0]).toEqual(["texto do link", "92267"]);
  });

  it("ZIP mensal da SINAPI: abre a planilha de referência de dentro dele", async () => {
    const ref = gerarXlsx([
      {
        nome: "ISD",
        linhas: [
          ["Código", "Descrição", "Unidade", "SP"],
          [34, "AÇO", "KG", 6.69],
        ],
      },
    ]);
    const outra = gerarXlsx([{ nome: "X", linhas: [] }]);
    const z = zipar([
      { nome: "SINAPI_familias_2026_09.xlsx", dados: outra },
      { nome: "SINAPI_Referência_2026_09.xlsx", dados: ref },
    ]);
    const p = await abrirPlanilha("SINAPI-2026-09-formato-xlsx.zip", z);
    expect(p.nomes).toEqual(["ISD"]);
    expect(itensDaAba(await p.ler("ISD"))).toMatchObject({
      itens: [{ codigo: "34", preco: 6.69 }],
    });
  });
});

describe("CSV", () => {
  it("gera com ; e vírgula decimal, e relê", () => {
    const csv = gerarCsv([
      ["Código", "Descrição", "Unidade", "Preço"],
      ["1", 'Fôrma; "compensado"', "m²", 45.5],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('1;"Fôrma; ""compensado""";m²;45,5');
    expect(lerCsv(csv)).toEqual([
      ["Código", "Descrição", "Unidade", "Preço"],
      ["1", 'Fôrma; "compensado"', "m²", "45,5"],
    ]);
  });

  it("importa CSV com vírgula, cabeçalho abaixo de um título, e preço vazio", async () => {
    const texto =
      'Minha tabela,,,\ncodigo,descricao,unid,preco unitario\nC25,Concreto 25,m3,"1.234,56"\nX,Sem preço,kg,\n';
    const p = await abrirPlanilha("precos.csv", enc.encode(texto));
    const imp = itensDaAba(await p.ler(p.nomes[0]!));
    expect(imp).toMatchObject({
      ok: true,
      uf: "",
      itens: [
        { codigo: "C25", descricao: "Concreto 25", unidade: "m3", preco: 1234.56 },
        { codigo: "X", descricao: "Sem preço", unidade: "kg", preco: null },
      ],
    });
  });

  it("CSV com ; e título com vírgula na primeira linha; preço inteiro com milhar", async () => {
    const texto =
      "Tabela de preços, SP\ncodigo;descricao;unidade;preco\nC25;Concreto 25;m3;1.234,56\nF;Fôrma;m2;12.500\nF;Fôrma de novo;m2;1\n";
    const p = await abrirPlanilha("precos.csv", enc.encode(texto));
    const imp = itensDaAba(await p.ler(p.nomes[0]!));
    expect(imp).toMatchObject({
      ok: true,
      repetidos: 1,
      itens: [
        { codigo: "C25", preco: 1234.56 },
        { codigo: "F", descricao: "Fôrma", preco: 12500 },
      ],
    });
  });

  it("CSV en-US (separador vírgula): ponto decimal", async () => {
    const p = await abrirPlanilha(
      "en.csv",
      enc.encode('code,description,unit,price\nA,"Steel, 10 mm",kg,"1,234.5"\nB,Form,m2,12.500\n'),
    );
    const imp = itensDaAba(await p.ler(p.nomes[0]!));
    // "código"/"descrição" em inglês não são achados: o cabeçalho precisa dos nomes em pt-BR
    expect(imp.ok).toBe(false);
    const pt = await abrirPlanilha(
      "en.csv",
      enc.encode(
        'codigo,descricao,unidade,preco\nA,"Aço, 10 mm",kg,"1,234.5"\nB,Fôrma,m2,12.500\n',
      ),
    );
    expect(itensDaAba(await pt.ler(pt.nomes[0]!))).toMatchObject({
      itens: [{ preco: 1234.5 }, { preco: 12.5 }],
    });
  });

  it("juntar itens: código existente recebe o novo; repetido fica uma vez", () => {
    const t = {
      id: "t",
      nome: "t",
      fonte: "",
      referencia: "",
      uf: "",
      desonerado: null,
      itens: [
        { codigo: "1", descricao: "a", unidade: "kg", preco: 1 },
        { codigo: "2", descricao: "b", unidade: "kg", preco: 2 },
      ],
    };
    const j = juntarItens(t, [
      { codigo: "2", descricao: "b2", unidade: "kg", preco: 20 },
      { codigo: "3", descricao: "c", unidade: "kg", preco: 3 },
      { codigo: "3", descricao: "c2", unidade: "kg", preco: 30 },
    ]);
    expect(j.itens.map((i) => [i.codigo, i.preco])).toEqual([
      ["1", 1],
      ["2", 20],
      ["3", 30],
    ]);
  });

  it("recusa planilha sem cabeçalho e .xls", async () => {
    expect(itensDaAba({ nome: "a", linhas: [["a", "b"]] })).toMatchObject({ ok: false });
    await expect(abrirPlanilha("a.xls", new Uint8Array())).rejects.toThrow(/xlsx/);
  });
});

describe("numeroCelula", () => {
  it("formatos de número", () => {
    expect(numeroCelula("1.234,56")).toBe(1234.56);
    expect(numeroCelula("1234.56")).toBe(1234.56);
    expect(numeroCelula("R$ 12,5")).toBe(12.5);
    expect(numeroCelula("1.234.567")).toBe(1234567);
    expect(numeroCelula("-")).toBeNull();
    expect(numeroCelula("")).toBeNull();
    expect(numeroCelula(3)).toBe(3);
    // os dois separadores: o último é o decimal
    expect(numeroCelula("1,234.56")).toBe(1234.56);
    expect(numeroCelula("12.345.678,9")).toBe(12345678.9);
    expect(numeroCelula("1,234,567")).toBe(1234567);
    // um só, com 3 dígitos depois: ambíguo; decide o separador decimal do arquivo
    expect(numeroCelula("12.500", ",")).toBe(12500);
    expect(numeroCelula("12.500", ".")).toBe(12.5);
    expect(numeroCelula("1,234", ".")).toBe(1234);
    expect(numeroCelula("1,234", ",")).toBe(1.234);
    expect(numeroCelula("12.500")).toBe(12.5);
    // 2 casas não é milhar em formato nenhum
    expect(numeroCelula("12.50", ",")).toBe(12.5);
    expect(numeroCelula("-1.250", ",")).toBe(-1250);
  });
});

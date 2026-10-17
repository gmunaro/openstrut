import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { abasDoArquivo, itensDasAbas, numeroCelula } from "./importar";
import { crc32, deszipar, gerarCsv, gerarXlsx, lerCsv, lerXlsx } from "./planilha";

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
    const imp = itensDasAbas(abas, "SP");
    expect(imp).toMatchObject({
      ok: true,
      uf: "SP",
      itens: [{ codigo: "34", descricao: "AÇO CA-50 & tal", unidade: "KG", preco: 7.5 }],
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
    const abas = await abasDoArquivo("precos.csv", enc.encode(texto));
    const imp = itensDasAbas(abas);
    expect(imp).toMatchObject({
      ok: true,
      uf: "",
      itens: [
        { codigo: "C25", descricao: "Concreto 25", unidade: "m3", preco: 1234.56 },
        { codigo: "X", descricao: "Sem preço", unidade: "kg", preco: null },
      ],
    });
  });

  it("recusa planilha sem cabeçalho e .xls", async () => {
    expect(itensDasAbas([{ nome: "a", linhas: [["a", "b"]] }])).toMatchObject({ ok: false });
    await expect(abasDoArquivo("a.xls", new Uint8Array())).rejects.toThrow(/xlsx/);
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
  });
});

import { describe, expect, test } from "vitest";
import { crc32, montarZip } from "./zip";

const utf8 = new TextEncoder();

/** Lê o zip pelo diretório central, como um descompactador faz. */
function lerZip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const fim = zip.length - 22;
  expect(v.getUint32(fim, true)).toBe(0x06054b50);
  const total = v.getUint16(fim + 10, true);
  let pos = v.getUint32(fim + 16, true);
  const arquivos: { nome: string; texto: string; crc: number }[] = [];
  for (let i = 0; i < total; i++) {
    expect(v.getUint32(pos, true)).toBe(0x02014b50);
    const crc = v.getUint32(pos + 16, true);
    const tamanho = v.getUint32(pos + 20, true);
    const n = v.getUint16(pos + 28, true);
    const local = v.getUint32(pos + 42, true);
    const nome = new TextDecoder().decode(zip.subarray(pos + 46, pos + 46 + n));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const nLocal = v.getUint16(local + 26, true);
    const extra = v.getUint16(local + 28, true);
    const inicio = local + 30 + nLocal + extra;
    const dados = zip.subarray(inicio, inicio + tamanho);
    expect(crc32(dados)).toBe(crc);
    arquivos.push({ nome, texto: new TextDecoder().decode(dados), crc });
    pos += 46 + n;
  }
  return arquivos;
}

describe("zip", () => {
  test("CRC-32 bate com o valor de verificação do padrão", () => {
    // valor de verificação do CRC-32/ISO-HDLC (catálogo de CRCs de Greg Cook)
    expect(crc32(utf8.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  test("os arquivos voltam iguais, com nome em UTF-8", () => {
    const zip = montarZip(
      [
        { nome: "relato.md", dados: "# Relato\nação" },
        { nome: "obra-ção.openstrut.json", dados: '{"versao":3}' },
        { nome: "print.png", dados: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
      ],
      new Date(2026, 9, 16, 14, 30, 10),
    );
    const lidos = lerZip(zip);
    expect(lidos.map((a) => a.nome)).toEqual(["relato.md", "obra-ção.openstrut.json", "print.png"]);
    expect(lidos[0]?.texto).toBe("# Relato\nação");
    expect(lidos[1]?.texto).toBe('{"versao":3}');
  });

  test("data e hora no formato do MS-DOS", () => {
    const zip = montarZip([{ nome: "a", dados: "" }], new Date(2026, 9, 16, 14, 30, 10));
    const v = new DataView(zip.buffer);
    // hora: 14 << 11 | 30 << 5 | 10/2 ; dia: (2026-1980) << 9 | 10 << 5 | 16
    expect(v.getUint16(10, true)).toBe((14 << 11) | (30 << 5) | 5);
    expect(v.getUint16(12, true)).toBe((46 << 9) | (10 << 5) | 16);
  });
});

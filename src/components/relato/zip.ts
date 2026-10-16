// Zip mínimo, sem compressão (método "stored"), para o arquivo do relato: o PNG já é
// comprimido e o resto é texto pequeno. Formato: PKWARE APPNOTE 6.3.x, seções 4.3 e 4.4.

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE 802.3), o do zip. crc32("123456789") = 0xCBF43926. */
export function crc32(dados: Uint8Array) {
  let c = 0xffffffff;
  for (const b of dados) c = (TABELA_CRC[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ArquivoZip {
  nome: string;
  dados: Uint8Array | string;
}

/** Data e hora no formato do MS-DOS que o zip usa. */
function dataDos(d: Date) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, dia };
}

/** Monta um .zip com os arquivos dados, nesta ordem. Nomes em UTF-8 (bit 11). */
export function montarZip(arquivos: ArquivoZip[], agora = new Date()): Uint8Array<ArrayBuffer> {
  const utf8 = new TextEncoder();
  const { hora, dia } = dataDos(agora);
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let deslocamento = 0;

  for (const a of arquivos) {
    const nome = utf8.encode(a.nome);
    const dados = typeof a.dados === "string" ? utf8.encode(a.dados) : a.dados;
    const crc = crc32(dados);

    const local = new Uint8Array(30 + nome.length + dados.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); // assinatura do cabeçalho local
    l.setUint16(4, 20, true); // versão necessária: 2.0
    l.setUint16(6, 0x0800, true); // nomes em UTF-8
    l.setUint16(8, 0, true); // stored
    l.setUint16(10, hora, true);
    l.setUint16(12, dia, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, dados.length, true);
    l.setUint32(22, dados.length, true);
    l.setUint16(26, nome.length, true);
    local.set(nome, 30);
    local.set(dados, 30 + nome.length);
    locais.push(local);

    const central = new Uint8Array(46 + nome.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); // assinatura do diretório central
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, dados.length, true);
    c.setUint32(24, dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, deslocamento, true);
    central.set(nome, 46);
    centrais.push(central);

    deslocamento += local.length;
  }

  const tamanhoCentral = centrais.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true); // fim do diretório central
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamanhoCentral, true);
  f.setUint32(16, deslocamento, true);

  const saida = new Uint8Array(deslocamento + tamanhoCentral + fim.length);
  let pos = 0;
  for (const parte of [...locais, ...centrais, fim]) {
    saida.set(parte, pos);
    pos += parte.length;
  }
  return saida;
}

/// <reference types="node" />
// .VIG binário para os testes do importador, no leiaute do registro de 855 bytes
// (VIGA.BAS:2875-3040; o cabeçalho de viga.ts).
export interface RegistroTeste {
  nome: string;
  balE?: boolean;
  balD?: boolean;
  engE?: boolean;
  /** Trechos 0..n+1 (o 0 e o n+1 só com balanço): vão, J e divisões [P, D, F, Pac, Fac]. */
  trechos: { vao: number; j: number; divs: [number, number, number, number, number][] }[];
}

/** .VIG com o registro 1 de cabeçalho (nº de vigas) e um registro por viga. */
export function vig(regs: RegistroTeste[]) {
  const b = Buffer.alloc(855 * (regs.length + 1));
  const escreve = (r: number, x: RegistroTeste) => {
    const o = r * 855;
    b.write(x.nome.padEnd(20), o, "latin1");
    b.write("10-14", o + 20, "latin1");
    const n = x.trechos.length - 2;
    [n, x.balE ? 1 : 0, x.balD ? 1 : 0, x.engE ? 1 : 0, 0].forEach((v, i) =>
      b.writeInt16LE(v, o + 25 + 2 * i),
    );
    let k = 1;
    x.trechos.forEach((t, i) => {
      for (const d of t.divs) {
        d.forEach((v, c) => b.writeFloatLE(v, o + 215 + 20 * k + 4 * c));
        k++;
      }
      b.writeInt16LE(t.divs.length, o + 35 + 12 * i);
      b.writeInt16LE(k - 1, o + 37 + 12 * i);
      b.writeFloatLE(t.vao, o + 39 + 12 * i);
      b.writeFloatLE(t.j, o + 43 + 12 * i);
    });
  };
  regs.forEach((x, i) => escreve(i + 1, x));
  b.writeInt16LE(regs.length, 25);
  return { nome: "TST.VIG", dados: new Uint8Array(b) };
}

/** Viga de 2 tramos (4 e 5 m) nos pilares 7, 8 e 9, com balanço direito de 1,2 m e uma
 *  concentrada de 3 t a 0,4 m no tramo 1. */
export const V1: RegistroTeste = {
  nome: "V1",
  balD: true,
  trechos: [
    { vao: 0, j: 1.00007, divs: [] },
    {
      vao: 4,
      j: 1.00008,
      divs: [
        [2, 0.4, 3, 0.5, 0],
        [2, 4, 0, 0.5, 0],
      ],
    },
    { vao: 5, j: 1.00009, divs: [[2, 5, 0, 0.5, 0]] },
    { vao: 1.2, j: 1, divs: [[2, 1.2, 1, 0, 0]] },
  ],
};

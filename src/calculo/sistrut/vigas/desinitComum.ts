// Estado compartilhado do detalhamento de viga (o COMMON da família DESENHO,
// DS:0DC0..DS:1E06, `dist/src-original/desenho/COMUM_DESENHO.BI`), usado pelo porte do
// corte das barras (DESAUXDI, `desinitCorte.ts`) e do detalhamento (DESINIT,
// `desinitBarras.ts`).
//
// Os nomes seguem o endereço DS do original (`a1af2` = A_1af2, `v0e44` = V_0e44) para
// que o código possa ser conferido linha a linha contra DESDIM.BAS e DESINIT.BAS. O
// significado de cada matriz está no comentário da declaração. Unidades do original:
// vãos e abscissas do corte em m (V_0FA2 = V_0FA6 = 1 no DESENHO.INI de fábrica),
// posições das barras em cm, bitolas em mm, áreas em cm², esforços em t e t·m.
import type { ModoSistrut } from "../base/tipos";
import { ErroQB, qbCint, qbInt, sng } from "../base/f32";

/** Arredondamento de atribuição do modo (SINGLE no original). */
export type Arredonda = (x: number) => number;

function indice(i: number, limite: number) {
  const k = qbCint(i);
  if (k < 0 || k > limite) throw new ErroQB(9, `Subscript out of range (${i} > ${limite})`);
  return k;
}

/** Matriz 1D `(0 TO n)` de SINGLE (ou float64 no corrigido). */
export class M1 {
  private readonly v: Float64Array;
  constructor(
    private readonly s: Arredonda,
    readonly n: number,
  ) {
    this.v = new Float64Array(n + 1);
  }
  g(i: number) {
    return this.v[indice(i, this.n)] ?? 0;
  }
  p(i: number, x: number) {
    this.v[indice(i, this.n)] = this.s(x);
  }
}

/** Matriz 2D `(0 TO n, 0 TO m)`. */
export class M2 {
  private readonly v: Float64Array;
  constructor(
    private readonly s: Arredonda,
    readonly n: number,
    readonly m: number,
  ) {
    this.v = new Float64Array((n + 1) * (m + 1));
  }
  private ix(i: number, j: number) {
    return indice(i, this.n) * (this.m + 1) + indice(j, this.m);
  }
  g(i: number, j: number) {
    return this.v[this.ix(i, j)] ?? 0;
  }
  p(i: number, j: number, x: number) {
    this.v[this.ix(i, j)] = this.s(x);
  }
  /** Copia a linha `de` para a linha `para` (todas as colunas). */
  copiaLinha(de: number, para: number) {
    for (let j = 0; j <= this.m; j++) this.p(para, j, this.g(de, j));
  }
}

/** Matriz 3D `(0 TO n, 0 TO m, 0 TO k)`. */
export class M3 {
  private readonly v: Float64Array;
  constructor(
    private readonly s: Arredonda,
    readonly n: number,
    readonly m: number,
    readonly k: number,
  ) {
    this.v = new Float64Array((n + 1) * (m + 1) * (k + 1));
  }
  private ix(i: number, j: number, l: number) {
    return (
      (indice(i, this.n) * (this.m + 1) + indice(j, this.m)) * (this.k + 1) + indice(l, this.k)
    );
  }
  g(i: number, j: number, l: number) {
    return this.v[this.ix(i, j, l)] ?? 0;
  }
  p(i: number, j: number, l: number, x: number) {
    this.v[this.ix(i, j, l)] = this.s(x);
  }
}

/** Verdadeiro do QuickBASIC: −1; falso: 0. */
export const qb = (c: boolean) => (c ? -1 : 0);

/** O COMMON do DESENHO com o que o DESDIM entrega ao DESINIT e as matrizes de posições
 *  que o DESINIT monta. Dimensões das matrizes: as do REDIM de DESENHO.BAS:595-663. */
export class Comum {
  /** Atribuição (SINGLE no original) e constante literal (SINGLE no original). */
  readonly s: Arredonda;
  readonly k: Arredonda;
  constructor(readonly modo: ModoSistrut) {
    this.s = modo === "original" ? sng : (x) => x;
    this.k = this.s;
    const s = this.s;
    this.a0faa = new M1(s, 14);
    this.a0fd8 = new M1(s, 14);
    this.a1006 = new M1(s, 14);
    this.a1062 = new M1(s, 31);
    this.a1090 = new M1(s, 31);
    this.a10be = new M1(s, 31);
    this.a10ec = new M1(s, 31);
    this.a111a = new M1(s, 31);
    this.a1148 = new M1(s, 2);
    this.a1232 = new M2(s, 14, 4);
    this.a1260 = new M2(s, 13, 2);
    this.a16de = new M1(s, 14);
    this.a170c = new M1(s, 14);
    this.a1768 = new M1(s, 14);
    this.a1626 = new M1(s, 14);
    this.a1654 = new M2(s, 14, 2);
    this.a1796 = new M2(s, 14, 4);
    this.a17c4 = new M2(s, 14, 2);
    this.a1540 = new M2(s, 14, 2);
    this.a1034 = new M1(s, 14);
    this.a15ca = new M1(s, 14);
    this.a15f8 = new M1(s, 14);
    this.a173a = new M1(s, 14);
    this.a117a = new M1(s, 9);
    this.a1512 = new M1(s, 9);
    this.a1204 = new M2(s, 9, 2);
    this.a11a8 = new M1(s, 9);
    this.a11d6 = new M1(s, 9);
    this.a128e = new M2(s, 14, 8);
    this.a12bc = new M2(s, 14, 8);
    this.a1374 = new M2(s, 14, 9);
    this.a12ea = new M3(s, 13, 14, 3);
    this.a1318 = new M3(s, 14, 14, 3);
    this.a1346 = new M2(s, 22, 2);
    this.a1926 = new M2(s, 14, 2);
    this.a19b0 = new M1(s, 14);
    this.a19de = new M1(s, 14);
    this.a1a3a = new M2(s, 14, 4);
    this.a1982 = new M2(s, 13, 3);
    this.a14e4 = new M2(qbCint, 8, 5);
    this.a142c = new M2(s, 6, 2);
    this.a1c62 = new M2(qbCint, 10, 5);
    this.a1488 = new M1(s, 10);
    this.a1d1a = new M1(s, 5);
    this.a1d48 = new M1(s, 5);
    this.bitola = new M1(s, 9);
    this.area = new M1(s, 9);
    this.a1a0c = new M2(s, 14, 2);
    this.a1af2 = new M2(s, 60, 3);
    this.a1b4e = new M2(s, 60, 2);
    this.a1ac4 = new M2(s, 60, 3);
    this.a1b20 = new M2(s, 60, 2);
    this.a1bd8 = new M2(s, 10, 5);
    this.a1baa = new M2(s, 10, 5);
    this.a1b7c = new M2(s, 30, 3);
    this.a1c06 = new M2(s, 50, 6);
    this.a1c34 = new M2(s, 14, 4);
    this.a1a96 = new M1(qbCint, 6);
  }

  // ------------------------------------------------------------ viga (.VIG, DESDIM.BAS:4709-4932)
  /** Nº de tramos (V_0DDC), balanço esquerdo/direito (V_0DE0/V_0DE4, 0 ou 1), engaste
   *  esquerdo/direito (V_0DE8/V_0DEC, 0 ou 1). */
  v0ddc = 0;
  v0de0 = 0;
  v0de4 = 0;
  v0de8 = 0;
  v0dec = 0;
  /** Nº de divisões de carga do tramo t (A_0FAA) e índice da última (A_0FD8, acumulado). */
  readonly a0faa: M1;
  readonly a0fd8: M1;
  /** Vão de cálculo do tramo t, m (A_1006; t = 0 e n+1 são os balanços). */
  readonly a1006: M1;
  /** Divisões de carga: p (A_1062), p acidental (A_1090), D (A_10BE), F (A_10EC), F
   *  acidental (A_111A). */
  readonly a1062: M1;
  readonly a1090: M1;
  readonly a10be: M1;
  readonly a10ec: M1;
  readonly a111a: M1;
  /** Momentos externos nos apoios extremos, tm (A_1148). */
  readonly a1148: M1;
  /** Inércia relativa J do tramo t (A_1034). */
  readonly a1034: M1;
  /** Redução dos negativos (V_0DF4) e alívio do cortante "S"/"N" (V_182E$). */
  v0df4 = 1;
  v182e = "S";
  /** Momentos nos apoios da análise estática, abscissa e x do M+ (A_15CA, A_15F8, A_173A)
   *  e x do M+ de engastamento perfeito (A_117A). */
  readonly a15ca: M1;
  readonly a15f8: M1;
  readonly a173a: M1;
  readonly a117a: M1;
  /** Locais do DESCALC que a impressão usa: reação (L_BP4A), reações máxima e mínima da
   *  envoltória (L_BP60) e momentos de engastamento perfeito dos apoios extremos (L_BP38). */
  impressaoDescalc: { reacao: M1; reacaoEnvoltoria: M2; mep: M1 } | undefined;
  /** "S"/"N": acidentais com envoltória (V_0E70) e momentos externos (V_0E74). */
  v0e70 = "N";
  v0e74 = "N";

  // ------------------------------------------------------------ seções (.SEC, DESDIM.BAS:4622-4708)
  /** Seção do tramo t: bw, hw, bf, hf, cm (A_1232). */
  readonly a1232: M2;
  /** Seção do apoio k: bw, hw, cm (A_1260). */
  readonly a1260: M2;

  // ------------------------------------------------------------ análise (DESCALC, DESDIM.BAS:5955-6040)
  /** Momento no apoio k, tm, e o da envoltória (A_16DE, A_170C). */
  readonly a16de: M1;
  readonly a170c: M1;
  /** M+ do tramo t, tm (A_1768 e A_1626). */
  readonly a1768: M1;
  readonly a1626: M1;
  /** Cortantes estáticos Ve, Vd do tramo t, t (A_1654; balanços: carga total). */
  readonly a1654: M2;
  /** Cortantes da envoltória (A_1796: Ve, Vd, Ve mín., Ve, Vd). */
  readonly a1796: M2;
  /** Início do tramo t para o diagrama de M: Ve e M do apoio esquerdo (A_17C4). */
  readonly a17c4: M2;
  /** Cortantes com o alívio junto ao apoio, t (A_1540; DESDIM.BAS:6509). */
  readonly a1540: M2;
  /** Engastamento perfeito dos tramos com M+ > 1,01·M+ contínuo (DESDIM.BAS:5959-6006):
   *  nº (V_1176), tramo (A_11D6), M+ (A_11A8), Ve (A_1204(i,0)); A_1512 só tem 0 (o
   *  REDIM do DESENHO) e A_1512(0) guarda o M trocado em L_403D9 (sentinela 100). */
  v1176 = 0;
  readonly a11d6: M1;
  readonly a11a8: M1;
  readonly a1204: M2;
  readonly a1512: M1;

  // ------------------------------------------------------------ dimensionamento (DESDIM.BAS:2839-3340)
  /** Armadura do tramo t (A_128E): 0 n1, 1 φ1, 2 n2, 3 φ2, 4 M+ (tm; o DESAUXDI usa),
   *  5 As efetiva, 6 As necessária, 7 As comprimida. */
  readonly a128e: M2;
  /** Armadura do apoio k (A_12BC), mesmas colunas (4 = As efetiva depois do DESAUXDI). */
  readonly a12bc: M2;
  /** Armadura comprimida do tramo t e do apoio k ("-" sem; "" apoio não dimensionado)
   *  (A_13A2$, A_13D0$). */
  readonly a13a2: string[] = Array.from({ length: 15 }, () => "");
  readonly a13d0: string[] = Array.from({ length: 15 }, () => "");
  /** Estribos do tramo t (A_1374): 0 φ esq., 1 fim da zona esq. (m), 2 s esq., 3 φ da
   *  viga, 4 início da zona dir. (m), 5 s mínimo, 6 φ dir., 7 s dir., 8 Vk do estribo
   *  mínimo (t). */
  readonly a1374: M2;
  /** Bitola máxima de estribo da viga (V_0ECE) e a mínima da linha da tabela (V_0ED2). */
  v0ece = 0;
  v0ed2 = 0;

  // ------------------------------------------------------------ corte (DESAUXDI)
  /** Grupos de barras positivas do tramo t (A_12EA): (t, 0, 0) nº de grupos; (t, g, 0)
   *  momento-limite; (t, g, 1..2) início e fim do grupo (m); (t, g, 3) auxiliar. */
  readonly a12ea: M3;
  /** Grupos de barras negativas do apoio k (A_1318), mesmo arranjo. */
  readonly a1318: M3;
  /** Diagrama de 21 pontos do tramo: x (m), M (tm) (A_1346). */
  readonly a1346: M2;

  // ------------------------------------------------------------ forma (.FOR, DESDIM.BAS:4457-4621)
  /** Por índice: 0 largura do apoio k (cm), 1 vão livre do tramo t (cm) (A_1926). */
  readonly a1926: M2;
  /** Alinhamento (desnível da face superior) e eixo (distância da face ao eixo) do
   *  tramo t, cm (A_19B0, A_19DE). */
  readonly a19b0: M1;
  readonly a19de: M1;
  /** pe, Hle, pd, Hld do tramo t, cm (A_1A3A). */
  readonly a1a3a: M2;
  /** Apoio k: 0 código (1 = contínua constante), 1 LPs, 2 Dis (A_1982). */
  readonly a1982: M2;
  /** Tipo e título do apoio k ("PP1": tipo P, título P1) (A_1954$). */
  readonly a1954: string[] = Array.from({ length: 14 }, () => "");

  // ------------------------------------------------------------ parâmetros (.DSP, DESENHO.BAS:4773-5035)
  /** Grupo de corte por nº de barras e intervalo de bw (A_14E4). */
  readonly a14e4: M2;
  /** Bitolas de estribo por linha: 0 mínima, 1 máxima (A_142C). */
  readonly a142c: M2;
  /** Dobras por bitola, cm (A_1C62). */
  readonly a1c62: M2;
  /** kg/m por bitola (A_1488). */
  readonly a1488: M1;
  /** Alturas-limite da bitola das barras de extremidade e da pele, cm (A_1D1A, A_1D48). */
  readonly a1d1a: M1;
  readonly a1d48: M1;
  /** Bitolas 0..9 (V_0EEE..V_0F12, mm) e áreas (V_0F16..V_0F3A, cm²). */
  readonly bitola: M1;
  readonly area: M1;
  /** fck, fyk (t/cm²), classe, multiplicador da unidade (V_0EBA, V_0EBE, V_0EC2$, V_0EC6). */
  v0eba = 0;
  v0ebe = 0;
  v0ec2 = "B";
  v0ec6 = 1;
  /** γc, γf, γs (V_0F5E, V_0F62, V_0F66). */
  v0f5e = 0;
  v0f62 = 0;
  v0f66 = 0;
  /** Cobrimento e cobrimento + acréscimo, cm (V_0EAA, V_0EA6). */
  v0eaa = 0;
  v0ea6 = 0;
  /** Conversões do DESENHO.INI (V_0FA2 m, V_0FA6 t). */
  v0fa2 = 1;
  v0fa6 = 1;
  /** Nº de grupos de bitolas e limites dos intervalos de bw (V_0F46, V_0F4A..V_0F5A). */
  v0f46 = 0;
  v0f4a = 0;
  v0f4e = 0;
  v0f52 = 0;
  v0f56 = 0;
  v0f5a = 0;
  /** bw máximo para estribo simples e duplo (V_0F3E, V_0F42). */
  v0f3e = 0;
  v0f42 = 0;
  /** Taxa de As mín., decalagem, ancoragem pos./neg., 10 φ (V_18A2, V_18A6, V_18AA,
   *  V_18AE, V_188A$). */
  v18a2 = 0;
  v18a6 = 0;
  v18aa = 0;
  v18ae = 0;
  v188a = "S";
  /** Estribos: taxa mínima, s mínimo, s máximo, d/2 ou H/2, lista (V_189E, V_18BE, V_18C2,
   *  V_18C6, V_1906$). */
  v189e = 0;
  v18be = 0;
  v18c2 = 0;
  v18c6 = 0;
  v1906 = "";
  /** Porta-estribos: automáticos, ordem mínima, traspasse (V_190A$, V_18DA, V_18DE). */
  v190a = "S";
  v18da = 0;
  v18de = 0;
  /** Comprimento desenvolvido e raio de dobramento em φ (V_190E$, V_18CA). */
  v190e = "S";
  v18ca = 0;
  /** As mín. negativa, pele (altura, taxa, traspasse) (V_18B2, V_18CE, V_18B6, V_18E2). */
  v18b2 = 0;
  v18ce = 0;
  v18b6 = 0;
  v18e2 = 0;
  /** Distância mínima dos estribos nas extremidades, entrada mínima no apoio em φ
   *  (V_18EE, V_18D2). */
  v18ee = 0;
  v18d2 = 0;
  /** Grampos nos apoios, redução da ancoragem positiva (V_1912$, V_1916$). */
  v1912 = "S";
  v1916 = "N";
  /** Maior ordem de bitola CA-60 e comprimento máximo da barra, cm (V_18D6, V_187E). */
  v18d6 = 0;
  v187e = 0;

  // ------------------------------------------------------------ variáveis de trabalho do COMMON
  v0e14 = 0;
  v0e18 = 0;
  v0e1c = 0;
  v0e20 = 0;
  v0e24 = 0;
  v0e28 = 0;
  v0e2c = 0;
  v0e30 = 0;
  v0e34 = 0;
  v0e38 = 0;
  v0e40 = 0;
  v0e44 = 0;
  v0e48 = 0;
  v0e92 = 0;
  v0ea2 = 0;
  v0ee2 = 0;
  v0f7e = 0;
  v0f82 = 0;
  /** −M(x) do diagrama (S_2303D: V_1886; S_22581: V_1882). */
  v1886 = 0;
  v1882 = 0;
  v0dfc = "";

  // ------------------------------------------------------------ posições do DESINIT
  /** Faces do tramo t: início e fim do vão livre, cm (A_1A0C; DESINIT.BAS:979-983). */
  readonly a1a0c: M2;
  /** Barras negativas (A_1AF2): 0 quantidade, 1 φ, 2 início, 3 fim (cm). */
  readonly a1af2: M2;
  /** Dobras das negativas na ponta esquerda/direita, cm (A_1B4E). */
  readonly a1b4e: M2;
  /** Barras positivas (A_1AC4), mesmas colunas de A_1AF2. */
  readonly a1ac4: M2;
  /** Dobras das positivas (A_1B20). */
  readonly a1b20: M2;
  /** Grampos negativos e positivos (A_1BD8, A_1BAA): 0 quantidade, 1 φ, 2 início, 3 fim,
   *  4 lado (0 esq., 1 dir.), 5 largura (cm). */
  readonly a1bd8: M2;
  readonly a1baa: M2;
  /** Porta-estribos (A_1B7C): 0 quantidade, 1 φ, 2 início, 3 fim (cm). */
  readonly a1b7c: M2;
  /** Trechos de estribos (A_1C06): 0 início, 1 fim (cm), 2 φ, 3 s, 4 nº de estribos lado
   *  a lado, 5 bw + hw·0,0001, 6 nº da posição. */
  readonly a1c06: M2;
  /** Pele do tramo t (A_1C34): 0 quantidade por face, 1 φ, 2 início, 3 fim. */
  readonly a1c34: M2;
  /** Nº de tramos com pele por bitola 0..5 (A_1A96%). */
  readonly a1a96: M1;
  /** Contagens: negativas, grampos neg., positivas, grampos pos., porta-estribos, pele,
   *  trechos de estribo (V_185E, V_1872, V_1866, V_1876, V_1862, V_186E, V_186A). */
  v185e = 0;
  v1872 = 0;
  v1866 = 0;
  v1876 = 0;
  v1862 = 0;
  v186e = 0;
  v186a = 0;

  /** `INT(x)` (piso). No corrigido, com folga de 1e-9 relativa: em float64, 4 − 2,2 dá
   *  1,7999999999999998 e o piso de uma posição em cm perderia 1 cm que o SINGLE do
   *  original não perde (190 e não 189 na negativa da V1 de retrad_des_det). */
  int(x: number) {
    if (this.modo === "original") return qbInt(x);
    return qbInt(x + 1e-9 * Math.max(1, Math.abs(x)));
  }

  /** Bitola (mm) → área (cm²) pela tabela do .DSP; outra bitola fica como está
   *  (S_40141 do DESDIM, L_4F8CF do DESINIT). */
  areaDaBitola(b: number) {
    for (let i = 0; i <= 9; i++) if (b === this.bitola.g(i)) return this.area.g(i);
    return b;
  }
}

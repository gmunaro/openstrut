// Importação da parte de viga de uma obra do SISTRUT 4.0: o .VIG (VIGA, registro de 855
// bytes), o .SEC e o .FOR do DESENHO e um .DSP (parametrização do DESENHO). Gera uma obra
// da V2 só com as vigas ou completa uma obra que já tem a planta (vinda do .LAJ).
//
// Formatos (QuickBASIC 4.5, SINGLE IEEE e INTEGER de 2 bytes, little-endian):
// - .VIG (VIGA.BAS:2875-3040, RT_REG_12F8_LE; LAJEMONT.BAS:5170-5393, S_33d84): registro 1 =
//   cabeçalho (o INTEGER do byte 26 é o número de vigas); registro r + 1 = viga r. Por
//   registro: nome (1-20), data (21-25), INTEGER nº de tramos, balanço esquerdo, balanço
//   direito, engaste esquerdo, engaste direito (26-35); por trecho t = 0..13 (0 = balanço
//   esquerdo, n + 1 = direito), a partir de 36 + 12t: INTEGER divisões e divisões
//   acumuladas, SINGLE vão e J; por divisão k = 1..30, a partir de 216 + 20k: SINGLE P, D,
//   F, Pac, Fac; SINGLE momentos externos esquerdo e direito em 836 e 840. Carga indexada
//   (viga sobre viga): F = viga + apoio/100 e Fac = −100.
// - .SEC (346 bytes por viga, registro r = viga r): INTEGER nº de tramos, balanço
//   esquerdo, balanço direito e dois sem uso (1-10); por índice k = 0..13, a partir de
//   11 + 24k: SINGLE bw, hw, bf, hf do trecho k e bw, hw do apoio k.
// - .FOR (616 bytes por viga, registro r = viga r; FORMEDCA.BAS:5435, DESDIM.BAS:4457-4621):
//   por índice k = 0..13, a partir de 1 + 44k: SINGLE largura do apoio k, vão livre do
//   trecho k, alinhamento, eixo; INTEGER pe, Hle, pd, Hld; SINGLE código, LPs e Dis do
//   apoio k; título do apoio (8 caracteres, o 1º é o tipo).
// - .DSP: texto lido como o DESENHO lê (L_23333, DESENHO.BAS:5112-5410; ver `lerDsp`).
//
// O .VIG não tem a planta. Ao gerar, cada viga fica numa linha horizontal própria, com um
// pilar em cada apoio, e o registro vira entrada da viga: vãos, J, cargas por divisão
// (`somenteCargasProprias`), engastes e momentos externos. O pilar de cada apoio sai da
// marca no J (1 + número/100000, a regra do VIGA opção 7, VIGA.BAS:2140-2160); 471 é o
// apoio desconsiderado. Ao completar, as vigas casam pelo nome e só entra o que difere do
// que a própria obra grava pela montagem.
import { calcularObraSistrut } from "../../calculo/sistrut/obra";
import { qbCint, sng } from "../../calculo/sistrut/base/f32";
import { PARAMETROS_DSP, PARAMETROS_VIGA } from "../../calculo/sistrut/base/parametros";
import { numeroDoPilar } from "../../calculo/sistrut/montagem/vigas";
import type { DadosViga, DivisaoCarga, TramoViga } from "../../calculo/sistrut/base/tipos";
import { tmParaKnm, tParaKn, tPorMParaKnPorM } from "../../calculo/sistrut/base/unidades";
import { materiaisPadrao, novoId, pavimentoNovo } from "../../dominio/criar";
import type {
  Aco,
  CargaViga,
  FormaApoioViga,
  FormaTrechoViga,
  Obra,
  Pilar,
  SecaoApoioViga,
  SecaoTrechoViga,
  Viga,
} from "../../dominio/obra";
import { lerObra, serializarObra } from "../arquivo";

/** Arquivo escolhido pelo usuário: nome com extensão e conteúdo (binário ou texto). */
export interface ArquivoSistrut {
  nome: string;
  dados: Uint8Array;
}

export type ImportacaoVigas =
  | { ok: true; obra: Obra; avisos: string[] }
  | { ok: false; erros: string[] };

class ErroImportacao extends Error {}

// ---------------------------------------------------------------- binários

const TAM_VIG = 855;
const TAM_SEC = 346;
const TAM_FOR = 616;
const TRECHOS = 14;
const DIVISOES = 31;

/** Leitor de um registro: posições 1-based, como o MID$ do original. */
function leitor(b: Uint8Array, inicio: number, tamanho: number) {
  const v = new DataView(b.buffer, b.byteOffset + inicio, tamanho);
  return {
    int: (p: number) => v.getInt16(p - 1, true),
    sng: (p: number) => v.getFloat32(p - 1, true),
    texto: (p: number, n: number) =>
      String.fromCharCode(...b.subarray(inicio + p - 1, inicio + p - 1 + n)),
  };
}

/** Uma viga do .VIG como o original a guarda. */
export interface RegistroVigLido {
  nome: string;
  tramos: number;
  balancoEsquerdo: boolean;
  balancoDireito: boolean;
  engasteEsquerdo: boolean;
  engasteDireito: boolean;
  /** Por trecho 0..13: divisões, acumulado, vão (m) e J. */
  trechos: { divisoes: number; acumulado: number; vao: number; inercia: number }[];
  /** Divisões 0..30 (a 0 não é usada): P, D, F, Pac, Fac em t/m, m e t. */
  divisoes: { p: number; d: number; f: number; pac: number; fac: number }[];
  momentosExternos: [number, number];
}

/** Lê o .VIG: as vigas na ordem dos registros 2.. (o registro 1 diz quantas são). */
export function lerVig(b: Uint8Array): RegistroVigLido[] {
  if (b.length < TAM_VIG || b.length % TAM_VIG !== 0)
    throw new ErroImportacao(
      `.VIG com ${b.length} bytes: esperado um múltiplo de ${TAM_VIG} (registro do VIGA).`,
    );
  const total = b.length / TAM_VIG - 1;
  const n = leitor(b, 0, TAM_VIG).int(26);
  if (n < 1 || n > total)
    throw new ErroImportacao(
      `.VIG: o cabeçalho diz ${n} vigas e o arquivo tem ${total} registros de viga.`,
    );
  return Array.from({ length: n }, (_, i) => {
    const r = leitor(b, (i + 1) * TAM_VIG, TAM_VIG);
    return {
      nome: r.texto(1, 20).trimEnd(),
      tramos: r.int(26),
      balancoEsquerdo: r.int(28) === 1,
      balancoDireito: r.int(30) === 1,
      engasteEsquerdo: r.int(32) === 1,
      engasteDireito: r.int(34) === 1,
      trechos: Array.from({ length: TRECHOS }, (_, t) => ({
        divisoes: r.int(36 + 12 * t),
        acumulado: r.int(38 + 12 * t),
        vao: r.sng(40 + 12 * t),
        inercia: r.sng(44 + 12 * t),
      })),
      divisoes: Array.from({ length: DIVISOES }, (_, k) => ({
        p: r.sng(216 + 20 * k),
        d: r.sng(220 + 20 * k),
        f: r.sng(224 + 20 * k),
        pac: r.sng(228 + 20 * k),
        fac: r.sng(232 + 20 * k),
      })),
      momentosExternos: [r.sng(836), r.sng(840)],
    };
  });
}

/** Trechos do registro como `DadosViga` (os índices de `dadosViga` da montagem), sem os
 *  pilares. As cargas indexadas ficam com `indexada` (viga pelo número do registro). */
export function dadosDoRegistro(reg: RegistroVigLido, nomes: readonly string[]): DadosViga {
  const n = reg.tramos;
  const tramo = (t: number): TramoViga => {
    const ini = t === 0 ? 1 : (reg.trechos[t - 1]?.acumulado ?? 0) + 1;
    const fim = reg.trechos[t]?.acumulado ?? 0;
    const divisoes: DivisaoCarga[] = [];
    for (let k = ini; k <= fim; k++) {
      const x = reg.divisoes[k];
      if (!x) continue;
      const indexada = x.fac === -100;
      const viga = Math.floor(x.f + 1e-6);
      divisoes.push({
        p: x.p,
        d: x.d,
        f: indexada ? 0 : x.f,
        pAcidental: x.pac,
        fAcidental: indexada ? 0 : x.fac,
        ...(indexada
          ? {
              indexada: {
                viga: nomes[viga - 1] ?? String(viga),
                apoio: qbCint((x.f - viga) * 100),
              },
            }
          : {}),
      });
    }
    const tr = reg.trechos[t];
    return { vao: tr?.vao ?? 0, inercia: tr?.inercia ?? 0, divisoes };
  };
  return {
    nome: reg.nome,
    tramos: Array.from({ length: n }, (_, i) => tramo(i + 1)),
    ...(reg.balancoEsquerdo ? { balancoEsquerdo: tramo(0) } : {}),
    ...(reg.balancoDireito ? { balancoDireito: tramo(n + 1) } : {}),
    engasteEsquerdo: reg.engasteEsquerdo,
    engasteDireito: reg.engasteDireito,
    momentosExternos: reg.momentosExternos,
    pilares: Array.from({ length: n + 1 }, () => null),
  };
}

/** Número do pilar marcado no J do apoio k: CINT((J − INT(J·100)/100)·100000)
 *  (VIGA.BAS:2140-2160). 0 = sem marca; 471 = apoio desconsiderado. */
export function pilarDaMarca(j: number) {
  return qbCint((j - Math.floor(j * 100) / 100) * 100000);
}

/** Registro r (0-based) ausente ou só com zeros (o QB preenche os registros que pula). */
const vazio = (b: Uint8Array, r: number, tamanho: number) =>
  (r + 1) * tamanho > b.length || b.subarray(r * tamanho, (r + 1) * tamanho).every((c) => c === 0);

/** Seções de uma viga no .SEC (registro r = viga r), ou undefined se o registro não é
 *  desta viga (nº de tramos ou balanços diferentes, ou registro vazio). */
export function lerSec(b: Uint8Array, r: number, reg: RegistroVigLido) {
  if (vazio(b, r, TAM_SEC)) return undefined;
  const x = leitor(b, r * TAM_SEC, TAM_SEC);
  if (
    x.int(1) !== reg.tramos ||
    (x.int(3) === 1) !== reg.balancoEsquerdo ||
    (x.int(5) === 1) !== reg.balancoDireito
  )
    return undefined;
  return Array.from({ length: TRECHOS }, (_, k) => {
    const p = 11 + 24 * k;
    return {
      trecho: { bw: x.sng(p), hw: x.sng(p + 4), bf: x.sng(p + 8), hf: x.sng(p + 12) },
      apoio: { bw: x.sng(p + 16), hw: x.sng(p + 20) },
    };
  });
}

/** Forma de uma viga no .FOR (registro r = viga r), ou undefined se o registro está vazio. */
export function lerFor(b: Uint8Array, r: number) {
  if (vazio(b, r, TAM_FOR)) return undefined;
  const x = leitor(b, r * TAM_FOR, TAM_FOR);
  const lidos = Array.from({ length: TRECHOS }, (_, k) => {
    const p = 1 + 44 * k;
    const titulo = x.texto(p + 36, 8).trimEnd();
    return {
      largura: x.sng(p),
      vaoLivre: x.sng(p + 4),
      alinhamento: x.sng(p + 8),
      eixo: x.sng(p + 12),
      pe: x.int(p + 16),
      hle: x.int(p + 18),
      pd: x.int(p + 20),
      hld: x.int(p + 22),
      codigo: x.sng(p + 24),
      lps: x.sng(p + 28),
      dis: x.sng(p + 32),
      titulo,
    };
  });
  // registro sem nenhum número (só os títulos em branco): a forma não foi gravada
  return lidos.some((t) => t.largura !== 0 || t.vaoLivre !== 0 || t.codigo !== 0)
    ? lidos
    : undefined;
}

// ---------------------------------------------------------------- .DSP

/** VAL do QuickBASIC: tira espaços e tabulações e lê o maior prefixo numérico. */
function val(texto: string) {
  const t = texto.replace(/[ \t]/g, "");
  const m = /^[+-]?(\d+\.?\d*|\.\d+)([ED][+-]?\d+)?/i.exec(t);
  return m ? Number(m[0].replace(/d/i, "e")) : 0;
}
/** MID$(s, inicio[, n]) com início 1-based; início < 1 é o "Illegal function call". */
function mid(s: string, inicio: number, n?: number) {
  if (inicio < 1) throw new ErroImportacao(".DSP: linha fora do formato (MID$ com início < 1).");
  return n === undefined ? s.slice(inicio - 1) : s.slice(inicio - 1, inicio - 1 + n);
}

/** Arquivo sequencial com o INPUT # e o LINE INPUT # do QuickBASIC: INPUT pula os espaços
 *  do começo e lê até a vírgula ou o fim da linha (linha vazia = ""); LINE INPUT lê o resto
 *  da linha. */
class Sequencial {
  private linhas: string[];
  private l = 0;
  private c = 0;
  constructor(texto: string) {
    // o EOF do DOS (Ctrl-Z) encerra o arquivo
    const fim = texto.indexOf("\x1a");
    this.linhas = (fim >= 0 ? texto.slice(0, fim) : texto).split(/\r\n|\r|\n/);
  }
  private atual() {
    const s = this.linhas[this.l];
    if (s === undefined)
      throw new ErroImportacao(".DSP: o arquivo acabou antes do fim da parametrização.");
    return s;
  }
  lineInput() {
    const s = this.atual().slice(this.c);
    this.l += 1;
    this.c = 0;
    return s;
  }
  input() {
    const s = this.atual();
    let i = this.c;
    while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
    if (s[i] === '"') {
      // texto entre aspas: até a aspa seguinte; depois, até a vírgula ou o fim da linha
      const fecha = s.indexOf('"', i + 1);
      const valor = fecha < 0 ? s.slice(i + 1) : s.slice(i + 1, fecha);
      const depois = fecha < 0 ? -1 : s.indexOf(",", fecha);
      if (depois < 0) {
        this.l += 1;
        this.c = 0;
      } else this.c = depois + 1;
      return valor;
    }
    const v = s.indexOf(",", i);
    if (v < 0) {
      this.l += 1;
      this.c = 0;
      return s.slice(i).trimEnd();
    }
    this.c = v + 1;
    return s.slice(i, v).trimEnd();
  }
  /** Pula as linhas de comentário ("*") e confere o título da seção. */
  secao(confere: (linha: string) => boolean, nome: string) {
    let s = this.lineInput();
    while (s.startsWith("*")) s = this.lineInput();
    if (!confere(s)) throw new ErroImportacao(`.DSP: esperada a seção "${nome}", veio "${s}".`);
  }
}

type Dsp = typeof PARAMETROS_DSP;

/** Lê um .DSP como o DESENHO (L_23333, DESENHO.BAS:5112-5410) e devolve a tabela inteira.
 *  O que o .DSP não tem (coeficientes do DESENHO.INI) fica com o de fábrica. */
export function lerDsp(texto: string): Dsp {
  const a = new Sequencial(texto);
  const num = () => val(a.input());
  const letra = (maiuscula = true) => {
    const c = mid(a.input(), 1, 1);
    return maiuscula ? c.toUpperCase() : c;
  };
  /** Valor em cm, "M<v>" (fixo em m: −v) ou "D<v>" (diâmetros: v + 100). */
  const medida = (aceitaM: boolean) => {
    const s = a.input();
    let v = val(s);
    if (aceitaM && mid(s, 1, 1) === "M") v = -val(mid(s, 2));
    if (mid(s, 1, 1) === "D") v = val(mid(s, 2)) + 100;
    return v;
  };

  a.secao((s) => s === "PARAMETROS GLOBAIS", "PARAMETROS GLOBAIS");
  const reducaoNegativos = num();
  const fck = num();
  const fyk = num();
  const tipoAco = letra();
  const multiplicadorUnidade = num();
  a.input(); // unidade de fck e fyk (texto)
  const sEc = a.input();
  const multiplicadorEc = mid(sEc, 1, 1) === "E" ? -val(mid(sEc, 2, 10)) : val(mid(sEc, 1, 5));
  const cobrimento = num();
  const acrescimo = num();
  const alivioCortante = letra() === "S";
  const acidentaisEnvoltoria = letra() === "S";
  const momentosExternos = letra() === "S";
  const gamaF = num();
  const gamaC = num();
  const gamaS = num();

  a.secao((s) => mid(s, 1, 5) === "ORDEM", "ORDEM");
  const bitolas = Array.from({ length: 10 }, () => {
    const s = a.input();
    return { bitola: val(mid(s, 10)), area: val(mid(s, 25)), kgPorM: val(mid(s, 50)) };
  });

  a.secao((s) => s === "PARAMETROS", "PARAMETROS");
  const taxaArmaduraMinima = num();
  const decalagem = medida(true);
  const ancoragemPositiva = medida(true);
  const ancoragemNegativa = medida(true);
  const ancoragemMinimo10Diametros = letra(false) === "S";
  const flechaInerciaFissurada = letra(false) === "S";
  const flechaDeformacaoLenta = letra(false) === "S";
  const verificaFissuracao = letra(false) === "S";
  let classeFissuracao = num();
  if (classeFissuracao !== 1 && classeFissuracao !== 2 && classeFissuracao !== 3)
    classeFissuracao = 3;

  a.secao((s) => s === "PARAMETROS", "PARAMETROS");
  const gruposBitolas = num();
  // sem o 3º..5º limite no arquivo, fica o valor anterior (o de fábrica)
  const limitesIntervalos = [num(), num(), ...PARAMETROS_DSP.limitesIntervalos.slice(2)];
  if (gruposBitolas > 3) limitesIntervalos[2] = num();
  if (gruposBitolas > 4) limitesIntervalos[3] = num();
  if (gruposBitolas > 5) limitesIntervalos[4] = num();
  const arranjosPorIntervalo: { area: number; arranjo: string }[][] = [];
  for (let g = 0; g < gruposBitolas; g++) {
    a.secao((s) => s === `${g + 1} INTERVALO`, `${g + 1} INTERVALO`);
    const lista: { area: number; arranjo: string }[] = [];
    for (let i = 0; i <= 28; i++) {
      const s = a.input();
      if (s === "FIM") break;
      lista.push({ area: val(s), arranjo: mid(s, s.indexOf("#") + 1 - 3).trimStart() });
    }
    arranjosPorIntervalo.push(lista);
  }
  const grupoDeCorte: number[][] = [];
  for (let g = 0; g < gruposBitolas; g++) {
    a.secao((s) => mid(s, 1, 6) === "NUMERO", "NUMERO");
    const lista: number[] = [];
    for (let i = 0; i <= 7; i++) {
      const s = a.input();
      if (s === "FIM") break;
      lista.push(qbCint(val(mid(s, 15))));
    }
    grupoDeCorte.push(lista);
  }

  a.secao((s) => s === "PARAMETROS", "PARAMETROS");
  const taxaEstriboMinima = num();
  const espacamentoEstriboMinimo = num();
  const espacamentoEstriboMaximo = num();
  const compara = num();
  const larguraEstriboSimples = num();
  const larguraEstriboDuplo = num();
  a.secao((s) => s === "ESPACAMENTO DE ESTRIBOS", "ESPACAMENTO DE ESTRIBOS");
  const espacamentosEstribo = a
    .input()
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x !== "")
    .map(val);
  a.secao((s) => s === "MAXIMA   MINIMA", "MAXIMA   MINIMA");
  const minimas: number[] = [];
  for (let i = 5; i >= 0; i--) minimas[i] = val(mid(a.input(), 9));
  // a máxima da linha i é a bitola i do .DSP (DESENHO.BAS:5365)
  const bitolasEstribo = minimas.map((minima, i) => ({ maxima: bitolas[i]!.bitola, minima }));

  a.secao((s) => s === "PARAMETROS", "PARAMETROS");
  const dobrasPorBitola = Array.from({ length: 10 }, () => {
    a.input();
    return Array.from({ length: 5 }, () => qbCint(val(a.input())));
  });
  const tabela = () => {
    a.secao((s) => s === "PARAMETROS", "PARAMETROS");
    const t = Array.from({ length: 5 }, () => {
      a.input();
      return num();
    });
    a.input();
    a.input();
    return t;
  };
  const tabelaBitola1 = tabela();
  const tabelaBitola2 = tabela();

  a.secao((s) => s === "PARAMETROS", "PARAMETROS");
  const letraFerros = letra(false);
  const portaEstribosAutomaticos = letra() === "S";
  const ordemMinimaPortaEstribo = num();
  const traspassePortaEstribo = medida(false);
  const comprimentoDesenvolvido = letra() === "S";
  const raioDobramento = num();
  const taxaMinimaNegativa = num();
  const alturaArmaduraPele = num();
  const taxaArmaduraPele = num();
  const traspassePele = medida(false);
  const distanciaMinimaEstribosExtremidade = val(mid(a.input(), 1, 5));
  const entradaMinimaApoio = val(a.lineInput());
  const verificaGrampos = letra() === "S";
  const reduzAncoragemPositiva = letra() === "S";
  const ordemMaximaCA60 = num();
  const comprimentoMaximoBarra = num();
  a.input();
  const final = a.input();
  // ERROR 1 do leitor (DESENHO.BAS:5466-5468): o DESENHO avisa e adota a SISTRUT
  if (final !== "FINAL DA PARAMETRIZACAO")
    throw new ErroImportacao(`.DSP: esperado "FINAL DA PARAMETRIZACAO", veio "${final}".`);

  return {
    ...PARAMETROS_DSP,
    reducaoNegativos,
    fck,
    fyk,
    classeAco: tipoAco === "A" ? "A" : "B",
    multiplicadorUnidade,
    multiplicadorEc,
    cobrimento,
    acrescimo,
    alivioCortante,
    acidentaisEnvoltoria,
    momentosExternos,
    gamaF,
    gamaC,
    gamaS,
    bitolas,
    taxaArmaduraMinima,
    decalagem,
    ancoragemPositiva,
    ancoragemNegativa,
    ancoragemMinimo10Diametros,
    flechaInerciaFissurada,
    flechaDeformacaoLenta,
    verificaFissuracao,
    classeFissuracao,
    gruposBitolas,
    limitesIntervalos,
    arranjosPorIntervalo,
    grupoDeCorte,
    taxaEstriboMinima,
    espacamentoEstriboMinimo,
    espacamentoEstriboMaximo,
    comparaEspacamentoMaximo: compara === 1 ? "H/2" : "d/2",
    larguraEstriboSimples,
    larguraEstriboDuplo,
    espacamentosEstribo,
    bitolasEstribo,
    dobrasPorBitola,
    tabelaBitola1,
    tabelaBitola2,
    letraFerros,
    portaEstribosAutomaticos,
    ordemMinimaPortaEstribo,
    traspassePortaEstribo,
    comprimentoDesenvolvido,
    raioDobramento,
    taxaMinimaNegativa,
    alturaArmaduraPele,
    taxaArmaduraPele,
    traspassePele,
    distanciaMinimaEstribosExtremidade,
    entradaMinimaApoio,
    verificaGrampos,
    reduzAncoragemPositiva,
    ordemMaximaCA60,
    comprimentoMaximoBarra,
  };
}

/** Igualdade como o original guarda (SINGLE), em profundidade. */
function igualSingle(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return sng(a) === sng(b);
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => igualSingle(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a);
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    return ka.length === Object.keys(b).length && ka.every((k) => igualSingle(ra[k], rb[k]));
  }
  return a === b;
}

/** Só os campos do .DSP que diferem do de fábrica (o que vai para a obra). */
export const dspDaObra = (dsp: Dsp): Partial<Dsp> => diferentes(dsp, PARAMETROS_DSP);

// ---------------------------------------------------------------- .TAB e DESENHO.INI

const TAM_TAB = 70;

/** O .TAB do DESINIT (70 bytes por viga, registro r = viga r; DESINIT.BAS:763-852, 933):
 *  nome ("~" + nome, 10 caracteres) e A_1CEC(0..14) em SINGLE, com as repetições em 0.
 *  Registro vazio fica undefined. */
export function lerTab(b: Uint8Array) {
  const lista: ({ nome: string; repeticoes: number } | undefined)[] = [];
  for (let r = 0; (r + 1) * TAM_TAB <= b.length; r++) {
    if (vazio(b, r, TAM_TAB)) {
      lista.push(undefined);
      continue;
    }
    const x = leitor(b, r * TAM_TAB, TAM_TAB);
    lista.push({
      nome: x.texto(1, 10).trimEnd().replace(/^~/, ""),
      repeticoes: qbCint(x.sng(11)),
    });
  }
  return lista;
}

/** DESENHO.INI como o DESENHO lê (DESENHO.BAS:738-767): uma linha por item, valor antes
 *  do "=" (linha 1, a parametrização padrão) e os coeficientes de medida e de força por
 *  VAL nas linhas 8 e 9. */
export function lerDesenhoIni(texto: string) {
  const linhas = texto.split(/\r\n|\r|\n/);
  if (linhas.length < 9) throw new ErroImportacao("DESENHO.INI com menos de 9 linhas.");
  const l = (i: number) => linhas[i - 1]!;
  const antesDoIgual = (x: string) => x.slice(0, Math.max(0, x.indexOf("=")));
  return {
    parametrizacao: antesDoIgual(l(1)),
    coeficienteMedida: val(l(8)),
    coeficienteForca: val(l(9)),
  };
}

// ---------------------------------------------------------------- VIGA.INI

type ParametrosIni = typeof PARAMETROS_VIGA;

/** Lê o VIGA.INI como o VIGA (VIGA.BAS:591-640): uma linha por parâmetro, valor antes do
 *  "=". Linhas 5-6 coeficientes de medida e força, 7 % de redução dos negativos (MIN(v/100,
 *  15)), 8 acidentais S/N, 9 acidental F/G, 10 % gerada (CINT(MAX(4, MIN(96, v)))), 11
 *  momentos externos S/N, 12 reação E/M. */
export function lerVigaIni(texto: string): ParametrosIni {
  const linhas = texto.split(/\r\n|\r|\n/);
  if (linhas.length < 12) throw new ErroImportacao("VIGA.INI com menos de 12 linhas.");
  const l = (i: number) => linhas[i - 1]!;
  const c = (i: number) => l(i).slice(0, 1);
  return {
    ...PARAMETROS_VIGA,
    coeficienteMedida: val(l(5)),
    coeficienteForca: val(l(6)),
    reducaoNegativos: Math.min(val(l(7)) / 100, 15),
    acidentais: c(8) === "S",
    acidentalGerada: c(9) === "G",
    porcentagemAcidentalGerada: qbCint(Math.max(4, Math.min(96, val(l(10))))),
    momentosExternos: c(11) === "S",
    reacaoNoPilar: c(12) === "M" ? "maxima" : "estatica",
  };
}

/** Só os campos que diferem do de fábrica (comparados em SINGLE). */
function diferentes<T extends object>(tabela: T, fabrica: T): Partial<T> {
  const r: Partial<T> = {};
  for (const k of Object.keys(tabela) as (keyof T)[])
    if (!igualSingle(tabela[k], fabrica[k])) r[k] = tabela[k];
  return r;
}

// ---------------------------------------------------------------- registro → viga da obra

/** Menor decimal que volta ao mesmo SINGLE (0,40000001 → 0,4). */
export function decimalDoSingle(x: number) {
  for (let p = 1; p <= 9; p++) {
    const d = Number(x.toPrecision(p));
    if (sng(d) === sng(x)) return d;
  }
  return x;
}

type TipoTrecho = "balE" | "tramo" | "balD";

function trechosDoRegistro(d: DadosViga) {
  return [
    ...(d.balancoEsquerdo ? [{ t: d.balancoEsquerdo, tipo: "balE" as TipoTrecho }] : []),
    ...d.tramos.map((t) => ({ t, tipo: "tramo" as TipoTrecho })),
    ...(d.balancoDireito ? [{ t: d.balancoDireito, tipo: "balD" as TipoTrecho }] : []),
  ];
}

/** Cargas da obra a partir das divisões de um trecho: uma distribuída por divisão com P
 *  ou Pac e uma concentrada por F ou Fac. As indexadas (viga sobre viga) não entram: a
 *  reação vem da planta. Posições a partir da ponta esquerda do trecho. */
function cargasDoTrecho(
  t: TramoViga,
  tipo: TipoTrecho,
  trecho: number,
  indexadasNaPlanta: readonly number[],
) {
  const cargas: CargaViga[] = [];
  const L = t.vao;
  // abscissas a partir do apoio, em ordem crescente (no balanço esquerdo o registro vem
  // da ponta para o apoio)
  const divs = tipo === "balE" ? [...t.divisoes].reverse() : t.divisoes;
  /** Posição a partir da ponta esquerda: o decimal mais curto que volta ao mesmo D. */
  const pos = (d: number) => {
    if (tipo !== "balE") return decimalDoSingle(d);
    // o decimal mais curto u com sng(L − u) = D (o motor refaz D = L − u em SINGLE)
    for (let p = 1; p <= 17; p++) {
      const u = Number((L - d).toPrecision(p));
      if (sng(L - u) === sng(d)) return u;
    }
    return L - d;
  };
  /** D em que a planta já leva a reação de uma viga apoiada (casa pela posição). */
  const naPlanta = (d: number) =>
    indexadasNaPlanta.some((x) => Math.abs(x - d) <= 1e-5 * Math.max(1, L));
  let anterior = 0;
  divs.forEach((dv) => {
    if (dv.p !== 0 || dv.pAcidental !== 0) {
      const [inicio, fim] = [pos(anterior), pos(dv.d)].sort((a, b) => a - b) as [number, number];
      cargas.push({
        tipo: "distribuida",
        trecho,
        inicio,
        fim,
        total: tPorMParaKnPorM(dv.p),
        acidental: tPorMParaKnPorM(dv.pAcidental),
      });
    }
    // carga indexada "*n.aa" (Fac = −100): a reação do apoio aa da viga n (VIGA.BAS:1309-1312)
    if (dv.indexada && !naPlanta(dv.d))
      cargas.push({
        tipo: "reacao",
        trecho,
        posicao: pos(dv.d),
        viga: dv.indexada.viga,
        apoio: dv.indexada.apoio,
      });
    if (!dv.indexada && !naPlanta(dv.d) && (dv.f !== 0 || dv.fAcidental !== 0))
      cargas.push({
        tipo: "concentrada",
        trecho,
        posicao: pos(dv.d),
        total: tParaKn(dv.f),
        acidental: tParaKn(dv.fAcidental),
      });
    anterior = dv.d;
  });
  return cargas;
}

/** Entrada do VIGA/DESENHO de uma viga a partir do registro, do .SEC e do .FOR. */
function entradaDaViga(
  d: DadosViga,
  secao: ReturnType<typeof lerSec>,
  forma: ReturnType<typeof lerFor>,
  indexadasNaPlanta: (trecho: number) => readonly number[] = () => [],
): Partial<Viga> {
  const trechos = trechosDoRegistro(d);
  const be = d.balancoEsquerdo ? 1 : 0;
  const n = d.tramos.length;
  /** Índice do original (0 balE, 1..n tramos, n+1 balD) do trecho i da obra. */
  const indice = (i: number) => (be ? i : i + 1);
  const r: Partial<Viga> = {
    cargas: trechos.flatMap(({ t, tipo }, i) => cargasDoTrecho(t, tipo, i, indexadasNaPlanta(i))),
    vaos: trechos.map(({ t }) => decimalDoSingle(t.vao)),
    inercias: trechos.map(({ t }) => decimalDoSingle(t.inercia)),
  };
  if (d.engasteEsquerdo || d.engasteDireito)
    r.engaste = { esquerdo: d.engasteEsquerdo, direito: d.engasteDireito };
  if (d.momentosExternos[0] !== 0 || d.momentosExternos[1] !== 0)
    r.momentosExternos = {
      esquerdo: tmParaKnm(d.momentosExternos[0]),
      direito: tmParaKnm(d.momentosExternos[1]),
    };
  if (secao) {
    const trechosSec: SecaoTrechoViga[] = trechos.map((_, i) => {
      const s = secao[indice(i)]!.trecho;
      // o original grava −0 na mesa de seção retangular
      return { bw: s.bw, h: s.hw, bf: Math.abs(s.bf), hf: Math.abs(s.hf) };
    });
    const apoiosSec: SecaoApoioViga[] = Array.from({ length: n + 1 }, (_, k) => ({
      bw: secao[k]!.apoio.bw,
      h: secao[k]!.apoio.hw,
    }));
    r.secoes = { trechos: trechosSec, apoios: apoiosSec };
  }
  if (forma) {
    // o .FOR não grava a resposta de "Lajes no Corte", só pe/Hle/pd/Hld: tudo 0 é o "N"
    const semLajes = trechos.every((_, i) => {
      const f = forma[indice(i)]!;
      return f.pe === 0 && f.hle === 0 && f.pd === 0 && f.hld === 0;
    });
    const trechosFor: FormaTrechoViga[] = trechos.map((_, i) => {
      const f = forma[indice(i)]!;
      return {
        vaoLivre: f.vaoLivre,
        ...(semLajes ? {} : { pe: f.pe, hle: f.hle, pd: f.pd, hld: f.hld }),
        eixo: f.eixo,
        alinhamento: f.alinhamento,
      };
    });
    const apoiosFor: FormaApoioViga[] = Array.from({ length: n + 1 }, (_, k) => {
      const f = forma[k]!;
      const tipo = f.titulo.slice(0, 1);
      return {
        largura: f.largura,
        ...(tipo === "P" || tipo === "V" || tipo === "O" || tipo === "A" ? { tipo } : {}),
        titulo: f.titulo.slice(1),
        codigo: f.codigo,
        lps: f.lps,
        dis: f.dis,
      };
    });
    r.forma = {
      trechos: trechosFor,
      apoios: apoiosFor,
      ...(semLajes ? { lajesNoCorte: "nao" as const } : {}),
    };
  }
  return r;
}

// ---------------------------------------------------------------- importação

/** Aço da V2 pelo fyk do .DSP (t/cm²). */
function acoDoFyk(fyk: number, avisos: string[]): Aco {
  if (Math.abs(fyk - 2.5) < 1e-6) return "CA-25";
  if (Math.abs(fyk - 6) < 1e-6) return "CA-60";
  if (Math.abs(fyk - 5) > 1e-6)
    avisos.push(`fyk ${fyk} t/cm² do .DSP não é de CA-25, CA-50 nem CA-60: a obra fica com CA-50.`);
  return "CA-50";
}

const extensao = (nome: string) => nome.slice(nome.lastIndexOf(".")).toUpperCase();
const base = (nome: string) => nome.slice(0, nome.lastIndexOf(".")).replace(/^.*[\\/]/, "");
const texto = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

/** Distância entre as linhas das vigas na planta gerada, m. */
const ENTRE_VIGAS = 5;
/** Largura do pilar quando o .FOR não a dá, cm. */
const LARGURA_PILAR = 20;

/** Importa o .VIG (obrigatório), o .SEC, o .FOR e o .DSP. Sem `obra`, gera uma obra nova
 *  só com as vigas; com ela, completa o pavimento `pavimentoId` (o primeiro, se ausente). */
export function importarVigasSistrut(
  arquivos: readonly ArquivoSistrut[],
  obra?: Obra,
  pavimentoId?: string,
): ImportacaoVigas {
  try {
    const avisos: string[] = [];
    const vigArq = arquivos.find((a) => extensao(a.nome) === ".VIG");
    if (!vigArq)
      throw new ErroImportacao(
        "Selecione o .VIG da obra (e, se houver, o .SEC, o .FOR, o .DSP e o VIGA.INI).",
      );
    const nomeObra = base(vigArq.nome);
    const mesmo = (ext: string) =>
      arquivos.find(
        (a) => extensao(a.nome) === ext && base(a.nome).toUpperCase() === nomeObra.toUpperCase(),
      ) ?? arquivos.find((a) => extensao(a.nome) === ext);
    const sec = mesmo(".SEC");
    const forArq = mesmo(".FOR");
    const dspArq = arquivos.find((a) => extensao(a.nome) === ".DSP");
    const iniArq = arquivos.find(
      (a) => base(a.nome).toUpperCase() === "VIGA" && extensao(a.nome) === ".INI",
    );
    const tabArq = mesmo(".TAB");
    const desenhoIni = arquivos.find(
      (a) => base(a.nome).toUpperCase() === "DESENHO" && extensao(a.nome) === ".INI",
    );
    for (const a of arquivos)
      if (
        a !== iniArq &&
        a !== desenhoIni &&
        ![".VIG", ".SEC", ".FOR", ".DSP", ".TAB"].includes(extensao(a.nome))
      )
        avisos.push(
          `${a.nome} ignorado: só .VIG, .SEC, .FOR, .TAB, .DSP, VIGA.INI e DESENHO.INI são importados aqui.`,
        );

    const registros = lerVig(vigArq.dados);
    const nomes = registros.map((r) => r.nome);
    let dsp: Dsp | undefined;
    if (dspArq)
      try {
        dsp = lerDsp(texto(dspArq.dados));
      } catch (e) {
        if (!(e instanceof ErroImportacao)) throw e;
        // o DESENHO mostra "ERRO NO ARQUIVO PARAMETRIZACAO" e adota a SISTRUT (L_2041c)
        avisos.push(`${dspArq.nome}: ${e.message} O original adota a parametrização SISTRUT.`);
      }
    const parametrosDsp = dsp ? dspDaObra(dsp) : undefined;
    const parametrosIni = iniArq
      ? diferentes(lerVigaIni(texto(iniArq.dados)), PARAMETROS_VIGA)
      : undefined;
    const secoes = registros.map((r, i) => {
      const s = sec ? lerSec(sec.dados, i, r) : undefined;
      if (sec && !s && !vazio(sec.dados, i, TAM_SEC))
        avisos.push(
          `${sec.nome}: o registro ${i + 1} não é da viga ${r.nome} (tramos ou balanços diferentes): ignorado.`,
        );
      return s;
    });
    const formas = registros.map((_, i) => (forArq ? lerFor(forArq.dados, i) : undefined));
    const tab = tabArq ? lerTab(tabArq.dados) : [];
    const desenho = desenhoIni ? lerDesenhoIni(texto(desenhoIni.dados)) : undefined;

    const nova = obra
      ? completar(obra, pavimentoId, registros, nomes, secoes, formas, avisos)
      : gerar(nomeObra, registros, nomes, secoes, formas, dsp, avisos);
    if (parametrosDsp && Object.keys(parametrosDsp).length > 0)
      nova.parametrosViga = {
        ...nova.parametrosViga,
        dsp: { ...nova.parametrosViga?.dsp, ...parametrosDsp },
      };
    // repetições da viga no DESENHO: o rept do .TAB (DESINIT.BAS:764), registro r = viga r
    for (const [i, reg] of registros.entries()) {
      const t = tab[i];
      const v = nova.pavimentos.flatMap((p) => p.vigas).find((x) => x.nome === reg.nome);
      if (t && v && t.nome === reg.nome) v.repeticoes = t.repeticoes;
    }
    if (desenho) {
      const coef = diferentes(
        {
          coeficienteMedida: desenho.coeficienteMedida,
          coeficienteForca: desenho.coeficienteForca,
        },
        {
          coeficienteMedida: PARAMETROS_DSP.coeficienteMedida,
          coeficienteForca: PARAMETROS_DSP.coeficienteForca,
        },
      );
      if (Object.keys(coef).length > 0)
        nova.parametrosViga = {
          ...nova.parametrosViga,
          dsp: { ...nova.parametrosViga?.dsp, ...coef },
        };
      if (!dspArq && desenho.parametrizacao.toUpperCase() !== "SISTRUT")
        avisos.push(
          `DESENHO.INI: a parametrização padrão é ${desenho.parametrizacao}.DSP, que não veio; valeu a SISTRUT.`,
        );
    }
    if (parametrosIni && Object.keys(parametrosIni).length > 0)
      nova.parametrosViga = {
        ...nova.parametrosViga,
        viga: { ...nova.parametrosViga?.viga, ...parametrosIni },
      };
    const lida = lerObra(serializarObra(nova));
    if (!lida.ok) return { ok: false, erros: lida.erros };
    return { ok: true, obra: lida.obra, avisos };
  } catch (e) {
    if (e instanceof ErroImportacao) return { ok: false, erros: [e.message] };
    throw e;
  }
}

/** Obra nova: cada viga numa linha horizontal, um pilar em cada apoio. */
function gerar(
  nome: string,
  registros: readonly RegistroVigLido[],
  nomes: readonly string[],
  secoes: readonly ReturnType<typeof lerSec>[],
  formas: readonly ReturnType<typeof lerFor>[],
  dsp: Dsp | undefined,
  avisos: string[],
): Obra {
  const materiais = materiaisPadrao("nb1-78");
  if (dsp) {
    materiais.fck = Math.round(decimalDoSingle(dsp.fck) * 100 * 1e6) / 1e6;
    materiais.aco = acoDoFyk(dsp.fyk, avisos);
    materiais.acoEstribo = materiais.aco;
    materiais.classeAco = materiais.aco === "CA-25" ? "A" : dsp.classeAco;
  } else materiais.classeAco = PARAMETROS_DSP.classeAco;
  const pav = pavimentoNovo("Pavimento 1");
  const pilares: Pilar[] = [];
  registros.forEach((reg, iv) => {
    const d = dadosDoRegistro(reg, nomes);
    const trechos = trechosDoRegistro(d);
    const be = d.balancoEsquerdo ? 1 : 0;
    const n = d.tramos.length;
    const y = -ENTRE_VIGAS * iv;
    // nós: soma dos vãos (o vão exato vai em `vaos`)
    const nos = [0];
    for (const { t } of trechos)
      nos.push(Math.round((nos.at(-1)! + decimalDoSingle(t.vao)) * 1e6) / 1e6);
    const forma = formas[iv];
    const desconsiderados: number[] = [];
    for (let k = 0; k <= n; k++) {
      // o J do trecho k marca o pilar do apoio k (o 0 marca o primeiro apoio)
      const marca = pilarDaMarca(reg.trechos[k]!.inercia);
      if (marca === 471) desconsiderados.push(k);
      const largura = forma?.[k]?.largura || LARGURA_PILAR;
      const nomePilar = marca > 0 && marca !== 471 ? `P${marca}` : `${reg.nome}.A${k}`;
      if (marca === 0)
        avisos.push(
          `Viga ${reg.nome}, apoio ${k}: o J não traz o número do pilar; pilar ${nomePilar}.`,
        );
      pilares.push({ id: novoId(), nome: nomePilar, x: nos[k + be]!, y, b: largura, h: largura });
    }
    const secao = secoes[iv];
    const s1 = secao?.[1]?.trecho;
    if (!secao) avisos.push(`Viga ${reg.nome}: sem seção no .SEC; ficou 20 × 50 cm.`);
    const viga: Viga = {
      id: novoId(),
      nome: reg.nome,
      x1: 0,
      y1: y,
      x2: nos.at(-1)!,
      y2: y,
      bw: s1?.bw || 20,
      h: s1?.hw || 50,
      cargaLinear: 0,
      somenteCargasProprias: true,
      ...entradaDaViga(d, secao, forma),
      ...(desconsiderados.length ? { apoiosDesconsiderados: desconsiderados } : {}),
    };
    pav.vigas.push(viga);
  });
  pav.pilares = pilares;
  // sem a planta, o mesmo pilar aparece uma vez em cada viga que se apoia nele
  const nomesPilares = pilares.map((p) => p.nome);
  const repetidos = [...new Set(nomesPilares.filter((x, i) => nomesPilares.indexOf(x) !== i))];
  if (repetidos.length > 0)
    avisos.push(
      `Pilares ${repetidos.join(", ")} aparecem em mais de uma viga do .VIG e a planta gerada tem um por viga, em posição inventada: o .REP soma as reações pelo nome, como o original, mas no cálculo dos pilares só o primeiro de cada nome recebe a carga. Para os pilares, importe com a obra do .LAJ.`,
    );
  return {
    versao: 3,
    nome,
    norma: "nb1-78",
    modoCalculo: "original",
    materiais,
    pavimentos: [pav],
  };
}

/** Campos da viga que a importação grava (os que uma reimportação limpa). */
const CAMPOS_DA_IMPORTACAO = [
  "cargas",
  "somenteCargasProprias",
  "vaos",
  "inercias",
  "engaste",
  "momentosExternos",
  "apoiosDesconsiderados",
  "secoes",
  "forma",
] as const satisfies readonly (keyof Viga)[];

/** Completa o pavimento: casa as vigas pelo nome e põe só o que difere do que a montagem
 *  da própria obra grava (as cargas, se alguma divisão difere; senão nada). */
function completar(
  obra: Obra,
  pavimentoId: string | undefined,
  registros: readonly RegistroVigLido[],
  nomes: readonly string[],
  secoes: readonly ReturnType<typeof lerSec>[],
  formas: readonly ReturnType<typeof lerFor>[],
  avisos: string[],
): Obra {
  const nova = structuredClone(obra);
  const ip = pavimentoId ? nova.pavimentos.findIndex((p) => p.id === pavimentoId) : 0;
  const pav = nova.pavimentos[ip];
  if (!pav) throw new ErroImportacao(`Pavimento ${pavimentoId ?? ""} não existe na obra.`);
  // reimportação: a entrada de viga de antes sai, e a montagem é a da planta
  for (const v of pav.vigas)
    if (registros.some((r) => r.nome === v.nome))
      for (const campo of CAMPOS_DA_IMPORTACAO) delete v[campo];
  const montagem = calcularObraSistrut(nova, { modo: "original" }).pavimentos[ip]!.montagem.vigas;
  // a montagem da V2 e o LAJEMONT diferem em poucos ulps do SINGLE em algumas divisões
  // (E2E V3/V6, VBX V2): isso não é edição do usuário
  const igual = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-5 * Math.max(Math.abs(a), Math.abs(b));
  registros.forEach((reg, iv) => {
    const viga = pav.vigas.find((v) => v.nome === reg.nome);
    const m = montagem.find((v) => v.nome === reg.nome);
    if (!viga || !m) {
      avisos.push(`Viga ${reg.nome} do .VIG não existe no pavimento ${pav.nome}: ignorada.`);
      return;
    }
    const d = dadosDoRegistro(reg, nomes);
    const td = trechosDoRegistro(d);
    const tm = trechosDoRegistro(m);
    if (td.length !== tm.length || !!d.balancoEsquerdo !== !!m.balancoEsquerdo) {
      avisos.push(
        `Viga ${reg.nome}: o .VIG tem ${td.length} trechos e a planta ${tm.length}: o .VIG desta viga não entra.`,
      );
      return;
    }
    // D das divisões em que a planta já traz a reação de uma viga apoiada (indexada)
    const indexadas = (i: number) => tm[i]!.t.divisoes.flatMap((dv) => (dv.indexada ? [dv.d] : []));
    const indexadaEm = (i: number, d: number) => indexadas(i).some((x) => igual(x, d));
    const mesmasCargas = td.every(({ t }, i) => {
      const a = t.divisoes;
      const b = tm[i]!.t.divisoes;
      return (
        a.length === b.length &&
        a.every(
          (x, k) =>
            igual(x.d, b[k]!.d) &&
            igual(x.p, b[k]!.p) &&
            igual(x.pAcidental, b[k]!.pAcidental) &&
            (indexadaEm(i, x.d) || (igual(x.f, b[k]!.f) && igual(x.fAcidental, b[k]!.fAcidental))),
        )
      );
    });
    const entrada = entradaDaViga(d, secoes[iv], formas[iv], indexadas);
    if (!mesmasCargas) {
      viga.somenteCargasProprias = true;
      if (entrada.cargas) viga.cargas = entrada.cargas;
      avisos.push(`Viga ${reg.nome}: cargas do .VIG diferentes das da montagem: valem as do .VIG.`);
    }
    if (!td.every(({ t }, i) => igual(t.vao, tm[i]!.t.vao)) && entrada.vaos)
      viga.vaos = entrada.vaos;
    if (!td.every(({ t }, i) => igual(t.inercia, tm[i]!.t.inercia)) && entrada.inercias)
      viga.inercias = entrada.inercias;
    if (d.engasteEsquerdo !== m.engasteEsquerdo || d.engasteDireito !== m.engasteDireito)
      viga.engaste = { esquerdo: d.engasteEsquerdo, direito: d.engasteDireito };
    if (entrada.momentosExternos) viga.momentosExternos = entrada.momentosExternos;
    // números de pilar da opção 7: o VIGA os grava no J (VIGA.BAS:2232-2236); entram os que
    // diferem do pilar que a planta põe no apoio, e o 471 ("*") vira apoio desconsiderado
    const marcas = m.pilares.map((_, k) => pilarDaMarca(reg.trechos[k]?.inercia ?? 0));
    const daPlanta = m.pilares.map((p) => (p === null ? 0 : numeroDoPilar(p)));
    const desconsiderados = marcas.flatMap((x, k) =>
      x === 471 && m.pilares[k] !== null ? [k] : [],
    );
    if (desconsiderados.length > 0) viga.apoiosDesconsiderados = desconsiderados;
    if (marcas.some((x, k) => x !== 0 && x !== 471 && x !== daPlanta[k]))
      viga.pilaresNoRep = marcas.map((x) => (x === 0 || x === 471 ? null : x));
    if (entrada.secoes) viga.secoes = entrada.secoes;
    if (entrada.forma) viga.forma = entrada.forma;
  });
  return nova;
}

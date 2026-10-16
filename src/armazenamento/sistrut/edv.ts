// Leitor do .EDV do SISTRUT 4.0: a armadura de uma viga depois que o usuário a editou no
// DESEDCAO ("Edição de Ferragem Longitudinal/Transversal", "Gravo a Viga Editada").
// Entrada é o texto do arquivo; o módulo não lê disco.
//
// Fontes (retraduzidas em `_Arquivo/Sistrust/dist/src-original/desenho/` e `viga/`):
// - gravação: DESEDCAO.BAS:464-588 (PRINT #, um valor por linha, um registro por arquivo:
//   o `IF RT_DISP%(...) THEN ... APPEND` só vale para dispositivo do DOS, o arquivo é
//   aberto FOR OUTPUT);
// - leitura: DESEDITA.BAS:745-880 (para reeditar ou imprimir o desenho) e VPLOTA.BAS:2803
//   (GOSUB L_17f9f, para montar a folha de plotagem), as duas com INPUT #.
//
// Nome: "R" + nº do registro da viga + "_" até completar 3 caracteres + os 4 primeiros
// caracteres do pavimento (DESEDCAO.BAS:464, DESEDITA.BAS:745): R5__COB.EDV, R10_SUP.EDV,
// R123TERR.EDV. O registro n é o do .SEC e do .FOR (DESEDITA.BAS:887-892), isto é, a
// n-ésima viga do .VIG (que tem um registro de cabeçalho antes; VPLOTA.BAS:2808).
//
// O registro guarda os arrays do COMMON do DESENHO que o DESINIT monta e o DESEDCAO edita
// (os nomes das colunas são os de `calculo/sistrut/vigas/desinitComum.ts`). Ao voltar do
// DESEDCAO, o DESINIT refaz com eles o quadro de ferros e regrava o .TAB (S_202b9,
// DESINIT.BAS:404-966, chamado em DESINIT.BAS:96-104): a edição muda o desenho e o
// quantitativo da viga no original.
//
// Unidades do original: posições e comprimentos em cm a partir da ponta esquerda da viga,
// bitolas em mm, fck e fyk em t/cm² (vezes `fatorUnidade`).

/** Barra longitudinal (A_1AF2 negativas, A_1AC4 positivas; dobras em A_1B4E/A_1B20). */
export interface BarraEditada {
  quantidade: number;
  /** mm */
  bitola: number;
  /** cm a partir da ponta esquerda da viga. */
  inicio: number;
  fim: number;
  /** Dobras (ganchos) na ponta esquerda e na direita, cm. */
  dobras: [number, number];
}

/** Grampo (A_1BD8 negativos, A_1BAA positivos). */
export interface GrampoEditado {
  quantidade: number;
  bitola: number;
  inicio: number;
  fim: number;
  /** Coluna 4: 0 grampo no apoio esquerdo do tramo, 1 no direito. */
  lado: "esquerdo" | "direito";
  /** Coluna 5: largura do grampo, cm (o comprimento é 2·(fim − início) + largura). */
  largura: number;
}

/** Porta-estribo (A_1B7C). */
export interface PortaEstriboEditado {
  quantidade: number;
  bitola: number;
  inicio: number;
  fim: number;
}

/** Armadura de pele de um trecho (A_1C34), com o índice do original: 0 balanço esquerdo,
 *  1..n tramos, n + 1 balanço direito. */
export interface PeleEditada {
  trecho: number;
  quantidadePorFace: number;
  bitola: number;
  inicio: number;
  fim: number;
}

/** Trecho de estribos (A_1C06). */
export interface TrechoEstriboEditado {
  inicio: number;
  fim: number;
  bitola: number;
  espacamento: number;
  /** Estribos lado a lado (1 simples, 2 duplo, 3 triplo). */
  ladoALado: number;
  /** Seção do tramo, cm: a coluna 5 grava INT(bw) + h·0,0001 (DESINIT, desinitBarras.ts). */
  bw: number;
  h: number;
  /** Nº da posição de estribo (1 = a primeira). */
  posicao: number;
}

/** Nota de observação na forma (A_1C90$(2..5), DESEDCAO.BAS:4404-4470). */
export interface NotaForma {
  trecho: number;
  /** <E>squerda, <C>entro ou <D>ireita do trecho. */
  local: "E" | "C" | "D";
  texto: string;
}

/** Nota de observação na armadura (A_1C90$(6..14), DESEDCAO.BAS:4480-4570). */
export interface NotaArmadura {
  /** Nº da posição de barra (1 = a primeira negativa, na ordem do quadro de ferros). */
  posicao: number;
  texto: string;
}

/** Um .EDV lido. */
export interface EdicaoVigaSistrut {
  /** Do nome do arquivo: o registro da viga no .SEC/.FOR e os 4 primeiros caracteres do
   *  pavimento, em maiúsculas. */
  registro: number;
  pavimento: string;
  /** Nome da viga (V_0DD4$). */
  viga: string;
  /** Comprimento total da viga, cm, de ponta a ponta (DESEDCAO.BAS:466). */
  comprimento: number;
  /** fck e fyk, t/cm² na unidade do DESENHO (V_0EBA, V_0EBE), o multiplicador da unidade
   *  (V_0EC6) e o nome dela (V_0ECA$, "t/cm2"). */
  materiais: { fck: number; fyk: number; fatorUnidade: number; unidade: string };
  /** Cobrimento e cobrimento + acréscimo (d'), cm (V_0EAA, V_0EA6). */
  cobrimento: number;
  cobrimentoMaisAcrescimo: number;
  /** Repetições da viga no DESENHO (A_1CBE%); o DESEDITA só o usa se a viga ainda não
   *  tiver repetições (DESEDITA.BAS:755-756). */
  repeticoes: number;
  /** Nº de tramos e balanços (V_0DDC, V_0DE0, V_0DE4). */
  tramos: number;
  balancoEsquerdo: boolean;
  balancoDireito: boolean;
  negativas: BarraEditada[];
  grampoNegativos: GrampoEditado[];
  positivas: BarraEditada[];
  grampoPositivos: GrampoEditado[];
  portaEstribos: PortaEstriboEditado[];
  /** Pele (V_186E ≠ 0): os trechos com pele (o arquivo grava todos, de 0 a n + balanço
   *  direito) e o nº de trechos com pele por bitola 0..5 (A_1A96%). null sem pele. */
  pele: { linhas: number; trechos: PeleEditada[]; trechosPorBitola: number[] } | null;
  estribos: TrechoEstriboEditado[];
  notasForma: NotaForma[];
  /** M+ do detalhamento de cada trecho 0..n + balanço direito, t·m na unidade do DESENHO
   *  (A_128E(t,4), DESINIT, desinit.ts). */
  momentosPositivos: number[];
  notasArmadura: NotaArmadura[];
}

export type LeituraEdv =
  | { ok: true; edicao: EdicaoVigaSistrut; avisos: string[] }
  | { ok: false; erros: string[] };

// Limites dos arrays do COMMON (DESEDITA.BAS:729-746): passar deles é o erro 9 do QB.
const MAX_LONGITUDINAIS = 60;
const MAX_GRAMPOS = 10;
const MAX_PORTA_ESTRIBOS = 30;
const MAX_ESTRIBOS = 50;
const MAX_TRECHOS = 14;
/** A_1C90$ vai de 0 a 15 (DESENHO.BAS:613); as notas da armadura começam no 6. */
const MAX_NOTAS_ARMADURA = 10;

/** Registro e pavimento a partir do nome do arquivo; null se o nome não é de .EDV. */
export function nomeEdv(nome: string): { registro: number; pavimento: string } | null {
  const base = nome.replace(/^.*[\\/]/, "").toUpperCase();
  const m = /^R(\d{1,3})(_*)(.*)\.EDV$/.exec(base);
  if (!m?.[1]) return null;
  const digitos = m[1].length;
  const enchimento = Math.max(0, 3 - digitos);
  const sublinhados = m[2] ?? "";
  // sublinhado além do enchimento é do nome do pavimento
  if (sublinhados.length < enchimento) return null;
  const pavimento = sublinhados.slice(enchimento) + (m[3] ?? "");
  return { registro: Number(m[1]), pavimento };
}

/** Nome do .EDV da viga do registro `registro` no pavimento (DESEDCAO.BAS:464). */
export function nomeArquivoEdv(registro: number, pavimento: string): string {
  const n = String(registro);
  return `R${n}${"_".repeat(Math.max(0, 3 - n.length))}${pavimento.slice(0, 4).toUpperCase()}.EDV`;
}

class ErroLeitura extends Error {}

/** VAL do QuickBASIC: o número no começo do texto (com expoente E ou D), 0 se não há. */
function qbVal(s: string): number {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[ED][+-]?\d+)?)/i.exec(s);
  return m?.[1] ? Number(m[1].replace(/d/i, "e")) : 0;
}

/** INPUT # do QuickBASIC sobre o texto de um arquivo sequencial: campos separados por
 *  vírgula ou fim de linha; ^Z encerra o arquivo. */
class EntradaQB {
  private i = 0;
  private linha = 1;
  private readonly t: string;

  constructor(texto: string) {
    const z = texto.indexOf("\x1a");
    this.t = z < 0 ? texto : texto.slice(0, z);
  }

  /** EOF(1): nada mais a ler. */
  fim() {
    return this.i >= this.t.length;
  }

  private ch() {
    return this.t[this.i] ?? "";
  }

  /** Consome o fim de linha (CRLF, CR ou LF) se estiver nele. */
  private fimDeLinha(): boolean {
    if (this.ch() === "\r") {
      this.i++;
      if (this.ch() === "\n") this.i++;
    } else if (this.ch() === "\n") this.i++;
    else return false;
    this.linha++;
    return true;
  }

  private pulaBrancos() {
    while (this.ch() === " " || this.ch() === "\t") this.i++;
  }

  /** Depois do campo: brancos e o separador (vírgula ou fim de linha). */
  private separador() {
    this.pulaBrancos();
    if (this.ch() === ",") this.i++;
    else this.fimDeLinha();
  }

  /** INPUT # de string: brancos à esquerda saem; entre aspas vale até a aspa; sem aspas,
   *  até a vírgula ou o fim da linha, sem os brancos à direita. */
  texto(campo: string): string {
    if (this.fim()) throw new ErroLeitura(`arquivo acaba antes de ${campo}`);
    this.pulaBrancos();
    let v = "";
    if (this.ch() === '"') {
      this.i++;
      while (!this.fim() && this.ch() !== '"' && this.ch() !== "\r" && this.ch() !== "\n")
        v += this.t[this.i++];
      if (this.ch() === '"') this.i++;
    } else {
      while (!this.fim() && this.ch() !== "," && this.ch() !== "\r" && this.ch() !== "\n")
        v += this.t[this.i++];
      v = v.trimEnd();
    }
    this.separador();
    return v;
  }

  /** INPUT # de número: brancos e linhas vazias à esquerda saem; o número vai até branco,
   *  vírgula ou fim da linha. Aceita ".15", "-3", "1E-02" e "1D-02". */
  numero(campo: string): number {
    for (;;) {
      this.pulaBrancos();
      if (!this.fimDeLinha()) break;
    }
    if (this.fim()) throw new ErroLeitura(`arquivo acaba antes de ${campo}`);
    const linha = this.linha;
    let v = "";
    while (!this.fim() && !" \t,\r\n".includes(this.ch())) v += this.t[this.i++];
    this.separador();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([ED][+-]?\d+)?$/i.test(v))
      throw new ErroLeitura(`linha ${linha}: ${campo} não é número ("${v}")`);
    return Number(v.replace(/d/i, "e"));
  }

  /** Contagem de um bloco (FOR 1 TO n): inteiro de 0 a `max`. */
  contagem(campo: string, max: number): number {
    const n = this.numero(campo);
    if (!Number.isInteger(n) || n < 0 || n > max)
      throw new ErroLeitura(
        `${campo} = ${n}: esperado inteiro de 0 a ${max} (o original pararia com erro 9)`,
      );
    return n;
  }
}

/** Lê o texto de um .EDV (decodificado em windows-1252). `nome` é o nome do arquivo,
 *  de onde saem o registro e o pavimento. Não lança: erros voltam em `erros`. */
export function lerEdv(nome: string, texto: string): LeituraEdv {
  if (/^\s*"SISTRUT40"/.test(texto))
    return {
      ok: false,
      erros: [
        "formato da reconstrução antiga do SISTRUT (cabeçalho SISTRUT40), não do SISTRUT 4.0 original",
      ],
    };
  const chave = nomeEdv(nome);
  if (!chave) return { ok: false, erros: [`nome fora do padrão R<n>_<pavimento>.EDV do DESEDCAO`] };
  try {
    return lerRegistro(chave, new EntradaQB(texto));
  } catch (e) {
    if (e instanceof ErroLeitura) return { ok: false, erros: [e.message] };
    throw e;
  }
}

/** Ordem de DESEDITA.BAS:745-880. */
function lerRegistro(chave: { registro: number; pavimento: string }, f: EntradaQB): LeituraEdv {
  const avisos: string[] = [];
  const viga = f.texto("o nome da viga");
  const comprimento = f.numero("o comprimento da viga");
  const fck = f.numero("o fck");
  const fyk = f.numero("o fyk");
  const fatorUnidade = f.numero("o multiplicador da unidade");
  const unidade = f.texto("a unidade");
  const cobrimento = f.numero("o cobrimento");
  const cobrimentoMaisAcrescimo = f.numero("o cobrimento + acréscimo");
  // o DESEDITA lê as repetições como texto e faz CINT(VAL(...)) (DESEDITA.BAS:754-756)
  const repeticoes = Math.round(Number(f.texto("as repetições")) || 0);
  const tramos = f.numero("o nº de tramos");
  const balE = f.numero("o balanço esquerdo");
  const balD = f.numero("o balanço direito");
  if (!Number.isInteger(tramos) || tramos < 1)
    throw new ErroLeitura(`nº de tramos ${tramos}: esperado inteiro ≥ 1`);
  for (const [campo, v] of [
    ["balanço esquerdo", balE],
    ["balanço direito", balD],
  ] as const)
    if (v !== 0 && v !== 1) throw new ErroLeitura(`${campo} = ${v}: esperado 0 ou 1`);
  const ultimoTrecho = tramos + balD;
  if (ultimoTrecho > MAX_TRECHOS)
    throw new ErroLeitura(
      `${tramos} tramos com balanço: mais de ${MAX_TRECHOS} trechos (o original pararia com erro 9)`,
    );

  const barras = (campo: string): BarraEditada[] =>
    Array.from({ length: f.contagem(`o nº de ${campo}`, MAX_LONGITUDINAIS) }, (_, k) => {
      const c = `${campo} ${k + 1}`;
      const [quantidade, bitola, inicio, fim] = [0, 1, 2, 3].map(() => f.numero(c)) as [
        number,
        number,
        number,
        number,
      ];
      return { quantidade, bitola, inicio, fim, dobras: [f.numero(c), f.numero(c)] };
    });
  const grampos = (campo: string): GrampoEditado[] =>
    Array.from({ length: f.contagem(`o nº de ${campo}`, MAX_GRAMPOS) }, (_, k) => {
      const c = `${campo} ${k + 1}`;
      const [quantidade, bitola, inicio, fim, lado, largura] = [0, 1, 2, 3, 4, 5].map(() =>
        f.numero(c),
      ) as [number, number, number, number, number, number];
      return { quantidade, bitola, inicio, fim, lado: lado ? "direito" : "esquerdo", largura };
    });

  const negativas = barras("negativas");
  const grampoNegativos = grampos("grampos negativos");
  const positivas = barras("positivas");
  const grampoPositivos = grampos("grampos positivos");
  const portaEstribos = Array.from(
    { length: f.contagem("o nº de porta-estribos", MAX_PORTA_ESTRIBOS) },
    (_, k): PortaEstriboEditado => {
      const c = `porta-estribo ${k + 1}`;
      return {
        quantidade: f.numero(c),
        bitola: f.numero(c),
        inicio: f.numero(c),
        fim: f.numero(c),
      };
    },
  );

  // pele: V_186E é o nº de linhas do quadro; o bloco tem sempre os trechos 0..n + balD
  const linhasPele = f.numero("a pele");
  let pele: EdicaoVigaSistrut["pele"] = null;
  if (linhasPele !== 0) {
    const trechos: PeleEditada[] = [];
    for (let t = 0; t <= ultimoTrecho; t++) {
      const c = `pele do trecho ${t}`;
      trechos.push({
        trecho: t,
        quantidadePorFace: f.numero(c),
        bitola: f.numero(c),
        inicio: f.numero(c),
        fim: f.numero(c),
      });
    }
    const trechosPorBitola = Array.from({ length: 6 }, () => f.numero("a pele por bitola"));
    pele = {
      linhas: linhasPele,
      trechos: trechos.filter((p) => p.quantidadePorFace > 0),
      trechosPorBitola,
    };
  }

  const estribos = Array.from(
    { length: f.contagem("o nº de trechos de estribos", MAX_ESTRIBOS) },
    (_, k): TrechoEstriboEditado => {
      const c = `trecho de estribos ${k + 1}`;
      const [inicio, fim, bitola, espacamento, ladoALado, secao, posicao] = [
        0, 1, 2, 3, 4, 5, 6,
      ].map(() => f.numero(c)) as [number, number, number, number, number, number, number];
      const bw = Math.floor(secao);
      return {
        inicio,
        fim,
        bitola,
        espacamento,
        ladoALado,
        bw,
        h: Math.round((secao - bw) * 10000),
        posicao,
      };
    },
  );

  // O INPUT # tira o branco de " 5E..." e o DESEDITA o devolve quando VAL(nota) ≤ 9
  // (DESEDITA.BAS:882-885); com o VAL do QB, "5D2..." vale 500 e a nota fica torta, como lá.
  const notasForma: NotaForma[] = [];
  for (let k = 2; k <= 5; k++) {
    const lida = f.texto("as notas da forma");
    if (lida === "") continue;
    const nota = qbVal(lida) > 9 ? lida : ` ${lida}`;
    const local = nota.charAt(2);
    if (local === "E" || local === "C" || local === "D")
      notasForma.push({ trecho: Number(nota.slice(0, 2)), local, texto: nota.slice(3) });
    else avisos.push(`nota da forma "${nota}" sem o local (E, C ou D): ignorada.`);
  }

  const momentosPositivos: number[] = [];
  for (let t = 0; t <= ultimoTrecho; t++) momentosPositivos.push(f.numero(`o M+ do trecho ${t}`));

  // notas da armadura até o fim do arquivo (DESEDITA.BAS:871-879)
  const notasArmadura: NotaArmadura[] = [];
  let lidas = 0;
  while (!f.fim()) {
    const nota = f.texto("as notas da armadura");
    lidas++;
    if (nota === "") continue;
    // posição = VAL(MID$(nota, 2, 2)), texto = MID$(nota, 4) (DESIMP.BAS:725-726)
    const posicao = qbVal(nota.slice(1, 3));
    if (posicao >= 1) notasArmadura.push({ posicao, texto: nota.slice(3) });
    else
      avisos.push(
        `nota da armadura "${nota}" sem nº de posição: ignorada, como no desenho do original (vírgula no texto da nota?).`,
      );
  }
  if (lidas > MAX_NOTAS_ARMADURA)
    avisos.push(
      `${lidas} notas da armadura: o original só tem lugar para ${MAX_NOTAS_ARMADURA} e pararia com erro 9 ao ler o arquivo.`,
    );

  return {
    ok: true,
    avisos,
    edicao: {
      ...chave,
      viga,
      comprimento,
      materiais: { fck, fyk, fatorUnidade, unidade },
      cobrimento,
      cobrimentoMaisAcrescimo,
      repeticoes,
      tramos,
      balancoEsquerdo: balE === 1,
      balancoDireito: balD === 1,
      negativas,
      grampoNegativos,
      positivas,
      grampoPositivos,
      portaEstribos,
      pele,
      estribos,
      notasForma,
      momentosPositivos,
      notasArmadura,
    },
  };
}

/** Uma viga de um .VIG importado, para casar com os .EDV: o pavimento (nome do .VIG sem
 *  extensão), o registro (1 = a primeira viga do .VIG) e o nome. */
export interface VigaDoVig {
  pavimento: string;
  registro: number;
  nome: string;
}

export type CasamentoEdv =
  | { ok: true; arquivo: string; viga: VigaDoVig; edicao: EdicaoVigaSistrut }
  | { ok: false; arquivo: string; aviso: string };

/** Casa cada .EDV lido com a viga do registro dele no .VIG do pavimento cujo nome começa
 *  pelos 4 caracteres do arquivo (como o DESEDITA monta o nome, DESEDITA.BAS:745). Recusa
 *  com aviso o .EDV sem viga, o de pavimento ambíguo (dois .VIG com os mesmos 4 primeiros
 *  caracteres gravam o mesmo .EDV no original) e o de nome diferente do da viga do
 *  registro (o .VIG mudou depois da edição). */
export function casarEdv(
  edicoes: readonly { arquivo: string; edicao: EdicaoVigaSistrut }[],
  vigas: readonly VigaDoVig[],
): CasamentoEdv[] {
  const prefixo = (p: string) => p.slice(0, 4).toUpperCase();
  return edicoes.map(({ arquivo, edicao }) => {
    const pavs = [...new Set(vigas.map((v) => v.pavimento))].filter(
      (p) => prefixo(p) === edicao.pavimento,
    );
    if (pavs.length === 0)
      return {
        ok: false,
        arquivo,
        aviso: `nenhum .VIG de pavimento começado por "${edicao.pavimento}"; arquivo ignorado.`,
      };
    if (pavs.length > 1)
      return {
        ok: false,
        arquivo,
        aviso: `os pavimentos ${pavs.join(", ")} começam por "${edicao.pavimento}" e gravam o mesmo .EDV no original; não dá para saber de qual é: arquivo ignorado.`,
      };
    const pav = pavs[0] ?? "";
    const viga = vigas.find((v) => v.pavimento === pav && v.registro === edicao.registro);
    if (!viga)
      return {
        ok: false,
        arquivo,
        aviso: `o ${pav}.VIG não tem a viga do registro ${edicao.registro}; arquivo ignorado.`,
      };
    if (viga.nome.trim().toUpperCase() !== edicao.viga.trim().toUpperCase())
      return {
        ok: false,
        arquivo,
        aviso: `o registro ${edicao.registro} do ${pav}.VIG é a viga ${viga.nome}, mas a edição é da ${edicao.viga} (o .VIG mudou depois da edição?); arquivo ignorado.`,
      };
    return { ok: true, arquivo, viga, edicao };
  });
}

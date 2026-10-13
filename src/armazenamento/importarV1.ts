// Importação de uma obra da V1 (OpenStrut V1, o SISTRUT 4.0 reconstruído em QB64): o .LAJ do
// pavimento e, se vierem, o .VIG e o .COL da mesma obra viram uma Obra da V2.
// Formato: DADOS.md da V1 (repositório da V1, privado); leitura de referência na V1:
// src-reconstructed/common/SISDADOS.BM (DadAbreLeitura%, LajLe%, VigLe%, ColLe%).
//
// Unidades no arquivo da V1: planta em m, seções em cm, cargas em tf/m² (lajes)
// e tf/m (vigas). A V2 guarda planta em m, seções em cm e cargas em kN/m² e kN/m;
// a conversão de tf usa KN_POR_TF (1 tf = 9,80665 kN), a mesma do resto da V2.
//
// As vigas e os pilares da V2 saem das lajes (gerarEstrutura). Do .VIG e do .COL
// só entra o que casa com um elemento gerado: seção e carga adicional das vigas,
// seção dos pilares. Tudo o que não entra ou foge do esperado vira aviso.
import { vinculacao } from "../calculo/lajes/vinculacao";
import { tfParaKn } from "../calculo/unidades";
import { nomeLivre, novoId, obraNova, pavimentoNovo } from "../dominio/criar";
import {
  colineares,
  eixoDaViga,
  gerarEstrutura,
  mesmoPonto,
  sobreposicao,
  TOL,
  type Eixo,
} from "../dominio/gerar";
import {
  BORDOS,
  type Bordo,
  type Laje,
  type Obra,
  type Pavimento,
  type Vinculo,
} from "../dominio/obra";
import { lerObra, serializarObra } from "./arquivo";

/** Arquivo escolhido pelo usuário: nome (com extensão) e conteúdo em texto. */
export interface ArquivoV1 {
  nome: string;
  texto: string;
}

export type ImportacaoV1 =
  | { ok: true; obra: Obra; avisos: string[] }
  | { ok: false; erros: string[] };

/** Erro de leitura que encerra a importação, com mensagem para o usuário. */
class ErroV1 extends Error {}

// ------------------------------------------------- arquivo sequencial do QB --

/** Um campo de um arquivo sequencial: texto entre aspas ou valor sem aspas (número). */
export interface CampoQB {
  valor: string;
  aspas: boolean;
  /** Linha do arquivo, a partir de 1 (para as mensagens). */
  linha: number;
}

/** Campos de um arquivo gravado com WRITE # do QuickBASIC, na ordem em que o
 *  INPUT # os lê: separados por vírgula ou fim de linha, texto entre aspas
 *  (sem escape: a V1 não grava aspas dentro de texto), número sem aspas com
 *  ponto decimal (".1"). O Ctrl+Z de fim de arquivo do DOS encerra a leitura. */
export function camposQB(texto: string): CampoQB[] {
  const fimDos = texto.indexOf("\u001a");
  const linhas = (fimDos >= 0 ? texto.slice(0, fimDos) : texto).split(/\r\n|\r|\n/);
  const campos: CampoQB[] = [];
  const branco = (c: string | undefined) => c === " " || c === "\t";
  linhas.forEach((l, i) => {
    const linha = i + 1;
    if (l.trim() === "") return;
    let p = 0;
    for (;;) {
      while (branco(l[p])) p++;
      if (l[p] === '"') {
        const fim = l.indexOf('"', p + 1);
        if (fim < 0) throw new ErroV1(`linha ${linha}: texto sem a aspa de fechamento.`);
        campos.push({ valor: l.slice(p + 1, fim), aspas: true, linha });
        p = fim + 1;
        while (branco(l[p])) p++;
        if (p < l.length && l[p] !== ",")
          throw new ErroV1(`linha ${linha}: esperada uma vírgula depois do texto, veio "${l[p]}".`);
      } else {
        const virgula = l.indexOf(",", p);
        const fim = virgula < 0 ? l.length : virgula;
        campos.push({ valor: l.slice(p, fim).trim(), aspas: false, linha });
        p = fim;
      }
      if (p >= l.length) break;
      p++; // a vírgula
    }
  });
  return campos;
}

/** Número como o WRITE # grava: ".1", "-2.5", "1E-05" ou "1D+02" (double). */
const NUMERO_QB = /^[+-]?(\d+\.?\d*|\.\d+)([EeDd][+-]?\d+)?$/;

/** Texto de campo de tamanho fixo da V1, sem os brancos e NULs de preenchimento. */
const limpa = (s: string) => s.replaceAll("\u0000", " ").trim();

/** Lê os campos em sequência, como o INPUT #, e explica o que faltou ou veio errado. */
class Leitor {
  private i = 0;
  private readonly campos: CampoQB[];

  constructor(
    readonly arquivo: string,
    texto: string,
  ) {
    try {
      this.campos = camposQB(texto);
    } catch (e) {
      throw new ErroV1(`${arquivo}, ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  get fim() {
    return this.i >= this.campos.length;
  }

  /** Linha do próximo campo (para citar no aviso). */
  get linha() {
    return this.campos[this.i]?.linha ?? 0;
  }

  private proximo(oQue: string) {
    const c = this.campos[this.i++];
    if (!c)
      throw new ErroV1(`${this.arquivo}: arquivo truncado ou corrompido: acabou sem ${oQue}.`);
    return c;
  }

  texto(oQue: string) {
    const c = this.proximo(oQue);
    if (!c.aspas)
      throw new ErroV1(
        `${this.arquivo}, linha ${c.linha}: ${oQue}: esperado um texto entre aspas, veio ${c.valor || "nada"}.`,
      );
    return c.valor;
  }

  numero(oQue: string) {
    const c = this.proximo(oQue);
    if (c.aspas || !NUMERO_QB.test(c.valor))
      throw new ErroV1(
        `${this.arquivo}, linha ${c.linha}: ${oQue}: esperado um número, veio ${c.aspas ? `"${c.valor}"` : c.valor || "nada"}.`,
      );
    return Number(c.valor.replace(/[dD]/, "e"));
  }

  inteiro(oQue: string, minimo = 0) {
    const n = this.numero(oQue);
    if (!Number.isInteger(n) || n < minimo)
      throw new ErroV1(
        `${this.arquivo}: ${oQue}: esperado um inteiro maior ou igual a ${minimo}, veio ${n}.`,
      );
    return n;
  }
}

type TipoV1 = "LAJ" | "VIG" | "COL";

/** Cabeçalho "SISTRUT40","<TIPO>",1,"<obra>"; devolve o nome da obra (V1 DadAbreLeitura%). */
function cabecalho(l: Leitor, tipo: TipoV1) {
  const recusa = (veio: string) =>
    new ErroV1(
      `${l.arquivo}: não é um .${tipo} da V1: o cabeçalho deveria ser "SISTRUT40","${tipo}",1,"<obra>" e veio ${veio}. A V1 também recusa este arquivo ("Arquivo invalido ou de outra versao").`,
    );
  let s1: string, s2: string, versao: number, obra: string;
  try {
    s1 = l.texto("o cabeçalho");
    s2 = l.texto("o tipo do cabeçalho");
    versao = l.numero("a versão do cabeçalho");
    obra = l.texto("o nome da obra no cabeçalho");
  } catch (e) {
    throw recusa(e instanceof Error ? `outra coisa (${e.message})` : "outra coisa");
  }
  if (s1 !== "SISTRUT40" || s2 !== tipo || versao !== 1)
    throw recusa(`"${s1}","${s2}",${versao},"${obra}"`);
  return limpa(obra);
}

// ------------------------------------------------------------ leitura -------

interface LajeV1 {
  nome: string;
  linha: number;
  x0: number;
  y0: number;
  lx: number;
  ly: number;
  h: number;
  bordos: string;
  g: number;
  q: number;
  /** Viga de apoio de cada bordo (esquerdo, inferior, direito, superior); "-" = nenhuma. */
  vigas: string[];
}

/** Resultado do LAJECALC (bloco RES): espessura, carga total e reações por bordo. */
interface ResV1 {
  h: number;
  p: number;
  reacoes: number[];
}

interface LajV1 {
  arquivo: string;
  obra: string;
  nivel: number;
  lajes: LajeV1[];
  res: Map<string, ResV1>;
}

/** .LAJ (V1 LajLe%): nível, lajes e, se houver, o bloco RES. */
function lerLaj(a: ArquivoV1, avisos: string[]): LajV1 {
  const l = new Leitor(a.nome, a.texto);
  const obra = cabecalho(l, "LAJ");
  const nivel = l.inteiro("o nível");
  const n = l.inteiro("o número de lajes");
  const lajes: LajeV1[] = [];
  for (let i = 1; i <= n; i++) {
    const linha = l.linha;
    const nome = limpa(l.texto(`o nome da laje ${i}`));
    const campo = (c: string) => l.numero(`${c} da laje ${nome || i}`);
    const x0 = campo("x0");
    const y0 = campo("y0");
    const lx = campo("lx");
    const ly = campo("ly");
    const h = campo("h");
    const bordos = l.texto(`os bordos da laje ${nome || i}`);
    const g = campo("g");
    const q = campo("q");
    const vigas = l
      .texto(`as vigas da laje ${nome || i}`)
      .split("/")
      .map(limpa);
    lajes.push({ nome, linha, x0, y0, lx, ly, h, bordos, g, q, vigas });
  }
  const res = new Map<string, ResV1>();
  if (!l.fim) {
    const linha = l.linha;
    const marca = l.texto("o bloco de resultados");
    const k = l.inteiro("o número de lajes do bloco RES");
    if (marca !== "RES") {
      avisos.push(
        `${a.nome}, linha ${linha}: depois das lajes veio "${marca}" em vez do bloco "RES"; o resto do arquivo foi ignorado.`,
      );
    } else {
      if (k > n)
        throw new ErroV1(
          `${a.nome}: o bloco RES tem ${k} lajes e o arquivo só ${n} (a V1 recusa: "Bloco de resultados maior que o numero de lajes").`,
        );
      for (let j = 1; j <= k; j++) {
        const nome = limpa(l.texto(`o nome da laje ${j} do bloco RES`));
        const r = Array.from({ length: 19 }, (_, c) =>
          l.numero(`o campo ${c + 2} da laje ${nome} no bloco RES`),
        );
        res.set(nome, { h: r[0] ?? 0, p: r[1] ?? 0, reacoes: r.slice(15, 19) });
      }
      if (!l.fim) avisos.push(`${a.nome}, linha ${l.linha}: dados depois do bloco RES ignorados.`);
    }
  }
  return { arquivo: a.nome, obra, nivel, lajes, res };
}

interface ApoioV1 {
  nome: string;
  x: number;
  y: number;
}
interface TramoV1 {
  vao: number;
  qPerm: number;
  qAcid: number;
  concentradas: number;
}
interface VigaV1 {
  nome: string;
  linha: number;
  bw: number;
  h: number;
  apoios: ApoioV1[];
  tramos: TramoV1[];
}
interface VigV1 {
  arquivo: string;
  obra: string;
  nivel: number;
  vigas: VigaV1[];
}

/** .VIG (V1 VigLe% com tipo "VIG"). */
function lerVig(a: ArquivoV1): VigV1 {
  const l = new Leitor(a.nome, a.texto);
  const obra = cabecalho(l, "VIG");
  const nivel = l.inteiro("o nível");
  const nv = l.inteiro("o número de vigas");
  const vigas: VigaV1[] = [];
  for (let v = 1; v <= nv; v++) {
    const linha = l.linha;
    const nome = limpa(l.texto(`o nome da viga ${v}`));
    const nTramos = l.inteiro(`o número de tramos da viga ${nome}`, 1);
    const bw = l.numero(`bw da viga ${nome}`);
    const h = l.numero(`h da viga ${nome}`);
    const apoios = Array.from({ length: nTramos + 1 }, (_, k) => ({
      nome: limpa(l.texto(`o apoio ${k + 1} da viga ${nome}`)),
      x: l.numero(`x do apoio ${k + 1} da viga ${nome}`),
      y: l.numero(`y do apoio ${k + 1} da viga ${nome}`),
    }));
    const tramos = Array.from({ length: nTramos }, (_, t) => {
      const c = (campo: string) => l.numero(`${campo} do tramo ${t + 1} da viga ${nome}`);
      const tramo = { vao: c("o vão"), qPerm: c("qPerm"), qAcid: c("qAcid"), concentradas: 0 };
      tramo.concentradas = l.inteiro(
        `o número de cargas concentradas do tramo ${t + 1} da viga ${nome}`,
      );
      for (let k = 1; k <= tramo.concentradas; k++) {
        c(`a distância da carga concentrada ${k}`);
        c(`a carga concentrada ${k}`);
      }
      return tramo;
    });
    vigas.push({ nome, linha, bw, h, apoios, tramos });
  }
  return { arquivo: a.nome, obra, nivel, vigas };
}

interface NivelV1 {
  nome: string;
  peDireito: number;
}
interface ColunaV1 {
  nome: string;
  linha: number;
  secao: string;
  bx: number;
  by: number;
  x: number;
  y: number;
}
interface ColV1 {
  arquivo: string;
  obra: string;
  niveis: NivelV1[];
  colunas: ColunaV1[];
}

/** .COL (V1 ColLe%). Os esforços e armaduras por nível são lidos e descartados. */
function lerCol(a: ArquivoV1): ColV1 {
  const l = new Leitor(a.nome, a.texto);
  const obra = cabecalho(l, "COL");
  const nn = l.inteiro("o número de níveis");
  const nc = l.inteiro("o número de colunas");
  const niveis = Array.from({ length: nn }, (_, k) => {
    const nome = limpa(l.texto(`o nome do nível ${k + 1}`));
    l.numero(`a cota do nível ${nome}`);
    return { nome, peDireito: l.numero(`o pé-direito do nível ${nome}`) };
  });
  const colunas = Array.from({ length: nc }, (_, c): ColunaV1 => {
    const linha = l.linha;
    const nome = limpa(l.texto(`o nome da coluna ${c + 1}`));
    const coluna = {
      nome,
      linha,
      secao: limpa(l.texto(`a seção da coluna ${nome}`)).toUpperCase(),
      bx: l.numero(`bx da coluna ${nome}`),
      by: l.numero(`by da coluna ${nome}`),
      x: l.numero(`x da coluna ${nome}`),
      y: l.numero(`y da coluna ${nome}`),
    };
    for (let k = 1; k <= nn; k++)
      for (let f = 1; f <= 10; f++) l.numero(`o campo ${f} do nível ${k} da coluna ${nome}`);
    return coluna;
  });
  return { arquivo: a.nome, obra, niveis, colunas };
}

// ------------------------------------------------------------ conversão -----

const fmt = (n: number) => String(Number(n.toFixed(4)));
const ponto = (x: number, y: number) => `(${fmt(x)}; ${fmt(y)})`;
const extensao = (nome: string) => nome.slice(nome.lastIndexOf(".") + 1).toUpperCase();

/** Letra de bordo da V1 → vínculo da V2. Qualquer outra letra (branco, NUL de campo
 *  nunca preenchido) a V1 lê como apoiado (SISDADOS.BM LajBordosGrava$). */
const VINCULO_V1: Record<string, Vinculo> = { E: "engastado", A: "apoiado", L: "livre" };

/** Lajes do .LAJ → lajes da V2. Os vínculos E/A que a V2 detecta sozinha ficam
 *  automáticos; os diferentes (ex.: engaste trocado por apoio no LAJECALC) e os
 *  livres ficam forçados. Laje sem geometria ou com carga negativa fica de fora. */
function converterLajes(laj: LajV1, avisos: string[]) {
  const lajes: Laje[] = [];
  const pares: { laje: Laje; v1: LajeV1; vinculos: Record<Bordo, Vinculo> }[] = [];
  for (const v1 of laj.lajes) {
    const onde = `${laj.arquivo}, linha ${v1.linha}`;
    const nome =
      v1.nome || nomeLivre("L", [...laj.lajes.map((x) => x.nome), ...lajes.map((x) => x.nome)]);
    if (!v1.nome) avisos.push(`${onde}: laje sem nome; importada como ${nome}.`);
    else if (laj.lajes.filter((x) => x.nome === v1.nome).length > 1)
      avisos.push(`${onde}: há mais de uma laje chamada ${v1.nome}; renomeie na V2.`);
    if (!(v1.lx > 0 && v1.ly > 0)) {
      avisos.push(
        `${onde}: laje ${nome} com lx = ${fmt(v1.lx)} m e ly = ${fmt(v1.ly)} m; precisa ser maior que zero. Laje NÃO importada.`,
      );
      continue;
    }
    if (v1.g < 0 || v1.q < 0) {
      avisos.push(
        `${onde}: laje ${nome} com carga negativa (g = ${fmt(v1.g)} tf/m², q = ${fmt(v1.q)} tf/m²). Laje NÃO importada.`,
      );
      continue;
    }
    let h = v1.h;
    if (h < 0) {
      avisos.push(`${onde}: laje ${nome} com h = ${fmt(h)} cm. Laje NÃO importada.`);
      continue;
    }
    if (h === 0) {
      const hRes = laj.res.get(v1.nome)?.h ?? 0;
      h = hRes > 0 ? hRes : 10;
      avisos.push(
        hRes > 0
          ? `${onde}: laje ${nome} com h = 0 (a calcular); usado o h = ${fmt(h)} cm que o LAJECALC gravou no bloco RES.`
          : `${onde}: laje ${nome} com h = 0 (a calcular) e sem resultado no bloco RES; adotado h = 10 cm. Confira a espessura.`,
      );
    }
    const estranhos: string[] = [];
    const lido = (k: number) => {
      const letra = (v1.bordos[k] ?? "").toUpperCase();
      const v = VINCULO_V1[letra];
      if (!v) estranhos.push(`${BORDOS[k]} (${limpa(letra) === "" ? "em branco" : `"${letra}"`})`);
      return v ?? "apoiado";
    };
    const vinculos: Record<Bordo, Vinculo> = {
      esquerdo: lido(0),
      inferior: lido(1),
      direito: lido(2),
      superior: lido(3),
    };
    if (estranhos.length > 0)
      avisos.push(
        `${onde}: laje ${nome}, bordos sem letra A/E/L: ${estranhos.join(", ")}; lidos como apoiado, como a V1 faz.`,
      );
    const laje: Laje = {
      id: novoId(),
      nome,
      x: v1.x0,
      y: v1.y0,
      lx: v1.lx,
      ly: v1.ly,
      h,
      revestimento: tfParaKn(v1.g),
      sobrecarga: tfParaKn(v1.q),
      vinculos: {},
      // O .LAJ não guarda a ortotropia: na V1 a relação entre esforços (tela 3.8) vale
      // só na sessão (LAJECALC.BAS DirecaoArmadura: "TLaje nao tem campo"). Isótropa.
      mu: 1,
    };
    for (const b of BORDOS) if (vinculos[b] === "livre") laje.vinculos[b] = "livre";
    lajes.push(laje);
    pares.push({ laje, v1, vinculos });
  }

  // E/A: só força o que a V2 não detectaria igual
  const detectados = vinculacao(lajes);
  for (const { laje, vinculos } of pares) {
    const auto = detectados[laje.id];
    for (const b of BORDOS) {
      const v = vinculos[b];
      if (v === "livre" || auto?.[b] === v) continue;
      laje.vinculos[b] = v;
      avisos.push(
        `Laje ${laje.nome}, bordo ${b}: na V1 ${v}, a V2 detectaria ${auto?.[b] ?? "?"} pela vizinhança; ficou ${v} (forçado).`,
      );
    }
  }
  return lajes;
}

/** Eixo da viga da V1: reta dos apoios, do primeiro ao último. */
function eixoV1(v: VigaV1): Eixo | undefined {
  const a = v.apoios[0];
  const b = v.apoios[v.apoios.length - 1];
  if (!a || !b) return undefined;
  return eixoDaViga({
    id: "",
    nome: "",
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    bw: 0,
    h: 0,
    cargaLinear: 0,
  });
}

/** Trecho [s1, s2] do bordo k (0 esquerdo .. 3 superior) da laje, ao longo do eixo (V1 LmBordo). */
function trechoDoBordo(l: LajeV1, k: number) {
  return k % 2 === 0 ? { s1: l.y0, s2: l.y0 + l.ly } : { s1: l.x0, s2: l.x0 + l.lx };
}

/** Carga do .VIG além das reações das lajes, por tramo, em tf/m: o .VIG grava a soma
 *  (V1 LAJMONT: reação r do bordo → r(p − q)/p permanente e rq/p acidental, média no
 *  tramo). undefined se falta o bloco RES de alguma laje que apoia na viga. */
function cargaAlemDasLajes(v: VigaV1, eixo: Eixo, laj: LajV1) {
  const segmentos: { s1: number; s2: number; qp: number; qa: number }[] = [];
  for (const l of laj.lajes) {
    for (let k = 0; k < 4; k++) {
      if (l.vigas[k] !== v.nome) continue;
      const res = laj.res.get(l.nome);
      if (!res) return undefined;
      const r = res.reacoes[k] ?? 0;
      if (res.p <= 0) continue;
      segmentos.push({
        ...trechoDoBordo(l, k),
        qp: (r * (res.p - l.q)) / res.p,
        qa: (r * l.q) / res.p,
      });
    }
  }
  const s = v.apoios.map((a) => (eixo.horizontal ? a.x : a.y));
  return v.tramos.map((t, i) => {
    const a = s[i] ?? 0;
    const b = s[i + 1] ?? 0;
    const L = Math.abs(b - a);
    let qp = 0;
    let qa = 0;
    for (const g of L > 0 ? segmentos : []) {
      const ov = sobreposicao(Math.min(a, b), Math.max(a, b), g.s1, g.s2);
      qp += (g.qp * ov) / L;
      qa += (g.qa * ov) / L;
    }
    return { perm: t.qPerm - qp, acid: t.qAcid - qa };
  });
}

/** Diferença de carga desprezível, tf/m (0,1 kgf/m). */
const TOL_CARGA = 1e-4;

/** Seção e carga adicional das vigas do .VIG nas vigas geradas pela V2 (casadas por eixo). */
function aplicarVigas(pav: Pavimento, vig: VigV1, laj: LajV1, avisos: string[]): Pavimento {
  const vigas = pav.vigas.map((v) => ({ ...v }));
  const usadas = new Set<string>();
  let semRes = false;
  for (const v1 of vig.vigas) {
    const onde = `${vig.arquivo}, linha ${v1.linha}: viga ${v1.nome}`;
    const eixo = eixoV1(v1);
    if (!eixo) {
      avisos.push(`${onde} não é horizontal nem vertical; NÃO importada.`);
      continue;
    }
    const alvo = vigas
      .filter((v) => !usadas.has(v.id))
      .map((v) => {
        const e = eixoDaViga(v);
        return {
          v,
          e,
          ov: e && colineares(e, eixo) ? sobreposicao(e.s1, e.s2, eixo.s1, eixo.s2) : 0,
        };
      })
      .filter((c) => c.ov > TOL)
      .sort((a, b) => b.ov - a.ov)[0];
    const trecho = `${ponto(...xy(eixo, eixo.s1))} → ${ponto(...xy(eixo, eixo.s2))}`;
    if (!alvo || !alvo.e) {
      avisos.push(
        `${onde} ${trecho} não coincide com nenhuma viga que a V2 gerou a partir das lajes; seção e cargas NÃO importadas.`,
      );
      continue;
    }
    const { v, e } = alvo;
    usadas.add(v.id);
    if (v.nome !== v1.nome) avisos.push(`${onde} corresponde à ${v.nome} da V2.`);
    if (Math.abs(e.s1 - eixo.s1) > TOL || Math.abs(e.s2 - eixo.s2) > TOL)
      avisos.push(
        `${onde} vai de ${trecho} e a ${v.nome} gerada pela V2 de ${ponto(...xy(e, e.s1))} → ${ponto(...xy(e, e.s2))}; seção aplicada à viga inteira. Confira.`,
      );
    if (v1.bw > 0 && v1.h > 0) {
      v.bw = v1.bw;
      v.h = v1.h;
    } else {
      avisos.push(
        `${onde} com seção ${fmt(v1.bw)} × ${fmt(v1.h)} cm; precisa ser maior que zero. Ficou a seção inicial ${v.bw} × ${v.h} cm.`,
      );
    }
    const conc = v1.tramos.reduce((n, t) => n + t.concentradas, 0);
    if (conc > 0)
      avisos.push(
        `${onde}: ${conc} carga(s) concentrada(s) NÃO importada(s): a V2 não tem carga concentrada em viga.`,
      );
    const alem = cargaAlemDasLajes(v1, eixo, laj);
    if (!alem) {
      semRes = true;
      continue;
    }
    const perm = alem.map((c) => c.perm);
    const acid = alem.map((c) => c.acid);
    const lista = (xs: number[]) => xs.map((x) => `${fmt(x)} tf/m`).join("; ");
    if (acid.some((q) => Math.abs(q) > TOL_CARGA))
      avisos.push(
        `${onde}: carga acidental além das lajes por tramo (${lista(acid)}) NÃO importada: a carga linear da V2 é permanente.`,
      );
    if (perm.every((g) => Math.abs(g) <= TOL_CARGA)) continue;
    const min = Math.min(...perm);
    const max = Math.max(...perm);
    if (min > TOL_CARGA && max - min <= TOL_CARGA) {
      v.cargaLinear = tfParaKn((min + max) / 2);
      avisos.push(
        `${onde}: carga permanente de ${fmt((min + max) / 2)} tf/m além das lajes importada como carga linear (${fmt(v.cargaLinear)} kN/m).`,
      );
    } else {
      avisos.push(
        `${onde}: carga permanente além das lajes por tramo (${lista(perm)}) NÃO importada: a V2 só tem uma carga linear positiva por viga.`,
      );
    }
  }
  if (semRes)
    avisos.push(
      `${laj.arquivo} sem o bloco RES de alguma laje: não dá para separar, no ${vig.arquivo}, a reação das lajes da carga adicional; cargas das vigas NÃO importadas (a V2 recalcula a reação das lajes).`,
    );
  for (const v of vigas)
    if (!usadas.has(v.id))
      avisos.push(
        `${v.nome} gerada pela V2 não está no ${vig.arquivo}; ficou com a seção inicial ${v.bw} × ${v.h} cm.`,
      );
  return { ...pav, vigas };
}

function xy(e: Eixo, s: number): [number, number] {
  return e.horizontal ? [s, e.c] : [e.c, s];
}

/** Seção das colunas do .COL nos pilares gerados pela V2 (casados pela posição, ±1 mm). */
function aplicarPilares(pav: Pavimento, col: ColV1, avisos: string[]): Pavimento {
  const pilares = pav.pilares.map((p) => ({ ...p }));
  const usados = new Set<string>();
  for (const c of col.colunas) {
    const onde = `${col.arquivo}, linha ${c.linha}: pilar ${c.nome} em ${ponto(c.x, c.y)}`;
    const p = pilares.find((q) => !usados.has(q.id) && mesmoPonto(q, c));
    if (!p) {
      avisos.push(`${onde} não coincide com nenhum pilar que a V2 gerou; NÃO importado.`);
      continue;
    }
    usados.add(p.id);
    if (p.nome !== c.nome) avisos.push(`${onde} corresponde ao ${p.nome} da V2.`);
    if (c.secao === "C") {
      avisos.push(
        `${onde}: seção circular (diâmetro ${fmt(c.bx)} cm) NÃO importada: a V2 só tem pilar retangular. Ficou ${p.b} × ${p.h} cm.`,
      );
    } else if (c.secao !== "R") {
      avisos.push(`${onde}: tipo de seção "${c.secao}" desconhecido; ficou ${p.b} × ${p.h} cm.`);
    } else if (c.bx > 0 && c.by > 0) {
      p.b = c.bx;
      p.h = c.by;
    } else {
      avisos.push(
        `${onde}: seção ${fmt(c.bx)} × ${fmt(c.by)} cm; precisa ser maior que zero. Ficou ${p.b} × ${p.h} cm.`,
      );
    }
  }
  for (const p of pilares)
    if (!usados.has(p.id))
      avisos.push(
        `${p.nome} em ${ponto(p.x, p.y)}, gerado pela V2, não está no ${col.arquivo}; ficou com ${p.b} × ${p.h} cm.`,
      );
  return { ...pav, pilares };
}

/** Pontas de viga em balanço: apoio "-" na extremidade (V1 VcCaso%). */
function pontasEmBalanco(vig: VigV1) {
  return vig.vigas.flatMap((v) =>
    [v.apoios[0], v.apoios.at(-1)]
      .filter((a) => a?.nome === "-")
      .map((a) => ({ viga: v.nome, ponto: { x: a?.x ?? 0, y: a?.y ?? 0 } })),
  );
}

/** Ponta "-" do .VIG vira ponta livre (balanço) da viga gerada: a posição entra em
 *  pilaresRemovidos e a V2 não cria pilar ali, como a V1 calcula (sem isso o balanço
 *  viraria um tramo apoiado num pilar fictício). Avisa o que entrou e o que não. */
function avisarBalancos(
  balancos: ReturnType<typeof pontasEmBalanco>,
  pav: Pavimento,
  avisos: string[],
) {
  for (const { viga, ponto: p } of balancos) {
    const aplicado = pav.pilaresRemovidos.some((r) => mesmoPonto(r, p));
    avisos.push(
      aplicado
        ? `Viga ${viga}: apoio "-" em ${ponto(p.x, p.y)} importado como balanço (ponta livre, sem pilar).`
        : `Viga ${viga}: apoio "-" em ${ponto(p.x, p.y)} não é ponta nem cruzamento de viga gerada pela V2; balanço NÃO importado. Confira.`,
    );
  }
}

const mesmaObra = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

function importar(arquivos: readonly ArquivoV1[]): ImportacaoV1 {
  const avisos: string[] = [];
  const doTipo = (t: TipoV1) => arquivos.filter((a) => extensao(a.nome) === t);
  const unico = (t: TipoV1) => {
    const lista = doTipo(t);
    if (lista.length > 1)
      throw new ErroV1(
        `Selecione um .${t} só (vieram ${lista.map((a) => a.nome).join(", ")}): cada .LAJ da V1 é um pavimento de uma obra.`,
      );
    return lista[0];
  };
  const arqLaj = unico("LAJ");
  if (!arqLaj)
    throw new ErroV1("Selecione o arquivo .LAJ da obra (e, se quiser, o .VIG e o .COL dela).");
  const arqVig = unico("VIG");
  const arqCol = unico("COL");
  for (const a of arquivos)
    if (!["LAJ", "VIG", "COL"].includes(extensao(a.nome)))
      avisos.push(`${a.nome} ignorado: só .LAJ, .VIG e .COL são importados.`);

  const laj = lerLaj(arqLaj, avisos);
  let vig = arqVig && lerVig(arqVig);
  if (vig && !mesmaObra(vig.obra, laj.obra)) {
    avisos.push(
      `${vig.arquivo} é da obra "${vig.obra}" e o .LAJ da obra "${laj.obra}"; ${vig.arquivo} ignorado.`,
    );
    vig = undefined;
  } else if (vig && vig.nivel !== laj.nivel) {
    avisos.push(
      `${vig.arquivo} é do nível ${vig.nivel} e o .LAJ do nível ${laj.nivel}; ${vig.arquivo} ignorado.`,
    );
    vig = undefined;
  }
  let col = arqCol && lerCol(arqCol);
  if (col && !mesmaObra(col.obra, laj.obra)) {
    avisos.push(
      `${col.arquivo} é da obra "${col.obra}" e o .LAJ da obra "${laj.obra}"; ${col.arquivo} ignorado.`,
    );
    col = undefined;
  }

  const obra = obraNova(laj.obra || "Obra da V1", "nb1-78");
  avisos.push(
    `Materiais: os arquivos .LAJ, .VIG e .COL não guardam fck, aço nem cobrimentos (na V1 ficam no .LAP e nos .INI); usados os padrões da NB-1/78 da V2: fck ${obra.materiais.fck} MPa, ${obra.materiais.aco}, cobrimentos ${obra.materiais.cobrimentoLaje}/${obra.materiais.cobrimentoViga}/${obra.materiais.cobrimentoPilar} cm (laje/viga/pilar), aço classe ${obra.materiais.classeAco}. A ortotropia das lajes (relação entre esforços da V1) também não fica no .LAJ: μ = 1 (isótropa). Confira.`,
  );

  // pavimento: nome e pé-direito do nível do .COL (nível 1 = o mais alto, como no .LAJ)
  const nivel = col?.niveis[laj.nivel - 1];
  if (col && col.niveis.length > 1)
    avisos.push(
      `${col.arquivo} tem ${col.niveis.length} níveis; o .LAJ é o nível ${laj.nivel}. Só esse pavimento foi importado.`,
    );
  let peDireito = nivel?.peDireito ?? 3;
  if (!nivel)
    avisos.push(
      `Sem o nível ${laj.nivel} no .COL: pavimento "Nível ${laj.nivel}" com pé-direito de 3 m. Confira.`,
    );
  else if (!(peDireito > 0)) {
    avisos.push(`Nível ${nivel.nome} com pé-direito ${fmt(peDireito)} m; adotado 3 m. Confira.`);
    peDireito = 3;
  }
  const base = pavimentoNovo(nivel?.nome || `Nível ${laj.nivel}`, peDireito);

  const lajes = converterLajes(laj, avisos);
  if (lajes.length === 0) throw new ErroV1(`${laj.arquivo}: nenhuma laje pôde ser importada.`);
  const balancos = vig ? pontasEmBalanco(vig) : [];
  let pav = gerarEstrutura({ ...base, lajes, pilaresRemovidos: balancos.map((b) => b.ponto) });
  if (vig) avisarBalancos(balancos, pav, avisos);
  if (vig) pav = aplicarVigas(pav, vig, laj, avisos);
  if (col) pav = aplicarPilares(pav, col, avisos);
  if (laj.res.size > 0 || col)
    avisos.push(
      "Resultados gravados pela V1 (bloco RES do .LAJ, esforços e armaduras do .COL) não são importados: a V2 recalcula a obra.",
    );

  // a obra importada tem de ser um arquivo válido da V2
  const lida = lerObra(serializarObra({ ...obra, pavimentos: [pav] }));
  if (!lida.ok)
    return { ok: false, erros: ["A obra convertida não é válida na V2:", ...lida.erros] };
  return { ok: true, obra: lida.obra, avisos };
}

/** Importa a obra da V1 a partir do .LAJ (obrigatório) e do .VIG e do .COL da
 *  mesma obra (opcionais). Nunca lança: erro de leitura volta em `erros`. */
export function importarV1(arquivos: readonly ArquivoV1[]): ImportacaoV1 {
  try {
    return importar(arquivos);
  } catch (e) {
    if (e instanceof ErroV1) return { ok: false, erros: [e.message] };
    return {
      ok: false,
      erros: [`Erro inesperado ao importar: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

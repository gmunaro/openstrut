/// <reference types="node" />
// Importação da parte de viga contra o oráculo (o SISTRUT 4.0 no DOSBox-X): os arquivos
// que o próprio original gravou (.VIG, .SEC, .FOR; o .DSP do caso) viram uma obra da V2
// por `importarVigasSistrut`, o motor roda no modo original e os números de viga batem com
// o que o original imprimiu (meia unidade da última casa impressa):
// - análise do VIGA (opções 2 e 7) e .REP: caso_b_viga, v2par_viga_fluxo, v2par_viga_r6;
// - análise do DESDIM (o DESCALC com o .DSP), dimensionamento, detalhamento (quadro de
//   ferros), .TAB e resumo do DESENHO: v2par_des_3tramos, v2par_des_2tramos,
//   v2par_des_especial e os retrad_des_* (V1 da obra E2E).
// Gerar: só o .VIG/.SEC/.FOR/.DSP, sem a planta. Completar: as obras E2E e VBX da V2
// (`__e2e__/`) com os arquivos do original por cima.
// Arquivos: C:/tmp/oraculo/runs/<run>/obra/ (gravados pelo original no run do caso ou no
// run que gerou a obra de partida: E2E.VIG no caso_a_laje, ASS.VIG no v2par_laje_assim) e
// o V2P.DSP de C:/tmp/oraculo/casos/v2par_des_especial.dados/ (o .DSP que o caso leu).
// Índice dos casos: C:/wt/v1-v2par/tests/retraducao/V2PAR.md. Esperados:
// C:/tmp/v2-paridade/oraculo-novos/v2par_<caso>.json (nos des_*, a cópia com a fonte do
// cobrimento corrigida, C:/wt/v1-par2/paridade/casos/) e os JSON de src/calculo/sistrut/.
// Sem os runs na máquina, o teste é pulado.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bateComImpresso,
  type CasoOraculo,
  type ValorOraculo,
} from "../../calculo/sistrut/__oraculo__";
import { obraE2E } from "../../calculo/sistrut/__e2e__/obraE2E";
import { obraVBX } from "../../calculo/sistrut/__e2e__/obraVBX";
import { qbInt } from "../../calculo/sistrut/base/f32";
import { KN_POR_TF } from "../../calculo/sistrut/base/unidades";
import {
  calcularObraSistrut,
  type ResultadoSistrut,
  type VigaSistrut,
} from "../../calculo/sistrut/obra";
import { pesoNoDesenho, resumoGeralVigas } from "../../calculo/sistrut/quant/vigas";
import { analisaDescalc } from "../../calculo/sistrut/vigas/desinitDescalc";
import { textoMep } from "../../calculo/sistrut/vigas/vicalc";
import quadros from "../../calculo/sistrut/vigas/__desinit__/v2par_des_quadros.json";
import { materiaisPadrao } from "../../dominio/criar";
import type { Obra } from "../../dominio/obra";
import { lerObra, serializarObra } from "../arquivo";
import { importarVigasSistrut, type ArquivoSistrut } from "./viga";

const RUNS = "C:/tmp/oraculo/runs";
const DADOS = "C:/tmp/oraculo/casos";
const NOVOS = "C:/tmp/v2-paridade/oraculo-novos";
const CORRIGIDOS = "C:/wt/v1-par2/paridade/casos";
const REPO = join(import.meta.dirname, "../../calculo/sistrut");

const RUN = {
  casoA: `${RUNS}/caso_a_laje-20261015-041425`,
  casoB: `${RUNS}/caso_b_viga-20261014-182718`,
  vbx: `${RUNS}/v2par_viga_fluxo-20261015-164332`,
  r6: `${RUNS}/v2par_viga_r6-20261015-184612`,
  assim: `${RUNS}/v2par_laje_assim-20261015-163200`,
  des3: `${RUNS}/v2par_des_3tramos-20261015-165027`,
  des2: `${RUNS}/v2par_des_2tramos-20261015-165207`,
  esp: `${RUNS}/v2par_des_especial-20261015-171646`,
  det: `${RUNS}/retrad_des_det-20261015-082506`,
  p5: `${RUNS}/retrad_des_p5-20261015-082948`,
  p6: `${RUNS}/retrad_des_p6-20261015-082952`,
  menu: `${RUNS}/retrad_des_menu-20261015-082520`,
  p10: `${RUNS}/retrad_des_p10-20261015-082955`,
};
const E2E_VIG = `${RUN.casoA}/obra/E2E.VIG`;
const ASS_VIG = `${RUN.assim}/obra/ASS.VIG`;

const arquivo = (caminho: string): ArquivoSistrut => ({
  nome: caminho.slice(caminho.lastIndexOf("/") + 1),
  dados: new Uint8Array(readFileSync(caminho)),
});
const json = (caminho: string): CasoOraculo => JSON.parse(readFileSync(caminho, "utf8"));

function importa(caminhos: readonly string[], obra?: Obra) {
  const r = importarVigasSistrut(caminhos.map(arquivo), obra);
  if (!r.ok) throw new Error(r.erros.join("\n"));
  return r;
}

// ---------------------------------------------------------------- valores do motor

type Valor = number | string | undefined;
const ROTULOS = ["4", "5", "6.3", "8", "10", "12.5", "16", "20", "25", "32"];
type Campos = Record<string, Valor>;

/** Análise do VIGA (opções 2 e 7): <viga>.a<k>.*, <viga>.t<k>.*, com "max."/"min." da
 *  envoltória de acidentais. O balanço direito é o tramo n + 1 e o esquerdo o 0. */
function analiseVIGA(r: ResultadoSistrut, id: string): Valor {
  const p = r.pavimentos[0]!;
  const m = /^([A-Z]+\d+)\.(.+)$/.exec(id);
  if (!m) return undefined;
  const [, nome, resto = ""] = m;
  const a = p.analises.find((x) => x.nome === nome);
  if (!a) return undefined;
  if (resto === "somaR") return a.somaReacoes;
  if (resto === "MEP0") return textoMep(a.mepEsquerdo, r.modo);
  if (resto === `MEP${a.tramos.length}`) return textoMep(a.mepDireito, r.modo);
  const ap = /^a(\d+)\.(max\.|min\.)?(M-|R)$/.exec(resto);
  if (ap) {
    const x = a.apoios[Number(ap[1])];
    if (!x) return undefined;
    if (ap[2] === "max.") return ap[3] === "R" ? x.rMax : x.mMax;
    if (ap[2] === "min.") return ap[3] === "R" ? x.rMin : undefined;
    return ap[3] === "R" ? x.r : x.m;
  }
  const ep = /^t(\d+)\.EEP\.(Ve|x|M\+|Vd)$/.exec(resto);
  if (ep) {
    const l = a.engastamentoPerfeito.find((e) => e.tramo === Number(ep[1]));
    const c: Campos = { Ve: l?.ve, x: l?.x, "M+": l?.mPositivo, Vd: l?.vd };
    return c[ep[2]!];
  }
  const tr = /^t(\d+)\.(max\.)?(Ve|x|M\+|Vd|fEJ)$/.exec(resto);
  if (!tr) return undefined;
  const k = Number(tr[1]);
  const n = a.tramos.length;
  if (k === n + 1 && tr[3] === "Ve" && !tr[2]) return a.balancoDireito?.carga;
  if (k === 0 && tr[3] === "Vd" && !tr[2]) return a.balancoEsquerdo?.carga;
  const t = a.tramos[k - 1];
  const e = tr[2] ? t?.envoltoria : t;
  const c: Campos = { Ve: e?.ve, x: e?.x, "M+": e?.mPositivo, Vd: e?.vd, fEJ: e?.fEJ };
  return c[tr[3]!];
}

/** Dados da viga como o VIGA e o DESDIM os imprimem: <viga>.t<k>.L/J/P/D/F/Pac/Fac e
 *  <viga>.t<k>.d<i>.* (divisão i), do .VIG depois do VIGA. */
function dadosImpressos(r: ResultadoSistrut, id: string): Valor {
  const m = /^([A-Z]+\d+)\.t(\d+)\.(?:d(\d+)\.)?(L|J|P|D|F|Pac|Fac)$/.exec(id);
  if (!m) return undefined;
  const dados = r.pavimentos[0]!.vigasVig.find((x) => x.nome === m[1]);
  if (!dados) return undefined;
  const k = Number(m[2]);
  const n = dados.tramos.length;
  const t =
    k === 0 ? dados.balancoEsquerdo : k === n + 1 ? dados.balancoDireito : dados.tramos[k - 1];
  const dv = t?.divisoes[Number(m[3] ?? 1) - 1];
  const c: Campos = {
    L: t?.vao,
    J: t?.inercia,
    P: dv?.p,
    D: dv?.d,
    F: dv?.f,
    Pac: dv?.pAcidental,
    Fac: dv?.fAcidental,
  };
  return c[m[4]!];
}

/** Linhas do .REP (REP.* da impressão, REParq.* do arquivo). */
function rep(r: ResultadoSistrut, id: string): Valor {
  const m = /^REP(?:arq)?\.(P\d+)(?:\.(carga|momento)\.(\w+))?$/.exec(id);
  if (!m) return undefined;
  const linha = r.pavimentos[0]!.rep.find((l) => l.pilar === m[1]);
  if (!linha) return undefined;
  if (!m[2]) return linha.total;
  if (m[2] === "carga") return linha.parcelas.find((x) => x.viga === m[3])?.texto;
  return linha.momentos.find((x) => x.viga === m[3])?.texto;
}

/** Análise que o DESDIM imprime: o DESCALC sobre a entrada que o motor montou (o .VIG
 *  editado, as seções e o .DSP da obra), como em vigas/desinitV2par.test.ts. */
function analiseDESDIM(v: VigaSistrut, resto: string): Valor {
  const c = analisaDescalc(v.entrada, "original");
  const imp = c.impressaoDescalc!;
  const n = c.v0ddc;
  if (resto === "somaR") {
    let soma = 0;
    for (let k = 0; k <= n; k++) soma += imp.reacao.g(k);
    return soma;
  }
  if (resto === "MEP0") return qbInt(imp.mep.g(0) * 100) / 100;
  if (resto === `MEP${n}`) return qbInt(imp.mep.g(1) * 100) / 100;
  const ap = /^a(\d+)\.(max\.|min\.)?(M-|R)$/.exec(resto);
  if (ap) {
    const k = Number(ap[1]);
    if (ap[2] === "max.") return ap[3] === "R" ? imp.reacaoEnvoltoria.g(k, 0) : c.a16de.g(k);
    if (ap[2] === "min.") return ap[3] === "R" ? imp.reacaoEnvoltoria.g(k, 1) : undefined;
    return ap[3] === "R" ? imp.reacao.g(k) : c.a15ca.g(k);
  }
  const ep = /^t(\d+)\.EEP\.(Ve|x|M\+|Vd)$/.exec(resto);
  if (ep) {
    for (let i = 1; i <= c.v1176; i++) {
      if (c.a11d6.g(i) !== Number(ep[1])) continue;
      const x: Campos = {
        Ve: c.a1204.g(i, 0),
        x: c.a117a.g(i),
        "M+": c.a11a8.g(i),
        Vd: c.a1204.g(i, 1),
      };
      return x[ep[2]!];
    }
    return undefined;
  }
  const tr = /^t(\d+)\.(max\.)?(Ve|x|M\+|Vd)$/.exec(resto);
  if (!tr) return undefined;
  const t = Number(tr[1]);
  if (t === 0 && tr[3] === "Vd" && !tr[2]) return c.a1654.g(0, 1);
  if (t === n + 1 && tr[3] === "Ve" && !tr[2]) return c.a1654.g(n + 1, 0);
  if (t < 1 || t > n) return undefined;
  if (!tr[2]) {
    const x: Campos = {
      Ve: c.a1654.g(t, 0),
      x: c.a15f8.g(t),
      "M+": c.a1626.g(t),
      Vd: c.a1654.g(t, 1),
    };
    return x[tr[3]!];
  }
  // DESDIM.BAS:6370-6380: o maior em módulo entre o cortante máximo e o mínimo
  const ve = Math.abs(c.a1796.g(t, 3)) > c.a1796.g(t, 0) ? c.a1796.g(t, 3) : c.a1796.g(t, 0);
  const vd = Math.abs(c.a1796.g(t, 4)) > c.a1796.g(t, 1) ? c.a1796.g(t, 4) : c.a1796.g(t, 1);
  const x: Campos = { Ve: ve, x: c.a173a.g(t), "M+": c.a1768.g(t), Vd: vd };
  return x[tr[3]!];
}

/** Fissuração da tela: MID$(STR$(w), 1, 6), o menor dos dois, em décimos de mm. */
const fissura = (f: { w1: number; w2: number } | undefined) =>
  f && Math.trunc(Math.min(f.w1, f.w2) * 10_000) / 1000;

/** Dimensionamento do DESDIM, nas duas convenções de ids (v2par: Ast, Aee, estriboE;
 *  retrad: As-, Asw.e, estribo.e). */
function dimensionamento(v: VigaSistrut, resto: string): Valor {
  const d = v.dimensionamento;
  if (!d) return undefined;
  if (resto === "cobrimento") return v.entrada.parametros.cobrimento;
  if (resto === "estribo.bitolaMaxima") return d.bitolasEstribo.maxima;
  if (resto === "estribo.bitolaMinima") return d.bitolasEstribo.minima;
  const ap = /^a(\d+)\.(x\/d|Mk-?|Ast|As-|Asc|barras-?|fissura)$/.exec(resto);
  if (ap) {
    const a = d.apoios[Number(ap[1])];
    if (!a?.dimensionado) return undefined;
    const c: Campos = {
      "x/d": a.xd,
      Mk: a.mk,
      "Mk-": a.mk,
      Ast: a.as,
      "As-": a.as,
      Asc: a.asCompressao,
      barras: a.arranjo,
      "barras-": a.arranjo,
      fissura: fissura(a.fissuracao),
    };
    return c[ap[2]!];
  }
  const tr = /^t(\d+)\.(.+)$/.exec(resto);
  if (!tr) return undefined;
  const t = [d.balancoEsquerdo, ...d.tramos, d.balancoDireito].find(
    (x) => x?.indice === Number(tr[1]),
  );
  if (!t) return undefined;
  const ci = t.cisalhamento;
  const c: Campos = {
    "x/d": t.flexao.xd,
    Mk: t.flexao.mk,
    "Mk+": t.flexao.mk,
    Ast: t.flexao.as,
    "As+": t.flexao.as,
    Asc: t.flexao.asCompressao,
    barras: t.flexao.arranjo,
    "barras+": t.flexao.arranjo,
    flecha: t.flecha,
    Vke: ci.vkEsquerda,
    Vkd: ci.vkDireita,
    Aee: ci.aswEsquerda,
    "Asw.e": ci.aswEsquerda,
    Aed: ci.aswDireita,
    "Asw.d": ci.aswDireita,
    estriboE: ci.estriboEsquerda.texto,
    "estribo.e": ci.estriboEsquerda.texto,
    estriboD: ci.estriboDireita.texto,
    "estribo.d": ci.estriboDireita.texto,
    fissura: fissura(t.fissuracao),
  };
  return c[tr[2]!];
}

/** Detalhamento (retrad_des_det): as linhas do quadro de ferros (tabela.N<k>.*), as
 *  posições N<k> (achadas pela linha do quadro: bitola, quantidade e comprimento), os
 *  trechos de estribo, o quadro do .TAB por bitola e os dados de forma impressos. */
function detalhamento(v: VigaSistrut, caso: CasoOraculo, resto: string): Valor {
  if (resto === "secao") {
    const s = v.entrada.secoes.tramos[0];
    return s && `${s.bw},${s.hw},${s.bf},${s.hf}`;
  }
  let m = /^t(\d+)\.(vaoCalculo|vaoLivre)$/.exec(resto);
  if (m) {
    const k = Number(m[1]) - 1;
    return m[2] === "vaoCalculo"
      ? (v.entrada.viga.tramos[k]?.vao ?? 0) * 100
      : v.entrada.forma.tramos[k]?.vaoLivre;
  }
  const d = v.detalhamento;
  const q = v.quadro;
  if (!d || !q) return undefined;
  const impresso = (x: string) =>
    caso.valores.find((y) => y.id === `${v.nome}.${x}`)?.impresso ?? "";
  const posicaoN = (k: string) => {
    const bitola = Number(impresso(`tabela.N${k}.bitola`));
    const qtd = Number(impresso(`tabela.N${k}.Q`));
    const uni = Number(impresso(`tabela.N${k}.UNI`));
    return d.posicoes.find(
      (p) => Math.abs(p.bitola - bitola) < 1e-4 && p.quantidade === qtd && p.comprimento === uni,
    );
  };
  const sem = "posição não encontrada no detalhamento";
  m = /^tabela\.N(\d+)\.(bitola|Q|UNI|TOTAL)$/.exec(resto);
  if (m) {
    const p = posicaoN(m[1]!);
    if (!p) return sem;
    const c: Campos = {
      bitola: Number(p.bitola.toFixed(1)),
      Q: p.quantidade,
      UNI: p.comprimento,
      TOTAL: p.quantidade * p.comprimento,
    };
    return c[m[2]!];
  }
  m = /^N(\d+)\.(barras|C|dobra|dobra\.e|dobra\.d)$/.exec(resto);
  if (m) {
    const p = posicaoN(m[1]!);
    if (!p) return sem;
    const c: Campos = {
      barras: `${p.quantidade}#${Number(p.bitola.toFixed(1))}`,
      C: p.comprimento,
      dobra: p.dobras[0] || p.dobras[1],
      "dobra.e": p.dobras[0],
      "dobra.d": p.dobras[1],
    };
    return c[m[2]!];
  }
  m = /^t(\d+)\.estribo\.(n|s|trecho)$/.exec(resto);
  if (m) {
    if (d.trechosEstribo.length !== v.entrada.viga.tramos.length) return undefined;
    const t = d.trechosEstribo[Number(m[1]) - 1];
    const c: Campos = { n: t?.quantidade, s: t?.espacamento, trecho: t && t.fim - t.inicio };
    return c[m[2]!];
  }
  m = /^quadro\.phi([\d.]+)\.(comprimento|peso|aco)$/.exec(resto);
  if (m) {
    const i = ROTULOS.indexOf(m[1]!);
    if (m[2] === "aco")
      return `${i <= v.entrada.parametros.ordemMaximaCA60 ? 60 : 50}${v.entrada.materiais.classeAco}`;
    // o quadro do desenho (DESIMP) arredonda o peso para cima no meio quilo
    const comprimento = q.comprimentoPorBitola[i] ?? 0;
    return m[2] === "comprimento"
      ? comprimento
      : pesoNoDesenho(comprimento, v.entrada.parametros.bitolas[i]!.kgPorM);
  }
  return undefined;
}

/** Parâmetros que o DESENHO imprime (param.*), da entrada do DESDIM. */
function parametro(v: VigaSistrut, id: string): Valor {
  const p = v.entrada.parametros;
  const mat = v.entrada.materiais;
  const sn = (b: boolean) => (b ? "S" : "N");
  const m = /^param\.resumo\.bitola\.(\d+)$/.exec(id);
  if (m) return p.bitolas[Number(m[1]) - 1]?.bitola;
  const c: Campos = {
    "param.fck": mat.fck,
    "param.concreto": mat.fck,
    "param.fyk": mat.fyk,
    "param.aco": mat.fyk,
    "param.aco.tipo": mat.classeAco,
    "param.tipoAco": mat.classeAco,
    "param.cobrimento": p.cobrimento,
    "param.reducaoNegativos": p.reducaoNegativos * 100,
    "param.alivioCortante": sn(p.alivioCortante),
    "param.cargasAcidentais": sn(p.acidentaisEnvoltoria),
    "param.momentosExternos": sn(p.momentosExternos),
  };
  return c[id];
}

/** Resumo do DESENHO (item 4) sobre os quadros das vigas que o original detalhou (as do
 *  .TAB do caso). Ids v2par (resumo.<viga>.comp.<φ>, resumo.peso.<φ>) e retrad
 *  (<viga>.resumo.phi<φ>.comprimento, resumo.phi<φ>.peso). */
function resumo(r: ResultadoSistrut, vigas: readonly string[], id: string): Valor {
  const qs = r.quadros.filter((q) => vigas.includes(q.nome));
  if (qs.length === 0) return undefined;
  const s = resumoGeralVigas(qs, r.parametros.dsp, "original");
  const rot = (b: string) => ROTULOS.indexOf(b);
  const total = { volume: s.volume, forma: s.forma };
  const porViga = (nome: string) =>
    nome === "total" ? total : s.porViga.find((x) => x.nome === nome);
  let m =
    /^resumo\.\w+\.comp\.([\d.]+)$/.exec(id) ??
    /^(?:\w+\.)?resumo\.phi([\d.]+)\.comprimento$/.exec(id);
  if (m) return s.comprimentoPorBitola[rot(m[1]!)];
  m = /^resumo\.peso\.([\d.]+)$/.exec(id) ?? /^resumo\.phi([\d.]+)\.peso$/.exec(id);
  if (m) return s.pesoPorBitola[rot(m[1]!)];
  m = /^resumo\.(\w+)\.(Vconc|Afor)$/.exec(id);
  if (m) return m[2] === "Vconc" ? porViga(m[1]!)?.volume : porViga(m[1]!)?.forma;
  m = /^(\w+)\.resumo\.(volume|forma)$/.exec(id);
  if (m) return m[2] === "volume" ? porViga(m[1]!)?.volume : porViga(m[1]!)?.forma;
  m = /^resumo\.(volume|forma)$/.exec(id);
  if (m) return m[1] === "volume" ? total.volume : total.forma;
  m = /^resumo\.(\w+)\.rept$/.exec(id) ?? /^(\w+)\.resumo\.rept$/.exec(id);
  if (m) {
    const nome = m[1];
    return Math.max(1, qs.find((q) => q.nome === nome)?.repeticoes ?? 0);
  }
  return undefined;
}

/** .TAB que o original gravou (70 bytes por viga: nome, A_1CEC(0..14) em SINGLE,
 *  DESINIT.BAS:933): volume e fôrma em centésimos e o comprimento por bitola. */
function tabDoRun(caminho: string) {
  const b = readFileSync(caminho);
  const lista: { nome: string; volume: number; forma: number; comprimentos: number[] }[] = [];
  for (let r = 0; (r + 1) * 70 <= b.length; r++) {
    const x = b.subarray(r * 70, (r + 1) * 70);
    if (x.every((c) => c === 0)) continue;
    const f = (i: number) => x.readFloatLE(10 + 4 * i);
    lista.push({
      nome: x.toString("latin1", 0, 10).trim().replace(/^~/, ""),
      volume: f(1),
      forma: f(2),
      comprimentos: Array.from({ length: 10 }, (_, i) => f(5 + i)),
    });
  }
  return lista;
}

// ---------------------------------------------------------------- conferência

interface Caso {
  nome: string;
  /** Arquivos que existem quando o caso roda (os runs). */
  requer: string[];
  /** Arquivos do original importados. */
  arquivos: string[];
  /** Obra da V2 a completar (sem ela, a importação gera a obra). */
  obra?: () => Obra;
  /** Obra montada à mão, quando o original não gravou arquivo (v2par_viga_r6). */
  obraPronta?: () => Obra;
  oraculo: string;
  /** "VIGA": a análise impressa é a do VIGA; "DESDIM": a do DESCALC do DESDIM. */
  analise: "VIGA" | "DESDIM";
  /** Vigas que o original detalhou (as do .TAB). */
  detalhadas: string[];
  tab?: string;
  quadro?: keyof typeof quadros;
  /** Ids que não são de viga ou que o motor não produz, e por quê. */
  ignorar: [RegExp, string][];
  minimo: number;
}

const LAJES_E_MONTAGEM: [RegExp, string][] = [
  [/^L\d/, "laje (LAJECALC/LAJEPROC/LAJEMONT): não é entrada do .VIG"],
  [/^total\./, "totais do LAJEMONT: não são entrada do .VIG"],
  [/^V\d\.t\d\.(pp|ppViga|alv)$/, "quadro de alvenarias do LAJEMONT: não é entrada do .VIG"],
];
const DESENHO_DXF: [RegExp, string][] = [
  [/\.N\d\.cota$/, "cota do desenho (DESIMP/DXF): posição gráfica, o motor não desenha"],
  [/\.forma\.(a|t)\d\.barras$/, "anotação da elevação no desenho (DESIMP)"],
  [/\.corteA\./, "corte A do desenho (DESIMP): dimensões gráficas"],
  [/\.t\d\.eixo$/, "eixo do .FOR: entrada do DESINIT que vem do .FOR, não é saída do motor"],
  [/^param\.(parametrizacao|desenhoDefinitivo)$/, "texto da tela do DESENHO, não é número"],
];

function calculado(r: ResultadoSistrut, c: Caso, oraculo: CasoOraculo, id: string): Valor {
  const pav = r.pavimentos[0]!;
  const viga = (nome: string) => pav.vigas.find((v) => v.nome === nome);
  const m = /^(?:imp\.)?([A-Z]+\d+)\.(.+)$/.exec(id);
  const v = m ? viga(m[1]!) : viga(c.detalhadas[0] ?? "");
  const resto = m?.[2] ?? "";
  return (
    dadosImpressos(r, id) ??
    (c.analise === "VIGA" ? analiseVIGA(r, id) : v && m ? analiseDESDIM(v, resto) : undefined) ??
    rep(r, id) ??
    (v && m ? dimensionamento(v, resto) : undefined) ??
    (v && m ? detalhamento(v, oraculo, resto) : undefined) ??
    (v ? parametro(v, id) : undefined) ??
    resumo(r, c.detalhadas, id)
  );
}

function confere(r: ResultadoSistrut, c: Caso, oraculo: CasoOraculo) {
  const faltando: string[] = [];
  const difere: string[] = [];
  let conferidos = 0;
  for (const x of oraculo.valores as ValorOraculo[]) {
    if (c.ignorar.some(([re]) => re.test(x.id))) continue;
    const v = calculado(r, c, oraculo, x.id);
    if (v === undefined) {
      faltando.push(x.id);
      continue;
    }
    conferidos++;
    const ok = typeof v === "string" ? v.trim() === x.impresso.trim() : bateComImpresso(x, v);
    if (!ok) difere.push(`${x.id}: impresso ${x.impresso}, calculado ${v}`);
  }
  return { faltando, difere, conferidos };
}

/** v2par_viga_r6: a VR6 foi digitada no VIGA e o original não gravou o .VIG (o run não
 *  tem obra/). A obra repete o roteiro (C:/tmp/oraculo/casos/v2par_viga_r6.txt): opção 8
 *  com acidentais S geradas a 150 %; tramos de 4 e 5 m com J 1 e P = 2 t/m digitado (a
 *  acidental sai do %). */
function obraR6(): Obra {
  const pilar = (nome: string, x: number) => ({ id: nome, nome, x, y: 0, b: 20, h: 20 });
  return {
    versao: 3,
    nome: "R6",
    norma: "nb1-78",
    modoCalculo: "original",
    materiais: materiaisPadrao("nb1-78"),
    parametrosViga: {
      viga: { acidentais: true, acidentalGerada: true, porcentagemAcidentalGerada: 150 },
    },
    pavimentos: [
      {
        id: "pav",
        nome: "Pavimento 1",
        peDireito: 3,
        repeticoes: 1,
        lajes: [],
        pilares: [pilar("P1", 0), pilar("P2", 4), pilar("P3", 9)],
        pilaresRemovidos: [],
        vigas: [
          {
            id: "VR6",
            nome: "VR6",
            x1: 0,
            y1: 0,
            x2: 9,
            y2: 0,
            bw: 20,
            h: 50,
            cargaLinear: 0,
            somenteCargasProprias: true,
            inercias: [1, 1],
            cargas: [0, 1].map((trecho) => ({
              tipo: "distribuida" as const,
              trecho,
              inicio: 0,
              fim: trecho === 0 ? 4 : 5,
              total: 2 * KN_POR_TF,
            })),
          },
        ],
      },
    ],
  };
}

const CASOS: Caso[] = [
  {
    nome: "caso_b_viga, gerada do E2E.VIG",
    requer: [E2E_VIG, RUN.casoB],
    arquivos: [E2E_VIG],
    oraculo: join(REPO, "__oraculo__/caso_b_viga.json"),
    analise: "VIGA",
    detalhadas: [],
    ignorar: [],
    minimo: 250,
  },
  {
    nome: "caso_b_viga, obra E2E completada com o E2E.VIG",
    requer: [E2E_VIG, RUN.casoB],
    arquivos: [E2E_VIG],
    obra: () => obraE2E("original"),
    oraculo: join(REPO, "__oraculo__/caso_b_viga.json"),
    analise: "VIGA",
    detalhadas: [],
    ignorar: [],
    minimo: 250,
  },
  {
    nome: "v2par_viga_fluxo, gerada do VBX.VIG regravado pelo VIGA",
    requer: [`${RUN.vbx}/obra/VBX.VIG`, `${NOVOS}/v2par_viga_fluxo.json`],
    arquivos: [`${RUN.vbx}/obra/VBX.VIG`],
    oraculo: `${NOVOS}/v2par_viga_fluxo.json`,
    analise: "VIGA",
    detalhadas: [],
    ignorar: LAJES_E_MONTAGEM,
    minimo: 110,
  },
  {
    nome: "v2par_viga_fluxo, obra VBX completada com o VBX.VIG",
    requer: [`${RUN.vbx}/obra/VBX.VIG`, `${NOVOS}/v2par_viga_fluxo.json`],
    arquivos: [`${RUN.vbx}/obra/VBX.VIG`],
    obra: () => obraVBX("original"),
    oraculo: `${NOVOS}/v2par_viga_fluxo.json`,
    analise: "VIGA",
    detalhadas: [],
    ignorar: LAJES_E_MONTAGEM,
    minimo: 110,
  },
  {
    nome: "v2par_viga_r6 (obra do roteiro: o original não gravou .VIG)",
    requer: [RUN.r6, `${NOVOS}/v2par_viga_r6.json`],
    arquivos: [],
    obraPronta: obraR6,
    oraculo: `${NOVOS}/v2par_viga_r6.json`,
    analise: "VIGA",
    detalhadas: [],
    ignorar: [],
    minimo: 56,
  },
  {
    nome: "v2par_des_3tramos (ASS.VIG; ASS.SEC/.FOR do run)",
    requer: [ASS_VIG, `${RUN.des3}/obra/ASS.SEC`, `${CORRIGIDOS}/v2par_des_3tramos.json`],
    arquivos: [ASS_VIG, `${RUN.des3}/obra/ASS.SEC`, `${RUN.des3}/obra/ASS.FOR`],
    oraculo: `${CORRIGIDOS}/v2par_des_3tramos.json`,
    analise: "DESDIM",
    detalhadas: ["V1"],
    tab: `${RUN.des3}/obra/ASS.TAB`,
    quadro: "v2par_des_3tramos",
    ignorar: [],
    minimo: 128,
  },
  {
    nome: "v2par_des_2tramos (ASS.VIG; ASS.SEC/.FOR do run)",
    requer: [ASS_VIG, `${RUN.des2}/obra/ASS.SEC`, `${CORRIGIDOS}/v2par_des_2tramos.json`],
    arquivos: [ASS_VIG, `${RUN.des2}/obra/ASS.SEC`, `${RUN.des2}/obra/ASS.FOR`],
    oraculo: `${CORRIGIDOS}/v2par_des_2tramos.json`,
    analise: "DESDIM",
    detalhadas: ["V5"],
    tab: `${RUN.des2}/obra/ASS.TAB`,
    quadro: "v2par_des_2tramos",
    ignorar: [],
    minimo: 96,
  },
  {
    nome: "v2par_des_especial (DSX.VIG/.SEC/.FOR do run e V2P.DSP)",
    requer: [`${RUN.esp}/obra/DSX.VIG`, `${CORRIGIDOS}/v2par_des_especial.json`],
    arquivos: [
      `${RUN.esp}/obra/DSX.VIG`,
      `${RUN.esp}/obra/DSX.SEC`,
      `${RUN.esp}/obra/DSX.FOR`,
      `${DADOS}/v2par_des_especial.dados/V2P.DSP`,
    ],
    oraculo: `${CORRIGIDOS}/v2par_des_especial.json`,
    analise: "DESDIM",
    detalhadas: ["D1"],
    tab: `${RUN.esp}/obra/DSX.TAB`,
    quadro: "v2par_des_especial",
    ignorar: [],
    minimo: 159,
  },
  ...(["gerada", "obra E2E completada"] as const).map((modo): Caso => ({
    nome: `retrad_des_det, ${modo} (E2E.VIG; E2E.SEC/.FOR do run)`,
    requer: [E2E_VIG, `${RUN.det}/obra/E2E.SEC`],
    arquivos: [E2E_VIG, `${RUN.det}/obra/E2E.SEC`, `${RUN.det}/obra/E2E.FOR`],
    ...(modo === "gerada" ? {} : { obra: () => obraE2E("original") }),
    oraculo: join(REPO, "__oraculo__/retrad_des_det.json"),
    analise: "DESDIM",
    detalhadas: ["V1"],
    tab: `${RUN.det}/obra/E2E.TAB`,
    ignorar: DESENHO_DXF,
    minimo: 110,
  })),
  ...(
    [
      ["retrad_des_p5", RUN.p5, "vigas/__desdim__/retrad_des_p5.json", 2],
      ["retrad_des_p6", RUN.p6, "vigas/__desdim__/retrad_des_p6.json", 27],
    ] as const
  ).map(([nome, r, oraculo, minimo]): Caso => ({
    nome: `${nome} (E2E.VIG; E2E.SEC/.FOR do run)`,
    requer: [E2E_VIG, `${r}/obra/E2E.SEC`],
    arquivos: [E2E_VIG, `${r}/obra/E2E.SEC`, `${r}/obra/E2E.FOR`],
    oraculo: join(REPO, oraculo),
    analise: "DESDIM",
    detalhadas: ["V1"],
    ignorar: [],
    minimo,
  })),
  ...(
    [
      ["retrad_des_menu", RUN.menu, "__oraculo__/retrad_des_menu.json", 50],
      ["retrad_des_p10", RUN.p10, "vigas/__desinit__/retrad_des_p10.json", 13],
    ] as const
  ).map(([nome, r, oraculo, minimo]): Caso => ({
    nome: `${nome} (E2E.VIG, .SEC e .FOR da obra de partida, gravados pelo det)`,
    requer: [r, `${DADOS}/${nome}.dados/E2E.SEC`],
    arquivos: [
      `${DADOS}/${nome}.dados/E2E.VIG`,
      `${DADOS}/${nome}.dados/E2E.SEC`,
      `${DADOS}/${nome}.dados/E2E.FOR`,
    ],
    oraculo: join(REPO, oraculo),
    analise: "DESDIM",
    detalhadas: ["V1"],
    tab: `${DADOS}/${nome}.dados/E2E.TAB`,
    ignorar: DESENHO_DXF,
    minimo,
  })),
];

describe.each(CASOS)("$nome", (c) => {
  const tem = existsSync(RUNS) && c.requer.every((x) => existsSync(x)) && existsSync(c.oraculo);
  if (!tem) {
    it.skip("pulado: sem os runs do oráculo na máquina", () => {});
    return;
  }
  const imp = c.obraPronta ? { obra: c.obraPronta(), avisos: [] } : importa(c.arquivos, c.obra?.());
  const r = calcularObraSistrut(imp.obra, { modo: "original" });
  const oraculo = json(c.oraculo);

  it("a obra importada passa pela validação do arquivo e volta igual", () => {
    const lida = lerObra(serializarObra(imp.obra));
    expect(lida.ok && lida.obra).toEqual(imp.obra);
  });

  it("o motor roda as vigas sem aviso", () => {
    const p = r.pavimentos[0]!;
    expect(p.naoProcessadas).toEqual([]);
    // só as vigas que o original detalhou: as outras do .VIG não têm seção no .SEC
    const detalhadas = p.vigas.filter((v) => c.detalhadas.includes(v.nome));
    expect(detalhadas.flatMap((v) => v.avisos)).toEqual([]);
    expect(p.avisos.filter((a) => a.startsWith("Viga"))).toEqual([]);
  });

  it("todos os números de viga impressos pelo original", () => {
    const { faltando, difere, conferidos } = confere(r, c, oraculo);
    expect(faltando, "ids sem valor no motor").toEqual([]);
    expect(difere).toEqual([]);
    expect(conferidos).toBeGreaterThanOrEqual(c.minimo);
  });

  if (c.tab) {
    const tab = c.tab;
    it.skipIf(!existsSync(tab))(
      ".TAB: volume, fôrma e comprimento por bitola do arquivo do original",
      () => {
        const gravado = tabDoRun(tab).filter((x) => c.detalhadas.includes(x.nome));
        expect(gravado.length).toBe(c.detalhadas.length);
        for (const g of gravado) {
          const q = r.quadros.find((x) => x.nome === g.nome);
          expect(q && [q.volumeCentesimos, q.formaCentesimos, q.comprimentoPorBitola]).toEqual([
            g.volume,
            g.forma,
            g.comprimentos,
          ]);
        }
      },
    );
  }

  if (c.quadro) {
    const esperado = quadros[c.quadro];
    it("quadro de ferros do desenho definitivo (mesmas posições, na mesma ordem)", () => {
      const v = r.pavimentos[0]!.vigas.find((x) => x.nome === c.detalhadas[0]);
      expect(
        v?.detalhamento?.posicoes.map((p) => [
          Number(p.bitola.toFixed(1)),
          p.quantidade,
          p.comprimento,
          p.quantidade * p.comprimento,
        ]),
      ).toEqual(esperado.quadro.linhas.map((l) => [l.bitola, l.quantidade, l.unitario, l.total]));
    });
  }
});

describe.skipIf(!existsSync(E2E_VIG) || !existsSync(`${RUN.vbx}/obra/VBX.VIG`))(
  "completar uma obra cuja montagem já grava o mesmo .VIG",
  () => {
    it.each([
      ["E2E", E2E_VIG, () => obraE2E("original")],
      ["VBX", `${RUN.vbx}/obra/VBX.VIG`, () => obraVBX("original")],
    ] as const)("%s: não muda as vigas nem avisa", (_n, vig, obra) => {
      const antes = obra();
      const r = importa([vig], antes);
      expect(r.avisos).toEqual([]);
      expect(r.obra.pavimentos[0]!.vigas).toEqual(antes.pavimentos[0]!.vigas);
    });
  },
);

// Valor que o motor (`calcularObraSistrut`) calcula para cada id do oráculo, na
// convenção dos ids do comparador T9 (`L1.M+princ`, `L1>V4.area`, `V1.t1.M+`,
// `REP.P5.carga.V2`, `total.painel`), e a conferência de um caso inteiro contra o
// impresso (meia unidade da última casa, ou FIX onde o original trunca). Uso: testes
// de ponta a ponta das obras importadas do .LAJ (armazenamento/sistrut/laje.test.ts).
// Os números de pavimento são os do primeiro pavimento da obra. Mesma leitura dos ids
// que `sistrut/obra.test.ts` faz para a obra E2E, com nomes de mais de um dígito
// (P10) e os ids que só os casos v2par têm (cargas lineares, tela da otimização).
import type { ResultadoSistrut } from "../obra";
import { textoMep } from "../vigas/vicalc";
import { bateComImpresso, type CasoOraculo } from "./index";

export type Valor = number | string | undefined;

type Barra = { ok: boolean } & Partial<{ bitola: number; espacamento: number }>;
const barraOk = (b: Barra) => (b.ok ? b : undefined);

function laje(r: ResultadoSistrut, id: string): Valor {
  const p = r.pavimentos[0]!;
  const m = /^(L\d+)\.(.+)$/.exec(id);
  if (!m) return undefined;
  const [, nome = "", resto = ""] = m;
  const pre = /\.(preOtim|antesOtim)$/.test(resto);
  const campo = resto.replace(/\.(preOtim|antesOtim)$/, "");
  const esf = pre ? p.esforcosAntesOtimizacao : p.esforcos;
  const mom = esf.momentos[nome];
  const arm = (pre ? p.armadurasAntesOtimizacao : p.armaduras)[nome];
  // o relatório da imposição de H (LAJECALC 4: x/d e barra) sai antes da otimização
  const armH = p.armadurasAntesOtimizacao[nome];
  // a opção 5 imprime M+ = max(M+, 0) e M− = M+·c com o sinal de M+ (no balanço sai
  // negativo; LAJECALC.BAS:124ac)
  const sinal = mom && mom.mPositivoPrincipalTcm < 0 ? -1 : 1;
  const esp = p.espessuras[nome];
  const lajeS = esf.lajes.find((l) => l.nome === nome);
  const prep = esf.preparadas[nome];
  const espOk = esp?.ok ? esp : undefined;
  const mapa: Record<string, Valor> = {
    "M+princ": mom && Math.max(mom.mPositivoPrincipalTcm, 0) / 100,
    "M+sec": mom && mom.mPositivoSecundarioTcm / 100,
    "M-maior": mom && (sinal * mom.mNegativoMaiorTcm) / 100,
    "M-menor": mom && (sinal * mom.mNegativoMenorTcm) / 100,
    "As+princ": arm?.asPositivaPrincipal,
    "As+sec": arm?.asPositivaSecundaria,
    "As-maior": arm?.asNegativaMaior,
    "As-menor": arm?.asNegativaMenor,
    H: lajeS?.h,
    // eco do H no cabeçalho da opção 5 (momentos e armaduras)
    "H.mom": mom?.h,
    "H.arm": arm?.h,
    "x/d": armH?.xd,
    "As.phi": armH && barraOk(armH.barra)?.bitola,
    "As.s": armH && barraOk(armH.barra)?.espacamento,
    pp: mom?.pesoProprio,
    p: mom?.q,
    perm: lajeS?.cargaPermanente,
    // coluna "Acid.": alvenarias e cargas por área sobre a área da laje
    acid: prep && (prep.alvenaria + prep.cargaArea) / prep.area,
    Hmin: espOk?.h,
    "Hmin.x/d": espOk?.xd,
    "Hmin.As.phi": espOk && barraOk(espOk.barra)?.bitola,
    "Hmin.As.s": espOk && barraOk(espOk.barra)?.espacamento,
    "Hmin.pp": espOk?.pesoProprio,
    "Hmin.p": espOk?.q,
    "Hmin.perm": lajeS?.cargaPermanente,
    "Hmin.acid": prep && (prep.alvenaria + prep.cargaArea) / prep.area,
    mu: lajeS?.mu,
  };
  return mapa[campo];
}

/** Tela parada da otimização (R3): `L1.otim.M`, `.As`, `.MnegMpos`, `.alteradaPara`. */
function otimizacao(r: ResultadoSistrut, id: string): Valor {
  const m = /^(L\d+)\.otim\.(M|As|MnegMpos|alteradaPara)(\.\d+s)?$/.exec(id);
  const parada = r.pavimentos[0]!.otimizacaoParada;
  if (!m || !parada) return undefined;
  if (m[2] === "alteradaPara") return parada.laje === m[1] ? parada.relacaoNova : undefined;
  const lado = parada.lados.find((l) => l.laje === m[1]);
  if (!lado) return undefined;
  return m[2] === "M" ? lado.mTcm / 100 : m[2] === "As" ? lado.as : lado.relacao;
}

/** Barras do LAJEPROC (`L1.As+princ.phi`, `L1.As-maior.s`). */
function barrasLajeproc(r: ResultadoSistrut, id: string): Valor {
  const m = /^(L\d+)\.As([+-])(princ|sec|maior|menor)\.(phi|s)$/.exec(id);
  if (!m) return undefined;
  const [, nome = "", , pos, campo] = m;
  const proc = r.pavimentos[0]!.lajeproc;
  const positiva = proc.positivas[nome];
  const negativas = proc.negativas
    .filter((n) => n.continuidade.lajeA === nome || n.continuidade.lajeB === nome)
    .sort((a, b) => b.mTcm - a.mTcm);
  const posicao =
    pos === "princ"
      ? positiva?.principal
      : pos === "sec"
        ? positiva?.secundaria
        : negativas[pos === "maior" ? 0 : 1];
  const b = posicao?.barra;
  if (!b?.ok) return undefined;
  return campo === "phi" ? b.bitola : b.espacamento;
}

/** Texto curto da barra ("#6.3c/20"), como os JSONs anotam a tela do LAJEPROC. */
const textoCurto = (b: Barra) =>
  b.ok ? `#${Number(b.bitola?.toFixed(1))}c/${Number(b.espacamento?.toFixed(1))}` : "NAO";

/** Barras do LAJEPROC em texto (`L1.proc.posPrinc`, `L1-L2.proc.neg`). */
function textoLajeproc(r: ResultadoSistrut, id: string): Valor {
  const proc = r.pavimentos[0]!.lajeproc;
  const pos = /^(L\d+)\.proc\.pos(Princ|Sec)$/.exec(id);
  if (pos) {
    const p = proc.positivas[pos[1] ?? ""];
    const b = pos[2] === "Princ" ? p?.principal.barra : p?.secundaria.barra;
    return b && textoCurto(b);
  }
  const neg = /^(L\d+)-(L\d+)\.proc\.neg$/.exec(id);
  if (!neg) return undefined;
  const n = proc.negativas.find(
    (x) =>
      (x.continuidade.lajeA === neg[1] && x.continuidade.lajeB === neg[2]) ||
      (x.continuidade.lajeA === neg[2] && x.continuidade.lajeB === neg[1]),
  );
  return n && textoCurto(n.barra);
}

/** Código final do lado k (`L1.lado3.codigo`), achado pela geometria que o original
 *  gravou (o polígono da obra pode começar em outro vértice). */
function codigoDoLado(r: ResultadoSistrut, caso: CasoOraculo, id: string): Valor {
  const m = /^(L\d+)\.lado(\d+)\.codigo$/.exec(id);
  if (!m) return undefined;
  const obra = (
    caso.entrada as {
      obra?: {
        obra_gravada_pelo_original?: {
          lajes?: Record<string, { lados: { lado: number; de: number[]; para: number[] }[] }>;
        };
      };
    }
  ).obra;
  const lado = obra?.obra_gravada_pelo_original?.lajes?.[m[1] ?? ""]?.lados.find(
    (l) => l.lado === Number(m[2]),
  );
  const laje = r.pavimentos[0]!.esforcos.lajes.find((l) => l.nome === m[1]);
  if (!lado || !laje) return undefined;
  const igual = (p: { x: number; y: number }, q: number[]) => p.x === q[0] && p.y === q[1];
  const k = laje.vertices.findIndex((v, i) => {
    const w = laje.vertices[(i + 1) % laje.vertices.length]!;
    return (igual(v, lado.de) && igual(w, lado.para)) || (igual(w, lado.de) && igual(v, lado.para));
  });
  return k < 0 ? undefined : laje.codigos[k];
}

/** Reação da laje num apoio (`L1>V4.area`, `L1>P3.qPeso`). */
function reacao(r: ResultadoSistrut, id: string): Valor {
  const m = /^(L\d+)>([VP]\d+)\.(\w+)$/.exec(id);
  if (!m) return undefined;
  const [, l, apoio = "", campo] = m;
  const reac = r.pavimentos[0]!.montagem.reacoes.find(
    (x) =>
      x.laje === l && (x.apoio.tipo === "viga" ? x.apoio.viga === apoio : x.apoio.pilar === apoio),
  );
  if (!reac) return undefined;
  const mapa: Record<string, number> = {
    area: reac.area,
    qArea: reac.cargaArea,
    qEstru: reac.estrutura,
    qPeso: reac.peso,
    qLinear: reac.linear,
  };
  return mapa[campo ?? ""];
}

function totais(r: ResultadoSistrut, id: string): Valor {
  const tt = r.pavimentos[0]!.montagem.totais;
  const lap = r.parametros.laje;
  const mapa: Record<string, Valor> = {
    "total.cargasLineares": tt.alvenariasNominal,
    "total.cargasLinearesConsiderado": tt.alvenarias,
    "total.cargasArea": tt.cargasPorAreaNominal,
    "total.cargasAreaConsiderado": tt.cargasPorArea,
    "total.ppVigas": tt.pesoProprioVigas,
    "total.ppLajes": tt.pesoProprioLajes,
    "total.estrutura": tt.estrutura,
    "total.painel": tt.painel,
    "total.vigas": tt.vigas,
    "total.pilares": tt.pilares,
    "total.vigasPilares": tt.vigas + tt.pilares,
    "param.fck": r.materiais.fck,
    "param.fyk": r.materiais.fyk,
    "param.tipoAco": r.materiais.classeAco,
    // os do .LAP: γ das lajes (LAJE 7) e os parâmetros do LAJECALC 7
    "param.cobrimento": lap.cobrimento,
    "param.cse": lap.gamaF,
    "param.csc": lap.gamaC,
    "param.csa": lap.gamaS,
    "param.eficienciaNeg": lap.eficienciaNegativa * 100,
    "param.limitaLN": lap.fracaoLinhaNeutra * 100,
    "param.densidade": lap.densidade,
    "param.relMaxNegPos": lap.relacaoNegPosMax,
    "param.relMinNegPos": lap.relacaoNegPosMin,
    "param.relCantosReentrantes": lap.relacaoCantosReentrantes,
  };
  return mapa[id];
}

/** Viga: eco do .VIG, análise do VICALC e quadro de alvenarias (`V1.t1.ppViga`). */
function viga(r: ResultadoSistrut, id: string): Valor {
  const p = r.pavimentos[0]!;
  const m = /^(V\d+)\.(.+)$/.exec(id);
  if (!m) return undefined;
  const [, nome, resto = ""] = m;
  const mont = p.montagem.vigas.find((x) => x.nome === nome);
  const alvTramo = /^t(\d+)\.(pp|ppViga|alv)$/.exec(resto);
  if (alvTramo) {
    const alv = mont?.alvenariasSobreViga?.find((x) => x.tramo === Number(alvTramo[1]));
    return alvTramo[2] === "alv" ? alv?.alvenaria : alv?.peso;
  }
  const a = p.analises.find((x) => x.nome === nome);
  const dados = p.vigasVig.find((x) => x.nome === nome);
  if (!a || !dados || !mont) return undefined;
  if (resto === "somaR") return a.somaReacoes;
  if (resto === "MEP0") return textoMep(a.mepEsquerdo, r.modo);
  if (resto === `MEP${a.tramos.length}`) return textoMep(a.mepDireito, r.modo);
  const ap = /^a(\d+)\.(M-|R)$/.exec(resto);
  if (ap) {
    const apoio = a.apoios[Number(ap[1])];
    return ap[2] === "R" ? apoio?.r : apoio?.m;
  }
  const ep = /^t(\d+)\.EEP\.(\w+\+?)$/.exec(resto);
  if (ep) {
    const linha = a.engastamentoPerfeito.find((e) => e.tramo === Number(ep[1]));
    const mapa: Record<string, Valor> = {
      Ve: linha?.ve,
      x: linha?.x,
      "M+": linha?.mPositivo,
      Vd: linha?.vd,
    };
    return mapa[ep[2] ?? ""];
  }
  const tr = /^t(\d+)\.(\w+\+?)$/.exec(resto);
  if (!tr) return undefined;
  const k = Number(tr[1]);
  // balanços: o VIGA imprime o direito como tramo n + 1 e o esquerdo como 0
  const n = a.tramos.length;
  if (k === n + 1 && tr[2] === "Ve") return a.balancoDireito?.carga;
  if (k === 0 && tr[2] === "Vd") return a.balancoEsquerdo?.carga;
  const t = a.tramos[k - 1];
  const td = k === n + 1 ? dados.balancoDireito : dados.tramos[k - 1];
  const div = td?.divisoes[0];
  const mapa: Record<string, Valor> = {
    Ve: t?.ve,
    x: t?.x,
    "M+": t?.mPositivo,
    Vd: t?.vd,
    fEJ: t?.fEJ,
    P: div?.p,
    L: td?.vao,
    J: td?.inercia,
    D: div?.d,
    F: div?.f,
  };
  return mapa[tr[2] ?? ""];
}

/** .REP: total do pilar e parcelas e momentos com o texto do original. */
function rep(r: ResultadoSistrut, id: string): Valor {
  const m = /^REP(?:arq)?\.(P\d+)(?:\.(carga|momento)\.(V\d+))?$/.exec(id);
  if (!m) return undefined;
  const [, pilar, tipo, v] = m;
  const linha = r.pavimentos[0]!.rep.find((l) => l.pilar === pilar);
  if (!linha) return undefined;
  if (!tipo) return linha.total;
  if (tipo === "carga") return linha.parcelas.find((x) => x.viga === v)?.texto;
  return linha.momentos.find((x) => x.viga === v)?.texto;
}

/** O valor calculado para o id do oráculo; undefined = o motor não o produz. */
export const valorCalculado = (r: ResultadoSistrut, id: string, caso: CasoOraculo): Valor =>
  textoLajeproc(r, id) ??
  codigoDoLado(r, caso, id) ??
  otimizacao(r, id) ??
  barrasLajeproc(r, id) ??
  laje(r, id) ??
  reacao(r, id) ??
  totais(r, id) ??
  viga(r, id) ??
  rep(r, id);

/** Confere todos os valores do caso (menos os de `ignora`): ids sem cálculo, os que
 *  diferem do impresso e quantos foram conferidos e bateram. */
export function confereCaso(
  caso: CasoOraculo,
  r: ResultadoSistrut,
  ignora: readonly RegExp[] = [],
) {
  const faltando: string[] = [];
  const difere: string[] = [];
  let conferidos = 0;
  for (const v of caso.valores) {
    if (ignora.some((re) => re.test(v.id))) continue;
    const c = valorCalculado(r, v.id, caso);
    if (c === undefined) {
      faltando.push(v.id);
      continue;
    }
    conferidos++;
    const ok = typeof c === "string" ? c.trim() === v.impresso.trim() : bateComImpresso(v, c);
    if (!ok) difere.push(`${v.id}: impresso ${v.impresso}, calculado ${c}`);
  }
  return { faltando, difere, conferidos, batem: conferidos - difere.length };
}

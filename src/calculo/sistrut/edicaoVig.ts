// O .VIG que o VIGA lê: o registro que a montagem (LAJEMONT) grava para a viga, com o
// que o usuário do original digita depois no VIGA e no DESENHO, nos campos da viga da
// obra (`Viga.cargas`, `vaos`, `inercias`, `engaste`, `momentosExternos`,
// `apoiosDesconsiderados`, `somenteCargasProprias`, `secoes`, `forma`). Unidades do
// original na saída (t, t/m, m, t·m, cm); a obra está em SI.
//
// Divisões (entrada do VIGA, L_1297b, VIGA.BAS:1030-1360): num tramo, a divisão k vale P
// de D(k−1) até D(k) e tem F concentrada em D(k), com D a partir do apoio esquerdo. No
// balanço esquerdo o registro vem da ponta livre para o apoio e D é medido a partir do
// apoio (a F de cada divisão fica do lado da ponta). Aqui cada trecho é trabalhado com a
// abscissa a partir do apoio (a ponta esquerda do trecho, ou o apoio no balanço
// esquerdo), em ordem crescente, e volta ao formato do registro no fim.
//
// Uma carga distribuída corta as divisões nas suas pontas e soma P nas divisões entre
// elas; uma concentrada corta na sua posição e soma F na divisão que termina ali. Ponto a
// menos de 4 ulps do SINGLE (no vão) de uma divisão existente cai nela: a montagem mede
// em SINGLE a partir das coordenadas. Regras da entrada do VIGA que valem aqui:
// - todo trecho tem ao menos uma divisão (o padrão da pergunta é *1*, VIGA.BAS:1240);
// - D cresce estritamente e uma divisão tem uma F só: a da carga indexada ("*n.aa") ocupa
//   a F da divisão (VIGA.BAS:1309-1312). Concentrada no ponto de uma indexada é recusada;
// - a última divisão de um tramo interno termina no vão e tem F = 0 (VIGA.BAS:1279-1283).
//   A F em cima do apoio passa para o começo (D = 0) do trecho seguinte; no último apoio
//   sem balanço não há onde pôr e ela é recusada;
// - no máximo 30 divisões na viga (V_16bc%, VIGA.BAS:1030, 1265-1270);
// - acidentais "S" com acidental "G": Pac = pct·P/100 e Fac = pct·F/100 da divisão
//   inteira, num produto só (VIGA.BAS:1294-1298), nas divisões que recebem carga sem a
//   `acidental` (as digitadas); a carga com a `acidental` informada (a do .VIG gravado, ou
//   o Pac/Fac digitado com "F") a soma à da montagem.
// O que o original recusa vira aviso e não entra no registro.
import { num, numAte } from "../texto";
import type { CargaViga, Viga } from "../../dominio/obra";
import { atribuicao, qbCint } from "./base/f32";
import type {
  ApoioFormaViga,
  DadosViga,
  DivisaoCarga,
  EixoTramoViga,
  FormaTramo,
  FormaViga,
  ModoSistrut,
  ParametrosVicalc,
  SecaoViga,
  SecoesViga,
  TramoViga,
} from "./base/tipos";
import { knmParaTm, knParaT, knPorMParaTPorM } from "./base/unidades";
import { porcentagemAcidentalGerada } from "./vigas/vicalc";

/** ulp do SINGLE em x. */
const ulpSingle = (x: number) => 2 ** (Math.floor(Math.log2(Math.max(Math.abs(x), 1e-6))) - 23);
/** Distância abaixo da qual um ponto cai numa divisão existente: 4 ulps do vão. */
const tolDivisao = (vao: number) => 4 * ulpSingle(vao);
/** Diferença máxima entre o vão digitado e o da planta, m (a tolerância de comprimento
 *  do .LAP, LAJE.BAS:121). */
const TOL_VAO = 0.005;
/** Divisões de carga por viga (V_16bc%, VIGA.BAS:1030). */
export const MAX_DIVISOES = 30;

type Tipo = "balE" | "tramo" | "balD";

/** Divisão com a abscissa do fim medida a partir do apoio. */
interface Div {
  fim: number;
  p: number;
  f: number;
  pac: number;
  fac: number;
  indexada?: DivisaoCarga["indexada"];
  /** Recebeu carga sem a acidental informada: com "G", a divisão foi digitada no VIGA e a
   *  acidental dela é a gerada. */
  digitada?: boolean;
}

/** Trechos do registro na ordem do eixo: balanço esquerdo, tramos, balanço direito. */
function trechosDe(d: DadosViga) {
  return [
    ...(d.balancoEsquerdo ? [{ tramo: d.balancoEsquerdo, tipo: "balE" as Tipo }] : []),
    ...d.tramos.map((tramo) => ({ tramo, tipo: "tramo" as Tipo })),
    ...(d.balancoDireito ? [{ tramo: d.balancoDireito, tipo: "balD" as Tipo }] : []),
  ];
}

/** Registro → divisões em ordem crescente a partir do apoio. */
function paraDivs(t: TramoViga, tipo: Tipo): Div[] {
  const lista = t.divisoes.map((dv): Div => ({
    fim: dv.d,
    p: dv.p,
    f: dv.f,
    pac: dv.pAcidental,
    fac: dv.fAcidental,
    ...(dv.indexada ? { indexada: dv.indexada } : {}),
  }));
  return tipo === "balE" ? lista.reverse() : lista;
}

/** Divisões → registro (balanço esquerdo da ponta para o apoio). */
function paraRegistro(divs: readonly Div[], tipo: Tipo): DivisaoCarga[] {
  const lista = divs.map((dv): DivisaoCarga => ({
    p: dv.p,
    d: dv.fim,
    f: dv.f,
    pAcidental: dv.pac,
    fAcidental: dv.fac,
    ...(dv.indexada ? { indexada: dv.indexada } : {}),
  }));
  return tipo === "balE" ? lista.reverse() : lista;
}

/** Corta as divisões em `x` (abscissa a partir do apoio) e devolve a abscissa usada: a de
 *  uma divisão existente se estiver a menos de `tol`. A F fica com a parte de fim. */
function corta(divs: Div[], x: number, tol: number): number {
  if (Math.abs(x) <= tol) return 0;
  let inicio = 0;
  for (let i = 0; i < divs.length; i++) {
    const dv = divs[i]!;
    if (Math.abs(dv.fim - x) <= tol) return dv.fim;
    if (x > inicio && x < dv.fim) {
      divs.splice(i, 0, { fim: x, p: dv.p, f: 0, pac: dv.pac, fac: 0 });
      return x;
    }
    inicio = dv.fim;
  }
  return x;
}

const vazia = (fim: number, p = 0): Div => ({ fim, p, f: 0, pac: 0, fac: 0 });

/** Edita o registro de uma viga com os dados da obra. Sem nenhum dado, devolve o mesmo
 *  objeto. `avisos` recebe o que não pôde ser aplicado. */
export function editaVig(
  dados: DadosViga,
  viga: Viga,
  parametros: ParametrosVicalc,
  modo: ModoSistrut,
  avisos: string[],
): DadosViga {
  const temEdicao =
    (viga.cargas?.length ?? 0) > 0 ||
    viga.somenteCargasProprias === true ||
    viga.vaos !== undefined ||
    viga.inercias !== undefined ||
    viga.engaste !== undefined ||
    viga.momentosExternos !== undefined ||
    (viga.apoiosDesconsiderados?.length ?? 0) > 0 ||
    viga.pilaresNoRep !== undefined;
  if (!temEdicao) return dados;
  const s = atribuicao(modo);
  const trechos = trechosDe(dados);
  const n = dados.tramos.length;
  const aviso = (texto: string) => avisos.push(`Viga ${viga.nome}: ${texto}`);
  /** `rotulo`: o que o usuário digitou, em pt-BR ("os vãos digitados"). */
  const confere = (rotulo: string, lista: readonly unknown[] | undefined) => {
    if (lista === undefined || lista.length === trechos.length) return lista !== undefined;
    aviso(
      `${rotulo}: ${lista.length} valores, e a viga tem ${trechos.length} trechos na planta; não usados.`,
    );
    return false;
  };
  const usaVaos = confere("os vãos digitados", viga.vaos);
  const usaInercias = confere("as inércias (J) digitadas", viga.inercias);
  for (const c of viga.cargas ?? [])
    if (c.trecho >= trechos.length)
      aviso(`carga no trecho ${c.trecho}, e a viga tem ${trechos.length} trechos: ignorada.`);
  for (const k of viga.apoiosDesconsiderados ?? [])
    if (k > n) aviso(`apoio desconsiderado ${k}, e a viga tem ${n + 1} apoios: ignorado.`);
  const gerada = parametros.acidentais && parametros.acidentalGerada;
  const pct = porcentagemAcidentalGerada(parametros, modo);
  /** Acidental digitada (modo "F"); com "G" a acidental sai da divisão inteira no fim. */
  const acidentalDe = (c: Exclude<CargaViga, { tipo: "reacao" }>) =>
    c.acidental === undefined
      ? 0
      : c.tipo === "distribuida"
        ? s(knPorMParaTPorM(c.acidental))
        : s(knParaT(c.acidental));

  const listas = trechos.map(({ tramo, tipo }, i) => {
    let vao = tramo.vao;
    let divs = paraDivs(tramo, tipo);
    // todo trecho tem ao menos uma divisão até o vão (VIGA.BAS:1240)
    if (divs.length === 0) divs = [vazia(vao)];
    if (viga.somenteCargasProprias) {
      // só as divisões que trazem a reação de uma viga apoiada; o resto sai
      const base: Div[] = divs
        .filter((dv) => dv.indexada)
        .map((dv) => ({ ...vazia(dv.fim), indexada: dv.indexada }));
      if (base.at(-1)?.fim !== vao) base.push(vazia(vao));
      divs = base;
    }
    if (usaVaos) {
      const novo = s(viga.vaos![i]!);
      if (Math.abs(novo - vao) > TOL_VAO)
        aviso(
          `o vão ${numAte(viga.vaos![i]!, 3)} m do trecho ${i} não bate com a planta (${num(vao, 3)} m): vale o da planta.`,
        );
      else {
        vao = novo;
        // divisões que terminam no novo vão ou além dele: a F delas passa para a última
        const ultima = divs.at(-1)!;
        const tol = tolDivisao(vao);
        const alem = divs.slice(0, -1).filter((dv) => dv.fim >= vao - tol);
        if (alem.some((dv) => dv.f !== 0 || dv.fac !== 0 || dv.indexada))
          aviso(
            `o vão do trecho ${i} encurtou para ${numAte(viga.vaos![i]!, 3)} m: a F das divisões no fim ou além dele passa para a última divisão.`,
          );
        for (const dv of alem) {
          ultima.f = s(ultima.f + dv.f);
          ultima.fac = s(ultima.fac + dv.fac);
          if (dv.indexada && !ultima.indexada) ultima.indexada = dv.indexada;
        }
        divs = [...divs.slice(0, -1).filter((dv) => dv.fim < vao - tol), ultima];
        ultima.fim = vao;
      }
    }
    const tol = tolDivisao(vao);
    // abscissa a partir do apoio: no balanço esquerdo o apoio é a ponta direita
    const doApoio = (u: number) => s(tipo === "balE" ? vao - u : u);
    // posições lidas de um .VIG vêm de coordenadas em SINGLE (sng(8,925) − sng(8,48) =
    // 0,44500065): no corrigido o vão em float64 fica até ~1e-6 m mais curto que a D da
    // última divisão. Até a tolerância de comprimento (TOL_VAO) além da ponta, a carga
    // vai para a ponta; dentro de `tol` nada muda
    const fora = (u: number) => u < -TOL_VAO || u > vao + TOL_VAO;
    const naPonta = (u: number) => (u < -tol ? 0 : u > vao + tol ? vao : u);
    for (const c of viga.cargas ?? []) {
      if (c.trecho !== i) continue;
      if (c.tipo === "concentrada" || c.tipo === "reacao") {
        if (fora(c.posicao)) {
          aviso(
            `carga ${c.tipo === "reacao" ? "indexada" : "concentrada"} fora do trecho ${i} (${numAte(c.posicao, 3)} m): ignorada.`,
          );
          continue;
        }
        let x = doApoio(naPonta(c.posicao));
        if (Math.abs(x) <= tol) {
          // em cima do apoio: divisão de comprimento zero no começo (P > 0 da vizinha)
          if (divs[0]!.fim !== 0) divs.unshift(vazia(0, divs[0]!.p));
          x = 0;
        } else x = corta(divs, x, tol);
        const alvo = divs.find((dv) => dv.fim === x)!;
        if (c.tipo === "reacao") {
          // "*n.aa" no F da divisão: a F é a reação da viga apoiada (VIGA.BAS:1309-1312)
          if (alvo.indexada || alvo.f !== 0 || alvo.fac !== 0) {
            aviso(
              `carga indexada da viga ${c.viga} a ${numAte(c.posicao, 3)} m do trecho ${i}: a divisão já tem F e o VIGA tem uma F por divisão. Carga ignorada.`,
            );
            continue;
          }
          alvo.indexada = { viga: c.viga, apoio: c.apoio };
          continue;
        }
        if (alvo.indexada) {
          aviso(
            `carga concentrada a ${numAte(c.posicao, 3)} m do trecho ${i}, no ponto da viga ${alvo.indexada.viga} apoiada: o VIGA tem uma F por divisão e ela é da carga indexada. Carga ignorada.`,
          );
          continue;
        }
        alvo.f = s(alvo.f + s(knParaT(c.total)));
        alvo.fac = s(alvo.fac + acidentalDe(c));
        if (c.acidental === undefined) alvo.digitada = true;
        continue;
      }
      if (fora(c.inicio) || fora(c.fim)) {
        aviso(
          `carga distribuída fora do trecho ${i} (${numAte(c.inicio, 3)} a ${numAte(c.fim, 3)} m): ignorada.`,
        );
        continue;
      }
      const [a, b] = [doApoio(naPonta(c.inicio)), doApoio(naPonta(c.fim))].sort(
        (x, y) => x - y,
      ) as [number, number];
      const xa = corta(divs, a, tol);
      const xb = corta(divs, b, tol);
      const total = s(knPorMParaTPorM(c.total));
      const ac = acidentalDe(c);
      let inicio = 0;
      for (const dv of divs) {
        if (inicio >= xa && dv.fim <= xb && dv.fim > inicio) {
          dv.p = s(dv.p + total);
          dv.pac = s(dv.pac + ac);
          if (c.acidental === undefined) dv.digitada = true;
        }
        inicio = dv.fim;
      }
    }
    return { divs, vao, tipo };
  });

  // F no fim de um tramo interno: o VIGA exige F = 0 na última divisão (VIGA.BAS:1279)
  listas.forEach(({ divs, tipo }, i) => {
    const ultima = divs.at(-1)!;
    if (tipo !== "tramo" || (ultima.f === 0 && ultima.fac === 0 && !ultima.indexada)) return;
    const proxima = listas[i + 1];
    if (!proxima) {
      aviso(
        `F de ${num(ultima.f, 3)} t no fim do trecho ${i}, em cima do último apoio: o VIGA não aceita F na última divisão de um tramo e não há trecho depois. Carga ignorada: ela vai direto ao pilar.`,
      );
    } else {
      aviso(
        `F no fim do trecho ${i} (em cima do apoio): o VIGA exige F = 0 na última divisão de um tramo; a carga passa para o começo (D = 0) do trecho ${i + 1}.`,
      );
      const primeira = proxima.divs[0]!;
      const alvo = primeira.fim === 0 ? primeira : vazia(0, primeira.p);
      if (alvo !== primeira) proxima.divs.unshift(alvo);
      alvo.f = s(alvo.f + ultima.f);
      alvo.fac = s(alvo.fac + ultima.fac);
      if (ultima.indexada) alvo.indexada = ultima.indexada;
    }
    ultima.f = 0;
    ultima.fac = 0;
    delete ultima.indexada;
  });

  // acidentais "S" com "G": Pac e Fac da divisão inteira digitada (VIGA.BAS:1294-1298).
  // A divisão que só tem cargas com a acidental informada vem de um arquivo (o .VIG
  // gravado) e fica como está: o VIGA só gera a acidental na entrada.
  if (gerada)
    for (const { divs } of listas)
      for (const dv of divs.filter((x) => x.digitada)) {
        dv.pac = s((pct * dv.p) / 100);
        if (!dv.indexada) dv.fac = s((pct * dv.f) / 100);
      }

  const total = listas.reduce((soma, l) => soma + l.divs.length, 0);
  if (total > MAX_DIVISOES)
    aviso(
      `${total} divisões de carga: o VIGA aceita no máximo ${MAX_DIVISOES} ("SOMENTE 30 DIVISOES DE CARGA NA VIGA"); o original recusaria a viga.`,
    );

  const novos = listas.map(({ divs, vao, tipo }, i): TramoViga => ({
    vao,
    inercia: usaInercias ? s(viga.inercias![i]!) : trechos[i]!.tramo.inercia,
    divisoes: paraRegistro(divs, tipo),
  }));
  const be = dados.balancoEsquerdo ? 1 : 0;
  // o registro bruto e os J brutos são os da montagem: não valem para o .VIG editado
  const resto: DadosViga = { ...dados };
  delete resto.registro;
  delete resto.inerciasBrutas;
  if (viga.pilaresNoRep && viga.pilaresNoRep.length !== n + 1)
    aviso(
      `os números de pilar dos apoios (opção 7 do VIGA): ${viga.pilaresNoRep.length} números, e a viga tem ${n + 1} apoios.`,
    );
  // o número digitado na opção 7 (VIGA.BAS:2150-2175): o .REP leva a reação a "P<número>"
  const pilares = dados.pilares.map((p, k) => {
    if (viga.apoiosDesconsiderados?.includes(k)) return null;
    const numero = viga.pilaresNoRep?.[k];
    return numero === undefined || numero === null ? p : `P${numero}`;
  });
  return {
    ...resto,
    tramos: novos.slice(be, be + n),
    ...(dados.balancoEsquerdo ? { balancoEsquerdo: novos[0]! } : {}),
    ...(dados.balancoDireito ? { balancoDireito: novos[be + n]! } : {}),
    engasteEsquerdo: viga.engaste?.esquerdo ?? dados.engasteEsquerdo,
    engasteDireito: viga.engaste?.direito ?? dados.engasteDireito,
    momentosExternos: viga.momentosExternos
      ? [s(knmParaTm(viga.momentosExternos.esquerdo)), s(knmParaTm(viga.momentosExternos.direito))]
      : dados.momentosExternos,
    pilares,
  };
}

/** Seções e forma do DESENHO com os dados da viga da obra por cima dos tirados da planta.
 *  Índices da obra: trecho 0 = primeiro trecho (balanço esquerdo, se houver); apoio k =
 *  apoio k. Balanço com seção 0 herda bw e hw do apoio vizinho, como o DESDIM faz antes de
 *  dimensionar (DESDIM.BAS:2919-2929). Devolve também os eixos do .FOR para o DESINIT (só
 *  se a obra os der). `avisos` recebe as listas com tamanho diferente do da viga. */
export function secoesEFormaDaObra(
  viga: Viga,
  dados: DadosViga,
  base: { secoes: SecoesViga; forma: FormaViga; apoios: ApoioFormaViga[] },
  modo: ModoSistrut,
  avisos: string[] = [],
) {
  const s = atribuicao(modo);
  const be = dados.balancoEsquerdo ? 1 : 0;
  const n = dados.tramos.length;
  const nTrechos = be + n + (dados.balancoDireito ? 1 : 0);
  /** Índice do trecho da obra para o trecho do registro: tramo t (1..n), 0 balE, n+1 balD. */
  const trechoDe = (t: number) => (be ? t : t - 1);
  /** `rotulo`: o que o usuário digitou, em pt-BR ("as seções dos trechos"). */
  const tamanho = (rotulo: string, lista: readonly unknown[] | undefined, esperado: number) => {
    if (lista && lista.length !== esperado)
      avisos.push(
        `Viga ${viga.nome}: ${rotulo}: ${lista.length} itens, e a viga tem ${esperado}; valem os ${Math.min(lista.length, esperado)} primeiros, o resto vem da planta.`,
      );
  };
  tamanho("as seções dos trechos", viga.secoes?.trechos, nTrechos);
  tamanho("as seções dos apoios", viga.secoes?.apoios, n + 1);
  tamanho("a fôrma dos trechos", viga.forma?.trechos, nTrechos);
  tamanho("a fôrma dos apoios", viga.forma?.apoios, n + 1);

  const st = viga.secoes?.trechos;
  const sa = viga.secoes?.apoios;
  const apoiosSec = base.secoes.apoios.map((x, k) => {
    const a = sa?.[k];
    return a ? { bw: s(a.bw), hw: s(a.h), bf: 0, hf: 0 } : x;
  });
  const secaoTrecho = (t: number, padrao: SecaoViga | undefined): SecaoViga | undefined => {
    const x = st?.[trechoDe(t)];
    if (!x) return padrao;
    const secao = { bw: s(x.bw), hw: s(x.h), bf: s(x.bf), hf: s(x.hf) };
    if (secao.bw > 0 && secao.hw > 0) return secao;
    if (t === 0 || t === n + 1) {
      // balanço sem seção própria: a do apoio vizinho (A_1260(MAX(0, t − 1)))
      const a = apoiosSec[Math.max(0, t - 1)];
      return { ...secao, bw: a?.bw ?? secao.bw, hw: a?.hw ?? secao.hw };
    }
    avisos.push(
      `Viga ${viga.nome}: seção 0 no tramo ${t}; vale a da planta (${numAte(viga.bw, 1)} × ${numAte(viga.h, 1)} cm).`,
    );
    return padrao;
  };
  const secoes: SecoesViga = {
    tramos: base.secoes.tramos.map((x, i) => secaoTrecho(i + 1, x)!),
    apoios: apoiosSec,
    ...(base.secoes.balancoEsquerdo
      ? { balancoEsquerdo: secaoTrecho(0, base.secoes.balancoEsquerdo)! }
      : {}),
    ...(base.secoes.balancoDireito
      ? { balancoDireito: secaoTrecho(n + 1, base.secoes.balancoDireito)! }
      : {}),
  };

  const fa = viga.forma?.apoios;
  const apoios = base.apoios.map((a, k): ApoioFormaViga => {
    const x = fa?.[k];
    if (!x) return a;
    return {
      largura: x.largura !== undefined ? s(x.largura) : a.largura,
      tipo: x.tipo ?? a.tipo,
      titulo: x.titulo ?? a.titulo,
      codigo: x.codigo !== undefined ? s(x.codigo) : a.codigo,
      lps: x.lps !== undefined ? s(x.lps) : a.lps,
      dis: x.dis !== undefined ? s(x.dis) : a.dis,
    };
  });
  const ft = viga.forma?.trechos;
  const lajes = viga.forma?.lajesNoCorte;
  /** Seção do trecho t do original (0 balE, 1..n, n+1 balD), já com a da obra. */
  const secaoDe = (t: number) =>
    t === 0 ? secoes.balancoEsquerdo : t === n + 1 ? secoes.balancoDireito : secoes.tramos[t - 1];
  const formaTrecho = (t: number, f: FormaTramo, largura: number): FormaTramo => {
    const x = ft?.[trechoDe(t)];
    const num = (v: number | undefined, padrao: number) => (v !== undefined ? s(v) : padrao);
    // "Lajes no Corte" N: tudo 0; "Flange como seção T": Hle = Hld = CINT(hf) do trecho
    // (A_1A3A% é INTEGER; DESENHO.BAS:6768-6779). Sem a resposta, a laje da planta.
    const hf = qbCint(secaoDe(t)?.hf ?? 0);
    const laje =
      lajes === "nao"
        ? { pe: 0, hle: 0, pd: 0, hld: 0 }
        : lajes === "mesa"
          ? { pe: 0, hle: hf, pd: 0, hld: hf }
          : { pe: f.pe, hle: f.hle, pd: f.pd, hld: f.hld };
    return {
      larguraApoio: largura,
      vaoLivre: num(x?.vaoLivre, f.vaoLivre),
      pe: num(x?.pe, laje.pe),
      hle: num(x?.hle, laje.hle),
      pd: num(x?.pd, laje.pd),
      hld: num(x?.hld, laje.hld),
    };
  };
  // a largura do apoio à esquerda do tramo t é a do apoio t − 1 (0 no balanço esquerdo)
  const largura = (k: number, padrao: number) => {
    const x = fa?.[k]?.largura;
    return x !== undefined ? s(x) : padrao;
  };
  const forma: FormaViga = {
    tramos: base.forma.tramos.map((f, i) => formaTrecho(i + 1, f, largura(i, f.larguraApoio))),
    ...(base.forma.balancoEsquerdo
      ? { balancoEsquerdo: formaTrecho(0, base.forma.balancoEsquerdo, 0) }
      : {}),
    ...(base.forma.balancoDireito
      ? {
          balancoDireito: formaTrecho(
            n + 1,
            base.forma.balancoDireito,
            largura(n, base.forma.balancoDireito.larguraApoio),
          ),
        }
      : {}),
  };
  // eixos e alinhamentos: só se algum trecho os traz (senão o padrão do DESINIT)
  const comEixo = ft?.some((x) => x.eixo !== undefined || x.alinhamento !== undefined) ?? false;
  let eixos: EixoTramoViga[] | undefined;
  if (comEixo) {
    eixos = [];
    for (let t = 0; t <= n + 1; t++) {
      const i = trechoDe(t);
      const x = i >= 0 && i < nTrechos ? ft?.[i] : undefined;
      if (x && (x.eixo !== undefined || x.alinhamento !== undefined)) {
        // o padrão do DESINIT para o campo que faltar: metade da largura do apoio à esquerda
        const esquerda = apoios[Math.max(0, t - 1)]?.largura ?? 0;
        eixos[t] = {
          eixo: x.eixo !== undefined ? s(x.eixo) : s(esquerda / 2),
          alinhamento: s(x.alinhamento ?? 0),
        };
      }
    }
  }
  return { secoes, forma, apoios, ...(eixos ? { eixos } : {}) };
}

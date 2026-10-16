// O .VIG que o VIGA lê: o registro que a montagem (LAJEMONT) grava para a viga, com o
// que o usuário do original digita depois no VIGA e no DESENHO, nos campos da viga da
// obra (`Viga.cargas`, `vaos`, `inercias`, `engaste`, `momentosExternos`,
// `apoiosDesconsiderados`, `somenteCargasProprias`, `secoes`, `forma`). Unidades do
// original na saída (t, t/m, m, t·m, cm); a obra está em SI.
//
// Divisões (VIGA.BAS:1087-1356; livros_viga_pilar.md 1.2): num tramo, a divisão k vale P
// de D(k−1) até D(k) e tem F concentrada em D(k), com D a partir do apoio esquerdo. No
// balanço esquerdo o registro vem da ponta livre para o apoio e D é medido a partir do
// apoio (a F de cada divisão fica do lado da ponta). Aqui cada trecho é trabalhado com a
// abscissa a partir do apoio (a ponta esquerda do trecho, ou o apoio no balanço
// esquerdo), em ordem crescente, e volta ao formato do registro no fim.
//
// Uma carga distribuída corta as divisões nas suas pontas e soma P (e Pac) nas divisões
// entre elas; uma concentrada corta na sua posição e soma F (e Fac) na divisão que
// termina ali. Ponto a menos de 1e-6 m de uma divisão existente cai nela (a montagem
// mede em SINGLE a partir das coordenadas). Sem `acidental`, a parte acidental é a gerada
// pelo % do VIGA.INI quando ele diz "G" (VIGA.BAS:1294-1298, `divisaoComAcidentalGerada`)
// e zero quando diz "F".
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

/** Distância abaixo da qual um ponto de carga cai numa divisão existente, m. */
const TOL_DIVISAO = 1e-6;
/** Diferença máxima entre o vão digitado e o da planta, m (a tolerância de comprimento
 *  do .LAP, LAJE.BAS:121). */
const TOL_VAO = 0.005;

type Tipo = "balE" | "tramo" | "balD";

/** Divisão com a abscissa do fim medida a partir do apoio. */
interface Div {
  fim: number;
  p: number;
  f: number;
  pac: number;
  fac: number;
  indexada?: DivisaoCarga["indexada"];
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
 *  uma divisão existente se estiver a menos de TOL_DIVISAO. A F fica com a parte de fim. */
function corta(divs: Div[], x: number): number {
  if (Math.abs(x) <= TOL_DIVISAO) return 0;
  let inicio = 0;
  for (let i = 0; i < divs.length; i++) {
    const dv = divs[i]!;
    if (Math.abs(dv.fim - x) <= TOL_DIVISAO) return dv.fim;
    if (x > inicio && x < dv.fim) {
      divs.splice(i, 0, { fim: x, p: dv.p, f: 0, pac: dv.pac, fac: 0 });
      return x;
    }
    inicio = dv.fim;
  }
  return x;
}

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
    (viga.apoiosDesconsiderados?.length ?? 0) > 0;
  if (!temEdicao) return dados;
  const s = atribuicao(modo);
  const trechos = trechosDe(dados);
  const aviso = (texto: string) => avisos.push(`Viga ${viga.nome}: ${texto}`);
  const confere = (campo: string, lista: readonly unknown[] | undefined) => {
    if (lista === undefined || lista.length === trechos.length) return lista !== undefined;
    aviso(
      `${campo} tem ${lista.length} valores e a viga tem ${trechos.length} trechos na planta: ${campo} ignorado.`,
    );
    return false;
  };
  const usaVaos = confere("vaos", viga.vaos);
  const usaInercias = confere("inercias", viga.inercias);
  const pct = porcentagemAcidentalGerada(parametros, modo);
  const acidentalDe = (c: CargaViga, total: number) =>
    c.acidental !== undefined
      ? c.tipo === "distribuida"
        ? s(knPorMParaTPorM(c.acidental))
        : s(knParaT(c.acidental))
      : parametros.acidentalGerada
        ? s((pct * total) / 100)
        : 0;

  const novos = trechos.map(({ tramo, tipo }, i): TramoViga => {
    let vao = tramo.vao;
    let divs = paraDivs(tramo, tipo);
    if (viga.somenteCargasProprias) {
      // só as divisões que trazem a reação de uma viga apoiada; o resto sai
      const base: Div[] = divs
        .filter((dv) => dv.indexada)
        .map((dv) => ({ fim: dv.fim, p: 0, f: 0, pac: 0, fac: 0, indexada: dv.indexada }));
      if (base.at(-1)?.fim !== vao) base.push({ fim: vao, p: 0, f: 0, pac: 0, fac: 0 });
      divs = base;
    }
    if (usaVaos) {
      const novo = s(viga.vaos![i]!);
      if (Math.abs(novo - vao) > TOL_VAO)
        aviso(
          `o vão ${viga.vaos![i]} m do trecho ${i} não bate com a planta (${vao.toFixed(3)} m): vale o da planta.`,
        );
      else {
        vao = novo;
        const ultima = divs.at(-1);
        if (ultima) ultima.fim = vao;
        divs = divs.filter((dv, k) => k === divs.length - 1 || dv.fim < vao);
      }
    }
    // abscissa a partir do apoio: no balanço esquerdo o apoio é a ponta direita
    const doApoio = (u: number) => s(tipo === "balE" ? vao - u : u);
    for (const c of viga.cargas ?? []) {
      if (c.trecho !== i) continue;
      const fora = (u: number) => u < -TOL_DIVISAO || u > vao + TOL_DIVISAO;
      if (c.tipo === "concentrada") {
        if (fora(c.posicao)) {
          aviso(`carga concentrada fora do trecho ${i} (${c.posicao} m): ignorada.`);
          continue;
        }
        let x = doApoio(c.posicao);
        if (Math.abs(x) <= TOL_DIVISAO) {
          // em cima do apoio: divisão de comprimento zero no começo
          if (divs[0]?.fim !== 0) divs.unshift({ fim: 0, p: 0, f: 0, pac: 0, fac: 0 });
          x = 0;
        } else x = corta(divs, x);
        const alvo = divs.find((dv) => dv.fim === x)!;
        const total = s(knParaT(c.total));
        alvo.f = s(alvo.f + total);
        alvo.fac = s(alvo.fac + acidentalDe(c, total));
        continue;
      }
      if (fora(c.inicio) || fora(c.fim)) {
        aviso(`carga distribuída fora do trecho ${i} (${c.inicio} a ${c.fim} m): ignorada.`);
        continue;
      }
      const [a, b] = [doApoio(c.inicio), doApoio(c.fim)].sort((x, y) => x - y) as [number, number];
      const xa = corta(divs, a);
      const xb = corta(divs, b);
      const total = s(knPorMParaTPorM(c.total));
      const ac = acidentalDe(c, total);
      let inicio = 0;
      for (const dv of divs) {
        if (inicio >= xa && dv.fim <= xb && dv.fim > inicio) {
          dv.p = s(dv.p + total);
          dv.pac = s(dv.pac + ac);
        }
        inicio = dv.fim;
      }
    }
    return {
      vao,
      inercia: usaInercias ? s(viga.inercias![i]!) : tramo.inercia,
      divisoes: paraRegistro(divs, tipo),
    };
  });

  const be = dados.balancoEsquerdo ? 1 : 0;
  const n = dados.tramos.length;
  // o registro bruto e os J brutos são os da montagem: não valem para o .VIG editado
  const resto: DadosViga = { ...dados };
  delete resto.registro;
  delete resto.inerciasBrutas;
  const pilares = dados.pilares.map((p, k) => (viga.apoiosDesconsiderados?.includes(k) ? null : p));
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
 *  apoio k. Devolve também os eixos do .FOR para o DESINIT (só se a obra os der). */
export function secoesEFormaDaObra(
  viga: Viga,
  dados: DadosViga,
  base: { secoes: SecoesViga; forma: FormaViga; apoios: ApoioFormaViga[] },
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const be = dados.balancoEsquerdo ? 1 : 0;
  const n = dados.tramos.length;
  const nTrechos = be + n + (dados.balancoDireito ? 1 : 0);
  /** Índice do trecho da obra para o trecho do registro: tramo t (1..n), 0 balE, n+1 balD. */
  const trechoDe = (t: number) => (be ? t : t - 1);

  const st = viga.secoes?.trechos;
  const sa = viga.secoes?.apoios;
  const secaoTrecho = (t: number, padrao: SecaoViga | undefined): SecaoViga | undefined => {
    const x = st?.[trechoDe(t)];
    return x ? { bw: s(x.bw), hw: s(x.h), bf: s(x.bf), hf: s(x.hf) } : padrao;
  };
  const secoes: SecoesViga = {
    tramos: base.secoes.tramos.map((x, i) => secaoTrecho(i + 1, x)!),
    apoios: base.secoes.apoios.map((x, k) => {
      const a = sa?.[k];
      return a ? { bw: s(a.bw), hw: s(a.h), bf: 0, hf: 0 } : x;
    }),
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

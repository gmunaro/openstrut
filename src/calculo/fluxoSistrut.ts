// NB-1/78 pelo caminho do SISTRUT 4.0 (`sistrut/obra.ts`): roda o cálculo nas
// unidades do original e projeta o resultado no `ResultadoObra` da V2, em SI, para a
// interface, o relatório e o detalhamento. O resultado do original, sem conversão,
// fica em `ResultadoObra.sistrut` (é o que o comparador lê). Conversões em
// `sistrut/base/unidades.ts`; o que cada modo faz em docs/MODO-CALCULO.md.
//
// O que é da V2 e não existe no original (marcado na memória): a parcela permanente
// das reações (`reacaoG`, refeita pelo VICALC só com as cargas permanentes), o
// diagrama de momentos por pontos (estática do tramo sobre as cargas do .VIG), a flecha
// da laje no modo original (o original não calcula: 0) e o Nd/Md dos pilares (γf × as
// ações características que o original usa).
import type { Bordo, Laje, Obra, Pavimento } from "../dominio/obra";
import type { BarrasNaAlma } from "./barras";
import type {
  AnaliseViga,
  ResultadoLaje,
  ResultadoObra,
  ResultadoPavimento,
  ResultadoPilar,
  ResultadoTramo,
  ResultadoViga,
  SecaoViga as SecaoVigaV2,
} from "./fluxo";
import type { CargaPilar, Equilibrio, TramoMontado, VigaCalculada, VigaMontada } from "./montagem";
import { moduloConcreto } from "./normas/nb1-78/materiais";
import type {
  AnaliseViga as AnaliseVigaContrato,
  DadosViga,
  DivisaoCarga,
  FlexaoViga,
  MomentosDeLaje,
  PosicaoLajeproc,
  TramoDimensionado,
  TramoViga,
} from "./sistrut/base/tipos";
import {
  tcm2ParaMpa,
  tmParaKnm,
  tmPorMParaKnmPorM,
  tParaKn,
  tPorM2ParaKnPorM2,
  tPorMParaKnPorM,
} from "./sistrut/base/unidades";
import { verificaFlechaLaje } from "./sistrut/lajes/espessura";
import {
  calcularObraSistrut,
  type PavimentoSistrut,
  type ResultadoSistrut,
  type VigaSistrut,
  vinculosDosCodigos,
} from "./sistrut/obra";
import type { Ponto } from "../dominio/obra";
import { analisaVigas } from "./sistrut/vigas/vicalc";
import type {
  Barra,
  BarrasPilar,
  Etapa,
  LajeArmadura,
  LajeEsforcos,
  MateriaisCalc,
  Norma,
  PilarResultado,
} from "./tipos";
import type { PontoDiagrama, TramoResultado, VigaContinuaResultado } from "./vigas/continua";
import type { PredimensionamentoPilarResultado, VerificacaoPilarResultado } from "./tipos";

const REF = "SISTRUT 4.0 (sistrut/obra.ts)";
const ES_MPA = 210_000;
/** Pontos do diagrama por tramo (o mesmo NPT da viga contínua da V2). */
const NPT = 50;

/** Etapa da V2 que não existe no original. */
const etapaV2 = (descricao: string, valor?: number, unidade?: string): Etapa => ({
  descricao: `${descricao} (V2; não existe no SISTRUT)`,
  ...(valor === undefined ? {} : { valor }),
  ...(unidade === undefined ? {} : { unidade }),
  ref: "V2",
});

// ---------------------------------------------------------------- materiais

function materiaisCalc(r: ResultadoSistrut, obra: Obra): MateriaisCalc {
  const m = r.materiais;
  const fck = tcm2ParaMpa(m.fck);
  const fyk = tcm2ParaMpa(m.fyk);
  const fcd = fck / m.gamaC;
  return {
    fck,
    fcd,
    sigmaCd: 0.85 * fcd,
    fyk,
    fyd: fyk / m.gamaS,
    fywd: fyk / m.gamaS,
    ecs: moduloConcreto(fck),
    es: ES_MPA,
    aco: obra.materiais.aco,
    acoEstribo: obra.materiais.acoEstribo,
    classeAco: m.classeAco,
  };
}

/** Valor de tabela do original (bitola em mm, espaçamento em cm) guardado em SINGLE:
 *  na fronteira SI vale o nominal, com 1 casa (6,3000002 → 6,3). */
const nominal = (x: number) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- lajes

const barraDaPosicao = (p: PosicaoLajeproc | undefined): Barra =>
  p?.barra.ok
    ? { phi: nominal(p.barra.bitola), espacamento: nominal(p.barra.espacamento) }
    : { phi: 0, espacamento: 0 };

/** Momentos utilizáveis: finitos (laje sem nenhum bordo que gire, como a de quatro bordos
 *  livres, não tem mecanismo e o coeficiente de carga não é finito). */
const momentosValidos = (m: MomentosDeLaje | undefined) =>
  m &&
  [
    m.mPositivoPrincipalTcm,
    m.mPositivoSecundarioTcm,
    m.mNegativoMaiorTcm,
    m.mNegativoMenorTcm,
  ].every(Number.isFinite)
    ? m
    : undefined;

/** Comprimento, m, dos lados do polígono que caem no bordo `b` da V2 (`bordos[k]` é o
 *  bordo do lado k → k+1). */
function comprimentoNoPoligono(poligono: readonly Ponto[], bordos: readonly Bordo[], b: Bordo) {
  return poligono.reduce((soma, v, k) => {
    const w = poligono[(k + 1) % poligono.length]!;
    return bordos[k] === b ? soma + Math.hypot(w.x - v.x, w.y - v.y) : soma;
  }, 0);
}

function resultadoLaje(laje: Laje, ps: PavimentoSistrut, r: ResultadoSistrut): ResultadoLaje {
  const desc = ps.lajesDoPainel.find((l) => l.id === laje.id);
  const nome = desc?.nome ?? laje.nome;
  const bordos = desc?.bordos ?? [];
  const sl = ps.esforcos.lajes.find((l) => l.nome === nome);
  const mom = momentosValidos(ps.esforcos.momentos[nome]);
  const zero = { esquerdo: 0, inferior: 0, direito: 0, superior: 0 } as Record<Bordo, number>;
  // Direção do M+ principal (o sem redução): com μ ≤ 1 é x (o lado vertical tem fator
  // de direção 1); com μ > 1 é y (o lado vertical fica com 1/μ e o horizontal com 1;
  // LAJECALC.BAS:1a159, `fatorDeDirecao`). A armadura principal do LAJEPROC vai junto.
  const principalEmY = (sl?.mu ?? 1) > 1;
  const vinculos = vinculosDosCodigos(sl?.codigos ?? [], bordos);
  const pesoProprio = mom?.pesoProprio ?? 0;
  const permanente = sl?.cargaPermanente ?? 0;
  const entrada = {
    nome: laje.nome,
    lx: laje.lx,
    ly: laje.ly,
    h: laje.h,
    // com cargas de ocupação do pavimento: a parte permanente delas vai no g
    g: tPorM2ParaKnPorM2(pesoProprio + permanente) + (desc?.ocupacao?.permanente ?? 0),
    q: laje.sobrecarga + (desc?.ocupacao?.acidental ?? 0),
    vinculos,
    mu: sl?.mu ?? laje.mu,
  };
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const negativos = { ...zero };
  const reacoes = { ...zero };
  if (mom) {
    // bordo da V2 com vários lados no original (vértice de vizinha no meio): o maior
    bordos.forEach((b, k) => {
      const c = mom.bordos[k]?.coeficiente ?? 0;
      const m = tmPorMParaKnmPorM((Math.abs(mom.mPositivoPrincipalTcm) * c) / 100);
      negativos[b] = Math.max(negativos[b], m);
    });
    memoria.push(
      {
        descricao: `${nome}: coeficiente de carga (M+ = q/c, LAJECALC)`,
        valor: mom.coeficiente.coeficiente,
        ref: "LAJECALC.BAS:8408",
      },
      {
        descricao: `${nome}: carga q(H) = alvenaria e áreas/área + H·densidade/100 + permanente`,
        valor: mom.q,
        unidade: "t/m²",
        ref: "LAJECALC.BAS:824",
      },
      {
        descricao: `${nome}: M+ principal = 100·q/c`,
        valor: mom.mPositivoPrincipalTcm / 100,
        unidade: "tm/m",
        ref: "LAJECALC.BAS:875-880",
      },
    );
  } else if (laje.tipo === "pre-moldada")
    avisos.push(`${nome}: pré-moldada; o LAJECALC não calcula momentos, só a montagem a carrega.`);
  else
    avisos.push(
      `${nome}: momentos não calculados pelo LAJECALC (sem bordo que gire ou fora da faixa de H).`,
    );
  for (const rb of ps.montagem.reacoes) {
    if (rb.laje !== nome) continue;
    const b = bordos[rb.bordo];
    if (!b) continue;
    // carga por metro do lado, ponderada pelo comprimento dele no bordo da V2
    const t = rb.linear + rb.cargaArea + rb.estrutura + rb.peso;
    const comprimentoBordo = laje.poligono
      ? comprimentoNoPoligono(laje.poligono, bordos, b)
      : b === "esquerdo" || b === "direito"
        ? laje.ly
        : laje.lx;
    reacoes[b] += tPorMParaKnPorM((t * rb.comprimento) / comprimentoBordo);
  }
  // flecha: o original não calcula (coluna L/f 0); o corrigido verifica (R1)
  let flecha = 0;
  let flechaLimite = 0;
  if (r.modo === "corrigido" && mom && sl) {
    const f = verificaFlechaLaje(
      {
        lx: desc?.vaosFlecha?.lx ?? laje.lx,
        ly: desc?.vaosFlecha?.ly ?? laje.ly,
        vinculos: entrada.vinculos,
        acidental: entrada.q / tPorM2ParaKnPorM2(1),
      },
      mom.q,
      laje.h,
      r.materiais,
      r.parametros.laje,
    );
    if (f) {
      flecha = f.flecha;
      flechaLimite = f.limite;
      if (!f.atende)
        avisos.push(
          `${nome}: flecha ${f.flecha.toFixed(2)} cm acima do limite ${f.limite.toFixed(2)} cm (corrigido, R1).`,
        );
    }
  }
  const esp = ps.espessuras[nome];
  if (esp?.ok && esp.h > laje.h)
    avisos.push(`${nome}: H ${laje.h} cm abaixo da espessura mínima ${esp.h} cm (LAJECALC 3).`);
  if (esp && !esp.ok) avisos.push(`${nome}: H necessário > H máximo configurado (LAJECALC 3).`);
  const mPrincipal = mom ? tmPorMParaKnmPorM(Math.max(mom.mPositivoPrincipalTcm, 0) / 100) : 0;
  const mSecundario = mom ? tmPorMParaKnmPorM(mom.mPositivoSecundarioTcm / 100) : 0;
  const esforcos: LajeEsforcos = {
    mx: principalEmY ? mSecundario : mPrincipal,
    my: principalEmY ? mPrincipal : mSecundario,
    negativos,
    reacoes,
    flecha,
    flechaLimite,
    avisos,
    memoria,
  };

  // armaduras: as posições do LAJEPROC (uma negativa por continuidade)
  const pos = ps.lajeproc.positivas[nome];
  const asNegativos = { ...zero };
  const barrasNegativos: Partial<Record<Bordo, Barra>> = {};
  for (const n of ps.lajeproc.negativas) {
    const c = n.continuidade;
    const k = c.lajeA === nome ? c.bordoA : c.lajeB === nome ? c.bordoB : -1;
    const b = bordos[k];
    if (!b) continue;
    if (n.as < asNegativos[b]) continue;
    asNegativos[b] = n.as;
    barrasNegativos[b] = barraDaPosicao(n);
  }
  const arm = ps.armaduras[nome];
  const [posX, posY] = principalEmY
    ? [pos?.secundaria, pos?.principal]
    : [pos?.principal, pos?.secundaria];
  const armadura: LajeArmadura = {
    asx: posX?.as ?? 0,
    asy: posY?.as ?? 0,
    asNegativos,
    barrasX: barraDaPosicao(posX),
    barrasY: barraDaPosicao(posY),
    barrasNegativos,
    avisos:
      pos && (!pos.principal.barra.ok || !pos.secundaria.barra.ok)
        ? [`${nome}: seção da positiva não passa no LAJEPROC ('*').`]
        : [],
    memoria: arm
      ? [
          {
            descricao: `${nome}: x/d da seção de maior x`,
            valor: arm.xd,
            ref: "LAJECALC.BAS:663-731",
          },
        ]
      : [],
  };
  return { laje, entrada, esforcos, armadura };
}

// ---------------------------------------------------------------- vigas: carga e diagrama

/** Tramos do .VIG na ordem da V2 (balanço esquerdo, tramos, balanço direito). */
function tramosVig(d: DadosViga) {
  return [
    ...(d.balancoEsquerdo ? [{ tramo: d.balancoEsquerdo, tipo: "balE" as const }] : []),
    ...d.tramos.map((tramo) => ({ tramo, tipo: "tramo" as const })),
    ...(d.balancoDireito ? [{ tramo: d.balancoDireito, tipo: "balD" as const }] : []),
  ];
}

/** Segmentos de carga [a, b] e concentradas do tramo, com abscissa a partir da
 *  extremidade esquerda do tramo da V2. No balanço esquerdo o .VIG guarda as divisões
 *  da ponta livre para o apoio, com D medido a partir do apoio (que é a ponta direita
 *  do tramo da V2): elas são lidas de trás para a frente, como o VICALC faz
 *  (VIGA.BAS:7048-7073, `balanco` em vicalc.ts). */
function cargasDoTramo(t: TramoViga, tipo: "balE" | "tramo" | "balD") {
  const L = t.vao;
  const pos = (d: number) => (tipo === "balE" ? L - d : d);
  let anterior = 0;
  const distribuidas: { a: number; b: number; p: number; pac: number }[] = [];
  const concentradas: { a: number; f: number; fac: number }[] = [];
  const divisoes = tipo === "balE" ? [...t.divisoes].reverse() : t.divisoes;
  for (const dv of divisoes) {
    const [a, b] = [pos(anterior), pos(dv.d)].sort((x, y) => x - y) as [number, number];
    distribuidas.push({ a, b, p: dv.p, pac: dv.pAcidental });
    if (dv.f !== 0) concentradas.push({ a: pos(dv.d), f: dv.f, fac: dv.fAcidental });
    anterior = dv.d;
  }
  return { distribuidas, concentradas };
}

/** Momento das cargas à esquerda de x em torno de x (estática). */
function momentoDasCargas(c: ReturnType<typeof cargasDoTramo>, x: number) {
  let m = 0;
  for (const s of c.distribuidas) {
    const b = Math.min(s.b, x);
    if (b <= s.a) continue;
    m += s.p * (b - s.a) * (x - (s.a + b) / 2);
  }
  for (const f of c.concentradas) if (f.a < x) m += f.f * (x - f.a);
  return m;
}
const cargaTotal = (c: ReturnType<typeof cargasDoTramo>) =>
  c.distribuidas.reduce((s, d) => s + d.p * (d.b - d.a), 0) +
  c.concentradas.reduce((s, f) => s + f.f, 0);

/** Pontos do diagrama (estática do tramo com Me e Ve da análise), kN·m. */
function pontosDoTramo(
  t: TramoViga,
  tipo: "balE" | "tramo" | "balD",
  mEsq: number,
  vEsq: number,
): PontoDiagrama[] {
  const c = cargasDoTramo(t, tipo);
  return Array.from({ length: NPT + 1 }, (_, i) => {
    const x = (t.vao * i) / NPT;
    const m = tmParaKnm(mEsq + vEsq * x - momentoDasCargas(c, x));
    return { x, mMax: m, mMin: m };
  });
}

/** O mesmo .VIG só com as cargas permanentes (P − Pac, F − Fac). */
const soPermanente = (d: DadosViga): DadosViga => {
  const perm = (t: TramoViga): TramoViga => ({
    ...t,
    divisoes: t.divisoes.map((dv): DivisaoCarga => ({
      ...dv,
      p: dv.p - dv.pAcidental,
      f: dv.f - dv.fAcidental,
      pAcidental: 0,
      fAcidental: 0,
    })),
  });
  return {
    ...d,
    tramos: d.tramos.map(perm),
    ...(d.balancoEsquerdo ? { balancoEsquerdo: perm(d.balancoEsquerdo) } : {}),
    ...(d.balancoDireito ? { balancoDireito: perm(d.balancoDireito) } : {}),
  };
};

/** Viga montada da V2 (cargas médias por tramo) a partir do .VIG e da geometria.
 *  `permanente` = o mesmo .VIG só com as cargas permanentes, com as indexadas
 *  resolvidas pelas reações permanentes: separa g e q das cargas de viga sobre viga. */
function vigaMontada(
  ps: PavimentoSistrut,
  dados: DadosViga,
  permanente: DadosViga | undefined,
): VigaMontada | undefined {
  const g = ps.geometriaVigas.find((x) => x.viga.nome === dados.nome);
  if (!g) return undefined;
  const pesoKg = ps.montagem.vigas.find((v) => v.nome === dados.nome);
  // a origem das cargas indexadas (viga sobre viga) está no .VIG antes do VIGA
  const semResolver = pesoKg ? tramosVig(pesoKg) : [];
  const perm = permanente ? tramosVig(permanente) : [];
  const tramos = tramosVig(dados).map(({ tramo, tipo }, i): TramoMontado => {
    const origens = (semResolver[i]?.tramo.divisoes ?? [])
      .filter((dv) => dv.indexada)
      .map((dv) => dv.indexada!.viga);
    const c = cargasDoTramo(tramo, tipo);
    const cPerm = perm[i] ? cargasDoTramo(perm[i].tramo, tipo) : undefined;
    const L = tramo.vao;
    const total = c.distribuidas.reduce((s, d) => s + d.p * (d.b - d.a), 0) / L;
    const acid = c.distribuidas.reduce((s, d) => s + d.pac * (d.b - d.a), 0) / L;
    // viga digitada no VIGA (somenteCargasProprias): o .VIG não tem o peso nem a alvenaria
    // da montagem, que só entram no LAJEMONT
    const alv = g.viga.somenteCargasProprias ? [] : (pesoKg?.alvenariasSobreViga ?? []);
    const pp = alv[0]?.peso ?? 0;
    const linear = alv.length ? alv.reduce((s, a) => s + a.alvenaria, 0) / alv.length : 0;
    const lajesG = total - acid - pp - linear;
    return {
      vao: L,
      lajes: { g: tPorMParaKnPorM(lajesG), q: tPorMParaKnPorM(acid) },
      pesoProprio: tPorMParaKnPorM(pp),
      cargaLinear: tPorMParaKnPorM(linear),
      g: tPorMParaKnPorM(total - acid),
      q: tPorMParaKnPorM(acid),
      concentradas: c.concentradas.map((f, k) => {
        const g = cPerm?.concentradas[k]?.f ?? f.f - f.fac;
        return {
          a: f.a,
          g: tParaKn(g),
          q: tParaKn(f.f - g),
          total: tParaKn(f.f),
          origem: origens[k] ?? "",
        };
      }),
    };
  });
  return {
    id: g.viga.id,
    nome: g.viga.nome,
    bw: g.viga.bw,
    h: g.viga.h,
    eixo: g.eixo,
    nos: g.nos,
    apoios: g.apoios,
    tramos,
  };
}

/** Análise do VICALC no formato da viga contínua da V2 (um apoio por nó da V2). */
function analiseDaViga(
  ps: PavimentoSistrut,
  dados: DadosViga,
  vm: VigaMontada,
  g: AnaliseVigaContrato | undefined,
): AnaliseViga | undefined {
  const a = ps.analises.find((x) => x.nome === dados.nome);
  if (!a || !g) return undefined;
  const n = dados.tramos.length;
  const be = dados.balancoEsquerdo ? 1 : 0;
  const tramos: TramoResultado[] = tramosVig(dados).map(({ tramo, tipo }, i) => {
    if (tipo === "tramo") {
      const k = i - be;
      const t = a.tramos[k]!;
      const mEsq = a.apoios[k]?.m ?? 0;
      return {
        comprimento: tramo.vao,
        balanco: false,
        mPos: tmParaKnm(Math.max(t.mPositivo, 0)),
        mNegEsq: tmParaKnm(Math.min(mEsq, 0)),
        mNegDir: tmParaKnm(Math.min(a.apoios[k + 1]?.m ?? 0, 0)),
        vEsq: tParaKn(Math.abs(t.ve)),
        vDir: tParaKn(Math.abs(t.vd)),
        pontos: pontosDoTramo(tramo, tipo, mEsq, t.ve),
      };
    }
    const c = cargaTotal(cargasDoTramo(tramo, tipo));
    const mApoio = tipo === "balE" ? (a.apoios[0]?.m ?? 0) : (a.apoios[n]?.m ?? 0);
    return {
      comprimento: tramo.vao,
      balanco: true,
      mPos: 0,
      mNegEsq: tipo === "balD" ? tmParaKnm(Math.min(mApoio, 0)) : 0,
      mNegDir: tipo === "balE" ? tmParaKnm(Math.min(mApoio, 0)) : 0,
      vEsq: tipo === "balD" ? tParaKn(c) : 0,
      vDir: tipo === "balE" ? tParaKn(c) : 0,
      pontos: pontosDoTramo(tramo, tipo, tipo === "balD" ? mApoio : 0, tipo === "balD" ? c : 0),
    };
  });
  // apoios da V2: um por nó; as pontas livres têm reação 0
  const apoios = vm.apoios.map((ap, no) => {
    if (ap.tipo === "livre") return { livre: true, reacaoG: 0, reacaoMax: 0, reacaoTotal: 0 };
    const k = no - be;
    return {
      livre: false,
      reacaoG: tParaKn(g.apoios[k]?.r ?? 0),
      reacaoMax: tParaKn(a.apoios[k]?.rMax ?? 0),
      reacaoTotal: tParaKn(a.apoios[k]?.r ?? 0),
    };
  });
  const resultado: VigaContinuaResultado = {
    ok: true,
    tramos,
    apoios,
    avisos: [...a.avisos],
    memoria: [
      ...a.memoria,
      etapaV2("Reações permanentes: VICALC refeito só com as cargas permanentes do .VIG"),
      etapaV2("Diagrama de momentos: estática de cada tramo com o M e o V da análise"),
    ],
  };
  const gq = apoios.map((x) => ({ g: x.reacaoG, q: x.reacaoTotal - x.reacaoG }));
  return { reacoes: gq, reacoesProjeto: gq, resultado };
}

// ---------------------------------------------------------------- vigas: dimensionamento

function secaoDaFlexao(f: FlexaoViga | undefined, bw: number, aviso: string[]): SecaoVigaV2 {
  if (!f || f.mk === 0) return { flexao: null, barras: null };
  const b = f.barras;
  const area = (n: number, phi: number) => (n * Math.PI * (phi / 10) ** 2) / 4;
  const grupos = [
    { n: b.n1, phi: nominal(b.bitola1) },
    { n: b.n2, phi: nominal(b.bitola2) },
  ].filter((g) => g.n > 0);
  const barras: BarrasNaAlma | null =
    b.n1 > 0
      ? {
          n: b.n1 + b.n2,
          phi: Math.max(...grupos.map((g) => g.phi)),
          area: grupos.reduce((s, g) => s + area(g.n, g.phi), 0),
          cabe: true,
          largura: bw,
          grupos,
        }
      : null;
  return {
    flexao: {
      as: f.as,
      asComprimida: f.asCompressao,
      xd: f.xd,
      avisos: aviso,
      memoria: [
        {
          descricao: `Mk ${f.mk.toFixed(2)} tm, x/d ${f.xd.toFixed(3)}, arranjo ${f.arranjo}`,
          valor: f.as,
          unidade: "cm²",
          ref: "DESDIM.BAS:2836-2957",
        },
      ],
    },
    barras,
  };
}

function resultadoViga(
  vs: VigaSistrut | undefined,
  vm: VigaMontada,
  analise: VigaContinuaResultado,
  dados: DadosViga,
  r: ResultadoSistrut,
): ResultadoViga {
  const d = vm.h - r.parametros.dsp.cobrimento - r.parametros.dsp.acrescimo;
  const dim = vs?.dimensionamento;
  const avisos = [...(vs?.avisos ?? []), ...(dim?.avisos ?? [])];
  if (!dim) return { viga: vm, analise, d, tramos: [], avisos };
  const n = dados.tramos.length;
  const tramoV2 = (
    t: TramoDimensionado | undefined,
    k: number,
    balanco: "E" | "D" | null,
  ): ResultadoTramo => {
    const sem = { flexao: null, barras: null };
    const apoioE = balanco === "E" ? undefined : dim.apoios[balanco === "D" ? n : k];
    const apoioD = balanco === "D" ? undefined : dim.apoios[balanco === "E" ? 0 : k + 1];
    const c = t?.cisalhamento;
    const asw = Math.max(c?.aswEsquerda ?? 0, c?.aswDireita ?? 0);
    const s = Math.min(
      ...[c?.estribo.espacamentoEsquerda ?? 0, c?.estribo.espacamentoDireita ?? 0].filter(
        (x) => x > 0,
      ),
    );
    return {
      positivo: balanco ? sem : secaoDaFlexao(t?.flexao, vm.bw, []),
      negativoEsq: secaoDaFlexao(apoioE?.dimensionado === false ? undefined : apoioE, vm.bw, []),
      negativoDir: secaoDaFlexao(apoioD?.dimensionado === false ? undefined : apoioD, vm.bw, []),
      cortante: {
        asw,
        bielaOk: !avisos.some((a) => a.includes("cisalhamento acima do limite")),
        sMax: r.parametros.dsp.espacamentoEstriboMaximo,
        avisos: [],
        memoria: c
          ? [
              {
                descricao: `Vk ${c.vkEsquerda.toFixed(2)} / ${c.vkDireita.toFixed(2)} t; Asw ${c.aswEsquerda.toFixed(2)} / ${c.aswDireita.toFixed(2)} cm²/m (ψ = 0,225 + 15ρ)`,
                valor: asw,
                unidade: "cm²/m",
                ref: "DESDIM.BAS:3127-3336",
              },
            ]
          : [],
      },
      estribo:
        c && Number.isFinite(s)
          ? { phi: nominal(c.estribo.bitola), espacamento: nominal(s) }
          : null,
    };
  };
  const tramos: ResultadoTramo[] = [
    ...(dados.balancoEsquerdo ? [tramoV2(dim.balancoEsquerdo, -1, "E")] : []),
    ...dados.tramos.map((_, k) => tramoV2(dim.tramos[k], k, null)),
    ...(dados.balancoDireito ? [tramoV2(dim.balancoDireito, n, "D")] : []),
  ];
  return { viga: vm, analise, d, tramos, avisos: [...new Set(avisos)] };
}

// ---------------------------------------------------------------- equilíbrio

function equilibrio(ps: PavimentoSistrut, pilares: CargaPilar[]): Equilibrio {
  const tt = ps.montagem.totais;
  const kn = tParaKn;
  const cargaLajes = kn(tt.pesoProprioLajes + tt.estrutura + tt.cargasPorArea);
  let reacoesLajes = 0;
  let lajesNasVigas = 0;
  for (const rb of ps.montagem.reacoes) {
    const t = (rb.cargaArea + rb.estrutura + rb.peso) * rb.comprimento;
    reacoesLajes += kn(t);
    if (rb.apoio.tipo === "viga") lajesNasVigas += kn(t);
  }
  let cargaVigas = 0;
  // o .VIG antes do VIGA: as concentradas que ele tem são as digitadas na viga (a reação
  // de viga apoiada, indexada, ainda está com F = 0 e não é carga nova)
  for (const d of ps.vig)
    for (const { tramo, tipo } of tramosVig(d)) {
      const c = cargasDoTramo(tramo, tipo);
      cargaVigas += kn(c.distribuidas.reduce((s, x) => s + x.p * (x.b - x.a), 0));
      cargaVigas += kn(c.concentradas.reduce((s, f) => s + f.f, 0));
    }
  const cargaPilares = pilares.reduce((s, p) => s + p.n, 0);
  const cargaPilaresProjeto = pilares.reduce((s, p) => s + p.nProjeto, 0);
  const avisos = [...ps.montagem.avisos];
  const difere = (a: number, b: number) =>
    Math.abs(a - b) > 0.01 * Math.max(Math.abs(a), Math.abs(b), 1e-9);
  if (difere(cargaPilares, cargaVigas))
    avisos.push(
      `Carga nos pilares (${cargaPilares.toFixed(2)} kN) difere da carga das vigas (${cargaVigas.toFixed(2)} kN).`,
    );
  const etapa = (descricao: string, valor: number): Etapa => ({
    descricao,
    valor,
    unidade: "kN",
    ref: REF,
  });
  return {
    cargaLajes,
    reacoesLajes,
    lajesNasVigas,
    cargaVigas,
    cargaPilares,
    acrescimoTransferido: 0,
    cargaPilaresProjeto,
    ok: avisos.length === 0,
    avisos,
    memoria: [
      etapa("Carga das lajes (peso próprio + permanente + cargas por área)", cargaLajes),
      etapa("Reações das lajes nos bordos (LAJEMONT)", reacoesLajes),
      etapa("Reações das lajes nas vigas", lajesNasVigas),
      etapa("Carga distribuída das vigas (.VIG)", cargaVigas),
      etapa("Carga nos pilares (reações estáticas)", cargaPilares),
      etapa("Carga nos pilares pelo .REP (parcelas truncadas no original)", cargaPilaresProjeto),
    ],
  };
}

// ---------------------------------------------------------------- pavimento

function resultadoPavimento(
  pav: Pavimento,
  ps: PavimentoSistrut,
  r: ResultadoSistrut,
): ResultadoPavimento {
  const lajes = pav.lajes.map((l) => resultadoLaje(l, ps, r));
  const vigasCalc: VigaCalculada<AnaliseViga>[] = [];
  const vigas: ResultadoViga[] = [];
  const naoCalculadas: VigaMontada[] = [];
  // VIGA só com as permanentes, com as indexadas resolvidas na mesma ordem (V2: separa g
  // e q das reações; a viga apoiada leva a reação permanente dela à de apoio)
  const permanentes = analisaVigas(ps.montagem.vigas.map(soPermanente), r.parametros.viga, r.modo);
  for (const dados of ps.vigasVig) {
    const permanente = permanentes.vigas.find((v) => v.nome === dados.nome);
    const vm = vigaMontada(ps, dados, permanente);
    if (!vm) continue;
    const an = analiseDaViga(
      ps,
      dados,
      vm,
      permanentes.analises.find((x) => x.nome === dados.nome),
    );
    if (!an) {
      naoCalculadas.push(vm);
      continue;
    }
    vigasCalc.push({ ...vm, analise: an });
    const vs = ps.vigas.find((v) => v.nome === dados.nome);
    vigas.push(resultadoViga(vs, vm, an.resultado, dados, r));
  }
  // pilares: Σ reações (sem truncar) e o total do .REP
  const pilares: CargaPilar[] = pav.pilares.map((p) => {
    let g = 0;
    let n = 0;
    for (const v of vigasCalc)
      v.apoios.forEach((ap, k) => {
        if (ap.tipo !== "pilar" || ap.id !== p.id) return;
        n += v.analise.reacoes[k]!.g + v.analise.reacoes[k]!.q;
        g += v.analise.reacoes[k]!.g;
      });
    const linha = ps.rep.find((l) => l.pilar === p.nome);
    return {
      id: p.id,
      nome: p.nome,
      x: p.x,
      y: p.y,
      g,
      q: n - g,
      n,
      nProjeto: tParaKn(linha?.total ?? 0),
    };
  });
  const memoria: Etapa[] = [...ps.memoria, ...ps.montagem.memoria];
  const rp: ResultadoPavimento = {
    pavimento: pav,
    lajes,
    montagem: {
      vigas: vigasCalc,
      naoCalculadas,
      pilares,
      avisos: [...ps.avisos, ...ps.montagem.avisos],
      memoria,
    },
    vigas,
    equilibrio: equilibrio(ps, pilares),
    falhas: [],
  };
  // a pré-moldada não tem momentos no SISTRUT, mas a montagem leva a carga dela às vigas
  const preMoldadas = new Set(pav.lajes.filter((l) => l.tipo === "pre-moldada").map((l) => l.nome));
  for (const l of lajes)
    if (!momentosValidos(ps.esforcos.momentos[l.laje.nome]) && !preMoldadas.has(l.laje.nome))
      rp.falhas.push(
        `Laje ${l.laje.nome} sem cálculo: a carga dela não chegou às vigas nem aos pilares; vigas e pilares deste pavimento e dos de baixo estão incompletos.`,
      );
  for (const nome of ps.naoProcessadas)
    rp.falhas.push(`Viga ${nome} não processada pelo VIGA: a carga dela não chegou aos pilares.`);
  // bordo de laje sem viga: o LAJEMONT soma no "total dos pilares", mas nenhum pilar a
  // recebe no .REP (LAJEMONT.BAS:2655-2760; sai em branco no original)
  if (ps.montagem.totais.pilares > 0)
    rp.falhas.push(
      `Bordos de laje sem viga embaixo: ${ps.montagem.totais.pilares.toFixed(2)} t vão ao "total dos pilares" do LAJEMONT, mas não chegam a nenhum pilar.`,
    );
  for (const f of r.falhas) if (f.pavimentoId === pav.id) rp.falhas.push(f.texto);
  if (rp.falhas.length > 0) {
    rp.equilibrio.avisos.push(...rp.falhas);
    rp.equilibrio.ok = false;
  }
  return rp;
}

// ---------------------------------------------------------------- pilares

function barrasDoPilar(
  d: NonNullable<ResultadoSistrut["lances"][number]["dimensionamento"]>,
  pip: ResultadoSistrut["parametros"]["pip"],
): BarrasPilar {
  const b = d.barras[0];
  if (!b) return { n: 0, phi: 0, area: 0, porFaceX: 0, porFaceY: 0 };
  const n = d.barras.reduce((s, x) => s + x.quantidade, 0);
  const area = d.barras.reduce((s, x) => {
    const a =
      pip.bitolas.find((t) => t.bitola === x.bitola)?.area ?? (Math.PI * (x.bitola / 10) ** 2) / 4;
    return s + x.quantidade * a;
  }, 0);
  const xs = d.secao.barras.map((p) => p.x);
  const ys = d.secao.barras.map((p) => p.y);
  const naFace = (v: number[]) => {
    const min = Math.min(...v);
    return v.filter((x) => Math.abs(x - min) < 0.01).length;
  };
  return { n, phi: nominal(b.bitola), area, porFaceX: naFace(xs), porFaceY: naFace(ys) };
}

function resultadosPilares(obra: Obra, r: ResultadoSistrut, pavs: ResultadoPavimento[]) {
  // γf dos pilares: o da obra ou o do PILAR.INI da obra
  const gf = r.materiaisPilar.gamaF;
  const pilares: ResultadoPilar[] = [];
  // como a V2: do topo para a base (repetição 1 no topo), na ordem dos pilares do pavimento
  const ordemPilar = (l: ResultadoSistrut["lances"][number]) =>
    obra.pavimentos
      .find((p) => p.id === l.pavimentoId)
      ?.pilares.findIndex((p) => p.id === l.pilarId) ?? 0;
  const lances = [...r.lances].sort((a, b) => b.nivel - a.nivel || ordemPilar(a) - ordemPilar(b));
  for (const l of lances) {
    const pav = obra.pavimentos.find((p) => p.id === l.pavimentoId);
    const pilar = pav?.pilares.find((p) => p.id === l.pilarId);
    if (!pav || !pilar) continue;
    const d = l.dimensionamento;
    const avisos = [...l.avisos, ...(d?.avisos ?? [])];
    // a recusa (d.recusa) já vem explicada em d.avisos, uma vez
    const mx = d ? Math.max(0, ...d.casos.map((c) => Math.abs(c.mx))) : 0;
    const my = d ? Math.max(0, ...d.casos.map((c) => Math.abs(c.my))) : 0;
    const resultado: PilarResultado = {
      nd: tParaKn(gf * l.carga.nk),
      lambdaX: d?.lambdaX ?? 0,
      lambdaY: d?.lambdaY ?? 0,
      mdX: tmParaKnm(gf * mx),
      mdY: tmParaKnm(gf * my),
      mkX: tmParaKnm(mx),
      mkY: tmParaKnm(my),
      asNecessaria: d?.as ?? 0,
      barras: d
        ? barrasDoPilar(d, r.parametros.pip)
        : { n: 0, phi: 0, area: 0, porFaceX: 0, porFaceY: 0 },
      estribo: d
        ? { phi: nominal(d.estribo.bitola), espacamento: nominal(d.estribo.espacamento) }
        : { phi: 0, espacamento: 0 },
      taxa: d?.taxa ?? 0,
      avisos,
      memoria: [
        ...(d?.memoria ?? []),
        etapaV2("Nd e Md = γf × as ações características do PILAREDI"),
      ],
    };
    const falhas = pavs
      .slice(0, pavs.findIndex((p) => p.pavimento.id === pav.id) + 1)
      .flatMap((p) => p.falhas);
    pilares.push({
      pilar,
      pavimentoId: pav.id,
      pavimento: pav.nome,
      repeticao: l.repeticao,
      nk: tParaKn(l.carga.nk),
      momentos: {
        mxTopo: tmParaKnm(l.carga.mkx),
        mxBase: tmParaKnm(l.carga.momentosBase.mkx),
        myTopo: tmParaKnm(l.carga.mky),
        myBase: tmParaKnm(l.carga.momentosBase.mky),
      },
      resultado,
      falhas,
      ...extrasDoLance(r, l),
    });
  }
  return pilares;
}

/** Verificações (PILAR opção 6) e predimensionamento de um lance, em SI: as de
 *  esforços digitados vão para a repetição 1 do pilar; o predimensionamento, para o
 *  lance de baixo da coluna. */
function extrasDoLance(
  r: ResultadoSistrut,
  l: ResultadoSistrut["lances"][number],
): Pick<ResultadoPilar, "verificacoes" | "predimensionamento"> {
  const verificacoes: VerificacaoPilarResultado[] = r.verificacoes
    .filter(
      (v) =>
        v.pavimentoId === l.pavimentoId &&
        v.pilarId === l.pilarId &&
        (v.repeticao === undefined ? l.repeticao === 1 : v.repeticao === l.repeticao),
    )
    .map((v) => ({
      indice: v.indice,
      esforcosDoLance: v.repeticao !== undefined,
      nk: tParaKn(v.entrada.nk),
      ...(v.resultado
        ? {
            lambdaX: v.resultado.lambdaX,
            lambdaY: v.resultado.lambdaY,
            situacao: v.resultado.situacao,
          }
        : {}),
      casos: (v.resultado?.casos ?? []).map((c) => ({
        rotulo: c.rotulo,
        mx: tmParaKnm(c.mx),
        my: tmParaKnm(c.my),
        mTotal: tmParaKnm(c.mTotal),
        mrX: tmParaKnm(c.mrxReduzido),
        mrY: tmParaKnm(c.mryReduzido),
        mrTotal: tmParaKnm(c.mrTotal),
        veredito: c.veredito,
        ...(c.erro ? { erro: c.erro } : {}),
      })),
      avisos: v.avisos,
    }));
  const p = l.nivelColuna ? undefined : r.predimensionamentos.find((x) => x.coluna === l.coluna);
  const pr = p?.resultado;
  const predimensionamento: PredimensionamentoPilarResultado | undefined = p && {
    modo: p.modo,
    ...(pr && Number.isFinite(pr.b) ? { lado: pr.b } : {}),
    ...(pr
      ? {
          tensoes: {
            normal: tcm2ParaMpa(pr.tensaoNormal),
            normalAdmissivel: tcm2ParaMpa(pr.tensaoNormalAdmissivel),
            flexao: tcm2ParaMpa(pr.tensaoFlexao),
            flexaoAdmissivel: tcm2ParaMpa(pr.tensaoFlexaoAdmissivel),
          },
          carga: tParaKn(pr.carga),
        }
      : {}),
    avisos: p.avisos,
  };
  return {
    ...(verificacoes.length > 0 ? { verificacoes } : {}),
    ...(predimensionamento ? { predimensionamento } : {}),
  };
}

// ---------------------------------------------------------------- obra

/** `calcularObra` da NB-1/78: o caminho do SISTRUT no modo da obra, projetado em SI. */
export function calcularObraPeloSistrut(obra: Obra, norma: Norma): ResultadoObra {
  const modo = obra.modoCalculo ?? "corrigido";
  const sistrut = calcularObraSistrut(obra, { modo });
  const pavimentos = obra.pavimentos.map((pav) => {
    const ps = sistrut.pavimentos.find((p) => p.pavimentoId === pav.id)!;
    return resultadoPavimento(pav, ps, sistrut);
  });
  return {
    norma,
    materiais: materiaisCalc(sistrut, obra),
    pavimentos,
    pilares: resultadosPilares(obra, sistrut, pavimentos),
    avisos: [...sistrut.avisos],
    sistrut,
  };
}

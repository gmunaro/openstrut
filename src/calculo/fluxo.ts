// Cálculo da obra inteira: lajes → vigas → pilares, pavimento por pavimento,
// com verificação de equilíbrio. Orquestra as peças comuns (vinculação,
// compatibilização, montagem, viga contínua, acumulação) e as da norma.
import { num, numAte } from "./texto";
import type { AvisoComOpcao } from "./avisos";
import type { Laje, Obra, Pavimento, Pilar, Viga } from "../dominio/obra";
import { calcularObraPeloSistrut, cargasPropriasDoSistrut } from "./fluxoSistrut";
import type { ResultadoSistrut } from "./sistrut/obra";
import { escolheBarrasAlma, escolheEstribo, type BarrasNaAlma } from "./barras";
import { compatibilizaLajes } from "./lajes/compatibilizacao";
import { vinculacao } from "./lajes/vinculacao";
import {
  cargaLaje,
  montarPavimento,
  verificarEquilibrio,
  type CargaGQ,
  type CargasPropriasTramo,
  type Equilibrio,
  type Montagem,
  type VigaMontada,
} from "./montagem";
import { cargaAcumulada, type NivelAcumulado, type PavimentoCargas } from "./pilares/acumulacao";
import type {
  Barra,
  ComMemoria,
  CortanteResultado,
  Etapa,
  FlexaoResultado,
  LajeArmadura,
  LajeEntrada,
  LajeEsforcos,
  MateriaisCalc,
  Norma,
  PilarEntrada,
  PilarResultado,
} from "./tipos";
import type { PredimensionamentoPilarResultado, VerificacaoPilarResultado } from "./tipos";
import { analisaVigaContinua, type VigaContinuaResultado } from "./vigas/continua";
import {
  ligacaoVigaPilar,
  momentosDoLance,
  REF_LANCE,
  type Direcao,
  type LancePilar,
  type LancesDoPilar,
  type LigacaoVigaPilar,
} from "./vigas/ligacaoPilar";

/** Da face ao centro da barra longitudinal além do cobrimento: estribo 5 mm + φ/2
 *  (até φ 20). Com cobrimento 2,5 cm dá d' = h − d = 4 cm, o valor da V1. Barra
 *  acima de PHI_MAX_ALTURA_UTIL gera aviso (d real menor). */
export const ACRESCIMO_ALTURA_UTIL = 1.5;
/** Maior bitola longitudinal coberta por ACRESCIMO_ALTURA_UTIL, mm. */
export const PHI_MAX_ALTURA_UTIL = 20;
/** Cobrimento lateral usado para ver se as barras cabem na alma, cm (V1). */
export const COBRIMENTO_LATERAL_VIGA = 2;

export interface ResultadoLaje {
  laje: Laje;
  entrada: LajeEntrada;
  /** Esforços já compatibilizados. */
  esforcos: LajeEsforcos;
  armadura: LajeArmadura;
}

export interface AnaliseViga {
  /** Reações com q em todos os tramos (equilíbrio). */
  reacoes: CargaGQ[];
  /** Reações de projeto, g + q desfavorável (pilares e vigas de apoio). */
  reacoesProjeto: CargaGQ[];
  resultado: VigaContinuaResultado;
}

export interface SecaoViga {
  flexao: FlexaoResultado | null;
  barras: BarrasNaAlma | null;
}

export interface ResultadoTramo {
  positivo: SecaoViga;
  negativoEsq: SecaoViga;
  negativoDir: SecaoViga;
  cortante: CortanteResultado;
  estribo: Barra | null;
}

export interface ResultadoViga {
  viga: VigaMontada;
  /** A viga contínua rotulada nos pilares; com Norma.ligacaoVigaPilar, os
   *  negativos dos apoios extremos em pilar já envolvidos com a ligação (e a
   *  memória dela acrescentada). */
  analise: VigaContinuaResultado;
  /** cm */
  d: number;
  tramos: ResultadoTramo[];
  avisos: string[];
}

export interface ResultadoPavimento {
  pavimento: Pavimento;
  lajes: ResultadoLaje[];
  montagem: Montagem<AnaliseViga>;
  vigas: ResultadoViga[];
  equilibrio: Equilibrio;
  /** Carga que faltou no pavimento (laje sem cálculo, pilar de cima sem viga de
   *  transição): vigas e pilares daqui para baixo estão incompletos. Cada falha
   *  também está nos avisos do equilíbrio (ok = false) e marcada nas vigas. */
  falhas: string[];
}

export interface ResultadoPilar {
  /** O pilar no pavimento deste nível (seção e nome do próprio pavimento). */
  pilar: Pilar;
  /** Id do pavimento do nível (case por ele: nomes podem se repetir). */
  pavimentoId: string;
  /** Nome do pavimento, para exibição. */
  pavimento: string;
  repeticao: number;
  nk: number;
  /** Momentos característicos de 1ª ordem passados à norma, kN·m (convenção de
   *  PilarEntrada); 0 sem Norma.ligacaoVigaPilar. */
  momentos: Pick<PilarEntrada, "mxTopo" | "mxBase" | "myTopo" | "myBase">;
  resultado: PilarResultado;
  /** Falhas deste pavimento e dos de cima: o Nk não inclui toda a carga. */
  falhas: string[];
  /** NB-1/78 pelo SISTRUT: as `Pilar.verificacoes` deste lance (PILAR opção 6). */
  verificacoes?: VerificacaoPilarResultado[];
  /** NB-1/78 pelo SISTRUT: predimensionamento da coluna, no lance de baixo. */
  predimensionamento?: PredimensionamentoPilarResultado;
}

export interface ResultadoObra {
  norma: Norma;
  materiais: MateriaisCalc;
  pavimentos: ResultadoPavimento[];
  pilares: ResultadoPilar[];
  avisos: string[];
  /** NB-1/78: os avisos que a tela liga a uma opção do elemento, com id estável
   *  (`calculo/avisos.ts`); o texto é o mesmo das listas de avisos e falhas. */
  avisosComOpcao?: AvisoComOpcao[];
  /** NB-1/78: o γf e os materiais (fcd e fyd com o γc e o γs) com que cada família foi
   *  dimensionada: os γ do .LAP, do .DSP e do PILAR.INI, que a obra pode editar. Ausente
   *  no fluxo da V2: valem `gamaFDe` e `materiaisDe`. */
  porFamilia?: Record<FamiliaElemento, { gamaF: number; materiais: MateriaisCalc }>;
  /** NB-1/78: o resultado do caminho do SISTRUT nas unidades do original (t, m, cm,
   *  t/cm², t·m), do qual os campos acima são a projeção em SI (fluxoSistrut.ts). */
  sistrut?: ResultadoSistrut;
}

export type FamiliaElemento = "lajes" | "vigas" | "pilares";

/** γf com que os elementos da família foram dimensionados, para a tela e o detalhamento:
 *  o do SISTRUT na NB-1/78; no fluxo da V2, máx(γg, γq), porque a envoltória não separa
 *  g e q. */
export const gamaFDe = (r: Pick<ResultadoObra, "norma" | "porFamilia">, familia: FamiliaElemento) =>
  r.porFamilia?.[familia].gamaF ?? Math.max(r.norma.gamaG, r.norma.gamaQ);

/** Materiais com que os elementos da família foram dimensionados, para o detalhamento. */
export const materiaisDe = (
  r: Pick<ResultadoObra, "materiais" | "porFamilia">,
  familia: FamiliaElemento,
) => r.porFamilia?.[familia].materiais ?? r.materiais;

/** Pilares de pavimentos diferentes são o mesmo quando estão na mesma posição. */
/** Chave que casa os lances do mesmo pilar entre pavimentos. */
type ChavePilar = (p: Pilar) => string;

/** Na obra da V2, a posição do pilar. */
const chavePosicao: ChavePilar = (p) => `${p.x.toFixed(3)};${p.y.toFixed(3)}`;

const AVISO_VIGA_FALHA =
  "Pavimento com falha (ver equilíbrio): os esforços desta viga podem não incluir toda a carga.";
const AVISO_PILAR_FALHA =
  "Falha neste pavimento ou acima (ver equilíbrio e avisos da obra): o Nk pode não incluir toda a carga.";

/** Marca o pavimento com falha: lista própria, equilíbrio reprovado e aviso nas vigas. */
function marcarFalha(rp: ResultadoPavimento, falha: string) {
  rp.falhas.push(falha);
  rp.equilibrio.avisos.push(falha);
  rp.equilibrio.ok = false;
  for (const v of rp.vigas)
    if (!v.avisos.includes(AVISO_VIGA_FALHA)) v.avisos.push(AVISO_VIGA_FALHA);
}

/** Obra com dados que só o caminho do SISTRUT lê (a importada, em geral): os campos
 *  "só SISTRUT" do pavimento e da viga (dominio/obra.ts). A obra desenhada na V2 não
 *  os tem. */
function temDadosDoSistrut(obra: Obra) {
  return obra.pavimentos.some(
    (p) =>
      (p.alvenarias?.length ?? 0) > 0 ||
      (p.cargasOcupacao?.length ?? 0) > 0 ||
      (p.trechosPilares?.length ?? 0) > 0 ||
      (p.continuidadesLajes?.length ?? 0) > 0 ||
      p.vigas.some(
        (v) =>
          (v.cargas?.length ?? 0) > 0 ||
          v.somenteCargasProprias === true ||
          v.secoes !== undefined ||
          v.forma !== undefined ||
          v.armaduraEditada !== undefined,
      ),
  );
}

/** Cargas das vigas para o fluxo da V2 numa obra com dados do SISTRUT: as que o
 *  SISTRUT monta (cargasPropriasDoSistrut), com os avisos. Obra sem esses dados:
 *  nada muda. */
function cargasDoSistrutNaV2(obra: Obra): {
  porPavimento?: Map<string, Record<string, CargasPropriasTramo[]>>;
  /** Chave dos pilares pelas colunas do SISTRUT (a posição não casa o lance deslocado
   *  pelo .COL) e os fins de coluna sem transição. */
  chave: ChavePilar;
  fins: ReadonlyMap<string, string>;
  avisos: string[];
} {
  if (!temDadosDoSistrut(obra)) return { chave: chavePosicao, fins: new Map(), avisos: [] };
  const { porPavimento, colunas, fins, avisos } = cargasPropriasDoSistrut(obra);
  const chave: ChavePilar = (p) => colunas.get(p.id) ?? chavePosicao(p);
  const nome = (p: Pavimento, v: Viga) =>
    obra.pavimentos.length > 1 ? `${p.nome} ${v.nome}` : v.nome;
  const semCargas = obra.pavimentos.flatMap((p) =>
    p.vigas.filter((v) => !porPavimento.get(p.id)?.[v.id]).map((v) => nome(p, v)),
  );
  const comSecoes = obra.pavimentos.flatMap((p) =>
    p.vigas
      .filter((v) => v.secoes?.trechos?.some((s) => s.bw !== v.bw || s.h !== v.h) === true)
      .map((v) => nome(p, v)),
  );
  if (porPavimento.size > 0)
    avisos.push(
      "Obra com dados do SISTRUT: as vigas recebem as cargas que o SISTRUT monta no .VIG (lajes pelo LAJEMONT, peso próprio, alvenarias, cargas de ocupação e o que foi digitado no VIGA). A reação de viga sobre viga, os esforços e as armaduras saem pela NBR 6118. As reações das lajes que carregam as vigas são as do SISTRUT, e não as da tabela de lajes desta norma.",
    );
  if (porPavimento.size > 0 && semCargas.length > 0)
    avisos.push(
      `Vigas sem cargas do SISTRUT (${semCargas.join(", ")}): ficam com as cargas das lajes, do peso próprio e da carga linear.`,
    );
  if (comSecoes.length > 0)
    avisos.push(
      `Seções por trecho do .SEC não entram na NBR 6118 (vigas ${comSecoes.join(", ")}): a viga inteira é calculada com o bw × h dela.`,
    );
  return { porPavimento, chave, fins, avisos };
}

/** Calcula a obra pela norma. A NB-1/78 (`norma.caminho === "sistrut"`) passa pelo
 *  caminho do SISTRUT 4.0 no modo da obra (`obra.modoCalculo`, docs/MODO-CALCULO.md);
 *  as outras, pelo fluxo da V2 abaixo. */
export function calcularObra(obra: Obra, norma: Norma): ResultadoObra {
  if (norma.caminho === "sistrut") return calcularObraPeloSistrut(obra, norma);
  const mat = norma.materiais(obra.materiais);
  const doSistrut = cargasDoSistrutNaV2(obra);
  const avisos: string[] = [
    ...(norma.avisosMateriais?.(obra.materiais) ?? []),
    ...doSistrut.avisos,
  ];
  const pavimentos = obra.pavimentos.map((p) =>
    calcularPavimento(p, obra, norma, mat, doSistrut.porPavimento?.get(p.id)),
  );

  // pilares: carga de projeto das vigas por pavimento, acumulada do topo para a
  // base; o mesmo pilar em pavimentos diferentes é casado pela posição, mas cada
  // nível é dimensionado com a seção e o pé-direito do SEU pavimento
  const cargas: PavimentoCargas[] = pavimentos.map((rp) => ({
    id: rp.pavimento.id,
    nome: rp.pavimento.nome,
    peDireito: rp.pavimento.peDireito,
    repeticoes: rp.pavimento.repeticoes,
    pilares: rp.pavimento.pilares.map((p) => ({
      pilar: doSistrut.chave(p),
      nome: p.nome,
      secao: { forma: "retangular" as const, b: p.b, h: p.h },
      carga: rp.montagem.pilares.find((c) => c.id === p.id)?.nProjeto ?? 0,
    })),
  }));
  const acumulado = cargaAcumulada(cargas, norma.pesoConcreto, doSistrut.fins);
  avisos.push(...acumulado.avisos);

  const resultadoPorId = new Map(pavimentos.map((rp) => [rp.pavimento.id, rp]));

  // ligação viga-pilar nos apoios extremos (só com Norma.ligacaoVigaPilar): as
  // vigas são redimensionadas com o negativo de extremidade antes de marcar as
  // transições, que acrescentam avisos a elas
  const ligacoes = norma.ligacaoVigaPilar
    ? ligacoesPorNivel(acumulado.niveis, resultadoPorId, doSistrut.chave)
    : null;
  if (ligacoes)
    for (const rp of pavimentos) {
      const doPavimento = ligacoes.filter((l) => l?.pavimento === rp);
      rp.vigas = rp.montagem.vigas.map((v) =>
        dimensionarViga(
          v,
          analiseComLigacao(v, v.analise.resultado, doPavimento),
          norma,
          mat,
          obra.materiais.cobrimentoViga,
        ),
      );
      // as falhas das lajes já marcaram as vigas antigas
      if (rp.falhas.length > 0) for (const v of rp.vigas) v.avisos.push(AVISO_VIGA_FALHA);
    }

  for (const t of acumulado.transicoes) {
    const rp = resultadoPorId.get(t.pavimentoId);
    if (rp) marcarFalha(rp, t.aviso);
  }

  const pilares: ResultadoPilar[] = [];
  // falhas dos pavimentos já percorridos (do topo até o nível atual)
  const falhasAcima: string[] = [];
  const vistos = new Set<string>();
  for (const [k, nivel] of acumulado.niveis.entries()) {
    const rp = resultadoPorId.get(nivel.pavimentoId);
    if (!rp) continue;
    if (!vistos.has(nivel.pavimentoId)) {
      vistos.add(nivel.pavimentoId);
      falhasAcima.push(...rp.falhas);
    }
    const pav = rp.pavimento;
    for (const n of nivel.pilares) {
      const pilar = pav.pilares.find((p) => doSistrut.chave(p) === n.pilar);
      // pilar sem lance neste pavimento (a carga só passa): não há seção a dimensionar
      if (!pilar) continue;
      const dLinha = obra.materiais.cobrimentoPilar + ACRESCIMO_ALTURA_UTIL;
      const lig = ligacoes ? momentosLigacao(ligacoes, k, n.pilar, doSistrut.chave) : null;
      const momentos = lig?.momentos ?? { mxTopo: 0, mxBase: 0, myTopo: 0, myBase: 0 };
      const calculado = norma.pilar(
        {
          nome: pilar.nome,
          b: pilar.b,
          h: pilar.h,
          lex: pav.peDireito,
          ley: pav.peDireito,
          nk: n.nk,
          ...momentos,
        },
        mat,
        dLinha,
      );
      const resultado = lig
        ? { ...calculado, memoria: [...lig.memoria, ...calculado.memoria] }
        : calculado;
      const extras: string[] = [];
      if (falhasAcima.length > 0) extras.push(AVISO_PILAR_FALHA);
      const { phi } = resultado.barras;
      if (phi > PHI_MAX_ALTURA_UTIL) {
        const real = obra.materiais.cobrimentoPilar + resultado.estribo.phi / 10 + phi / 20;
        extras.push(
          `Barras de φ ${numAte(phi, 1)} mm (> ${PHI_MAX_ALTURA_UTIL} mm): d' real = c + φt + φ/2 = ${num(real, 2)} cm, maior que o adotado (${num(dLinha, 2)} cm); confira.`,
        );
      }
      const soSistrut = camposSoDoSistrut(pilar);
      if (soSistrut.length > 0)
        extras.push(
          `${pilar.nome}: ${soSistrut.join(", ")} só entram no cálculo pela NB-1/78 (caminho do SISTRUT); aqui o pilar é calculado como o retângulo ${pilar.b} × ${pilar.h} cm, com le = pé-direito e a carga das vigas.`,
        );
      pilares.push({
        pilar,
        pavimentoId: pav.id,
        pavimento: pav.nome,
        repeticao: nivel.repeticao,
        nk: n.nk,
        momentos,
        resultado:
          extras.length > 0
            ? { ...resultado, avisos: [...extras, ...resultado.avisos] }
            : resultado,
        falhas: [...falhasAcima],
      });
    }
  }
  if (obra.parametrosPilar)
    avisos.push(
      "Os parâmetros de pilar da obra (PILAR.INI, .PIP, predimensionamento) só valem pela NB-1/78 (caminho do SISTRUT); esta norma os ignora.",
    );
  return { norma, materiais: mat, pavimentos, pilares, avisos };
}

// ---- ligação viga-pilar (Norma.ligacaoVigaPilar) ------------------------------

const REF_LIGACAO = "6118:2023 14.6.6.1 c) (Bastos, Vigas, p. 15)";

/** Ligações viga-pilar das vigas de um nível (uma repetição de pavimento). */
interface NivelLigacao {
  pavimento: ResultadoPavimento;
  /** Nome do nível, com "(k/n)" no pavimento-tipo. */
  rotulo: string;
  /** Por id da viga (só as de análise ok). */
  vigas: Map<string, LigacaoVigaPilar>;
  /** Chave (ChavePilar) de cada pilar do pavimento, por id. */
  chaves: Map<string, string>;
}

/** Ligação viga-pilar de cada viga em cada nível, alinhada com `niveis` (do topo
 *  para a base). A viga do nível k fica no topo do lance do nível k: lance
 *  inferior = o pilar no pavimento do nível k com o pé-direito dele; superior = o
 *  mesmo pilar (mesma chave) no nível k − 1, ou null sem lance acima (cobertura,
 *  pilar que nasce no nível). */
function ligacoesPorNivel(
  niveis: readonly NivelAcumulado[],
  porId: ReadonlyMap<string, ResultadoPavimento>,
  chavePilar: ChavePilar,
): (NivelLigacao | null)[] {
  const lance = (p: Pilar, altura: number): LancePilar => ({ b: p.b, h: p.h, altura });
  let acima: Pavimento | null = null;
  return niveis.map((nivel) => {
    const rp = porId.get(nivel.pavimentoId);
    if (!rp) return null;
    const pav = rp.pavimento;
    const cima = acima;
    const lances = Object.fromEntries(
      pav.pilares.map((p): [string, LancesDoPilar] => {
        const sup = cima?.pilares.find((q) => chavePilar(q) === chavePilar(p));
        return [
          p.id,
          {
            superior: sup && cima ? lance(sup, cima.peDireito) : null,
            inferior: lance(p, pav.peDireito),
          },
        ];
      }),
    );
    acima = pav;
    return {
      pavimento: rp,
      rotulo: pav.repeticoes > 1 ? `${pav.nome} (${nivel.repeticao}/${pav.repeticoes})` : pav.nome,
      vigas: new Map(
        rp.montagem.vigas
          .filter((v) => v.analise.resultado.ok)
          .map((v) => [v.id, ligacaoVigaPilar(v, lances)]),
      ),
      chaves: new Map(pav.pilares.map((p) => [p.id, chavePilar(p)])),
    };
  });
}

/** A análise da viga com o negativo dos apoios extremos em pilar envolvido com a
 *  ligação: em cada ponta vale o maior em módulo entre a envoltória (rotulada) e
 *  Mvig. No pavimento-tipo, Mvig é o maior em módulo entre as repetições (as
 *  rigidezes dos lances mudam no topo e na base da pilha). O positivo fica o da
 *  viga rotulada, maior e a favor da segurança (Bastos, Vigas, p. 15). */
function analiseComLigacao(
  viga: VigaMontada,
  analise: VigaContinuaResultado,
  niveis: readonly (NivelLigacao | null)[],
): VigaContinuaResultado {
  if (!analise.ok) return analise;
  const ligs = niveis.flatMap((l) => {
    const lig = l?.vigas.get(viga.id);
    return l && lig ? [{ rotulo: l.rotulo, lig }] : [];
  });
  if (ligs.length === 0) return analise;
  const n = analise.tramos.length;
  const mVigaNo = (no: number) =>
    Math.min(
      0,
      ...ligs.flatMap(({ lig }) => lig.extremidades.filter((e) => e.no === no).map((e) => e.mViga)),
    );
  const [esq, dir] = [mVigaNo(0), mVigaNo(n)];

  // memória: uma vez por resultado distinto (no tipo, as repetições do meio se repetem)
  const grupos = new Map<string, { rotulos: string[]; lig: LigacaoVigaPilar }>();
  for (const { rotulo, lig } of ligs) {
    const chave = JSON.stringify(lig.extremidades);
    const g = grupos.get(chave);
    if (g) g.rotulos.push(rotulo);
    else grupos.set(chave, { rotulos: [rotulo], lig });
  }
  const extras: ComMemoria = { avisos: [], memoria: [] };
  for (const { rotulos, lig } of grupos.values()) {
    extras.avisos.push(...lig.avisos);
    if (lig.memoria.length === 0) continue;
    if (ligs.length > 1)
      extras.memoria.push({
        descricao: `Ligação viga-pilar nos níveis ${rotulos.join(", ")}`,
        ref: REF_LIGACAO,
      });
    extras.memoria.push(...lig.memoria);
  }

  const tramos = analise.tramos.map((t, i) => ({
    ...t,
    mNegEsq: i === 0 ? Math.min(t.mNegEsq, esq) : t.mNegEsq,
    mNegDir: i === n - 1 ? Math.min(t.mNegDir, dir) : t.mNegDir,
  }));
  const adotado = (descricao: string, envoltoria: number, valor: number): Etapa => ({
    descricao: `${viga.nome}: negativo no ${descricao}, o maior em módulo entre a envoltória (${num(envoltoria, 2)}) e Mvig`,
    formula: "M = mín(Menv; Mvig)",
    valor,
    unidade: "kN·m",
    ref: REF_LIGACAO,
  });
  const primeiro = analise.tramos[0];
  const ultimo = analise.tramos[n - 1];
  if (primeiro && esq < 0)
    extras.memoria.push(adotado("apoio extremo esquerdo", primeiro.mNegEsq, tramos[0]!.mNegEsq));
  if (ultimo && dir < 0)
    extras.memoria.push(adotado("apoio extremo direito", ultimo.mNegDir, tramos[n - 1]!.mNegDir));
  return {
    ...analise,
    tramos,
    avisos: [...new Set([...analise.avisos, ...extras.avisos])],
    memoria: [...analise.memoria, ...extras.memoria],
  };
}

/** Momentos de 1ª ordem do lance do nível k do pilar `chave`, por direção:
 *  topo = Σ mTopoInferior das vigas do nível k; base = Σ mBaseSuperior das vigas
 *  do nível k + 1, combinados pela Eq. 90 de Bastos (momentosDoLance).
 *  Lance mais baixo do pilar (sem lance no nível de baixo: fundação ou
 *  transição): a base fica sem momento de ligação e o topo sem a parcela
 *  propagada. [VERIFICAR] As fontes lidas não tratam a base na fundação; propagar
 *  −Mtopo/2 (engaste) daria curvatura dupla e αb menor, contra a segurança. */
function momentosLigacao(
  ligacoes: readonly (NivelLigacao | null)[],
  k: number,
  chave: string,
  chavePilar: ChavePilar,
) {
  const atual = ligacoes[k];
  const baixo = ligacoes[k + 1];
  const temLanceAbaixo = baixo?.pavimento.pavimento.pilares.some((p) => chavePilar(p) === chave);
  const soma = (
    nivel: NivelLigacao | null | undefined,
    campo: "mTopoInferior" | "mBaseSuperior",
    d: Direcao,
  ) => {
    let s = 0;
    for (const lig of nivel?.vigas.values() ?? [])
      if (lig.direcao === d)
        for (const e of lig.extremidades) if (nivel?.chaves.get(e.pilarId) === chave) s += e[campo];
    return s;
  };
  const memoria: Etapa[] = [];
  const porDirecao = (d: Direcao) => {
    const topo = soma(atual, "mTopoInferior", d);
    if (!temLanceAbaixo) {
      memoria.push(
        {
          descricao: `M${d},topo: ligação com as vigas do nível (lance mais baixo do pilar)`,
          formula: "Mtopo = Σ Minf",
          valor: topo,
          unidade: "kN·m",
          ref: REF_LIGACAO,
        },
        {
          descricao: `M${d},base: sem viga embaixo (fundação ou transição), sem momento de ligação [VERIFICAR]`,
          valor: 0,
          unidade: "kN·m",
          ref: REF_LIGACAO,
        },
      );
      return { topo, base: 0 };
    }
    const base = soma(baixo, "mBaseSuperior", d);
    const m = momentosDoLance(topo, base);
    memoria.push(
      {
        descricao: `M${d},topo: ligação com as vigas do nível e metade da base`,
        formula: `Mtopo = Σ Minf − Σ Msup,baixo/2 = ${num(topo, 2)} − ${num(base, 2)}/2`,
        valor: m.topo,
        unidade: "kN·m",
        ref: REF_LANCE,
      },
      {
        descricao: `M${d},base: ligação com as vigas do nível de baixo e metade do topo`,
        formula: `Mbase = Σ Msup,baixo − Σ Minf/2 = ${num(base, 2)} − ${num(topo, 2)}/2`,
        valor: m.base,
        unidade: "kN·m",
        ref: REF_LANCE,
      },
    );
    return m;
  };
  const x = porDirecao("x");
  const y = porDirecao("y");
  return {
    momentos: { mxTopo: x.topo, mxBase: x.base, myTopo: y.topo, myBase: y.base },
    memoria,
  };
}

/** Laje com carga e sem nenhuma reação (ex.: vinculação sem tabela na norma) ou
 *  com reação não finita: a carga dela não chega às vigas. */
function lajeSemCalculo(r: ResultadoLaje, pesoConcreto: number) {
  const reacoes = Object.values(r.esforcos.reacoes);
  const c = cargaLaje(r.laje, pesoConcreto);
  return (
    reacoes.some((x) => !Number.isFinite(x)) || (c.g + c.q > 0 && reacoes.every((x) => x === 0))
  );
}

export function calcularPavimento(
  pavimento: Pavimento,
  obra: Obra,
  norma: Norma,
  mat: MateriaisCalc,
  /** Por id da viga, as cargas do SISTRUT (cargasDoSistrutNaV2); ausente = as da montagem. */
  cargasProprias?: Readonly<Record<string, CargasPropriasTramo[]>>,
): ResultadoPavimento {
  // lajes: vinculação pela vizinhança, esforços, compatibilização, armaduras
  const vinc = vinculacao(pavimento.lajes);
  const entradas = pavimento.lajes.map((l): LajeEntrada => {
    const c = cargaLaje(l, norma.pesoConcreto);
    const vinculos = vinc[l.id];
    if (!vinculos) throw new Error(`vinculação ausente para a laje ${l.nome}`);
    // μ vai para a norma; só a NB-1/78 (charneiras) usa
    return { nome: l.nome, lx: l.lx, ly: l.ly, h: l.h, g: c.g, q: c.q, vinculos, mu: l.mu };
  });
  const entradaPorId = new Map(pavimento.lajes.map((l, i) => [l.id, entradas[i]!]));
  const compat = compatibilizaLajes(
    pavimento.lajes.map((laje, i) => {
      const entrada = entradas[i]!;
      return {
        laje,
        vinculos: entrada.vinculos,
        esforcos: norma.lajeEsforcos(entrada, mat),
      };
    }),
    norma.compatibilizaNegativo,
    // bordo aliviado (ao lado de balanço curto) refeito como apoiado; só com a flag
    norma.recalculaBordoAliviado
      ? (l, vinculos) => norma.lajeEsforcos({ ...entradaPorId.get(l.laje.id)!, vinculos }, mat)
      : undefined,
  );
  const lajes = pavimento.lajes.map((laje, i): ResultadoLaje => {
    const entrada = entradas[i]!;
    const esforcos = compat[i]!;
    return {
      laje,
      entrada,
      esforcos,
      armadura: norma.lajeArmadura(entrada, esforcos, mat, obra.materiais.cobrimentoLaje),
    };
  });

  // vigas: montagem das cargas e análise contínua
  const entradaMontagem = {
    pavimento,
    reacoes: Object.fromEntries(lajes.map((r) => [r.laje.id, r.esforcos.reacoes])),
    pesoConcreto: norma.pesoConcreto,
    ...(cargasProprias ? { cargasProprias } : {}),
  };
  const montagem = montarPavimento(entradaMontagem, analisarViga);
  const equilibrio = verificarEquilibrio(entradaMontagem, montagem, 1e-6);
  const vigas = montagem.vigas.map((v) =>
    dimensionarViga(v, v.analise.resultado, norma, mat, obra.materiais.cobrimentoViga),
  );
  const resultado: ResultadoPavimento = {
    pavimento,
    lajes,
    montagem,
    vigas,
    equilibrio,
    falhas: [],
  };
  for (const r of lajes) {
    if (!lajeSemCalculo(r, norma.pesoConcreto)) continue;
    const c = cargaLaje(r.laje, norma.pesoConcreto);
    const carga = (c.g + c.q) * r.laje.lx * r.laje.ly;
    marcarFalha(
      resultado,
      `Laje ${r.laje.nome} sem cálculo: a carga dela (${num(carga, 2)} kN) NÃO chegou às vigas nem aos pilares; vigas e pilares deste pavimento e dos de baixo estão incompletos.`,
    );
  }
  return resultado;
}

/** Viga contínua para a montagem. Reações separadas em g (só permanente) e q:
 *  `reacoes` com q em todos os tramos (reacaoTotal − g, para o equilíbrio fechar)
 *  e `reacoesProjeto` com q só onde aumenta a reação (reacaoMax − g), que vão aos
 *  pilares e às vigas de apoio. As concentradas (vigas apoiadas) levam g e q:
 *  o q entra no caso variável do tramo onde estão. */
export function analisarViga(v: VigaMontada): AnaliseViga {
  const resultado = analisaVigaContinua({
    tramos: v.tramos.map((t) => ({
      comprimento: t.vao,
      g: t.g,
      q: t.q,
      concentradas: t.concentradas.map((c) => ({ a: c.a, g: c.g, q: c.q })),
      ...(t.parciais?.length ? { parciais: t.parciais } : {}),
    })),
    balancoEsquerdo: v.apoios[0]?.tipo === "livre",
    balancoDireito: v.apoios.at(-1)?.tipo === "livre",
  });
  if (!resultado.ok) {
    const nulas = v.apoios.map(() => ({ g: 0, q: 0 }));
    return { reacoes: nulas, reacoesProjeto: nulas, resultado };
  }
  return {
    reacoes: resultado.apoios.map((a) => ({ g: a.reacaoG, q: a.reacaoTotal - a.reacaoG })),
    reacoesProjeto: resultado.apoios.map((a) => ({ g: a.reacaoG, q: a.reacaoMax - a.reacaoG })),
    resultado,
  };
}

/** Armadura longitudinal tracionada na extremidade do tramo, cm², que entra no τc
 *  do cortante (ψ1 da NB-1/78), porte de V1 VcAsLong#: da positiva do vão chega ao
 *  apoio 1/3 quando a extremidade não tem negativo e 1/4 quando tem; havendo
 *  negativo, vale a menor entre essa parcela e a negativa (a favor da segurança).
 *  A V1 marca a regra como RECONSTRUCAO (atribuída à NB-1/78 por fontes
 *  secundárias). Área não finita (seção sem solução) conta como 0. Não é switch:
 *  a V2 segue a V1 nos dois modos. */
export function armaduraLongitudinalCortante(asPos: number, asNeg: number) {
  const pos = Number.isFinite(asPos) ? asPos : 0;
  const neg = Number.isFinite(asNeg) ? asNeg : 0;
  let a = neg > 0 ? pos / 4 : pos / 3;
  if (neg > 0 && (neg < a || a <= 0)) a = neg;
  return Math.max(a, 0);
}

/** Dimensionamento dos tramos (V1 VcDimensiona): d = h − (c + 1,5); Md = γf·M
 *  da envoltória; As com mínima; para o τc de cada extremidade, a parcela da
 *  positiva que chega ao apoio ou a negativa (armaduraLongitudinalCortante);
 *  barras numa camada com cobrimento lateral de 2 cm; estribo de 2 ramos com o
 *  espaçamento máximo da norma (CortanteResultado.sMax).
 *  γf = maior entre γg e γq (a envoltória não separa g e q). */
export function dimensionarViga(
  viga: VigaMontada,
  analise: VigaContinuaResultado,
  norma: Norma,
  mat: MateriaisCalc,
  cobrimento: number,
): ResultadoViga {
  const d = viga.h - cobrimento - ACRESCIMO_ALTURA_UTIL;
  const avisos: string[] = [];
  if (!analise.ok) return { viga, analise, d, tramos: [], avisos: [...analise.avisos] };
  const gf = Math.max(norma.gamaG, norma.gamaQ);
  const secao = (m: number): SecaoViga => {
    if (Math.abs(m) < 1e-9) return { flexao: null, barras: null };
    const flexao = norma.vigaFlexao(gf * Math.abs(m), viga.bw, viga.h, d, mat);
    const barras = Number.isFinite(flexao.as)
      ? escolheBarrasAlma(flexao.as, viga.bw, COBRIMENTO_LATERAL_VIGA)
      : null;
    return { flexao, barras };
  };
  const asLong = (pos: SecaoViga, neg: SecaoViga) =>
    armaduraLongitudinalCortante(pos.flexao?.as ?? 0, neg.flexao?.as ?? 0);
  const tramos = analise.tramos.map((t, i): ResultadoTramo => {
    const nome = `${viga.nome} tramo ${i + 1}`;
    const positivo = secao(t.mPos);
    const negativoEsq = secao(t.mNegEsq);
    const negativoDir = secao(t.mNegDir);
    const cEsq = norma.vigaCortante(gf * t.vEsq, viga.bw, d, asLong(positivo, negativoEsq), mat);
    const cDir = norma.vigaCortante(gf * t.vDir, viga.bw, d, asLong(positivo, negativoDir), mat);
    const cortante = cDir.asw > cEsq.asw ? cDir : cEsq;
    const estribo = escolheEstribo(cortante.asw, d, 2, cortante.sMax);
    for (const s of [positivo, negativoEsq, negativoDir]) {
      if (s.flexao) avisos.push(...s.flexao.avisos.map((a) => `${nome}: ${a}`));
      if (s.flexao && Number.isFinite(s.flexao.as) && !s.barras)
        avisos.push(`${nome}: armadura acima de 8 barras de 32 mm, aumente a seção.`);
      if (s.barras && !s.barras.cabe)
        avisos.push(`${nome}: barras não cabem em uma camada (bw = ${numAte(viga.bw, 1)} cm).`);
      if (s.barras && s.barras.phi > PHI_MAX_ALTURA_UTIL) {
        const real = viga.h - cobrimento - (estribo?.phi ?? 5) / 10 - s.barras.phi / 20;
        avisos.push(
          `${nome}: barras de φ ${numAte(s.barras.phi, 1)} mm (> ${PHI_MAX_ALTURA_UTIL} mm): d real = h − c − φt − φ/2 = ${num(real, 2)} cm, menor que o d adotado (${num(d, 2)} cm); confira.`,
        );
      }
    }
    avisos.push(...cEsq.avisos.map((a) => `${nome}: ${a}`));
    if (cDir !== cEsq) avisos.push(...cDir.avisos.map((a) => `${nome}: ${a}`));
    if (!estribo)
      avisos.push(`${nome}: sem estribo possível para Asw = ${num(cortante.asw, 2)} cm²/m.`);
    return { positivo, negativoEsq, negativoDir, cortante, estribo };
  });
  return { viga, analise, d, tramos, avisos: [...new Set(avisos)] };
}

/** Campos do pilar que só o caminho do SISTRUT (NB-1/78) calcula; o fluxo da V2 os
 *  ignora e avisa. */
function camposSoDoSistrut(p: Pilar) {
  const campos: [unknown, string][] = [
    [p.secao, `seção ${p.secao?.tipo ?? ""}`],
    [p.vinculos ?? p.vinculosTopo, "vínculos"],
    [p.excentricidade, "excentricidade entre seções"],
    [p.vento, "vento"],
    [p.cargaTopo, "carga no topo"],
    [p.verificacoes?.length ? p.verificacoes : undefined, "verificações de seção dada"],
  ];
  return campos.filter(([v]) => v !== undefined).map(([, nome]) => nome);
}

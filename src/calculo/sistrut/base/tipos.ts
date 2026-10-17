// CONTRATOS do módulo `src/calculo/sistrut/`: os tipos de entrada e saída e as
// assinaturas das funções públicas de cada família (lajes, montagem, vigas, pilares,
// quantitativos; v2-paridade/PLANO.md 5.3). É o contrato FINAL que o código
// cumpre: a integração (obra.ts) e a projeção (../fluxoSistrut.ts) usam só estes
// tipos e as funções que os implementam.
// Cada assinatura é um TIPO de função; a implementação a anota para o compilador
// conferir o contrato:
//
//   export const momentosLaje: MomentosLaje = (entrada, modo) => { ... };
//
// Regras: uma família não cria tipo que estende o tipo de saída do contrato nem função
// "irmã" com assinatura própria; o campo novo entra aqui, com o comentário de uso e a
// fonte `.BAS:linha`. Dado opcional que só um chamador tem entra como parâmetro
// opcional no fim da assinatura (ex.: `geometriaPilares` em `MontaPavimento`,
// `extras` em `DetalhaViga`). Onde o original fica em laço sem fim, a implementação
// lança `ErroNaoConverge` (base/f32.ts); erro de execução do QB4.5, `ErroQB`.
//
// Convenções que valem para todos os contratos:
// - UNIDADES DO ORIGINAL, nos dois modos: t, m, cm, t/m, t/m², t/cm², t·m (tm) e
//   t·cm onde o original guarda em t·cm (dito no campo). Exceção deliberada à
//   regra SI do CLAUDE.md; ver `unidades.ts`. Quem converte de/para SI é a
//   integração (T7).
// - `modo: "original"`: algoritmo do original, materiais na unidade da obra (fck
//   0,15 t/cm², CA-50 = 5 t/cm², 2,5 t/m³) e `sng` a cada atribuição (f32.ts).
//   As entradas já chegam em SINGLE (o valor que o original leu do arquivo ou
//   do teclado): quem monta a entrada aplica `sng`.
// - `modo: "corrigido"`: o MESMO algoritmo, em float64, com os materiais SI
//   "redondos" convertidos pela T7 (500 MPa → 5,0986 t/cm²; 25 kN/m³ → 2,549 t/m³)
//   e só os defeitos da seção 4.2 do PLANO (R1-R12) e o item H trocados. Cada
//   contrato diz quais. Use `atribuicao(modo)` de f32.ts.
// - Parâmetros: as tabelas de `parametros.ts` (padrão "SISTRUT"). Os contratos
//   recebem a tabela para permitir testes com parâmetros alterados (caso
//   retrad_laje_param).
// - Referências: `<EXE>.BAS:<linha>` = V1 nova em
//   `_Arquivo/Sistrust/dist/src-original/<família>/`; "livros_x.md N.M" =
//   v2-paridade/apoio/livros_x.md, seção N.M.
// - Resultados de família levam `ComMemoria` (avisos visíveis e memória de
//   cálculo, como o resto da V2). Aviso não esconde resultado.
import type { ComMemoria } from "../../tipos";
import type { Bordo, ClasseAco, Vinculo } from "../../../dominio/obra";
import type { ArmaduraDigitada } from "../../../dominio/obra";
import type { EdicaoVigaSistrut } from "../../../dominio/edicaoViga";
import type {
  EmSingle,
  PARAMETROS_DSP,
  PARAMETROS_LAJE,
  PARAMETROS_PILAR,
  PARAMETROS_PIP,
  PARAMETROS_VIGA,
} from "./parametros";

// ============================================================== comuns

/** "original" reproduz o SISTRUT 4.0; "corrigido" troca só os defeitos R1-R12 e o H. */
export type ModoSistrut = "original" | "corrigido";

/** Ponto em m (coordenadas da planta, como no LAJEGEOM). */
export interface Ponto {
  x: number;
  y: number;
}

/** Materiais e coeficientes, em t/cm². É a ÚNICA fonte de fck, fyk, classe e γ nos
 *  contratos: as cópias dessas grandezas em `parametros.ts` são só os padrões de
 *  onde a T7 monta este objeto (no caso retrad_laje_param, γf 1,5 vem daqui). */
export interface MateriaisSistrut {
  fck: number;
  fyk: number;
  classeAco: ClasseAco;
  /** γf (CSE), γc (CSC), γs (CSA). */
  gamaF: number;
  gamaC: number;
  gamaS: number;
}

/** Tabelas de parâmetros. Aceitam a tabela decimal (corrigido) e `emSingle(tabela)`
 *  (original), sem cast. */
export type ParametrosLaje = EmSingle<typeof PARAMETROS_LAJE>;
export type ParametrosDsp = EmSingle<typeof PARAMETROS_DSP>;
export type ParametrosVicalc = EmSingle<typeof PARAMETROS_VIGA>;
export type ParametrosPilar = EmSingle<typeof PARAMETROS_PILAR>;
export type ParametrosPip = EmSingle<typeof PARAMETROS_PIP>;

// ============================================================== LAJES: dados (LAJEGEOM)

/** Código de bordo do original (A_10fa): 1 = livre (não gira); 0 e 2 = apoiado
 *  (i = 0); > 2 = engastado com i = (código − 2)/10, passo 0,1. 22 = i 2,0, o
 *  que a continuidade automática grava (CINT(2,0·10 + 2), LAJECALC.BAS:3730-3731). */
export type CodigoBordo = number;

/** Tipo da laje (A_10cc(·,1), LAJEGEOM.BAS:3489): 0 maciça, 1 pré-moldada,
 *  2 vazio/fora da numeração, 3 "comum não calculada". */
export type TipoLaje = 0 | 1 | 2 | 3;

/** Uma laje como o LAJEGEOM grava (livros_laje.md 1.0 e 1.2). */
export interface LajeSistrut {
  /** Nome impresso ("L1"). */
  nome: string;
  tipo: TipoLaje;
  /** Polígono sem repetir o primeiro vértice, na ordem do LAJEGEOM (até 30
   *  vértices). Bordo k = vértice k → vértice k+1 (o último fecha no primeiro). */
  vertices: Ponto[];
  /** Índice global de cada vértice (A_109e(p,j)): o LAJEGEOM compartilha vértices
   *  entre lajes por índice, e a continuidade automática compara índices, não
   *  coordenadas (LAJECALC.BAS:3714-3720). */
  indicesVertices: number[];
  /** Grupo da laje (A_10cc(·,3); INFERIDO: nível): só lajes do mesmo grupo têm
   *  continuidade automática (LAJECALC.BAS:3714). */
  grupo: number;
  /** Código de cada bordo, mesmo índice de `vertices`. */
  codigos: CodigoBordo[];
  /** Ângulo da armadura principal, graus, 0 ≤ a < 180 (A_1210(L,0)). */
  angulo: number;
  /** μ = M+ secundário / M+ principal (A_1210(L,1)). ≤ 0 = não informado: o
   *  `EsforcosDoPainel` calcula pelas cordas (`direcaoMu`) nas lajes do tipo 0; > 0 é o
   *  informado e fica. No original o μ é do POLÍGONO (A_1210(A_10cc(i,0)),
   *  LAJECALC.BAS:35ce6), não da laje: quem lê um .LAJ usa o índice do polígono. */
  mu: number;
  /** Carga permanente, t/m² (A_10cc(·,4)). */
  cargaPermanente: number;
  /** Peso próprio digitado, t/m² (A_10cc(·,5)); a imposição de H o regrava. */
  pesoProprio: number;
  /** H imposto, cm (A_12fc(·,0)); ausente = ainda sem H. */
  h?: number;
  /** Positivas impostas pelo usuário no LAJEPROC (A_12fc(i,2..3), código negativo;
   *  LAJEPROC.BAS:451-456): mantidas se suficientes. */
  armaduraImposta?: { principal?: CodigoBarraLaje; secundaria?: CodigoBarraLaje };
}

/** Carga de ocupação por área (A_1014): polígono, total e parcela acidental, t/m²
 *  (0 ≤ acidental < total; LAJEGEOM.BAS:7903, 8475). */
export interface CargaPorArea {
  vertices: Ponto[];
  total: number;
  acidental: number;
}

/** Alvenaria (A_0fe6): trecho e carga por metro, t/m. */
export interface Alvenaria {
  inicio: Ponto;
  fim: Ponto;
  carga: number;
}

/** Código de barra de laje = 1000·índice da bitola + índice 1-based do espaçamento
 *  (`PARAMETROS_LAJE.bitolas`, `.espacamentos`). Negativo = posição imposta pelo
 *  usuário (LAJEPROC.BAS:451). */
export type CodigoBarraLaje = number;

/** Continuidade entre dois bordos (A_11e0): bordo = índice em `codigos`. */
export interface Continuidade {
  lajeA: string;
  bordoA: number;
  /** null = trecho engastado sem laje vizinha (A_11e0(c,2) = −1, LAJECALC.BAS:3959,
   *  "Considero este trecho Engastado"); a otimização (LAJECALC.BAS:4088, 4116) e o
   *  LAJEPROC (LAJEPROC.BAS:809) tratam esse caso. */
  lajeB: string | null;
  bordoB: number;
  /** Armadura imposta na continuidade (A_11e0(c,4)), se houver. Dois formatos, como o
   *  original grava: POSITIVO = o do LAJECALC, CINT(1000·índice da bitola + espaçamento
   *  em cm) (LAJECALC.BAS:4166), que a otimização e o LAJEPROC leem como
   *  área(INT(c/1000))/(c mod 1000)·100 (LAJECALC.BAS:2167; LAJEPROC.BAS:866-868;
   *  `barraImpostaNaContinuidade`); NEGATIVO = o do LAJEPROC, −(1000·índice da bitola +
   *  índice 1-based do espaçamento) (`CodigoBarraLaje`, LAJEPROC.BAS:451). */
  armaduraImposta?: CodigoBarraLaje;
}

/** Painel de lajes de um pavimento, como o LAJECALC o recebe. */
export interface PainelLajes {
  lajes: LajeSistrut[];
  cargasPorArea: CargaPorArea[];
  alvenarias: Alvenaria[];
  continuidades: Continuidade[];
  /** true: `continuidades` e os códigos já vêm confirmados (o assistente trecho a
   *  trecho da opção 1, LAJECALC.BAS:3543) e a continuidade automática não roda, mesmo
   *  com a lista vazia. Ausente/false: automática quando a lista vem vazia. */
  continuidadesConfirmadas?: boolean;
}

// ============================================================== T1 LAJE: esforços
// Arquivos: sistrut/lajes/charneiras.ts, coeficiente.ts, momentos.ts, continuidade.ts,
// esforcos.ts.
// Especificação: livros_laje.md 1.3-1.8; PLANO L1-L4, L13. Modo corrigido: sem
// diferença de algoritmo (só precisão e materiais).

/** Continuidade automática (LAGEOCAL, LAJECALC.BAS:3690-3731; livros_laje.md 1.3):
 *  zera os códigos ≠ 1, e todo par de lajes do tipo 0 e do mesmo `grupo` com um
 *  lado de MESMOS dois `indicesVertices` (qualquer sentido) vira continuidade com
 *  código 22 nos dois lados. As confirmações trecho a trecho do assistente
 *  (LAJECALC.BAS:3543) chegam prontas em `PainelLajes.continuidades`.
 *  Atribuição sugerida: T1 (o PLANO não deu dono à L4). */
export type ContinuidadeAutomatica = (
  lajes: readonly LajeSistrut[],
  parametros: ParametrosLaje,
) => { lajes: LajeSistrut[]; continuidades: Continuidade[] };

/** Direção e μ (GOSUB L_3744e, LAJECALC.BAS:4801-4971; livros_laje.md 1.4): maior
 *  corda em 9 retas paralelas ao ângulo e a +90°; razão = corda(a)/corda(a+90);
 *  μ = o da última linha de `relacaoMu` com relação < razão (sem interpolar).
 *  E2E 4×5 a 0°: razão 0,80 → μ 0,80. */
export type DirecaoMu = (
  vertices: readonly Ponto[],
  angulo: number,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => { razao: number; mu: number };

/** Uma região do padrão de charneiras: a parte da laje que gira em torno de um
 *  bordo não livre. */
export interface RegiaoCharneira {
  /** Índice do bordo (em `vertices`). */
  bordo: number;
  /** Polígono da região (bordo + charneiras + cumeeira). */
  poligono: Ponto[];
  /** Área, m². Na montagem é a área de influência do bordo (E2E L1: 2,93/4,39/7,61/5,07). */
  area: number;
}

/** O padrão no formato do original, para o coeficiente de carga rodar sobre ele: o
 *  coeficiente precisa saber de que vértice sai cada charneira e quais vértices são
 *  colineares (LAJECALC.BAS:8172-8411). */
export interface PadraoBruto {
  /** Polígono de trabalho, sem repetir o primeiro vértice. */
  poligono: Ponto[];
  /** Código de cada bordo (DOUBLE; ver `EstadoLajecalc.carregaPoligono`). */
  codigos: number[];
  tipo: number;
  /** Linhas 1..n de A_160c (x0, y0, x1, y1; x0 < 0 = −índice do vértice) e de A_163a. */
  segmentos: [number, number, number, number][];
  nos: [number, number, number][];
}

/** Saída do padrão de charneiras (A_160c segmentos, A_163a nós). */
export interface PadraoCharneiras {
  /** Charneiras e cumeeiras (até 100 segmentos). */
  segmentos: { inicio: Ponto; fim: Ponto }[];
  /** Uma região por bordo não livre. */
  regioes: RegiaoCharneira[];
  /** A_160c e A_163a como o original os guarda (entrada do `CoeficienteDeCarga`). */
  bruto: PadraoBruto;
}

/** Padrão de charneiras do LAJECALC para um polígono qualquer (LAMONTLB S_4019b,
 *  LAJECALC.BAS:4980-7128; livros_laje.md 1.6): bissetriz ponderada
 *  φ = ATN(SIN(b−a)/(SQR((i2+1)/(i1+1)) + COS(b−a))) (LAJECALC.BAS:3300-3304), com o i
 *  do bordo truncado em 2 casas (LAJECALC.BAS:3425), interseções, limpeza (0,005),
 *  bordos livres (6898-6941). `codigos` = código de cada bordo (`CodigoBordo`); `tipo`
 *  1 (pré-moldada) pula o tratamento de bordos livres (LAJECALC.BAS:6657); padrão 0.
 *  Polígono horário, como o LAJEGEOM grava (Σ(x_k + x_k+1)(y_k − y_k+1)/2 > 0,
 *  LAJEGEOM.BAS:3110-3115); anti-horário lança erro.
 *  Só o LAJECALC usa (polígono girado e afim, lajes/charneiras.ts). A montagem tem o
 *  porte próprio do LAJEMONT (montagem/charneiras.ts): coordenadas reais, i sem
 *  truncar, bordo livre até o meio do bordo e ramo de pré-moldada. */
export type PadraoDeCharneiras = (
  vertices: readonly Ponto[],
  codigos: readonly CodigoBordo[],
  parametros: ParametrosLaje,
  modo: ModoSistrut,
  tipo?: TipoLaje,
) => PadraoCharneiras;

/** i de cada bordo: Σ(código−2)·L_k/(10·L) sobre os trechos colineares agrupados,
 *  só códigos > 2, sem arredondar (LAJECALC.BAS:6999-7043). */
export type IDoBordo = (
  vertices: readonly Ponto[],
  codigos: readonly CodigoBordo[],
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => number[];

/** Preparação da laje (LACALCU SUB 1, LAJECALC.BAS:7128-7255; livros_laje.md 1.5):
 *  alvenaria sobre bordo livre (fator 0 em bordo apoiado/engastado), cargas por
 *  área recortadas, giro pelo ângulo com INT(100·v)/100 e afinidade por √μ. */
export interface LajePreparada {
  /** Polígono girado, transladado e afim (base do coeficiente de carga). */
  poligono: Ponto[];
  /** Σ alvenaria dentro da laje × fator, t (A_10cc(0,2)). */
  alvenaria: number;
  /** Σ área(carga ∩ laje)·total, t (A_10cc(0,3)). */
  cargaArea: number;
  /** Σ área(carga ∩ laje)·acidental, t (A_10cc(0,4)); só vai para o .VIG. */
  cargaAreaAcidental: number;
  /** Área da laje, m² (A_10cc(I,2)). */
  area: number;
}
export type PreparaLaje = (
  laje: LajeSistrut,
  painel: PainelLajes,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => LajePreparada;

/** Termos do coeficiente de carga (LACALCU SUB 2, LAJECALC.BAS:8172-8411;
 *  livros_laje.md 1.7 e 2.1: no E2E l_1a + l_32 = 38,36, l_1e/3 = 18,2491,
 *  l_22 = 1,5052, l_26 = 2,1955, coef 2,0180). */
export interface CoeficienteCarga {
  coeficiente: number;
  l1a: number;
  l32: number;
  l1e: number;
  l22: number;
  l26: number;
  l2a: number;
  l2e: number;
}
/** coef = (l_1a + l_32 + (1 + cantos)·l_2a − 2·l_22)/(l_1e/3 + l_2e − l_26/3)
 *  (LAJECALC.BAS:8408); se l_1a = 0, troca o sinal (8410). O i de cada bordo sai dos
 *  códigos guardados em `padrao.bruto` (LAJECALC.BAS:8742-8757). */
export type CoeficienteDeCarga = (
  padrao: PadraoCharneiras,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => CoeficienteCarga;

/** Momentos de uma laje com H dado (LAJECALC.BAS:616-661, 824-880, 1906-1934;
 *  livros_laje.md 1.8 e 2.2). */
export interface MomentosDeLaje {
  nome: string;
  h: number;
  /** Carga total q(H) = (alvenaria + cargaArea)/área + H·densidade/100 + permanente, t/m². */
  q: number;
  /** q(H) antes do arredondamento: o original divide q ainda em precisão estendida
   *  pelo coeficiente e só então grava V_1400! (LAJECALC.BAS:875). */
  qSemArredondar: number;
  /** p = q/coef (V_1400!, SINGLE no original), t/m; M+ = 100·p. A espessura usa este p
   *  para o M− bit a bit. */
  p: number;
  /** Peso próprio de H, t/m² (sai de H, não do digitado). */
  pesoProprio: number;
  coeficiente: CoeficienteCarga;
  /** M+ principal em t·cm/m, como o original guarda (A_12fc(i,1) = 100·q/coef).
   *  Balanço (l_1a = 0): coeficiente e M+ negativos; o original imprime max(M+, 0)
   *  (LAJECALC.BAS:12417) e o M− é |M+|·c. */
  mPositivoPrincipalTcm: number;
  /** M+ secundário = M+·μ (μ ≤ 1) ou M+/μ, t·cm/m. */
  mPositivoSecundarioTcm: number;
  /** M− = M+·c_max e M+·c_min, t·cm/m (0 sem engaste). */
  mNegativoMaiorTcm: number;
  mNegativoMenorTcm: number;
  /** Por bordo: fator de direção e coeficiente (código−2)/10·fator (0 se não engastado). */
  bordos: { fatorDirecao: number; coeficiente: number }[];
}
export interface EntradaMomentosLaje {
  laje: LajeSistrut;
  preparada: LajePreparada;
  /** H em cm; padrão `laje.h`. */
  h: number;
  parametros: ParametrosLaje;
}
export type MomentosLaje = (entrada: EntradaMomentosLaje, modo: ModoSistrut) => MomentosDeLaje;

/** Imposição de H (LAJECALC opção 4, LAJECALC.BAS:1171-1248; livros_laje.md 1.12):
 *  H inteiro em [Hmin, Hmax], só tipos 0 e 3; grava H e regrava o peso próprio
 *  A_10cc(i,5) = H·densidade/100 (é o que a montagem, T6, usa). Fora da faixa ou do
 *  tipo: devolve a laje como veio e um aviso. Atribuição sugerida: T1. */
export type ImpoeEspessura = (
  laje: LajeSistrut,
  h: number,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => { laje: LajeSistrut; avisos: string[] };

/** Esforços de todas as lajes do painel (LAJECALC opções 1, 2 e 5). Entrada da T2.
 *  O que não depende de H (preparação, coeficiente de carga, fatores por bordo)
 *  existe para toda laje calculável; `momentos` só para as lajes com H. */
export interface EsforcosLajes extends ComMemoria {
  lajes: LajeSistrut[];
  continuidades: Continuidade[];
  preparadas: Record<string, LajePreparada>;
  coeficientes: Record<string, CoeficienteCarga>;
  /** Por laje e bordo: fator de direção e (código−2)/10·fator. */
  bordos: Record<string, { fatorDirecao: number; coeficiente: number }[]>;
  momentos: Record<string, MomentosDeLaje>;
}
export type EsforcosDoPainel = (
  painel: PainelLajes,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => EsforcosLajes;

/** Otimização dos negativos já ligada aos materiais e parâmetros (a `OtimizaNegativos`
 *  da T2): recebe os esforços e o recálculo de uma laje com os códigos novos. */
export type OtimizacaoInjetada = (
  esforcos: EsforcosLajes,
  recalcula: (laje: LajeSistrut) => MomentosDeLaje,
) => EsforcosLajes;

/** `EsforcosDoPainel` com a otimização dos negativos injetada (LAJECALC opção 6 depois
 *  da 5). O recálculo da mesma laje mais de `LIMITE_RECALCULOS` vezes lança
 *  `ErroNaoConverge` (o laço do R3). Sem `otimiza` = `EsforcosDoPainel`. */
/** `paraNaPrimeiraFalha`: como a opção 5 "todas" do original, o erro de execução do
 *  QuickBASIC (`ErroQB`) numa laje volta ao menu (ON ERROR, LAJECALC.BAS:169-174) e as
 *  lajes seguintes ficam sem cálculo. Ausente = calcula as outras. */
export type EsforcosDoPainelCom = (
  otimiza?: OtimizacaoInjetada,
  paraNaPrimeiraFalha?: boolean,
) => EsforcosDoPainel;

// ============================================================== T2 LAJE: flexão, barras, espessura, LAJEPROC
// Arquivos: sistrut/lajes/flexao.ts, barras.ts, espessura.ts, proc.ts (e
// otimizacao.ts, atribuição sugerida: o PLANO não deu dono à L5).
// Especificação: livros_laje.md 1.9-1.14, 1.16, 2.3-2.5; PLANO L5-L10.
// Modo corrigido: R1 (flecha na espessura), R2 (vizinho no LAJEPROC), R3
// (otimização que não converge).

/** Seção de laje (b = 100 cm) com M em t·cm/m (LAJECALC.BAS:929-953,
 *  LAJEPROC.BAS:998-1022; livros_laje.md 1.9). */
export interface SecaoLaje {
  mTcm: number;
  h: number;
  negativa: boolean;
}
export interface FlexaoDeLaje {
  /** false quando X² < Y ou x/d > ξlim (o original grava x = −1 e imprime −1). */
  passa: boolean;
  x: number;
  xd: number;
  /** As em cm²/m já com o mínimo (taxa·H) e, na negativa, ÷ eficiência. */
  as: number;
}
export type FlexaoLaje = (
  secao: SecaoLaje,
  materiais: MateriaisSistrut,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => FlexaoDeLaje;

/** Escolha de bitola e espaçamento (LAJECALC.BAS:959-995, LAJEPROC.BAS:1024-1060;
 *  livros_laje.md 1.10): bitola por H, maior s que serve, s ≥ mínimo por H, s ≤ 2H.
 *  E2E: As 2,13 com H 10 → # 6.3 c/12.5. */
export type BarraDeLaje =
  | {
      ok: true;
      indiceBitola: number;
      indiceEspacamento: number;
      bitola: number;
      espacamento: number;
      area: number;
      codigo: CodigoBarraLaje;
    }
  | { ok: false };
export type EscolheBarraLaje = (
  as: number,
  h: number,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => BarraDeLaje;

/** Espessura mínima de uma laje (LAJECALC.BAS:818-869; livros_laje.md 1.11):
 *  H de Hmin a Hmax, passo 1, só por flexão (negativa máxima e positiva); fica a
 *  seção de maior x. Corrigido (R1): verifica também a flecha (L/f 300/500 do .LAP)
 *  e inclui na procura de H. E2E: H 7,0, x/d 0,382, # 6.3 c/ 7.5.
 *  Sem lista de avisos: a etapa (LAJECALC opção 3) só imprime "H necessario > H maximo
 *  configurado" (`ok: false`, LAJECALC.BAS:800-809) e "espac/bitola" quando nenhuma barra
 *  serve (`barra.ok: false`, LAJECALC.BAS:756-785); não há outro aviso a reproduzir. */
export type EspessuraDeLaje =
  | {
      ok: true;
      h: number;
      xd: number;
      barra: BarraDeLaje;
      pesoProprio: number;
      q: number;
      /** Só no corrigido (R1): flecha e limite, cm. No original a coluna L/f imprime 0. */
      flecha?: { flecha: number; limite: number };
    }
  /** "H necessario > H maximo configurado": o original grava H = −1. */
  | { ok: false };
/** Dados da flecha do modo corrigido (R1): retângulo equivalente lx × ly (m), vínculos
 *  dos quatro bordos e a parcela acidental da carga (t/m²). A permanente é q(H) −
 *  acidental. */
export interface DadosFlechaLaje {
  lx: number;
  ly: number;
  vinculos: Record<Bordo, Vinculo>;
  acidental: number;
}
/** `momentosComH(h)` = momentos da laje com esse H; a T7 liga no `MomentosLaje` da
 *  T1. Os testes da T2 montam esse callback com o coeficiente das contas à mão
 *  (E2E: coef 2,0180, livros_laje.md 2.1) e não dependem da T1. `flecha` só conta no
 *  corrigido (R1); sem ela, só a flexão. */
export type EspessuraMinimaLaje = (
  momentosComH: (h: number) => MomentosDeLaje,
  materiais: MateriaisSistrut,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
  flecha?: DadosFlechaLaje,
) => EspessuraDeLaje;

/** Armaduras de uma laje com H (LAJECALC.BAS:663-731; livros_laje.md 1.13): As+
 *  principal com max(M+, 0); As− só se M > 0 (senão 0); −1 quando a seção não passa. */
export interface ArmadurasDeLaje {
  nome: string;
  h: number;
  /** x/d da seção de maior x (impresso na imposição). */
  xd: number;
  asPositivaPrincipal: number;
  asPositivaSecundaria: number;
  asNegativaMaior: number;
  asNegativaMenor: number;
  /** Barra da seção de maior x (relatório de imposição). */
  barra: BarraDeLaje;
}
export type ArmadurasLaje = (
  momentos: MomentosDeLaje,
  materiais: MateriaisSistrut,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => ArmadurasDeLaje;

/** Otimização dos negativos (LAJECALC.BAS:2021-2205; livros_laje.md 1.14). No modo
 *  original roda sempre (decisão 4 do dono). Lado maior: coef = INT(100·coef·M2/M1)/100
 *  ≥ mínimo, tolerância 10 %, código = CINT(coef·10 + 2), recalcula a laje e repete;
 *  armadura imposta: 1,03·As_imp e max(As_imp/As_nec; 0,85). `recalcula` é o
 *  `MomentosLaje` da T1 sobre a laje com os códigos novos.
 *  Corrigido (R3): guarda o coeficiente com 2 casas (ou para quando o código não
 *  muda) e não entra em laço. */
export type OtimizaNegativos = (
  esforcos: EsforcosLajes,
  recalcula: (laje: LajeSistrut) => MomentosDeLaje,
  materiais: MateriaisSistrut,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => EsforcosLajes;

/** Uma posição de armadura do LAJEPROC. */
export interface PosicaoLajeproc {
  mTcm: number;
  as: number;
  /** '*' (seção não passa, As 0) quando `barra.ok` é false e as = 0. */
  barra: BarraDeLaje;
}
/** LAJEPROC (LAJEPROC.BAS:298-1060; livros_laje.md 1.16 e 2.5): refaz As de H e M+;
 *  positivas por laje; UMA negativa por continuidade, com a maior As dos dois lados
 *  e a barra pelo H da laje corrente; posição imposta mantida se suficiente. Pula os
 *  tipos 1 e 3. Não calcula peso de aço. Corrigido (R2): recalcula sempre o vizinho,
 *  mesmo com lado de mesmo número. E2E L1: # 6.3 c/ 20, c/ 20, c/12.5, c/17.5. */
export interface ResultadoLajeproc extends ComMemoria {
  positivas: Record<string, { principal: PosicaoLajeproc; secundaria: PosicaoLajeproc }>;
  /** Mesmo índice de `esforcos.continuidades`. `vizinhoNaoRecalculado`: só no original, o
   *  vizinho que o LAJEPROC pulou por ter o lado de mesmo número (R2, LAJEPROC.BAS:843-874). */
  negativas: (PosicaoLajeproc & { continuidade: Continuidade; vizinhoNaoRecalculado?: string })[];
}
export type Lajeproc = (
  esforcos: EsforcosLajes,
  materiais: MateriaisSistrut,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) => ResultadoLajeproc;

// ============================================================== T6 MONTAGEM lajes → vigas (LAJEMONT)
// Arquivos: sistrut/montagem/ (reacoes.ts, vigas.ts, charneiras.ts, regioes.ts,
// cargas.ts). Especificação: livros_laje.md 1.15 e 2.6; PLANO M1-M4. O padrão de
// charneiras é o porte próprio do LAJEMONT (montagem/charneiras.ts, não o
// `PadraoDeCharneiras` do LAJECALC): coordenadas reais, sem giro nem afinidade, i de
// cada bordo sem truncar (muda depois da otimização), bordo livre até o meio do bordo
// e ramo da pré-moldada.
// Convenções: índice de bordo 0-based em `vertices`; J do pilar pelo número do nome
// ("P7" → 7); no modo original os eixos vêm em ordem crescente, como o LAJEGEOM grava.
// Modo corrigido: sem diferença de algoritmo.

/** Elemento sob um bordo de laje: viga (carga por metro) ou pilar (carga total). */
export type ApoioDeBordo = { tipo: "viga"; viga: string } | { tipo: "pilar"; pilar: string };

/** Reação de um bordo (LAJEMONT.BAS:2655-2760): área da região, cargas por metro
 *  (÷ comprimento do bordo se o apoio é viga) e total. Arestas com área ≤ 0,005 são
 *  omitidas. E2E L1 → V4: área 4,39; área 0,13, estru 0,09, peso 0,22 t/m.
 *  Bordo sem viga nem pilar: o original imprime a linha com o apoio em branco e soma a
 *  carga no total dos pilares. Aqui a reação NÃO entra na lista (`apoio` nunca é
 *  null); a carga vai para `MontagemPavimento.totais.pilares`, como no original, e sai
 *  um aviso com a laje, o bordo e a carga. */
export interface ReacaoDeBordo {
  laje: string;
  bordo: number;
  apoio: ApoioDeBordo;
  comprimento: number;
  area: number;
  /** alvenaria/L, t/m. */
  linear: number;
  /** cargaArea/L ("Área"), t/m. */
  cargaArea: number;
  /** permanente·A/L ("Estru"), t/m. */
  estrutura: number;
  /** pesoProprio·A/L ("Peso"; 0 no tipo 1), t/m. */
  peso: number;
  /** parcela acidental·A/L, t/m (vai para o .VIG). */
  acidental: number;
}

/** Peso próprio de viga em kg/m INTEIRO: CINT(v·1000) (LAJEMONT.BAS:5124). Um valor
 *  predominante e exceções por viga. */
export interface PesoProprioVigas {
  predominanteKgPorM: number;
  excecoes: Record<string, number>;
}

/** Eixo de uma viga no pavimento, com os apoios (pilares ou outras vigas) em ordem. */
export interface EixoViga {
  nome: string;
  /** Pontos em ordem crescente (no modo original é obrigatório: o LAJEGEOM grava assim). */
  pontos: Ponto[];
  /** Por ponto: pilar, viga (apoio em viga, escolha do usuário, U43-006) ou nada. O
   *  "apoia em" de um cruzamento sem pilar não fica no .LAJ: chega por aqui (`{viga}`). */
  apoios: ({ pilar: string } | { viga: string } | null)[];
  /** Balanço na ponta inicial/final (código de nó 0/1000/2000/3000/4000, U42-008). */
  balancoInicio: boolean;
  balancoFim: boolean;
}

/** Montagem do pavimento: reações e .VIG (entrada da T3). Totais do painel como no
 *  relatório (E2E: cargas por área 12,00; peso das vigas 7,38; lajes 20,00;
 *  estrutura 8,00; painel 47,38). Aviso se Σ áreas difere mais de 3 % da laje.
 *  Inércia relativa gravada no .VIG: J = 1 + VAL(número do pilar do apoio)/100000
 *  (LAJEMONT.BAS:4125-4132, 4167; ex.: 1,00007), e 1,00471 no tramo 0 sem número
 *  (LAJEMONT.BAS:4128). A T3 usa o J bruto: um bit muda o x impresso (1.88 × 1.87),
 *  então a T6 reproduz essa regra e confere com o .VIG do caso b.
 *  Peso próprio das lajes: sai de `laje.pesoProprio` (o digitado, regravado pela
 *  imposição de H). O defeito R4 (peso digitado ≠ H) não se aplica na V2: a T7 grava
 *  pesoProprio = H·densidade/100 nos dois modos. */
export interface MontagemPavimento extends ComMemoria {
  reacoes: ReacaoDeBordo[];
  /** O .VIG gravado, com `inerciasBrutas`, `registro` e `alvenariasSobreViga`. */
  vigas: DadosViga[];
  /** Totais "Considerados" do relatório (LAJEMONT.BAS:387-468), t. */
  totais: {
    cargasPorArea: number;
    pesoProprioVigas: number;
    pesoProprioLajes: number;
    estrutura: number;
    alvenarias: number;
    painel: number;
    vigas: number;
    pilares: number;
    /** "Total das Cargas por Area": Σ área do polígono × total, antes do "Considerado". */
    cargasPorAreaNominal: number;
    /** "Total das Cargas Lineares": Σ comprimento × carga das alvenarias. */
    alvenariasNominal: number;
  };
}

/** Pilar como o LAJEGEOM grava (A_1156): segmento x1, y1, x2, y2 (pontual quando as
 *  duas pontas coincidem; pilar-parede quando não) e nome (A_1128$). */
export interface PilarMontagem {
  nome: string;
  inicio: Ponto;
  fim: Ponto;
}

/** Bordo do `apoiosDosBordos` com índice 0-based em `vertices`. Apoio null: procura a
 *  viga com um trecho igual ao bordo, como o original. `geometriaPilares` (A_1156):
 *  com ela, o pilar de cada ponto de viga, o pilar-parede, o bordo de laje apoiado em
 *  pilar-parede e a alvenaria sobre ele saem como no original; sem ela, os pilares de
 *  `EixoViga.apoios`. */
export type MontaPavimento = (
  esforcos: EsforcosLajes,
  painel: PainelLajes,
  eixos: readonly EixoViga[],
  apoiosDosBordos: (laje: string, bordo: number) => ApoioDeBordo | null,
  pesoProprio: PesoProprioVigas,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
  geometriaPilares?: readonly PilarMontagem[],
) => MontagemPavimento;

// ============================================================== T3 VIGA: análise (VIGA/VICALC)
// Arquivos: sistrut/vigas/vicalc.ts, rep.ts. Especificação: livros_viga_pilar.md 1.1-1.4 e
// 3.1; PLANO V1-V10. Modo corrigido: R5 (.REP sem truncar as parcelas; arredonda o
// total), R6 (redução dos negativos limitada a 0,15..1 e % gerada a 4..96).

/** Uma divisão de carga do tramo (registro do .VIG; VIGA.BAS:1087-1356). P vale do
 *  fim da divisão anterior até D; F é concentrada em D. P e F são TOTAIS; Pac e Fac
 *  são a parte acidental (só usadas com acidentais "S"). */
export interface DivisaoCarga {
  /** t/m. */
  p: number;
  /** Abscissa do fim, m, a partir do apoio esquerdo do tramo. No balanço esquerdo as
   *  divisões vêm na ordem do registro do .VIG (da ponta para o apoio) e D é medido a
   *  partir do APOIO. */
  d: number;
  /** t. */
  f: number;
  pAcidental: number;
  fAcidental: number;
  /** Carga indexada "*n.aa": F = reação do apoio `apoio` da viga `viga`,
   *  INT(R·1000)/1000 (VIGA.BAS:1697-1706). */
  indexada?: { viga: string; apoio: number };
}

export interface TramoViga {
  /** m. */
  vao: number;
  /** Inércia relativa J, valor bruto do .VIG (1,00007 etc.; VIGA.BAS:1396-1397). */
  inercia: number;
  divisoes: DivisaoCarga[];
}

/** Dados de uma viga contínua (registro de 855 bytes do .VIG; livros_viga_pilar.md 1.2). */
export interface DadosViga {
  nome: string;
  /** Tramos internos 1..n (n ≤ 12). */
  tramos: TramoViga[];
  balancoEsquerdo?: TramoViga;
  balancoDireito?: TramoViga;
  engasteEsquerdo: boolean;
  engasteDireito: boolean;
  /** Momentos externos nos apoios extremos, tm (só com momentos externos "S"). */
  momentosExternos: [number, number];
  /** Pilar de cada apoio 0..n (null = '*', apoio desconsiderado). */
  pilares: (string | null)[];
  /** Só no .VIG gravado pela montagem (`MontagemPavimento.vigas`): J bruto de cada
   *  tramo 0..n (+ n+1 com balanço direito), A_1c36. O .VIG grava J(0) mesmo sem
   *  balanço (1,00471 no tramo 0 sem número; LAJEMONT.BAS:4128); `tramos` só tem 1..n. */
  inerciasBrutas?: number[];
  /** Só na montagem: campos do registro de 855 bytes do .VIG, para conferir com o
   *  arquivo do original: A_1bda, por tramo 0..13 A_1c64/A_1c92/A_1c08/A_1c36, por
   *  divisão 0..30 A_1af4/A_1b50/A_1b7e/A_1b22/A_1bac (S_33d84, LAJEMONT.BAS:5170-5393). */
  registro?: RegistroVig;
  /** Só na montagem: linhas do quadro "ALVENARIAS SOBRE AS VIGAS" (LAJEMONT.BAS:
   *  4318-4380): tramo, divisão no tramo, peso próprio e alvenaria, t/m. */
  alvenariasSobreViga?: { tramo: number; divisao: number; peso: number; alvenaria: number }[];
}

/** Vetores do registro do .VIG (ver `DadosViga.registro`). */
export interface RegistroVig {
  bda: number[];
  c64: number[];
  c92: number[];
  c08: number[];
  c36: number[];
  p: number[];
  d: number[];
  f: number[];
  pac: number[];
  fac: number[];
}
// Índices de viga em todos os contratos: tramos[t − 1] = tramo t do original
// (1..n); apoios[k] = apoio k (0..n), entre tramos[k − 1] e tramos[k]. Os balanços
// (os "tramos" 0 e n+1 do original) ficam SEMPRE em campos próprios
// (`balancoEsquerdo`, `balancoDireito`), nunca dentro de `tramos`. A ponta livre do
// balanço não é apoio.

/** Linha "max" da envoltória de um tramo (só com acidentais "S"; VIGA.BAS:7233-7469,
 *  7583-7591): Ve/Vd de maior módulo entre máximo e mínimo, x e M+ máximos e a flecha
 *  f·EJ da envoltória (ST_1a8c(t+14), VIGA.BAS:7591). O Ve e o M esquerdo do
 *  carregamento que dá o M+ máximo (A_17c4), que a flecha do DESDIM usa, saem do DESCALC
 *  (`EsforcosTramoDesdim.veFlecha`/`mEsquerdo`). */
export interface EnvoltoriaTramo {
  ve: number;
  vd: number;
  x: number;
  mPositivo: number;
  fEJ: number;
}

export interface ApoioAnalisado {
  /** M no apoio, tm (negativo = tração em cima), já reduzido. */
  m: number;
  /** Reação estática, t. */
  r: number;
  rMax: number;
  rMin: number;
  /** Momento máximo da envoltória (= m sem acidentais). */
  mMax: number;
}

export interface TramoAnalisado {
  ve: number;
  vd: number;
  /** Abscissa do M+ (cortante nulo), m, a partir do apoio esquerdo do tramo. */
  x: number;
  mPositivo: number;
  /** Flecha f·EJ no x do M+ (informativa). */
  fEJ: number;
  envoltoria?: EnvoltoriaTramo;
}

/** Linha da tabela "Esforcos de Engastamento Perfeito" (VIGA.BAS:7138-7182, 7636-7640):
 *  o original imprime tramo, Ve, x, M+ e Vd. `mEsquerdo` é o momento do apoio esquerdo
 *  no estado de engastamento (V_1c04 antes do GOSUB); `mDireito` não é calculado pelo
 *  original: sai por simetria, −((bf0+bf4)·B·bf4 − A·bf0·bf4)/(bf0+bf4+1), sem Mext. */
export interface LinhaEngastamentoPerfeito {
  tramo: number;
  ve: number;
  x: number;
  mPositivo: number;
  vd: number;
  mEsquerdo: number;
  mDireito: number;
}

/** Análise pelo método dos focos (S_40243, VIGA.BAS:6984-7785). Caso b V1: M(1)
 *  −0,97; Ve 0,73; x 1,50; M+ 0,55; Vd 1,22; R 0,73/2,43/0,73; f·EJ 0,66; MEP −0,65. */
export interface AnaliseViga extends ComMemoria {
  nome: string;
  /** Apoios 0..n; R(k) = Vd(k) + Ve(k+1), com a carga do balanço nas pontas. */
  apoios: ApoioAnalisado[];
  /** Tramos internos 1..n (índice t − 1). */
  tramos: TramoAnalisado[];
  /** Balanços: momento que impõem no apoio extremo (tm) e carga total (t)
   *  (VIGA.BAS:7039-7072). */
  balancoEsquerdo?: { mApoio: number; carga: number };
  balancoDireito?: { mApoio: number; carga: number };
  somaReacoes: number;
  /** MEP dos extremos: −(2A−B)/3 do tramo 1 e −(2B−A)/3 do tramo n, tm. */
  mepEsquerdo: number;
  mepDireito: number;
  /** Momentos levados aos pilares extremos (A_0fc4(2..3), VIGA.BAS:7666-7673):
   *  INT(mult·100·MEP)/10000; |Mmax| com engaste; 0 com balanço. */
  momentosPilar: [number, number];
  /** Tramos com M+ de engastamento perfeito > 1,01·M+ (tabela informativa). */
  engastamentoPerfeito: LinhaEngastamentoPerfeito[];
  /** Vãos dos tramos 1..n, m (o .REP escreve "[L]" do tramo extremo). */
  vaos: number[];
}
export type AnalisaViga = (
  viga: DadosViga,
  parametros: ParametrosVicalc,
  modo: ModoSistrut,
) => AnaliseViga;

/** Resultado de `AnalisaVigas`: as análises na ordem em que o original as processa e
 *  as vigas que ficaram sem processar ("AS VIGAS ... NAO FORAM PROCESSADAS"). */
export interface AnaliseDeVigas {
  analises: AnaliseViga[];
  naoProcessadas: string[];
  /** As vigas da entrada, na mesma ordem, com as cargas indexadas resolvidas (F e Fac
   *  gravados, sem `indexada`): o .VIG que o DESDIM lê depois do VIGA. */
  vigas: DadosViga[];
}
/** Opção 2 do VIGA (VIGA.BAS:1610-1706): em passadas sobre a lista, analisa cada viga
 *  sem carga indexada pendente e resolve as cargas das outras vigas que apontam para
 *  ela. Apoio inexistente na viga de origem deixa a carga pendente (U61-019). */
export type AnalisaVigas = (
  vigas: readonly DadosViga[],
  parametros: ParametrosVicalc,
  modo: ModoSistrut,
) => AnaliseDeVigas;

/** Uma linha do .REP por pilar (VIGA.BAS:2498-2501, 2545). Caso b: P5 17,37 =
 *  6,93 (V2) + 10,44 (V5); P7 momentos "-.64@1 [4]" (V1) e "-1.22@2 [5]" (V4). */
export interface LinhaRep {
  pilar: string;
  /** Σ parcelas, t. */
  total: number;
  /** Parcela = INT(R·100)/100 no original (R estática ou máxima); sem truncar no
   *  corrigido (R5). `texto` = a forma gravada no .REP depois do "*": no original, STR$
   *  cortado 2 casas depois do ponto (VIGA.BAS:2415; sem ponto, sinal e 1º dígito, D-21);
   *  no corrigido, o número com até 2 casas (`textoDoRep`). `semCorte` = a reação R antes
   *  do INT (igual a `valor` no corrigido): no original, R − valor é o que o R5 tira. */
  parcelas: { viga: string; valor: number; texto: string; semCorte?: number }[];
  /** Momento de extremidade (VIGA.BAS:2416-2419): `valor` = A_0fc4 com 4 casas (tm,
   *  ex.: −0,6481); `texto` = o que vai ao .REP: no original, STR$(valor) cortado 2 casas
   *  depois do ponto ("-.64"), que o PILGEEDI lê como ABS(VAL(texto)) (PILGEEDI.BAS:606);
   *  no corrigido, o número com até 2 casas, e o PILGEEDI lê o `valor` (D-21); apoio extremo (1 = esquerdo, n = direito); vão adjacente (m).
   *  `inclinacao` (graus) e `rigidez` (numerador da rigidez da viga, cm⁴) não vão ao
   *  .REP: o PILGEEDI começa com 0 nos dois e o usuário os edita na tela
   *  (PILGEEDI.BAS:597-640). Ausentes = 0, como no original. */
  momentos: {
    viga: string;
    valor: number;
    texto: string;
    apoio: number;
    vao: number;
    inclinacao?: number;
    rigidez?: number;
  }[];
}
export type SomaReacoesPilares = (
  analises: readonly AnaliseViga[],
  vigas: readonly DadosViga[],
  parametros: ParametrosVicalc,
  modo: ModoSistrut,
) => LinhaRep[];

// ============================================================== T4 VIGA: dimensionamento e detalhamento (DESDIM, DESINIT, DESENHO)
// Arquivos: sistrut/vigas/desdim*.ts, desinit*.ts (DESCALC em desinitDescalc.ts, usado
// pelos dois), sistrut/quant/vigas.ts.
// Especificação: livros_arm_forma_des.md 1-2 e 4.3; PLANO D1-D8, Q2-Q5. Modo
// corrigido: R8 (σs elástico sem ÷ γs), R9 (área do φ32, AREAS_DSP_CORRIGIDAS; o φ4 fica desativado),
// R11 (salto do ramo "barra longa demais"), H (As,mín 0,25 % com CA-25).

/** Seção de viga num tramo ou apoio (DESDIM.BAS:2930): bw, hw, mesa bf/hf (0 = sem), cm. */
export interface SecaoViga {
  bw: number;
  hw: number;
  bf: number;
  hf: number;
}

/** Dados de forma por tramo (.FOR do FORMEDCA ou tela do DESENHO; livros_arm_forma_des.md 2.1). */
export interface FormaTramo {
  /** Largura do apoio à esquerda do tramo, cm. */
  larguraApoio: number;
  /** Vão livre face a face, cm. */
  vaoLivre: number;
  /** Rebaixo e espessura da laje de cada lado, cm (pe, Hle, pd, Hld). */
  pe: number;
  hle: number;
  pd: number;
  hld: number;
}

/** Seções e forma da viga, com os mesmos índices de `DadosViga`. Balanço sem seção
 *  própria herda a do tramo vizinho (DESDIM.BAS:2935). */
export interface SecoesViga {
  tramos: SecaoViga[];
  apoios: SecaoViga[];
  balancoEsquerdo?: SecaoViga;
  balancoDireito?: SecaoViga;
}
export interface FormaViga {
  tramos: FormaTramo[];
  balancoEsquerdo?: FormaTramo;
  balancoDireito?: FormaTramo;
}

export interface EntradaDesdim {
  /** O .VIG da viga (com as cargas indexadas já resolvidas pelo VIGA). O DESDIM refaz
   *  a análise a partir dele (DESCALC, DESDIM.BAS:5777-6582, `analisaDescalc` em
   *  vigas/desinitDescalc.ts), como o original: o dimensionamento e o detalhamento usam
   *  os mesmos esforços, com os parâmetros do .DSP. */
  viga: DadosViga;
  secoes: SecoesViga;
  forma: FormaViga;
  materiais: MateriaisSistrut;
  parametros: ParametrosDsp;
}

/** Barras lidas de um arranjo "n1#φ1+n2#φ2" (DESDIM.BAS:3135-3148, L_1521a), como o
 *  original as guarda em A_128e/A_12bc (colunas 0..3). */
export interface BarrasArranjo {
  n1: number;
  bitola1: number;
  /** 0 sem segundo grupo; "+#8" conta 1 barra. */
  n2: number;
  bitola2: number;
}

/** Armadura de uma seção (flexão T e dupla, d = hw − 4, ξlim truncado em 3 casas;
 *  DESDIM.BAS:3677-3727, 2839-2957). */
export interface FlexaoViga {
  xd: number;
  /** Momento de cálculo usado, tm. */
  mk: number;
  /** cm²; As,mín = taxa·bw·hw em todo apoio. */
  as: number;
  asCompressao: number;
  /** Barras pela tabela de arranjos do .DSP (ex.: "2#12.5+#8"). */
  arranjo: string;
  /** Barras da armadura comprimida ("-" sem As'; L_1600A, DESDIM.BAS:3276-3335). */
  arranjoCompressao: string;
  /** `arranjo` lido como o original o guarda. */
  barras: BarrasArranjo;
  /** Caminho da flexão: retangular na alma, T com a LN na mesa, armadura dupla, ou
   *  "nenhum" onde o DESDIM não dimensiona (balanço, apoio fora do laço). */
  ramo: "alma" | "mesa" | "dupla" | "nenhum";
}

/** Abertura de fissuras w1/w2 e limite da classe do .DSP, mm (o original calcula em
 *  décimos de mm; DESDIM.BAS:4278-4319). `ok` = não passam os dois do limite. */
export interface FissuracaoViga {
  w1: number;
  w2: number;
  limite: number;
  ok: boolean;
}

/** Apoio k (0..n) dimensionado (DESDIM.BAS:2798-2889). Só os apoios do laço do original
 *  são dimensionados (internos; os extremos com balanço, engaste ou momento externo
 *  negativo); os outros vêm com `dimensionado: false` e flexão zerada. */
export interface ApoioDimensionado extends FlexaoViga {
  apoio: number;
  dimensionado: boolean;
  /** Só com a verificação de fissuração ligada (e viga que não é simples). */
  fissuracao?: FissuracaoViga;
}

/** Estribo de um lado do tramo (L_16b55, DESDIM.BAS:3395-3634). */
export interface EstriboLado {
  /** Texto como o original imprime ("#5/12", "2#6.3/15"); vazio sem Asw. */
  texto: string;
  bitola: number;
  espacamento: number;
  /** Estribos lado a lado (1, 2 ou 3). */
  lado: number;
}

/** Cisalhamento (DESDIM.BAS:3127-3336): ψ = 0,225 + 15ρ, Asw; uma bitola de estribo
 *  para a viga inteira e um espaçamento por lado do tramo (retrad_des_det:
 *  V1.t1.estribo.e / .d). O lado sem apoio do balanço sai zerado e sem texto. */
export interface CisalhamentoViga {
  vkEsquerda: number;
  vkDireita: number;
  /** cm²/m. */
  aswEsquerda: number;
  aswDireita: number;
  estribo: {
    bitola: number;
    ramos: 2 | 4 | 6;
    espacamentoEsquerda: number;
    espacamentoDireita: number;
  };
  /** Estribo de cada lado: bitola mínima ou máxima da viga, espaçamento e texto. */
  estriboEsquerda: EstriboLado;
  estriboDireita: EstriboLado;
  /** Só no modo original: o Asw (cm²/m) e o texto do estribo de cada lado com o ρ do ψ
   *  tirado da armadura de flexão, como no corrigido, e o resto igual ao original. É o
   *  que o original daria sem o defeito D-ψ (DESDIM.BAS:3194-3208); serve ao painel de erros
   *  do original (`calculo/defeitosOriginal.ts`). */
  semDefeitoPsi?: {
    aswEsquerda: number;
    aswDireita: number;
    estriboEsquerda: string;
    estriboDireita: string;
  };
}

export interface TramoDimensionado {
  /** Índice do original (0 = balanço esquerdo, 1..n tramos, n + 1 = balanço direito). */
  indice: number;
  flexao: FlexaoViga;
  cisalhamento: CisalhamentoViga;
  /** Flecha, cm (INT(L³·k·1e8/EI)/100, estádio I ou II; DESDIM.BAS:3894); 0 nos balanços. */
  flecha: number;
  /** Flecha como impressa (STR$: ".01"); "" nos balanços. */
  flechaTexto: string;
  /** EJ·f no x do M+, t·m³ (S_113f7, DESDIM.BAS:2716-2765). */
  ejf: number;
  /** Só com a verificação de fissuração ligada (DESDIM.BAS:4278). */
  fissuracao?: FissuracaoViga;
}

/** Esforços de um tramo como o DESDIM os lê do COMMON depois do DESCALC. Índice do
 *  original: 0 = balanço esquerdo, 1..n = tramos, n + 1 = balanço direito. */
export interface EsforcosTramoDesdim {
  indice: number;
  /** Vão, m (A_1006). */
  vao: number;
  /** M+ (tm): o da envoltória (A_1768) ou o de engastamento perfeito (A_11A8), o maior
   *  (DESDIM.BAS:2934-2953); 0 nos balanços. */
  mPositivo: number;
  /** Abscissa do M+ da envoltória (A_173A), m: a da flecha. */
  x: number;
  /** Cortantes nas extremidades sem alívio (A_1796(t, 0..1)), t, com o sinal do
   *  original: os da verificação τwd ≥ 0,25·fcd (DESDIM.BAS:2984-2988). */
  ve: number;
  vd: number;
  /** Cortantes característicos com alívio (A_1540), t. */
  vkEsquerda: number;
  vkDireita: number;
  /** Cortante à esquerda e momento no apoio esquerdo do carregamento do M+ (A_17C4(t,0)
   *  e A_17C4(t,1)), t e tm: os da flecha (DESDIM.BAS:2716-2720, 6262-6276). */
  veFlecha: number;
  mEsquerdo: number;
  divisoes: readonly DivisaoCarga[];
}

/** O que o DESDIM lê do COMMON depois do DESCALC (DESDIM.BAS:2707-3057). */
export interface EsforcosDesdim {
  /** M de cada apoio 0..n (A_16DE, o da envoltória), tm (negativo = tração em cima). */
  momentosApoio: number[];
  /** Tramos na ordem 1 − balE .. n + balD. */
  tramos: EsforcosTramoDesdim[];
}

/** Dimensionamento do DESDIM. Caso retrad_des_det (V1 20×50): ver
 *  __oraculo__/retrad_des_det.json. */
export interface DimensionamentoViga extends ComMemoria {
  nome: string;
  tramos: TramoDimensionado[];
  /** Apoios 0..n (os fora do laço com `dimensionado: false`). */
  apoios: ApoioDimensionado[];
  /** Balanço sem seção própria herda a do apoio vizinho (DESDIM.BAS:2919). */
  balancoEsquerdo?: TramoDimensionado;
  balancoDireito?: TramoDimensionado;
  /** Bitolas de estribo da viga: máxima para os esforços, mínima para o Asw mínimo
   *  (DESDIM.BAS:3336, 3350). */
  bitolasEstribo: { maxima: number; minima: number };
  /** ξlim = INT(1000/((fyd/Es + 2‰ no aço B)/3,5 + 1))/1000 (DESDIM.BAS:3678). */
  xiLimite: number;
  /** Os esforços do DESCALC que o dimensionamento usou. */
  esforcos: EsforcosDesdim;
  /** Tensão de cisalhamento acima do limite (τwd ≥ 0,25·fcd, DESDIM.BAS:2984-2990) ou
   *  momento acima de 40 % do limite da armadura simples (3713): o que faz o DESDIM
   *  perguntar "Continuo com o processamento desta Viga S/*N*" (3062-3080). */
  limitesExcedidos?: ("cisalhamento" | "momento")[];
}
/** Os esforços saem do DESCALC refeito a partir de `entrada.viga` (o original roda o
 *  DESCALC antes de dimensionar, DESDIM.BAS:795-797): não recebe a análise do VICALC. */
export type DimensionaViga = (
  entrada: EntradaDesdim,
  modo: ModoSistrut,
  alteracoes?: readonly AlteracaoArmadura[],
) => DimensionamentoViga;

/** Armadura que o usuário altera nas telas do DESDIM ("Altero a Armação", S_60137 e
 *  S_61fbe; "Modifico as Armaduras" da fissuração, S_20137), com o DESENHO em "Altero a
 *  armadura que será optada pela Parametrização" S (DESENHO.BAS:1707). A forma é a de
 *  `ArmaduraDigitada` da obra; bitolas em mm. `dimensionaViga` aplica as alterações
 *  depois de escolher os arranjos, refaz a fissuração e a flecha com as barras novas e
 *  avisa as que o original recusaria (vigas/desdim-alteracao.ts). */
export type AlteracaoArmadura = ArmaduraDigitada;

/** Uma posição de barra do detalhamento (DESINIT). */
export interface PosicaoBarra {
  /** Nome da posição ("N1"). */
  nome: string;
  quantidade: number;
  bitola: number;
  /** Comprimento de cada barra, cm (com dobras e ganchos). */
  comprimento: number;
  /** Início e fim ao longo da viga, cm. */
  inicio: number;
  fim: number;
  tipo: "positiva" | "negativa" | "estribo" | "porta-estribo" | "grampo" | "pele";
  /** Dobras (ganchos) das pontas, cm (A_1B4E/A_1B20); o comprimento já as inclui. */
  dobras: [number, number];
}

/** Trecho de estribos de um tramo (A_1C06): início e fim (cm), bitola, espaçamento,
 *  estribos lado a lado e o nº da posição (`posicao`, 1 = primeira posição de estribo). */
export interface TrechoEstribo {
  inicio: number;
  fim: number;
  bitola: number;
  espacamento: number;
  ladoALado: number;
  posicao: number;
  /** INT((fim − início)/s) + 1 (DESINIT.BAS:892; U07-029). */
  quantidade: number;
}

/** Detalhamento longitudinal e transversal (corte sobre o diagrama de 21 pontos,
 *  decalagem 0,75d, lb, ancoragem ×1,00/×1,50, porta-estribos, grampos, pele;
 *  DESDIM.BAS:5078-5267, DESINIT.BAS:1327-3289). */
export interface DetalhamentoViga extends ComMemoria {
  nome: string;
  posicoes: PosicaoBarra[];
  trechosEstribo: TrechoEstribo[];
}

/** Um apoio como o .FOR o grava (A_1926(k,0), A_1954$, A_1982; DESDIM.BAS:4457-4621).
 *  Na tela do DESENHO: "Apoio Tipo Titulo LPi LPs Dis". */
export interface ApoioFormaViga {
  /** Largura do apoio na direção da viga (LPi), cm. */
  largura: number;
  /** P pilar, V viga, O outro, A apoio. */
  tipo: "P" | "V" | "O" | "A";
  titulo: string;
  /** Código do apoio (A_1982(k,0); 1 = "Continua Constante", o padrão). */
  codigo: number;
  /** LPs e Dis (A_1982(k,1..2)), cm. */
  lps: number;
  dis: number;
}

/** Eixo e alinhamento de um tramo (A_19DE, A_19B0), cm: distância da face do apoio ao
 *  eixo e desnível da face superior. Índice do original: 0 balanço esquerdo, 1..n
 *  tramos, n+1 balanço direito (no especial o eixo gravado é 10,0000048). */
export interface EixoTramoViga {
  eixo: number;
  alinhamento: number;
}

/** Dados do .FOR e da tela do DESENHO que o DESINIT usa e que `EntradaDesdim` não traz.
 *  Ausentes, valem os padrões da tela do DESENHO. */
export interface ExtrasDesinit {
  /** Apoios 0..n. Padrão: largura do apoio à esquerda de cada tramo (o último repete o
   *  anterior ou vem do balanço direito), tipo P, título P1.., código 1, LPs = largura. */
  apoios?: ApoioFormaViga[];
  /** Por índice do original (0..n+1). Padrão: eixo = metade da largura do apoio à
   *  esquerda (eixos centralizados), alinhamento 0 (face superior alinhada). */
  eixos?: EixoTramoViga[];
  /** Arranjo da armadura comprimida ("2#10") dos tramos 1..n (índice t − 1) e dos apoios
   *  0..n. Padrão: "-" sem As comprimida; com As', o arranjo que o DESDIM escolhe
   *  (L_1600A). */
  comprimidaTramos?: string[];
  comprimidaApoios?: string[];
  /** Armadura editada no DESEDCAO (o .EDV, `Viga.armaduraEditada`): substitui barras,
   *  grampos, porta-estribos, pele e estribos antes do quadro de ferros, como o DESINIT
   *  ao voltar do DESEDCAO (S_202b9, DESINIT.BAS:96-104, 404-966). Descartada com aviso
   *  se os tramos, os balanços ou o comprimento (1 cm) não batem com a viga. */
  armaduraEditada?: EdicaoVigaSistrut;
  /** Viga editada reaberta no DESEDITA: o DESINIT não refaz o detalhamento automático (vindo
   *  do DESEDITA, DESINIT.BAS:84-100 só chama S_30132), e o quadro sai das faces e de
   *  `armaduraEditada`; `dimensionamento` não é usado. Serve à viga cujo DESDIM a V2 não
   *  conclui (parâmetros do .DSP do usuário que não vieram). Edição que não serve à viga
   *  é erro. */
  reabreEdicao?: boolean;
}

type FlexaoParaDetalhe = Pick<FlexaoViga, "xd" | "mk" | "as" | "asCompressao" | "arranjo">;
interface TramoParaDetalhe {
  flexao: FlexaoParaDetalhe;
  cisalhamento: Omit<CisalhamentoViga, "estriboEsquerda" | "estriboDireita">;
  flecha: number;
}
/** O que o DESINIT recebe do DESDIM pelo COMMON (DESDIM.BAS:2839-3340): por tramo e
 *  apoio o arranjo, As e As'; por tramo e balanço o Asw e o estribo. Um
 *  `DimensionamentoViga` serve; os testes do detalhamento montam só isto, com os
 *  números que o original imprime. */
export interface DimensionamentoParaDetalhe {
  nome: string;
  tramos: TramoParaDetalhe[];
  apoios: FlexaoParaDetalhe[];
  balancoEsquerdo?: TramoParaDetalhe;
  balancoDireito?: TramoParaDetalhe;
}
/** Os esforços do detalhamento saem do DESCALC refeito a partir de `entrada.viga`, como
 *  no dimensionamento: não recebe a análise. */
export type DetalhaViga = (
  entrada: EntradaDesdim,
  dimensionamento: DimensionamentoParaDetalhe,
  modo: ModoSistrut,
  extras?: ExtrasDesinit,
) => DetalhamentoViga;
/** Quadro da viga gravado no .TAB (DESINIT.BAS:763-852): volume Σ bw·h·vão livre/10⁴
 *  e fôrma Σ (2h + bw − Hle − Hld)·vão livre/100, ambos INT no centésimo (unidade:
 *  centésimos de m³ e de m²); comprimento por bitola (cm) e peso CINT(compr·kg/m/100).
 *  retrad_des_det: volume 76, fôrma 912; φ5 8448, φ6.3 1153, φ10 2612 cm. */
export interface QuadroViga {
  nome: string;
  repeticoes: number;
  volumeCentesimos: number;
  formaCentesimos: number;
  /** Índice = ordem da bitola no .DSP (0..9). */
  comprimentoPorBitola: number[];
  pesoPorBitola: number[];
  /** kg/m³, INT(100/vol·peso). */
  taxa: number;
}
/** Soma t = 1 − balE … n + balD (balanços incluídos). `repeticoes` = as do
 *  pavimento-tipo, gravadas no .TAB (o resumo usa MAX(1, rept)). */
export type QuadroDaViga = (
  detalhamento: DetalhamentoViga,
  secoes: SecoesViga,
  forma: FormaViga,
  repeticoes: number,
  parametros: ParametrosDsp,
  modo: ModoSistrut,
) => QuadroViga;

/** Resumo geral do DESENHO item 4 (DESENHO.BAS:2236-2310): soma × MAX(1, rept);
 *  volume e fôrma CINT(x/10)/10 (m³, m² com 1 casa); peso por bitola
 *  CINT(compr·kg/m/100). retrad_des_menu: .8 m³, 9.1 m², pesos 14/3/16 kg. */
export interface ResumoVigas {
  volume: number;
  forma: number;
  comprimentoPorBitola: number[];
  pesoPorBitola: number[];
  porViga: { nome: string; volume: number; forma: number }[];
}
export type ResumoGeralVigas = (
  quadros: readonly QuadroViga[],
  parametros: ParametrosDsp,
  modo: ModoSistrut,
) => ResumoVigas;

// ============================================================== T5 PILARES (PILAR, PILAREDI, PILGEEDI, PIPROEDI)
// Arquivos: sistrut/pilares/** (esforcos.ts, secao.ts, elu.ts, armadura.ts, carga.ts,
// verificacao.ts). Especificação: livros_viga_pilar.md seção 2 e 3.2; PLANO P1-P16.
// Ações CARACTERÍSTICAS: Nk e Mk não são majorados; as resistências são ÷ Csf.
// Modo corrigido (R12): D-1 fluência e^(X−1) → e^X − 1; D-3 Nk = 0; D-6 poligonal
// anti-horária; D-7 "ok" com ≥; D-8 redução de sobrecarga sem o peso próprio; D-17 ajuste
// do ângulo da LN por bissecção. D-2 (laço sem fim) vira erro explícito nos dois modos.
// Não corrigidos: D-4 (λ = 80 exato), D-9.

/** Barra longitudinal na seção: posição (cm, origem no canto inferior esquerdo) e bitola (mm). */
export interface BarraPilar {
  x: number;
  y: number;
  bitola: number;
}

/** Seção do pilar (PILDADOS): retangular, circular (com vazado) ou poligonal. */
export type SecaoPilar =
  | {
      tipo: "retangular";
      b: number;
      h: number;
      barras: BarraPilar[];
      /** Rotação da seção, graus (A_1338(c, s, 3), 0..360): os vértices (0,0) (0,h)
       *  (b,h) (b,0) giram em torno da origem ao carregar a seção, x' = cos·x − sin·y,
       *  y' = sin·x + cos·y (PILAREDI.BAS:1630-1631, 2579-2580). Ausente = 0. */
      rotacao?: number;
    }
  | { tipo: "circular"; d: number; dInterno: number; barras: BarraPilar[] }
  | { tipo: "poligonal"; vertices: Ponto[]; barras: BarraPilar[] };

/** Situação de cálculo pelos momentos iniciais (PILAR.BAS:4769-4800); só rótulo. */
export type SituacaoPilar =
  | "Compressao Centrada"
  | "Flexo Compressao"
  | "Flexao Obliqua"
  | "Flexo Tracao";

/** Veredito de um caso (PILAR.BAS:5342-5360, 5534; PILAREDI.BAS:5361-5425). Onde o
 *  original fica em laço (D-2) ou divide por Nk = 0 (D-3), o caso sai "NAO" com
 *  `CasoPilar.erro` ("nao-converge" ou "nk-nulo"); na verificação (PILAR opção 6) o
 *  erro do caso é o único registro, sem aviso repetido. */
export type VereditoPilar =
  | "ok"
  | "NAO"
  | "INSTABILIDADE"
  | "ESFORCOS SUPERIORES AOS MAXIMOS"
  | "DIMINUI";

/** Um caso de excentricidade acidental (PILAR.BAS:4678-4910) e o seu ELU. */
export interface CasoPilar {
  /** "1/2", "2/2" no PILAR; "1e", "1f", "2e", "2f" no PILAREDI. */
  rotulo: string;
  /** Parcela acidental Ma = sinal·CLNG(100·ea·Nk)/100 e total por direção, tm. */
  mxa: number;
  mya: number;
  mx: number;
  my: number;
  /** CLNG(100·√(Mx² + My²))/100, tm. */
  mTotal: number;
  /** Ângulo da LN, graus; curvatura 1/r (1/cm) e estado de equilíbrio impresso. */
  anguloLN: number;
  curvatura: number;
  xLN: number;
  xd: number;
  /** Deformações do concreto e da barra mais tracionada, ‰ (sinal como impresso). */
  deformacaoConcreto: number;
  deformacaoAco: number;
  /** Momento resistente (1ª curvatura da grade que cobre o atuante; não é a
   *  capacidade última) e de 2ª ordem por direção, tm. */
  mrx: number;
  mry: number;
  m2x: number;
  m2y: number;
  veredito: VereditoPilar;
  /** Ângulo do momento atuante, graus (V_1368; impresso "incl" com CINT). */
  anguloAtuante: number;
  /** MR de 1ª ordem menos M2, por direção, e o total √(x² + y²), tm. */
  mrxReduzido: number;
  mryReduzido: number;
  mrTotal: number;
  /** "SITUACAO DE INSTABILIDADE": componente e os três números impressos. */
  instabilidade?: { componente: "total" | "x" | "y"; m1: number; m2: number; atuante: number };
  /** Situação de erro explícita no lugar do laço sem fim (D-2, `ErroNaoConverge`) ou da
   *  divisão por zero (D-3). */
  erro?: "nao-converge" | "nk-nulo";
}

/** PILAR opção 6, verificação de seção e armadura dadas (PILAR.BAS:4482-5534).
 *  Caso c (20×20, 4 φ12,5, Nk 17,37, le 3): λ 52, "Compressao Centrada", Mx 0,35,
 *  MR 0,51, "ok". */
export interface EntradaVerificacaoPilar {
  secao: SecaoPilar;
  /** t; tm; m (0 < L ≤ 500). */
  nk: number;
  mxk: number;
  myk: number;
  lxe: number;
  lye: number;
  /** Cobrimento até o centro das barras é dado pelas posições; aqui só materiais. */
  materiais: MateriaisSistrut;
  parametros: ParametrosPilar;
}
export interface VerificacaoPilar extends ComMemoria {
  area: number;
  jx: number;
  jy: number;
  /** Ec (t/cm²) e λ de Euler (V_118e, V_0e6e; PILAR.BAS:5633-5634). */
  ec: number;
  lambdaEuler: number;
  /** λ = CINT(L/√(J/A)·100), inteiro arredondado ao par (PILAR.BAS:5631-5632). */
  lambdaX: number;
  lambdaY: number;
  situacao: SituacaoPilar;
  casos: CasoPilar[];
}
export type VerificaPilar = (
  entrada: EntradaVerificacaoPilar,
  modo: ModoSistrut,
) => VerificacaoPilar;

/** Vínculo de um nível = ÍNDICE da matriz de flambagem do .PIP: 0 engaste, 1
 *  semi-engaste, 2 continuidade ("travado", o padrão), 3 livre. Não é o código Rx/Ry
 *  que o PILGEEDI grava (1-based, empacotado em A = 100·(Ry−1) + (Rx−1),
 *  PILGEEDI.BAS:1964): o PILAREDI converte o código em índice com 1 → 2, 2 → 3,
 *  3 e 4 → 0, ≥ 5 → 1 (PILAREDI.BAS:4733-4760; `indiceDoCodigoOriginal`). */
export type VinculoPilar = 0 | 1 | 2 | 3;

/** Um nível de uma coluna de edifício (PILGEEDI). */
export interface NivelColuna {
  /** Cota do nível, m. */
  cota: number;
  /** Seção do lance que começa no nível (níveis seguidos com a mesma geometria formam
   *  uma "seção" do original, A_1338; o topo pertence à seção do lance de baixo). */
  secao: SecaoPilar;
  vinculoX: VinculoPilar;
  vinculoY: VinculoPilar;
  /** Normal de vento e momentos iniciais por nível, t e tm. Sem `ventos`, `mkx` vai a 0°
   *  e `mky` a 90°. */
  normalVento: number;
  mkx: number;
  mky: number;
  /** Excentricidade da seção que começa no nível em relação à de baixo, cm (A_1338(s,
   *  4|5), gravada CINT(100·cm)). */
  excentricidade?: { x: number; y: number };
  /** Até dois momentos de vento com ângulo, tm e graus (A_12dc 1..4). */
  ventos?: { m: number; angulo: number }[];
  /** Carga do nível como o PILGEEDI a guarda (A_1280), além da lida dos .REP: a
   *  normal (t) soma e os momentos (tm, graus, m, cm⁴) ocupam os slots livres (m = 0)
   *  depois dos do .REP, sem o ABS da leitura do .REP: o PILAREDI usa o sinal de
   *  A_1280(k) (PILAREDI.BAS:7505-7506), e a "Normal + Momento" grava o VAL digitado,
   *  com vão 1 e rigidez Jvig/Lvig (PILGEEDI.BAS:2407-2413). */
  cargaAdicional?: {
    normal: number;
    momentos: { m: number; inclinacao: number; vao: number; rigidez: number }[];
    /** Como combina com o .REP (PILGEEDI.BAS:588-660): "soma" (padrão; momentos nos
     *  slots livres), "substitui" (zera o nível e grava) ou "maxima" (substitui só se a
     *  normal for maior que a do nível, > estrito). */
    modo?: "soma" | "substitui" | "maxima";
  };
}

/** Coluna de edifício com os níveis (PILGEEDI). Níveis pelo índice em `niveis` (0 = o
 *  mais baixo, cresce para cima); `LeituraRep.nivelInicial/Final` são índices. */
export interface ColunaEdificio {
  nome: string;
  /** Pilar do .REP associado pelo número no nome. */
  pilarRep: string;
  niveis: NivelColuna[];
  /** Índice do nível mais baixo da coluna para a leitura do .REP: o PILGEEDI leva o
   *  registro à primeira coluna com o número no nome cujo nível inferior ≤ nível ≤
   *  superior (PILGEEDI.BAS:556); o superior é `niveis.length − 1`. Ausente = 0 (o
   *  motor monta toda coluna desde a fundação; o importador de .COL usa o campo). */
  nivelInferior?: number;
}

/** Carga por coluna e nível (PILGEEDI.BAS:530-660; PILAREDI.BAS:4066-4077, 4721-4773,
 *  7342-7520): N do .REP (total da linha) acumulado dos níveis acima, + vento, + peso
 *  próprio Δcota·A·2,5 ("S"), − redução de sobrecarga ("N" no padrão); le = Δcota ×
 *  coeficiente da matriz. caso_c_pilaredi: Nk = 17,37 + 0,30 = 17,67. */
export interface CargaPilarNivel {
  coluna: string;
  nivel: number;
  nk: number;
  pesoProprio: number;
  /** Mk iniciais do caso "e" (maior extremo; inclui o MEP do .REP), tm. */
  mkx: number;
  mky: number;
  lex: number;
  ley: number;
  /** Momentos do caso "f": 0,6·M1 + 0,4·M2 ≥ 0,4·M1 (PILAREDI.BAS:7619-7746), tm. */
  momentosFlambagem: { mkx: number; mky: number };
  /** Momentos na base do lance, tm. */
  momentosBase: { mkx: number; mky: number };
  /** Normal acumulada dos níveis de cima, sem peso próprio, vento e redução, t. */
  cargaAcumulada: number;
  /** Redução de sobrecarga (PILAREDI.BAS:6602-6615) e normal de vento do nível, t. */
  reducao: number;
  normalVento: number;
}
/** Um .REP lido pelo PILGEEDI (opção 5 de "Arquivar dados de Colunas"): vale para a
 *  faixa de níveis dada (PILGEEDI.BAS:557) e combina com o que já havia por
 *  "substitui" (padrão), "soma" ou "maxima" (só se maior, > estrito)
 *  (PILGEEDI.BAS:588, 595, 644, 653). Os momentos vêm de `LinhaRep.momentos[].texto`. */
export interface LeituraRep {
  linhas: LinhaRep[];
  nivelInicial: number;
  nivelFinal: number;
  modo: "substitui" | "soma" | "maxima";
  /** O .RLP do LAJEMONT lido junto com o .REP (PILGEEDI.BAS:425-446, 1010-1036): por
   *  pilar ("P5"), a carga de laje direto no pilar (t), somada depois de gravar a normal
   *  do registro, e a linha de inclinações ("V1[0] >V4[270] >"), que dá a inclinação de
   *  cada momento pelo rótulo da viga. */
  rlp?: { pilar: string; normal: number; inclinacoes: string }[];
}
/** `coeficientes`: coeficientes de medida e de força do PILAR.INI (padrão 1 e 1). */
export type CargasPilares = (
  reps: readonly LeituraRep[],
  colunas: readonly ColunaEdificio[],
  parametros: ParametrosPip,
  modo: ModoSistrut,
  coeficientes?: { medida: number; forca: number },
) => CargaPilarNivel[];

/** Situação que interrompe o dimensionamento, como o original avisa: "LAMBDA" (λ > 140,
 *  recusa), "NAOBARRA" (nem φ40 cabe), "NAOSUPORTA" (taxa máxima esgotada),
 *  "NAOCONVERGE" (laço sem fim do original, D-2), "NKNULO" (D-3), "NAO" (a armadura
 *  dada não resiste: com REDEFINE e "NAO" o PILAREDI volta à edição da armadura,
 *  PILAREDI.BAS:5800-5808). */
export type RecusaPilar = "LAMBDA" | "NAOBARRA" | "NAOSUPORTA" | "NAOCONVERGE" | "NKNULO" | "NAO";

/** Dimensionamento PILAREDI de um nível (PILAREDI.BAS:4721-5885, 6649-6935): casos
 *  "e" (sem 2ª ordem) e "f" (flambagem), critério ≥, "DIMINUI" com 1,05; As
 *  estimada, barras a partir de φ10 (vértices + complementares em número par), taxa
 *  INT(As·10000/A)/100, estribo pela tabela do .PIP. caso_c_pilaredi P5: As 3,20
 *  (0,80 %), 4 # 10, # 6.3 c/12. λ > 140 recusa ("LAMBDA"). */
export interface DimensionamentoPilar extends ComMemoria {
  coluna: string;
  nivel: number;
  lambdaX: number;
  lambdaY: number;
  casos: CasoPilar[];
  /** cm² e %. */
  as: number;
  taxa: number;
  barras: { quantidade: number; bitola: number }[];
  estribo: { bitola: number; espacamento: number };
  /** Seção com as barras escolhidas (para o desenho). */
  secao: SecaoPilar;
  /** Presente quando o original interrompe o nível; os casos já calculados ficam. */
  recusa?: RecusaPilar;
  /** A armadura veio dada (`opcoes.barrasDadas`): só verificada, sem escolha. */
  armaduraDada?: true;
}
/** `opcoes.barrasAnteriores`: na seção circular, o nº de barras da variação de
 *  armadura anterior (A_141e 1 + 3; PILAREDI.BAS:6848-6859). `opcoes.barrasDadas`: a
 *  armadura redefinida à mão (<R> do PILAREDI 3.2) ou gravada no .COL; o nível é
 *  verificado nos casos "e" e "f" com essas barras, sem os ajustes de NAO e DIMINUI
 *  (V_107e$ = "REDEFINE", PILAREDI.BAS:6897-6898, 6919). Estribo: `opcoes.estribo`
 *  ou o da tabela pela maior bitola (A_141e 5..6 = A_0f56(V_1086), 5838-5839). */
export type DimensionaPilar = (
  carga: CargaPilarNivel,
  coluna: ColunaEdificio,
  materiais: MateriaisSistrut,
  parametrosPilar: ParametrosPilar,
  parametrosPip: ParametrosPip,
  modo: ModoSistrut,
  opcoes?: {
    barrasAnteriores?: number;
    barrasDadas?: BarraPilar[];
    estribo?: { bitola: number; espacamento: number };
  },
) => DimensionamentoPilar;

/** Parâmetros do PILAR.INI usados no predimensionamento (PILAR.BAS:566-567, 576-577). */
export interface ParametrosPredimensionamento {
  excentricidadeMinima: number;
  verificaH30: boolean;
  coeficienteMedida: number;
  coeficienteForca: number;
  /** Multiplicador da unidade de fck e fyk para t/cm² (V_0dec, PILAR.INI; o [12] do
   *  .COL). Multiplica as admissíveis e o σs a 2 ‰; a tela divide as tensões por ele
   *  (PILAREDI.BAS:3671-3677, 4196-4214). Ausente = 1. */
  coeficienteTensao?: number;
}

/** Predimensionamento (PILAREDI opção 3.1): tensões Nk/A e Nk/A + Mk/W contra
 *  0,6·fck e 0,75·fck; medidas múltiplas de 5, mínimo 14 cm. Tensões = as máximas da
 *  faixa de níveis, a partir de 0, como a tela mostra. */
export interface PredimensionamentoPilar {
  coluna: string;
  /** Lado do quadrado escolhido, cm; NaN com a seção imposta. */
  b: number;
  h: number;
  /** Seção testada por último (a imposta ou o quadrado b × h). */
  secao: SecaoPilar;
  /** ΣN acima/((σs − σadm)·ρ/100 + σadm), cm². */
  areaIdeal: number;
  tensaoNormal: number;
  tensaoNormalAdmissivel: number;
  tensaoFlexao: number;
  tensaoFlexaoAdmissivel: number;
  /** Cada lado testado em cada nível, do topo para baixo, até o primeiro que reprova. */
  tentativas: { lado: number; nivel: number; tensaoNormal: number; tensaoFlexao: number }[];
  /** "CARGA" da tela, t: INT((pp − redução + ΣN acima)·100)/100 do nível base com a
   *  seção aceita, sem vento, somado em precisão estendida (PILAREDI.BAS:4248).
   *  retrad_pil_secoes D 25: 17,37 + 0,368 → 17,73; poliinv: 17,37 − 0,30 → 17,07. */
  carga: number;
}
/** Predimensionamento de uma coluna a partir do nível `nivelBase` (PILAREDI.BAS:
 *  3713-3740, 3976-4187): o S_60164 roda em modo PREDIMENSIONAMENTO (peso próprio e
 *  rigidezes da seção em teste) do topo até `nivelBase`, com as cargas do .REP; o lado
 *  é reprovado se σ1 > 0,6·fck ou σ2 > 0,75·fck em QUALQUER nível e cresce de 5 em 5.
 *  `opcoes.secao` = B e H digitados: só calcula as tensões. */
export type PredimensionaPilar = (
  reps: readonly LeituraRep[],
  coluna: ColunaEdificio,
  nivelBase: number,
  materiais: MateriaisSistrut,
  parametros: ParametrosPip,
  modo: ModoSistrut,
  opcoes?: { secao?: SecaoPilar; parametros?: ParametrosPredimensionamento },
) => PredimensionamentoPilar;

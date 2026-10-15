// Parâmetros padrão "SISTRUT" do original, fixos no código (PLANO.md 5.1, item 5:
// sem tela de edição). Transcritos da V1 nova,
// `_Arquivo/Sistrust/dist/src-original/<família>/<EXE>.BAS`; cada valor leva a
// linha de onde veio. Com o nome "SISTRUT" o original não lê o arquivo do disco:
// usa estas tabelas embutidas (LAJE.BAS:1223, DESENHO.BAS:4771, PILAREDI.BAS:1833).
//
// Os valores estão em decimal. O original os guarda em SINGLE: o modo original
// lê `emSingle(TABELA)` (ou aplica `sng` no uso); o corrigido usa os decimais.
// Os índices das listas seguem o original quando o cálculo depende deles
// (código de barra da laje = 1000·índice da bitola + índice do espaçamento).
import type { ClasseAco } from "../../../dominio/obra";
import { sng } from "./f32";

/** Tipo dos valores de `T` com os números arredondados para SINGLE. */
export type EmSingle<T> = T extends number
  ? number
  : T extends readonly (infer U)[]
    ? readonly EmSingle<U>[]
    : T extends object
      ? { readonly [K in keyof T]: EmSingle<T[K]> }
      : T;

/** Cópia de uma tabela com todo número passado por `sng`, para o modo original. */
export function emSingle<T>(tabela: T): EmSingle<T> {
  if (typeof tabela === "number") return sng(tabela) as EmSingle<T>;
  if (Array.isArray(tabela)) return tabela.map((v: unknown) => emSingle(v)) as EmSingle<T>;
  if (tabela !== null && typeof tabela === "object") {
    return Object.fromEntries(
      Object.entries(tabela).map(([k, v]) => [k, emSingle(v)]),
    ) as EmSingle<T>;
  }
  return tabela as EmSingle<T>;
}

// ---------------------------------------------------------------- LAJE (.LAP)

/** .LAP "SISTRUT" do LAJE (rotina L_149a7, LAJE.BAS:1229-1341) e os padrões do
 *  programa antes do INI (LAJE.BAS:107-122). Uso: LAJECALC, LAJEPROC, LAJEMONT.
 *  Especificação: apoio/livros_laje.md 1.1. */
export const PARAMETROS_LAJE = {
  /** γf, γc, γs (LAJE.BAS:1230-1232). Com "SISTRUT" valem por cima do INI. */
  gamaF: 1.4,
  gamaC: 1.4,
  gamaS: 1.15,
  /** fck t/cm² (LAJE.BAS:115), fyk t/cm² (LAJE.BAS:116), classe do aço (LAJE.BAS:117). */
  fck: 0.15,
  fyk: 5,
  classeAco: "B" as ClasseAco,
  /** Cobrimento e acréscimo para a altura útil, cm: d = H − 2,0 (LAJE.BAS:1233-1234). */
  cobrimento: 1.5,
  acrescimo: 0.5,
  /** Bitolas (mm) e áreas (cm²), índices 0..9 do original (A_0e8c/A_0eba,
   *  LAJE.BAS:1239-1258). Área 0 desativa a bitola (a de 4 mm). */
  bitolas: [
    { bitola: 4, area: 0 },
    { bitola: 5, area: 0.2 },
    { bitola: 6.3, area: 0.315 },
    { bitola: 8, area: 0.5 },
    { bitola: 10, area: 0.8 },
    { bitola: 12.5, area: 1.25 },
    { bitola: 16, area: 2 },
    { bitola: 20, area: 3.15 },
    { bitola: 22.2, area: 3.88 },
    { bitola: 25, area: 5 },
  ],
  /** μ pela relação de vãos (A_123e(1..15), LAJE.BAS:1262-1291): vale o μ da última
   *  linha com relação estritamente menor que a razão das cordas, sem interpolar
   *  (LAJECALC.BAS:4958-4969). */
  relacaoMu: [
    { relacao: 0.25, mu: 0.4 },
    { relacao: 0.3, mu: 0.5 },
    { relacao: 0.33, mu: 0.55 },
    { relacao: 0.4, mu: 0.6 },
    { relacao: 0.5, mu: 0.7 },
    { relacao: 0.67, mu: 0.8 },
    { relacao: 0.83, mu: 0.9 },
    { relacao: 1, mu: 1 },
    { relacao: 1.2, mu: 1.1 },
    { relacao: 1.5, mu: 1.2 },
    { relacao: 2, mu: 1.4 },
    { relacao: 2.5, mu: 1.6 },
    { relacao: 3, mu: 1.8 },
    { relacao: 3.5, mu: 2 },
    { relacao: 4, mu: 2.5 },
  ],
  /** Faixa da procura da espessura mínima, cm (LAJE.BAS:1292-1293). */
  hMin: 6,
  hMax: 40,
  /** Espaçamento mínimo por H: primeira linha com hAte ≥ H (A_0f34, LAJE.BAS:1296-1303). */
  espacamentoMinimoPorH: [
    { hAte: 10, espacamento: 7.5 },
    { hAte: 22, espacamento: 10 },
    { hAte: 30, espacamento: 12.5 },
    { hAte: 40, espacamento: 15 },
  ],
  /** Espaçamento máximo, cm: só na entrada manual do LAJEPROC (LAJE.BAS:1304). */
  espacamentoMaximo: 20,
  /** Espaçamentos, cm (A_129c(1..6), LAJE.BAS:1308-1313; A_129c(0) = 6 é a contagem).
   *  No código de barra o índice é 1-based: posição na lista + 1. */
  espacamentos: [7.5, 10, 12.5, 15, 17.5, 20],
  /** Bitola preferencial (índice em `bitolas`) pela primeira linha com hAte ≥ H
   *  (A_126e(1..6), LAJE.BAS:1317-1328; A_126e(0,0) = 6 é a contagem). */
  bitolaPorH: [
    { hAte: 5, indiceBitola: 0 },
    { hAte: 5.5, indiceBitola: 1 },
    { hAte: 14, indiceBitola: 2 },
    { hAte: 25, indiceBitola: 3 },
    { hAte: 32, indiceBitola: 4 },
    { hAte: 40, indiceBitola: 5 },
  ],
  /** Taxas mínimas: As,mín = taxa·H em cm²/m (LAJE.BAS:1329-1330). */
  taxaMinimaPositiva: 0.15,
  taxaMinimaNegativa: 0.1,
  /** Limita s ≤ 2H na escolha ("S", LAJE.BAS:1331). */
  limitaEspacamento2H: true,
  /** Fração do ξlim (o .LAP dá 100 %, LAJE.BAS:1332). */
  fracaoLinhaNeutra: 1,
  /** Flecha: L/f total e acidental, multiplicador de Ec, deformação lenta
   *  (LAJE.BAS:1333-1336). Lidos e NUNCA usados pelo original (defeito R1). */
  flecha: { lfTotal: 300, lfAcidental: 500, multiplicadorEc: 0.9, deformacaoLenta: true },
  /** Densidade do concreto, t/m³ (LAJE.BAS:1337). */
  densidade: 2.5,
  /** Relação Mneg/Mpos mínima e máxima: piso da otimização e i = 2,0 da continuidade
   *  (LAJE.BAS:1338-1339). */
  relacaoNegPosMin: 0.3,
  relacaoNegPosMax: 2,
  /** Relação Mneg/Mpos nos cantos reentrantes (LAJE.BAS:1340). */
  relacaoCantosReentrantes: 1,
  /** Eficiência da armadura negativa: As− ÷ eficiência se < 1 (o .LAP dá 100 %, LAJE.BAS:1341). */
  eficienciaNegativa: 1,
  /** Tolerâncias geométricas: comprimento (m) e ângulo/inclinação (LAJE.BAS:121-122). */
  toleranciaComprimento: 0.005,
  toleranciaAngulo: 0.002,
};

// ---------------------------------------------------------------- DESENHO (.DSP)

/** .DSP "SISTRUT" do DESENHO (DESENHO.BAS:4773-5035), usado pelo DESDIM e pelo
 *  DESINIT. Rótulos do arquivo de fábrica SISTRUT.DSP. Especificação:
 *  apoio/livros_arm_forma_des.md 4.3. */
export const PARAMETROS_DSP = {
  /** Coeficiente multiplicador dos momentos negativos (DESENHO.BAS:4773). */
  reducaoNegativos: 1,
  /** fck, fyk (t/cm²), classe do aço e multiplicador de unidade (DESENHO.BAS:4774-4777). */
  fck: 0.15,
  fyk: 5,
  classeAco: "B" as ClasseAco,
  multiplicadorUnidade: 1,
  /** Multiplicador de Ec para a deformação (DESENHO.BAS:4779). */
  multiplicadorEc: 0.9,
  /** Cobrimento e acréscimo, cm: d = h − 4,0 (DESENHO.BAS:4780-4782). */
  cobrimento: 2,
  acrescimo: 2,
  /** Alívio dos cortantes junto ao apoio ("S", DESENHO.BAS:4783). */
  alivioCortante: true,
  /** Envoltória de acidentais e momentos externos ("N", DESENHO.BAS:4785-4786). */
  acidentaisEnvoltoria: false,
  momentosExternos: false,
  /** γf, γc, γs (DESENHO.BAS:4787-4789). */
  gamaF: 1.4,
  gamaC: 1.4,
  gamaS: 1.15,
  /** Bitolas (mm), áreas (cm²) e massa (kg/m), ordem 0..9 (DESENHO.BAS:4790-4819).
   *  DEFEITO R9 (U04-005): áreas 0,00 nas bitolas 4 e 32, transcritas como estão;
   *  o modo corrigido usa AREAS_DSP_CORRIGIDAS. */
  bitolas: [
    { bitola: 4, area: 0, kgPorM: 0.1 },
    { bitola: 5, area: 0.2, kgPorM: 0.16 },
    { bitola: 6.3, area: 0.315, kgPorM: 0.25 },
    { bitola: 8, area: 0.5, kgPorM: 0.4 },
    { bitola: 10, area: 0.8, kgPorM: 0.63 },
    { bitola: 12.5, area: 1.25, kgPorM: 1 },
    { bitola: 16, area: 2, kgPorM: 1.6 },
    { bitola: 20, area: 3.15, kgPorM: 2.5 },
    { bitola: 25, area: 5, kgPorM: 4 },
    { bitola: 32, area: 0, kgPorM: 6.3 },
  ],
  /** As,mín = taxa·bw·hw (DESENHO.BAS:4820; item H do modo corrigido). */
  taxaArmaduraMinima: 0.0015,
  /** Decalagem = 0,75·d (DESENHO.BAS:4821; < 0 = fixa em m, > 100 = diâmetros). */
  decalagem: 0.75,
  /** Multiplicador do comprimento de ancoragem: positivas e negativas (DESENHO.BAS:4822-4823). */
  ancoragemPositiva: 1,
  ancoragemNegativa: 1.5,
  /** Verifica na ancoragem o mínimo de 10 φ da decalagem ("S", DESENHO.BAS:4824). */
  ancoragemMinimo10Diametros: true,
  /** Flecha com inércia fissurada, flecha com deformação lenta, verificação de
   *  fissuração ("N", DESENHO.BAS:4825-4827). */
  flechaInerciaFissurada: false,
  flechaDeformacaoLenta: false,
  verificaFissuracao: false,
  /** Limite de fissuração 1, 2 ou 3 pela NB-1 (DESENHO.BAS:4828). */
  classeFissuracao: 3,
  /** Grupos de bitolas para a escolha das armaduras e limites dos intervalos por bw,
   *  cm (DESENHO.BAS:4829-4834; os limites 3 a 5 só valem com mais grupos). */
  gruposBitolas: 3,
  limitesIntervalos: [18, 39, 0, 0, 0],
  /** Arranjos por intervalo de bw: As até `area` (cm²) → `arranjo` (A_145a/A_14b6,
   *  DESENHO.BAS:4835-4870, 4871-4908, 4909-4920). "N#16" = quantas forem precisas.
   *  Diferença: o último do 3º intervalo é 170 no embutido (DESENHO.BAS:4919) e 70 no
   *  SISTRUT.DSP de fábrica. Transcrito o embutido. */
  arranjosPorIntervalo: [
    [
      { area: 1, arranjo: "2#8" },
      { area: 1.6, arranjo: "2#10" },
      { area: 2.5, arranjo: "2#12.5" },
      { area: 3, arranjo: "2#12.5+#8" },
      { area: 3.3, arranjo: "2#12.5+#10" },
      { area: 3.75, arranjo: "3#12.5" },
      { area: 4, arranjo: "2#16" },
      { area: 5, arranjo: "4#12.5" },
      { area: 5.25, arranjo: "2#16+#12.5" },
      { area: 6, arranjo: "3#16" },
      { area: 6.5, arranjo: "2#16+2#12.5" },
      { area: 8, arranjo: "4#16" },
      { area: 10, arranjo: "5#16" },
      { area: 12, arranjo: "6#16" },
      { area: 12.6, arranjo: "4#20" },
      { area: 13.45, arranjo: "3#20+2#16" },
      { area: 18, arranjo: "N#16" },
      { area: 70, arranjo: "N#20" },
    ],
    [
      { area: 1, arranjo: "2#8" },
      { area: 1.6, arranjo: "2#10" },
      { area: 2.5, arranjo: "2#12.5" },
      { area: 3, arranjo: "2#12.5+#8" },
      { area: 3.3, arranjo: "2#12.5+#10" },
      { area: 3.75, arranjo: "3#12.5" },
      { area: 4, arranjo: "2#16" },
      { area: 5, arranjo: "4#12.5" },
      { area: 5.25, arranjo: "2#16+#12.5" },
      { area: 6, arranjo: "3#16" },
      { area: 6.5, arranjo: "2#16+2#12.5" },
      { area: 8, arranjo: "4#16" },
      { area: 9.45, arranjo: "3#20" },
      { area: 10, arranjo: "5#16" },
      { area: 10.3, arranjo: "2#20+2#16" },
      { area: 12.6, arranjo: "4#20" },
      { area: 13.45, arranjo: "3#20+2#16" },
      { area: 20, arranjo: "N#20" },
      { area: 70, arranjo: "N#25" },
    ],
    [
      { area: 2, arranjo: "4#8" },
      { area: 6.4, arranjo: "N#10" },
      { area: 10, arranjo: "N#12.5" },
      { area: 18, arranjo: "N#16" },
      { area: 26, arranjo: "N#20" },
      { area: 170, arranjo: "N#25" },
    ],
  ],
  /** Grupo de corte pelo número total de barras 2, 3, ..., 8, ≥ 9, por intervalo
   *  (A_14e4, DESENHO.BAS:4921-4944). */
  grupoDeCorte: [
    [2, 2, 2, 3, 3, 4, 4, 5],
    [2, 2, 2, 3, 3, 4, 4, 5],
    [0, 0, 6, 6, 6, 6, 6, 6],
  ],
  /** Estribos: Asw,mín = 0,14·bw cm²/m; s mínimo e máximo (cm); máximo comparado
   *  com d/2 (0) ou H/2 (1); bw máximo para estribo simples e duplo, cm
   *  (DESENHO.BAS:4945-4950). */
  taxaEstriboMinima: 0.14,
  espacamentoEstriboMinimo: 10,
  espacamentoEstriboMaximo: 30,
  comparaEspacamentoMaximo: "d/2" as "d/2" | "H/2",
  larguraEstriboSimples: 39,
  larguraEstriboDuplo: 59,
  /** Lista de espaçamentos de estribo, cm (texto "10/ 12/ ... 30/", DESENHO.BAS:4951). */
  espacamentosEstribo: [10, 12, 15, 17, 20, 22, 25, 27, 30],
  /** Bitola de estribo máxima e mínima por linha 0..5 (A_142c(i,1) e A_142c(i,0),
   *  DESENHO.BAS:4952-4963). O leitor de um .DSP do disco grava a máxima com sinal
   *  negativo (DESENHO.BAS:5365); o padrão embutido grava positivo. */
  bitolasEstribo: [
    { maxima: 4, minima: 4 },
    { maxima: 5, minima: 5 },
    { maxima: 6.3, minima: 6.3 },
    { maxima: 8, minima: 6.3 },
    { maxima: 10, minima: 6.3 },
    { maxima: 12.5, minima: 8 },
  ],
  /** Dobras por bitola 0..9, 5 colunas, cm (A_1c62, DESENHO.BAS:4964-5009; uso em
   *  DESINIT.BAS:2401). Nas bitolas 16 a 32 a 5ª coluna não é gravada (0; "NAO" no
   *  SISTRUT.DSP). */
  dobrasPorBitola: [
    [15, 15, 15, 15, 8],
    [15, 15, 15, 15, 8],
    [20, 20, 20, 15, 10],
    [25, 25, 25, 20, 12],
    [30, 30, 25, 20, 15],
    [30, 30, 30, 25, 15],
    [35, 35, 30, 25, 0],
    [35, 35, 35, 30, 0],
    [40, 40, 40, 35, 0],
    [40, 40, 40, 35, 0],
  ],
  /** Duas tabelas por bitola 4..12,5 sem rótulo no .DSP (A_1d1a e A_1d48,
   *  DESENHO.BAS:5010-5019). Diferença: o SISTRUT.DSP de fábrica traz 120 no 5º
   *  valor da primeira; o padrão embutido, 100. Transcrito o embutido. */
  tabelaBitola1: [15, 30, 70, 85, 100],
  tabelaBitola2: [30, 70, 100, 140, 180],
  /** Letra dos ferros (DESENHO.BAS:5020). */
  letraFerros: "N",
  /** Porta-estribos automáticos, ordem mínima da bitola e traspasse (cm; > 100 =
   *  diâmetros) (DESENHO.BAS:5021-5023). */
  portaEstribosAutomaticos: true,
  ordemMinimaPortaEstribo: 2,
  traspassePortaEstribo: 15,
  /** Comprimento desenvolvido e raio de dobramento a 90°, em diâmetros (DESENHO.BAS:5024-5025). */
  comprimentoDesenvolvido: true,
  raioDobramento: 8,
  /** As,mín negativa = taxa·bw·d (DESENHO.BAS:5026). */
  taxaMinimaNegativa: 0.001,
  /** Pele: altura a partir da qual (cm), taxa por face (·bw·hw) e traspasse
   *  (DESENHO.BAS:5027-5029). */
  alturaArmaduraPele: 60,
  taxaArmaduraPele: 0.0005,
  traspassePele: 20,
  /** Distância mínima dos estribos nas extremidades (cm) e entrada mínima nos apoios
   *  (diâmetros) (DESENHO.BAS:5030-5031). */
  distanciaMinimaEstribosExtremidade: 40,
  entradaMinimaApoio: 20,
  /** Grampos nos apoios ("S") e redução da ancoragem positiva por Ase/Anec ("N")
   *  (DESENHO.BAS:5032-5033). */
  verificaGrampos: true,
  reduzAncoragemPositiva: false,
  /** Maior ordem de bitola tratada como CA-60 e comprimento máximo da barra, cm
   *  (DESENHO.BAS:5034-5035). */
  ordemMaximaCA60: 1,
  comprimentoMaximoBarra: 1050,
};

/** Áreas certas (cm²) para o modo corrigido no lugar das áreas 0 do φ4 e do φ32
 *  (defeito R9, PLANO.md 4.2): π·φ²/4. */
export const AREAS_DSP_CORRIGIDAS = { 4: 0.125, 32: 8.04 } as const;

// ---------------------------------------------------------------- VIGA (VIGA.INI)

/** VIGA.INI de fábrica (padrões em VIGA.BAS:518-527, o mesmo do arquivo VIGA.INI).
 *  Uso: VICALC (T3). Especificação: apoio/livros_viga_pilar.md 1.1. */
export const PARAMETROS_VIGA = {
  /** Fator de redução dos negativos (INI linha 7 = 100 %, VIGA.BAS:518). */
  reducaoNegativos: 1,
  /** Acidentais "N": sem envoltória (INI linha 8, VIGA.BAS:519). */
  acidentais: false,
  /** Acidental "F" fornecida (false) ou "G" gerada (INI linha 9, VIGA.BAS:520). */
  acidentalGerada: false,
  /** % de acidental gerada sobre a carga total (INI linha 10, VIGA.BAS:521). */
  porcentagemAcidentalGerada: 30,
  /** Momentos externos nos apoios extremos "N" (INI linha 11, VIGA.BAS:522). */
  momentosExternos: false,
  /** Reação levada ao pilar: "E" estática ou "M" máxima (INI linha 12, VIGA.BAS:523). */
  reacaoNoPilar: "estatica" as "estatica" | "maxima",
  /** Coeficientes de medida (m) e força (t) (INI linhas 5-6, VIGA.BAS:526-527). */
  coeficienteMedida: 1,
  coeficienteForca: 1,
  /** Multiplicador (%) dos momentos de extremidade levados ao pilar, opção 7
   *  (V_1084%, VIGA.BAS:2244). */
  multiplicadorMomentosPilar: 100,
};

// ---------------------------------------------------------------- PILAR (PILAR.INI e .PIP)

/** Padrões do PILAR (PILAR.BAS:566-588, iguais ao PILAR.INI de fábrica) e bitolas
 *  em DATA (PILAR.BAS:2793 e 2795). Uso: PILAR e PILAREDI (T5). Especificação:
 *  apoio/livros_viga_pilar.md 2. */
export const PARAMETROS_PILAR = {
  /** Coeficientes de medida, força e de fck/fyk (PILAR.BAS:566, 567, 569). */
  coeficienteMedida: 1,
  coeficienteForca: 1,
  coeficienteTensao: 1,
  /** fck, fyk (t/cm²) e classe do aço (PILAR.BAS:570-572). */
  fck: 0.15,
  fyk: 5,
  classeAco: "B" as ClasseAco,
  /** 13 bitolas (mm) e áreas (cm²) (DATA PILAR.BAS:2793, 2795; lidas em 573-574). */
  bitolas: [
    { bitola: 3.2, area: 0.08 },
    { bitola: 4, area: 0.125 },
    { bitola: 5, area: 0.2 },
    { bitola: 6.3, area: 0.315 },
    { bitola: 8, area: 0.5 },
    { bitola: 10, area: 0.8 },
    { bitola: 12.5, area: 1.25 },
    { bitola: 16, area: 2 },
    { bitola: 20, area: 3.15 },
    { bitola: 22.2, area: 3.88 },
    { bitola: 25, area: 5 },
    { bitola: 32, area: 8 },
    { bitola: 40, area: 12.5 },
  ],
  /** Multiplicador de Ec (PILAR.BAS:575). */
  multiplicadorEc: 0.9,
  /** ea mínima (cm) e verificação de h/30 (PILAR.BAS:576-577). */
  excentricidadeMinima: 2,
  verificaH30: true,
  /** Excentricidades acidentais "I" isoladas ou "S" simultâneas (PILAR.BAS:578). */
  excentricidades: "isoladas" as "isoladas" | "simultaneas",
  /** Seções retangulares e circulares simétricas na verificação (PILAR.BAS:579). */
  secoesSimetricas: true,
  /** λ a partir do qual há 2ª ordem, fluência e "processo exato" (PILAR.BAS:580-582). */
  lambda2aOrdem: 40,
  lambdaFluencia: 80,
  lambdaProcessoExato: 140,
  /** Coeficiente de fluência φ e fatores da carga de fluência (PILAR.BAS:583-585). */
  coeficienteFluencia: 0,
  fatorNkFluencia: 0.95,
  fatorCargaFluencia: 1.1,
  /** Csf, Csc, Csa (PILAR.BAS:586-588). */
  gamaF: 1.4,
  gamaC: 1.4,
  gamaS: 1.15,
};

/** .PIP "SISTRUT" do PILAREDI (S_23c9a, PILAREDI.BAS:1834-1890). Uso: PILAREDI,
 *  PILGEEDI, PIPROEDI (T5). Rótulos do SISTRUT.PIP de fábrica. */
export const PARAMETROS_PIP = {
  /** Multiplicadores de fck para a tensão admissível Nk/A e Nk/A + Mk/W, taxa ideal
   *  do predimensionamento em % (PILAREDI.BAS:1834-1836). */
  tensaoAdmissivelNormal: 0.6,
  tensaoAdmissivelFlexao: 0.75,
  taxaIdealPredimensionamento: 1.5,
  /** Cobrimento da armadura do pilar, cm (PILAREDI.BAS:1837). */
  cobrimento: 2,
  /** Reduz para a fundação e para o dimensionamento a parcela acidental ("N",
   *  PILAREDI.BAS:1838-1839). */
  reduzAcidentalFundacao: false,
  reduzAcidentalDimensionamento: false,
  /** Acrescenta o peso próprio da coluna ("S") com densidade 2,5 t/m³ (PILAREDI.BAS:1840-1841). */
  pesoProprio: true,
  densidade: 2.5,
  /** % da carga total considerada acidental (PILAREDI.BAS:1842). */
  porcentagemAcidental: 10,
  /** Predimensionamento: múltiplo e medida mínima da seção, cm (PILAREDI.BAS:1843-1844). */
  multiploMedida: 5,
  medidaMinima: 14,
  /** Taxas de armadura (%): mínima sobre a seção calculada, mínima sobre a real,
   *  máxima (PILAREDI.BAS:1845-1847). */
  taxaMinimaCalculada: 0.8,
  taxaMinimaReal: 0.5,
  taxaMaxima: 6,
  /** Traspasse no cálculo da taxa ("S") e mistura de bitolas ("S") (PILAREDI.BAS:1848-1849). */
  traspasseNaTaxa: true,
  misturaBitolas: true,
  /** Ordem da menor bitola longitudinal: 5 = 10 mm (PILAREDI.BAS:1850). */
  ordemBitolaMinima: 5,
  /** Bitolas (mm), áreas (cm²), espaçamento mínimo entre barras (cm; uso em
   *  PILAREDI.BAS:6764-6876) e 4ª coluna da tabela (cm; INFERIDO: espaçamento máximo,
   *  uso não conferido) (PILAREDI.BAS:1855, 1859, 1867, 1871). Diferença: o
   *  SISTRUT.PIP de fábrica traz área 0,00 em 3,2 e 4 mm; o embutido, 0,08 e 0,125. */
  bitolas: [
    { bitola: 3.2, area: 0.08, espacamentoMinimo: 4, coluna4: 25 },
    { bitola: 4, area: 0.125, espacamentoMinimo: 4, coluna4: 30 },
    { bitola: 5, area: 0.2, espacamentoMinimo: 4, coluna4: 35 },
    { bitola: 6.3, area: 0.315, espacamentoMinimo: 4, coluna4: 35 },
    { bitola: 8, area: 0.5, espacamentoMinimo: 5, coluna4: 40 },
    { bitola: 10, area: 0.8, espacamentoMinimo: 5, coluna4: 40 },
    { bitola: 12.5, area: 1.25, espacamentoMinimo: 6, coluna4: 40 },
    { bitola: 16, area: 2, espacamentoMinimo: 6, coluna4: 40 },
    { bitola: 20, area: 3.15, espacamentoMinimo: 6, coluna4: 40 },
    { bitola: 22.2, area: 3.88, espacamentoMinimo: 8, coluna4: 40 },
    { bitola: 25, area: 5, espacamentoMinimo: 8, coluna4: 40 },
    { bitola: 32, area: 8, espacamentoMinimo: 8, coluna4: 40 },
    { bitola: 40, area: 12.5, espacamentoMinimo: 10, coluna4: 40 },
  ],
  /** Coeficiente do comprimento de flambagem por vínculo inferior × superior:
   *  engaste, semi-engaste, continuidade, livre (A_0f28, PILAREDI.BAS:1877). */
  coeficienteFlambagem: [
    [0.5, 0.7, 0.7, 2],
    [0.7, 0.9, 0.85, 2],
    [0.7, 0.85, 1, 2],
    [2, 2, 2, 100],
  ],
  /** Estribo por bitola longitudinal (índice igual a `bitolas`): bitola em mm e
   *  espaçamento em cm; 0 = sem estribo (A_0f56 em décimos, PILAREDI.BAS:1885-1886). */
  estriboPorBitola: [
    { bitola: 0, espacamento: 0 },
    { bitola: 0, espacamento: 0 },
    { bitola: 0, espacamento: 0 },
    { bitola: 0, espacamento: 0 },
    { bitola: 0, espacamento: 0 },
    { bitola: 6.3, espacamento: 12 },
    { bitola: 6.3, espacamento: 15 },
    { bitola: 6.3, espacamento: 15 },
    { bitola: 6.3, espacamento: 20 },
    { bitola: 8, espacamento: 25 },
    { bitola: 8, espacamento: 25 },
    { bitola: 8, espacamento: 30 },
    { bitola: 8, espacamento: 30 },
  ],
};

/** Parâmetros da análise de viga que o DESDIM usa: os do .DSP no lugar dos do VIGA.INI
 *  (redução dos negativos em DESDIM.BAS:5955 por V_0df4 = DESENHO.BAS:4773; acidentais e
 *  momentos externos do .DSP). Use com o `AnalisaViga` da T3 para montar a análise da T4. */
export function parametrosVicalcDoDsp(dsp: typeof PARAMETROS_DSP): typeof PARAMETROS_VIGA {
  return {
    ...PARAMETROS_VIGA,
    reducaoNegativos: dsp.reducaoNegativos,
    acidentais: dsp.acidentaisEnvoltoria,
    momentosExternos: dsp.momentosExternos,
  };
}

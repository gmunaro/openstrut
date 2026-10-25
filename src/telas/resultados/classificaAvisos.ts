// Organização da lista de avisos: severidade, grupo (rótulo curto) e origem de cada
// aviso, e o resumo dos repetidos ("COB V1 (apoios 1 e 2), V2 (apoio 1); SUP L1").
// Só organiza: o texto do aviso não muda. TypeScript puro, sem React.
//
// Cada regra cita o emissor do texto que ela reconhece. Texto que nenhuma regra
// reconhece vira "atenção" (nunca informativo): o padrão seguro é pedir a conferência.
import type { Aviso, FonteAviso } from "../calculo";

export type Severidade = "erro" | "atencao" | "info";

/** Ordem de exibição e títulos de cada nível. */
export const SEVERIDADES: readonly Severidade[] = ["erro", "atencao", "info"];

export const TITULO_SEVERIDADE: Record<Severidade, string> = {
  erro: "Erros que impedem o cálculo",
  atencao: "Atenção de engenharia",
  info: "Informativos",
};

interface Regra {
  grupo: string;
  severidade: Severidade;
  /** O grupo `(?<ponto>…)`, se houver, diz onde no elemento ("apoio 2", "tramo 1"). */
  re: RegExp;
}

/** Regras na ordem em que são testadas: vale a primeira que reconhece o texto. */
const REGRAS: readonly Regra[] = [
  // ---- erros: o elemento fica sem resultado ----
  {
    // calculo/sistrut/obra.ts (dimensionamento/detalhamento, quadro editado, pilar),
    // calculo/sistrut/pilaresDaObra.ts (predimensionamento, verificação)
    grupo: "Dimensionamento não concluído",
    severidade: "erro",
    re: /(?:dimensionamento|detalhamento|predimensionamento|quadro da armadura editada) não concluído|verificação não concluída/,
  },
  {
    // telas/resultados/motorSistrut.tsx (marca da viga interrompida) e
    // calculo/sistrut/obra.ts:964 (a viga parou no dimensionamento; o DESDIM pergunta "…")
    grupo: "Viga interrompida no DESDIM",
    severidade: "erro",
    re: /parou em "Continuo com o processamento|a viga parou no dimensionamento|o DESDIM pergunta ".*" e segue com o padrão N/,
  },
  {
    // telas/calculo.ts (coletarAvisos), calculo/montagem.ts, calculo/sistrut/obra.ts,
    // calculo/fluxoSistrut.ts (falha "não processada pelo VIGA")
    grupo: "Viga não calculada",
    severidade: "erro",
    re: /^viga não calculada|sem apoios suficientes.*não calculada|Vigas não calculadas por apoios em ciclo|não processadas? pelo VIGA/,
  },
  {
    // calculo/fluxoSistrut.ts:192; antes de "Laje não calculada" (fala de momentos)
    grupo: "Lajes pré-moldadas",
    severidade: "info",
    re: /: pré-moldada; o LAJECALC não calcula momentos/,
  },
  {
    // calculo/sistrut/lajes/esforcos.ts, calculo/fluxoSistrut.ts (momentos e falha)
    grupo: "Laje não calculada",
    severidade: "erro",
    re: /: não calculada\b|momentos não calculados|^Laje \S+ sem cálculo/,
  },
  {
    // calculo/sistrut/pilares/armadura.ts, calculo/sistrut/pilares/verificacao.ts,
    // telas/resultados/motorSistrut.tsx (caso de pilar sem resultado) e o código do caso
    // (CasoPilar.erro) que telas/calculo.ts (avisosVerificacoesPilar) põe na lista
    grupo: "Pilar sem resultado",
    severidade: "erro",
    re: /Lance não dimensionado|^Caso .*Sem resultado\.$|^(?:nao-converge|nk-nulo)$|verificação recusada|o original recusa a verificação/,
  },

  // ---- verificações de detalhamento da V2 (calculo/detalhamento/*.ts) ----
  {
    // calculo/detalhamento/vigas.ts:356 e lajes.ts:353
    grupo: "Ancoragem insuficiente",
    severidade: "atencao",
    re: /ancoragem no (?<ponto>(?:apoio|bordo) \d+) insuficiente/,
  },
  {
    // calculo/detalhamento/vigas.ts (armaduraDupla): a A's cabe nas barras de cima do
    // tramo; antes de "Armadura dupla não detalhada"
    grupo: "Armadura comprimida nas barras de cima",
    severidade: "info",
    re: /(?<ponto>tramo \d+): armadura dupla; a armadura comprimida .* fica com /,
  },
  {
    // calculo/detalhamento/vigas.ts (negativo do apoio; e armaduraDupla, no tramo)
    grupo: "Armadura dupla não detalhada",
    severidade: "atencao",
    re: /(?<ponto>(?:tramo|apoio) \d+): armadura dupla.*não está detalhada/,
  },
  {
    // calculo/detalhamento/vigas.ts:457
    grupo: "Negativo além do tramo seguinte",
    severidade: "atencao",
    re: /o negativo do (?<ponto>apoio \d+) precisa passar .* mais que o tramo seguinte/,
  },
  {
    // calculo/detalhamento/vigas.ts:622
    grupo: "Sem vão livre para estribos",
    severidade: "atencao",
    re: /(?<ponto>tramo \d+): sem vão livre para estribos/,
  },
  {
    // calculo/detalhamento/vigas.ts:380, lajes.ts:273, pilares.ts:250
    grupo: "Barra maior que 12 m",
    severidade: "atencao",
    re: /maior que a comercial de 12 m/,
  },
  {
    // calculo/detalhamento/lajes.ts:294, pilares.ts:259, 277, 296, 334
    grupo: "Armadura não detalhada",
    severidade: "atencao",
    re: /não (?:está )?detalhad[oa]s?\b/,
  },
  {
    // calculo/detalhamento/lajes.ts:360, 442, 446
    grupo: "Gancho a conferir",
    severidade: "atencao",
    re: /\bgancho\b/,
  },

  // ---- comportamento do original e pontos a conferir no cálculo ----
  {
    // calculo/sistrut/obra.ts:1504; antes de "Pilar sobre viga de transição"
    grupo: "Apoios de cálculo sem carga",
    severidade: "info",
    re: /nenhuma viga descarrega nel[ea]s?/,
  },
  {
    // calculo/sistrut/obra.ts:1466, 1467, 1758 e a transição sem coluna; na importação,
    // armazenamento/sistrut/pilar.ts ("Coluna … começa no nível …, sobre viga de transição")
    grupo: "Pilar sobre viga de transição",
    severidade: "atencao",
    re: /: nasce sobre |sobre viga de transição/,
  },
  {
    // calculo/sistrut/vigas/desinit.ts:476 e 482; armazenamento/sistrut/edv.ts:424
    grupo: "Viga mudou depois da edição",
    severidade: "atencao",
    re: /mudou depois da edição/,
  },
  {
    // calculo/sistrut/obra.ts:973
    grupo: "Quadro só da armadura editada",
    severidade: "info",
    re: /saíram só da armadura editada no SISTRUT/,
  },
  {
    // calculo/sistrut/obra.ts:1707
    grupo: "Armadura herdada da base da variação",
    severidade: "info",
    re: /\(a base da variação, PILAREDI/,
  },
  {
    // calculo/sistrut/obra.ts (seção do predimensionamento no lugar da seção da obra)
    grupo: "Seção do predimensionamento",
    severidade: "info",
    re: /seção do predimensionamento/,
  },
  {
    // calculo/sistrut/obra.ts:1426
    grupo: "Lance de pilar deslocado",
    severidade: "atencao",
    re: /lance deslocado/,
  },
  {
    // telas/resultados/motorSistrut.tsx (otimização parada), calculo/sistrut/lajes/otimizacao.ts,
    // calculo/sistrut/obra.ts (otimização não feita)
    grupo: "Otimização sem convergência",
    severidade: "atencao",
    re: /otimização dos negativos não converge|sem convergência|Otimização dos negativos não feita/,
  },
  {
    // calculo/montagem.ts, calculo/fluxoSistrut.ts:633, calculo/sistrut/montagem/reacoes.ts
    grupo: "Diferença no equilíbrio de cargas",
    severidade: "atencao",
    re: /(?:[Cc]arga|[Rr]eações|[Ss]oma).*\bdiferem?\b/,
  },
  {
    // calculo/sistrut/montagem/reacoes.ts, calculo/fluxoSistrut.ts:744 (falha)
    grupo: "Carga de laje sem viga",
    severidade: "atencao",
    re: /nenhuma viga com trecho igual ao bordo|Bordos de laje sem viga embaixo/,
  },
  {
    // calculo/quantitativos.ts
    grupo: "Aço subestimado nos quantitativos",
    severidade: "atencao",
    re: /aço (?:subestimado|não estimado)/,
  },
  {
    // calculo/quantitativos.ts
    grupo: "Estimativa de aço",
    severidade: "info",
    re: /: aço estimado \(/,
  },
  {
    // calculo/sistrut/vigas/desdim.ts:230 (o motivo da viga interrompida, por tramo)
    grupo: "Momento mais de 40 % acima do limite (1,4 ×)",
    severidade: "atencao",
    re: /momento (?:aplicado )?acima de 40 ?% do (?:momento )?limite/,
  },
  {
    // calculo/normas/nb1-78/*.ts, calculo/normas/nbr6118-2023/*.ts, calculo/fluxo.ts,
    // calculo/fluxoSistrut.ts (flecha, H mínimo e máximo, '*' do LAJEPROC),
    // calculo/sistrut/vigas/desdim.ts
    grupo: "Fora dos limites da norma",
    severidade: "atencao",
    re: /acima d[oae] (?:limite|máximo|l\/)|abaixo d[oa] (?:mínim|espessura mínima)|fora do escopo|não permitida|excede|esmagada|seção insuficiente|aumente a (?:seção|espessura)|λ (?:= [\d,]+ )?>|não cabem|não passa no LAJEPROC|H necessário > H máximo/,
  },

  // ---- importação do SISTRUT (telas/InicioSistrut.ts, armazenamento/sistrut/*.ts) ----
  {
    // armazenamento/sistrut/pilar.ts:1101, telas/InicioSistrut.ts:538,
    // armazenamento/sistrut/viga.ts (DESENHO.INI com .DSP que não veio)
    grupo: "Parâmetros que não vieram",
    severidade: "atencao",
    re: /que não foi passada|parece usar parâmetros próprios|, que não veio; valeu a/,
  },
  {
    // telas/InicioSistrut.ts:397
    grupo: "Vigas à parte, fora da planta",
    severidade: "atencao",
    re: /entraram à parte, no pavimento/,
  },
  {
    // armazenamento/sistrut/viga.ts:1154
    grupo: "Peso próprio tomado do .VIG",
    severidade: "atencao",
    re: /Peso próprio de \d+ kg\/m/,
  },
  {
    // armazenamento/sistrut/viga.ts:1129
    grupo: "Cargas do .VIG diferentes das da montagem",
    severidade: "info",
    re: /cargas do \.VIG diferentes das da montagem/,
  },
  {
    // armazenamento/sistrut/viga.ts:954
    grupo: "Apoio sem número de pilar no .VIG",
    severidade: "info",
    re: /, (?<ponto>apoio \d+): o J não traz o número do pilar/,
  },
  {
    // armazenamento/sistrut/edv.ts:505
    grupo: "Armadura editada no SISTRUT (.EDV)",
    severidade: "info",
    re: /^Armadura editada no DESEDCAO/,
  },
  {
    // armazenamento/sistrut/laje.ts
    grupo: "Painéis marcados como buraco",
    severidade: "info",
    re: /marcados? como buraco no LAJEGEOM/,
  },
  {
    // telas/InicioSistrut.ts:303
    grupo: "Ordem dos pavimentos",
    severidade: "info",
    re: /^Pavimentos, do topo para a base:/,
  },
  {
    // armazenamento/sistrut/edv.ts:404-424, telas/InicioSistrut.ts:78-88 e 238,
    // armazenamento/sistrut/viga.ts (só .VIG, .SEC, … são importados aqui)
    grupo: "Arquivos não usados",
    severidade: "info",
    re: /arquivo ignorado|; não usad[oa]\.|não entram como carga|ignorado: só \.VIG/,
  },
];

const GRUPO_DESCONHECIDO = "Outros avisos";

export interface AvisoClassificado extends Aviso {
  severidade: Severidade;
  grupo: string;
  fonte: FonteAviso;
  /** Elemento sem o sufixo " (detalhamento)", para o resumo. */
  elementoBase: string;
  /** Onde no elemento ("apoio 2"), quando a regra diz. */
  ponto?: string;
}

const SUFIXO_DETALHAMENTO = " (detalhamento)";

/** Origem do aviso: o campo `fonte`, se veio; senão, o elemento "Vx (detalhamento)" que
 *  `coletarAvisos` (telas/calculo.ts) dá aos avisos do detalhamento da V2. */
export const fonteDoAviso = (a: Aviso): FonteAviso =>
  a.fonte ?? (a.elemento.endsWith(SUFIXO_DETALHAMENTO) ? "detalhamento" : "calculo");

/** Severidade, grupo e origem de um aviso. Texto desconhecido: atenção, "Outros avisos". */
export function classificarAviso(a: Aviso): AvisoClassificado {
  const fonte = fonteDoAviso(a);
  const elementoBase = a.elemento.endsWith(SUFIXO_DETALHAMENTO)
    ? a.elemento.slice(0, -SUFIXO_DETALHAMENTO.length)
    : a.elemento;
  for (const r of REGRAS) {
    const m = r.re.exec(a.texto);
    if (!m) continue;
    const ponto = m.groups?.["ponto"];
    return {
      ...a,
      severidade: r.severidade,
      grupo: r.grupo,
      fonte,
      elementoBase,
      ...(ponto ? { ponto } : {}),
    };
  }
  return { ...a, severidade: "atencao", grupo: GRUPO_DESCONHECIDO, fonte, elementoBase };
}

export interface GrupoAvisos {
  /** Chave estável: severidade, origem e grupo. */
  chave: string;
  grupo: string;
  severidade: Severidade;
  fonte: FonteAviso;
  avisos: AvisoClassificado[];
  /** Onde o grupo aparece ("COB V1 (apoios 1 e 2), V2; SUP L1"); "" se não há local nem elemento. */
  resumo: string;
}

export interface NivelAvisos {
  severidade: Severidade;
  total: number;
  grupos: GrupoAvisos[];
}

/** Os avisos por severidade (erro, atenção, info; só os níveis com aviso) e, em cada uma,
 *  por grupo e origem, na ordem da primeira aparição. A ordem dos avisos se mantém. */
export function agruparAvisos(avisos: readonly Aviso[]): NivelAvisos[] {
  const grupos = new Map<string, GrupoAvisos>();
  for (const a of avisos.map(classificarAviso)) {
    const chave = `${a.severidade}|${a.fonte}|${a.grupo}`;
    const g = grupos.get(chave);
    if (g) g.avisos.push(a);
    else
      grupos.set(chave, {
        chave,
        grupo: a.grupo,
        severidade: a.severidade,
        fonte: a.fonte,
        avisos: [a],
        resumo: "",
      });
  }
  for (const g of grupos.values()) g.resumo = resumoDeOnde(g.avisos);
  return SEVERIDADES.flatMap((severidade) => {
    const doNivel = [...grupos.values()].filter((g) => g.severidade === severidade);
    if (doNivel.length === 0) return [];
    const total = doNivel.reduce((s, g) => s + g.avisos.length, 0);
    return [{ severidade, total, grupos: doNivel }];
  });
}

/** "apoio 1", "apoio 2", "tramo 1" → "apoios 1 e 2, tramo 1" (sem repetir). */
export function juntarPontos(pontos: readonly string[]): string {
  const porTipo = new Map<string, string[]>();
  for (const p of pontos) {
    const i = p.lastIndexOf(" ");
    const [tipo, n] = i < 0 ? [p, ""] : [p.slice(0, i), p.slice(i + 1)];
    const lista = porTipo.get(tipo) ?? [];
    if (!lista.includes(n)) lista.push(n);
    porTipo.set(tipo, lista);
  }
  return [...porTipo]
    .map(([tipo, ns]) => (ns.length === 1 ? `${tipo} ${ns[0]}` : `${tipo}s ${listaComE(ns)}`))
    .join(", ");
}

const listaComE = (xs: readonly string[]) =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`;

/** Onde os avisos aparecem, por local e elemento, na ordem da lista:
 *  "COB V1 (apoios 1 e 2), V2 (apoio 1); SUP L1". Aviso sem local nem elemento não entra. */
export function resumoDeOnde(avisos: readonly AvisoClassificado[]): string {
  const locais = new Map<string, Map<string, string[]>>();
  for (const a of avisos) {
    if (!a.local && !a.elementoBase) continue;
    const elementos = locais.get(a.local) ?? new Map<string, string[]>();
    locais.set(a.local, elementos);
    if (!a.elementoBase) continue;
    const pontos = elementos.get(a.elementoBase) ?? [];
    if (a.ponto) pontos.push(a.ponto);
    elementos.set(a.elementoBase, pontos);
  }
  return [...locais]
    .map(([local, elementos]) => {
      const nomes = [...elementos].map(([nome, pontos]) =>
        pontos.length > 0 ? `${nome} (${juntarPontos(pontos)})` : nome,
      );
      return [local || "obra", nomes.join(", ")].filter(Boolean).join(" ");
    })
    .join("; ");
}

/** Extensões de arquivo de pavimento: o nome do arquivo é o do pavimento. */
const ARQUIVO_DE_PAVIMENTO = /^(?<pav>[^\s:,/\\]+)\.(?:VIG|LAJ|SEC|FOR|TAB|REP|RLP)$/i;

/**
 * Aviso da importação (string) como `Aviso`: o pavimento sai do arquivo do começo
 * ("SUP.VIG: …" → "SUP"; outro arquivo, ou uma lista deles, fica com o nome inteiro) e
 * o elemento de "Viga V7", "Pilar P1", "Coluna P2" ou "Laje L1" logo depois. O texto
 * fica igual.
 */
export function avisoDaImportacao(texto: string): Aviso {
  const arquivo = /^(?<arq>[^\s:,/\\]+\.[A-Z0-9]{2,4}(?:, [^\s:,/\\]+\.[A-Z0-9]{2,4})*): /i.exec(
    texto,
  );
  const resto = arquivo ? texto.slice(arquivo[0].length) : texto;
  const nomeArquivo = arquivo?.groups?.["arq"] ?? "";
  const local = ARQUIVO_DE_PAVIMENTO.exec(nomeArquivo)?.groups?.["pav"] ?? nomeArquivo;
  const elemento = /^(?:Viga|Pilar-parede|Pilar|Coluna|Laje) (?<nome>[^\s,:]+)/.exec(resto)
    ?.groups?.["nome"];
  return { local, elemento: elemento ?? "", texto, fonte: "importacao" };
}

// Arquivo da obra (.openstrut.json): gravação, leitura com validação e migração
// por versão. Sem dependência externa: a validação monta uma Obra nova só com
// os campos conhecidos e junta as mensagens de erro em português. O conteúdo
// não depende do nome: os .sistrut.json de antes do renome abrem igual.
import {
  BORDOS,
  type Aco,
  type Bordo,
  type Caa,
  type ClasseAco,
  type Laje,
  type Materiais,
  type ModoCalculo,
  type NormaId,
  type Obra,
  type Pavimento,
  type Pilar,
  type Ponto,
  type Viga,
  type Vinculo,
  type IniPilar,
  type ParametrosPilarObra,
  type PipPilar,
  type SecaoNaoRetangular,
  type VinculosPilar,
  VINCULOS_PILAR,
} from "../dominio/obra";
import type {
  Alvenaria,
  BarraImposta,
  CargaOcupacao,
  ParametrosLajeObra,
  TipoLaje,
  TrechoPilar,
} from "../dominio/obra";
import { PARAMETROS_LAJE } from "../calculo/sistrut/base/parametros";

export const VERSAO_ATUAL = 3;
/** Extensão com que a obra é salva. */
export const EXTENSAO = ".openstrut.json";
/** Extensões que abrir aceita: a atual e a de antes do renome para OpenStrut. */
export const EXTENSOES_ACEITAS = [EXTENSAO, ".sistrut.json"] as const;

/** Obra → texto JSON do arquivo. */
export function serializarObra(obra: Obra) {
  return `${JSON.stringify(comEnvolventes(obra), null, 2)}\n`;
}

/** A obra com x, y, lx e ly de cada laje com polígono iguais ao retângulo envolvente
 *  dele (a mesma conta da leitura): o arquivo nunca grava os dois em desacordo. */
function comEnvolventes(obra: Obra): Obra {
  if (!obra.pavimentos.some((p) => p.lajes.some((l) => l.poligono))) return obra;
  return {
    ...obra,
    pavimentos: obra.pavimentos.map((p) => ({
      ...p,
      lajes: p.lajes.map((l) => (l.poligono ? { ...l, ...envolvente(l.poligono) } : l)),
    })),
  };
}

export type LeituraObra = { ok: true; obra: Obra } | { ok: false; erros: string[] };

type Dados = Record<string, unknown>;

/** Migrações: MIGRACOES[n] leva os dados da versão n para n + 1.
 *  Ao mudar o modelo, suba VERSAO_ATUAL e acrescente a migração aqui. */
const MIGRACOES: Record<number, (d: Dados) => Dados> = {
  // 1 → 2: Pavimento.pilaresRemovidos (pilares gerados que o usuário apagou).
  1: (d) => ({
    ...d,
    pavimentos: Array.isArray(d.pavimentos)
      ? d.pavimentos.map((p) => (ehObjeto(p) ? { ...p, pilaresRemovidos: [] } : p))
      : d.pavimentos,
  }),
  // 2 → 3: Materiais.classeAco e Laje.mu (NB-1/78). Obras antigas foram calculadas
  // com aço classe A e lajes isótropas: "A" e μ = 1 mantêm o resultado.
  2: (d) => ({
    ...d,
    materiais: ehObjeto(d.materiais) ? { ...d.materiais, classeAco: "A" } : d.materiais,
    pavimentos: Array.isArray(d.pavimentos)
      ? d.pavimentos.map((p) =>
          ehObjeto(p) && Array.isArray(p.lajes)
            ? { ...p, lajes: p.lajes.map((l) => (ehObjeto(l) ? { ...l, mu: 1 } : l)) }
            : p,
        )
      : d.pavimentos,
  }),
};

/** Leva os dados da versão `versao` até VERSAO_ATUAL. */
export function migrar(dados: Dados, versao: number): Dados {
  let d = dados;
  for (let v = versao; v < VERSAO_ATUAL; v++) {
    const passo = MIGRACOES[v];
    if (!passo) throw new Error(`Falta a migração da versão ${v} para ${v + 1}.`);
    d = { ...passo(d), versao: v + 1 };
  }
  return d;
}

/** Texto do arquivo → Obra validada, ou a lista de problemas encontrados. */
export function lerObra(texto: string): LeituraObra {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    return { ok: false, erros: [`O arquivo não é um JSON válido (${detalhe}).`] };
  }
  if (!ehObjeto(dados))
    return { ok: false, erros: ["O arquivo não contém uma obra do OpenStrut."] };
  const versao = dados.versao;
  if (versao === undefined)
    return { ok: false, erros: ["O arquivo não tem o campo versao: não é uma obra do OpenStrut."] };
  if (typeof versao !== "number" || !Number.isInteger(versao) || versao < 1)
    return { ok: false, erros: [`versao: esperado um inteiro ≥ 1, veio ${mostra(versao)}.`] };
  if (versao > VERSAO_ATUAL)
    return {
      ok: false,
      erros: [
        `O arquivo é da versão ${versao}, mais nova que a suportada (${VERSAO_ATUAL}). Atualize o OpenStrut.`,
      ],
    };
  let migrados: Dados;
  try {
    migrados = migrar(dados, versao);
  } catch (e) {
    return { ok: false, erros: [e instanceof Error ? e.message : String(e)] };
  }
  const v = new Validador();
  const obra = v.obra(migrados);
  return v.erros.length > 0 ? { ok: false, erros: v.erros } : { ok: true, obra };
}

const ehObjeto = (x: unknown): x is Dados =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const mostra = (x: unknown) => (x === undefined ? "nada" : JSON.stringify(x));

const NORMAS: readonly [NormaId, ...NormaId[]] = ["nb1-78", "nbr6118-2023"];
const MODOS: readonly [ModoCalculo, ...ModoCalculo[]] = ["corrigido", "original"];
const ACOS: readonly [Aco, ...Aco[]] = ["CA-25", "CA-50", "CA-60"];
const CAAS: readonly [Caa, ...Caa[]] = [1, 2, 3, 4];
const CLASSES_ACO: readonly [ClasseAco, ...ClasseAco[]] = ["A", "B"];
const VINCULOS: readonly [Vinculo, ...Vinculo[]] = ["engastado", "apoiado", "livre"];
const TIPOS_LAJE: readonly [TipoLaje, ...TipoLaje[]] = [
  "macica",
  "pre-moldada",
  "comum-nao-calculada",
];
/** Parâmetros do .LAP que a obra pode editar: os de fábrica sem os materiais. */

/** Retângulo envolvente do polígono da laje: x, y, lx e ly da laje com polígono. */
function envolvente(p: readonly Ponto[]) {
  const xs = p.map((v) => v.x);
  const ys = p.map((v) => v.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, lx: Math.max(...xs) - x, ly: Math.max(...ys) - y };
}

/** Lê cada campo, anota o erro com o caminho (ex.: pavimentos[0].lajes[1].lx) e
 *  devolve um valor neutro para seguir validando o resto. */
class Validador {
  erros: string[] = [];
  private ids = new Set<string>();

  private erro(caminho: string, msg: string, valor: unknown) {
    this.erros.push(`${caminho}: ${msg}, veio ${mostra(valor)}.`);
  }

  private objeto(x: unknown, caminho: string): Dados {
    if (ehObjeto(x)) return x;
    this.erro(caminho, "esperado um objeto", x);
    return {};
  }

  private lista(x: unknown, caminho: string): unknown[] {
    if (Array.isArray(x)) return x;
    this.erro(caminho, "esperada uma lista", x);
    return [];
  }

  private texto(d: Dados, campo: string, caminho: string) {
    const x = d[campo];
    if (typeof x === "string") return x;
    this.erro(`${caminho}.${campo}`, "esperado um texto", x);
    return "";
  }

  private id(d: Dados, caminho: string) {
    const id = this.texto(d, "id", caminho);
    if (id === "") {
      if (typeof d.id === "string") this.erro(`${caminho}.id`, "id vazio", d.id);
    } else if (this.ids.has(id)) {
      this.erro(`${caminho}.id`, "id repetido na obra", id);
    }
    this.ids.add(id);
    return id;
  }

  /** Número finito, com o limite pedido (> 0 ou ≥ 0). */
  private numero(
    d: Dados,
    campo: string,
    caminho: string,
    limite: "qualquer" | "positivo" | "naoNegativo" = "qualquer",
  ) {
    const x = d[campo];
    const c = `${caminho}.${campo}`;
    if (typeof x !== "number" || !Number.isFinite(x)) {
      this.erro(c, "esperado um número", x);
      return 0;
    }
    if (limite === "positivo" && x <= 0) this.erro(c, "esperado um número maior que zero", x);
    if (limite === "naoNegativo" && x < 0)
      this.erro(c, "esperado um número maior ou igual a zero", x);
    return x;
  }

  private opcao<T>(d: Dados, campo: string, caminho: string, opcoes: readonly [T, ...T[]]): T {
    const x = d[campo];
    const achada = opcoes.find((o) => o === x);
    if (achada !== undefined) return achada;
    this.erro(
      `${caminho}.${campo}`,
      `esperado um de ${opcoes.map((o) => mostra(o)).join(", ")}`,
      x,
    );
    return opcoes[0];
  }

  private booleano(d: Dados, campo: string, c: string): boolean {
    const x = d[campo];
    if (typeof x === "boolean") return x;
    this.erros.push(`${c}.${campo}: esperado verdadeiro ou falso, veio ${JSON.stringify(x)}.`);
    return true;
  }

  obra(d: Dados): Obra {
    return {
      versao: 3,
      nome: this.texto(d, "nome", "obra"),
      norma: this.opcao(d, "norma", "obra", NORMAS),
      // campo novo sem migração: obra antiga (sem ele) lê como "corrigido"
      modoCalculo:
        d.modoCalculo === undefined ? "corrigido" : this.opcao(d, "modoCalculo", "obra", MODOS),
      // campo opcional novo: ausente = roda a otimização (NB-1/78)
      ...(d.otimizaNegativos === undefined
        ? {}
        : { otimizaNegativos: this.booleano(d, "otimizaNegativos", "obra") }),
      // campo opcional novo: ausente = .LAP de fábrica (NB-1/78)
      ...(d.parametrosLaje === undefined
        ? {}
        : {
            parametrosLaje: this.parametrosLaje(
              this.objeto(d.parametrosLaje, "obra.parametrosLaje"),
              "obra.parametrosLaje",
            ),
          }),
      materiais: this.materiais(this.objeto(d.materiais, "obra.materiais")),
      pavimentos: this.lista(d.pavimentos, "obra.pavimentos").map((p, i) =>
        this.pavimento(this.objeto(p, `pavimentos[${i}]`), `pavimentos[${i}]`),
      ),
      // campo opcional novo: ausente = parâmetros de fábrica dos pilares
      ...(d.parametrosPilar === undefined
        ? {}
        : {
            parametrosPilar: this.parametrosPilar(
              this.objeto(d.parametrosPilar, "obra.parametrosPilar"),
            ),
          }),
    };
  }

  // ---- pilares pela NB-1/78 (SISTRUT): campos opcionais, ausentes = padrão

  /** Copia só os campos presentes, cada um validado pelo leitor dado. */
  private parcial<T>(
    d: Dados,
    c: string,
    leitores: { [K in keyof T]-?: (d: Dados, campo: string, c: string) => T[K] },
  ): Partial<T> {
    const r: Partial<T> = {};
    for (const chave of Object.keys(d)) {
      const ler = (
        leitores as Record<string, ((d: Dados, campo: string, c: string) => unknown) | undefined>
      )[chave];
      if (!ler) {
        this.erro(c, `campo desconhecido "${chave}"`, chave);
        continue;
      }
      (r as Record<string, unknown>)[chave] = ler(d, chave, c);
    }
    return r;
  }

  private parametrosPilar(d: Dados): ParametrosPilarObra {
    const c = "obra.parametrosPilar";
    const num =
      (lim: "qualquer" | "positivo" | "naoNegativo" = "qualquer") =>
      (x: Dados, campo: string, cx: string) =>
        this.numero(x, campo, cx, lim);
    const bool = (x: Dados, campo: string, cx: string) => this.booleano(x, campo, cx);
    const tabela =
      <T>(n: number, linha: (x: Dados, cx: string) => T) =>
      (x: Dados, campo: string, cx: string) => {
        const l = this.lista(x[campo], `${cx}.${campo}`);
        if (l.length !== n) this.erro(`${cx}.${campo}`, `esperadas ${n} linhas`, l.length);
        return l.map((y, i) =>
          linha(this.objeto(y, `${cx}.${campo}[${i}]`), `${cx}.${campo}[${i}]`),
        );
      };
    const ini = (x: Dados, campo: string, cx: string) =>
      this.parcial<IniPilar>(this.objeto(x[campo], `${cx}.${campo}`), `${cx}.${campo}`, {
        maximoBarras: (y, k, cy) => {
          const v = this.numero(y, k, cy, "positivo");
          if (!Number.isInteger(v)) this.erro(`${cy}.${k}`, "esperado um número inteiro", v);
          return v;
        },
        coeficienteMedida: num("positivo"),
        coeficienteForca: num("positivo"),
        coeficienteTensao: num("positivo"),
        fck: num("positivo"),
        fyk: num("positivo"),
        classeAco: (y, k, cy) => this.opcao(y, k, cy, CLASSES_ACO),
        bitolas: tabela(13, (y, cy) => ({
          bitola: this.numero(y, "bitola", cy, "positivo"),
          area: this.numero(y, "area", cy, "naoNegativo"),
        })),
        multiplicadorEc: num("positivo"),
        excentricidadeMinima: num("naoNegativo"),
        verificaH30: bool,
        excentricidades: (y, k, cy) => this.opcao(y, k, cy, EXCENTRICIDADES),
        secoesSimetricas: bool,
        lambda2aOrdem: num("naoNegativo"),
        lambdaFluencia: num("naoNegativo"),
        lambdaProcessoExato: num("naoNegativo"),
        coeficienteFluencia: num("naoNegativo"),
        fatorNkFluencia: num("positivo"),
        fatorCargaFluencia: num("positivo"),
        gamaF: num("positivo"),
        gamaC: num("positivo"),
        gamaS: num("positivo"),
      });
    const pip = (x: Dados, campo: string, cx: string) =>
      this.parcial<PipPilar>(this.objeto(x[campo], `${cx}.${campo}`), `${cx}.${campo}`, {
        tensaoAdmissivelNormal: num("positivo"),
        tensaoAdmissivelFlexao: num("positivo"),
        taxaIdealPredimensionamento: num("naoNegativo"),
        cobrimento: num("naoNegativo"),
        reduzAcidentalFundacao: bool,
        reduzAcidentalDimensionamento: bool,
        pesoProprio: bool,
        densidade: num("naoNegativo"),
        porcentagemAcidental: num("naoNegativo"),
        multiploMedida: num("positivo"),
        medidaMinima: num("positivo"),
        taxaMinimaCalculada: num("naoNegativo"),
        taxaMinimaReal: num("naoNegativo"),
        taxaMaxima: num("positivo"),
        traspasseNaTaxa: bool,
        misturaBitolas: bool,
        ordemBitolaMinima: (y, k, cy) => {
          const v = this.numero(y, k, cy, "naoNegativo");
          if (!Number.isInteger(v) || v > 12)
            this.erro(`${cy}.${k}`, "esperado um inteiro de 0 a 12", v);
          return v;
        },
        bitolas: tabela(13, (y, cy) => ({
          bitola: this.numero(y, "bitola", cy, "positivo"),
          area: this.numero(y, "area", cy, "naoNegativo"),
          espacamentoMinimo: this.numero(y, "espacamentoMinimo", cy, "naoNegativo"),
          coluna4: this.numero(y, "coluna4", cy, "naoNegativo"),
        })),
        coeficienteFlambagem: (y, k, cy) => {
          const l = this.lista(y[k], `${cy}.${k}`);
          if (l.length !== 4) this.erro(`${cy}.${k}`, "esperada uma matriz 4 × 4", l.length);
          return l.map((linha, i) => {
            const v = this.lista(linha, `${cy}.${k}[${i}]`);
            if (v.length !== 4) this.erro(`${cy}.${k}[${i}]`, "esperada uma linha de 4", v.length);
            return v.map((n, j) => {
              if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
              this.erro(`${cy}.${k}[${i}][${j}]`, "esperado um número maior que zero", n);
              return 0;
            });
          });
        },
        estriboPorBitola: tabela(13, (y, cy) => ({
          bitola: this.numero(y, "bitola", cy, "naoNegativo"),
          espacamento: this.numero(y, "espacamento", cy, "naoNegativo"),
        })),
      });
    return this.parcial<ParametrosPilarObra>(d, c, {
      ini,
      pip,
      predimensionamento: (y, k, cy) => this.opcao(y, k, cy, PREDIMENSIONAMENTOS),
    });
  }

  private vinculosPilar(d: Dados, c: string): VinculosPilar {
    return { x: this.opcao(d, "x", c, VINCULOS_PILAR), y: this.opcao(d, "y", c, VINCULOS_PILAR) };
  }

  private secaoPilar(d: Dados, c: string): SecaoNaoRetangular {
    const tipo = this.opcao(d, "tipo", c, TIPOS_SECAO_PILAR);
    if (tipo === "circular") {
      const s = {
        tipo,
        d: this.numero(d, "d", c, "positivo"),
        dInterno: this.numero(d, "dInterno", c, "naoNegativo"),
      };
      if (s.dInterno >= s.d)
        this.erro(`${c}.dInterno`, "o vazado tem de ser menor que o diâmetro", s.dInterno);
      return s;
    }
    const vertices = this.lista(d.vertices, `${c}.vertices`).map((p, i) =>
      this.ponto(this.objeto(p, `${c}.vertices[${i}]`), `${c}.vertices[${i}]`),
    );
    if (vertices.length < 3)
      this.erro(`${c}.vertices`, "esperados ao menos 3 vértices", vertices.length);
    return { tipo, vertices };
  }

  /** Lista de momentos com os campos numéricos dados e no máximo `max` itens. */
  private momentos<K extends string>(d: Dados, c: string, campos: readonly K[], max: number) {
    const l = this.lista(d.momentos, `${c}.momentos`);
    if (l.length > max) this.erro(`${c}.momentos`, `no máximo ${max}`, l.length);
    return l.map((m, i) => {
      const cm = `${c}.momentos[${i}]`;
      const o = this.objeto(m, cm);
      return Object.fromEntries(campos.map((k) => [k, this.numero(o, k, cm)])) as Record<K, number>;
    });
  }

  private camposPilar(d: Dados, c: string): Partial<Pilar> {
    const r: Partial<Pilar> = {};
    if (d.secao !== undefined)
      r.secao = this.secaoPilar(this.objeto(d.secao, `${c}.secao`), `${c}.secao`);
    if (d.rotacao !== undefined) {
      r.rotacao = this.numero(d, "rotacao", c, "naoNegativo");
      if (r.rotacao > 360)
        this.erro(`${c}.rotacao`, "esperado um ângulo de 0 a 360 graus", r.rotacao);
      if (d.secao !== undefined)
        this.erro(`${c}.rotacao`, "a rotação só vale na seção retangular", r.rotacao);
    }
    if (d.vinculos !== undefined)
      r.vinculos = this.vinculosPilar(this.objeto(d.vinculos, `${c}.vinculos`), `${c}.vinculos`);
    if (d.vinculosTopo !== undefined)
      r.vinculosTopo = this.vinculosPilar(
        this.objeto(d.vinculosTopo, `${c}.vinculosTopo`),
        `${c}.vinculosTopo`,
      );
    if (d.excentricidade !== undefined) {
      const e = this.objeto(d.excentricidade, `${c}.excentricidade`);
      r.excentricidade = {
        x: this.numero(e, "x", `${c}.excentricidade`),
        y: this.numero(e, "y", `${c}.excentricidade`),
      };
    }
    if (d.vento !== undefined) {
      const cv = `${c}.vento`;
      const v = this.objeto(d.vento, cv);
      r.vento = {
        normal: this.numero(v, "normal", cv),
        momentos: this.momentos(v, cv, ["m", "angulo"], 2),
      };
    }
    if (d.cargaTopo !== undefined) {
      const cc = `${c}.cargaTopo`;
      const v = this.objeto(d.cargaTopo, cc);
      // vão com sinal: o .REP lido grava vão·(−SGN(M)) (PILGEEDI.BAS:606-608)
      const momentos = this.momentos(v, cc, ["m", "inclinacao", "vao", "rigidez"], 4);
      momentos.forEach((m, i) => {
        if (m.rigidez < 0)
          this.erro(
            `${cc}.momentos[${i}].rigidez`,
            "esperado um número maior ou igual a zero",
            m.rigidez,
          );
      });
      r.cargaTopo = { normal: this.numero(v, "normal", cc), momentos };
    }
    if (d.verificacoes !== undefined)
      r.verificacoes = this.lista(d.verificacoes, `${c}.verificacoes`).map((x, i) => {
        const cv = `${c}.verificacoes[${i}]`;
        const v = this.objeto(x, cv);
        const barras = this.lista(v.barras, `${cv}.barras`).map((b, j) => {
          const cb = `${cv}.barras[${j}]`;
          const o = this.objeto(b, cb);
          return {
            x: this.numero(o, "x", cb),
            y: this.numero(o, "y", cb),
            bitola: this.numero(o, "bitola", cb, "positivo"),
          };
        });
        const ces = `${cv}.estribo`;
        const es = v.estribo === undefined ? undefined : this.objeto(v.estribo, ces);
        const estribo = es && {
          bitola: this.numero(es, "bitola", ces, "positivo"),
          espacamento: this.numero(es, "espacamento", ces, "positivo"),
        };
        const ce = `${cv}.esforcos`;
        const e = v.esforcos === undefined ? undefined : this.objeto(v.esforcos, ce);
        const esforcos = e && {
          nk: this.numero(e, "nk", ce),
          mxk: this.numero(e, "mxk", ce),
          myk: this.numero(e, "myk", ce),
          lex: this.numero(e, "lex", ce, "positivo"),
          ley: this.numero(e, "ley", ce, "positivo"),
        };
        return { barras, ...(estribo ? { estribo } : {}), ...(esforcos ? { esforcos } : {}) };
      });
    return r;
  }

  private materiais(d: Dados): Materiais {
    const c = "materiais";
    return {
      fck: this.numero(d, "fck", c, "positivo"),
      aco: this.opcao(d, "aco", c, ACOS),
      acoEstribo: this.opcao(d, "acoEstribo", c, ACOS),
      classeAco: this.opcao(d, "classeAco", c, CLASSES_ACO),
      caa: this.opcao(d, "caa", c, CAAS),
      cobrimentoLaje: this.numero(d, "cobrimentoLaje", c, "naoNegativo"),
      cobrimentoViga: this.numero(d, "cobrimentoViga", c, "naoNegativo"),
      cobrimentoPilar: this.numero(d, "cobrimentoPilar", c, "naoNegativo"),
    };
  }

  private pavimento(d: Dados, c: string): Pavimento {
    const repeticoes = this.numero(d, "repeticoes", c, "positivo");
    if (!Number.isInteger(repeticoes))
      this.erro(`${c}.repeticoes`, "esperado um número inteiro", repeticoes);
    const cada = <T>(campo: string, f: (x: Dados, c: string) => T) =>
      this.lista(d[campo], `${c}.${campo}`).map((x, i) =>
        f(this.objeto(x, `${c}.${campo}[${i}]`), `${c}.${campo}[${i}]`),
      );
    return {
      id: this.id(d, c),
      nome: this.texto(d, "nome", c),
      peDireito: this.numero(d, "peDireito", c, "positivo"),
      repeticoes,
      lajes: cada("lajes", (x, cx) => this.laje(x, cx)),
      vigas: cada("vigas", (x, cx) => this.viga(x, cx)),
      pilares: cada("pilares", (x, cx) => this.pilar(x, cx)),
      pilaresRemovidos: cada("pilaresRemovidos", (x, cx) => this.ponto(x, cx)),
      // campos opcionais novos (SISTRUT): ausentes = nenhum
      ...(d.cargasOcupacao === undefined
        ? {}
        : { cargasOcupacao: cada("cargasOcupacao", (x, cx) => this.cargaOcupacao(x, cx)) }),
      ...(d.alvenarias === undefined
        ? {}
        : { alvenarias: cada("alvenarias", (x, cx) => this.alvenaria(x, cx)) }),
      ...(d.trechosPilares === undefined
        ? {}
        : { trechosPilares: cada("trechosPilares", (x, cx) => this.trechoPilar(x, cx)) }),
    };
  }

  /** Lista de pontos com pelo menos `minimo` itens. */
  private pontos(x: unknown, c: string, minimo: number): Ponto[] {
    const lista = this.lista(x, c).map((p, i) =>
      this.ponto(this.objeto(p, `${c}[${i}]`), `${c}[${i}]`),
    );
    if (Array.isArray(x) && lista.length < minimo)
      this.erro(c, `esperados pelo menos ${minimo} pontos`, x);
    return lista;
  }

  /** Polígono com 3 vértices ou mais e área; o da laje em sentido horário (o do
   *  LAJEGEOM), o da carga de ocupação em qualquer sentido. */
  private poligono(x: unknown, c: string, horario = true): Ponto[] {
    const p = this.pontos(x, c, 3);
    const area = p.reduce((a, v, k) => {
      const w = p[(k + 1) % p.length]!;
      return a + v.x * w.y - w.x * v.y;
    }, 0);
    if (p.length >= 3 && (horario ? area >= 0 : area === 0))
      this.erros.push(
        `${c}: o polígono deve ${horario ? "estar em sentido horário e " : ""}ter área.`,
      );
    return p;
  }

  private cargaOcupacao(d: Dados, c: string): CargaOcupacao {
    return {
      poligono: this.poligono(d.poligono, `${c}.poligono`, false),
      total: this.numero(d, "total", c, "naoNegativo"),
      acidental: this.numero(d, "acidental", c, "naoNegativo"),
    };
  }

  private alvenaria(d: Dados, c: string): Alvenaria {
    return {
      inicio: this.ponto(this.objeto(d.inicio, `${c}.inicio`), `${c}.inicio`),
      fim: this.ponto(this.objeto(d.fim, `${c}.fim`), `${c}.fim`),
      carga: this.numero(d, "carga", c, "naoNegativo"),
    };
  }

  /** Parâmetros do .LAP editados: cada um com a forma e o tamanho do de fábrica
   *  (`PARAMETROS_LAJE`); positivos onde o cálculo divide por eles. */
  private parametrosLaje(d: Dados, c: string): ParametrosLajeObra {
    const r: ParametrosLajeObra = {};
    const poe = <K extends keyof ParametrosLajeObra>(
      k: K,
      v: NonNullable<ParametrosLajeObra[K]> | undefined,
    ) => {
      if (v !== undefined) r[k] = v;
    };
    const n = (k: string, limite: "positivo" | "naoNegativo" = "positivo") =>
      d[k] === undefined ? undefined : this.numero(d, k, c, limite);
    const sn = (k: string) => (d[k] === undefined ? undefined : this.booleano(d, k, c));
    /** Tabela de objetos com o tamanho da de fábrica. */
    const tabela = <T>(k: string, tamanho: number, item: (x: Dados, ci: string) => T) => {
      if (d[k] === undefined) return undefined;
      const ck = `${c}.${k}`;
      const l = this.lista(d[k], ck).map((x, i) =>
        item(this.objeto(x, `${ck}[${i}]`), `${ck}[${i}]`),
      );
      if (Array.isArray(d[k]) && l.length !== tamanho)
        this.erro(ck, `esperados ${tamanho} itens, como na tabela de fábrica`, d[k]);
      return l;
    };
    poe("gamaF", n("gamaF"));
    poe("gamaC", n("gamaC"));
    poe("gamaS", n("gamaS"));
    poe("acrescimo", n("acrescimo", "naoNegativo"));
    const bitolas = PARAMETROS_LAJE.bitolas.length;
    poe(
      "bitolas",
      tabela("bitolas", bitolas, (x, ci) => ({
        bitola: this.numero(x, "bitola", ci, "positivo"),
        // área 0 desativa a bitola, como a de 4 mm de fábrica
        area: this.numero(x, "area", ci, "naoNegativo"),
      })),
    );
    poe(
      "relacaoMu",
      tabela("relacaoMu", PARAMETROS_LAJE.relacaoMu.length, (x, ci) => ({
        relacao: this.numero(x, "relacao", ci, "positivo"),
        mu: this.numero(x, "mu", ci, "positivo"),
      })),
    );
    poe("hMin", n("hMin"));
    poe("hMax", n("hMax"));
    poe(
      "espacamentoMinimoPorH",
      tabela("espacamentoMinimoPorH", PARAMETROS_LAJE.espacamentoMinimoPorH.length, (x, ci) => ({
        hAte: this.numero(x, "hAte", ci, "positivo"),
        espacamento: this.numero(x, "espacamento", ci, "positivo"),
      })),
    );
    poe("espacamentoMaximo", n("espacamentoMaximo"));
    if (d.espacamentos !== undefined) {
      const ce = `${c}.espacamentos`;
      const l = this.lista(d.espacamentos, ce).map((v, i) => this.item(v, `${ce}[${i}]`));
      if (Array.isArray(d.espacamentos) && l.length === 0)
        this.erro(ce, "esperada uma lista com itens", d.espacamentos);
      poe("espacamentos", l);
    }
    poe(
      "bitolaPorH",
      tabela("bitolaPorH", PARAMETROS_LAJE.bitolaPorH.length, (x, ci) => {
        const indiceBitola = this.numero(x, "indiceBitola", ci, "naoNegativo");
        if (!Number.isInteger(indiceBitola) || indiceBitola >= bitolas)
          this.erro(
            `${ci}.indiceBitola`,
            `esperado um índice inteiro de 0 a ${bitolas - 1}`,
            x.indiceBitola,
          );
        return { hAte: this.numero(x, "hAte", ci, "positivo"), indiceBitola };
      }),
    );
    poe("taxaMinimaPositiva", n("taxaMinimaPositiva", "naoNegativo"));
    poe("taxaMinimaNegativa", n("taxaMinimaNegativa", "naoNegativo"));
    poe("limitaEspacamento2H", sn("limitaEspacamento2H"));
    poe("fracaoLinhaNeutra", n("fracaoLinhaNeutra"));
    if (d.flecha !== undefined) {
      const cf = `${c}.flecha`;
      const x = this.objeto(d.flecha, cf);
      poe("flecha", {
        lfTotal: this.numero(x, "lfTotal", cf, "positivo"),
        lfAcidental: this.numero(x, "lfAcidental", cf, "positivo"),
        multiplicadorEc: this.numero(x, "multiplicadorEc", cf, "positivo"),
        deformacaoLenta: this.booleano(x, "deformacaoLenta", cf),
      });
    }
    poe("relacaoNegPosMin", n("relacaoNegPosMin"));
    poe("relacaoNegPosMax", n("relacaoNegPosMax"));
    poe("relacaoCantosReentrantes", n("relacaoCantosReentrantes", "naoNegativo"));
    poe("eficienciaNegativa", n("eficienciaNegativa"));
    poe("toleranciaComprimento", n("toleranciaComprimento"));
    poe("toleranciaAngulo", n("toleranciaAngulo"));
    for (const k of Object.keys(d))
      if (!(k in r))
        this.erro(
          `${c}.${k}`,
          "parâmetro do .LAP desconhecido (fck, fyk, classe do aço, cobrimento e densidade vêm dos materiais)",
          k,
        );
    return r;
  }

  /** Item de lista que é um número maior que zero. */
  private item(x: unknown, c: string) {
    if (typeof x === "number" && Number.isFinite(x) && x > 0) return x;
    this.erro(c, "esperado um número maior que zero", x);
    return 1;
  }

  /** Barra de laje (bitola, mm; espaçamento, cm). */
  private barra(d: Dados, c: string): BarraImposta {
    return {
      bitola: this.numero(d, "bitola", c, "positivo"),
      espacamento: this.numero(d, "espacamento", c, "positivo"),
    };
  }

  private trechoPilar(d: Dados, c: string): TrechoPilar {
    return {
      pilar: this.texto(d, "pilar", c),
      inicio: this.ponto(this.objeto(d.inicio, `${c}.inicio`), `${c}.inicio`),
      fim: this.ponto(this.objeto(d.fim, `${c}.fim`), `${c}.fim`),
    };
  }

  private laje(d: Dados, c: string): Laje {
    const vd = this.objeto(d.vinculos, `${c}.vinculos`);
    const vinculos: Partial<Record<Bordo, Vinculo>> = {};
    for (const chave of Object.keys(vd)) {
      const bordo = BORDOS.find((b) => b === chave);
      if (!bordo) {
        this.erro(
          `${c}.vinculos`,
          `bordo desconhecido "${chave}" (use ${BORDOS.join(", ")})`,
          chave,
        );
        continue;
      }
      vinculos[bordo] = this.opcao(vd, bordo, `${c}.vinculos`, VINCULOS);
    }
    return {
      id: this.id(d, c),
      nome: this.texto(d, "nome", c),
      x: this.numero(d, "x", c),
      y: this.numero(d, "y", c),
      lx: this.numero(d, "lx", c, "positivo"),
      ly: this.numero(d, "ly", c, "positivo"),
      h: this.numero(d, "h", c, "positivo"),
      revestimento: this.numero(d, "revestimento", c, "naoNegativo"),
      sobrecarga: this.numero(d, "sobrecarga", c, "naoNegativo"),
      vinculos,
      mu: this.numero(d, "mu", c, "positivo"),
      // campos opcionais novos (SISTRUT): ausentes = retângulo, maciça, ângulo 0; com
      // polígono, x/y/lx/ly saem dele
      ...this.lajeSistrut(d, c),
    };
  }

  private lajeSistrut(d: Dados, c: string): Partial<Laje> {
    const r: Partial<Laje> = {};
    if (d.poligono !== undefined) {
      r.poligono = this.poligono(d.poligono, `${c}.poligono`);
      if (r.poligono.length > 0) Object.assign(r, envolvente(r.poligono));
    }
    /** Um item (ou null) por lado do polígono. */
    const porLado = <T>(campo: string, item: (v: unknown, ci: string) => T) => {
      const cl = `${c}.${campo}`;
      const l = this.lista(d[campo], cl).map((v, i) =>
        v === null ? null : item(v, `${cl}[${i}]`),
      );
      if (r.poligono === undefined) this.erro(cl, "só vale com o polígono", d[campo]);
      else if (l.length !== r.poligono.length)
        this.erro(cl, `esperado um item por lado do polígono (${r.poligono.length})`, d[campo]);
      return l;
    };
    if (d.vinculosLados !== undefined)
      r.vinculosLados = porLado("vinculosLados", (v, ci) => {
        const achado = VINCULOS.find((o) => o === v);
        if (achado === undefined)
          this.erro(ci, `esperado um de ${VINCULOS.map((o) => mostra(o)).join(", ")} ou null`, v);
        return achado ?? "apoiado";
      });
    if (d.negativasImpostas !== undefined)
      r.negativasImpostas = porLado("negativasImpostas", (v, ci) =>
        this.barra(this.objeto(v, ci), ci),
      );
    if (d.armaduraImposta !== undefined) {
      const ca = `${c}.armaduraImposta`;
      const a = this.objeto(d.armaduraImposta, ca);
      const barra = (k: string) =>
        a[k] === undefined
          ? {}
          : { [k]: this.barra(this.objeto(a[k], `${ca}.${k}`), `${ca}.${k}`) };
      r.armaduraImposta = { ...barra("principal"), ...barra("secundaria") };
    }
    if (d.anguloArmadura !== undefined) {
      r.anguloArmadura = this.numero(d, "anguloArmadura", c);
      if (r.anguloArmadura < 0 || r.anguloArmadura >= 180)
        this.erro(
          `${c}.anguloArmadura`,
          "esperado um ângulo de 0 a 180 graus (sem o 180)",
          d.anguloArmadura,
        );
    }
    if (d.tipo !== undefined) r.tipo = this.opcao(d, "tipo", c, TIPOS_LAJE);
    return r;
  }

  private viga(d: Dados, c: string): Viga {
    const v: Viga = {
      id: this.id(d, c),
      nome: this.texto(d, "nome", c),
      x1: this.numero(d, "x1", c),
      y1: this.numero(d, "y1", c),
      x2: this.numero(d, "x2", c),
      y2: this.numero(d, "y2", c),
      bw: this.numero(d, "bw", c, "positivo"),
      h: this.numero(d, "h", c, "positivo"),
      cargaLinear: this.numero(d, "cargaLinear", c, "naoNegativo"),
      ...(d.pesoProprio === undefined
        ? {}
        : { pesoProprio: this.numero(d, "pesoProprio", c, "naoNegativo") }),
    };
    const horizontal = v.y1 === v.y2;
    const vertical = v.x1 === v.x2;
    if (horizontal === vertical)
      this.erros.push(
        `${c}: a viga deve ser horizontal ou vertical e ter comprimento, veio (${v.x1}; ${v.y1}) → (${v.x2}; ${v.y2}).`,
      );
    return v;
  }

  private ponto(d: Dados, c: string): Ponto {
    return { x: this.numero(d, "x", c), y: this.numero(d, "y", c) };
  }

  private pilar(d: Dados, c: string): Pilar {
    return {
      id: this.id(d, c),
      nome: this.texto(d, "nome", c),
      x: this.numero(d, "x", c),
      y: this.numero(d, "y", c),
      b: this.numero(d, "b", c, "positivo"),
      h: this.numero(d, "h", c, "positivo"),
      ...this.camposPilar(d, c),
    };
  }
}

const TIPOS_SECAO_PILAR = ["circular", "poligonal"] as const;
const EXCENTRICIDADES = ["isoladas", "simultaneas"] as const;
const PREDIMENSIONAMENTOS = ["tensoes", "secao"] as const;

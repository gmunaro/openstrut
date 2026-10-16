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
  type CargaViga,
  type FormaApoioViga,
  type FormaTrechoViga,
  type ParametrosVigaObra,
} from "../dominio/obra";
import { PARAMETROS_DSP, PARAMETROS_VIGA } from "../calculo/sistrut/base/parametros";

export const VERSAO_ATUAL = 3;
/** Extensão com que a obra é salva. */
export const EXTENSAO = ".openstrut.json";
/** Extensões que abrir aceita: a atual e a de antes do renome para OpenStrut. */
export const EXTENSOES_ACEITAS = [EXTENSAO, ".sistrut.json"] as const;

/** Obra → texto JSON do arquivo. */
export function serializarObra(obra: Obra) {
  return `${JSON.stringify(obra, null, 2)}\n`;
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
      materiais: this.materiais(this.objeto(d.materiais, "obra.materiais")),
      pavimentos: this.lista(d.pavimentos, "obra.pavimentos").map((p, i) =>
        this.pavimento(this.objeto(p, `pavimentos[${i}]`), `pavimentos[${i}]`),
      ),
      // campo opcional novo: ausente = parâmetros de fábrica
      ...(d.parametrosViga === undefined
        ? {}
        : {
            parametrosViga: this.parametrosViga(
              this.objeto(d.parametrosViga, "obra.parametrosViga"),
            ),
          }),
    };
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
    };
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
      ...this.entradaVigaSistrut(d, c),
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
    };
  }

  // ---- entrada do VIGA/DESENHO do SISTRUT (campos opcionais novos, sem migração)

  /** Lista opcional: ausente = nada; presente = cada item por `f`. */
  private opcional<T>(d: Dados, campo: string, c: string, f: (x: unknown, cx: string) => T) {
    if (d[campo] === undefined) return undefined;
    return this.lista(d[campo], `${c}.${campo}`).map((x, i) => f(x, `${c}.${campo}[${i}]`));
  }

  /** Número de uma lista (`c` é o caminho do item). */
  private numeroSolto(x: unknown, c: string, limite: "positivo" | "naoNegativo") {
    if (typeof x !== "number" || !Number.isFinite(x)) {
      this.erro(c, "esperado um número", x);
      return 0;
    }
    if (limite === "positivo" && x <= 0) this.erro(c, "esperado um número maior que zero", x);
    if (limite === "naoNegativo" && x < 0)
      this.erro(c, "esperado um número maior ou igual a zero", x);
    return x;
  }

  private entradaVigaSistrut(d: Dados, c: string): Partial<Viga> {
    const r: Partial<Viga> = {};
    const cargas = this.opcional(d, "cargas", c, (x, cx) => this.cargaViga(this.objeto(x, cx), cx));
    if (cargas) r.cargas = cargas;
    if (d.somenteCargasProprias !== undefined)
      r.somenteCargasProprias = this.booleano(d, "somenteCargasProprias", c);
    const vaos = this.opcional(d, "vaos", c, (x, cx) => this.numeroSolto(x, cx, "positivo"));
    if (vaos) r.vaos = vaos;
    const inercias = this.opcional(d, "inercias", c, (x, cx) =>
      this.numeroSolto(x, cx, "positivo"),
    );
    if (inercias) r.inercias = inercias;
    if (d.engaste !== undefined) {
      const e = this.objeto(d.engaste, `${c}.engaste`);
      r.engaste = {
        esquerdo: this.booleano(e, "esquerdo", `${c}.engaste`),
        direito: this.booleano(e, "direito", `${c}.engaste`),
      };
    }
    if (d.momentosExternos !== undefined) {
      const m = this.objeto(d.momentosExternos, `${c}.momentosExternos`);
      r.momentosExternos = {
        esquerdo: this.numero(m, "esquerdo", `${c}.momentosExternos`),
        direito: this.numero(m, "direito", `${c}.momentosExternos`),
      };
    }
    const desc = this.opcional(d, "apoiosDesconsiderados", c, (x, cx) => {
      const k = this.numeroSolto(x, cx, "naoNegativo");
      if (!Number.isInteger(k)) this.erro(cx, "esperado um número inteiro", x);
      return k;
    });
    if (desc) r.apoiosDesconsiderados = desc;
    if (d.secoes !== undefined) {
      const s = this.objeto(d.secoes, `${c}.secoes`);
      const cs = `${c}.secoes`;
      const trechos = this.opcional(s, "trechos", cs, (x, cx) => {
        const t = this.objeto(x, cx);
        return {
          bw: this.numero(t, "bw", cx, "positivo"),
          h: this.numero(t, "h", cx, "positivo"),
          bf: this.numero(t, "bf", cx, "naoNegativo"),
          hf: this.numero(t, "hf", cx, "naoNegativo"),
        };
      });
      const apoios = this.opcional(s, "apoios", cs, (x, cx) => {
        const a = this.objeto(x, cx);
        return { bw: this.numero(a, "bw", cx, "positivo"), h: this.numero(a, "h", cx, "positivo") };
      });
      r.secoes = { ...(trechos ? { trechos } : {}), ...(apoios ? { apoios } : {}) };
    }
    if (d.forma !== undefined) {
      const f = this.objeto(d.forma, `${c}.forma`);
      const cf = `${c}.forma`;
      const numeros = <K extends string>(o: Dados, cx: string, campos: readonly K[]) => {
        const out: Partial<Record<K, number>> = {};
        for (const k of campos) if (o[k] !== undefined) out[k] = this.numero(o, k, cx);
        return out;
      };
      const trechos = this.opcional(f, "trechos", cf, (x, cx) =>
        numeros(this.objeto(x, cx), cx, CAMPOS_FORMA_TRECHO),
      );
      const apoios = this.opcional(f, "apoios", cf, (x, cx): FormaApoioViga => {
        const a = this.objeto(x, cx);
        return {
          ...numeros(a, cx, CAMPOS_FORMA_APOIO),
          ...(a.tipo === undefined ? {} : { tipo: this.opcao(a, "tipo", cx, TIPOS_APOIO_FORMA) }),
          ...(a.titulo === undefined ? {} : { titulo: this.texto(a, "titulo", cx) }),
        };
      });
      r.forma = {
        ...(trechos ? { trechos } : {}),
        ...(apoios ? { apoios } : {}),
        ...(f.lajesNoCorte === undefined
          ? {}
          : { lajesNoCorte: this.opcao(f, "lajesNoCorte", cf, LAJES_NO_CORTE) }),
      };
    }
    return r;
  }

  private cargaViga(d: Dados, c: string): CargaViga {
    const tipo = this.opcao(d, "tipo", c, TIPOS_CARGA_VIGA);
    const trecho = this.numero(d, "trecho", c, "naoNegativo");
    if (!Number.isInteger(trecho)) this.erro(`${c}.trecho`, "esperado um número inteiro", trecho);
    const total = this.numero(d, "total", c);
    const acidental =
      d.acidental === undefined ? {} : { acidental: this.numero(d, "acidental", c) };
    if (tipo === "concentrada")
      return {
        tipo,
        trecho,
        posicao: this.numero(d, "posicao", c, "naoNegativo"),
        total,
        ...acidental,
      };
    const inicio = this.numero(d, "inicio", c, "naoNegativo");
    const fim = this.numero(d, "fim", c, "naoNegativo");
    if (fim < inicio) this.erro(`${c}.fim`, `esperado um fim ≥ início (${inicio})`, fim);
    return { tipo, trecho, inicio, fim, total, ...acidental };
  }

  private parametrosViga(d: Dados): ParametrosVigaObra {
    const c = "obra.parametrosViga";
    const r: ParametrosVigaObra = {};
    if (d.viga !== undefined)
      r.viga = this.conformeTabela(this.objeto(d.viga, `${c}.viga`), PARAMETROS_VIGA, `${c}.viga`);
    if (d.dsp !== undefined)
      r.dsp = this.conformeTabela(this.objeto(d.dsp, `${c}.dsp`), PARAMETROS_DSP, `${c}.dsp`);
    return r;
  }

  /** Campos de uma tabela de parâmetros: só os conhecidos, cada um com a forma do valor de
   *  fábrica (número, booleano, texto, lista de itens como o primeiro da lista de fábrica). */
  private conformeTabela<T extends object>(d: Dados, padrao: T, c: string): Partial<T> {
    const r: Partial<T> = {};
    for (const chave of Object.keys(d)) {
      if (!(chave in padrao)) {
        this.erros.push(`${c}.${chave}: parâmetro desconhecido.`);
        continue;
      }
      const k = chave as keyof T;
      const x = d[chave];
      const opcoes = OPCOES_TEXTO[chave];
      if (opcoes && !opcoes.includes(String(x))) {
        this.erro(`${c}.${chave}`, `esperado um de ${opcoes.map(mostra).join(", ")}`, x);
        continue;
      }
      if (mesmaForma(x, padrao[k])) r[k] = x;
      else this.erro(`${c}.${chave}`, `esperado ${mostra(padrao[k])} ou algo com a mesma forma`, x);
    }
    return r;
  }
}

const TIPOS_CARGA_VIGA: readonly [CargaViga["tipo"], ...CargaViga["tipo"][]] = [
  "distribuida",
  "concentrada",
];
const TIPOS_APOIO_FORMA: readonly ["P", "V", "O", "A"] = ["P", "V", "O", "A"];
const LAJES_NO_CORTE: readonly ["nao", "mesa"] = ["nao", "mesa"];
const CAMPOS_FORMA_TRECHO = [
  "vaoLivre",
  "pe",
  "hle",
  "pd",
  "hld",
  "eixo",
  "alinhamento",
] as const satisfies readonly (keyof FormaTrechoViga)[];
const CAMPOS_FORMA_APOIO = [
  "largura",
  "codigo",
  "lps",
  "dis",
] as const satisfies readonly (keyof FormaApoioViga)[];
/** Textos com valores fixos nas tabelas de parâmetros. */
const OPCOES_TEXTO: Record<string, readonly string[]> = {
  classeAco: ["A", "B"],
  comparaEspacamentoMaximo: ["d/2", "H/2"],
  reacaoNoPilar: ["estatica", "maxima"],
};

/** `x` tem a forma de `padrao`: mesmo tipo primitivo; lista com itens da forma do primeiro
 *  item de fábrica; objeto com as mesmas chaves. */
function mesmaForma<T>(x: unknown, padrao: T): x is T {
  if (typeof padrao === "number") return typeof x === "number" && Number.isFinite(x);
  if (typeof padrao === "boolean" || typeof padrao === "string") return typeof x === typeof padrao;
  if (Array.isArray(padrao)) {
    if (!Array.isArray(x)) return false;
    const item: unknown = padrao[0];
    return item === undefined ? x.length === 0 : x.every((v) => mesmaForma(v, item));
  }
  if (ehObjeto(padrao))
    return ehObjeto(x) && Object.keys(padrao).every((k) => mesmaForma(x[k], padrao[k]));
  return false;
}

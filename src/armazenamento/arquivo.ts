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
    };
  }
}

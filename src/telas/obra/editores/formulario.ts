// Leitura dos formulários dos editores dos dados do SISTRUT: texto do campo → número do
// modelo, com a mensagem em pt-BR. As faixas são as que src/armazenamento/arquivo.ts
// exige ao ler a obra; `problemasNoArquivo` passa a obra editada pelo próprio leitor do
// arquivo, para que um editor nunca grave uma obra que não abriria de novo.
import { lerObra, serializarObra } from "../../../armazenamento/arquivo";
import type { Obra, Ponto } from "../../../dominio/obra";
import { lerNumero } from "../../formato";

/** Faixa aceita por um campo, como no leitor do arquivo. */
export type Limite = "qualquer" | "positivo" | "naoNegativo";

/** Lê os campos de um formulário e junta os problemas, na ordem em que aparecem. */
export class Leitor {
  erros: string[] = [];
  /** Aba do formulário que está sendo lida: com ela, a mensagem começa por "Aba → ". */
  secao: string | undefined;

  erro(mensagem: string) {
    this.erros.push(this.secao ? `${this.secao} → ${mensagem}` : mensagem);
  }

  /** Número obrigatório. Com problema, anota a mensagem e devolve 0 para seguir lendo. */
  numero(texto: string, rotulo: string, limite: Limite = "qualquer", inteiro = false): number {
    const n = lerNumero(texto);
    if (n === null) {
      this.erro(`${rotulo}: informe um número.`);
      return 0;
    }
    if (limite === "positivo" && n <= 0) this.erro(`${rotulo}: informe um número maior que zero.`);
    else if (limite === "naoNegativo" && n < 0)
      this.erro(`${rotulo}: informe um número maior ou igual a zero.`);
    else if (inteiro && !Number.isInteger(n)) this.erro(`${rotulo}: informe um número inteiro.`);
    return n;
  }

  /** Número opcional: campo vazio = ausente (vale o padrão). */
  opcional(
    texto: string,
    rotulo: string,
    limite: Limite = "qualquer",
    inteiro = false,
  ): number | undefined {
    return texto.trim() === "" ? undefined : this.numero(texto, rotulo, limite, inteiro);
  }
}

/** Número do modelo → texto do campo ("" para ausente), com vírgula decimal. Com 15
 *  algarismos significativos: some o ruído do float64 (1,7999999999999998 → 1,8) e o
 *  valor não muda nem no Float32 do modo original. */
export const textoDe = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : String(Number(n.toPrecision(15))).replace(".", ",");

/** O objeto sem as chaves de valor undefined: com exactOptionalPropertyTypes, campo
 *  opcional ausente não pode ser gravado como undefined. */
export const soDefinidos = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };

/** Lista vazia vira ausente (o campo opcional some do arquivo). */
export const listaOuNada = <T>(l: T[]) => (l.length > 0 ? l : undefined);

/** Problemas que o leitor do arquivo acharia na obra editada; vazio = ela abre. */
export function problemasNoArquivo(obra: Obra): string[] {
  const r = lerObra(serializarObra(obra));
  return r.ok ? [] : r.erros.map((e) => `O arquivo recusaria a obra (${e})`);
}

/** O objeto sem as chaves dadas: o editor tira os campos que ele controla e grava de novo
 *  só os definidos; os campos que ele não conhece passam intactos. */
export function semChaves<T extends object, K extends keyof T>(o: T, chaves: readonly K[]) {
  const r: Partial<T> = { ...o };
  for (const k of chaves) delete r[k];
  return r as Omit<T, K>;
}

/** Linha de uma tabela editável: o texto de cada coluna. */
export type LinhaForm<C extends string> = Record<C, string>;

/** "padrão" / "sim" / "não" de um booleano opcional (ausente = o padrão). */
export type TriEstado = "padrao" | "sim" | "nao";
export const triDe = (b: boolean | undefined): TriEstado =>
  b === undefined ? "padrao" : b ? "sim" : "nao";
export const boolDe = (t: TriEstado) => (t === "padrao" ? undefined : t === "sim");

/** Pontos de uma tabela x, y (m). `rotulo` nomeia a tabela nas mensagens. */
export function lerPontos(l: Leitor, linhas: readonly LinhaForm<"x" | "y">[], rotulo: string) {
  return linhas.map((p, i): Ponto => ({
    x: l.numero(p.x, `${rotulo}, ponto ${i + 1}, x`),
    y: l.numero(p.y, `${rotulo}, ponto ${i + 1}, y`),
  }));
}

/** Ponto → linha x, y do formulário. */
export const linhaDoPonto = (p: Ponto): LinhaForm<"x" | "y"> => ({
  x: textoDe(p.x),
  y: textoDe(p.y),
});

/** Duas vezes a área com sinal (Σ x_k·y_k+1 − x_k+1·y_k), a conta do leitor do arquivo:
 *  negativa = sentido horário, positiva = anti-horário, zero = sem área. */
export function areaDupla(p: readonly Ponto[]) {
  return p.reduce((a, v, k) => {
    const w = p[(k + 1) % p.length] ?? v;
    return a + v.x * w.y - w.x * v.y;
  }, 0);
}

/**
 * Confere um polígono como o leitor do arquivo: ao menos 3 vértices e área; o da laje
 * (`horario`) em sentido horário, como o LAJEGEOM grava. Anota o problema em `l`.
 */
export function conferirPoligono(l: Leitor, p: readonly Ponto[], rotulo: string, horario: boolean) {
  if (p.length < 3) return l.erro(`${rotulo}: informe pelo menos 3 vértices.`);
  const a = areaDupla(p);
  if (a === 0) l.erro(`${rotulo}: o polígono não tem área.`);
  else if (horario && a > 0)
    l.erro(`${rotulo}: os vértices estão em sentido anti-horário; o LAJEGEOM só aceita o horário.`);
}

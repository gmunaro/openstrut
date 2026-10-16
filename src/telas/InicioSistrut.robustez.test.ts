// Robustez da importação de obras do SISTRUT: arquivos truncados, com outro fim de
// linha, com ^Z (o fim de arquivo do DOS) e lixo depois, com linha vazia ou campo com
// lixo, e com o nome em minúsculas. A importação nunca lança; o que entra calcula nos
// dois modos e detalha sem exceção. Fim de linha e ^Z não mudam a obra: o INPUT # do
// QuickBASIC trata CR como fim de linha e para no ^Z.
import { describe, expect, it } from "vitest";
import { OBRA_E2E, PREDIO, semIds } from "./__fixtures__/predioSistrut";
import { calcular } from "./calculo";
import { detalharObra } from "./detalhamento";
import { importarObraSistrut, type ArquivoEntrada } from "./InicioSistrut";

const TEXTO = /\.(LAJ|COL|REP|RLP|PIP|PIL)$/i;
const bytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const texto = (a: ArquivoEntrada) => Buffer.from(a.dados).toString("latin1");

/** Troca a linha do meio do texto. */
const linhaDoMeio = (a: ArquivoEntrada, nova: string) => {
  const linhas = texto(a).split("\r\n");
  linhas[Math.floor(linhas.length / 2)] = nova;
  return bytes(linhas.join("\r\n"));
};

const MUTACOES: Record<string, (a: ArquivoEntrada) => ArquivoEntrada> = {
  vazio: (a) => ({ ...a, dados: new Uint8Array() }),
  "1 byte": (a) => ({ ...a, dados: a.dados.slice(0, 1) }),
  metade: (a) => ({ ...a, dados: a.dados.slice(0, Math.floor(a.dados.length / 2)) }),
  "90 %": (a) => ({ ...a, dados: a.dados.slice(0, Math.floor(a.dados.length * 0.9)) }),
  "^Z e lixo no fim": (a) => ({ ...a, dados: new Uint8Array([...a.dados, 0x1a, 0x41, 0x0d]) }),
  minúsculas: (a) => ({ ...a, nome: a.nome.toLowerCase() }),
  "LF só": (a) =>
    TEXTO.test(a.nome) ? { ...a, dados: bytes(texto(a).replaceAll("\r\n", "\n")) } : a,
  "CR só": (a) =>
    TEXTO.test(a.nome) ? { ...a, dados: bytes(texto(a).replaceAll("\r\n", "\r")) } : a,
  "linha vazia": (a) => (TEXTO.test(a.nome) ? { ...a, dados: linhaDoMeio(a, "") } : a),
  "campo com lixo": (a) => (TEXTO.test(a.nome) ? { ...a, dados: linhaDoMeio(a, " x?;, ") } : a),
};

/** Importa; se entrou, calcula e detalha nos dois modos. Devolve o que deu errado. */
function confere(arquivos: readonly ArquivoEntrada[]): string[] {
  const problemas: string[] = [];
  let r: ReturnType<typeof importarObraSistrut>;
  try {
    r = importarObraSistrut(arquivos);
  } catch (e) {
    return [`a importação lançou: ${String(e)}`];
  }
  if (!r.ok) {
    if (r.erros.length === 0 || r.erros.some((e) => typeof e !== "string" || e === ""))
      problemas.push("erro sem mensagem");
    return problemas;
  }
  for (const modoCalculo of ["original", "corrigido"] as const) {
    const obra = { ...r.obra, modoCalculo };
    try {
      const c = calcular(obra);
      if (c.tipo === "ok") detalharObra(c.resultado, obra);
    } catch (e) {
      problemas.push(`${modoCalculo}: ${String(e)}`);
    }
  }
  return problemas;
}

describe.each([
  ["prédio sintético", PREDIO],
  ["E2E", OBRA_E2E],
])("robustez da importação: %s", (_nome, obra) => {
  it("cada arquivo mutado: a importação não lança, e o que entra calcula e detalha", () => {
    const falhas: string[] = [];
    for (const [i, alvo] of obra.entries())
      for (const [nome, muta] of Object.entries(MUTACOES)) {
        const mutada = obra.map((a, k) => (k === i ? muta(a) : a));
        for (const p of confere(mutada)) falhas.push(`${alvo.nome} (${nome}): ${p}`);
      }
    expect(falhas).toEqual([]);
  }, 300_000);

  it("faltando cada arquivo: a importação não lança, e o que entra calcula", () => {
    const falhas = obra.flatMap((alvo) =>
      confere(obra.filter((a) => a !== alvo)).map((p) => `sem ${alvo.nome}: ${p}`),
    );
    expect(falhas).toEqual([]);
  }, 300_000);

  it("LF, CR ou ^Z no fim dos textos dão a mesma obra", () => {
    const direta = importarObraSistrut(obra);
    expect(direta.ok).toBe(true);
    for (const nome of ["LF só", "CR só", "^Z e lixo no fim"]) {
      const muta = MUTACOES[nome]!;
      const r = importarObraSistrut(obra.map((a) => (TEXTO.test(a.nome) ? muta(a) : a)));
      expect(r.ok, nome).toBe(true);
      if (r.ok && direta.ok) expect(semIds(r.obra), nome).toBe(semIds(direta.obra));
    }
  });
});

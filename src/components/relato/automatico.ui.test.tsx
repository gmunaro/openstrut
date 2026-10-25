import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anexoDosArquivos,
  anonimizar,
  LIMITE_DIA,
  ligarRelatoAutomatico,
  nomesDaObra,
  relatarProblemaImportacao,
  relatoAutomatico,
  type ProblemaImportacao,
} from "./automatico";
import { listarFila, removerDaFila } from "./fila";
import { deBase64 } from "./relay";

const bytes = (t: string) => new TextEncoder().encode(t);
const problema = (mensagem = "ALPHA1.COL: nível 3 sem pavimento."): ProblemaImportacao => ({
  etapa: "importação",
  mensagens: [mensagem, "Viga V1 sem apoios suficientes."],
  arquivos: [
    { nome: "ALPHA1.COL", caminho: "Clientes/ALPHA1/ALPHA1.COL", dados: bytes("P1,N ( 1 ) SUB") },
    { nome: "COB.LAJ", caminho: "Clientes/ALPHA1/COB.LAJ", dados: bytes("laje") },
  ],
});

describe("texto público sem o nome da obra", () => {
  it("o nome do .COL e as pastas viram OBRA", () => {
    const nomes = nomesDaObra(problema());
    expect(nomes).toEqual(expect.arrayContaining(["ALPHA1", "Clientes"]));
    expect(anonimizar("Erro em alpha1.col (pasta Clientes/ALPHA1)", nomes)).toBe(
      "Erro em OBRA.col (pasta OBRA/OBRA)",
    );
  });

  it("título, texto, diagnóstico e erros saem anonimizados; o anexo leva os arquivos", () => {
    const r = relatoAutomatico(problema(), "/");
    const publico = JSON.stringify({ ...r, obra: undefined });
    expect(publico).not.toMatch(/alpha1/i);
    expect(r.titulo).toBe("Importação do SISTRUT (importação): OBRA.COL: nível 3 sem pavimento.");
    expect(r.aconteceu).toContain("- Viga V1 sem apoios suficientes.");
    expect(r.esperado).toBe("Importar e calcular a obra sem erro.");
    expect(r.diagnostico).toContainEqual({ rotulo: "Etapa", valor: "importação" });
    expect(r.obra?.nome).toBe("arquivos-sistrut.json");
    const anexo = JSON.parse(r.obra!.json) as {
      arquivos: { nome: string; caminho: string; base64: string }[];
    };
    expect(anexo.arquivos.map((a) => a.nome)).toEqual(["ALPHA1.COL", "COB.LAJ"]);
    expect(new TextDecoder().decode(deBase64(anexo.arquivos[0]!.base64))).toBe("P1,N ( 1 ) SUB");
  });

  it("arquivos acima do limite do relay: o anexo leva só a lista", () => {
    const grande = { nome: "SUP.VIG", dados: new Uint8Array(1_600_000) };
    const a = anexoDosArquivos({ arquivos: [grande] });
    expect(a.completo).toBe(false);
    expect(JSON.parse(a.json)).toEqual({
      tipo: "arquivos-sistrut",
      versao: 1,
      lista: [{ nome: "SUP.VIG", bytes: 1_600_000 }],
    });
  });
});

describe("envio", () => {
  const fetchFalso = vi.fn<typeof fetch>();
  beforeEach(async () => {
    vi.stubEnv("VITE_RELATO_URL", "https://relay.test/relato");
    vi.stubEnv("VITE_TURNSTILE_SITEKEY", "");
    localStorage.clear();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    fetchFalso.mockReset();
    fetchFalso.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, numero: 12, url: "https://x/12" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchFalso);
    for (const item of await listarFila()) await removerDaFila(item.id);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("envia uma vez; o mesmo problema não sai de novo", async () => {
    expect(await relatarProblemaImportacao(problema(), "/")).toEqual({
      tipo: "enviado",
      numero: 12,
      url: "https://x/12",
    });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(await relatarProblemaImportacao(problema(), "/")).toEqual({
      tipo: "nao-enviado",
      motivo: "repetido",
    });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("opção desligada, build sem relay e limite do dia não enviam", async () => {
    ligarRelatoAutomatico(false);
    expect(await relatarProblemaImportacao(problema(), "/")).toMatchObject({ motivo: "desligado" });
    ligarRelatoAutomatico(true);
    vi.stubEnv("VITE_RELATO_URL", "");
    expect(await relatarProblemaImportacao(problema(), "/")).toMatchObject({ motivo: "sem-relay" });
    vi.stubEnv("VITE_RELATO_URL", "https://relay.test/relato");
    for (let i = 0; i < LIMITE_DIA; i++)
      await relatarProblemaImportacao(problema(`erro ${i}`), "/");
    expect(await relatarProblemaImportacao(problema("mais um"), "/")).toMatchObject({
      motivo: "limite",
    });
    expect(fetchFalso).toHaveBeenCalledTimes(LIMITE_DIA);
  });

  it("sem conexão vai para a fila", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await relatarProblemaImportacao(problema(), "/")).toEqual({ tipo: "fila" });
    expect(fetchFalso).not.toHaveBeenCalled();
    const fila = await listarFila();
    expect(fila).toHaveLength(1);
    expect(fila[0]!.relato.obra?.nome).toBe("arquivos-sistrut.json");
  });
});

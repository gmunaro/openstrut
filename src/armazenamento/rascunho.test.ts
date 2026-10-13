// Rascunho no IndexedDB com idb-keyval trocado por um Map em memória.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { obraNova } from "../dominio/criar";

const banco = vi.hoisted(() => new Map<string, unknown>());

vi.mock("idb-keyval", () => ({
  createStore: () => "loja",
  get: async (k: string) => banco.get(k),
  set: async (k: string, v: unknown) => {
    banco.set(k, structuredClone(v));
  },
  del: async (k: string) => {
    banco.delete(k);
  },
  entries: async () => [...banco.entries()],
}));

const { abrirRascunho, apagarRascunho, criarSalvadorRascunho, listarRascunhos, salvarRascunho } =
  await import("./rascunho");

beforeEach(() => banco.clear());

describe("rascunho", () => {
  it("salva e reabre a obra igual, validada pelo leitor do arquivo", async () => {
    const obra = obraNova("Casa A", "nb1-78");
    await salvarRascunho("r1", obra, 1000);
    const lida = await abrirRascunho("r1");
    expect(lida).toEqual({ ok: true, obra });
  });

  it("lista do mais recente para o mais antigo, só com o resumo", async () => {
    await salvarRascunho("velho", obraNova("Velha", "nb1-78"), 1000);
    await salvarRascunho("novo", obraNova("Nova", "nbr6118-2023"), 2000);
    banco.set("lixo", { qualquer: 1 });
    expect(await listarRascunhos()).toEqual([
      { id: "novo", nome: "Nova", norma: "nbr6118-2023", atualizadoEm: 2000 },
      { id: "velho", nome: "Velha", norma: "nb1-78", atualizadoEm: 1000 },
    ]);
  });

  it("salvar de novo com o mesmo id substitui o rascunho", async () => {
    await salvarRascunho("r1", obraNova("Antes", "nb1-78"), 1000);
    await salvarRascunho("r1", obraNova("Depois", "nb1-78"), 2000);
    const lista = await listarRascunhos();
    expect(lista.map((r) => r.nome)).toEqual(["Depois"]);
  });

  it("apagar remove; abrir o que não existe dá erro legível", async () => {
    await salvarRascunho("r1", obraNova("Casa", "nb1-78"));
    await apagarRascunho("r1");
    expect(await listarRascunhos()).toEqual([]);
    expect(await abrirRascunho("r1")).toEqual({ ok: false, erros: ["Rascunho não encontrado."] });
  });

  it("rascunho corrompido volta com os erros do leitor do arquivo", async () => {
    banco.set("r1", { id: "r1", nome: "X", norma: "nb1-78", atualizadoEm: 1, texto: "{" });
    const lida = await abrirRascunho("r1");
    expect(lida.ok).toBe(false);
  });
});

describe("salvador com debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("grava só a última obra depois do atraso", async () => {
    const salvar = vi.fn(async () => {});
    const s = criarSalvadorRascunho(500, undefined, salvar);
    const a = obraNova("A", "nb1-78");
    const b = obraNova("B", "nb1-78");
    s.agendar("r1", a);
    await vi.advanceTimersByTimeAsync(300);
    s.agendar("r1", b);
    await vi.advanceTimersByTimeAsync(300);
    expect(salvar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar).toHaveBeenCalledWith("r1", b);
  });

  it("descarregar salva já; cancelar descarta", async () => {
    const salvar = vi.fn(async () => {});
    const s = criarSalvadorRascunho(500, undefined, salvar);
    s.agendar("r1", obraNova("A", "nb1-78"));
    await s.descarregar();
    expect(salvar).toHaveBeenCalledTimes(1);
    s.agendar("r1", obraNova("B", "nb1-78"));
    s.cancelar();
    await vi.advanceTimersByTimeAsync(1000);
    expect(salvar).toHaveBeenCalledTimes(1);
    await s.descarregar();
    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it("trocar de rascunho grava na hora o pendente do anterior", async () => {
    const salvar = vi.fn(async () => {});
    const s = criarSalvadorRascunho(500, undefined, salvar);
    const a = obraNova("A", "nb1-78");
    const b = obraNova("B", "nb1-78");
    s.agendar("r1", a);
    s.agendar("r2", b);
    expect(salvar).toHaveBeenCalledWith("r1", a);
    await vi.advanceTimersByTimeAsync(600);
    expect(salvar).toHaveBeenLastCalledWith("r2", b);
    expect(salvar).toHaveBeenCalledTimes(2);
  });

  it("erro ao gravar vai para aoErrar", async () => {
    const aoErrar = vi.fn();
    const s = criarSalvadorRascunho(10, aoErrar, async () => {
      throw new Error("cota cheia");
    });
    s.agendar("r1", obraNova("A", "nb1-78"));
    await vi.advanceTimersByTimeAsync(20);
    expect(aoErrar).toHaveBeenCalledWith(new Error("cota cheia"));
  });
});

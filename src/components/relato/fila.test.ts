import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { enfileirar, enviarFila, listarFila, removerDaFila } from "./fila";
import type { RelatoEnviado, ResultadoRelay } from "./relay";

const relato = (titulo: string): RelatoEnviado => ({
  versao: 1,
  titulo,
  aconteceu: titulo,
  esperado: "",
  diagnostico: [{ rotulo: "Rota", valor: "/" }],
  erros: [],
  build: "abc123",
  turnstile: "token-velho",
});

beforeEach(async () => {
  for (const i of await listarFila()) await removerDaFila(i.id);
});

describe("fila offline", () => {
  test("guarda em ordem de chegada, sem o token do Turnstile", async () => {
    await enfileirar(relato("segundo"), new Date("2026-10-16T10:00:01Z"));
    await enfileirar(relato("primeiro"), new Date("2026-10-16T10:00:00Z"));
    const f = await listarFila();
    expect(f.map((i) => i.relato.titulo)).toEqual(["primeiro", "segundo"]);
    expect(f[0]?.relato.turnstile).toBeUndefined();
  });

  test("envia todos e esvazia a fila", async () => {
    await enfileirar(relato("a"), new Date("2026-10-16T10:00:00Z"));
    await enfileirar(relato("b"), new Date("2026-10-16T10:00:01Z"));
    const enviar = vi.fn(async (_r: RelatoEnviado): Promise<ResultadoRelay> => ({
      tipo: "enviado",
      numero: 7,
      url: "u",
    }));
    expect(await enviarFila(enviar)).toBe(2);
    expect(enviar.mock.calls.map(([r]) => r.titulo)).toEqual(["a", "b"]);
    expect(await listarFila()).toEqual([]);
  });

  test("para no erro de rede e guarda o resto para depois", async () => {
    await enfileirar(relato("a"), new Date("2026-10-16T10:00:00Z"));
    await enfileirar(relato("b"), new Date("2026-10-16T10:00:01Z"));
    const enviar = vi.fn(async (): Promise<ResultadoRelay> => ({ tipo: "rede" }));
    expect(await enviarFila(enviar)).toBe(0);
    expect(enviar).toHaveBeenCalledOnce();
    expect(await listarFila()).toHaveLength(2);
  });

  test("falha temporária (limite de taxa) também espera", async () => {
    await enfileirar(relato("a"));
    const enviar = async (): Promise<ResultadoRelay> => ({ tipo: "temporario", mensagem: "429" });
    expect(await enviarFila(enviar)).toBe(0);
    expect((await listarFila())[0]?.recusado).toBeUndefined();
  });

  test("recusado fica marcado, sai da tentativa automática e não trava os outros", async () => {
    await enfileirar(relato("ruim"), new Date("2026-10-16T10:00:00Z"));
    await enfileirar(relato("bom"), new Date("2026-10-16T10:00:01Z"));
    const enviar = vi.fn(async (r: RelatoEnviado): Promise<ResultadoRelay> =>
      r.titulo === "ruim"
        ? { tipo: "recusado", mensagem: "texto vazio" }
        : { tipo: "enviado", numero: 1, url: "u" },
    );
    expect(await enviarFila(enviar)).toBe(1);
    const f = await listarFila();
    expect(f).toHaveLength(1);
    expect(f[0]?.recusado).toBe("texto vazio");

    enviar.mockClear();
    expect(await enviarFila(enviar)).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
  });
});

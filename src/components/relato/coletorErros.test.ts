import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  LIMITE_ERROS,
  descrever,
  instalarColetorErros,
  limparErros,
  registrarErro,
  ultimosErros,
} from "./coletorErros";

beforeEach(limparErros);

describe("coletor de erros", () => {
  test("guarda só os últimos 20, do mais antigo ao mais novo", () => {
    for (let i = 0; i < 25; i++)
      registrarErro("erro", `e${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    const e = ultimosErros();
    expect(LIMITE_ERROS).toBe(20);
    expect(e).toHaveLength(20);
    expect(e[0]?.texto).toBe("e5");
    expect(e[19]?.texto).toBe("e24");
    expect(e[19]?.quando).toBe("2026-01-01T00:00:24.000Z");
  });

  test("descreve Error com a pilha, string como está e objeto em JSON", () => {
    const err = new TypeError("quebrou");
    expect(descrever(err)).toContain("quebrou");
    expect(descrever("texto")).toBe("texto");
    expect(descrever({ a: 1 })).toBe('{"a":1}');
    const ciclo: { eu?: unknown } = {};
    ciclo.eu = ciclo;
    expect(descrever(ciclo)).toBe("[object Object]");
  });

  test("corta erro gigante em 2000 caracteres", () => {
    registrarErro("console", "x".repeat(5000));
    expect(ultimosErros()[0]?.texto).toHaveLength(2000);
  });

  test("ouve error, unhandledrejection e console.error", () => {
    const alvo = new EventTarget();
    const original = vi.fn();
    const saida = { error: original } as unknown as Console;
    instalarColetorErros(alvo as unknown as Window, saida);

    const erro = new Event("error") as Event & { error?: unknown; message?: string };
    erro.error = new Error("falha no cálculo");
    alvo.dispatchEvent(erro);
    const rejeicao = new Event("unhandledrejection") as Event & { reason?: unknown };
    rejeicao.reason = "promessa recusada";
    alvo.dispatchEvent(rejeicao);
    saida.error("React:", new Error("render"));

    const e = ultimosErros();
    expect(e.map((x) => x.origem)).toEqual(["erro", "promessa", "console"]);
    expect(e[0]?.texto).toContain("falha no cálculo");
    expect(e[1]?.texto).toBe("promessa recusada");
    expect(e[2]?.texto).toContain("React: Error: render");
    // o console.error original continua sendo chamado
    expect(original).toHaveBeenCalledOnce();
  });
});

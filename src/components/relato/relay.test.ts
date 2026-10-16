import { describe, expect, test, vi } from "vitest";
import { caminhoRelato, deBase64, enviarAoRelay, paraBase64, type RelatoEnviado } from "./relay";

const relato: RelatoEnviado = {
  versao: 1,
  titulo: "t",
  aconteceu: "a",
  esperado: "",
  diagnostico: [],
  erros: [],
  build: "abc123",
};

const responder = (status: number, corpo: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;

describe("caminho", () => {
  test("sem VITE_RELATO_URL abre o GitHub; com ela usa o relay", () => {
    expect(caminhoRelato(undefined)).toEqual({ tipo: "github" });
    expect(caminhoRelato("  ")).toEqual({ tipo: "github" });
    expect(caminhoRelato("https://r.workers.dev/relato")).toEqual({
      tipo: "relay",
      url: "https://r.workers.dev/relato",
    });
  });
});

describe("envio ao relay", () => {
  test("POST em JSON e 201 vira enviado", async () => {
    const buscar = responder(201, { ok: true, numero: 42, url: "https://github.com/x/42" });
    const r = await enviarAoRelay("https://r/relato", relato, buscar);
    expect(r).toEqual({ tipo: "enviado", numero: 42, url: "https://github.com/x/42" });
    const [url, init] = vi.mocked(buscar).mock.calls[0] ?? [];
    expect(url).toBe("https://r/relato");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(relato);
  });

  test("falha de rede vira rede (vai para a fila)", async () => {
    const buscar = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await enviarAoRelay("u", relato, buscar)).toEqual({ tipo: "rede" });
  });

  test("429, 5xx e Turnstile vencido são temporários; 400 e 413 são recusa", async () => {
    const tipo = async (status: number, erro: string) =>
      (await enviarAoRelay("u", relato, responder(status, { ok: false, erro, mensagem: "m" })))
        .tipo;
    expect(await tipo(429, "limite")).toBe("temporario");
    expect(await tipo(502, "github")).toBe("temporario");
    expect(await tipo(403, "turnstile")).toBe("temporario");
    expect(await tipo(400, "invalido")).toBe("recusado");
    expect(await tipo(413, "grande")).toBe("recusado");
    expect(await tipo(403, "origem")).toBe("recusado");
  });

  test("usa a mensagem do relay e, sem corpo, o status", async () => {
    const r1 = await enviarAoRelay("u", relato, responder(400, { mensagem: "Texto vazio." }));
    expect(r1).toEqual({ tipo: "recusado", mensagem: "Texto vazio." });
    const semCorpo = vi.fn(
      async () => new Response("x", { status: 500 }),
    ) as unknown as typeof fetch;
    expect(await enviarAoRelay("u", relato, semCorpo)).toEqual({
      tipo: "temporario",
      mensagem: "O servidor de relatos respondeu 500.",
    });
  });
});

describe("base64", () => {
  test("ida e volta, inclusive maior que um pedaço", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    expect(deBase64(paraBase64(bytes))).toEqual(bytes);
    expect(paraBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("iVBORw==");
  });
});

// Leitura do Google Drive (api.ts) contra a Drive API falsa (__fixtures__/driveFalso.ts):
// link, listagem paginada com subpastas, documentos do Google e atalhos, download,
// resource key, e a tradução dos erros (pasta privada, sem permissão, quota, rede).
import { describe, expect, it } from "vitest";
import { fetchFalso, type NoDrive } from "./__fixtures__/driveFalso";
import {
  alvoDoLink,
  baixarArquivo,
  ErroDrive,
  lerAlvo,
  lerItens,
  limitador,
  pedeLogin,
  type AcessoDrive,
} from "./api";

const bytes = (t: string) => new TextEncoder().encode(t);
const SEM_LOGIN: AcessoDrive = { apiKey: "chave" };

/** OBRA com 5 arquivos, um documento do Google, dois atalhos e a subpasta EXEC40. */
const OBRA: NoDrive = {
  id: "pasta-obra-0001",
  name: "OBRA",
  filhos: [
    { id: "a-laj", name: "TETO.LAJ", dados: bytes("laj") },
    { id: "a-vig", name: "TETO.VIG", dados: bytes("vig") },
    { id: "a-dxf", name: "R1__TETO.DXF", dados: bytes("dxf") },
    { id: "a-bak", name: "TETO.BAK", dados: bytes("bak") },
    { id: "a-col", name: "PREDIO.COL", dados: bytes("col") },
    { id: "doc", name: "Memorial", mimeType: "application/vnd.google-apps.document" },
    {
      id: "atalho-rep",
      name: "TETO.REP",
      mimeType: "application/vnd.google-apps.shortcut",
      shortcutDetails: { targetId: "a-rep-real", targetMimeType: "application/octet-stream" },
    },
    {
      id: "atalho-pasta",
      name: "Outra obra",
      mimeType: "application/vnd.google-apps.shortcut",
      shortcutDetails: { targetId: "x", targetMimeType: "application/vnd.google-apps.folder" },
    },
    {
      id: "pasta-exec",
      name: "EXEC40",
      filhos: [{ id: "a-dsp", name: "SISTRUT.DSP", dados: bytes("dsp") }],
    },
  ],
};
const REP_REAL: NoDrive = { id: "a-rep-real", name: "TETO.REP", dados: bytes("rep") };
const RAIZ: NoDrive = { id: "raiz", name: "raiz", filhos: [OBRA, REP_REAL] };

describe("alvoDoLink", () => {
  it.each([
    ["https://drive.google.com/drive/folders/1AbC-def_GHIjkl", { id: "1AbC-def_GHIjkl" }],
    [
      "https://drive.google.com/drive/u/1/folders/1AbC-def_GHIjkl?usp=sharing",
      { id: "1AbC-def_GHIjkl" },
    ],
    [
      "https://drive.google.com/drive/folders/1AbC-def_GHIjkl?resourcekey=0-xYz",
      { id: "1AbC-def_GHIjkl", resourceKey: "0-xYz" },
    ],
    [
      "https://drive.google.com/file/d/1AbC-def_GHIjkl/view?usp=drive_link",
      { id: "1AbC-def_GHIjkl" },
    ],
    ["https://drive.google.com/open?id=1AbC-def_GHIjkl", { id: "1AbC-def_GHIjkl" }],
    ["https://drive.google.com/uc?id=1AbC-def_GHIjkl&export=download", { id: "1AbC-def_GHIjkl" }],
    ["  1AbC-def_GHIjkl  ", { id: "1AbC-def_GHIjkl" }],
  ])("%s", (link, alvo) => expect(alvoDoLink(link)).toEqual(alvo));

  it.each([
    "",
    "obra do joão",
    "https://example.com/drive/folders/1AbC-def_GHIjkl",
    "https://drive.google.com/drive/my-drive",
    "https://drive.google.com/drive/folders/",
  ])("recusa %j", (link) => expect(alvoDoLink(link)).toBeUndefined());
});

describe("lerAlvo: pasta", () => {
  it("lista paginando, entra nas subpastas e guarda o caminho; nada é baixado", async () => {
    const { fetch, chamadas } = fetchFalso(RAIZ, { porPagina: 2 });
    const r = await lerAlvo({ id: "pasta-obra-0001" }, SEM_LOGIN, fetch);

    expect(r.arquivos.map((a) => a.caminho)).toEqual([
      "OBRA/TETO.LAJ",
      "OBRA/TETO.VIG",
      "OBRA/R1__TETO.DXF",
      "OBRA/TETO.BAK",
      "OBRA/PREDIO.COL",
      "OBRA/TETO.REP",
      "OBRA/EXEC40/SISTRUT.DSP",
    ]);
    // o atalho para arquivo baixa o destino
    expect(r.arquivos.find((a) => a.nome === "TETO.REP")?.id).toBe("a-rep-real");
    expect(r.notas).toEqual([
      "OBRA/Memorial: documento do Google (Docs, Planilhas...), não é arquivo do SISTRUT; ignorado.",
      "OBRA/TETO.REP: atalho; entrou o arquivo de destino.",
      "OBRA/Outra obra: atalho para uma pasta; não foi seguido. Ponha os arquivos na pasta da obra.",
    ]);
    // 1 de metadados + 5 páginas da OBRA (9 itens, 2 por página) + 1 da EXEC40
    expect(chamadas).toHaveLength(7);
    const listas = chamadas.filter((c) => c.url.searchParams.has("q"));
    expect(listas.map((c) => c.url.searchParams.get("pageToken"))).toEqual([
      null,
      "2",
      "4",
      "6",
      "8",
      null,
    ]);
    expect(listas[0]!.url.searchParams.get("q")).toBe(
      "'pasta-obra-0001' in parents and trashed=false",
    );
    expect(chamadas.some((c) => c.url.searchParams.get("alt") === "media")).toBe(false);
    // sem login: só a API key, sem Authorization
    for (const c of chamadas) {
      expect(c.url.searchParams.get("key")).toBe("chave");
      expect(c.cabecalhos.Authorization).toBeUndefined();
    }
  });

  it("a resource key do link vai no cabeçalho", async () => {
    const { fetch, chamadas } = fetchFalso(RAIZ);
    await lerAlvo({ id: "pasta-exec", resourceKey: "0-abc" }, SEM_LOGIN, fetch);
    expect(chamadas.map((c) => c.cabecalhos["X-Goog-Drive-Resource-Keys"])).toEqual([
      "pasta-exec/0-abc",
      "pasta-exec/0-abc",
    ]);
  });

  it("link de um arquivo: só ele, sem pasta no caminho", async () => {
    const { fetch } = fetchFalso(RAIZ);
    const r = await lerAlvo({ id: "a-laj" }, SEM_LOGIN, fetch);
    expect(r).toEqual({
      arquivos: [{ id: "a-laj", nome: "TETO.LAJ", caminho: "TETO.LAJ", resourceKey: undefined }],
      notas: [],
    });
  });

  it("link de um documento do Google: diz que não é arquivo do SISTRUT", async () => {
    const { fetch } = fetchFalso(RAIZ);
    const e = await lerAlvo({ id: "doc" }, SEM_LOGIN, fetch).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroDrive);
    expect((e as ErroDrive).tipo).toBe("link");
    expect((e as ErroDrive).message).toMatch(/"Memorial" é um documento do Google/);
  });
});

describe("lerItens (escolhidos no Picker)", () => {
  it("pasta e arquivo soltos, com o token", async () => {
    const { fetch, chamadas } = fetchFalso(RAIZ, { token: "tk" });
    const r = await lerItens(
      [
        { id: "pasta-exec", name: "EXEC40", mimeType: "application/vnd.google-apps.folder" },
        { id: "a-col", name: "PREDIO.COL", mimeType: "application/octet-stream" },
      ],
      { apiKey: "chave", token: "tk" },
      fetch,
    );
    expect(r.arquivos.map((a) => a.caminho)).toEqual(["EXEC40/SISTRUT.DSP", "PREDIO.COL"]);
    expect(chamadas.every((c) => c.cabecalhos.Authorization === "Bearer tk")).toBe(true);
  });
});

describe("baixarArquivo", () => {
  it("baixa o conteúdo com alt=media", async () => {
    const { fetch, chamadas } = fetchFalso(RAIZ);
    const dados = await baixarArquivo(
      { id: "a-laj", nome: "TETO.LAJ", caminho: "OBRA/TETO.LAJ", resourceKey: "0-k" },
      SEM_LOGIN,
      fetch,
    );
    expect(new TextDecoder().decode(dados)).toBe("laj");
    expect(chamadas[0]!.url.searchParams.get("alt")).toBe("media");
    expect(chamadas[0]!.cabecalhos["X-Goog-Drive-Resource-Keys"]).toBe("a-laj/0-k");
  });

  it("a interrupção passa adiante como está (não vira erro de rede)", async () => {
    const controle = new AbortController();
    controle.abort();
    const f = ((_: unknown, init?: RequestInit) =>
      Promise.reject(init?.signal?.reason)) as typeof fetch;
    const e = await baixarArquivo(
      { id: "a-laj", nome: "TETO.LAJ", caminho: "TETO.LAJ" },
      SEM_LOGIN,
      f,
      controle.signal,
    ).catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(ErroDrive);
    expect((e as Error).name).toBe("AbortError");
  });
});

describe("erros", () => {
  const tipoDoErro = async (p: Promise<unknown>) => {
    const e = await p.catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroDrive);
    return e as ErroDrive;
  };
  /** fetch que responde sempre `status` com os motivos dados. */
  const respondendo = (status: number, ...motivos: string[]) =>
    (async () =>
      new Response(JSON.stringify({ error: { errors: motivos.map((reason) => ({ reason })) } }), {
        status,
      })) as typeof fetch;

  it("pasta privada sem login: pede login", async () => {
    const { fetch } = fetchFalso(RAIZ, { publico: false });
    const e = await tipoDoErro(lerAlvo({ id: "pasta-obra-0001" }, SEM_LOGIN, fetch));
    expect(e.tipo).toBe("privada");
    expect(e.message).toMatch(
      /^Sem login, o Google Drive não abre isto: não está compartilhado como "qualquer pessoa com o link"/,
    );
    expect(pedeLogin(e)).toBe(true);
  });

  it("link que não existe, sem login: o mesmo aviso (o Drive não distingue)", async () => {
    const { fetch } = fetchFalso(RAIZ);
    const e = await tipoDoErro(lerAlvo({ id: "nao-existe-123" }, SEM_LOGIN, fetch));
    expect(e.tipo).toBe("privada");
  });

  it("com login: 404 não achou, 403 sem permissão; nenhum pede login de novo", async () => {
    const { fetch } = fetchFalso(RAIZ, { token: "tk", proibidos: ["pasta-exec"] });
    const acesso = { apiKey: "chave", token: "tk" };
    const n = await tipoDoErro(lerAlvo({ id: "nao-existe-123" }, acesso, fetch));
    expect([n.tipo, pedeLogin(n)]).toEqual(["nao-encontrada", false]);
    const p = await tipoDoErro(lerAlvo({ id: "pasta-exec" }, acesso, fetch));
    expect([p.tipo, pedeLogin(p)]).toEqual(["sem-permissao", false]);
    expect(p.message).toMatch(/não tem permissão/);
  });

  it("login vencido (401): pede para entrar de novo", async () => {
    const { fetch } = fetchFalso(RAIZ, { token: "novo" });
    const e = await tipoDoErro(
      lerAlvo({ id: "a-laj" }, { apiKey: "chave", token: "velho" }, fetch),
    );
    expect(e.tipo).toBe("login");
    expect(pedeLogin(e)).toBe(true);
  });

  it.each([
    [429, []],
    [403, ["userRateLimitExceeded"]],
    [403, ["rateLimitExceeded"]],
    [403, ["dailyLimitExceeded"]],
  ])("quota: %i %j", async (status, motivos) => {
    const e = await tipoDoErro(
      lerAlvo({ id: "a-laj" }, SEM_LOGIN, respondendo(status, ...motivos)),
    );
    expect(e.tipo).toBe("quota");
    expect(e.message).toMatch(/Espere alguns minutos/);
  });

  it.each([
    [400, "keyInvalid"],
    [403, "accessNotConfigured"],
    [403, "ipRefererBlocked"],
  ])("configuração do site: %i %s", async (status, motivo) => {
    const e = await tipoDoErro(lerAlvo({ id: "a-laj" }, SEM_LOGIN, respondendo(status, motivo)));
    expect(e.tipo).toBe("configuracao");
    expect(e.message).toContain(motivo);
  });

  it("sem rede: mensagem de conexão", async () => {
    const semRede = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;
    const e = await tipoDoErro(lerAlvo({ id: "a-laj" }, SEM_LOGIN, semRede));
    expect(e.tipo).toBe("rede");
    expect(e.message).toBe("Sem conexão com o Google Drive. Confira a internet e tente de novo.");
  });

  it("erro do servidor: diz o código", async () => {
    const e = await tipoDoErro(lerAlvo({ id: "a-laj" }, SEM_LOGIN, respondendo(503)));
    expect(e.message).toMatch(/erro 503/);
  });
});

describe("limitador", () => {
  it("nunca passa do máximo e roda todas", async () => {
    const limite = limitador(2);
    let ativas = 0;
    let pico = 0;
    const tarefa = (i: number) =>
      limite(async () => {
        pico = Math.max(pico, ++ativas);
        await new Promise((ok) => setTimeout(ok, 1 + (i % 3)));
        ativas--;
        return i;
      });
    const r = await Promise.all(Array.from({ length: 9 }, (_, i) => tarefa(i)));
    expect(r).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pico).toBe(2);
  });
});

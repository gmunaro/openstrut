// Leitura do Google Drive (api.ts) contra a Drive API falsa (__fixtures__/driveFalso.ts):
// link (pasta, arquivo, id puro), listagem paginada com subpastas e limites, documentos do
// Google e atalhos, nomes com barra e repetidos, download, resource key, interrupção, o
// escopo drive.file (só o que foi marcado), e a tradução dos erros.
import { describe, expect, it } from "vitest";
import { fetchFalso, type NoDrive } from "./__fixtures__/driveFalso";
import {
  alvoDoLink,
  baixarArquivo,
  ErroDrive,
  lerAlvo,
  lerItens,
  limitador,
  nomesRepetidos,
  pedeLogin,
  type AcessoDrive,
  type AlvoDrive,
} from "./api";

const bytes = (t: string) => new TextEncoder().encode(t);
const SEM_LOGIN: AcessoDrive = { apiKey: "chave" };
const pasta = (id: string): AlvoDrive => ({ id, tipo: "pasta" });

/** OBRA com 5 arquivos, um documento do Google, três atalhos e a subpasta EXEC40. */
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
    { id: "atalho-mudo", name: "Sem destino", mimeType: "application/vnd.google-apps.shortcut" },
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
  const ID = "1AbC-def_GHIjkl";
  it.each([
    [`https://drive.google.com/drive/folders/${ID}`, { id: ID, tipo: "pasta" }],
    [`https://drive.google.com/drive/u/1/folders/${ID}?usp=sharing`, { id: ID, tipo: "pasta" }],
    [
      `https://drive.google.com/drive/folders/${ID}?resourcekey=0-xYz`,
      { id: ID, tipo: "pasta", resourceKey: "0-xYz" },
    ],
    [`https://drive.google.com/file/d/${ID}/view?usp=drive_link`, { id: ID, tipo: "arquivo" }],
    [`https://drive.google.com/open?id=${ID}`, { id: ID, tipo: "arquivo" }],
    [`https://drive.google.com/uc?id=${ID}&export=download`, { id: ID, tipo: "arquivo" }],
    // colado sem o https:// (o campo é texto, não url)
    [`drive.google.com/drive/folders/${ID}`, { id: ID, tipo: "pasta" }],
    [`  ${ID}  `, { id: ID, tipo: "id" }],
  ])("%s", (link, alvo) => expect(alvoDoLink(link)).toEqual(alvo));

  it.each([
    "",
    "obra do joão",
    `https://example.com/drive/folders/${ID}`,
    "https://drive.google.com/drive/my-drive",
    "https://drive.google.com/drive/folders/",
  ])("recusa %j", (link) => expect(alvoDoLink(link)).toBeUndefined());
});

describe("lerAlvo: pasta", () => {
  it("lista paginando, entra nas subpastas e guarda o caminho; nada é baixado", async () => {
    const { fetch, chamadas } = fetchFalso(RAIZ, { porPagina: 2 });
    const r = await lerAlvo(pasta("pasta-obra-0001"), SEM_LOGIN, { f: fetch });

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
      "OBRA/Sem destino: atalho cujo destino o Drive não informou; não foi seguido. Ponha os arquivos na pasta da obra.",
    ]);
    // 1 de metadados + 5 páginas da OBRA (10 itens, 2 por página) + 1 da EXEC40
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
    await lerAlvo({ ...pasta("pasta-exec"), resourceKey: "0-abc" }, SEM_LOGIN, { f: fetch });
    expect(chamadas.map((c) => c.cabecalhos["X-Goog-Drive-Resource-Keys"])).toEqual([
      "pasta-exec/0-abc",
      "pasta-exec/0-abc",
    ]);
  });

  it("link de um arquivo: só ele, sem pasta no caminho", async () => {
    const { fetch } = fetchFalso(RAIZ);
    const r = await lerAlvo({ id: "a-laj", tipo: "arquivo" }, SEM_LOGIN, { f: fetch });
    expect(r.arquivos.map(({ id, nome, caminho }) => ({ id, nome, caminho }))).toEqual([
      { id: "a-laj", nome: "TETO.LAJ", caminho: "TETO.LAJ" },
    ]);
    expect(r.notas).toEqual([]);
  });

  it("link de um documento do Google: diz que não é arquivo do SISTRUT", async () => {
    const { fetch } = fetchFalso(RAIZ);
    const e = await lerAlvo({ id: "doc", tipo: "arquivo" }, SEM_LOGIN, { f: fetch }).catch(
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(ErroDrive);
    expect((e as ErroDrive).tipo).toBe("link");
    expect((e as ErroDrive).message).toMatch(/"Memorial" é um documento do Google/);
  });

  it("barra no nome do Drive vira _ e não cria pasta", async () => {
    const raiz: NoDrive = {
      id: "p-barra",
      name: "OBRA 1/2",
      filhos: [{ id: "a", name: "TETO/V2.LAJ", dados: bytes("x") }],
    };
    const r = await lerAlvo(pasta("p-barra"), SEM_LOGIN, { f: fetchFalso(raiz).fetch });
    expect(r.arquivos.map((a) => [a.nome, a.caminho])).toEqual([
      ["TETO_V2.LAJ", "OBRA 1_2/TETO_V2.LAJ"],
    ]);
    expect(r.notas).toEqual([
      'OBRA 1_2: o nome no Drive é "OBRA 1/2"; a barra virou "_".',
      'OBRA 1_2/TETO_V2.LAJ: o nome no Drive é "TETO/V2.LAJ"; a barra virou "_".',
    ]);
  });
});

describe("limites da listagem", () => {
  /** Pastas aninhadas N0/N1/.../Nn, com um arquivo em cada. */
  const aninhadas = (n: number): NoDrive => {
    let no: NoDrive = {
      id: `n${n}`,
      name: `N${n}`,
      filhos: [{ id: `f${n}`, name: `A${n}.LAJ`, dados: bytes("x") }],
    };
    for (let i = n - 1; i >= 0; i--)
      no = {
        id: `n${i}`,
        name: `N${i}`,
        filhos: [{ id: `f${i}`, name: `A${i}.LAJ`, dados: bytes("x") }, no],
      };
    return no;
  };

  it("subpasta funda demais fica de fora, com nota", async () => {
    const r = await lerAlvo(pasta("n0"), SEM_LOGIN, {
      f: fetchFalso(aninhadas(5)).fetch,
      limites: { profundidade: 3, arquivos: 100 },
    });
    expect(r.arquivos.map((a) => a.nome)).toEqual(["A0.LAJ", "A1.LAJ", "A2.LAJ"]);
    expect(r.notas).toEqual([
      "N0/N1/N2/N3: subpasta a mais de 3 níveis da pasta escolhida; não foi lida.",
    ]);
  });

  it("arquivos demais: para com um erro que explica", async () => {
    const e = await lerAlvo(pasta("n0"), SEM_LOGIN, {
      f: fetchFalso(aninhadas(5)).fetch,
      limites: { profundidade: 10, arquivos: 4 },
    }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroDrive);
    expect((e as ErroDrive).tipo).toBe("grande");
    expect((e as ErroDrive).message).toMatch(/^A pasta tem mais de 4 arquivos/);
  });
});

describe("interrupção", () => {
  it("abortar no meio da listagem para as chamadas e passa o AbortError adiante", async () => {
    const controle = new AbortController();
    const falso = fetchFalso(RAIZ, { porPagina: 1 });
    const f = ((url: URL, init?: RequestInit) => {
      const resposta = falso.fetch(url, init);
      // aborta depois da 3ª chamada: a 4ª não chega a sair
      if (falso.chamadas.length === 3) controle.abort();
      return resposta;
    }) as typeof fetch;
    const e = await lerAlvo(pasta("pasta-obra-0001"), SEM_LOGIN, {
      f,
      signal: controle.signal,
    }).catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(ErroDrive);
    expect((e as Error).name).toBe("AbortError");
    expect(falso.chamadas).toHaveLength(3);
  });

  it("download interrompido não vira erro de rede", async () => {
    const controle = new AbortController();
    controle.abort();
    const f = ((_: unknown, init?: RequestInit) =>
      Promise.reject(init?.signal?.reason)) as typeof fetch;
    const e = await baixarArquivo(
      { id: "a-laj", nome: "TETO.LAJ", caminho: "TETO.LAJ" },
      SEM_LOGIN,
      {
        f,
        signal: controle.signal,
      },
    ).catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(ErroDrive);
    expect((e as Error).name).toBe("AbortError");
  });
});

describe("escopo drive.file: com token, só o que foi marcado", () => {
  it("arquivos marcados no Picker entram e baixam; a pasta marcada não traz os filhos", async () => {
    const { fetch } = fetchFalso(RAIZ, { token: "tk", concedidos: ["pasta-exec", "a-col"] });
    const acesso = { apiKey: "chave", token: "tk" };
    const r = await lerItens(
      [
        { id: "pasta-exec", name: "EXEC40", mimeType: "application/vnd.google-apps.folder" },
        { id: "a-col", name: "PREDIO.COL", mimeType: "application/octet-stream", pasta: "Pasta 2" },
      ],
      acesso,
      { f: fetch },
    );
    // a pasta concedida lista vazia: o filho não foi marcado
    expect(r.arquivos.map((a) => a.caminho)).toEqual(["Pasta 2/PREDIO.COL"]);
    const dados = await baixarArquivo(r.arquivos[0]!, acesso, { f: fetch });
    expect(new TextDecoder().decode(dados)).toBe("col");
    // um arquivo não marcado não existe para o app
    const e = await baixarArquivo({ id: "a-laj", nome: "TETO.LAJ", caminho: "TETO.LAJ" }, acesso, {
      f: fetch,
    }).catch((x: unknown) => x);
    expect((e as ErroDrive).tipo).toBe("nao-encontrada");
  });
});

describe("nomesRepetidos", () => {
  const a = (id: string, caminho: string, modificado?: string) => ({
    id,
    nome: caminho.replace(/^.*\//, ""),
    caminho,
    modificado,
  });

  it("dois arquivos de mesmo nome na mesma pasta: diz a data e o id de cada um", () => {
    const m = nomesRepetidos(
      [
        a("id-1", "OBRA/TETO.LAJ", "2024-03-12T14:05:00Z"),
        a("id-2", "OBRA/teto.laj", "2024-03-15T09:00:00Z"),
        a("id-3", "OBRA/EXEC40/TETO.LAJ"),
        a("id-4", "OBRA/x.pdf"),
        a("id-5", "OBRA/X.PDF"),
      ],
      (nome) => !/\.pdf$/i.test(nome),
    );
    expect(m).toMatch(
      /^Na pasta "OBRA" do Drive há 2 arquivos chamados TETO\.LAJ \(modificado em .+, id id-1; modificado em .+, id id-2\)\. O Drive aceita nomes repetidos na mesma pasta, o SISTRUT não: apague ou renomeie os que sobram e tente de novo\.$/,
    );
    expect(m).not.toContain("id-3");
    expect(m).not.toContain("PDF");
  });

  it("sem repetidos: undefined", () => {
    expect(nomesRepetidos([a("1", "A.LAJ"), a("2", "B/A.LAJ")], () => true)).toBeUndefined();
  });
});

describe("baixarArquivo", () => {
  it("baixa o conteúdo com alt=media e a resource key", async () => {
    const { fetch, chamadas } = fetchFalso(RAIZ);
    const dados = await baixarArquivo(
      { id: "a-laj", nome: "TETO.LAJ", caminho: "OBRA/TETO.LAJ", resourceKey: "0-k" },
      SEM_LOGIN,
      { f: fetch },
    );
    expect(new TextDecoder().decode(dados)).toBe("laj");
    expect(chamadas[0]!.url.searchParams.get("alt")).toBe("media");
    expect(chamadas[0]!.cabecalhos["X-Goog-Drive-Resource-Keys"]).toBe("a-laj/0-k");
  });
});

describe("erros", () => {
  const erroDe = async (p: Promise<unknown>) => {
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
  const LAJ = { id: "a-laj", tipo: "arquivo" } as const;

  it("pasta privada sem login: pede login", async () => {
    const { fetch } = fetchFalso(RAIZ, { publico: false });
    const e = await erroDe(lerAlvo(pasta("pasta-obra-0001"), SEM_LOGIN, { f: fetch }));
    expect(e.tipo).toBe("privada");
    expect(e.message).toMatch(
      /^Sem login, o Google Drive não abre isto: não está compartilhado como "qualquer pessoa com o link"/,
    );
    expect(pedeLogin(e)).toBe(true);
  });

  it("link que não existe, sem login: o mesmo aviso (o Drive não distingue)", async () => {
    const { fetch } = fetchFalso(RAIZ);
    const e = await erroDe(lerAlvo(pasta("nao-existe-123"), SEM_LOGIN, { f: fetch }));
    expect(e.tipo).toBe("privada");
  });

  it("com login: 404 não achou, 403 sem permissão; nenhum pede login de novo", async () => {
    const { fetch } = fetchFalso(RAIZ, { token: "tk", proibidos: ["pasta-exec"] });
    const acesso = { apiKey: "chave", token: "tk" };
    const n = await erroDe(lerAlvo(pasta("nao-existe-123"), acesso, { f: fetch }));
    expect([n.tipo, pedeLogin(n)]).toEqual(["nao-encontrada", false]);
    const p = await erroDe(lerAlvo(pasta("pasta-exec"), acesso, { f: fetch }));
    expect([p.tipo, pedeLogin(p)]).toEqual(["sem-permissao", false]);
    expect(p.message).toMatch(/não tem permissão/);
  });

  it("login vencido (401): pede para entrar de novo", async () => {
    const { fetch } = fetchFalso(RAIZ, { token: "novo" });
    const e = await erroDe(lerAlvo(LAJ, { apiKey: "chave", token: "velho" }, { f: fetch }));
    expect(e.tipo).toBe("login");
    expect(pedeLogin(e)).toBe(true);
  });

  it("appNotAuthorizedToFile: quem não tem acesso é o app, e entrar resolve", async () => {
    const e = await erroDe(
      lerAlvo(
        LAJ,
        { apiKey: "chave", token: "tk" },
        { f: respondendo(403, "appNotAuthorizedToFile") },
      ),
    );
    expect(e.tipo).toBe("app-sem-acesso");
    expect(e.message).toMatch(/^Quem não tem acesso é o app, não você/);
    expect(pedeLogin(e)).toBe(true);
  });

  it("downloadQuotaExceeded tem mensagem própria (não é a quota de leituras)", async () => {
    const e = await erroDe(
      baixarArquivo({ id: "a", nome: "A.LAJ", caminho: "A.LAJ" }, SEM_LOGIN, {
        f: respondendo(403, "downloadQuotaExceeded"),
      }),
    );
    expect(e.tipo).toBe("download-bloqueado");
    expect(e.message).toMatch(/baixado muitas vezes/);
  });

  it.each([
    [429, []],
    [403, ["userRateLimitExceeded"]],
    [403, ["rateLimitExceeded"]],
    [403, ["dailyLimitExceeded"]],
  ])("quota: %i %j", async (status, motivos) => {
    const e = await erroDe(lerAlvo(LAJ, SEM_LOGIN, { f: respondendo(status, ...motivos) }));
    expect(e.tipo).toBe("quota");
    expect(e.message).toMatch(/Espere alguns minutos/);
  });

  it.each([
    [400, "keyInvalid"],
    [403, "accessNotConfigured"],
    [403, "ipRefererBlocked"],
  ])("configuração do site: %i %s", async (status, motivo) => {
    const e = await erroDe(lerAlvo(LAJ, SEM_LOGIN, { f: respondendo(status, motivo) }));
    expect(e.tipo).toBe("configuracao");
    expect(e.message).toContain(motivo);
  });

  it("sem rede: mensagem de conexão", async () => {
    const semRede = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;
    const e = await erroDe(lerAlvo(LAJ, SEM_LOGIN, { f: semRede }));
    expect(e.tipo).toBe("rede");
    expect(e.message).toBe("Sem conexão com o Google Drive. Confira a internet e tente de novo.");
  });

  it("erro do servidor: diz o código", async () => {
    const e = await erroDe(lerAlvo(LAJ, SEM_LOGIN, { f: respondendo(503) }));
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

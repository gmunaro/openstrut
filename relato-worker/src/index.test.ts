import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  campo,
  envTeste,
  githubFalso,
  IP,
  limitador,
  ORIGEM,
  PNG_BASE64,
  relatoBase,
  requisicao,
  semRede,
} from "./apoioTeste";
import worker, { LIMITE_CORPO } from "./index";
import { diaUtc, hashIp } from "./limites";
import type { Env } from "./tipos";

beforeEach(semRede);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function enviar(request: Request, env: Env) {
  const resposta = await worker.fetch(request, env);
  const texto = await resposta.text();
  const corpo: unknown = texto ? JSON.parse(texto) : null;
  return { resposta, corpo, texto };
}

describe("rota, método e origem", () => {
  it("responde o preflight CORS com 204", async () => {
    const { env } = envTeste();
    const { resposta } = await enviar(requisicao(undefined, { metodo: "OPTIONS" }), env);
    expect(resposta.status).toBe(204);
    expect(resposta.headers.get("Access-Control-Allow-Origin")).toBe(ORIGEM);
    expect(resposta.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(resposta.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  it("recusa origem fora da lista e requisição sem Origin", async () => {
    const { env } = envTeste();
    const { falso } = githubFalso();
    const fora = await enviar(
      requisicao(relatoBase(), { origem: "https://malicioso.example" }),
      env,
    );
    expect(fora.resposta.status).toBe(403);
    expect(fora.corpo).toMatchObject({ ok: false, erro: "origem" });
    expect(fora.resposta.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const sem = await enviar(requisicao(relatoBase(), { origem: null }), env);
    expect(sem.resposta.status).toBe(403);
    const preflight = await enviar(
      requisicao(undefined, { metodo: "OPTIONS", origem: "https://x.example" }),
      env,
    );
    expect(preflight.resposta.status).toBe(403);
    expect(falso).not.toHaveBeenCalled();
  });

  it("aceita a lista de ALLOWED_ORIGINS da var", async () => {
    const { env } = envTeste({ ALLOWED_ORIGINS: "https://a.example, https://b.example" });
    const { resposta } = await enviar(
      requisicao(undefined, { metodo: "OPTIONS", origem: "https://b.example" }),
      env,
    );
    expect(resposta.status).toBe(204);
  });

  it("405 para outro método e 404 para outra rota, ambos em JSON", async () => {
    const { env } = envTeste();
    const get = await enviar(requisicao(undefined, { metodo: "GET" }), env);
    expect(get.resposta.status).toBe(405);
    expect(get.resposta.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(get.corpo).toMatchObject({ ok: false });
    const rota = await enviar(requisicao(relatoBase(), { caminho: "/outra" }), env);
    expect(rota.resposta.status).toBe(404);
    expect(rota.corpo).toMatchObject({ ok: false });
  });
});

describe("tamanho e validação", () => {
  it("413 pelo Content-Length declarado, antes de ler o corpo", async () => {
    const { env } = envTeste();
    const request = requisicao(relatoBase(), {
      cabecalhos: { "Content-Length": String(LIMITE_CORPO + 1) },
    });
    const { resposta, corpo } = await enviar(request, env);
    expect(resposta.status).toBe(413);
    expect(corpo).toMatchObject({ ok: false, erro: "grande" });
  });

  it("413 pelo tamanho real lido quando o cabeçalho mente ou falta", async () => {
    const { env } = envTeste();
    const corpo = JSON.stringify(relatoBase({ aconteceu: "x".repeat(LIMITE_CORPO) }));
    const { resposta } = await enviar(requisicao(corpo), env);
    expect(resposta.status).toBe(413);
  });

  it("400 com mensagem para JSON inválido e campo fora do limite", async () => {
    const { env } = envTeste();
    const quebrado = await enviar(requisicao("{nao é json"), env);
    expect(quebrado.resposta.status).toBe(400);
    expect(quebrado.corpo).toMatchObject({ ok: false, erro: "invalido" });
    const vazio = await enviar(requisicao(relatoBase({ aconteceu: "" })), env);
    expect(vazio.corpo).toEqual({
      ok: false,
      erro: "invalido",
      mensagem: 'O campo "O que aconteceu" está vazio.',
    });
    expect(vazio.resposta.headers.get("Access-Control-Allow-Origin")).toBe(ORIGEM);
  });

  it("400 para print sem assinatura PNG e obra com JSON inválido", async () => {
    const { env } = envTeste();
    const print = await enviar(
      requisicao(relatoBase({ print: btoa("nao-e-png-de-jeito-nenhum") })),
      env,
    );
    expect(print.resposta.status).toBe(400);
    expect(print.corpo).toMatchObject({ mensagem: "O print não é uma imagem PNG válida." });
    const obra = await enviar(requisicao(relatoBase({ obra: { nome: "x.json", json: "{" } })), env);
    expect(obra.resposta.status).toBe(400);
    expect(obra.corpo).toMatchObject({ mensagem: "O arquivo da obra não é um JSON válido." });
  });

  it("400 para mais de 5 links", async () => {
    const { env } = envTeste();
    const aconteceu = Array.from({ length: 6 }, (_, i) => `veja https://spam.example/${i}`).join(
      "\n",
    );
    const { resposta, corpo } = await enviar(requisicao(relatoBase({ aconteceu })), env);
    expect(resposta.status).toBe(400);
    expect(corpo).toMatchObject({
      erro: "invalido",
      mensagem: "O relato tem links demais (máximo 5).",
    });
  });
});

describe("antiabuso", () => {
  it("honeypot responde 201 falso sem chamar o GitHub nem contar cota", async () => {
    const { env, dados, taxa } = envTeste();
    const { falso } = githubFalso();
    const { resposta, corpo } = await enviar(requisicao(relatoBase({ site: "http://spam" })), env);
    expect(resposta.status).toBe(201);
    expect(corpo).toEqual({ ok: true, numero: 0, url: "" });
    expect(falso).not.toHaveBeenCalled();
    expect(taxa.chaves).toEqual([]);
    expect(dados.size).toBe(0);
  });

  it("429 com Retry-After quando o binding de taxa nega, sem chamar o GitHub", async () => {
    const { env } = envTeste({ LIMITE_IP: limitador(false).binding });
    const { falso } = githubFalso();
    const { resposta, corpo } = await enviar(requisicao(relatoBase()), env);
    expect(resposta.status).toBe(429);
    expect(resposta.headers.get("Retry-After")).toBe("60");
    expect(corpo).toMatchObject({ ok: false, erro: "limite" });
    expect(falso).not.toHaveBeenCalled();
  });

  it("guarda o IP só como hash, no binding e no KV", async () => {
    const { env, dados, taxa } = envTeste();
    githubFalso();
    await enviar(requisicao(relatoBase()), env);
    const hash = await hashIp(IP, "openstrut-relato");
    expect(taxa.chaves).toEqual([hash]);
    const chaves = [...dados.keys()];
    expect(chaves).toContain(`dia:${diaUtc(new Date())}:ip:${hash}`);
    expect(chaves.some((c) => c.includes(IP))).toBe(false);
    expect([...dados.values()].every((v) => v.ttl === 2 * 24 * 60 * 60)).toBe(true);
  });

  it("429 no limite diário por IP", async () => {
    const { env } = envTeste({ LIMITE_DIA_IP: "2" });
    const { chamadas } = githubFalso();
    expect((await enviar(requisicao(relatoBase()), env)).resposta.status).toBe(201);
    expect((await enviar(requisicao(relatoBase()), env)).resposta.status).toBe(201);
    const terceiro = await enviar(requisicao(relatoBase()), env);
    expect(terceiro.resposta.status).toBe(429);
    expect(Number(terceiro.resposta.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(chamadas.filter((c) => c.url.endsWith("/issues"))).toHaveLength(2);
  });

  it("429 no limite diário total, mesmo de outro IP", async () => {
    const { env } = envTeste({ LIMITE_DIA_TOTAL: "1" });
    githubFalso();
    expect((await enviar(requisicao(relatoBase()), env)).resposta.status).toBe(201);
    const outroIp = requisicao(relatoBase(), {
      cabecalhos: { "CF-Connecting-IP": "198.51.100.1" },
    });
    expect((await enviar(outroIp, env)).resposta.status).toBe(429);
  });

  it("relato inválido não consome cota", async () => {
    const { env, dados, taxa } = envTeste();
    await enviar(requisicao(relatoBase({ titulo: "" })), env);
    expect(taxa.chaves).toEqual([]);
    expect(dados.size).toBe(0);
  });
});

describe("Turnstile", () => {
  it("sem o secret, não exige token", async () => {
    const { env } = envTeste();
    const { chamadas } = githubFalso();
    expect((await enviar(requisicao(relatoBase()), env)).resposta.status).toBe(201);
    expect(chamadas.some((c) => c.url.includes("challenges.cloudflare.com"))).toBe(false);
  });

  it("com o secret e sem token: 403 sem chamar o GitHub", async () => {
    const { env } = envTeste({ TURNSTILE_SECRET: "segredo-ts" });
    const { falso } = githubFalso();
    const { resposta, corpo } = await enviar(requisicao(relatoBase()), env);
    expect(resposta.status).toBe(403);
    expect(corpo).toMatchObject({ ok: false, erro: "turnstile" });
    expect(falso).not.toHaveBeenCalled();
  });

  it("siteverify false: 403", async () => {
    const { env } = envTeste({ TURNSTILE_SECRET: "segredo-ts" });
    const { chamadas } = githubFalso({ turnstile: false });
    const { resposta } = await enviar(requisicao(relatoBase({ turnstile: "tok" })), env);
    expect(resposta.status).toBe(403);
    expect(chamadas).toHaveLength(1);
  });

  it("siteverify true: segue e manda secret, token e IP", async () => {
    const { env } = envTeste({ TURNSTILE_SECRET: "segredo-ts" });
    const { chamadas } = githubFalso({ turnstile: true });
    const { resposta } = await enviar(requisicao(relatoBase({ turnstile: "tok" })), env);
    expect(resposta.status).toBe(201);
    expect(chamadas[0]).toMatchObject({
      metodo: "POST",
      url: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      corpo: { secret: "segredo-ts", response: "tok", remoteip: IP },
    });
  });
});

describe("GitHub", () => {
  const comAnexos = () =>
    relatoBase({
      email: "eng@exemplo.com.br",
      print: PNG_BASE64,
      obra: { nome: "Edifício Sol.openstrut.json", json: '{"versao":3,"nome":"Edifício Sol"}' },
      erros: ["TypeError: x is undefined"],
    });

  it("caminho feliz com branch existente", async () => {
    const { env, dados } = envTeste();
    const { chamadas } = githubFalso();
    const { resposta, corpo, texto } = await enviar(requisicao(comAnexos()), env);

    expect(resposta.status).toBe(201);
    expect(corpo).toEqual({
      ok: true,
      numero: 42,
      url: "https://github.com/gmunaro/openstrut/issues/42",
    });
    expect(texto).not.toContain("token");

    const base = "https://api.github.com/repos/gmunaro/openstrut";
    expect(
      chamadas.map((c) => `${c.metodo} ${c.url.replace(/relatos\/[^/]+\//, "relatos/{id}/")}`),
    ).toEqual([
      `GET ${base}/git/ref/heads/relatos`,
      `PUT ${base}/contents/relatos/{id}/print.png`,
      `PUT ${base}/contents/relatos/{id}/Edif_cio_Sol.openstrut.json`,
      `POST ${base}/issues`,
    ]);
    const id = /relatos\/([^/]+)\/print\.png/.exec(chamadas[1]?.url ?? "")?.[1] ?? "";
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/);

    expect(chamadas[1]?.corpo).toMatchObject({ branch: "relatos", content: PNG_BASE64 });
    const obra = chamadas[2]?.corpo;
    expect(obra).toMatchObject({ branch: "relatos" });
    const conteudo = campo(obra, "content");
    expect(new TextDecoder().decode(Uint8Array.from(atob(conteudo), (c) => c.charCodeAt(0)))).toBe(
      '{"versao":3,"nome":"Edifício Sol"}',
    );

    const issue = chamadas[3];
    expect(issue?.token).toBe("Bearer token-principal");
    expect(issue?.corpo).toMatchObject({ title: "[Relato] Viga V3 sem armadura", labels: ["bug"] });
    const corpoIssue = campo(issue?.corpo, "body");
    expect(corpoIssue).toContain(
      `![print](https://raw.githubusercontent.com/gmunaro/openstrut/relatos/relatos/${id}/print.png)`,
    );
    expect(corpoIssue).toContain(
      `(https://github.com/gmunaro/openstrut/blob/relatos/relatos/${id}/Edif_cio_Sol.openstrut.json)`,
    );
    expect(corpoIssue).toContain("> Calculei a viga e a armadura saiu zerada.");
    expect(corpoIssue).toContain("| Versão | 2.0.0 |");
    expect(corpoIssue).toContain("```text\nTypeError: x is undefined\n```");
    expect(corpoIssue).toContain("O autor deixou e-mail de contato");
    expect(corpoIssue).not.toContain("eng@exemplo.com.br");

    expect(dados.get("contato:42")).toEqual({
      valor: "eng@exemplo.com.br",
      ttl: 180 * 24 * 60 * 60,
    });
  });

  it("sem anexos, não mexe no branch e usa as LABELS da var", async () => {
    const { env } = envTeste({ LABELS: "bug, relato" });
    const { chamadas } = githubFalso();
    await enviar(requisicao(relatoBase()), env);
    expect(chamadas.map((c) => c.metodo + " " + c.url)).toEqual([
      "POST https://api.github.com/repos/gmunaro/openstrut/issues",
    ]);
    expect(chamadas[0]?.corpo).toMatchObject({ labels: ["bug", "relato"] });
  });

  it("branch inexistente: cria órfão (trees, commits sem parents, refs)", async () => {
    const { env } = envTeste();
    const { chamadas } = githubFalso({ branchExiste: false });
    const { resposta } = await enviar(requisicao(relatoBase({ print: PNG_BASE64 })), env);
    expect(resposta.status).toBe(201);
    const base = "https://api.github.com/repos/gmunaro/openstrut";
    expect(chamadas.slice(0, 4).map((c) => `${c.metodo} ${c.url}`)).toEqual([
      `GET ${base}/git/ref/heads/relatos`,
      `POST ${base}/git/trees`,
      `POST ${base}/git/commits`,
      `POST ${base}/git/refs`,
    ]);
    expect(chamadas[1]?.corpo).toMatchObject({
      tree: [{ path: "README.md", mode: "100644", type: "blob" }],
    });
    expect(chamadas[2]?.corpo).toMatchObject({ tree: "arvore1", parents: [] });
    expect(chamadas[3]?.corpo).toEqual({ ref: "refs/heads/relatos", sha: "commit1" });
  });

  it("422 'Reference already exists' ao criar o branch conta como sucesso", async () => {
    const { env } = envTeste();
    githubFalso({ branchExiste: false, refJaExiste: true });
    const { resposta } = await enviar(requisicao(relatoBase({ print: PNG_BASE64 })), env);
    expect(resposta.status).toBe(201);
  });

  it("GitHub 500 na issue: 502 sem vazar detalhes nem gravar o e-mail", async () => {
    const { env, dados } = envTeste();
    githubFalso({ statusIssue: 500 });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { resposta, corpo, texto } = await enviar(
      requisicao(relatoBase({ email: "a@b.com" })),
      env,
    );
    expect(resposta.status).toBe(502);
    expect(corpo).toMatchObject({ ok: false, erro: "github" });
    expect(texto).not.toContain("segredo interno");
    expect(texto).not.toContain("token-principal");
    expect(dados.has("contato:42")).toBe(false);
    const registrado = log.mock.calls.flat().join(" ");
    expect(registrado).toContain("500");
    expect(registrado).toContain("/issues");
    expect(registrado).not.toContain("token-principal");
    expect(registrado).not.toContain("a@b.com");
  });

  it("menções neutralizadas e crases escapadas no corpo enviado", async () => {
    const { env } = envTeste();
    const { chamadas } = githubFalso();
    await enviar(
      requisicao(
        relatoBase({
          titulo: "@gmunaro olha isso",
          aconteceu: "cc @fulano",
          diagnostico: [{ rotulo: "Usuário", valor: "@ciclano|x" }],
          erros: ["```\n@beltrano\n```"],
        }),
      ),
      env,
    );
    const issue = chamadas.at(-1)?.corpo;
    const titulo = campo(issue, "title");
    const body = campo(issue, "body");
    expect(titulo).toBe("[Relato] @​gmunaro olha isso");
    expect(body).not.toMatch(/@[A-Za-z]/);
    expect(body).toContain("| Usuário | @​ciclano\\|x |");
    const erros = body.slice(body.indexOf("### Últimos erros"));
    // Só as duas cercas do próprio bloco têm 3 crases seguidas.
    expect(erros.match(/`{3,}/g)).toHaveLength(2);
  });

  it("repositório e token separados para os anexos", async () => {
    const { env } = envTeste({
      GITHUB_REPO_ARQUIVOS: "gmunaro/openstrut-relatos",
      GITHUB_TOKEN_ARQUIVOS: "token-arquivos",
      BRANCH_ARQUIVOS: "anexos",
    });
    const { chamadas } = githubFalso();
    await enviar(requisicao(comAnexos()), env);
    const anexos = chamadas.filter((c) => !c.url.endsWith("/issues"));
    expect(anexos).toHaveLength(3);
    for (const c of anexos) {
      expect(c.url).toContain("/repos/gmunaro/openstrut-relatos/");
      expect(c.token).toBe("Bearer token-arquivos");
    }
    expect(anexos[0]?.url).toContain("/git/ref/heads/anexos");
    const issue = chamadas.at(-1);
    expect(issue?.url).toBe("https://api.github.com/repos/gmunaro/openstrut/issues");
    expect(issue?.token).toBe("Bearer token-principal");
    const body = campo(issue?.corpo, "body");
    expect(body).toContain(
      "https://raw.githubusercontent.com/gmunaro/openstrut-relatos/anexos/relatos/",
    );
    expect(body).toContain("https://github.com/gmunaro/openstrut-relatos/blob/anexos/relatos/");
  });

  it("todas as chamadas ao GitHub levam os cabeçalhos da API", async () => {
    const { env } = envTeste();
    const { falso } = githubFalso();
    await enviar(requisicao(relatoBase()), env);
    const headers = new Headers(falso.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Accept")).toBe("application/vnd.github+json");
    expect(headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
    expect(headers.get("User-Agent")).toBe("openstrut-relato");
  });
});

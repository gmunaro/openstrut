// Chamadas à API REST do GitHub: branch órfão dos anexos, upload de arquivos
// e criação da issue. Qualquer resposta fora de 2xx vira ErroGitHub, que o
// index transforma em 502 sem repassar o corpo do erro.

const API = "https://api.github.com";

/** Falha numa chamada ao GitHub. Guarda só status e endpoint, nada do usuário. */
export class ErroGitHub extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(`GitHub ${status} em ${endpoint}`);
  }
}

/** Cliente de um repositório com um token. */
export function clienteGitHub(token: string, repo: string) {
  async function chamar(metodo: string, caminho: string, corpo?: unknown, aceitar: number[] = []) {
    const endpoint = `${metodo} /repos/${repo}${caminho}`;
    const init: RequestInit = {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "openstrut-relato",
        ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
      },
    };
    if (corpo !== undefined) init.body = JSON.stringify(corpo);
    let resposta: Response;
    try {
      resposta = await fetch(`${API}/repos/${repo}${caminho}`, init);
    } catch {
      throw new ErroGitHub(0, endpoint);
    }
    if (!resposta.ok && !aceitar.includes(resposta.status)) {
      throw new ErroGitHub(resposta.status, endpoint);
    }
    return resposta;
  }

  async function sha(resposta: Response, endpoint: string) {
    const dados: unknown = await resposta.json();
    if (
      typeof dados === "object" &&
      dados !== null &&
      "sha" in dados &&
      typeof dados.sha === "string"
    ) {
      return dados.sha;
    }
    throw new ErroGitHub(resposta.status, endpoint);
  }

  return {
    /** Garante o branch dos anexos; se não existe, cria órfão com um README. */
    async garantirBranch(branch: string) {
      const ref = await chamar("GET", `/git/ref/heads/${branch}`, undefined, [404]);
      if (ref.ok) return;

      const arvore = await chamar("POST", "/git/trees", {
        tree: [{ path: "README.md", mode: "100644", type: "blob", content: README_BRANCH }],
      });
      const shaArvore = await sha(arvore, "POST git/trees");
      const commit = await chamar("POST", "/git/commits", {
        message: "Cria o branch dos anexos de relatos",
        tree: shaArvore,
        parents: [],
      });
      const shaCommit = await sha(commit, "POST git/commits");
      const criada = await chamar(
        "POST",
        "/git/refs",
        { ref: `refs/heads/${branch}`, sha: shaCommit },
        [422],
      );
      if (criada.status === 422) {
        // Outro relato criou o branch entre o GET e o POST: tudo certo.
        const texto = await criada.text();
        if (!texto.includes("Reference already exists")) throw new ErroGitHub(422, "POST git/refs");
      }
    },

    /** Grava um arquivo (conteúdo já em base64) no branch. */
    async enviarArquivo(branch: string, caminho: string, base64: string, mensagem: string) {
      const segmentos = caminho.split("/").map(encodeURIComponent).join("/");
      await chamar("PUT", `/contents/${segmentos}`, { message: mensagem, content: base64, branch });
    },

    async criarIssue(title: string, body: string, labels: string[]) {
      const resposta = await chamar("POST", "/issues", { title, body, labels });
      const dados: unknown = await resposta.json();
      if (
        typeof dados === "object" &&
        dados !== null &&
        "number" in dados &&
        typeof dados.number === "number" &&
        "html_url" in dados &&
        typeof dados.html_url === "string"
      ) {
        return { numero: dados.number, url: dados.html_url };
      }
      throw new ErroGitHub(resposta.status, "POST issues");
    },
  };
}

const README_BRANCH = `# Anexos de relatos

Este branch guarda os anexos (print e arquivo da obra) enviados pelo botão
"Relatar problema" do OpenStrut. Cada relato fica em \`relatos/<id>/\` e a issue
correspondente aponta para estes arquivos. Não tem código: não faça merge dele.
`;

/** Texto UTF-8 em base64 (btoa só aceita Latin-1), em blocos para não estourar a pilha. */
export function textoParaBase64(texto: string) {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

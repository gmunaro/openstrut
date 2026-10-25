// Worker que recebe o relato do botão "Relatar problema" do OpenStrut e abre a
// issue no GitHub com o token guardado como secret. Ordem das checagens:
// método/rota → origem → tamanho → JSON e validação → honeypot → taxa → Turnstile → GitHub.
import { clienteGitHub, ErroGitHub, textoParaBase64 } from "./github";
import { cabecalhosCors, erro, json, lerCorpoLimitado, origemPermitida } from "./http";
import { corpoIssue, tituloIssue } from "./issue";
import { consumirCota, diaUtc } from "./limites";
import type { Env, Relato } from "./tipos";
import { verificarTurnstile } from "./turnstile";
import { validarRelato } from "./validar";

/** Teto do corpo da requisição (print + obra + textos, com folga). */
export const LIMITE_CORPO = 6 * 1024 * 1024;

const CENTO_E_OITENTA_DIAS = 180 * 24 * 60 * 60;

export default {
  async fetch(request: Request, env: Env) {
    const origem = origemPermitida(request.headers.get("Origin"), env);
    const cors = cabecalhosCors(origem);
    try {
      if (new URL(request.url).pathname !== "/relato") {
        return erro(404, "rota", "Endereço não encontrado.", cors);
      }
      if (request.method === "OPTIONS") {
        return origem
          ? new Response(null, { status: 204, headers: cors })
          : erro(403, "origem", "Origem não permitida.", cors);
      }
      if (request.method !== "POST") {
        return erro(405, "metodo", "Método não permitido.", { ...cors, Allow: "POST, OPTIONS" });
      }
      if (!origem) return erro(403, "origem", "Origem não permitida.", cors);
      return await receberRelato(request, env, cors);
    } catch (falha) {
      if (falha instanceof ErroGitHub) {
        console.error(`github: status ${falha.status} em ${falha.endpoint}`);
        return erro(
          502,
          "github",
          "O GitHub recusou o relato agora. Tente de novo mais tarde.",
          cors,
        );
      }
      console.error("erro inesperado:", falha instanceof Error ? falha.message : typeof falha);
      return erro(500, "interno", "Erro inesperado ao enviar o relato.", cors);
    }
  },
} satisfies ExportedHandler<Env>;

async function receberRelato(request: Request, env: Env, cors: Record<string, string>) {
  const muitoGrande = () =>
    erro(413, "grande", "O relato ficou grande demais (máximo 6 MiB com anexos).", cors);
  const declarado = Number(request.headers.get("Content-Length"));
  if (declarado > LIMITE_CORPO) return muitoGrande();
  const texto = await lerCorpoLimitado(request, LIMITE_CORPO);
  if (texto === null) return muitoGrande();

  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return erro(400, "invalido", "O relato chegou num formato inválido.", cors);
  }
  const validacao = validarRelato(corpo);
  if (!validacao.ok) return erro(400, "invalido", validacao.mensagem, cors);
  const relato = validacao.relato;

  // Honeypot: finge sucesso para não ensinar o bot.
  if (relato.robo) return json(201, { ok: true, numero: 0, url: "" }, cors);

  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const cota = await consumirCota(env, ip || "sem-ip");
  if (!cota.ok) {
    return erro(429, "limite", "Muitos relatos em pouco tempo. Tente de novo mais tarde.", {
      ...cors,
      "Retry-After": String(cota.retryAfter),
    });
  }

  if (env.TURNSTILE_SECRET) {
    const aprovado =
      relato.turnstile !== undefined &&
      (await verificarTurnstile(env.TURNSTILE_SECRET, relato.turnstile, ip));
    if (!aprovado) {
      return erro(403, "turnstile", "A verificação anti-robô falhou. Recarregue a página.", cors);
    }
  }

  const issue = await publicar(relato, env);
  if (relato.email) {
    // Depois da issue, porque a chave usa o número dela. Nunca vai para log.
    try {
      await env.RELATOS_KV.put(`contato:${issue.numero}`, relato.email, {
        expirationTtl: CENTO_E_OITENTA_DIAS,
      });
    } catch {
      console.error(`kv: falha ao gravar o contato da issue ${issue.numero}`);
    }
  }
  return json(201, { ok: true, numero: issue.numero, url: issue.url }, cors);
}

/** Envia os anexos (se houver) ao repositório de arquivos e cria a issue. */
async function publicar(relato: Relato, env: Env) {
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN ausente");
  const repo = env.GITHUB_REPO || "gmunaro/openstrut";
  const repoArquivos = env.GITHUB_REPO_ARQUIVOS || repo;
  // anexos noutro repositório (privado): a issue pública só leva links, e a obra vai
  // com nome fixo, para o nome da obra do cliente não aparecer no corpo
  const separados = repoArquivos !== repo;
  const nomeObra = relato.obra && (separados ? "obra.openstrut.json" : relato.obra.nome);
  const branch = env.BRANCH_ARQUIVOS || "relatos";
  const labels = (env.LABELS ?? "relato,triagem,bug")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  const id = `${diaUtc(new Date())}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

  if (relato.print || relato.obra) {
    const arquivos = clienteGitHub(env.GITHUB_TOKEN_ARQUIVOS || token, repoArquivos);
    await arquivos.garantirBranch(branch);
    if (relato.print) {
      await arquivos.enviarArquivo(
        branch,
        `relatos/${id}/print.png`,
        relato.print,
        `Relato ${id}: print`,
      );
    }
    if (relato.obra) {
      await arquivos.enviarArquivo(
        branch,
        `relatos/${id}/${nomeObra}`,
        textoParaBase64(relato.obra.json),
        `Relato ${id}: obra`,
      );
    }
  }

  const anexos = {
    repoArquivos,
    branch,
    id,
    temPrint: relato.print !== undefined,
    nomeObra,
    separados,
  };
  return clienteGitHub(token, repo).criarIssue(
    tituloIssue(relato.titulo),
    corpoIssue(relato, anexos),
    labels,
  );
}

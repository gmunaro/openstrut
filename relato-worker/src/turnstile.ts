// Verificação do token do Cloudflare Turnstile. Só é exigida quando o secret
// TURNSTILE_SECRET está cadastrado.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** true quando o Turnstile confirma o token. Falha de rede conta como recusa. */
export async function verificarTurnstile(secret: string, token: string, ip: string) {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const resposta = await fetch(SITEVERIFY, { method: "POST", body: form });
    if (!resposta.ok) {
      console.error(`turnstile: status ${resposta.status} em siteverify`);
      return false;
    }
    const dados: unknown = await resposta.json();
    return (
      typeof dados === "object" && dados !== null && "success" in dados && dados.success === true
    );
  } catch {
    console.error("turnstile: falha de rede em siteverify");
    return false;
  }
}

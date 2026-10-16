// Limites de taxa: o binding de Rate Limiting (rajada por IP) e os contadores
// diários no KV (por IP e total). O IP só entra no KV como hash SHA-256 com sal.
import type { Env } from "./tipos";

const DOIS_DIAS = 2 * 24 * 60 * 60;

export type ResultadoLimite = { ok: true } | { ok: false; retryAfter: number };

/** Hash hexadecimal do IP com o sal da var SAL_IP (ou o nome do worker). */
export async function hashIp(ip: string, sal: string) {
  const bytes = new TextEncoder().encode(`${sal}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Dia UTC no formato AAAA-MM-DD. */
export function diaUtc(agora: Date) {
  return agora.toISOString().slice(0, 10);
}

/** Segundos até a meia-noite UTC seguinte, quando os contadores diários zeram. */
export function segundosAteAmanha(agora: Date) {
  const amanha = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + 1);
  return Math.max(1, Math.ceil((amanha - agora.getTime()) / 1000));
}

function numero(valor: string | undefined, padrao: number) {
  const n = Number(valor);
  return valor && Number.isFinite(n) && n >= 0 ? n : padrao;
}

/**
 * Confere e consome a cota do relato. Chame só com relato já validado e antes de
 * falar com o GitHub. O KV não é atômico: em corrida, passa um relato a mais, o
 * que é aceitável aqui (o binding segura a rajada).
 */
export async function consumirCota(
  env: Env,
  ip: string,
  agora = new Date(),
): Promise<ResultadoLimite> {
  // Nem o binding recebe o IP em claro.
  const hash = await hashIp(ip, env.SAL_IP || "openstrut-relato");
  const { success } = await env.LIMITE_IP.limit({ key: hash });
  if (!success) return { ok: false, retryAfter: 60 };

  const dia = diaUtc(agora);
  const chaveIp = `dia:${dia}:ip:${hash}`;
  const chaveTotal = `dia:${dia}:total`;
  const [doIp, total] = await Promise.all([
    env.RELATOS_KV.get(chaveIp),
    env.RELATOS_KV.get(chaveTotal),
  ]);
  const contIp = Number(doIp) || 0;
  const contTotal = Number(total) || 0;
  if (contIp >= numero(env.LIMITE_DIA_IP, 10) || contTotal >= numero(env.LIMITE_DIA_TOTAL, 50)) {
    return { ok: false, retryAfter: segundosAteAmanha(agora) };
  }

  await Promise.all([
    env.RELATOS_KV.put(chaveIp, String(contIp + 1), { expirationTtl: DOIS_DIAS }),
    env.RELATOS_KV.put(chaveTotal, String(contTotal + 1), { expirationTtl: DOIS_DIAS }),
  ]);
  return { ok: true };
}

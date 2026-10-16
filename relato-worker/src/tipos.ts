// Tipos compartilhados do worker: o ambiente (vars, secrets e bindings) e o
// relato já validado. O formato que chega pela rede está em validar.ts.

/** Subconjunto do KV do Workers que o worker usa (os testes passam um KV em memória). */
export interface ArmazemKV {
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string, opcoes?: { expirationTtl?: number }): Promise<void>;
}

/** Binding de Rate Limiting do Workers (`[[ratelimits]]` no wrangler.toml). */
export interface LimitadorTaxa {
  limit(opcoes: { key: string }): Promise<{ success: boolean }>;
}

// Falha no typecheck se os bindings reais deixarem de caber nas interfaces acima.
type Verdadeiro<T extends true> = T;
export type CompatibilidadeBindings = Verdadeiro<
  KVNamespace extends ArmazemKV ? (RateLimit extends LimitadorTaxa ? true : false) : false
>;

export interface Env {
  // vars (wrangler.toml)
  ALLOWED_ORIGINS?: string;
  GITHUB_REPO?: string;
  GITHUB_REPO_ARQUIVOS?: string;
  BRANCH_ARQUIVOS?: string;
  LABELS?: string;
  LIMITE_DIA_IP?: string;
  LIMITE_DIA_TOTAL?: string;
  SAL_IP?: string;
  // secrets (wrangler secret put)
  GITHUB_TOKEN?: string;
  GITHUB_TOKEN_ARQUIVOS?: string;
  TURNSTILE_SECRET?: string;
  // bindings
  LIMITE_IP: LimitadorTaxa;
  RELATOS_KV: ArmazemKV;
}

export interface ItemDiagnostico {
  rotulo: string;
  valor: string;
}

/** Relato que passou na validação: textos aparados, print decodificado, nome da obra normalizado. */
export interface Relato {
  titulo: string;
  aconteceu: string;
  esperado: string;
  email: string | undefined;
  diagnostico: ItemDiagnostico[];
  erros: string[];
  /** PNG em base64, já conferido. */
  print: string | undefined;
  /** Obra com nome seguro para caminho e o JSON original. */
  obra: { nome: string; json: string } | undefined;
  turnstile: string | undefined;
  /** Honeypot preenchido: é bot. */
  robo: boolean;
}

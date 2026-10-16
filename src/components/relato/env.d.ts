// Variáveis de build do relato de problema (docs/RELATO.md).
interface ImportMetaEnv {
  /** URL do relay (relato-worker), ex.: https://openstrut-relato.<conta>.workers.dev/relato.
   *  Definida: o relato vai pelo relay, sem conta no GitHub. Ausente: abre a issue no GitHub. */
  readonly VITE_RELATO_URL?: string;
  /** Chave pública do Cloudflare Turnstile, quando o relay exige. */
  readonly VITE_TURNSTILE_SITEKEY?: string;
  /** Commit do build, para o diagnóstico (ex.: `VITE_COMMIT=$GITHUB_SHA`). */
  readonly VITE_COMMIT?: string;
}

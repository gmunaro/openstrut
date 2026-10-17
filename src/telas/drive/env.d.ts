// Variáveis de build da importação pelo Google Drive (docs/GOOGLE-DRIVE.md). Públicas:
// vão para o JavaScript do site. Sem as duas, a opção aparece desabilitada.
interface ImportMetaEnv {
  /** Client ID OAuth do tipo "Aplicativo da Web" (<número do projeto>-<...>.apps.googleusercontent.com). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** API key restrita ao referrer do site e às APIs Drive e Picker. */
  readonly VITE_GOOGLE_API_KEY?: string;
}

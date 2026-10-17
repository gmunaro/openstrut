// Os arquivos escolhidos para a importação de obra do SISTRUT, venham do disco (seletor,
// pasta, arrastar) ou do Google Drive, e a leitura do conteúdo deles. Cada um sabe ler o
// próprio conteúdo sob demanda: só os que a importação lê (`extensaoLida`) são lidos, e o
// resto (.DXF, .PLT, .BAK...) entra no resumo só pelo nome, sem ir para a memória nem
// ser baixado.
import { ErroDrive, pedeLogin } from "./drive/api";
import { extensaoLida, type ArquivoEntrada } from "./InicioSistrut";

/** Um arquivo escolhido, com o caminho dentro da seleção ("OBRA/COB.LAJ"). */
export interface Escolhido {
  nome: string;
  caminho: string;
  /** O conteúdo; chamado só para os arquivos que a importação lê. */
  ler: (signal: AbortSignal) => Promise<Uint8Array>;
}

/** Arquivo do disco. O caminho padrão é o relativo à pasta escolhida, quando há. */
export const doDisco = (
  arquivo: File,
  caminho = arquivo.webkitRelativePath || arquivo.name,
): Escolhido => ({
  nome: arquivo.name,
  caminho,
  ler: async () => new Uint8Array(await arquivo.arrayBuffer()),
});

/** Lê o conteúdo dos escolhidos que a importação usa; os outros vão com conteúdo vazio.
 *  `aoAvancar(feitos, total)` conta só os lidos. Um arquivo que não abre vai para
 *  `falhas` e não derruba os outros; `pedemLogin` diz se algum falhou por falta de login
 *  no Google (a tela oferece entrar). */
export async function lerSelecao(
  escolhidos: readonly Escolhido[],
  aoAvancar: (feitos: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ lidos: ArquivoEntrada[]; falhas: string[]; pedemLogin: boolean }> {
  const falhas: string[] = [];
  let pedemLogin = false;
  const total = escolhidos.filter((e) => extensaoLida(e.nome)).length;
  let feitos = 0;
  aoAvancar(0, total);
  const lidos = await Promise.all(
    escolhidos.map(async ({ nome, caminho, ler }): Promise<ArquivoEntrada | undefined> => {
      if (!extensaoLida(nome)) return { nome, caminho, dados: new Uint8Array() };
      try {
        const dados = await ler(signal);
        aoAvancar(++feitos, total);
        return { nome, caminho, dados };
      } catch (erro) {
        if (signal.aborted) throw erro;
        if (pedeLogin(erro)) pedemLogin = true;
        falhas.push(
          erro instanceof ErroDrive
            ? `${caminho}: ${erro.message}`
            : `${caminho}: não foi possível ler (${String(erro)}).`,
        );
        return undefined;
      }
    }),
  );
  return { lidos: lidos.filter((a) => a !== undefined), falhas, pedemLogin };
}

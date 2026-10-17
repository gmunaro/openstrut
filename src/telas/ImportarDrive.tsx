// A opção "Importar do Google Drive" da importação de obra do SISTRUT: colar o link de
// uma pasta (ou de um arquivo) ou marcar os arquivos no Drive pelo Google Picker. A
// listagem vira a mesma lista de arquivos com caminho que a pasta do disco dá, e a tela
// de importação (ImportarSistrut.tsx) segue igual: pergunta a subpasta e o .DSP, baixa só
// o que a importação lê e mostra o resumo.
//
// O link tenta primeiro sem login, só com a API key (pasta pública, "qualquer pessoa com o
// link"). Se o Google responde 403/404, a tela pede para entrar: o login usa drive.file,
// que dá acesso só aos arquivos que o usuário marca no Picker (escolher a pasta não
// basta; ver drive/google.ts). O Picker abre já na pasta do link, ou mostrando só o
// arquivo do link. Os parâmetros que ficam em outra pasta (a EXEC40) entram numa segunda
// rodada do Picker: os arquivos marcados se somam até o usuário mandar importar.
//
// Cada ação abre uma tentativa com AbortController: fechar o diálogo, abri-lo de novo ou
// começar outra ação interrompe a anterior, e o resultado dela é descartado.
import { CloudDownload } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  type ConteudoDrive,
} from "./drive/api";
import {
  carregarGis,
  carregarPicker,
  configuracaoGoogle,
  entrar,
  esquecerToken,
  gisCarregado,
  mostrarPicker,
  tokenAtual,
  type EscolhidoNoPicker,
} from "./drive/google";
import { extensaoDoSistrut } from "./InicioSistrut";
import type { Escolhido } from "./selecao";

/** Downloads em paralelo: poucos, para não engasgar a conexão do celular. */
const DOWNLOADS_JUNTOS = 4;

/** Onde o Picker abre: na pasta do link, só no arquivo do link, ou no Drive todo. */
type Onde = { pasta?: string | undefined; arquivo?: string | undefined };
const ondeDo = (alvo?: AlvoDrive): Onde =>
  alvo?.tipo === "pasta"
    ? { pasta: alvo.id }
    : alvo?.tipo === "arquivo"
      ? { arquivo: alvo.id }
      : {};

type Etapa =
  | { tipo: "inicio" }
  /** Lendo a pasta, entrando no Google ou com o Picker aberto: as ações esperam. */
  | { tipo: "ocupado"; texto: string }
  /** O Drive pediu login (pasta privada, login vencido, arquivo não marcado). */
  | { tipo: "login"; mensagem: string; onde: Onde }
  | { tipo: "erro"; mensagem: string };

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** O toque foi no app (o fundo do diálogo ou a página), e não no que o Google põe na
 *  página: o Picker fica fora do app, e o Radix entregava o toque nele como "fora do
 *  diálogo", fechando o diálogo logo depois de reabri-lo com os arquivos marcados. */
const doApp = (alvo: EventTarget | null) =>
  alvo instanceof Element &&
  (alvo.closest('[data-slot="dialog-overlay"]') !== null ||
    document.getElementById("root")?.contains(alvo) === true);

/** Os arquivos listados como a tela de importação os recebe: o conteúdo é baixado só
 *  quando lido, com no máximo DOWNLOADS_JUNTOS de cada vez. Um token recusado no
 *  download é esquecido, para o próximo "Entrar" pedir outro. */
function escolhidosDo(conteudo: ConteudoDrive, acesso: AcessoDrive): Escolhido[] {
  const limite = limitador(DOWNLOADS_JUNTOS);
  return conteudo.arquivos.map((a) => ({
    nome: a.nome,
    caminho: a.caminho,
    ler: (signal) =>
      limite(() =>
        baixarArquivo(a, acesso, { signal }).catch((e: unknown) => {
          if (e instanceof ErroDrive && e.tipo === "login") esquecerToken();
          throw e;
        }),
      ),
  }));
}

/** Os marcados com a pasta no caminho: vindos de mais de uma pasta do Drive, cada pasta
 *  vira "Pasta 1", "Pasta 2"..., para a tela separar a obra dos parâmetros como faz com
 *  as pastas do disco. */
function comPastas(marcados: readonly EscolhidoNoPicker[]) {
  const pastas = [...new Set(marcados.map((m) => m.pastaId ?? ""))];
  return marcados.map((m) => ({
    ...m,
    pasta: pastas.length > 1 ? `Pasta ${pastas.indexOf(m.pastaId ?? "") + 1}` : "",
  }));
}

/** Botão e diálogo do Drive. `aoEscolher` recebe os arquivos e as notas (atalhos,
 *  documentos do Google) para a importação seguir como numa pasta do disco.
 *  `pedirLogin` muda quando a importação não conseguiu baixar sem login: o diálogo abre
 *  oferecendo entrar. */
export function ImportarDrive({
  desabilitado,
  aoEscolher,
  pedirLogin = 0,
}: {
  desabilitado: boolean;
  aoEscolher: (escolhidos: Escolhido[], notas: string[]) => void;
  pedirLogin?: number;
}) {
  const config = configuracaoGoogle();
  const [aberto, setAberto] = useState(false);
  const [link, setLink] = useState("");
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "inicio" });
  const [marcados, setMarcados] = useState<EscolhidoNoPicker[]>([]);
  /** O login do Google (GIS): os botões de entrar esperam por ele. */
  const [gis, setGis] = useState<"carregando" | "pronto" | "falhou">(() =>
    gisCarregado() ? "pronto" : "carregando",
  );
  /** A tentativa em andamento; abortada ao fechar, ao abrir e ao começar outra. */
  const tentativa = useRef<AbortController | null>(null);
  /** O último link lido, para o Picker abrir nele quando a importação pedir login. */
  const ultimoAlvo = useRef<AlvoDrive | undefined>(undefined);
  /** Avisa quando o conteúdo do diálogo sai da página, no fim da animação de saída. */
  const aoSair = useRef<(() => void) | null>(null);

  const novaTentativa = () => {
    tentativa.current?.abort();
    tentativa.current = new AbortController();
    return tentativa.current.signal;
  };

  /** Abre o diálogo e carrega o login do Google, que os botões de entrar esperam (uma
   *  falha de carga tenta de novo na próxima abertura). */
  const abrir = (inicial: Etapa = { tipo: "inicio" }) => {
    novaTentativa();
    setEtapa(inicial);
    setAberto(true);
    if (gisCarregado()) return setGis("pronto");
    setGis("carregando");
    carregarGis().then(
      () => setGis("pronto"),
      (e: unknown) => {
        setGis("falhou");
        setEtapa({ tipo: "erro", mensagem: mensagemDe(e) });
      },
    );
  };

  const fechar = () => {
    tentativa.current?.abort();
    tentativa.current = null;
    setAberto(false);
  };

  // a importação não baixou sem login: abre oferecendo entrar na pasta do último link
  const pedidoAtendido = useRef(pedirLogin);
  useEffect(() => {
    if (pedirLogin === pedidoAtendido.current) return;
    pedidoAtendido.current = pedirLogin;
    abrir({
      tipo: "login",
      mensagem:
        "Sem login, o Google Drive não deixou baixar alguns arquivos. Entre com Google e marque os arquivos da obra.",
      onde: ondeDo(ultimoAlvo.current),
    });
  }, [pedirLogin]);

  /** Erro de uma ação: login vencido ou recusado leva a entrar de novo. */
  const falhou = (erro: unknown, onde: Onde) => {
    if (erro instanceof ErroDrive && erro.tipo === "login") esquecerToken();
    setEtapa(
      pedeLogin(erro)
        ? { tipo: "login", mensagem: mensagemDe(erro), onde }
        : { tipo: "erro", mensagem: mensagemDe(erro) },
    );
  };

  /** Entrega o que foi lido à importação e fecha. */
  const entregar = (conteudo: ConteudoDrive, acesso: AcessoDrive) => {
    if (conteudo.arquivos.length === 0) {
      setEtapa({
        tipo: "erro",
        mensagem: [
          conteudo.notas.length > 0
            ? "Nenhum arquivo comum para importar:"
            : "Não há arquivos aqui: a pasta está vazia.",
          ...conteudo.notas,
        ].join(" "),
      });
      return;
    }
    const repetidos = nomesRepetidos(conteudo.arquivos, extensaoDoSistrut);
    if (repetidos) {
      setEtapa({ tipo: "erro", mensagem: repetidos });
      return;
    }
    tentativa.current = null;
    setAberto(false);
    setLink("");
    setMarcados([]);
    setEtapa({ tipo: "inicio" });
    aoEscolher(escolhidosDo(conteudo, acesso), conteudo.notas);
  };

  /** Colar o link: sem login primeiro (pasta pública). */
  const abrirLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    const alvo = alvoDoLink(link);
    if (!alvo) {
      setEtapa({
        tipo: "erro",
        mensagem:
          "Este link não é de uma pasta nem de um arquivo do Google Drive. No Drive, use Compartilhar → Copiar link; ele começa com https://drive.google.com/.",
      });
      return;
    }
    ultimoAlvo.current = alvo;
    const signal = novaTentativa();
    setEtapa({ tipo: "ocupado", texto: "Lendo a pasta no Google Drive…" });
    const acesso = { apiKey: config.apiKey };
    try {
      const conteudo = await lerAlvo(alvo, acesso, { signal });
      if (!signal.aborted) entregar(conteudo, acesso);
    } catch (erro) {
      if (!signal.aborted) falhou(erro, ondeDo(alvo));
    }
  };

  /** Entra (o popup do Google sai neste clique) e abre o Picker; os arquivos marcados se
   *  somam aos de antes. */
  const escolher = (onde: Onde) => {
    if (!config) return;
    const signal = novaTentativa();
    // sem await antes: o pedido do token sai na pilha do clique
    const token = entrar(config.clientId);
    setEtapa({ tipo: "ocupado", texto: "Entrando no Google…" });
    void (async () => {
      try {
        const t = await token;
        if (signal.aborted) return;
        setEtapa({ tipo: "ocupado", texto: "Abrindo o Google Drive…" });
        const picker = await carregarPicker();
        if (signal.aborted) return;
        // o Picker fica por cima da página: o diálogo (modal) sai da frente enquanto isso.
        // O Picker só abre quando o diálogo saiu de vez: o fundo e o conteúdo vão em
        // portais separados, e o fundo, que termina a animação antes, reaberto no meio da
        // saída do conteúdo voltava depois dele no <body> e cobria o diálogo
        const saiu = new Promise<void>((r) => (aoSair.current = r));
        setAberto(false);
        await saiu;
        if (signal.aborted) return;
        const novos = await mostrarPicker(picker, config, t, onde);
        if (signal.aborted) return;
        setAberto(true);
        setEtapa({ tipo: "inicio" });
        if (novos)
          setMarcados((antes) => [
            ...antes,
            ...novos.filter((n) => !antes.some((a) => a.id === n.id)),
          ]);
      } catch (erro) {
        if (signal.aborted) return;
        setAberto(true);
        falhou(erro, onde);
      }
    })();
  };

  /** Importa os arquivos marcados no Picker. */
  const importarMarcados = async () => {
    if (!config) return;
    const token = tokenAtual();
    if (!token) {
      setEtapa({
        tipo: "login",
        mensagem: "O login no Google expirou. Entre de novo para continuar.",
        onde: {},
      });
      return;
    }
    const signal = novaTentativa();
    setEtapa({ tipo: "ocupado", texto: "Lendo os arquivos marcados…" });
    const acesso = { apiKey: config.apiKey, token };
    try {
      const conteudo = await lerItens(comPastas(marcados), acesso, { signal });
      if (!signal.aborted) entregar(conteudo, acesso);
    } catch (erro) {
      if (!signal.aborted) falhou(erro, {});
    }
  };

  const ocupado = etapa.tipo === "ocupado";
  const podeEntrar = gis === "pronto" && !ocupado;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => abrir()}
        className="mt-2 w-full"
        title="Importe a pasta da obra direto de um link ou do seu Google Drive"
        disabled={desabilitado || !config}
      >
        <CloudDownload /> Importar do Google Drive
      </Button>
      {!config && (
        <p className="text-muted-foreground mt-1 text-xs">
          A importação pelo Google Drive não está ligada nesta versão do app (faltam as chaves do
          Google no build). Baixe a pasta e use "Importar pasta do SISTRUT".
        </p>
      )}
      <Dialog open={aberto} onOpenChange={(a) => (a ? setAberto(true) : fechar())}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
          onInteractOutside={(e) => {
            if (!doApp(e.target)) e.preventDefault();
          }}
          onCloseAutoFocus={() => {
            aoSair.current?.();
            aoSair.current = null;
          }}
        >
          <DialogHeader>
            <DialogTitle>Importar do Google Drive</DialogTitle>
            <DialogDescription>
              Cole o link da pasta da obra (ou de um arquivo) ou marque os arquivos no seu Drive. Os
              arquivos vão do Google direto para este navegador; nada passa por servidor do
              OpenStrut, e a obra fica só aqui.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void abrirLink(e)} noValidate className="grid gap-2">
            <label htmlFor="link-drive" className="text-sm font-medium">
              Link da pasta ou do arquivo no Drive
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="link-drive"
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="https://drive.google.com/drive/folders/…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                disabled={ocupado}
              />
              <Button type="submit" disabled={ocupado || !link.trim()}>
                Abrir link
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Pasta compartilhada como "qualquer pessoa com o link" abre sem login.
            </p>
          </form>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => escolher({})} disabled={!podeEntrar}>
              {gis === "pronto"
                ? "Escolher no Drive"
                : gis === "carregando"
                  ? "Carregando o login do Google…"
                  : "O login do Google não carregou"}
            </Button>
            <p className="text-muted-foreground text-xs">
              Pede login no Google. O app recebe acesso só aos arquivos que você marcar na janela do
              Drive (permissão "drive.file"); ele não vê o resto do seu Drive. Abra a pasta da obra
              e marque todos os arquivos dela. O acesso fica na memória desta página, não é gravado
              e expira em até 1 hora.
            </p>
          </div>
          {marcados.length > 0 && (
            <Marcados
              marcados={marcados}
              ocupado={!podeEntrar}
              aoMarcarMais={() => escolher({})}
              aoImportar={() => void importarMarcados()}
              aoLimpar={() => setMarcados([])}
            />
          )}
          <Situacao etapa={etapa} podeEntrar={podeEntrar} aoEntrar={(onde) => escolher(onde)} />
          <DialogFooter>
            <Button variant="ghost" onClick={fechar}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Os arquivos marcados no Picker até agora, por pasta, com importar e marcar mais. */
function Marcados({
  marcados,
  ocupado,
  aoMarcarMais,
  aoImportar,
  aoLimpar,
}: {
  marcados: readonly EscolhidoNoPicker[];
  ocupado: boolean;
  aoMarcarMais: () => void;
  aoImportar: () => void;
  aoLimpar: () => void;
}) {
  const porPasta = new Map<string, EscolhidoNoPicker[]>();
  for (const m of comPastas(marcados)) porPasta.set(m.pasta, [...(porPasta.get(m.pasta) ?? []), m]);
  return (
    <section aria-label="Arquivos marcados no Drive" className="grid gap-2 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide">
        {marcados.length === 1 ? "1 arquivo marcado" : `${marcados.length} arquivos marcados`}
      </h3>
      <ul className="text-xs">
        {[...porPasta].map(([pasta, itens]) => (
          <li key={pasta}>
            {pasta && <span className="font-medium">{pasta}: </span>}
            {itens.map((i) => i.name).join(", ")}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Os parâmetros (.DSP, .PIP, .INI) estão em outra pasta, como a EXEC40? Marque-os também.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={aoImportar} disabled={ocupado}>
          Importar os arquivos marcados
        </Button>
        <Button variant="outline" onClick={aoMarcarMais} disabled={ocupado}>
          Marcar arquivos de outra pasta
        </Button>
        <Button variant="ghost" onClick={aoLimpar} disabled={ocupado}>
          Limpar
        </Button>
      </div>
    </section>
  );
}

/** O andamento ou o problema da etapa atual, com a ação que resolve. */
function Situacao({
  etapa,
  podeEntrar,
  aoEntrar,
}: {
  etapa: Etapa;
  podeEntrar: boolean;
  aoEntrar: (onde: Onde) => void;
}) {
  switch (etapa.tipo) {
    case "inicio":
      return null;
    case "ocupado":
      return (
        <p role="status" className="text-sm">
          {etapa.texto}
        </p>
      );
    case "erro":
      return (
        <p role="alert" className="text-destructive text-sm">
          {etapa.mensagem}
        </p>
      );
    case "login":
      return (
        <section aria-label="O Drive pede login" className="grid gap-2 text-sm">
          <p role="alert">{etapa.mensagem}</p>
          <p className="text-muted-foreground text-xs">
            {etapa.onde.arquivo
              ? "A janela do Drive mostra o arquivo do link: marque-o e toque em Selecionar."
              : etapa.onde.pasta
                ? "A janela do Drive abre nesta pasta: marque todos os arquivos da obra e toque em Selecionar. Marcar só a pasta não basta."
                : "Na janela do Drive, abra a pasta da obra, marque todos os arquivos e toque em Selecionar."}
          </p>
          <Button onClick={() => aoEntrar(etapa.onde)} disabled={!podeEntrar}>
            Entrar com Google e marcar os arquivos
          </Button>
        </section>
      );
  }
}

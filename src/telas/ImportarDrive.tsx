// A opção "Importar do Google Drive" da importação de obra do SISTRUT: colar o link de
// uma pasta (ou de um arquivo) ou escolher no Drive pelo Google Picker. A listagem vira a
// mesma lista de arquivos com caminho que a pasta do disco dá, e a tela de importação
// (ImportarSistrut.tsx) segue igual: pergunta a subpasta e o .DSP, baixa só o que a
// importação lê e mostra o resumo.
//
// O link tenta primeiro sem login, só com a API key (pasta pública, "qualquer pessoa com o
// link"). Se o Google responde 403/404, a tela pede para entrar: o login usa drive.file,
// e o Picker abre já na pasta do link para o usuário confirmar a escolha (com drive.file o
// app só lê o que o usuário escolhe no Picker; ver drive/google.ts). Se o Google der
// acesso só à pasta e não aos arquivos dela, a tela pede para marcar os arquivos.
import { CloudDownload } from "lucide-react";
import { useState, type FormEvent } from "react";
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
  lerAlvo,
  lerItens,
  limitador,
  pedeLogin,
  type AcessoDrive,
  type AlvoDrive,
  type ConteudoDrive,
  type ItemDrive,
} from "./drive/api";
import { configuracaoGoogle, entrar, escolherNoDrive, precarregar } from "./drive/google";
import type { Escolhido } from "./selecao";

const PASTA = "application/vnd.google-apps.folder";
/** Downloads em paralelo: poucos, para não engasgar a conexão do celular. */
const DOWNLOADS_JUNTOS = 4;

type Etapa =
  | { tipo: "inicio" }
  | { tipo: "lendo" }
  /** A pasta do link não abriu sem login. */
  | { tipo: "login"; alvo: AlvoDrive; mensagem: string }
  /** O Picker deu acesso só à pasta, não aos arquivos dentro dela. */
  | { tipo: "soPasta"; pasta: string }
  | { tipo: "erro"; mensagem: string };

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Os arquivos listados como a tela de importação os recebe: o conteúdo é baixado só
 *  quando lido, com no máximo DOWNLOADS_JUNTOS de cada vez. */
function escolhidosDo(conteudo: ConteudoDrive, acesso: AcessoDrive): Escolhido[] {
  const limite = limitador(DOWNLOADS_JUNTOS);
  return conteudo.arquivos.map((a) => ({
    nome: a.nome,
    caminho: a.caminho,
    ler: (signal) => limite(() => baixarArquivo(a, acesso, fetch, signal)),
  }));
}

/** Botão e diálogo do Drive. `aoEscolher` recebe os arquivos e as notas (atalhos,
 *  documentos do Google) para a importação seguir como numa pasta do disco. */
export function ImportarDrive({
  desabilitado,
  aoEscolher,
}: {
  desabilitado: boolean;
  aoEscolher: (escolhidos: Escolhido[], notas: string[]) => void;
}) {
  const config = configuracaoGoogle();
  const [aberto, setAberto] = useState(false);
  const [link, setLink] = useState("");
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "inicio" });

  const abrir = () => {
    precarregar();
    setEtapa({ tipo: "inicio" });
    setAberto(true);
  };

  /** Entrega o que foi lido à importação e fecha. */
  const entregar = (conteudo: ConteudoDrive, acesso: AcessoDrive) => {
    if (conteudo.arquivos.length === 0) {
      setEtapa({
        tipo: "erro",
        mensagem: [
          "Não há arquivos comuns aqui: a pasta está vazia ou só tem documentos do Google.",
          ...conteudo.notas,
        ].join(" "),
      });
      return;
    }
    setAberto(false);
    setLink("");
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
    setEtapa({ tipo: "lendo" });
    const acesso = { apiKey: config.apiKey };
    try {
      entregar(await lerAlvo(alvo, acesso), acesso);
    } catch (erro) {
      setEtapa(
        pedeLogin(erro)
          ? { tipo: "login", alvo, mensagem: mensagemDe(erro) }
          : { tipo: "erro", mensagem: mensagemDe(erro) },
      );
    }
  };

  /** Entra (popup do Google, no clique) e abre o Picker; lê o que o usuário escolher. */
  const escolher = async (onde: { pasta?: string } = {}) => {
    if (!config) return;
    let token: string;
    let itens: ItemDrive[] | undefined;
    try {
      token = await entrar(config.clientId);
      // o Picker fica por cima da página: o diálogo (modal) sai da frente enquanto isso
      setAberto(false);
      itens = await escolherNoDrive(config, token, onde);
    } catch (erro) {
      setAberto(true);
      setEtapa({ tipo: "erro", mensagem: mensagemDe(erro) });
      return;
    }
    setAberto(true);
    if (!itens) return; // cancelou no Picker: volta ao diálogo como estava
    setEtapa({ tipo: "lendo" });
    const acesso = { apiKey: config.apiKey, token };
    try {
      const conteudo = await lerItens(itens, acesso);
      const pasta = itens.find((i) => i.mimeType === PASTA);
      if (conteudo.arquivos.length === 0 && pasta) {
        setEtapa({ tipo: "soPasta", pasta: pasta.id });
        return;
      }
      entregar(conteudo, acesso);
    } catch (erro) {
      setEtapa({ tipo: "erro", mensagem: mensagemDe(erro) });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={abrir}
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
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar do Google Drive</DialogTitle>
            <DialogDescription>
              Cole o link da pasta da obra (ou de um arquivo) ou escolha no seu Drive. Os arquivos
              vão do Google direto para este navegador; nada passa por servidor do OpenStrut, e a
              obra fica só aqui.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void abrirLink(e)} className="grid gap-2">
            <label htmlFor="link-drive" className="text-sm font-medium">
              Link da pasta ou do arquivo no Drive
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="link-drive"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://drive.google.com/drive/folders/…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                disabled={etapa.tipo === "lendo"}
              />
              <Button type="submit" disabled={etapa.tipo === "lendo" || !link.trim()}>
                Abrir link
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Pasta compartilhada como "qualquer pessoa com o link" abre sem login.
            </p>
          </form>
          <div className="grid gap-2">
            <Button
              variant="outline"
              onClick={() => void escolher()}
              disabled={etapa.tipo === "lendo"}
            >
              Escolher no Drive
            </Button>
            <p className="text-muted-foreground text-xs">
              Pede login no Google. O app recebe acesso só ao que você escolher na janela do Drive
              (permissão "drive.file"); ele não vê o resto do seu Drive. O acesso fica na memória
              desta página, não é gravado e expira em até 1 hora.
            </p>
          </div>
          <Situacao etapa={etapa} aoEscolher={(pasta) => void escolher({ pasta })} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** O andamento ou o problema da etapa atual, com a ação que resolve. */
function Situacao({ etapa, aoEscolher }: { etapa: Etapa; aoEscolher: (pasta: string) => void }) {
  switch (etapa.tipo) {
    case "inicio":
      return null;
    case "lendo":
      return (
        <p role="status" className="text-sm">
          Lendo a pasta no Google Drive…
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
        <section aria-label="A pasta pede login" className="grid gap-2 text-sm">
          <p role="alert">{etapa.mensagem}</p>
          <p className="text-muted-foreground text-xs">
            A janela do Drive abre nesta pasta: marque a pasta (ou os arquivos da obra) e toque em
            Selecionar.
          </p>
          <Button onClick={() => aoEscolher(etapa.alvo.id)}>
            Entrar com Google e escolher a pasta
          </Button>
        </section>
      );
    case "soPasta":
      return (
        <section aria-label="Escolha os arquivos" className="grid gap-2 text-sm">
          <p role="alert">
            O Google deu acesso só à pasta, não aos arquivos dentro dela. Abra a pasta e marque os
            arquivos da obra (dá para marcar vários).
          </p>
          <Button onClick={() => aoEscolher(etapa.pasta)}>Escolher os arquivos</Button>
        </section>
      );
  }
}

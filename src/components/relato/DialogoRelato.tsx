// Diálogo do relato de problema: prévia do print, os campos do relato, o diagnóstico e
// o texto exato que vai sair. Nada é enviado antes do botão de confirmar. Sem relay
// (VITE_RELATO_URL ausente) abre a issue no GitHub; com relay, envia direto ou guarda na
// fila quando falta rede. O arquivo do relato (zip) serve nos dois casos.
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { Label } from "@/components/ui/label";
import { serializarObra } from "../../armazenamento/arquivo";
import type { Obra } from "../../dominio/obra";
import {
  abrirNoGithub,
  baixarObra,
  type DadosRelato,
  enviarPeloRelay,
  relatoParaRelay,
  salvarArquivo,
  urlGithub,
  zipDaFila,
} from "./acoes";
import { baixar, nomesRelato } from "./arquivos";
import { AreaTexto, Marcar } from "./campos";
import { REPOSITORIO } from "./corpoIssue";
import type { Diagnostico } from "./diagnostico";
import { listarFila, type RelatoNaFila, removerDaFila } from "./fila";
import { type Caminho, caminhoRelato } from "./relay";

/** O que foi capturado no clique do botão: o print, o diagnóstico e a obra daquele instante. */
export interface Captura {
  print: Blob | null;
  diagnostico: Diagnostico;
  obra: Obra | null;
  agora: Date;
}

type Fase =
  | { tipo: "editando"; erro?: string }
  | { tipo: "enviando" }
  | { tipo: "github"; url: string; cortado: boolean; copiado: boolean; bloqueado: boolean }
  | { tipo: "enviado"; numero: number; url: string }
  | { tipo: "fila"; motivo: string };

/** Teto do arquivo da obra no relay (relato-worker/src/validar.ts). */
const LIMITE_OBRA_RELAY = 2 * 1024 * 1024;

const kB = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} kB`;

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const mudar = () => setOnline(navigator.onLine);
    window.addEventListener("online", mudar);
    window.addEventListener("offline", mudar);
    return () => {
      window.removeEventListener("online", mudar);
      window.removeEventListener("offline", mudar);
    };
  }, []);
  return online;
}

/** URL de objeto para a prévia, liberada quando o blob muda ou o diálogo fecha. */
function useUrlObjeto(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return blob ? url : null;
}

export function DialogoRelato({
  captura,
  aoFechar,
  caminho = caminhoRelato(),
}: {
  captura: Captura;
  aoFechar: () => void;
  caminho?: Caminho;
}) {
  const { print, diagnostico, obra, agora } = captura;
  const [aconteceu, setAconteceu] = useState("");
  const [esperado, setEsperado] = useState("");
  const [email, setEmail] = useState("");
  const [comPrint, setComPrint] = useState(print !== null);
  const [comObra, setComObra] = useState(obra !== null);
  const [fase, setFase] = useState<Fase>({ tipo: "editando" });
  const online = useOnline();
  const urlPrint = useUrlObjeto(print);
  const jsonObra = useMemo(() => (obra ? serializarObra(obra) : null), [obra]);
  const tamanhoObra = useMemo(() => (jsonObra ? new Blob([jsonObra]).size : 0), [jsonObra]);
  const relay = caminho.tipo === "relay";
  // o relay recusa obra maior que isso; o arquivo do relato leva qualquer tamanho
  const obraGrande = relay && tamanhoObra > LIMITE_OBRA_RELAY;
  const anexaObra = comObra && !obraGrande;

  const dados = useMemo<DadosRelato>(
    () => ({
      texto: { aconteceu, esperado, email },
      diagnostico,
      print: comPrint ? print : null,
      obra: anexaObra && obra && jsonObra ? { nome: obra.nome, json: jsonObra } : null,
      agora,
    }),
    [aconteceu, esperado, email, diagnostico, comPrint, print, anexaObra, obra, jsonObra, agora],
  );
  const nomes = nomesRelato(agora, obra?.nome ?? null);
  const vazio = aconteceu.trim() === "";

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (vazio || fase.tipo === "enviando") return;
    if (caminho.tipo === "github") {
      setFase({ tipo: "github", ...(await abrirNoGithub(dados)) });
      return;
    }
    setFase({ tipo: "enviando" });
    const r = await enviarPeloRelay(caminho.url, dados);
    setFase(r.tipo === "recusado" ? { tipo: "editando", erro: r.mensagem } : r);
  }

  const final = fase.tipo === "github" || fase.tipo === "enviado" || fase.tipo === "fila";

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] gap-3 overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Relatar problema</DialogTitle>
          <DialogDescription>
            Conte o que aconteceu. Abaixo está tudo o que vai junto; nada é enviado antes de você
            confirmar.
          </DialogDescription>
        </DialogHeader>

        <AvisoCaminho caminho={caminho} online={online} />

        {final ? (
          <Resultado fase={fase} dados={dados} nomes={nomes} aoFechar={aoFechar} />
        ) : (
          <form className="grid gap-3" onSubmit={(e) => void confirmar(e)}>
            <section aria-label="Print da tela" className="grid gap-1">
              {urlPrint ? (
                <img
                  src={urlPrint}
                  alt="Print da tela no momento do clique"
                  className={`max-h-56 w-full rounded-md border bg-muted object-contain object-top ${comPrint ? "" : "opacity-25"}`}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {print ? "Preparando a prévia…" : "Não foi possível capturar a tela."}
                </p>
              )}
              {print && (
                <Marcar
                  marcado={comPrint}
                  aoMudar={setComPrint}
                  apoio={`PNG, ${kB(print.size)}. O print vai para a issue pública.`}
                >
                  Anexar o print
                </Marcar>
              )}
            </section>

            <div className="grid gap-1">
              <Label htmlFor="relato-aconteceu">O que aconteceu</Label>
              <AreaTexto
                id="relato-aconteceu"
                required
                autoFocus
                maxLength={5000}
                value={aconteceu}
                onChange={(e) => setAconteceu(e.target.value)}
                placeholder="Ex.: ao calcular a viga V3, o momento saiu negativo no tramo 2."
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="relato-esperado">O que esperava</Label>
              <AreaTexto
                id="relato-esperado"
                maxLength={5000}
                value={esperado}
                onChange={(e) => setEsperado(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="relato-email">E-mail para contato (opcional)</Label>
              <Input
                id="relato-email"
                type="email"
                maxLength={200}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {relay
                  ? "Não aparece na issue pública: fica só com os desenvolvedores, para responder."
                  : "Aparece na issue, que é pública. Como o GitHub já identifica sua conta, pode deixar em branco."}
              </p>
            </div>

            {obra && jsonObra && (
              <Marcar
                marcado={anexaObra}
                aoMudar={setComObra}
                disabled={obraGrande}
                apoio={
                  obraGrande
                    ? "A obra passa de 2 MiB e não cabe no envio direto. Use “Salvar arquivo do relato”."
                    : "Os dados da obra vão para uma issue pública no GitHub: qualquer pessoa pode ver."
                }
              >
                Anexar a obra ({nomes.obra}, {kB(tamanhoObra)})
              </Marcar>
            )}

            <SecaoDiagnostico diagnostico={diagnostico} />
            <TextoExato caminho={caminho} dados={dados} />
            {relay && <FilaRelatos />}

            {fase.tipo === "editando" && fase.erro && (
              <p role="alert" className="text-sm text-destructive">
                O relato não foi aceito: {fase.erro}
              </p>
            )}
            {!relay && !online && (
              <p role="status" className="text-sm text-aviso">
                Sem internet, o GitHub não abre. Salve o arquivo do relato e envie quando tiver
                conexão.
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void salvarArquivo({
                    ...dados,
                    obra: comObra && obra && jsonObra ? { nome: obra.nome, json: jsonObra } : null,
                  })
                }
              >
                Salvar arquivo do relato
              </Button>
              <Button type="button" variant="ghost" onClick={aoFechar}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={vazio || fase.tipo === "enviando" || (!relay && !online)}
              >
                {relay
                  ? fase.tipo === "enviando"
                    ? "Enviando…"
                    : online
                      ? "Enviar relato"
                      : "Guardar e enviar depois"
                  : "Abrir issue no GitHub"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AvisoCaminho({ caminho, online }: { caminho: Caminho; online: boolean }) {
  return (
    <p
      className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
      data-caminho={caminho.tipo}
    >
      {caminho.tipo === "github" ? (
        <>
          <strong>Envio pelo GitHub:</strong> abre a página de nova issue em github.com/
          {REPOSITORIO}, já preenchida. Precisa de conta no GitHub; sem conta, use “Salvar arquivo
          do relato” e mande o arquivo por e-mail.
        </>
      ) : (
        <>
          <strong>Envio direto, sem conta:</strong> o relato vira uma issue pública em github.com/
          {REPOSITORIO}.
          {online
            ? ""
            : " Sem internet agora: o relato fica guardado e sai sozinho quando a conexão voltar."}
        </>
      )}
    </p>
  );
}

function SecaoDiagnostico({ diagnostico }: { diagnostico: Diagnostico }) {
  return (
    <section aria-labelledby="relato-diag" className="grid gap-1 rounded-md border p-3">
      <h3 id="relato-diag" className="text-sm font-medium">
        Diagnóstico que vai junto
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {diagnostico.itens.map((i) => (
          <div key={i.rotulo} className="contents">
            <dt className="text-muted-foreground">{i.rotulo}</dt>
            <dd className="break-all">{i.valor}</dd>
          </div>
        ))}
      </dl>
      {diagnostico.erros.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum erro registrado no console.</p>
      ) : (
        <details className="text-xs">
          <summary className="cursor-pointer">
            Últimos erros do console ({diagnostico.erros.length})
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto text-[11px] whitespace-pre-wrap">
            {diagnostico.erros.join("\n\n")}
          </pre>
        </details>
      )}
    </section>
  );
}

/** O texto exato que sai: o corpo da URL do GitHub ou o JSON enviado ao relay. */
function TextoExato({ caminho, dados }: { caminho: Caminho; dados: DadosRelato }) {
  const [aberto, setAberto] = useState(false);
  const [relay, setRelay] = useState("");
  const github = useMemo(() => {
    if (!aberto || caminho.tipo !== "github") return null;
    const { url, cortado } = urlGithub(dados);
    const q = new URL(url).searchParams;
    return { texto: `${q.get("title")}\n\n${q.get("body")}`, cortado };
  }, [aberto, caminho.tipo, dados]);
  useEffect(() => {
    if (!aberto || caminho.tipo !== "relay") return;
    let vivo = true;
    void relatoParaRelay(dados).then((r) => {
      const resumo = {
        ...r,
        ...(r.print ? { print: `[PNG em base64, ${kB((r.print.length * 3) / 4)}]` } : {}),
        ...(r.obra
          ? { obra: { nome: r.obra.nome, json: `[JSON, ${kB(r.obra.json.length)}]` } }
          : {}),
      };
      if (vivo) setRelay(JSON.stringify(resumo, null, 2));
    });
    return () => {
      vivo = false;
    };
  }, [aberto, caminho.tipo, dados]);

  return (
    <details className="text-xs" onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className="cursor-pointer">Ver o texto exato que vai sair</summary>
      {github?.cortado && (
        <p className="mt-1 text-aviso">O texto passou do limite do link e foi encurtado.</p>
      )}
      <pre
        data-testid="relato-texto-exato"
        className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] whitespace-pre-wrap"
      >
        {github?.texto ?? relay}
      </pre>
    </details>
  );
}

/** Relatos guardados neste aparelho (caminho com relay). */
function FilaRelatos() {
  const [itens, setItens] = useState<RelatoNaFila[]>([]);
  const recarregar = () => void listarFila().then(setItens);
  useEffect(recarregar, []);
  if (itens.length === 0) return null;
  return (
    <section className="grid gap-1 rounded-md border p-3 text-xs" aria-label="Relatos guardados">
      <p>
        {itens.length} relato(s) guardado(s) neste aparelho, aguardando envio. Eles saem sozinhos
        quando há conexão.
      </p>
      {itens
        .filter((i) => i.recusado)
        .map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-2">
            <span>
              “{i.relato.titulo}” não foi aceito ({i.recusado}).
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const z = zipDaFila(i);
                baixar(z.blob, z.nome);
              }}
            >
              Baixar arquivo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void removerDaFila(i.id).then(recarregar)}
            >
              Descartar
            </Button>
          </div>
        ))}
    </section>
  );
}

function Resultado({
  fase,
  dados,
  nomes,
  aoFechar,
}: {
  fase: Fase;
  dados: DadosRelato;
  nomes: ReturnType<typeof nomesRelato>;
  aoFechar: () => void;
}) {
  return (
    <div className="grid gap-3 text-sm" role="status">
      {fase.tipo === "github" && (
        <>
          <p>
            {fase.bloqueado
              ? "O navegador bloqueou a nova aba. Abra a issue pelo link:"
              : "A página de nova issue abriu numa nova aba."}{" "}
            <a href={fase.url} target="_blank" rel="noreferrer" className="text-primary underline">
              Abrir a issue no GitHub
            </a>
          </p>
          <ol className="grid list-decimal gap-1 pl-5">
            {dados.print && (
              <li>
                {fase.copiado
                  ? "O print está na área de transferência: na issue, clique no texto e cole (Ctrl+V)."
                  : `Não deu para copiar o print; arraste para a issue o arquivo ${nomes.print}.`}{" "}
                Ele também foi baixado como {nomes.print}.
              </li>
            )}
            {dados.obra && (
              <li>
                <Button type="button" size="sm" variant="outline" onClick={() => baixarObra(dados)}>
                  Baixar a obra
                </Button>{" "}
                e arraste o arquivo {nomes.obra} para a issue.
              </li>
            )}
            {fase.cortado && (
              <li>O texto ficou longo para o link e foi encurtado; complete na issue.</li>
            )}
            <li>Confira e clique em “Submit new issue” no GitHub.</li>
          </ol>
        </>
      )}
      {fase.tipo === "enviado" && (
        <p>
          Relato enviado: issue{" "}
          <a href={fase.url} target="_blank" rel="noreferrer" className="text-primary underline">
            #{fase.numero}
          </a>
          . Obrigado!
        </p>
      )}
      {fase.tipo === "fila" && (
        <p>
          O relato não saiu agora ({fase.motivo}). Ele ficou guardado neste aparelho e será enviado
          quando a conexão voltar.
        </p>
      )}
      <DialogFooter>
        <Button type="button" onClick={aoFechar}>
          Fechar
        </Button>
      </DialogFooter>
    </div>
  );
}

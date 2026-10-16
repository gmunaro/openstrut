// Peças dos editores dos dados do SISTRUT (NB-1/78): o diálogo com abas e o botão
// Aplicar, campos de formulário (texto controlado, gravado só no Aplicar), escolha,
// tabela editável e a marca dos campos que só valem no modo "Como o SISTRUT original".
// O formulário guarda textos; quem monta a obra os lê com o Leitor de formulario.ts.
import { Plus, Trash2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Obra } from "../../../dominio/obra";
import { useObra } from "../../../estado/obra";
import { type LinhaForm, problemasNoArquivo, type TriEstado } from "./formulario";

/** Texto da marca: entra no nome acessível do campo. */
export const SO_ORIGINAL = "só no modo original";

/** Marca de campo que só vale no modo "Como o SISTRUT original". */
export function MarcaOriginal() {
  // o espaço antes separa a marca do rótulo no nome acessível
  return (
    <>
      {" "}
      <span className="border-aviso/60 text-aviso ml-1 rounded border px-1 py-px text-[10px] font-medium whitespace-nowrap">
        {SO_ORIGINAL}
      </span>
    </>
  );
}

/** Diálogo de um editor: o `gatilho` abre (e recebe o foco de volta ao fechar). O
 *  conteúdo só existe aberto, então o formulário recomeça com os valores da obra. */
export function DialogoEditor({
  gatilho,
  titulo,
  descricao,
  aberto,
  aoMudarAberto,
  children,
}: {
  gatilho: ReactNode;
  titulo: string;
  descricao: ReactNode;
  aberto: boolean;
  aoMudarAberto: (a: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogTrigger asChild>{gatilho}</DialogTrigger>
      <DialogContent className="max-h-[94vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-5 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className="text-xs">{descricao}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Aplica a edição de um formulário numa entrada só do desfazer. `montar` recebe a obra
 * atual e devolve a obra editada ou a lista de problemas; a obra passa ainda pelo leitor
 * do arquivo. Sem problemas, grava e chama `fechar`.
 */
export function useAplicar(fechar: () => void) {
  const editar = useObra((e) => e.editar);
  const [erros, setErros] = useState<string[]>([]);
  const aplicar = (montar: (obra: Obra) => Obra | string[]) => {
    const atual = useObra.getState().obra;
    if (!atual) return;
    const r = montar(atual);
    if (Array.isArray(r)) return setErros(r);
    const problemas = problemasNoArquivo(r);
    if (problemas.length > 0) return setErros(problemas);
    setErros([]);
    editar(() => r);
    fechar();
  };
  return { erros, aplicar };
}

/** Problemas do formulário e os botões Cancelar e Aplicar. */
export function RodapeEditor({
  erros,
  aoCancelar,
  aoAplicar,
}: {
  erros: string[];
  aoCancelar: () => void;
  aoAplicar: () => void;
}) {
  return (
    <div className="grid gap-2 border-t pt-3">
      {erros.length > 0 && (
        <div role="alert" className="text-destructive max-h-28 overflow-y-auto text-xs">
          <p className="font-medium">Não foi possível aplicar:</p>
          <ul className="list-disc pl-4">
            {erros.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={aoCancelar}>
          Cancelar
        </Button>
        <Button onClick={aoAplicar}>Aplicar</Button>
      </DialogFooter>
    </div>
  );
}

/** Grupo de campos com título; `extra` é a nota ao lado do título. */
export function Grupo({
  titulo,
  extra,
  original = false,
  children,
  className,
}: {
  titulo: string;
  extra?: ReactNode;
  original?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("grid gap-2 rounded-md border p-3", className)}>
      <legend className="px-1 text-xs font-semibold">
        {titulo}
        {original && <MarcaOriginal />}
      </legend>
      {extra && <p className="text-muted-foreground -mt-1 text-xs">{extra}</p>}
      {children}
    </fieldset>
  );
}

/** Rótulo de campo: texto, unidade e a marca do modo original. */
function Rotulo({
  id,
  rotulo,
  unidade,
  original,
}: {
  id: string;
  rotulo: string;
  unidade?: string | undefined;
  original?: boolean | undefined;
}) {
  return (
    <label htmlFor={id} className="text-xs">
      {rotulo}
      {unidade && <span className="text-muted-foreground"> ({unidade})</span>}
      {original && <MarcaOriginal />}
    </label>
  );
}

/** Campo de formulário (texto controlado). `padrao` aparece apagado quando vazio. */
export function CampoForm({
  rotulo,
  unidade,
  valor,
  aoMudar,
  padrao,
  original,
  numerico = true,
  className,
}: {
  rotulo: string;
  unidade?: string;
  valor: string;
  aoMudar: (v: string) => void;
  padrao?: string;
  original?: boolean;
  numerico?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("grid content-start gap-1", className)}>
      <Rotulo id={id} rotulo={rotulo} unidade={unidade} original={original} />
      <Input
        id={id}
        value={valor}
        placeholder={padrao}
        inputMode={numerico ? "decimal" : undefined}
        onChange={(e) => aoMudar(e.target.value)}
        className={cn(
          "h-7 px-2 text-sm",
          numerico && "text-right font-mono tabular-nums placeholder:font-sans",
        )}
      />
    </div>
  );
}

export interface OpcaoEscolha<T extends string> {
  valor: T;
  rotulo: string;
}

/** Escolha entre opções (select nativo, que o teclado e o leitor de tela já conhecem). */
export function Escolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  original,
  unidade,
  className,
}: {
  rotulo: string;
  valor: T;
  opcoes: readonly OpcaoEscolha<T>[];
  aoMudar: (v: T) => void;
  original?: boolean;
  unidade?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("grid content-start gap-1", className)}>
      <Rotulo id={id} rotulo={rotulo} unidade={unidade} original={original} />
      <select
        id={id}
        value={valor}
        onChange={(e) => {
          const o = opcoes.find((x) => x.valor === e.target.value);
          if (o) aoMudar(o.valor);
        }}
        className="border-input dark:bg-input/30 h-7 rounded-md border bg-transparent px-1.5 text-sm"
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-background">
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Opções de um booleano opcional, com o padrão escrito. */
export const opcoesTri = (padrao: boolean, sim = "sim", nao = "não") =>
  [
    { valor: "padrao", rotulo: `padrão (${padrao ? sim : nao})` },
    { valor: "sim", rotulo: sim },
    { valor: "nao", rotulo: nao },
  ] as const satisfies readonly OpcaoEscolha<TriEstado>[];

/** Coluna de tabela editável: número (padrão), texto ou escolha. */
export interface Coluna<C extends string> {
  chave: C;
  rotulo: string;
  unidade?: string;
  tipo?: "numero" | "texto" | readonly OpcaoEscolha<string>[];
  original?: boolean;
  /** Classe de largura do campo (padrão w-20). */
  largura?: string;
}

/**
 * Tabela de linhas editáveis (cargas, seções, barras). Cada campo tem nome acessível
 * "<linha>, <coluna>". Com `novaLinha`, acrescenta e remove linhas (até `maximo`); sem ela,
 * o tamanho é fixo (as tabelas de parâmetros).
 */
export function TabelaEditavel<C extends string>({
  titulo,
  colunas,
  linhas,
  aoMudar,
  novaLinha,
  rotuloLinha = (i) => `Linha ${i + 1}`,
  maximo,
  vazio = "Nenhuma.",
}: {
  titulo: string;
  colunas: readonly Coluna<C>[];
  linhas: readonly LinhaForm<C>[];
  aoMudar: (l: LinhaForm<C>[]) => void;
  novaLinha?: () => LinhaForm<C>;
  rotuloLinha?: (i: number) => string;
  maximo?: number;
  vazio?: string;
}) {
  const muda = (i: number, c: C, v: string) =>
    aoMudar(linhas.map((l, k) => (k === i ? { ...l, [c]: v } : l)));
  const cheia = maximo !== undefined && linhas.length >= maximo;
  return (
    <div role="group" aria-label={titulo} className="grid gap-1">
      {linhas.length === 0 ? (
        <p className="text-muted-foreground text-xs">{vazio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pr-2 text-left font-medium">
                  <span className="sr-only">Linha</span>
                </th>
                {colunas.map((c) => (
                  <th key={c.chave} className="px-1 pb-1 text-left align-bottom font-medium">
                    {c.rotulo}
                    {c.unidade && <span className="block font-normal">{c.unidade}</span>}
                    {c.original && <MarcaOriginal />}
                  </th>
                ))}
                {novaLinha && (
                  <th>
                    <span className="sr-only">Remover</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  <th scope="row" className="pr-2 text-left font-normal whitespace-nowrap">
                    {rotuloLinha(i)}
                  </th>
                  {colunas.map((c) => (
                    <td key={c.chave} className="px-1 py-0.5">
                      <CelulaEditavel
                        coluna={c}
                        valor={l[c.chave]}
                        rotulo={`${rotuloLinha(i)}, ${c.rotulo}`}
                        aoMudar={(v) => muda(i, c.chave, v)}
                      />
                    </td>
                  ))}
                  {novaLinha && (
                    <td className="pl-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remover ${rotuloLinha(i)}`}
                        title="Remover"
                        onClick={() => aoMudar(linhas.filter((_, k) => k !== i))}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {novaLinha && (
        <div>
          <Button
            variant="outline"
            size="xs"
            disabled={cheia}
            aria-label={`Acrescentar em ${titulo}`}
            onClick={() => aoMudar([...linhas, novaLinha()])}
          >
            <Plus /> Acrescentar
          </Button>
          {cheia && <span className="text-muted-foreground ml-2 text-xs">no máximo {maximo}</span>}
        </div>
      )}
    </div>
  );
}

function CelulaEditavel<C extends string>({
  coluna,
  valor,
  rotulo,
  aoMudar,
}: {
  coluna: Coluna<C>;
  valor: string;
  rotulo: string;
  aoMudar: (v: string) => void;
}) {
  const tipo = coluna.tipo ?? "numero";
  if (typeof tipo !== "string")
    return (
      <select
        aria-label={rotulo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="border-input dark:bg-input/30 h-7 rounded-md border bg-transparent pr-6 pl-1 text-xs"
      >
        {tipo.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-background">
            {o.rotulo}
          </option>
        ))}
      </select>
    );
  return (
    <Input
      aria-label={rotulo}
      value={valor}
      inputMode={tipo === "numero" ? "decimal" : undefined}
      onChange={(e) => aoMudar(e.target.value)}
      className={cn(
        "h-7 px-1.5 text-xs",
        coluna.largura ?? "w-20",
        tipo === "numero" && "text-right font-mono tabular-nums",
      )}
    />
  );
}

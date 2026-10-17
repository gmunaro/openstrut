// Importação de obra do SISTRUT na tela inicial: arquivos escolhidos de uma vez, a pasta
// inteira da obra ou arrastados (arquivos ou pastas). Antes de abrir, um diálogo mostra
// o que foi reconhecido: os pavimentos na ordem, os arquivos lidos e os ignorados com o
// motivo, e os avisos. A leitura é `importarObraSistrut` (InicioSistrut.ts).
//
// Cada arquivo leva o caminho dentro do que foi escolhido. Com arquivos do SISTRUT em
// mais de uma pasta (uma pasta de obras, por exemplo), a tela pergunta qual obra
// importar: juntar pastas misturaria obras, e nomes iguais em pastas diferentes não têm
// como ser escolhidos sozinhos. Só os arquivos que a importação lê vão para a memória.
import { FolderInput, Import } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Obra } from "../dominio/obra";
import {
  extensaoDoSistrut,
  extensaoLida,
  importarObraSistrut,
  type ArquivoEntrada,
  type ResultadoImportacaoSistrut,
} from "./InicioSistrut";

/** Um arquivo escolhido, com o caminho dentro da seleção ("OBRA/COB.LAJ"). */
interface Escolhido {
  arquivo: File;
  caminho: string;
}

/** Arquivos de uma entrada arrastada: o arquivo ou, numa pasta, todos os de dentro. Uma
 *  entrada que não abre vai para `falhas` e não derruba as outras. */
async function arquivosDaEntrada(entrada: FileSystemEntry, falhas: string[]): Promise<Escolhido[]> {
  const caminho = entrada.fullPath.replace(/^\//, "") || entrada.name;
  try {
    if (entrada.isFile) {
      const arquivo = await new Promise<File>((ok, falha) =>
        (entrada as FileSystemFileEntry).file(ok, falha),
      );
      return [{ arquivo, caminho }];
    }
    if (!entrada.isDirectory) return [];
    const leitor = (entrada as FileSystemDirectoryEntry).createReader();
    const filhos: FileSystemEntry[] = [];
    // readEntries devolve aos poucos: lê até vir vazio
    for (;;) {
      const lote = await new Promise<FileSystemEntry[]>((ok, falha) =>
        leitor.readEntries(ok, falha),
      );
      if (lote.length === 0) break;
      filhos.push(...lote);
    }
    return (await Promise.all(filhos.map((f) => arquivosDaEntrada(f, falhas)))).flat();
  } catch (erro) {
    falhas.push(`${caminho}: não foi possível ler (${String(erro)}).`);
    return [];
  }
}

/** Arquivos soltos na área: pelas entradas (pastas inteiras) ou pela lista de arquivos. */
async function arquivosSoltos(e: DragEvent, falhas: string[]): Promise<Escolhido[]> {
  const entradas = Array.from(e.dataTransfer.items ?? [])
    .map((i) => i.webkitGetAsEntry?.())
    .filter((x): x is FileSystemEntry => !!x);
  if (entradas.length === 0)
    return Array.from(e.dataTransfer.files).map((arquivo) => ({ arquivo, caminho: arquivo.name }));
  return (await Promise.all(entradas.map((x) => arquivosDaEntrada(x, falhas)))).flat();
}

const pastaDe = (caminho: string) => {
  const i = caminho.lastIndexOf("/");
  return i < 0 ? "" : caminho.slice(0, i);
};

/** As pastas com arquivos do SISTRUT, cada uma com os arquivos dela (sem subpastas). */
function porPasta(escolhidos: readonly Escolhido[]) {
  const pastas = new Map<string, Escolhido[]>();
  for (const e of escolhidos) {
    const p = pastaDe(e.caminho);
    pastas.set(p, [...(pastas.get(p) ?? []), e]);
  }
  return [...pastas]
    .map(([pasta, arquivos]) => ({
      pasta,
      arquivos,
      doSistrut: arquivos.filter((a) => extensaoDoSistrut(a.arquivo.name)).length,
    }))
    .filter((p) => p.doSistrut > 0)
    .sort((a, b) => (a.pasta < b.pasta ? -1 : a.pasta > b.pasta ? 1 : 0));
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const metros = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Botões, área de soltar e o diálogo de resumo. `aoAbrir` recebe a obra confirmada. */
export function ImportarSistrut({ aoAbrir }: { aoAbrir: (obra: Obra) => void }) {
  const entradaArquivos = useRef<HTMLInputElement>(null);
  const entradaPasta = useRef<HTMLInputElement>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoSistrut | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const [escolha, setEscolha] = useState<ReturnType<typeof porPasta> | null>(null);
  const [lendo, setLendo] = useState(false);
  const [sobre, setSobre] = useState(false);
  /** A leitura mais recente: o resultado de uma anterior que termina depois é descartado. */
  const leitura = useRef(0);

  /** Lê os arquivos de uma pasta e importa. */
  const importar = async (escolhidos: readonly Escolhido[], falhasAntes: string[]) => {
    const minha = ++leitura.current;
    setResultado(null);
    setEscolha(null);
    setFalhas(falhasAntes);
    setLendo(true);
    const falhasLeitura = [...falhasAntes];
    try {
      const lidos: ArquivoEntrada[] = await Promise.all(
        escolhidos.map(async ({ arquivo, caminho }) => {
          // o que a importação não lê só entra no resumo: não carrega o conteúdo
          if (!extensaoLida(arquivo.name))
            return { nome: arquivo.name, caminho, dados: new Uint8Array() };
          try {
            return {
              nome: arquivo.name,
              caminho,
              dados: new Uint8Array(await arquivo.arrayBuffer()),
            };
          } catch (erro) {
            falhasLeitura.push(`${caminho}: não foi possível ler (${String(erro)}).`);
            return undefined;
          }
        }),
      ).then((x) => x.filter((a) => a !== undefined));
      if (minha !== leitura.current) return;
      setFalhas(falhasLeitura);
      setResultado(importarObraSistrut(lidos));
    } finally {
      if (minha === leitura.current) setLendo(false);
    }
  };

  /** Com uma pasta só (ou nenhuma do SISTRUT), importa; com várias, pergunta qual. */
  const separar = (escolhidos: readonly Escolhido[], falhasAntes: string[]) => {
    if (escolhidos.length === 0 && falhasAntes.length === 0) return;
    const pastas = porPasta(escolhidos);
    if (pastas.length > 1) {
      setResultado(null);
      setFalhas(falhasAntes);
      setEscolha(pastas);
      return;
    }
    void importar(pastas[0]?.arquivos ?? escolhidos, falhasAntes);
  };

  const escolhidos = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []).map((arquivo) => ({
      arquivo,
      caminho: arquivo.webkitRelativePath || arquivo.name,
    }));
    e.target.value = ""; // permite escolher os mesmos arquivos de novo
    separar(arquivos, []);
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    if (lendo) return; // uma leitura de cada vez
    const falhasSoltos: string[] = [];
    void arquivosSoltos(e, falhasSoltos).then((x) => separar(x, falhasSoltos));
  };

  const fechar = () => {
    leitura.current++;
    setLendo(false);
    setResultado(null);
    setFalhas([]);
    setEscolha(null);
  };
  const aberto = resultado !== null || escolha !== null || (!lendo && falhas.length > 0);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => entradaArquivos.current?.click()}
        className="mt-2 w-full"
        title="Selecione de uma vez todos os arquivos da obra: os .LAJ, os .VIG, o .COL e os demais"
        disabled={lendo}
      >
        <Import /> Importar obra do SISTRUT
      </Button>
      <input
        ref={entradaArquivos}
        type="file"
        multiple
        aria-label="Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)"
        className="hidden"
        onChange={escolhidos}
      />
      <Button
        variant="outline"
        onClick={() => entradaPasta.current?.click()}
        className="mt-2 w-full"
        title="Selecione a pasta da obra: todos os arquivos dela entram"
        disabled={lendo}
      >
        <FolderInput /> Importar pasta do SISTRUT
      </Button>
      <input
        ref={entradaPasta}
        type="file"
        multiple
        {...{ webkitdirectory: "", directory: "" }}
        aria-label="Pasta da obra do SISTRUT"
        className="hidden"
        onChange={escolhidos}
      />
      <div
        role="region"
        aria-label="Soltar arquivos do SISTRUT"
        aria-busy={lendo}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = lendo ? "none" : "copy";
          setSobre(!lendo);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
        className={`text-muted-foreground mt-2 rounded-md border border-dashed p-3 text-center text-xs ${sobre ? "border-primary bg-primary/5" : ""}`}
      >
        {lendo
          ? "Lendo os arquivos…"
          : "Ou arraste para cá os arquivos ou a pasta da obra do SISTRUT"}
      </div>

      <Dialog open={aberto} onOpenChange={(a) => !a && fechar()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {escolha ? (
            <>
              <DialogHeader>
                <DialogTitle>Qual obra importar?</DialogTitle>
                <DialogDescription>
                  Há arquivos do SISTRUT em {escolha.length} pastas. Cada obra fica numa pasta:
                  escolha uma. As subpastas dela não entram.
                </DialogDescription>
              </DialogHeader>
              <ul aria-label="Pastas com arquivos do SISTRUT" className="grid gap-2">
                {escolha.map((p) => (
                  <li key={p.pasta}>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => void importar(p.arquivos, falhas)}
                    >
                      <span>{p.pasta || "(arquivos soltos)"}</span>
                      <span className="text-muted-foreground text-xs">
                        {plural(p.doSistrut, "arquivo do SISTRUT", "arquivos do SISTRUT")}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : resultado?.ok ? (
            <ResumoObra resultado={resultado} />
          ) : (
            <DialogHeader>
              <DialogTitle>Não foi possível importar a obra do SISTRUT</DialogTitle>
              <DialogDescription>Nada foi aberto. Veja o motivo abaixo.</DialogDescription>
            </DialogHeader>
          )}
          {!escolha && (falhas.length > 0 || (resultado && !resultado.ok)) && (
            <ul
              role="alert"
              className={`list-disc pl-5 text-sm ${resultado?.ok ? "text-aviso" : "text-destructive"}`}
            >
              {falhas.map((f, i) => (
                <li key={`f${i}`}>{f}</li>
              ))}
              {resultado && !resultado.ok && resultado.erros.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <DialogFooter>
            {resultado?.ok && !escolha && (
              <Button
                onClick={() => {
                  const { obra } = resultado;
                  fechar();
                  aoAbrir(obra);
                }}
              >
                Abrir obra importada
              </Button>
            )}
            <Button variant="ghost" onClick={fechar}>
              {resultado?.ok && !escolha ? "Cancelar" : "Voltar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** O que a importação reconheceu: pavimentos, arquivos e avisos. */
function ResumoObra({
  resultado,
}: {
  resultado: Extract<ResultadoImportacaoSistrut, { ok: true }>;
}) {
  const { obra, resumo } = resultado;
  // os ignorados já aparecem com o motivo na lista deles
  const motivos = new Set(resumo.ignorados.map((x) => x.motivo));
  const avisos = resultado.avisos.filter((a) => ![...motivos].some((m) => a.endsWith(`: ${m}`)));
  return (
    <>
      <DialogHeader>
        <DialogTitle>Obra {obra.nome} lida do SISTRUT</DialogTitle>
        <DialogDescription>
          {plural(resumo.pavimentos.length, "pavimento", "pavimentos")},{" "}
          {plural(resumo.lidos.length, "arquivo lido", "arquivos lidos")},{" "}
          {plural(resumo.ignorados.length, "ignorado", "ignorados")} e{" "}
          {plural(avisos.length, "aviso", "avisos")}. Confira antes de abrir.
        </DialogDescription>
      </DialogHeader>
      <section aria-label="Pavimentos importados">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide">
          Pavimentos, do topo para a base
        </h3>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-b">
              <th className="py-1 text-left font-medium">Pavimento</th>
              <th className="py-1 text-right font-medium">Pé-direito (m)</th>
              <th className="py-1 text-right font-medium">Lajes</th>
              <th className="py-1 text-right font-medium">Vigas</th>
              <th className="py-1 text-right font-medium">Pilares</th>
            </tr>
          </thead>
          <tbody>
            {resumo.pavimentos.map((p, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1">{p.nome}</td>
                <td className="py-1 text-right">{metros(p.peDireito)}</td>
                <td className="py-1 text-right">{p.lajes}</td>
                <td className="py-1 text-right">{p.vigas}</td>
                <td className="py-1 text-right">{p.pilares}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-label="Arquivos lidos" className="text-xs">
        <h3 className="mb-1 font-semibold uppercase tracking-wide">Lidos</h3>
        <p>{resumo.lidos.join(", ") || "nenhum"}</p>
      </section>
      {resumo.ignorados.length > 0 && (
        <section aria-label="Arquivos ignorados" className="text-xs">
          <h3 className="mb-1 font-semibold uppercase tracking-wide">Ignorados</h3>
          <ul className="list-disc pl-5">
            {resumo.ignorados.map((x, i) => (
              <li key={i}>
                <span className="font-medium">{x.arquivo}</span>: {x.motivo}
              </li>
            ))}
          </ul>
        </section>
      )}
      {avisos.length > 0 && (
        <section aria-label="Avisos da importação" className="text-xs">
          <h3 className="mb-1 font-semibold uppercase tracking-wide">Avisos</h3>
          <ul className="list-disc pl-5">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

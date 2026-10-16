// Importação de obra do SISTRUT na tela inicial: arquivos escolhidos de uma vez, a pasta
// inteira da obra ou arrastados (arquivos ou pastas). Antes de abrir, um diálogo mostra
// o que foi reconhecido: os pavimentos na ordem, os arquivos lidos e os ignorados com o
// motivo, e os avisos. A leitura é `importarObraSistrut` (InicioSistrut.ts).
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
  importarObraSistrut,
  type ArquivoEntrada,
  type ResultadoImportacaoSistrut,
} from "./InicioSistrut";

/** Arquivos de uma entrada arrastada: o arquivo ou, numa pasta, todos os de dentro. */
async function arquivosDaEntrada(entrada: FileSystemEntry): Promise<File[]> {
  if (entrada.isFile)
    return [
      await new Promise<File>((ok, falha) => (entrada as FileSystemFileEntry).file(ok, falha)),
    ];
  if (!entrada.isDirectory) return [];
  const leitor = (entrada as FileSystemDirectoryEntry).createReader();
  const filhos: FileSystemEntry[] = [];
  // readEntries devolve aos poucos: lê até vir vazio
  for (;;) {
    const lote = await new Promise<FileSystemEntry[]>((ok, falha) => leitor.readEntries(ok, falha));
    if (lote.length === 0) break;
    filhos.push(...lote);
  }
  return (await Promise.all(filhos.map(arquivosDaEntrada))).flat();
}

/** Arquivos soltos na área: pelas entradas (pastas inteiras) ou pela lista de arquivos. */
async function arquivosSoltos(e: DragEvent): Promise<File[]> {
  const entradas = Array.from(e.dataTransfer.items)
    .map((i) => i.webkitGetAsEntry?.())
    .filter((x): x is FileSystemEntry => !!x);
  if (entradas.length === 0) return Array.from(e.dataTransfer.files);
  return (await Promise.all(entradas.map(arquivosDaEntrada))).flat();
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const metros = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Botões, área de soltar e o diálogo de resumo. `aoAbrir` recebe a obra confirmada. */
export function ImportarSistrut({ aoAbrir }: { aoAbrir: (obra: Obra) => void }) {
  const entradaArquivos = useRef<HTMLInputElement>(null);
  const entradaPasta = useRef<HTMLInputElement>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoSistrut | null>(null);
  const [falhaLeitura, setFalhaLeitura] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [sobre, setSobre] = useState(false);

  const importar = async (arquivos: readonly File[]) => {
    setResultado(null);
    setFalhaLeitura(null);
    if (arquivos.length === 0) return;
    setLendo(true);
    try {
      const lidos: ArquivoEntrada[] = await Promise.all(
        arquivos.map(async (f) => ({ nome: f.name, dados: new Uint8Array(await f.arrayBuffer()) })),
      );
      setResultado(importarObraSistrut(lidos));
    } catch (erro) {
      setFalhaLeitura(`Não foi possível ler os arquivos (${String(erro)}).`);
    } finally {
      setLendo(false);
    }
  };

  const escolhidos = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite escolher os mesmos arquivos de novo
    void importar(arquivos);
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    void arquivosSoltos(e).then(importar, (erro: unknown) =>
      setFalhaLeitura(`Não foi possível ler os arquivos soltos (${String(erro)}).`),
    );
  };

  const fechar = () => {
    setResultado(null);
    setFalhaLeitura(null);
  };
  const aberto = resultado !== null || falhaLeitura !== null;

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
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
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
          {resultado?.ok ? (
            <ResumoObra resultado={resultado} />
          ) : (
            <DialogHeader>
              <DialogTitle>Não foi possível importar a obra do SISTRUT</DialogTitle>
              <DialogDescription>Nada foi aberto. Veja o motivo abaixo.</DialogDescription>
            </DialogHeader>
          )}
          {(falhaLeitura || (resultado && !resultado.ok)) && (
            <ul role="alert" className="text-destructive list-disc pl-5 text-sm">
              {falhaLeitura && <li>{falhaLeitura}</li>}
              {resultado && !resultado.ok && resultado.erros.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <DialogFooter>
            {resultado?.ok && (
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
              {resultado?.ok ? "Cancelar" : "Voltar"}
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

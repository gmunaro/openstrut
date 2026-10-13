// Caixa de erros (abrir arquivo, rascunho): a primeira linha é o título, as outras a lista.
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Erros({ erros, aoFechar }: { erros: string[]; aoFechar: () => void }) {
  if (erros.length === 0) return null;
  const [titulo, ...itens] = erros;
  return (
    <div
      role="alert"
      className="border-destructive/60 bg-destructive/10 relative rounded-md border p-3 pr-10 text-sm"
    >
      <p className="font-medium">{titulo}</p>
      {itens.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {itens.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-2 right-2"
        aria-label="Fechar"
        onClick={aoFechar}
      >
        <X />
      </Button>
    </div>
  );
}

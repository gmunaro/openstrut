// Diálogo "Adicionar…": desenha sem mouse. Laje: canto inferior esquerdo e vãos lx, ly.
// Pilar: centro. Tudo em m. Quem valida e grava é o domínio de edição (acrescentarLaje,
// acrescentarPilar); a recusa aparece no formulário, ligada aos campos por aria-describedby.
// Viga não tem criação aqui: a posição dela vem das lajes.
import { useId, useState, type FormEvent } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Pavimento } from "../dominio/obra";
import { acrescentarLaje, acrescentarPilar } from "./edicao";
import type { Alvo } from "./geometria";
import { numeroDoTexto } from "./formato";

type Tipo = "laje" | "pilar";
type Campo = "x" | "y" | "lx" | "ly";

const TIPOS: { valor: Tipo; rotulo: string }[] = [
  { valor: "laje", rotulo: "Laje" },
  { valor: "pilar", rotulo: "Pilar" },
];

export function DialogoAdicionar({
  pav,
  aberto,
  aoMudarAberto,
  aoCriar,
}: {
  pav: Pavimento;
  aberto: boolean;
  aoMudarAberto: (a: boolean) => void;
  /** Recebe o pavimento com o elemento novo e o elemento a selecionar. */
  aoCriar: (pavimento: Pavimento, alvo: Alvo) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent formaCompacta="telaCheia" className="sm:max-w-md">
        {/* o formulário só existe com o diálogo aberto: cada abertura começa com os padrões */}
        <Formulario pav={pav} aoCancelar={() => aoMudarAberto(false)} aoCriar={aoCriar} />
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  pav,
  aoCancelar,
  aoCriar,
}: {
  pav: Pavimento;
  aoCancelar: () => void;
  aoCriar: (pavimento: Pavimento, alvo: Alvo) => void;
}) {
  const id = useId();
  const idErro = `${id}-erro`;
  const [tipo, setTipo] = useState<Tipo>("laje");
  const [valores, setValores] = useState<Record<Campo, string>>({
    x: "0",
    y: "0",
    lx: "4",
    ly: "5",
  });
  const [erro, setErro] = useState<string>();

  const mudar = (campo: Campo, texto: string) => {
    setValores((v) => ({ ...v, [campo]: texto }));
    setErro(undefined);
  };

  /** Lê os campos do tipo escolhido, valida pelo domínio e grava; a recusa fica no formulário. */
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const x = numeroDoTexto(valores.x);
    const y = numeroDoTexto(valores.y);
    const lx = numeroDoTexto(valores.lx);
    const ly = numeroDoTexto(valores.ly);
    const usados = tipo === "laje" ? [x, y, lx, ly] : [x, y];
    if (!usados.every((n) => Number.isFinite(n))) return setErro("Valor numérico inválido.");
    const res =
      tipo === "laje" ? acrescentarLaje(pav, { x, y, lx, ly }) : acrescentarPilar(pav, { x, y });
    if (!res.ok) return setErro(res.erro);
    aoCriar(res.pavimento, { tipo, id: res.id });
  };

  const descricao = erro ? { "aria-describedby": idErro } : {};
  const campo = (c: Campo, rotulo: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-${c}`}>{rotulo}</Label>
      <Input
        id={`${id}-${c}`}
        inputMode="decimal"
        value={valores[c]}
        onChange={(e) => mudar(c, e.target.value)}
        {...descricao}
      />
    </div>
  );

  return (
    <form onSubmit={enviar} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Adicionar</DialogTitle>
        <DialogDescription>
          Laje: x e y são o canto inferior esquerdo. Pilar: x e y são o centro, e a seção é 20 × 20
          cm. Tudo em metros.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-tipo`}>Tipo</Label>
        <Select
          value={tipo}
          onValueChange={(v) => {
            if (v === "laje" || v === "pilar") setTipo(v);
            setErro(undefined);
          }}
        >
          <SelectTrigger id={`${id}-tipo`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => (
              <SelectItem key={t.valor} value={t.valor}>
                {t.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {campo("x", "x (m)")}
        {campo("y", "y (m)")}
        {tipo === "laje" && campo("lx", "lx (m)")}
        {tipo === "laje" && campo("ly", "ly (m)")}
      </div>

      {erro && (
        <p id={idErro} className="text-destructive text-sm">
          {erro}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoCancelar}>
          Cancelar
        </Button>
        <Button type="submit">Adicionar</Button>
      </DialogFooter>
    </form>
  );
}

// Diálogo "Obra e materiais": nome, norma, modo de cálculo (corrigido ou como o SISTRUT
// original, com a dica do que muda), fck, aços, classe do aço (só NB-1/78; CA-25 só A),
// classe de agressividade e cobrimentos. Grava tudo de uma vez (uma entrada no desfazer).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dica } from "@/components/ui/dica";
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
import { Switch } from "@/components/ui/switch";
import { materiaisPadrao } from "../../dominio/criar";
import type {
  Aco,
  Caa,
  ClasseAco,
  Materiais,
  ModoCalculo,
  NormaId,
  Obra,
} from "../../dominio/obra";
import { useObra } from "../../estado/obra";
import { NOME_MODO, NOME_NORMA } from "../calculo";
import { formatarNumero, lerNumero } from "../formato";

const ACOS: Aco[] = ["CA-25", "CA-50", "CA-60"];
const CAAS: { valor: Caa; rotulo: string }[] = [
  { valor: 1, rotulo: "I (fraca)" },
  { valor: 2, rotulo: "II (moderada)" },
  { valor: 3, rotulo: "III (forte)" },
  { valor: 4, rotulo: "IV (muito forte)" },
];
const NORMAS = Object.keys(NOME_NORMA) as NormaId[];
const CLASSES_ACO: { valor: ClasseAco; rotulo: string }[] = [
  { valor: "A", rotulo: "A (laminado a quente)" },
  { valor: "B", rotulo: "B (encruado a frio)" },
];
/** O CA-25 só existe na classe A: com ele a classe volta para A e a B fica desabilitada
 *  (a norma também calcula CA-25 como A, com aviso; normas/index.ts). */
const classeCompativel = (aco: Aco, classe: ClasseAco): ClasseAco =>
  aco === "CA-25" ? "A" : classe;

type CampoNum = "fck" | "cobrimentoLaje" | "cobrimentoViga" | "cobrimentoPilar";
const CAMPOS_NUM: { campo: CampoNum; rotulo: string; unidade: string; positivo: boolean }[] = [
  { campo: "fck", rotulo: "fck", unidade: "MPa", positivo: true },
  { campo: "cobrimentoLaje", rotulo: "Cobrimento da laje", unidade: "cm", positivo: false },
  { campo: "cobrimentoViga", rotulo: "Cobrimento da viga", unidade: "cm", positivo: false },
  { campo: "cobrimentoPilar", rotulo: "Cobrimento do pilar", unidade: "cm", positivo: false },
];

interface Formulario {
  nome: string;
  norma: NormaId;
  modoCalculo: ModoCalculo;
  aco: Aco;
  acoEstribo: Aco;
  classeAco: ClasseAco;
  caa: Caa;
  numeros: Record<CampoNum, string>;
}

const paraFormulario = (o: Obra, m: Materiais = o.materiais): Formulario => ({
  nome: o.nome,
  norma: o.norma,
  modoCalculo: o.modoCalculo,
  aco: m.aco,
  acoEstribo: m.acoEstribo,
  classeAco: classeCompativel(m.aco, m.classeAco),
  caa: m.caa,
  numeros: {
    fck: formatarNumero(m.fck, 1),
    cobrimentoLaje: formatarNumero(m.cobrimentoLaje, 1),
    cobrimentoViga: formatarNumero(m.cobrimentoViga, 1),
    cobrimentoPilar: formatarNumero(m.cobrimentoPilar, 1),
  },
});

export function DialogoMateriais({
  obra,
  aberto,
  aoMudarAberto,
}: {
  obra: Obra;
  aberto: boolean;
  aoMudarAberto: (a: boolean) => void;
}) {
  const editar = useObra((e) => e.editar);
  const [f, setF] = useState(() => paraFormulario(obra));
  const [erros, setErros] = useState<string[]>([]);
  // ao abrir, o formulário recomeça com os valores atuais da obra (o diálogo é aberto
  // pelo botão do cabeçalho, via `aberto`; o onOpenChange do Radix não avisa a abertura)
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setF(paraFormulario(obra));
      setErros([]);
    }
  }

  const aplicar = () => {
    const problemas: string[] = [];
    if (f.nome.trim() === "") problemas.push("O nome da obra não pode ficar vazio.");
    const numeros = {} as Record<CampoNum, number>;
    for (const c of CAMPOS_NUM) {
      const n = lerNumero(f.numeros[c.campo]);
      if (n === null || (c.positivo ? n <= 0 : n < 0))
        problemas.push(
          `${c.rotulo}: informe um número ${c.positivo ? "maior que zero" : "maior ou igual a zero"}.`,
        );
      else numeros[c.campo] = n;
    }
    if (problemas.length > 0) return setErros(problemas);
    const materiais: Materiais = {
      aco: f.aco,
      acoEstribo: f.acoEstribo,
      classeAco: f.classeAco,
      caa: f.caa,
      ...numeros,
    };
    editar((o) => ({
      ...o,
      nome: f.nome.trim(),
      norma: f.norma,
      modoCalculo: f.modoCalculo,
      materiais,
    }));
    aoMudarAberto(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Obra e materiais</DialogTitle>
          <DialogDescription>
            Valores de entrada; os de cálculo (fcd, fyd) saem da norma escolhida.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="col-span-2 grid gap-1.5">
            <Label htmlFor="mat-nome">Nome da obra</Label>
            <Input
              id="mat-nome"
              value={f.nome}
              onChange={(e) => setF({ ...f, nome: e.target.value })}
            />
          </div>
          <div className="col-span-2 grid gap-1.5">
            <Label htmlFor="mat-norma">Norma</Label>
            <Select
              value={f.norma}
              onValueChange={(v) => {
                const n = NORMAS.find((x) => x === v);
                if (n) setF({ ...f, norma: n });
              }}
            >
              <SelectTrigger id="mat-norma" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NORMAS.map((n) => (
                  <SelectItem key={n} value={n}>
                    {NOME_NORMA[n]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SwitchModo modo={f.modoCalculo} aoMudar={(modoCalculo) => setF({ ...f, modoCalculo })} />
          {CAMPOS_NUM.slice(0, 1).map((c) => (
            <CampoNumerico key={c.campo} c={c} f={f} setF={setF} />
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="mat-caa">Classe de agressividade</Label>
            <Select
              value={String(f.caa)}
              onValueChange={(v) => {
                const c = CAAS.find((x) => String(x.valor) === v);
                if (c) setF({ ...f, caa: c.valor });
              }}
            >
              <SelectTrigger id="mat-caa" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAAS.map((c) => (
                  <SelectItem key={c.valor} value={String(c.valor)}>
                    {c.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SeletorAco
            id="mat-aco"
            rotulo="Aço longitudinal"
            valor={f.aco}
            aoMudar={(aco) => setF({ ...f, aco, classeAco: classeCompativel(aco, f.classeAco) })}
          />
          <SeletorAco
            id="mat-aco-estribo"
            rotulo="Aço do estribo"
            valor={f.acoEstribo}
            aoMudar={(acoEstribo) => setF({ ...f, acoEstribo })}
          />
          {/* a NBR 6118:2023 não tem classes de aço; a NB-1/78 tem o diagrama da classe B */}
          {f.norma === "nb1-78" && (
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="mat-classe-aco">Classe do aço</Label>
              <Select
                value={f.classeAco}
                onValueChange={(v) => {
                  const c = CLASSES_ACO.find((x) => x.valor === v);
                  if (c) setF({ ...f, classeAco: c.valor });
                }}
              >
                <SelectTrigger id="mat-classe-aco" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLASSES_ACO.map((c) => (
                    <SelectItem
                      key={c.valor}
                      value={c.valor}
                      disabled={classeCompativel(f.aco, c.valor) !== c.valor}
                    >
                      {c.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {CAMPOS_NUM.slice(1).map((c) => (
            <CampoNumerico key={c.campo} c={c} f={f} setF={setF} />
          ))}
        </div>
        {erros.length > 0 && (
          <ul role="alert" className="text-destructive list-disc pl-5 text-xs">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            type="button"
            onClick={() =>
              setF({
                ...paraFormulario(obra, materiaisPadrao(f.norma)),
                nome: f.nome,
                norma: f.norma,
                modoCalculo: f.modoCalculo,
              })
            }
          >
            Valores padrão da norma
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => aoMudarAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={aplicar}>Aplicar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampoNumerico({
  c,
  f,
  setF,
}: {
  c: (typeof CAMPOS_NUM)[number];
  f: Formulario;
  setF: (f: Formulario) => void;
}) {
  const id = `mat-${c.campo}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {c.rotulo} <span className="text-muted-foreground font-normal">({c.unidade})</span>
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        className="text-right font-mono tabular-nums"
        value={f.numeros[c.campo]}
        onChange={(e) => setF({ ...f, numeros: { ...f.numeros, [c.campo]: e.target.value } })}
      />
    </div>
  );
}

function SeletorAco({
  id,
  rotulo,
  valor,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  valor: Aco;
  aoMudar: (a: Aco) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select
        value={valor}
        onValueChange={(v) => {
          const a = ACOS.find((x) => x === v);
          if (a) aoMudar(a);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACOS.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Switch do modo de cálculo (Obra.modoCalculo): desligado = corrigido, ligado = como o
 *  SISTRUT original. A dica resume o que muda (a lista completa está em
 *  docs/MODO-CALCULO.md). */
function SwitchModo({ modo, aoMudar }: { modo: ModoCalculo; aoMudar: (m: ModoCalculo) => void }) {
  return (
    <div className="col-span-2 grid gap-1.5">
      <div className="flex items-center gap-1">
        <span id="mat-modo-titulo" className="text-sm leading-none font-medium">
          Modo de cálculo
        </span>
        <Dica id="mat-modo-dica" rotulo="O que muda com o modo de cálculo">
          <span className="block">
            Só na NB-1/78, que nos dois modos calcula pelo método do SISTRUT 4.0.{" "}
            {NOME_MODO.original} repete o programa de 1991 número a número (CA-50 = 5 t/cm²,
            concreto 2,5 t/m³, cobrimentos do SISTRUT, precisão simples), inclusive os erros.
            Corrigido usa 500 MPa, 25 kN/m³ e os cobrimentos da obra, e corrige os erros, entre
            eles:
          </span>
          <span className="mt-1 block">· flecha das lajes nunca verificada;</span>
          <span className="block">
            · armadura mínima de viga com CA-25 de 0,15 % em vez de 0,25 %;
          </span>
          <span className="block">
            · reações truncadas no .REP e momento da viga no pilar sem rigidez nem direção;
          </span>
          <span className="block">
            · volume e fôrma de viga pelo DESINIT, que conta de novo a faixa da laje.
          </span>
        </Dica>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className={modo === "corrigido" ? "font-medium" : "text-muted-foreground"}>
          {NOME_MODO.corrigido}
        </span>
        <Switch
          id="mat-modo"
          checked={modo === "original"}
          onCheckedChange={(ligado) => aoMudar(ligado ? "original" : "corrigido")}
          aria-labelledby="mat-modo-titulo mat-modo-original"
          aria-describedby="mat-modo-dica"
        />
        <Label
          id="mat-modo-original"
          htmlFor="mat-modo"
          className={modo === "original" ? "" : "text-muted-foreground font-normal"}
        >
          {NOME_MODO.original}
        </Label>
      </div>
    </div>
  );
}

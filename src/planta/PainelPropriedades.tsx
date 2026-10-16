// Painel de propriedades do elemento selecionado na planta. Cada campo confirma
// ao sair do campo ou com Enter (Esc desfaz a digitação); o valor passa pelas
// validações de edicao.ts e o erro aparece embaixo do campo.
import { useId, useState } from "react";
import { vinculacao } from "../calculo/lajes/vinculacao";
import {
  BORDOS,
  type Bordo,
  type Laje,
  type Pavimento,
  type Pilar,
  type Viga,
  type Vinculo,
} from "../dominio/obra";
import { useObra, type Selecao } from "../estado/obra";
import { COR_SITUACAO, ROTULO_SITUACAO } from "./Desenho";
import { alterarLaje, alterarPilar, alterarViga, type Edicao } from "./edicao";
import { fmt, fmtCampo, numeroDoTexto } from "./formato";
import type { Diagnostico } from "./situacao";

/** Sobrecargas de uso, kN/m² (NBR 6120:2019, tabela 10). Valores além de residencial,
 *  escritório e forro: [VERIFICAR] na tabela da norma. */
export const PRESETS_SOBRECARGA = [
  { rotulo: "Residencial: dormitório, sala, cozinha, banheiro", valor: 1.5 },
  { rotulo: "Residencial: despensa, área de serviço", valor: 2 },
  { rotulo: "Escritório: salas de uso geral", valor: 2.5 },
  { rotulo: "Forro sem acesso a pessoas", valor: 0.5 },
  { rotulo: "Cobertura só com acesso para manutenção", valor: 1 },
  { rotulo: "Corredor e escada de uso comum", valor: 3 },
  { rotulo: "Garagem de veículos leves", valor: 3 },
] as const;

const ROTULO_BORDO: Record<Bordo, string> = {
  esquerdo: "Esquerdo",
  inferior: "Inferior",
  direito: "Direito",
  superior: "Superior",
};

interface Props {
  pav: Pavimento;
  selecao: Selecao;
  diagnostico: Diagnostico | undefined;
  /** Aplica a edição; devolve a mensagem de erro, se houver. */
  aplicar: (e: Edicao) => string | undefined;
  apagar: () => void;
}

export function PainelPropriedades({ pav, selecao, diagnostico, aplicar, apagar }: Props) {
  const laje = selecao?.tipo === "laje" ? pav.lajes.find((l) => l.id === selecao.id) : undefined;
  const viga = selecao?.tipo === "viga" ? pav.vigas.find((v) => v.id === selecao.id) : undefined;
  const pilar =
    selecao?.tipo === "pilar" ? pav.pilares.find((p) => p.id === selecao.id) : undefined;
  if (!laje && !viga && !pilar) return <SemSelecao pav={pav} />;
  return (
    <div className="space-y-3 p-3 text-sm">
      {laje && <PropriedadesLaje key={laje.id} pav={pav} l={laje} aplicar={aplicar} />}
      {viga && <PropriedadesViga pav={pav} v={viga} aplicar={aplicar} />}
      {pilar && <PropriedadesPilar pav={pav} p={pilar} aplicar={aplicar} />}
      {diagnostico && <Situacao d={diagnostico} />}
      <button
        type="button"
        onClick={apagar}
        className="w-full rounded border border-red-800 px-2 py-1 text-red-300 hover:bg-red-950"
      >
        Apagar (Delete)
      </button>
    </div>
  );
}

function SemSelecao({ pav }: { pav: Pavimento }) {
  return (
    <div className="space-y-3 p-3 text-sm text-slate-400">
      <p>
        {pav.nome}: {pav.lajes.length} lajes, {pav.vigas.length} vigas, {pav.pilares.length}{" "}
        pilares.
      </p>
      <p>Clique num elemento para ver e editar as propriedades.</p>
      <ul className="space-y-0.5 text-xs">
        <li>
          <Tecla>V</Tecla> selecionar · <Tecla>L</Tecla> laje · <Tecla>P</Tecla> pilar
        </li>
        <li>
          <Tecla>Delete</Tecla> apagar · <Tecla>Esc</Tecla> cancelar
        </li>
        <li>
          <Tecla>Ctrl+Z</Tecla> desfazer · <Tecla>Ctrl+Y</Tecla> refazer
        </li>
        <li>Roda: zoom · botão do meio ou espaço + arrastar: mover</li>
      </ul>
    </div>
  );
}

const Tecla = ({ children }: { children: string }) => (
  <kbd className="rounded border border-slate-600 px-1 font-mono text-[11px] text-slate-300">
    {children}
  </kbd>
);

function Situacao({ d }: { d: Diagnostico }) {
  return (
    <div className="rounded border border-slate-700 p-2 text-xs">
      <p className="flex items-center gap-2 font-medium">
        <span
          className="inline-block size-2.5 rounded-full"
          style={{ background: COR_SITUACAO[d.situacao] }}
        />
        Cálculo: {ROTULO_SITUACAO[d.situacao]}
      </p>
      {d.mensagens.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-300">
          {d.mensagens.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Titulo({ children }: { children: string }) {
  return (
    <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{children}</h2>
  );
}

function PropriedadesLaje({
  pav,
  l,
  aplicar,
}: {
  pav: Pavimento;
  l: Laje;
  aplicar: Props["aplicar"];
}) {
  const muda = (m: Partial<Omit<Laje, "id">>) => aplicar(alterarLaje(pav, l.id, m));
  // μ só entra nas charneiras da NB-1/78; a 6118 calcula a laje elástica (tabelas)
  const nb178 = useObra((s) => s.obra?.norma === "nb1-78");
  // erro de preset ou vínculo (os campos de texto mostram o próprio erro)
  const [erro, setErro] = useState<string>();
  const num = (
    campo: "x" | "y" | "lx" | "ly" | "h" | "revestimento" | "sobrecarga" | "mu",
    rotulo: string,
    unidade: string,
  ) => (
    <CampoNumero
      key={`${l.id}:${campo}:${l[campo]}`}
      rotulo={rotulo}
      unidade={unidade}
      valor={l[campo]}
      confirmar={(v) => muda({ [campo]: v })}
    />
  );
  const detectado = vinculacao(pav.lajes)[l.id];
  const mudaVinculo = (b: Bordo, valor: string) => {
    const { [b]: _antigo, ...resto } = l.vinculos;
    const vinculos: Partial<Record<Bordo, Vinculo>> =
      valor === "engastado" || valor === "apoiado" || valor === "livre"
        ? { ...resto, [b]: valor }
        : resto;
    setErro(muda({ vinculos }));
  };
  return (
    <div className="space-y-2">
      <Titulo>Laje</Titulo>
      <CampoTexto
        key={`${l.id}:nome:${l.nome}`}
        rotulo="Nome"
        valor={l.nome}
        confirmar={(nome) => muda({ nome })}
      />
      <div className="grid grid-cols-2 gap-2">
        {num("x", "x", "m")}
        {num("y", "y", "m")}
        {num("lx", "lx", "m")}
        {num("ly", "ly", "m")}
      </div>
      {num("h", "Espessura h", "cm")}
      {num("revestimento", "Revestimento", "kN/m²")}
      {num("sobrecarga", "Sobrecarga", "kN/m²")}
      <label className="block">
        <span className="text-xs text-slate-400">Sobrecarga pela NBR 6120</span>
        <select
          value=""
          onChange={(e) => {
            const p = PRESETS_SOBRECARGA[Number(e.target.value)];
            if (p) setErro(muda({ sobrecarga: p.valor }));
          }}
          className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1 py-1 text-xs"
        >
          <option value="">Escolher uso…</option>
          {PRESETS_SOBRECARGA.map((p, i) => (
            <option key={p.rotulo} value={i}>
              {p.rotulo}: {fmt(p.valor, 1)} kN/m²
            </option>
          ))}
        </select>
      </label>
      {nb178 && num("mu", "μ", "relação my/mx")}
      <fieldset className="space-y-1">
        <legend className="text-xs text-slate-400">Vínculo dos bordos</legend>
        {BORDOS.map((b) => (
          <label key={b} className="flex items-center justify-between gap-2">
            <span>{ROTULO_BORDO[b]}</span>
            <select
              value={l.vinculos[b] ?? "auto"}
              onChange={(e) => mudaVinculo(b, e.target.value)}
              className="w-36 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs"
            >
              <option value="auto">
                auto{!l.vinculos[b] && detectado ? ` (${detectado[b]})` : ""}
              </option>
              <option value="engastado">engastado</option>
              <option value="apoiado">apoiado</option>
              <option value="livre">livre (sem viga)</option>
            </select>
          </label>
        ))}
      </fieldset>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </div>
  );
}

function PropriedadesViga({
  pav,
  v,
  aplicar,
}: {
  pav: Pavimento;
  v: Viga;
  aplicar: Props["aplicar"];
}) {
  const muda = (m: Partial<Omit<Viga, "id">>) => aplicar(alterarViga(pav, v.id, m));
  const num = (campo: "bw" | "h" | "cargaLinear", rotulo: string, unidade: string) => (
    <CampoNumero
      key={`${v.id}:${campo}:${v[campo]}`}
      rotulo={rotulo}
      unidade={unidade}
      valor={v[campo]}
      confirmar={(x) => muda({ [campo]: x })}
    />
  );
  return (
    <div className="space-y-2">
      <Titulo>Viga</Titulo>
      <CampoTexto
        key={`${v.id}:nome:${v.nome}`}
        rotulo="Nome"
        valor={v.nome}
        confirmar={(nome) => muda({ nome })}
      />
      <p className="text-xs text-slate-400">
        Comprimento {fmt(Math.hypot(v.x2 - v.x1, v.y2 - v.y1))} m
      </p>
      <div className="grid grid-cols-2 gap-2">
        {num("bw", "bw", "cm")}
        {num("h", "h", "cm")}
      </div>
      {num("cargaLinear", "Carga linear (parede)", "kN/m")}
    </div>
  );
}

function PropriedadesPilar({
  pav,
  p,
  aplicar,
}: {
  pav: Pavimento;
  p: Pilar;
  aplicar: Props["aplicar"];
}) {
  const muda = (m: Partial<Omit<Pilar, "id">>) => aplicar(alterarPilar(pav, p.id, m));
  const num = (campo: "b" | "h", rotulo: string) => (
    <CampoNumero
      key={`${p.id}:${campo}:${p[campo]}`}
      rotulo={rotulo}
      unidade="cm"
      valor={p[campo]}
      confirmar={(x) => muda({ [campo]: x })}
    />
  );
  return (
    <div className="space-y-2">
      <Titulo>Pilar</Titulo>
      <CampoTexto
        key={`${p.id}:nome:${p.nome}`}
        rotulo="Nome"
        valor={p.nome}
        confirmar={(nome) => muda({ nome })}
      />
      <p className="text-xs text-slate-400">
        Centro ({fmt(p.x)}; {fmt(p.y)}) m
      </p>
      <div className="grid grid-cols-2 gap-2">
        {num("b", "b (em x)")}
        {num("h", "h (em y)")}
      </div>
    </div>
  );
}

/** Campo de texto que confirma ao sair ou com Enter. `confirmar` devolve o erro, se houver.
 *  O erro fica fora do `<label>` (não entra no nome do campo) e é ligado ao input por
 *  `aria-describedby`. Quem usa troca a `key` quando o valor muda por fora (desfazer, outra seleção). */
function Campo({
  rotulo,
  unidade,
  inicial,
  confirmar,
}: {
  rotulo: string;
  unidade?: string;
  inicial: string;
  confirmar: (texto: string) => string | undefined;
}) {
  const [texto, setTexto] = useState(inicial);
  const [erro, setErro] = useState<string>();
  const idErro = useId();
  const enviar = () => setErro(texto === inicial ? undefined : confirmar(texto));
  return (
    <div className="block">
      <label className="block">
        <span className="text-xs text-slate-400">
          {rotulo}
          {unidade && <span className="text-slate-500"> ({unidade})</span>}
        </span>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={enviar}
          onKeyDown={(e) => {
            if (e.key === "Enter") enviar();
            if (e.key === "Escape") {
              setTexto(inicial);
              setErro(undefined);
            }
          }}
          aria-invalid={erro !== undefined}
          aria-describedby={erro !== undefined ? idErro : undefined}
          className={`mt-0.5 w-full rounded border bg-slate-900 px-1.5 py-0.5 text-right font-mono tabular-nums ${
            erro ? "border-red-500" : "border-slate-700"
          }`}
        />
      </label>
      {erro && (
        <span id={idErro} className="mt-0.5 block text-xs text-red-400">
          {erro}
        </span>
      )}
    </div>
  );
}

function CampoNumero(props: {
  rotulo: string;
  unidade: string;
  valor: number;
  confirmar: (v: number) => string | undefined;
}) {
  return (
    <Campo
      rotulo={props.rotulo}
      unidade={props.unidade}
      inicial={fmtCampo(props.valor)}
      confirmar={(t) => {
        const v = numeroDoTexto(t);
        return Number.isFinite(v) ? props.confirmar(v) : "Número inválido.";
      }}
    />
  );
}

function CampoTexto(props: {
  rotulo: string;
  valor: string;
  confirmar: (v: string) => string | undefined;
}) {
  return (
    <Campo
      rotulo={props.rotulo}
      inicial={props.valor}
      confirmar={(t) => props.confirmar(t.trim())}
    />
  );
}

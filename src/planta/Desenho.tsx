// Conteúdo SVG da planta: grade, lajes (nome e cotas), vigas, pilares, posições
// de pilares removidos, prévia do retângulo da laje e cursor. Só desenha; os eventos ficam no EditorPlanta.
// Tudo é convertido para coordenadas de tela aqui (mundoParaTela), para o texto
// não sair espelhado pela inversão do eixo y.
import { eixoDoBordo } from "../dominio/gerar";
import { BORDOS, type Laje, type Pavimento, type Pilar, type Viga } from "../dominio/obra";
import type { Retangulo } from "../dominio/criar";
import type { Selecao } from "../estado/obra";
import { fmt } from "./formato";
import {
  mundoParaTela,
  passoVisivel,
  retanguloTela,
  telaParaMundo,
  type Ponto,
  type Vista,
} from "./geometria";
import { SEM_CALCULO, type Diagnostico, type Diagnosticos, type Situacao } from "./situacao";

export const COR_SITUACAO: Record<Situacao, string> = {
  ok: "#22c55e",
  aviso: "#f59e0b",
  falha: "#ef4444",
};
const COR_SELECAO = "#38bdf8";
const NEUTRO_LAJE = "#334155";
const NEUTRO_VIGA = "#94a3b8";
const NEUTRO_PILAR = "#e2e8f0";

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  ok: "sem avisos",
  aviso: "com avisos",
  falha: "falha ou sem cálculo",
};

/** Texto do tooltip: título e, com resultado, a situação e as mensagens. */
const dica = (titulo: string, d: Diagnostico | undefined) =>
  d ? [titulo, `Situação: ${ROTULO_SITUACAO[d.situacao]}`, ...d.mensagens].join("\n") : titulo;

interface Props {
  pav: Pavimento;
  vista: Vista;
  largura: number;
  altura: number;
  grade: number;
  selecao: Selecao;
  diag: Diagnosticos | undefined;
  previa: { r: Retangulo; invalida: boolean } | undefined;
  cursor: Ponto | undefined;
}

export function Desenho({
  pav,
  vista,
  largura,
  altura,
  grade,
  selecao,
  diag,
  previa,
  cursor,
}: Props) {
  const sel = (tipo: "laje" | "viga" | "pilar", id: string) =>
    selecao?.tipo === tipo && selecao.id === id;
  const selLaje = pav.lajes.find((l) => sel("laje", l.id));
  return (
    <>
      <Grade vista={vista} largura={largura} altura={altura} grade={grade} />
      {pav.lajes.map((l) => (
        <DesenhoLaje
          key={l.id}
          l={l}
          vista={vista}
          d={diag && (diag.lajes.get(l.id) ?? SEM_CALCULO)}
          selecionada={sel("laje", l.id)}
        />
      ))}
      {pav.vigas.map((v) => (
        <DesenhoViga
          key={v.id}
          v={v}
          vista={vista}
          d={diag && (diag.vigas.get(v.id) ?? SEM_CALCULO)}
          selecionada={sel("viga", v.id)}
        />
      ))}
      {pav.pilaresRemovidos.map((r) => (
        <PilarRemovido key={`${r.x};${r.y}`} p={mundoParaTela(vista, r)} />
      ))}
      {pav.pilares.map((p) => (
        <DesenhoPilar
          key={p.id}
          p={p}
          vista={vista}
          d={diag?.pilares && (diag.pilares.get(p.id) ?? SEM_CALCULO)}
          selecionado={sel("pilar", p.id)}
        />
      ))}
      {selLaje && <ContornoLaje l={selLaje} vista={vista} />}
      {previa && <Previa {...previa} vista={vista} />}
      {cursor && <Cursor p={mundoParaTela(vista, cursor)} />}
    </>
  );
}

/** Linhas da grade visíveis; a cada metro a linha é mais forte, e os eixos x = 0 e y = 0 mais ainda. */
function Grade({
  vista,
  largura,
  altura,
  grade,
}: {
  vista: Vista;
  largura: number;
  altura: number;
  grade: number;
}) {
  const passo = passoVisivel(grade, vista.escala);
  const a = telaParaMundo(vista, { x: 0, y: altura });
  const b = telaParaMundo(vista, { x: largura, y: 0 });
  const linhas = (de: number, ate: number) => {
    const v: number[] = [];
    for (let k = Math.ceil(de / passo); k * passo <= ate && v.length < 2000; k++) v.push(k * passo);
    return v;
  };
  const cor = (c: number) =>
    Math.abs(c) < 1e-9 ? "#475569" : Math.abs(c - Math.round(c)) < 1e-9 ? "#1e293b" : "#172033";
  return (
    <g pointerEvents="none" shapeRendering="crispEdges">
      {linhas(a.x, b.x).map((x) => {
        const t = mundoParaTela(vista, { x, y: 0 }).x;
        return <line key={`x${x}`} x1={t} x2={t} y1={0} y2={altura} stroke={cor(x)} />;
      })}
      {linhas(a.y, b.y).map((y) => {
        const t = mundoParaTela(vista, { x: 0, y }).y;
        return <line key={`y${y}`} x1={0} x2={largura} y1={t} y2={t} stroke={cor(y)} />;
      })}
    </g>
  );
}

/** Contorno da laje selecionada, desenhado por cima de vigas e pilares: as vigas do
 *  bordo cobrem o contorno da própria laje e a seleção ficaria invisível. */
function ContornoLaje({ l, vista }: { l: Laje; vista: Vista }) {
  const rt = retanguloTela(vista, { xmin: l.x, ymin: l.y, xmax: l.x + l.lx, ymax: l.y + l.ly });
  return <rect {...rt} fill="none" stroke={COR_SELECAO} strokeWidth={2.5} pointerEvents="none" />;
}

function DesenhoLaje({
  l,
  vista,
  d,
  selecionada,
}: {
  l: Laje;
  vista: Vista;
  d: Diagnostico | undefined;
  selecionada: boolean;
}) {
  const rt = retanguloTela(vista, { xmin: l.x, ymin: l.y, xmax: l.x + l.lx, ymax: l.y + l.ly });
  const c = mundoParaTela(vista, { x: l.x + l.lx / 2, y: l.y + l.ly / 2 });
  const cotas = `${fmt(l.lx)} × ${fmt(l.ly)}`;
  const cabeCotas = rt.width > 70 && rt.height > 36;
  return (
    <g>
      <title>{dica(`${l.nome}: ${cotas} m, h = ${fmt(l.h, 0)} cm`, d)}</title>
      <rect
        {...rt}
        fill={d ? COR_SITUACAO[d.situacao] : NEUTRO_LAJE}
        fillOpacity={d ? 0.22 : 0.45}
        stroke={selecionada ? COR_SELECAO : "#64748b"}
        strokeWidth={selecionada ? 2.5 : 1}
      />
      {BORDOS.filter((b) => l.vinculos[b] === "livre").map((b) => {
        const e = eixoDoBordo(l, b);
        const p1 = mundoParaTela(vista, e.horizontal ? { x: e.s1, y: e.c } : { x: e.c, y: e.s1 });
        const p2 = mundoParaTela(vista, e.horizontal ? { x: e.s2, y: e.c } : { x: e.c, y: e.s2 });
        return (
          <line
            key={b}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="#fbbf24"
            strokeWidth={2}
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        );
      })}
      <text
        x={c.x}
        y={cabeCotas ? c.y - 4 : c.y + 4}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill="#e2e8f0"
        pointerEvents="none"
      >
        {l.nome}
      </text>
      {cabeCotas && (
        <text
          x={c.x}
          y={c.y + 12}
          textAnchor="middle"
          fontSize={11}
          fill="#94a3b8"
          pointerEvents="none"
        >
          {cotas}
        </text>
      )}
    </g>
  );
}

function DesenhoViga({
  v,
  vista,
  d,
  selecionada,
}: {
  v: Viga;
  vista: Vista;
  d: Diagnostico | undefined;
  selecionada: boolean;
}) {
  const a = mundoParaTela(vista, { x: v.x1, y: v.y1 });
  const b = mundoParaTela(vista, { x: v.x2, y: v.y2 });
  const largura = Math.max(3, (v.bw / 100) * vista.escala);
  const horizontal = Math.abs(a.y - b.y) < Math.abs(a.x - b.x);
  const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const afasta = largura / 2 + 4;
  const comprimento = Math.hypot(v.x2 - v.x1, v.y2 - v.y1);
  return (
    <g>
      <title>
        {dica(`${v.nome}: ${fmt(v.bw, 0)} × ${fmt(v.h, 0)} cm, ${fmt(comprimento)} m`, d)}
      </title>
      {selecionada && (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={COR_SELECAO}
          strokeWidth={largura + 6}
          strokeOpacity={0.6}
        />
      )}
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={d ? COR_SITUACAO[d.situacao] : NEUTRO_VIGA}
        strokeWidth={largura}
      />
      <text
        x={horizontal ? meio.x : meio.x - afasta}
        y={horizontal ? meio.y - afasta : meio.y}
        transform={horizontal ? undefined : `rotate(-90 ${meio.x - afasta} ${meio.y})`}
        textAnchor="middle"
        fontSize={11}
        fill="#cbd5e1"
        pointerEvents="none"
      >
        {v.nome}
      </text>
    </g>
  );
}

function DesenhoPilar({
  p,
  vista,
  d,
  selecionado,
}: {
  p: Pilar;
  vista: Vista;
  d: Diagnostico | undefined;
  selecionado: boolean;
}) {
  const meiaB = Math.max(3, (p.b / 200) * vista.escala);
  const meiaH = Math.max(3, (p.h / 200) * vista.escala);
  const c = mundoParaTela(vista, p);
  return (
    <g>
      <title>{dica(`${p.nome}: ${fmt(p.b, 0)} × ${fmt(p.h, 0)} cm`, d)}</title>
      <rect
        x={c.x - meiaB}
        y={c.y - meiaH}
        width={2 * meiaB}
        height={2 * meiaH}
        fill={d ? COR_SITUACAO[d.situacao] : NEUTRO_PILAR}
        stroke={selecionado ? COR_SELECAO : "#0f172a"}
        strokeWidth={selecionado ? 3 : 1}
      />
      <text
        x={c.x + meiaB + 3}
        y={c.y - meiaH - 3}
        fontSize={11}
        fill="#f1f5f9"
        pointerEvents="none"
      >
        {p.nome}
      </text>
    </g>
  );
}

/** Marca tracejada onde o usuário apagou um pilar gerado: ali gerarEstrutura não cria
 *  pilar, e desenhar um pilar no ponto o traz de volta. */
function PilarRemovido({ p }: { p: Ponto }) {
  return (
    <rect
      x={p.x - 4}
      y={p.y - 4}
      width={8}
      height={8}
      fill="none"
      stroke="#64748b"
      strokeDasharray="2 2"
      pointerEvents="none"
    />
  );
}

function Previa({ r, invalida, vista }: { r: Retangulo; invalida: boolean; vista: Vista }) {
  const rt = retanguloTela(vista, { xmin: r.x, ymin: r.y, xmax: r.x + r.lx, ymax: r.y + r.ly });
  const cor = invalida ? COR_SITUACAO.falha : COR_SELECAO;
  return (
    <g pointerEvents="none">
      <rect
        {...rt}
        fill={cor}
        fillOpacity={0.12}
        stroke={cor}
        strokeDasharray="6 4"
        strokeWidth={1.5}
      />
      <text x={rt.x + rt.width / 2} y={rt.y - 6} textAnchor="middle" fontSize={12} fill={cor}>
        {`${fmt(r.lx)} × ${fmt(r.ly)} m`}
      </text>
    </g>
  );
}

function Cursor({ p }: { p: Ponto }) {
  return (
    <g pointerEvents="none" stroke={COR_SELECAO} strokeWidth={1}>
      <line x1={p.x - 8} x2={p.x + 8} y1={p.y} y2={p.y} />
      <line x1={p.x} x2={p.x} y1={p.y - 8} y2={p.y + 8} />
      <circle cx={p.x} cy={p.y} r={3} fill="none" />
    </g>
  );
}

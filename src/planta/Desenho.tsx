// Conteúdo SVG da planta: grade, lajes (nome e cotas), vigas, pilares, posições
// de pilares removidos, prévia do retângulo da laje (com cotas), guias do snap, medida
// e cursor. Só desenha; os eventos ficam no EditorPlanta.
// Tudo é convertido para coordenadas de tela aqui (mundoParaTela), para o texto
// não sair espelhado pela inversão do eixo y.
import { eixoDoBordo } from "../dominio/gerar";
import { BORDOS, type Laje, type Pavimento, type Pilar, type Viga } from "../dominio/obra";
import type { Retangulo } from "../dominio/criar";
import type { Selecao } from "../estado/obra";
import { fmt } from "./formato";
import {
  medir,
  mundoParaTela,
  posicaoRotuloViga,
  passoVisivel,
  retanguloTela,
  telaParaMundo,
  type Guias,
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
  /** Bordos de laje em que o snap do cursor prendeu (linhas de guia). */
  guias: Guias | undefined;
  /** Medida da ferramenta Medir: do ponto `a` ao `b`, m. */
  medida: { a: Ponto; b: Ponto } | undefined;
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
  guias,
  medida,
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
          pilares={pav.pilares}
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
      {guias && <LinhasGuia guias={guias} vista={vista} largura={largura} altura={altura} />}
      {previa && <Previa {...previa} vista={vista} />}
      {medida && <Medida {...medida} vista={vista} />}
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
  const cotas = `${fmt(l.lx)} × ${fmt(l.ly)} m`;
  const cabeCotas = rt.width > 70 && rt.height > 36;
  return (
    <g>
      <title>{dica(`${l.nome}: ${cotas}, h = ${fmt(l.h, 0)} cm`, d)}</title>
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
        fontSize="0.8125rem"
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
          fontSize="0.6875rem"
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
  pilares,
  vista,
  d,
  selecionada,
}: {
  v: Viga;
  pilares: readonly Pilar[];
  vista: Vista;
  d: Diagnostico | undefined;
  selecionada: boolean;
}) {
  const a = mundoParaTela(vista, { x: v.x1, y: v.y1 });
  const b = mundoParaTela(vista, { x: v.x2, y: v.y2 });
  const largura = Math.max(3, (v.bw / 100) * vista.escala);
  const horizontal = Math.abs(a.y - b.y) < Math.abs(a.x - b.x);
  // o nome fica longe dos pilares (a 0,6 m ou 40 px, o que for maior), para não cobrir o deles
  const meio = mundoParaTela(
    vista,
    posicaoRotuloViga(v, pilares, Math.max(0.6, 40 / vista.escala)),
  );
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
        fontSize="0.6875rem"
        fill="#cbd5e1"
        pointerEvents="none"
      >
        {v.nome}
      </text>
    </g>
  );
}

/** Escala (px/m) mínima para desenhar o nome do pilar. Abaixo disso o nome encosta no
 *  nome da viga vizinha; o nome continua na dica do pilar e no painel de propriedades. */
const ESCALA_NOME_PILAR = 30;

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
      {vista.escala >= ESCALA_NOME_PILAR && (
        <text
          x={c.x + meiaB + 3}
          y={c.y - meiaH - 3}
          fontSize="0.6875rem"
          fill="#f1f5f9"
          pointerEvents="none"
        >
          {p.nome}
        </text>
      )}
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

/** Cota de um segmento da tela (px) com o texto `rotulo`: linha com traços nas pontas e o
 *  texto no meio, afastado `lado` px (positivo: abaixo ou à direita). */
function Cota({
  a,
  b,
  rotulo,
  cor,
  lado,
}: {
  a: Ponto;
  b: Ponto;
  rotulo: string;
  cor: string;
  lado: number;
}) {
  const horizontal = Math.abs(b.y - a.y) < Math.abs(b.x - a.x);
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const traco = (p: Ponto) =>
    horizontal ? (
      <line x1={p.x} x2={p.x} y1={p.y - 5} y2={p.y + 5} />
    ) : (
      <line x1={p.x - 5} x2={p.x + 5} y1={p.y} y2={p.y} />
    );
  const texto = horizontal ? { x: m.x, y: m.y + (lado > 0 ? 15 : -6) } : { x: m.x + lado, y: m.y };
  return (
    <g pointerEvents="none" stroke={cor} strokeWidth={1}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {traco(a)}
      {traco(b)}
      <text
        {...texto}
        transform={horizontal ? undefined : `rotate(-90 ${texto.x} ${texto.y})`}
        textAnchor="middle"
        fontSize="0.75rem"
        fontWeight={600}
        fill={cor}
        stroke="#0f172a"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {rotulo}
      </text>
    </g>
  );
}

/** Retângulo da laje sendo desenhada, com as cotas lx (embaixo) e ly (à esquerda). */
function Previa({ r, invalida, vista }: { r: Retangulo; invalida: boolean; vista: Vista }) {
  const rt = retanguloTela(vista, { xmin: r.x, ymin: r.y, xmax: r.x + r.lx, ymax: r.y + r.ly });
  const cor = invalida ? COR_SITUACAO.falha : COR_SELECAO;
  const base = rt.y + rt.height + 14;
  const esquerda = rt.x - 14;
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
      {r.lx > 0 && (
        <Cota
          a={{ x: rt.x, y: base }}
          b={{ x: rt.x + rt.width, y: base }}
          rotulo={`lx = ${fmt(r.lx)} m`}
          cor={cor}
          lado={1}
        />
      )}
      {r.ly > 0 && (
        <Cota
          a={{ x: esquerda, y: rt.y + rt.height }}
          b={{ x: esquerda, y: rt.y }}
          rotulo={`ly = ${fmt(r.ly)} m`}
          cor={cor}
          lado={-8}
        />
      )}
    </g>
  );
}

const COR_GUIA = "#22d3ee";

/** Guias do snap: a reta inteira do bordo de laje em que o cursor prendeu. */
function LinhasGuia({
  guias,
  vista,
  largura,
  altura,
}: {
  guias: Guias;
  vista: Vista;
  largura: number;
  altura: number;
}) {
  return (
    <g pointerEvents="none" stroke={COR_GUIA} strokeOpacity={0.7} strokeDasharray="4 4">
      {guias.x !== null && (
        <line
          x1={mundoParaTela(vista, { x: guias.x, y: 0 }).x}
          x2={mundoParaTela(vista, { x: guias.x, y: 0 }).x}
          y1={0}
          y2={altura}
        />
      )}
      {guias.y !== null && (
        <line
          y1={mundoParaTela(vista, { x: 0, y: guias.y }).y}
          y2={mundoParaTela(vista, { x: 0, y: guias.y }).y}
          x1={0}
          x2={largura}
        />
      )}
    </g>
  );
}

const COR_MEDIDA = "#facc15";

/** Linha da ferramenta Medir, com a distância no meio e os catetos tracejados. */
function Medida({ a, b, vista }: { a: Ponto; b: Ponto; vista: Vista }) {
  const ta = mundoParaTela(vista, a);
  const tb = mundoParaTela(vista, b);
  const { d } = medir(a, b);
  const canto = { x: tb.x, y: ta.y };
  const m = { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 };
  return (
    <g pointerEvents="none" stroke={COR_MEDIDA}>
      {d > 0 && (
        <path
          d={`M${ta.x},${ta.y} L${canto.x},${canto.y} L${tb.x},${tb.y}`}
          fill="none"
          strokeOpacity={0.5}
          strokeDasharray="3 3"
        />
      )}
      <line x1={ta.x} y1={ta.y} x2={tb.x} y2={tb.y} strokeWidth={1.5} />
      <circle cx={ta.x} cy={ta.y} r={3} fill={COR_MEDIDA} />
      <circle cx={tb.x} cy={tb.y} r={3} fill={COR_MEDIDA} />
      {d > 0 && (
        <text
          x={m.x}
          y={m.y - 8}
          textAnchor="middle"
          fontSize="0.8125rem"
          fontWeight={600}
          fill={COR_MEDIDA}
          stroke="#0f172a"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {`${fmt(d)} m`}
        </text>
      )}
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

// Traduz o modelo BIM (modelo.ts) para um arquivo IFC4 (STEP). Estrutura espacial:
// IfcProject → IfcSite → IfcBuilding → um IfcBuildingStorey por nível. Pilares, vigas e
// lajes são IfcColumn, IfcBeam e IfcSlab com sólido extrudado (SweptSolid), material
// "Concreto C{fck}" e os Psets Pset_OpenStrut e Pset_*Common. A armadura sai como
// IfcReinforcingBar agregada ao elemento (IfcRelAggregates), uma por posição, com a
// barra mapeada (IfcMappedItem) em cada cópia. Unidades: metro, m², m³ e radiano; a
// origem é a da planta. A ordem dos atributos é a do EXPRESS do IFC4 ADD2 TC1.
import type {
  ElementoIfc,
  ModeloIfc,
  NivelIfc,
  P3,
  PerfilIfc,
  PosicaoIfc,
  Propriedades,
  ValorPropriedade,
} from "./modelo";
import { type Atributo, ArquivoStep, DERIVADO, en, globalId, real, type Ref, tipado } from "./step";

export interface OpcoesEscrita {
  /** Data do arquivo (cabeçalho e IfcOwnerHistory). Padrão: agora. */
  data?: Date;
  /** Versão do app no IfcApplication. */
  versao?: string;
}

const APLICACAO = "OpenStrut V2";
const PSET = "Pset_OpenStrut";

/** Tipo IFC da barra pela função dela. */
const TIPO_BARRA: Record<PosicaoIfc["tipo"], string> = {
  positiva: "MAIN",
  negativa: "MAIN",
  "porta-estribos": "MAIN",
  construtiva: "MAIN",
  pele: "EDGE",
  estribo: "LIGATURE",
};

const NOME_TIPO_BARRA: Record<PosicaoIfc["tipo"], string> = {
  positiva: "Armadura positiva",
  negativa: "Armadura negativa",
  "porta-estribos": "Porta-estribos",
  construtiva: "Armadura construtiva",
  pele: "Armadura de pele",
  estribo: "Estribo",
};

/** Valor de propriedade com o tipo do select IfcValue. */
function valorIfc(v: ValorPropriedade): Atributo {
  if (typeof v === "boolean") return tipado("IFCBOOLEAN", v);
  if (typeof v === "number") return tipado("IFCREAL", real(v));
  if (typeof v === "string") return tipado(v.length > 255 ? "IFCTEXT" : "IFCLABEL", v);
  return tipado("IFCINTEGER", v.inteiro);
}

/** Escreve o modelo como IFC4. */
export function escreverIfc(modelo: ModeloIfc, opcoes: OpcoesEscrita = {}): string {
  const f = new ArquivoStep();
  const data = opcoes.data ?? new Date();
  const prefixo = modelo.nome;
  const gid = (chave: string) => globalId(`${prefixo}|${chave}`);

  // geometria básica, reaproveitada
  const pontos = new Map<string, Ref>();
  const ponto = (...c: number[]) => {
    const chave = c.map((x) => x.toFixed(9)).join(";");
    let r = pontos.get(chave);
    if (!r) {
      r = f.add(
        "IfcCartesianPoint",
        c.map((x) => real(x)),
      );
      pontos.set(chave, r);
    }
    return r;
  };
  const direcoes = new Map<string, Ref>();
  const direcao = (...c: number[]) => {
    const chave = c.map((x) => x.toFixed(9)).join(";");
    let r = direcoes.get(chave);
    if (!r) {
      r = f.add(
        "IfcDirection",
        c.map((x) => real(x)),
      );
      direcoes.set(chave, r);
    }
    return r;
  };
  const p3 = (p: P3) => ponto(p.x, p.y, p.z);
  const Z = direcao(0, 0, 1);
  const origem3 = ponto(0, 0, 0);
  const posicao3 = (o: Ref = origem3, eixo: Ref | null = null, ref: Ref | null = null) =>
    f.add("IfcAxis2Placement3D", o, eixo, ref);
  const posicao2 = (x: number, y: number) => f.add("IfcAxis2Placement2D", ponto(x, y), null);
  const local = (relativoA: Ref | null, posicao: Ref) =>
    f.add("IfcLocalPlacement", relativoA, posicao);

  // dono, aplicação e unidades
  const pessoa = f.add("IfcPerson", null, null, "OpenStrut", null, null, null, null, null);
  const organizacao = f.add("IfcOrganization", null, "OpenStrut", null, null, null);
  const usuario = f.add("IfcPersonAndOrganization", pessoa, organizacao, null);
  const aplicacao = f.add(
    "IfcApplication",
    organizacao,
    opcoes.versao ?? "2",
    APLICACAO,
    "OpenStrut",
  );
  const segundos = Math.floor(data.getTime() / 1000);
  const dono = f.add(
    "IfcOwnerHistory",
    usuario,
    aplicacao,
    null,
    en("NOTDEFINED"),
    null,
    null,
    null,
    segundos,
  );
  const unidade = (tipo: string, nome: string) =>
    f.add("IfcSIUnit", DERIVADO, en(tipo), null, en(nome));
  const unidades = f.add("IfcUnitAssignment", [
    unidade("LENGTHUNIT", "METRE"),
    unidade("AREAUNIT", "SQUARE_METRE"),
    unidade("VOLUMEUNIT", "CUBIC_METRE"),
    unidade("PLANEANGLEUNIT", "RADIAN"),
  ]);
  const contexto = f.add(
    "IfcGeometricRepresentationContext",
    null,
    "Model",
    3,
    real(1e-5),
    posicao3(),
    direcao(0, 1),
  );
  const corpo = f.add(
    "IfcGeometricRepresentationSubContext",
    "Body",
    "Model",
    DERIVADO,
    DERIVADO,
    DERIVADO,
    DERIVADO,
    contexto,
    null,
    en("MODEL_VIEW"),
    null,
  );

  // estrutura espacial
  const projeto = f.add(
    "IfcProject",
    gid("projeto"),
    dono,
    modelo.nome,
    "Estrutura de concreto armado exportada do OpenStrut V2. Os resultados exigem conferência de engenheiro responsável.",
    null,
    null,
    null,
    [contexto],
    unidades,
  );
  const lugarSite = local(null, posicao3());
  const site = f.add(
    "IfcSite",
    gid("site"),
    dono,
    "Terreno",
    "Origem na origem da planta do OpenStrut",
    null,
    lugarSite,
    null,
    null,
    en("ELEMENT"),
    null,
    null,
    null,
    null,
    null,
  );
  const lugarPredio = local(lugarSite, posicao3());
  const predio = f.add(
    "IfcBuilding",
    gid("predio"),
    dono,
    modelo.nome,
    null,
    null,
    lugarPredio,
    null,
    null,
    en("ELEMENT"),
    null,
    null,
    null,
  );
  const agrega = (chave: string, todo: Ref, partes: Ref[]) =>
    f.add("IfcRelAggregates", gid(chave), dono, null, null, todo, partes);
  agrega("projeto>site", projeto, [site]);
  agrega("site>predio", site, [predio]);

  const pavimentos = new Map<NivelIfc, { ref: Ref; lugar: Ref }>();
  for (const n of modelo.niveis) {
    const lugar = local(lugarPredio, posicao3(ponto(0, 0, n.elevacao)));
    const ref = f.add(
      "IfcBuildingStorey",
      gid(`nivel|${n.chave}`),
      dono,
      n.nome,
      n.descricao ?? null,
      null,
      lugar,
      null,
      null,
      en("ELEMENT"),
      real(n.elevacao),
    );
    pavimentos.set(n, { ref, lugar });
  }
  agrega(
    "predio>niveis",
    predio,
    [...pavimentos.values()].map((p) => p.ref),
  );

  // materiais
  const concreto = f.add("IfcMaterial", modelo.concreto, null, "concrete");
  const acos = new Map<string, Ref>();
  const aco = (nome: string) => {
    let r = acos.get(nome);
    if (!r) {
      r = f.add("IfcMaterial", `Aço ${nome}`, null, "steel");
      acos.set(nome, r);
    }
    return r;
  };
  const comConcreto: Ref[] = [];
  const comAco = new Map<string, Ref[]>();

  const pset = (chave: string, nome: string, alvo: Ref, props: Record<string, Atributo>) => {
    const lista = Object.entries(props).map(([n, v]) =>
      f.add("IfcPropertySingleValue", n, null, v, null),
    );
    if (lista.length === 0) return;
    const ps = f.add("IfcPropertySet", gid(`${chave}|pset|${nome}`), dono, nome, null, lista);
    f.add("IfcRelDefinesByProperties", gid(`${chave}|rel|${nome}`), dono, null, null, [alvo], ps);
  };
  const psetOpenStrut = (chave: string, alvo: Ref, props: Propriedades) =>
    pset(
      chave,
      PSET,
      alvo,
      Object.fromEntries(Object.entries(props).map(([n, v]) => [n, valorIfc(v)])),
    );
  psetOpenStrut("projeto", projeto, {
    ...modelo.propriedades,
    Conferencia: "Os resultados exigem conferência de engenheiro responsável.",
    ...(modelo.avisos.length > 0 ? { AvisosExportacao: modelo.avisos.join(" | ") } : {}),
  });

  /** Perfil IFC; `centro` desloca o perfil no plano dele (o topo da viga em y = 0). */
  const perfil = (p: PerfilIfc, nome: string, centro = { x: 0, y: 0 }) => {
    switch (p.tipo) {
      case "retangulo":
        return f.add(
          "IfcRectangleProfileDef",
          en("AREA"),
          nome,
          posicao2(centro.x, centro.y),
          real(p.largura),
          real(p.altura),
        );
      case "circulo":
        return p.parede
          ? f.add(
              "IfcCircleHollowProfileDef",
              en("AREA"),
              nome,
              posicao2(centro.x, centro.y),
              real(p.raio),
              real(p.parede),
            )
          : f.add(
              "IfcCircleProfileDef",
              en("AREA"),
              nome,
              posicao2(centro.x, centro.y),
              real(p.raio),
            );
      case "poligono":
        return f.add("IfcArbitraryClosedProfileDef", en("AREA"), nome, poligono2(p.pontos));
      case "T":
        return f.add(
          "IfcTShapeProfileDef",
          en("AREA"),
          nome,
          posicao2(centro.x, centro.y),
          real(p.altura),
          real(p.mesa),
          real(p.alma),
          real(p.espessuraMesa),
          null,
          null,
          null,
          null,
          null,
        );
    }
  };
  const poligono2 = (ps: readonly { x: number; y: number }[]) =>
    f.add(
      "IfcPolyline",
      [...ps, ps[0]!].map((p) => ponto(p.x, p.y)),
    );
  const corpoDe = (itens: Ref[], tipo = "SweptSolid") =>
    f.add("IfcShapeRepresentation", corpo, "Body", tipo, itens);
  const forma = (rep: Ref) => f.add("IfcProductDefinitionShape", null, null, [rep]);

  /** Barras de uma posição: a barra modelo mapeada em cada cópia. */
  const barras = (chave: string, e: ElementoIfc, lugarHost: Ref, p: PosicaoIfc) => {
    const raio = p.phi / 2000;
    const linha = f.add("IfcPolyline", p.forma.map(p3));
    const disco = f.add("IfcSweptDiskSolid", linha, real(raio), null, null, null);
    const mapa = f.add("IfcRepresentationMap", posicao3(), corpoDe([disco], "AdvancedSweptSolid"));
    const itens = p.copias.map((c) =>
      f.add(
        "IfcMappedItem",
        mapa,
        f.add("IfcCartesianTransformationOperator3D", null, null, p3(c), null, null),
      ),
    );
    const lugar = local(lugarHost, posicao3());
    const ref = f.add(
      "IfcReinforcingBar",
      gid(chave),
      dono,
      `${e.nome} ${p.nome}`,
      `${p.copias.length} φ${String(p.phi).replace(".", ",")} ${NOME_TIPO_BARRA[p.tipo].toLowerCase()}`,
      NOME_TIPO_BARRA[p.tipo],
      lugar,
      forma(corpoDe(itens, "MappedRepresentation")),
      p.nome,
      p.aco,
      real(p.phi / 1000),
      real(Math.PI * raio * raio),
      real(p.comprimento / 100),
      en(TIPO_BARRA[p.tipo]),
      en(p.aco === "CA-25" ? "PLAIN" : "TEXTURED"),
    );
    comAco.set(p.aco, [...(comAco.get(p.aco) ?? []), ref]);
    pset(chave, "Pset_ReinforcingBarCommon", ref, {
      Reference: tipado("IFCIDENTIFIER", p.nome),
    });
    psetOpenStrut(chave, ref, {
      Posicao: p.nome,
      Elemento: e.nome,
      Tipo: NOME_TIPO_BARRA[p.tipo],
      Bitola_mm: p.phi,
      Quantidade: { inteiro: p.copias.length },
      Comprimento_cm: p.comprimento,
      Aco: p.aco,
    });
    return ref;
  };

  const contidos = new Map<NivelIfc, Ref[]>();
  for (const e of modelo.elementos) {
    const nivel = pavimentos.get(e.nivel);
    if (!nivel) continue;
    let ref: Ref;
    let lugar: Ref;
    let comum: Record<string, Atributo>;
    switch (e.tipo) {
      case "pilar": {
        lugar = local(
          nivel.lugar,
          posicao3(
            ponto(e.x, e.y, e.base),
            Z,
            direcao(Math.cos(e.rotacao), Math.sin(e.rotacao), 0),
          ),
        );
        const solido = f.add(
          "IfcExtrudedAreaSolid",
          perfil(e.perfil, e.nome),
          posicao3(),
          Z,
          real(e.altura),
        );
        ref = f.add(
          "IfcColumn",
          gid(e.chave),
          dono,
          e.nome,
          e.descricao ?? null,
          "Pilar",
          lugar,
          forma(corpoDe([solido])),
          e.nome,
          en("COLUMN"),
        );
        comum = {
          Reference: tipado("IFCIDENTIFIER", e.nome),
          LoadBearing: tipado("IFCBOOLEAN", true),
        };
        pset(e.chave, "Pset_ColumnCommon", ref, comum);
        break;
      }
      case "viga": {
        lugar = local(
          nivel.lugar,
          posicao3(ponto(e.origem.x, e.origem.y, 0), Z, direcao(e.direcao.x, e.direcao.y, 0)),
        );
        // sólido de cada trecho: perfil no plano (y lateral, z), topo em z = 0,
        // extrudado ao longo de x
        const eixoX = direcao(1, 0, 0);
        const lateral = direcao(0, 1, 0);
        const solidos = e.trechos.map((t) =>
          f.add(
            "IfcExtrudedAreaSolid",
            perfil(t.perfil, e.nome, { x: 0, y: -t.perfil.altura / 2 }),
            posicao3(ponto(t.inicio, 0, 0), eixoX, lateral),
            Z,
            real(t.fim - t.inicio),
          ),
        );
        ref = f.add(
          "IfcBeam",
          gid(e.chave),
          dono,
          e.nome,
          e.descricao ?? null,
          e.escada ? "Escada (viga avulsa do SISTRUT)" : "Viga",
          lugar,
          forma(corpoDe(solidos)),
          e.nome,
          en("BEAM"),
        );
        comum = {
          Reference: tipado("IFCIDENTIFIER", e.nome),
          LoadBearing: tipado("IFCBOOLEAN", true),
          Span: tipado("IFCPOSITIVELENGTHMEASURE", real(e.comprimento)),
        };
        pset(e.chave, "Pset_BeamCommon", ref, comum);
        break;
      }
      case "laje": {
        lugar = local(nivel.lugar, posicao3());
        const solido = f.add(
          "IfcExtrudedAreaSolid",
          perfil({ tipo: "poligono", pontos: e.pontos }, e.nome),
          posicao3(ponto(0, 0, -e.espessura)),
          Z,
          real(e.espessura),
        );
        ref = f.add(
          "IfcSlab",
          gid(e.chave),
          dono,
          e.nome,
          e.descricao ?? null,
          "Laje",
          lugar,
          forma(corpoDe([solido])),
          e.nome,
          en("FLOOR"),
        );
        comum = {
          Reference: tipado("IFCIDENTIFIER", e.nome),
          LoadBearing: tipado("IFCBOOLEAN", true),
        };
        pset(e.chave, "Pset_SlabCommon", ref, comum);
        break;
      }
    }
    comConcreto.push(ref);
    contidos.set(e.nivel, [...(contidos.get(e.nivel) ?? []), ref]);
    psetOpenStrut(e.chave, ref, e.propriedades);
    const partes = e.armadura
      .filter((p) => p.copias.length > 0 && p.forma.length >= 2)
      .map((p, i) => barras(`${e.chave}|barra|${i}|${p.nome}`, e, lugar, p));
    if (partes.length > 0) agrega(`${e.chave}>armadura`, ref, partes);
  }

  for (const [nivel, refs] of contidos) {
    const n = pavimentos.get(nivel);
    if (n)
      f.add(
        "IfcRelContainedInSpatialStructure",
        gid(`nivel|${nivel.chave}|contem`),
        dono,
        null,
        null,
        refs,
        n.ref,
      );
  }
  if (comConcreto.length > 0)
    f.add(
      "IfcRelAssociatesMaterial",
      gid("material|concreto"),
      dono,
      null,
      null,
      comConcreto,
      concreto,
    );
  for (const [nome, refs] of comAco)
    f.add("IfcRelAssociatesMaterial", gid(`material|${nome}`), dono, null, null, refs, aco(nome));

  const iso = data.toISOString().slice(0, 19);
  return f.escrever({
    descricao: ["ViewDefinition [DesignTransferView]"],
    nome: `${modelo.nome}.ifc`,
    data: iso,
    autor: "",
    organizacao: "",
    sistema: APLICACAO,
    esquema: "IFC4",
  });
}

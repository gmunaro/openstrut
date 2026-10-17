"""Confere um IFC gerado pelo OpenStrut com o IfcOpenShell e imprime um JSON.

Uso (de uma pasta temporária, com o Python isolado):
    python -I conferir.py <arquivo.ifc>

Saída: esquema, erros do validador (esquema e regras WHERE do EXPRESS), contagem por
tipo, níveis com a elevação, e a caixa envolvente de cada elemento em coordenadas do
mundo (m), gerada pela geometria do IfcOpenShell.
"""

import json
import logging
import sys

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element
import ifcopenshell.util.placement
import ifcopenshell.validate


class Coletor(logging.Handler):
    def __init__(self):
        super().__init__()
        self.erros = []

    def emit(self, record):
        self.erros.append(str(record.getMessage())[:500])


def main(caminho):
    f = ifcopenshell.open(caminho)
    logger = logging.getLogger("validacao")
    logger.setLevel(logging.DEBUG)
    coletor = Coletor()
    logger.addHandler(coletor)
    ifcopenshell.validate.validate(f, logger, express_rules=True)

    tipos = [
        "IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey", "IfcColumn",
        "IfcBeam", "IfcSlab", "IfcReinforcingBar", "IfcMaterial", "IfcPropertySet",
        "IfcRelAggregates", "IfcRelContainedInSpatialStructure",
    ]
    contagem = {t: len(f.by_type(t)) for t in tipos}

    # z da placement do storey no mundo (é por ela que o Revit cria o Level) e o atributo
    # Elevation, que deve ser igual
    niveis = [
        {"nome": s.Name, "elevacao": s.Elevation,
         "z": float(ifcopenshell.util.placement.get_local_placement(s.ObjectPlacement)[2][3]),
         "elementos": sum(len(r.RelatedElements) for r in s.ContainsElements),
         "psets": {k: {p: val for p, val in d.items() if p != "id"}
                   for k, d in ifcopenshell.util.element.get_psets(s).items()}}
        for s in f.by_type("IfcBuildingStorey")
    ]

    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    elementos = []
    falhas_geometria = []
    for e in f.by_type("IfcColumn") + f.by_type("IfcBeam") + f.by_type("IfcSlab") + f.by_type("IfcReinforcingBar")[:400]:
        try:
            forma = ifcopenshell.geom.create_shape(settings, e)
        except Exception as ex:  # noqa: BLE001
            falhas_geometria.append(f"{e.is_a()} {e.Name}: {ex}")
            continue
        v = forma.geometry.verts
        xs, ys, zs = v[0::3], v[1::3], v[2::3]
        if not xs:
            falhas_geometria.append(f"{e.is_a()} {e.Name}: sem vértices")
            continue
        container = ifcopenshell.util.element.get_container(e)
        if container is None and e.is_a("IfcReinforcingBar"):
            pai = ifcopenshell.util.element.get_aggregate(e)
            container = ifcopenshell.util.element.get_container(pai) if pai else None
        psets = ifcopenshell.util.element.get_psets(e)
        elementos.append({
            "tipo": e.is_a(),
            "nome": e.Name,
            "nivel": container.Name if container else None,
            "caixa": [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)],
            "material": [m.Name for m in ifcopenshell.util.element.get_materials(e)],
            "psets": {k: {p: val for p, val in d.items() if p != "id"} for k, d in psets.items()},
        })

    print(json.dumps({
        "esquema": f.schema,
        "erros": coletor.erros,
        "contagem": contagem,
        "niveis": niveis,
        "elementos": elementos,
        "falhasGeometria": falhas_geometria,
        "versao": ifcopenshell.version,
    }, ensure_ascii=True, default=str))


if __name__ == "__main__":
    main(sys.argv[1])

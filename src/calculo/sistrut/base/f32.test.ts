// Referências dos testes:
// - "oráculo" = saída do SISTRUT 4.0 original no DOSBox-X, em oraculo/runs/<run>/
//   (o texto esperado foi copiado da linha citada; o teste não lê o disco);
// - "QB4.5" = ajuda do QuickBASIC 4.5 (CINT/CLNG, FIX/INT, PRINT USING);
// - contas à mão dos valores de entrada: v2-paridade/apoio/livros_*.md.
import { describe, expect, it } from "vitest";
import {
  atribuicao,
  ErroQB,
  qbCint,
  qbClng,
  qbFix,
  qbInt,
  qbIntCasas,
  qbStr,
  qbUsing,
  sng,
} from "./f32";

describe("sng", () => {
  it("atribuicao: sng no original, identidade no corrigido", () => {
    expect(atribuicao("original")(1.4)).toBe(sng(1.4));
    expect(atribuicao("corrigido")(1.4)).toBe(1.4);
  });

  it("arredonda para SINGLE: 1.4 vira 1.39999997615814208984375 (LAJE.BAS:1230)", () => {
    expect(sng(1.4)).toBe(1.39999997615814208984375);
    expect(sng(0.15)).toBe(0.1500000059604644775390625);
  });
});

describe("INT, FIX, CINT, CLNG", () => {
  it("INT é piso: INT(-64.8) = -65 (QB4.5; oráculo caso b, MEP -0,648 impresso -.65)", () => {
    expect(qbInt(-64.8)).toBe(-65);
    expect(qbInt(64.8)).toBe(64);
    expect(qbInt(-3)).toBe(-3);
  });

  it("FIX trunca para zero (QB4.5)", () => {
    expect(qbFix(-64.8)).toBe(-64);
    expect(qbFix(64.8)).toBe(64);
  });

  it("CINT arredonda o meio ao par: 2.5 → 2, 3.5 → 4, -2.5 → -2 (QB4.5; livros U33/U36)", () => {
    expect(qbCint(2.5)).toBe(2);
    expect(qbCint(3.5)).toBe(4);
    expect(qbCint(-2.5)).toBe(-2);
    expect(qbCint(-3.5)).toBe(-4);
    expect(qbCint(2.51)).toBe(3);
  });

  it("CINT do λ do pilar: 3/√(13333,33/400)·100 = 51,96 → 52 (oráculo caso c, impressora.prn:23)", () => {
    expect(qbCint((3 / Math.sqrt(sng(13333.333) / 400)) * 100)).toBe(52);
  });

  it("CINT/CLNG fora da faixa ou NaN dão o inteiro indefinido do x87, sem erro (sondas T17/T19 do oráculo, docs/RETRADUCAO.md da V1)", () => {
    expect(qbCint(32767.5)).toBe(-32768);
    expect(qbCint(-40000)).toBe(-32768);
    expect(qbCint(Number.NaN)).toBe(-32768);
    expect(qbCint(32767.4)).toBe(32767);
    expect(qbCint(-32768.4)).toBe(-32768);
  });

  it("CLNG do Ma do pilar: CLNG(100·0,02·17,37) = CLNG(34,74) = 35 → 0,35 tm (oráculo caso c, impressora.prn:26)", () => {
    expect(qbClng(100 * 0.02 * sng(17.37)) / 100).toBe(0.35);
    expect(qbClng(4.5)).toBe(4);
    expect(qbClng(2147483647.5)).toBe(-2147483648);
  });

  it("INT(R·100)/100 trunca as parcelas do .REP (oráculo caso b, obra/E2E.REP:11 e :23)", () => {
    // R(0) da V1 = 0,729038 e R(1) da V2 = 6,939745 (livros_viga_pilar.md 3.1)
    expect(qbIntCasas(sng(0.729038), 2)).toBe(0.72);
    expect(qbIntCasas(sng(6.939745), 2)).toBe(6.93);
    expect(qbIntCasas(sng(-0.648034), 2)).toBe(-0.65);
  });
});

describe("STR$ de SINGLE", () => {
  it("espaço nos positivos, sem zero antes do ponto (oráculo caso a: 'Fck .15', impressora.prn:15)", () => {
    expect(qbStr(0.15)).toBe(" .15");
    expect(qbStr(5)).toBe(" 5");
    expect(qbStr(0)).toBe(" 0");
    expect(qbStr(1.4)).toBe(" 1.4");
  });

  it("negativo: STR$(INT(-0,648034·100)/100) = '-.65' (oráculo caso b, impressora.prn:24)", () => {
    expect(qbStr(qbIntCasas(sng(-0.648034), 2))).toBe("-.65");
  });

  it("7 algarismos: MEP .REP = INT(100·100·(-0,648034))/10000 = -0,6481 → '-.6481', cortado em '-.64' (oráculo caso b, obra/E2E.REP:12)", () => {
    const s = qbStr(qbIntCasas(100 * sng(-0.648034), 2) / 100);
    expect(s).toBe("-.6481");
    expect(s.slice(0, s.indexOf(".") + 3)).toBe("-.64");
    expect(qbStr(1.1)).toBe(" 1.1"); // parcela da V4 em E2E.REP:11
    expect(qbStr(17.37)).toBe(" 17.37");
    expect(qbStr(1 / 3)).toBe(" .3333333");
  });

  it("notação E fora de 7 algarismos (regra do BASIC da Microsoft: 1E-7 → .0000001, 1E-8 → 1E-08; sem prova no oráculo)", () => {
    expect(qbStr(1e-7)).toBe(" .0000001");
    expect(qbStr(1e-8)).toBe(" 1E-08");
    expect(qbStr(1234567)).toBe(" 1234567");
    expect(qbStr(12345678)).toBe(" 1.234568E+07");
    expect(qbStr(-0.0012)).toBe("-.0012");
    expect(qbStr(-1.234567e-3)).toBe("-1.234567E-03");
    // 1/0 e 0/0 no oráculo: 1.#INF e -1.#IND (sonda T13, docs/RETRADUCAO.md da V1)
    expect(qbStr(Infinity)).toBe(" 1.#INF");
    expect(qbStr(-Infinity)).toBe("-1.#INF");
    expect(qbStr(Number.NaN)).toBe("-1.#IND");
  });
});

describe("PRINT USING", () => {
  it("linha da laje L1 no H imposto (oráculo caso a, impressora.prn:27; máscaras de LAJECALC.BAS:772-796)", () => {
    // x/d = 1,2711/8 (livros_laje.md 2.3); cargas 0,10 / 0,15 / 0,25 / 0,50
    const linha =
      qbUsing(" \\     \\ ##.# ", "L1", sng(10)) +
      qbUsing("  #.### ", sng(1.2711 / 8)) +
      qbUsing("#####   ", 0) +
      "#" +
      qbUsing("##.# c/##.#", sng(6.3), sng(12.5)) +
      qbUsing(" ###.##  ####.##  ####.##  ####.##", sng(0.1), sng(0.15), sng(0.25), sng(0.5));
    expect(linha).toBe(
      " L1      10.0   0.159     0   # 6.3 c/12.5   0.10     0.15     0.25     0.50",
    );
  });

  it("arredonda pelo valor do SINGLE: peso 0,175 → 0,17499999 sai 0.17; total 0,425 → 0,42500001 sai 0.43 (oráculo caso a, impressora.prn:10)", () => {
    expect(sng(0.175)).toBeLessThan(0.175);
    expect(
      qbUsing(" ###.##  ####.##  ####.##  ####.##", sng(0.1), sng(0.15), sng(0.175), sng(0.425)),
    ).toBe("   0.10     0.15     0.17     0.43");
    expect(qbUsing("##.# c/##.#", sng(6.3), sng(7.5))).toBe(" 6.3 c/ 7.5");
  });

  it("momentos da laje L1 (oráculo caso a, impressora.prn:44; M de livros_laje.md 2.2)", () => {
    const linha =
      qbUsing(" \\     \\ ##.#  ", "L1", sng(10)) +
      qbUsing(
        "   ######.##        ######.##    ######.##     ######.##",
        0.2478,
        0.1982,
        0.4955,
        0.3964,
      );
    expect(linha).toBe(" L1      10.0          0.25             0.20         0.50          0.40");
  });

  it("linha de tramo da viga V1 com TAB(10) (oráculo caso b, impressora.prn:25; máscara de VIGA.BAS ≈7562)", () => {
    // Ve, x, M+, Vd, f·EJ de livros_viga_pilar.md 3.1
    const linha =
      " ".repeat(9) +
      qbUsing(
        "     ## ######.##  #####.## #######.## ######.## #####.##",
        1,
        sng(0.729038),
        sng(1.5),
        sng(0.546779),
        sng(1.215064),
        sng(0.664488),
      );
    expect(linha).toBe("               1      0.73      1.50       0.55      1.22     0.66");
  });

  it("negativo com zero antes do ponto e campo de texto (oráculo caso b, impressora.prn:17)", () => {
    const linha =
      " ".repeat(14) +
      qbUsing(
        "          ##      ########.##  #######.##  \\       \\",
        1,
        sng(-0.972051),
        sng(2.430128),
        `  P${qbStr(8)}`,
      );
    expect(linha).toBe("                         1            -0.97        2.43    P 8    ");
  });

  it("x = 1,8750001 sai 1.88 e x = 1,8749999 sai 1.87 (oráculo caso b, impressora.prn:121 V4 e :185 V6)", () => {
    expect(qbUsing("#####.##", sng(1.8750001))).toBe("    1.88");
    expect(qbUsing("#####.##", sng(1.8749999))).toBe("    1.87");
  });

  it("linha do pilar no .REP (oráculo caso b, obra/E2E.REP:22; máscara de VIGA.BAS:2558)", () => {
    expect(qbUsing("P####     #####.##", 5, sng(6.93 + 10.44))).toBe("P   5        17.37");
  });

  it("zero antes do ponto só se couber; '%' quando não cabe (QB4.5)", () => {
    expect(qbUsing("#.##", 0.25)).toBe("0.25");
    expect(qbUsing(".##", 0.25)).toBe(".25");
    expect(qbUsing("#.##", -0.25)).toBe("-.25");
    expect(qbUsing("##.##", -0.25)).toBe("-0.25");
    expect(qbUsing("##.##", 123.456)).toBe("%123.46");
    expect(qbUsing("##", -12)).toBe("%-12");
    expect(qbUsing("###", 0)).toBe("  0");
  });

  it("vírgula de milhar, sinais '+' e '-', literal com '_' e campos '!' e '&' (QB4.5)", () => {
    expect(qbUsing("#####,#####", 1234567)).toBe("  1,234,567");
    expect(qbUsing("(###.##,###.##)", 1.5, -2)).toBe("(  1.50, -2.00)");
    expect(qbUsing("+##.#", 3)).toBe(" +3.0");
    expect(qbUsing("##.#-", -3)).toBe(" 3.0-");
    expect(qbUsing("##+## CORTADAS CADA ##", 2, 2, 25)).toBe(" 2+ 2 CORTADAS CADA 25");
    expect(qbUsing("_###", 5)).toBe("# 5");
    expect(qbUsing("!-&", "Laje", "L1")).toBe("L-L1");
  });

  it("recomeça a máscara e imprime o literal até o próximo campo (QB4.5)", () => {
    expect(qbUsing("##.# m ", 1, 2)).toBe(" 1.0 m  2.0 m ");
    expect(qbUsing("P## e P##", 3)).toBe("P 3 e P");
  });

  it("erros: máscara sem campo (5) e tipo trocado (13)", () => {
    expect(() => qbUsing("abc", 1)).toThrow(ErroQB);
    expect(() => qbUsing("##", "x")).toThrow(ErroQB);
    expect(() => qbUsing("\\ \\", 1)).toThrow(ErroQB);
  });
});

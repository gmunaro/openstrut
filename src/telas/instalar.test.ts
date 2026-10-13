// Detecção da plataforma para a seção "Instalar" da tela inicial. Os user agents
// são de navegadores reais (versões de 2025/2026), sem navegador de verdade.
import { describe, expect, it } from "vitest";
import { detectarPlataforma, estaInstalado, INSTRUCAO_INSTALAR } from "./instalar";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ no modo "site para computador" (padrão): igual ao Safari do Mac
  ipadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0",
  linuxChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
  macFirefox:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
};

const plataforma = (userAgent: string, maxTouchPoints = 0) =>
  detectarPlataforma({ userAgent, maxTouchPoints });

describe("detectarPlataforma", () => {
  it("iPhone e iPad (inclusive o iPad que se apresenta como Mac) → iOS", () => {
    expect(plataforma(UA.iphoneSafari, 5)).toBe("ios");
    expect(plataforma(UA.iphoneChrome, 5)).toBe("ios");
    expect(plataforma(UA.ipadSafari, 5)).toBe("ios");
  });

  it("Android, com Chrome ou Firefox", () => {
    expect(plataforma(UA.androidChrome, 5)).toBe("android");
    expect(plataforma(UA.androidFirefox, 5)).toBe("android");
  });

  it("Chrome e Edge no computador (Windows, Linux)", () => {
    expect(plataforma(UA.windowsChrome)).toBe("chromium-computador");
    expect(plataforma(UA.windowsEdge)).toBe("chromium-computador");
    expect(plataforma(UA.linuxChrome)).toBe("chromium-computador");
  });

  it("Firefox no computador não instala", () => {
    expect(plataforma(UA.windowsFirefox)).toBe("firefox-computador");
    expect(plataforma(UA.macFirefox)).toBe("firefox-computador");
    expect(INSTRUCAO_INSTALAR["firefox-computador"]).toMatch(/não instala/);
  });

  it("Safari no Mac sem toque → Adicionar ao Dock", () => {
    expect(plataforma(UA.macSafari, 0)).toBe("safari-mac");
    expect(INSTRUCAO_INSTALAR["safari-mac"]).toMatch(/Adicionar ao Dock/);
  });

  it("user agent desconhecido → instrução genérica", () => {
    expect(plataforma("Navegador/1.0")).toBe("outro");
  });

  it("cada plataforma tem a instrução certa", () => {
    expect(INSTRUCAO_INSTALAR.ios).toMatch(/Compartilhar.*Adicionar à Tela de Início/);
    expect(INSTRUCAO_INSTALAR.android).toMatch(/Instalar app/);
    expect(INSTRUCAO_INSTALAR["chromium-computador"]).toMatch(/ícone de instalar na barra/);
  });
});

describe("estaInstalado", () => {
  const janela = (standalone: boolean, navigator: object = {}) => ({
    matchMedia: (q: string) => ({ matches: standalone && q === "(display-mode: standalone)" }),
    navigator,
  });

  it("no navegador comum, não", () => {
    expect(estaInstalado(janela(false))).toBe(false);
    expect(estaInstalado(janela(false, { standalone: false }))).toBe(false);
  });

  it("em janela própria (display-mode standalone), sim", () => {
    expect(estaInstalado(janela(true))).toBe(true);
  });

  it("aberto pela Tela de Início do iOS (navigator.standalone), sim", () => {
    expect(estaInstalado(janela(false, { standalone: true }))).toBe(true);
  });
});

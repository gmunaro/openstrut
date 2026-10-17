# Arquivos do SISTRUT 4.0 original

Inventário dos arquivos que os programas do SISTRUT 4.0 (DOS, QuickBASIC 4.5, 1991) gravam e leem. Serve para decidir, extensão por extensão, o que a OpenStrut V2 importa quando o cliente entrega a pasta de uma obra gravada pelo original.

Fontes: a retradução fiel para QB64 em `_Arquivo/Sistrust/dist/src-original/` (conferida contra o original no DOSBox), com os 28 `.BAS`, o runtime `comum/RT45.BM` e os `COMUM_*.BM/.BI` de cada família; as specs `dist/docs/modules/<PROG>.md` e `.strings.txt`; os formatos `dist/docs/formats/INI.md`, `PARAM.md`, `PLOTER.md` e `SISTRUT_INI.md`. O `docs/formats/DADOS.md` descreve o formato da reconstrução antiga e não foi usado. Os leiautes binários vêm dos registros de GET/PUT do código (subs `RT_REG_xxxx_LE` e `RT_REG_xxxx_GRAVA`) e dos leitores da V2.

Como foi levantado: `grep -n -i -E '\b(OPEN|KILL|NAME)\b' */*.BAS comum/RT45.BM` (188 linhas), mais a leitura do contexto de cada uma: o que vem depois no mesmo canal (PRINT #, INPUT #, LINE INPUT #, chamada de `RT_REG_*_GRAVA` ou `_LE`) e de onde vêm as variáveis do nome. Os `COMUM_*.BM/.BI`, o `MIXT.BM` e o `RT45GFX.BM` não têm OPEN, KILL nem NAME. Todo PUT do código fica dentro de uma sub `RT_REG_*_GRAVA`. Só gravam de fato DESENHO, DESINIT, FORMEDCA, LAJEMONT e VIGA. DESDIM, DESEDITA, FORMA, PILGEEDI e VPLOTA têm a sub de gravação, mas não a chamam.

Programas: são 28 `.BAS`, um por EXE. O SISTRUT.BAS é o gerenciador (menu que faz CHAIN para os módulos), então são 27 módulos mais o menu. O `RETRADUCAO.md` usa as duas contagens ("27 EXE" nas linhas 19, 122 e 183; "28 programas" nas linhas 223 e 241). Sete programas não abrem arquivo: LAJECALC, LAJEGEOM, LAJEPROC, DESGRAF, FORMIMP, FORMINIT e PIPROEDI (trabalham com o COMMON e imprimem). O INSTALAR tem spec em `docs/modules`, mas não está entre os 28.

Convenções:

- `PROG.BAS:n` é a linha em `src-original/<família>/PROG.BAS`.
- O padrão `IF RT_DISP%(x) THEN OPEN x FOR APPEND ELSE OPEN x FOR OUTPUT` é o invólucro da retradução para o `OPEN x FOR OUTPUT` do original. `RT_DISP%` (RT45.BM:1549) só é verdadeiro para dispositivo do DOS (PRN, LPT1-3, COMn, AUX, NUL). Para arquivo comum o modo é OUTPUT: o arquivo é recriado do zero. Os APPEND de verdade são os que não têm `RT_DISP%` (VPLOTA.BAS:8616 e RT45.BM:412, 452, 1139).
- OPEN FOR INPUT seguido de CLOSE, sem leitura, é teste de existência. Está marcado "(existência)".
- `<pav>` é o nome que o usuário dá à obra/pavimento no LAJEGRAV (até 8 caracteres). É a base comum de `.LAJ`, `.VIG`, `.SEC`, `.FOR`, `.TAB`, `.REP`, `.RLP` e `.BAK`.
- Os textos de aviso propostos usam `<nome>` para o nome do arquivo, como o aviso atual do `InicioSistrut.ts`.

## 1. Dados da obra

| Ext. | Quem grava | Quem lê | Formato | Conteúdo | Decisão na importação |
|---|---|---|---|---|---|
| `.LAJ` | LAJEGRAV.BAS:375 (cria: 3 linhas de cabeçalho e `FIM`); LAJEGRAV.BAS:503 (regrava a obra inteira, sub L_11c16) | LAJEGRAV.BAS:482 (existência, antes do NAME para .BAK), 712 (cabeçalho e contagem), 888 (leitura completa); FORMA.BAS:588 e 804 (existência), 2911 (leitura) | Texto, PRINT #, um valor por linha. Cabeçalho: `SISTRUT Software e Tecnologia s/c Ltda`, `Obra - <pav>`, `Arquivo con dados de LAJES inicializado em <data> <hora>`. Leiaute: [`lerObraLaj`](../../src/calculo/sistrut/montagem/obraLaj.ts) e [`laje.ts`](../../src/armazenamento/sistrut/laje.ts) | Os dois: geometria, cargas e vigas/pilares digitados; códigos de vínculo e armaduras gravados pelo cálculo | Importar: `importarLaj` ([laje.ts](../../src/armazenamento/sistrut/laje.ts)). Um `.LAJ` com cabeçalho `"SISTRUT40","LAJ",...` é da reconstrução antiga; o `formatoLaj` o reconhece como "entrada" e o `importarV1` o lê |
| `.BAK` | LAJEGRAV.BAS:484 (NAME `<pav>.LAJ` para `<pav>.BAK`); PIGRAEDI.BAS:467 (NAME `<nome>.COL` para `<nome>.BAK`). Antes, apagam o `.BAK` anterior: LAJEGRAV.BAS:471 (existência) e 473 (KILL); PIGRAEDI.BAS:454 (existência) e 456 (KILL) | Ninguém. LAJEGRAV.BAS:471 e PIGRAEDI.BAS:454 só testam a existência antes do KILL | O `.LAJ` ou o `.COL` anterior, renomeado, sem mudança de bytes. A linha 3 diz qual: `...dados de LAJES...` ou `...dados de PILARES...` | Versão anterior dos dados | Ignorar com aviso: "`<nome>`: cópia de segurança que o LAJEGRAV/PIGRAEDI faz antes de regravar; a V2 usa o .LAJ e o .COL." |
| `.VIG` | LAJEMONT.BAS:587 (registro 1), 590 (uma viga por registro, montada em S_33d84), 602 (registro 1 de novo, com a contagem); VIGA.BAS:2699 (regrava a viga calculada), 6068 (registro 1), 6205 e 6220 (gravação de um intervalo de vigas da memória, opção de gravação) | VIGA.BAS:1938 (existência), 1940, 1963 (existência), 2031, 2685 (existência), 2687, 2694 (existência), 6168 (existência), 6174, 6268 (existência), 6274, 6341 (existência), 6347, 6415, 6568 (existência), 6574, 6603; DESDIM.BAS:755 (existência), 757; DESENHO.BAS:1096 (existência), 1163, 1182 (existência), 1184, 1464 (existência), 1466, 1610 (existência), 1612, 2170 (existência), 2172, 2551 (existência), 2553; FORMA.BAS:3187, 3236; PILGEEDI.BAS:815 (existência), 817, 927; VPLOTA.BAS:2806 (existência), 2808 | Binário, RANDOM LEN = 855, SINGLE e INTEGER little-endian. Registro 1 = cabeçalho (INTEGER do byte 26 = nº de vigas); registro r + 1 = viga r. Leiaute em [`viga.ts`](../../src/armazenamento/sistrut/viga.ts) (`lerVig`) | Os dois: vãos e cargas da montagem do LAJEMONT; reações e marcas regravadas pelo VIGA | Importar: `lerVig` / `importarVigasSistrut` ([viga.ts](../../src/armazenamento/sistrut/viga.ts)) |
| `.SEC` | DESENHO.BAS:1395 (cria com o registro 1 vazio quando o arquivo não existe, ERR 53 depois da 1365), 1568 (registro da viga) | DESENHO.BAS:1365 (existência), 1489 (existência), 1491, 1566 (existência), 1619 (existência), 1621, 2558 (existência), 2560; DESDIM.BAS:762 (existência), 764; DESEDITA.BAS:892; FORMA.BAS:637 e 822 (existência: o FORMA aceita o "Arquivo de Vigas" pelo `.SEC`), 3198; PILGEEDI.BAS:813 (existência), 931; VPLOTA.BAS:2813 (existência), 2815 | Binário, RANDOM LEN = 346; registro r = viga r. Leiaute em [`viga.ts`](../../src/armazenamento/sistrut/viga.ts) (`lerSec`) | Entrada: seções das vigas digitadas no DESENHO | Importar: `lerSec` ([viga.ts](../../src/armazenamento/sistrut/viga.ts)) |
| `.FOR` | DESENHO.BAS:1436 (cria com o registro 1 quando não existe), 1575 (registro da viga); FORMEDCA.BAS:2978 (NAME do `.$$$` gravado em FORMEDCA.BAS:6841 para `.FOR`) | DESENHO.BAS:1407 (existência), 1505 (existência), 1507, 1658 (existência), 1660, 2674 (existência), 2676; DESDIM.BAS:784 (existência), 786; DESEDITA.BAS:887; FORMEDCA.BAS:2970 (existência, antes do NAME para `.FOK`); VPLOTA.BAS:2820 (existência), 2822 | Binário, RANDOM LEN = 616; registro r = viga r. Leiaute em [`viga.ts`](../../src/armazenamento/sistrut/viga.ts) (`lerFor`) | Os dois: apoios digitados no DESENHO; a forma regravada pelo FORMEDCA | Importar: `lerFor` ([viga.ts](../../src/armazenamento/sistrut/viga.ts)) |
| `.TAB` | DESINIT.BAS:959 (registro da viga, com o nome `"~" + nome` em 10 caracteres); DESENHO.BAS:2400 | DESENHO.BAS:2168 (existência), 2392 | Binário, RANDOM LEN = 70: nome (`"~" + nome`, 10 bytes) e A_1CEC(0..14) em SINGLE: 0 repetições, 1 volume e 2 fôrma (centésimos de m³ e m²), 3 fck, 4 fyk (t/cm²), 5 a 14 comprimento por bitola do .DSP (cm). Leiaute em [`viga.ts`](../../src/armazenamento/sistrut/viga.ts) (`lerTab`) e [`quant/vigas.ts`](../../src/calculo/sistrut/quant/vigas.ts) | Os dois: repetições digitadas no DESENHO; o resto é o quadro de ferros, que o DESINIT refaz com a armadura editada ao voltar do DESEDCAO (S_202b9, DESINIT.BAS:96-104) | Importar: `lerTab`, só as repetições. O quadro gravado é o resultado do original, com a edição do `.EDV` já aplicada: serve de referência para conferir o quadro da V2 (ver a seção 9) |
| `.REP` | VIGA.BAS:2634 (OUTPUT; cabeçalho `SOMATORIA DE REACOES EM PILARES`, `OBRA <pav>`) | PILGEEDI.BAS:440 (existência), 552 (leitura) | Texto, PRINT #. Leiaute em [`pilar.ts`](../../src/armazenamento/sistrut/pilar.ts) (`lerRep`) | Resultado: reações das vigas nos pilares | Importar: `lerRep` ([pilar.ts](../../src/armazenamento/sistrut/pilar.ts)) |
| `.RLP` | LAJEMONT.BAS:609 (OUTPUT; cabeçalho `SOMATORIA DE REACOES EM PILARES E INCLINACOES GERADAS PELAS LAJES`) | PILGEEDI.BAS:445 (existência, logo depois do `.REP` de mesmo nome), 1057 (leitura) | Texto, PRINT #. Leiaute em [`pilar.ts`](../../src/armazenamento/sistrut/pilar.ts) (`lerRlp`) | Resultado: cargas de laje direto nos pilares e inclinações | Importar: `lerRlp`, só junto com o `.REP` de mesmo nome (o `InicioSistrut.ts` avisa e ignora o `.RLP` sozinho) |
| `.COL` | PIGRAEDI.BAS:377 (cria: cabeçalho e `FIM`), 484 (regrava tudo) | PIGRAEDI.BAS:465 (existência, antes do NAME para `.BAK`), 673 (existência), 680, 884 (existência), 889; FORMA.BAS:686 e 840 (existência), 2735 (leitura) | Texto, PRINT #. Cabeçalho: `SISTRUT Software e Tecnologia s/c Ltda`, `Obra - <nome>`, `Arquivo com dados de PILARES inicializado em ...`, `n =NUMERO DE NIVEIS`. Leiaute em [`pilar.ts`](../../src/armazenamento/sistrut/pilar.ts) (`lerCol`) | Os dois: geometria, cargas e armaduras dos pilares | Importar: `lerCol` ([pilar.ts](../../src/armazenamento/sistrut/pilar.ts)) |
| `.PIL` | PILAR.BAS:7927 (OUTPUT) | PILAR.BAS:8000; PILAREDI.BAS:3651 | Texto, PRINT # e INPUT #, um valor por linha. Leiaute em [`pilar.ts`](../../src/armazenamento/sistrut/pilar.ts) (`lerPil`) | Entrada: seção avulsa de um pilar | Importar: `lerPil` ([pilar.ts](../../src/armazenamento/sistrut/pilar.ts)) |
| `.EDV` | DESEDCAO.BAS:464 (OUTPUT; grava até a 588) | DESEDITA.BAS:405 (existência), 745 (registro inteiro, até a 880); VPLOTA.BAS:2707 (existência), 2803 (registro inteiro, no GOSUB L_17f9f) | Texto, PRINT #, um valor por linha. Ver a seção ".EDV" | Entrada: armadura editada no DESEDCAO, mais notas | Importar: leitor `edv.ts` (ver seção .EDV) |
| `.FRM` | FORMEDCA.BAS:2722 (OUTPUT) | FORMA.BAS:771 (existência), 784 (linhas 1 a 9: nomes dos arquivos), 904 (leitura completa) | Texto, PRINT #. Linhas 1-2 cabeçalho (`arquivo de dados de forma gravado em ...`); 3-5 nomes do `.LAJ`, do arquivo de vigas e do `.COL`; 6-8 os diretórios deles; 9 o nome da `.FOP`; 10-12 zeros; 13 em diante, a lista `A_157e%` e o resto da forma (FORMEDCA.BAS:2723-2740). Leiaute completo não levantado | Entrada: forma montada e editada no FORMEDCA | Pendente: a V2 não tem leitor nem modelo para o desenho de forma montado pelo usuário |
| `.AVF` | VPLOTA.BAS:3063 (OUTPUT, se o usuário aceita "Gravo o conjunto de folhas") | VPLOTA.BAS:3319 | Texto, PRINT #: 2 linhas de cabeçalho, data e hora, depois os valores da montagem (tamanho da folha, margens, ordem das vigas). Leiaute completo não levantado | Entrada: arranjo das vigas nas folhas de plotagem | Ignorar com aviso: "`<nome>`: arranjo das vigas nas folhas de plotagem do VPLOTA; a V2 não monta folhas de plotagem." |

## 2. Parametrização (`.LAP`, `.PIP`, `.DSP`, `.FOP`)

Ficam no diretório de parametrização da instalação (`C:\SISTRUT\EXEC40\` no padrão), não na pasta da obra. Por isso, ao receber uma obra, peça também os `.LAP`, `.DSP`, `.PIP` e `.INI` desse diretório. Sem eles, a V2 usa os de fábrica, e o detalhamento e o quantitativo podem divergir do `.TAB` gravado pelo original. A pasta inteira traz vários `.DSP`: a importação usa o da linha 1 do `DESENHO.INI` ou, sem ele, o da parametrização que o `.COL` aponta, e pergunta na tela quando nenhum dos dois decide (`docs/MODO-CALCULO.md`, "Vários .DSP"). Com o nome `SISTRUT` o original não lê o arquivo e usa a tabela embutida (LAJE.BAS:1262, DESENHO.BAS:4837, PILAREDI.BAS:1885), que a V2 transcreveu em [`parametros.ts`](../../src/calculo/sistrut/base/parametros.ts). Quem grava é o SISEDIT, editor de texto genérico (ver a seção 6).

| Ext. | Quem grava | Quem lê | Formato | Conteúdo | Decisão na importação |
|---|---|---|---|---|---|
| `.LAP` | SISEDIT.BAS:832 (qualquer nome; recusa nome com `SISTRUT.LAP`, SISEDIT.BAS:808-810) | LAJE.BAS:1385 (LINE INPUT, pula linhas com `*`) | Texto (`dist/docs/formats/PARAM.md`, seção SISTRUT.LAP) | Entrada: parâmetros de laje | Pendente: a V2 não lê `.LAP` (usa `PARAMETROS_LAJE`), e o `.LAJ` não guarda o nome da parametrização usada |
| `.PIP` | SISEDIT.BAS:832 (recusa `SISTRUT.PIP`) | PILAREDI.BAS:1953 | Texto (PARAM.md, SISTRUT.PIP). Leiaute em [`pilar.ts`](../../src/armazenamento/sistrut/pilar.ts) (`lerPip`) | Entrada: parâmetros de pilar | Importar: `lerPip` ([pilar.ts](../../src/armazenamento/sistrut/pilar.ts)) |
| `.DSP` | SISEDIT.BAS:832 (recusa `SISTRUT.DSP`) | DESENHO.BAS:5169 (leitura na sub L_23333); VPLOTA.BAS:6505 (existência; leitura no GOSUB L_40bc7) | Texto (PARAM.md, SISTRUT.DSP; termina com bytes 0x1A). Leiaute em [`viga.ts`](../../src/armazenamento/sistrut/viga.ts) (`lerDsp`) | Entrada: parâmetros de detalhamento | Importar: `lerDsp` ([viga.ts](../../src/armazenamento/sistrut/viga.ts)) |
| `.FOP` | Ninguém: não há OPEN de `.FOP` no código | Ninguém. FORMA.BAS:1833 pede o diretório e FORMPLOT.BAS:1486 pede o nome; o nome vai para a linha 9 do `.FRM` (FORMEDCA.BAS:2731) e não é aberto. O `.FOK` não tem relação (é a cópia do `.FOR`, seção 4) | O `SISTRUT.FOP` distribuído tem 11 linhas de texto livre (PARAM.md) | Nenhum uso | Ignorar com aviso: "`<nome>`: parametrização da forma que o SISTRUT original não lê." |

## 3. Arquivos de configuração (`.INI`)

Todos de nome fixo, no diretório dos executáveis. Texto `VALOR=DESCRICAO` lido por LINE INPUT ou INPUT # na ordem das linhas (`dist/docs/formats/INI.md`). Qualquer um deles pode ter sido editado no SISEDIT (SISEDIT.BAS:744 e 832).

| Nome | Quem grava | Quem lê | Formato | Conteúdo | Decisão na importação |
|---|---|---|---|---|---|
| `SISTRUT.INI` | SISTRUT.BAS:1305 (OUTPUT, ao reconfigurar a instalação) | SISTRUT.BAS:134 (início), 1297 (lê 9 linhas antes de regravar) | Texto (`dist/docs/formats/SISTRUT_INI.md`) | Configuração da instalação (drive, monitor, portas) | Ignorar com aviso: "`<nome>`: configuração da instalação do SISTRUT (drives, monitor, impressora); a V2 não usa." |
| `LAJE.INI` | SISEDIT (seção 6) | LAJE.BAS:142 | Texto (INI.md) | Entrada: diretórios, limites, unidades, fck, fyk, aço e coeficientes de segurança | Pendente: a importação do `.LAJ` hoje tira os materiais das opções (`OpcoesImportacaoLaj`); o `LAJE.INI` da obra poderia fornecê-los |
| `VIGA.INI` | SISEDIT | VIGA.BAS:594 | Texto (INI.md) | Entrada: unidades, redução de momentos, carga acidental | Importar: `lerVigaIni` ([viga.ts](../../src/armazenamento/sistrut/viga.ts)) |
| `DESENHO.INI` | SISEDIT | DESENHO.BAS:741 | Texto (INI.md) | Entrada: diretórios, parametrização padrão, coeficientes de medida e força | Importar: `lerDesenhoIni` ([viga.ts](../../src/armazenamento/sistrut/viga.ts)) |
| `PILAR.INI` | SISEDIT | PILAR.BAS:597 | Texto (INI.md) | Entrada: bitolas, excentricidade, esbeltez | Pendente: a V2 tem os valores de fábrica em `parametros.ts`, mas não lê o arquivo |
| `ARMADURA.INI` | SISEDIT | ARMADURA.BAS:226 | Texto (INI.md) | Configuração do módulo ARMADURA (listas de bitolas) | Ignorar com aviso: "`<nome>`: configuração do módulo ARMADURA do SISTRUT; a V2 não usa." |
| `FORMA.INI` | SISEDIT | FORMA.BAS:228 | Texto (INI.md) | Configuração do módulo FORMA (folha, carimbo, impressão) | Ignorar com aviso: "`<nome>`: configuração do módulo FORMA do SISTRUT; a V2 não usa." |
| `PLOTER.INI` | SISEDIT | FORMPLOT.BAS:1524; VPLOTA.BAS:8056 | Texto (`dist/docs/formats/PLOTER.md`) | Configuração dos plotters | Ignorar com aviso: "`<nome>`: configuração dos plotters do SISTRUT; a V2 não usa." |
| `VPLOTA.INI` | VPLOTA.BAS:918 (OUTPUT, opção "Gravar em disco") | VPLOTA.BAS:951 | Texto (INI.md) | Configuração do VPLOTA (folha, diretórios, `.DSP` da montagem) | Ignorar com aviso: "`<nome>`: configuração da montagem de folhas do VPLOTA; a V2 não usa." |

Hoje o `importarVigasSistrut` aceita só `VIGA.INI` e `DESENHO.INI` e avisa os outros com "`<nome>` ignorado: só .VIG, .SEC, .FOR, .TAB, .DSP, VIGA.INI e DESENHO.INI são importados aqui." (viga.ts:814). Os textos acima são para substituir esse aviso genérico.

## 4. Desenho e plotagem

Todos são resultado gerado a partir dos dados acima. Decisão comum: ignorar com aviso, com o texto "`<nome>`: desenho gerado pelo SISTRUT (DESIMP/VPLOTA/FORMPLOT); a V2 gera os próprios desenhos a partir dos dados." Para o `.PLT`, trocar "desenho" por "arquivo de plotagem".

| Arquivo | Quem grava | Quem lê | Formato | Conteúdo | Decisão |
|---|---|---|---|---|---|
| `R<n>_<pav4>.DXF` | DESIMP.BAS:4003 (OUTPUT, opção CAD "<A>utocad", DESENHO.BAS:1814-1830) | VPLOTA.BAS:1654 (primeira linha, para achar quais vigas existem), 1761 (entidades `LINE`, para as dimensões), 8611 (cópia para a folha) | Texto DXF ASCII: `0 SECTION 2 ENTITIES ... 0 ENDSEC 0 EOF` (DESIMP.BAS:4003-4032) | Resultado: desenho de uma viga | Ignorar com aviso |
| `R<n>_<pav4>.PUB` | DESIMP.BAS:4010 (OUTPUT, opção CAD "<C>adtec") | Ninguém | Texto, cabeçalho `* PROGER   SISTRUT-DESENHO VERSAO 40`, `$ UNI      1.00 mm`, `!          ENTIDADES` | Resultado: desenho de uma viga para Cadtec | Ignorar com aviso |
| `V<n>_<pav4>.DXF` | Nenhum dos 28 programas | VPLOTA.BAS:1654 (tentado antes do `R...`; em erro o VPLOTA troca o prefixo para `R`, VPLOTA.BAS:1647-1680), 1761, 8611 | DXF (o mesmo leitor do `R...`) | Desconhecido (lacuna 1) | Ignorar com aviso |
| `FV<f>_<pav4>.DXF` | VPLOTA.BAS:8613 (OUTPUT na primeira viga da folha), 8616 (APPEND nas seguintes); VPLOTA.BAS:2329 apaga a folha quando o disco enche (ERR 61) | Ninguém | DXF montado com várias vigas | Resultado: folha montada | Ignorar com aviso |
| `<nome>.DXF` do FORMPLOT | FORMPLOT.BAS:3879 (OUTPUT) | Ninguém | DXF | Resultado: desenho de forma | Ignorar com aviso |
| `FV<f>_<pav4>.PLT` | VPLOTA.BAS:5243 (OUTPUT, plotagem em arquivo) | Ninguém | Texto com os comandos do plotter escolhido no PLOTER.INI (HP-GL, Houston etc.) | Resultado: plotagem de uma folha | Ignorar com aviso |
| `<forma>.PLT` | FORMPLOT.BAS:2518 (OUTPUT, plotagem em arquivo) | Ninguém | Igual ao anterior | Resultado: plotagem da forma | Ignorar com aviso |
| Porta do plotter | FORMPLOT.BAS:2522 e VPLOTA.BAS:5247 (`LPTn`); FORMPLOT.BAS:2525 e VPLOTA.BAS:5250 (`COM<campo>,CS65535,...` em RANDOM) | Ninguém | O nome vem do campo 2 do bloco do plotter no PLOTER.INI (FORMPLOT.BAS:1540, VPLOTA.BAS:8074): `LPT1:` ou `1:2400,e,7,2` | Dispositivo, não arquivo | Descartado: não gera arquivo em disco |

## 5. Cópias de segurança, temporários e proteção

| Arquivo | Quem grava | Quem lê | Formato | Conteúdo | Decisão |
|---|---|---|---|---|---|
| `.$$$` | FORMEDCA.BAS:6841 (RANDOM LEN = 616, um registro por viga, sub S_3018c) | Ninguém; FORMEDCA.BAS:2978 o renomeia para `.FOR` | Igual ao `.FOR` | Temporário da regravação do `.FOR` | Ignorar com aviso: "`<nome>`: arquivo temporário do FORMEDCA que sobrou de uma gravação interrompida; a V2 usa o .FOR." |
| `.FOK` | FORMEDCA.BAS:2974 (NAME `.FOR` para `.FOK`); antes, FORMEDCA.BAS:2959 (existência) e 2961 (KILL do `.FOK` anterior) | Ninguém | Igual ao `.FOR` (é o `.FOR` anterior renomeado) | Versão anterior do `.FOR` | Ignorar com aviso: "`<nome>`: cópia de segurança que o FORMEDCA faz antes de regravar o .FOR; a V2 usa o .FOR." |
| `TEMP` | SISTRUT.BAS:159, 166, 174, 178 (proteção contra cópia, comentada na retradução). O original fazia `SHELL "VOL>"` / `"VER>" + TEMP`, lia (`OPEN "I"`) e apagava (`KILL`) no diretório de implantação | O próprio SISTRUT, logo antes do KILL | Saída de texto do VOL/VER do DOS | Temporário da proteção | Ignorar com aviso: "`<nome>`: arquivo temporário do gerenciador do SISTRUT; a V2 não usa." (aparece em `sistrut-game/TEMP`) |

## 6. Arquivos de nome livre: SISEDIT

O SISEDIT é o editor de texto do sistema. Lê (SISEDIT.BAS:744, LINE INPUT até o EOF) e grava (SISEDIT.BAS:832, PRINT # linha a linha, OUTPUT) qualquer arquivo cujo nome o usuário digita (`V_0e38$`, SISEDIT.BAS:732, 795 e 804). Drive e diretório vêm de `V_0dc4$` e `V_0dc8$`; um nome com caminho completo os troca (SISEDIT.BAS:870-888). A tela sugere `SISTRUT.DSP`, `SISTRUT.LAP` e `SISTRUT.PIP` e recusa gravar com nome que contenha um deles (SISEDIT.BAS:808-819: "Salve com OUTRO NOME com a mesma extencao"). Na prática grava `.LAP`, `.PIP`, `.DSP` e os `.INI`, mas qualquer arquivo de texto da pasta pode ter passado por ele. Não há extensão própria do SISEDIT.

## 7. Runtime da retradução (RT45.BM)

Estes arquivos são da retradução em QB64, não do original. Não aparecem em pastas gravadas pelo SISTRUT no DOS.

| Arquivo | Linhas | Uso | Decisão |
|---|---|---|---|
| Arquivo de troca do CHAIN/RUN: `%TEMP%\SISTRUT_<PROG>_<n>.CHN` (RT45.BM:91) | RT45.BM:76 (grava no CHAIN), 1111 (grava no RUN), 43 (lê no início do EXE chamado), 47 (KILL) | Leva o COMMON, a tela e a posição do roteiro de um EXE para o próximo (binário próprio) | Ignorar com aviso: "`<nome>`: arquivo de troca da retradução do SISTRUT; não é dado da obra." |
| Captura da impressora: `$SISTRUT_IMPRESSORA`, `<SISTRUT_SAIDA>impressora.prn` ou `IMPRESSORA.PRN` | RT45.BM:412 (APPEND), 428 (BINARY: refaz as quebras de linha), 452 (APPEND de novo) | Bytes que o LPRINT mandaria para a LPT1 no original | Ignorar com aviso: "`<nome>`: saída de impressora capturada; não é dado da obra." |
| Roteiro de teclas: `$SISTRUT_ROTEIRO` | RT45.BM:940 (INPUT) | Teclas da execução automática | Não aparece na obra |
| Telas: `<SISTRUT_SAIDA>telas\NNN_<nome>.txt`, `.realce.txt`, `.atr.txt` (e `.png` por `_SAVEIMAGE`, sem OPEN) | RT45.BM:1044, 1057, 1067 (OUTPUT) | Cópia das telas para comparação com o oráculo | Não aparece na obra |
| Log: `$SISTRUT_LOG` | RT45.BM:1139 (APPEND) | Depuração | Não aparece na obra |

## 8. Regra de formação dos nomes variáveis

- `<pav>.LAJ`: "Nome do arquivo" digitado no LAJEGRAV (LAJEGRAV.BAS:342). Recusado se tiver mais de 8 caracteres, for numérico ou tiver espaço, `.`, `\` ou `/` (LAJEGRAV.BAS:349-357); `D` abre o diretório. Drive `V_0dfc$` e diretório `V_0e00$` do LAJE.INI (LAJE.BAS:230-231), trocáveis no LAJEGRAV (LAJEGRAV.BAS:1122-1146). O LAJEMONT grava `<pav>.VIG` e `<pav>.RLP` com o mesmo nome (`V_0e24$`, LAJEMONT.BAS:587 e 609).
- `<pav>.VIG`, `.REP`: nome da obra no VIGA (`V_0e00$`; na gravação de intervalo, `V_0e04$`, VIGA.BAS:6464-6472). O `.REP` sai com o nome do `.VIG` (VIGA.BAS:2634).
- `<pav>.SEC`, `.FOR`, `.TAB`: nome do `.VIG` escolhido no DESENHO (`V_0dd8$`), no diretório de vigas do DESENHO.INI (`V_0dc0$`, DESENHO.BAS:784). O FORMEDCA usa o "Arquivo de Vigas" do FORMA (`V_0e26$`, FORMA.BAS:614).
- `<nome>.COL`: nome digitado no PIGRAEDI (`V_1492$`, PIGRAEDI.BAS:349), com a mesma validação do `.LAJ` (PIGRAEDI.BAS:350-364). Independente do `<pav>`: uma obra de vários pavimentos tem um `.COL` só, de nome próprio, ao lado de `COB.LAJ`, `SUP.LAJ` etc.
- `<nome>.BAK`: o nome do `.LAJ` ou do `.COL` que foi copiado. Como a extensão é a mesma, `X.LAJ` e `X.COL` na mesma pasta disputam o `X.BAK`: a última gravação apaga a cópia da outra (LAJEGRAV.BAS:473, PIGRAEDI.BAS:456).
- `<pilar>.PIL`: "Nome do Pilar" digitado (PILAR.BAS:6670-6696, PILAREDI.BAS:3095-3109): até 8 caracteres, não numérico, sem `\`, `,` ou `*`.
- `<param>.LAP`, `.PIP`, `.DSP`: nome da parametrização. Padrão `SISTRUT` (LAJE.BAS:126, PILAREDI.BAS:111, DESENHO.BAS:2887), trocável na tela de cada módulo; `.PIP` em `V_0e18$ + V_0e14$` (PILAREDI.BAS:732-740); `.DSP` do VPLOTA vem do VPLOTA.INI (VPLOTA.BAS:994).
- `R<n><_...><pav4>.EDV`, `.DXF`, `.PUB` (DESEDCAO.BAS:464, DESIMP.BAS:4003 e 4010, DESEDITA.BAS:402, VPLOTA.BAS:1654 e 2707): `"R"` + número da viga sem o espaço do STR$ (`MID$(STR$(n), 2)`) + `STRING$(k, "_")` com `k = (n > 99) + (n > 9) + 2` (no QB verdadeiro vale −1: k = 2 para n < 10, 1 para 10 a 99, 0 a partir de 100), de modo que número e sublinhados somam 3 caracteres + os 4 primeiros caracteres de `<pav>` + extensão. Exemplos: `R4__TER.EDV`, `R10_SUP.EDV`. O diretório é o de `.EDV` (`V_1812$`) ou o de `.DXF` (`V_1816$`) do DESENHO.INI (DESENHO.BAS:786-787).
- `V<n><_...><pav4>.DXF`: mesma regra com `"V"` (VPLOTA.BAS:1647).
- `FV<f><_...><pav4>.DXF` e `.PLT` (VPLOTA.BAS:8613, 5243): `"FV"` + número da folha (`LTRIM$(STR$(f))`) + `STRING$((f > 9) + 1, "_")` (um `_` se f < 10, nenhum a partir de 10) + 4 primeiros caracteres de `<pav>`. Exemplo do oráculo: `FV1_E2E.DXF`, `FV1_E2E.PLT`.
- `<pav>.AVF`: nome da obra (`V_146c$`) no diretório de dados (`V_0dc0$`) (VPLOTA.BAS:3063).
- `<forma>.FRM`: "Nome do Arquivo de Forma" digitado no FORMA (`V_0e32$`, FORMA.BAS:748).
- `<forma>.PLT` do FORMPLOT: nome da forma (`V_0e32$`) no diretório de plotagem (`V_0e52$`) (FORMPLOT.BAS:2518). Ver a lacuna 2.
- `<nome>.DXF` do FORMPLOT: nome digitado em "Geracao de arquivo CAD (.DXF)", padrão o nome da forma (FORMPLOT.BAS:530-542), no diretório `V_0e4a$` (FORMPLOT.BAS:988).
- `<forma>.FOK`, `.$$$`: nome do arquivo de vigas da forma (`V_0e26$`), no diretório `V_0e3e$` (FORMEDCA.BAS:2959-2978, 6841).

## 9. .EDV

Leitor: [`edv.ts`](../../src/armazenamento/sistrut/edv.ts) (`lerEdv`, `nomeEdv`, `casarEdv`), com testes em `edv.test.ts`. Ele lê os 35 `.EDV` do original que existem no corpus (19 do cliente e 16 do oráculo).

- Grava: DESEDCAO.BAS:464-588, sub L_11637, OUTPUT, PRINT # um valor por linha. Um registro por arquivo e um arquivo por viga; regravar a viga sobrescreve.
- Leem: DESEDITA.BAS:405 (existência, nome montado na 402); DESEDITA.BAS:745-880 (registro inteiro, INPUT #, para reeditar ou imprimir); VPLOTA.BAS:2707 (existência e as duas primeiras linhas); VPLOTA.BAS:2803 (registro inteiro, no GOSUB L_17f9f, para montar a folha).
- Nome: `R` + registro da viga no `.SEC`/`.FOR` (a n-ésima viga do `.VIG`) + `_` até 3 caracteres + 4 primeiros caracteres do pavimento (seção 8).
- Leiaute, na ordem (os nomes das colunas são os do porte do DESINIT, `calculo/sistrut/vigas/desinitComum.ts`):
  1. nome da viga (`V_0DD4$`, "V5"); comprimento de ponta a ponta, cm; fck e fyk (t/cm²); multiplicador e nome da unidade ("t/cm2"); cobrimento e cobrimento + acréscimo, cm; repetições (`A_1CBE%`); nº de tramos; balanço esquerdo e direito (0/1);
  2. negativas: contagem e, para cada uma, quantidade, φ, início, fim (cm) e as duas dobras (A_1AF2, A_1B4E);
  3. grampos negativos: contagem e, para cada um, quantidade, φ, início, fim, lado (0 esq., 1 dir.) e largura (A_1BD8);
  4. positivas e grampos positivos, como 2 e 3 (A_1AC4, A_1B20, A_1BAA);
  5. porta-estribos: contagem e quantidade, φ, início, fim (A_1B7C);
  6. pele: nº de linhas do quadro; se ≠ 0, quantidade por face, φ, início e fim de cada trecho 0..n + balanço direito (A_1C34) e o nº de trechos por bitola 0..5 (A_1A96%);
  7. estribos: contagem e início, fim, φ, espaçamento, estribos lado a lado, `INT(bw) + h·0,0001` e nº da posição (A_1C06);
  8. 4 notas da forma (A_1C90$(2..5): tramo em 2 caracteres, E/C/D, texto até 40);
  9. M+ do detalhamento de cada trecho 0..n + balanço direito, t·m (A_128E(t,4));
  10. notas da armadura até o fim do arquivo (A_1C90$(6..): "N", posição em 2 caracteres, texto).
- Conteúdo: entrada do usuário. É a armadura que o engenheiro editou à mão no DESEDCAO, mais as notas do desenho.
- O que a edição muda no original: do DESEDCAO o controle volta ao DESINIT, que refaz o quadro de ferros com os arrays editados e regrava o `.TAB` (S_202b9, DESINIT.BAS:96-104 e 404-966) antes do DESIMP. O desenho impresso, o DXF, a folha do VPLOTA, o `.TAB` e o resumo de aço do DESENHO saem todos da armadura editada. Conferido na obra do cliente: nas 19 vigas com `.EDV`, os comprimentos das barras longitudinais tirados do `.EDV` (fim − início + dobras, × quantidade) batem com o `.TAB`. A exceção são as φ12,5 com dobra, de 8 a 16 cm, por causa do desconto de dobra que esse cálculo de conferência não aplica.
- Decisão: importar e aplicar no detalhamento e no quantitativo da viga.

### Ligação na V2

1. **Importação** (`telas/InicioSistrut.ts`, leitor de `LEITORES_EXTRA`; a lógica é `aplicarEdv` em `edv.ts`): decodifica cada `.EDV` em windows-1252, chama `lerEdv`, monta a lista `VigaDoVig` (pavimento = base do `.VIG`, registro = ordem da viga no `.VIG`, a mesma do `.SEC`/`.FOR`, e nome) e chama `casarEdv`. A edição casada vai para a viga, com um aviso só que lista as vigas editadas. O `.EDV` ilegível, sem viga no registro, de nome trocado ou cuja viga não entrou na obra fica de fora, com o motivo no aviso e no resumo.
2. **Domínio** (`dominio/edicaoViga.ts`, `dominio/obra.ts`): campo opcional `Viga.armaduraEditada?: EdicaoVigaSistrut`, nas unidades do original. Ausente = detalhamento automático. Campo novo opcional, sem migração; validado em `armazenamento/arquivo.ts` com os limites dos arrays do original (`LIMITES_EDICAO_VIGA`).
3. **Motor** (`calculo/sistrut/vigas/desinitEdicao.ts`, chamado por `detalhaViga`): `ExtrasDesinit.armaduraEditada`. Depois de `portaEstribos(c)` e antes de `posicoesDoQuadro(c)`, as contagens e os arrays do `Comum` (V_185E/A_1AF2/A_1B4E, V_1872/A_1BD8, V_1866/A_1AC4/A_1B20, V_1876/A_1BAA, V_1862/A_1B7C, V_186E/A_1C34/A_1A96, V_186A/A_1C06) são trocados pelos da edição, e `posicoes`, `trechosEstribo` e o `quadroDaViga` saem da armadura editada, como no S_202b9. A bitola da edição é a da tabela do `.DSP` igual em SINGLE. Antes de trocar, a edição tem de servir à viga: mesmo nº de tramos e os mesmos balanços. Se não servir, é descartada com aviso ("a viga mudou depois da edição") e vale o detalhamento automático; o original não confere (o DESEDITA lê tramos e balanços do próprio `.EDV`, DESEDITA.BAS:758-760), mas a armadura de outro número de tramos não tem como ser posta na viga. O comprimento (linha 2 do `.EDV`, DESEDCAO.BAS:466) o original também não confere: o DESEDITA o lê para uma variável que descarta (DESEDITA.BAS:747) e aplica a edição à viga atual, e o DESINIT grava no `.TAB` o quadro da edição com a forma da viga nova. Com mais de 1 cm de diferença, o modo original faz o mesmo, com aviso (na Alpha1, a V3 do COB: edição de 395 cm, viga de 399 cm, e o `.TAB` com as barras da edição e a forma de 399 cm); o corrigido descarta a edição, com aviso. `obra.ts` passa `g.viga.armaduraEditada` em `extras` e leva os avisos do detalhamento à viga.
4. **DESDIM que não conclui**: se o DESDIM da V2 para com erro do QuickBASIC numa viga editada (caso de um `.DSP` do usuário que não veio, como a lista de espaçamentos com 7,5 cm), o quadro sai só da edição (`ExtrasDesinit.reabreEdicao`), como na reabertura pelo DESEDITA: vindo do DESEDITA, o DESINIT só refaz as faces (S_30132) e o quadro, sem o detalhamento automático (DESINIT.BAS:84-100). Aviso na viga.
5. **Modo corrigido**: a mesma edição, com a As das negativas no meio de cada apoio com negativa e das positivas no meio do vão livre de cada tramo conferida contra a As necessária do dimensionamento corrigido; aviso onde fica abaixo. O original não confere ao gravar o `.EDV`.
6. **Conferência**:
   - oráculo: o quadro da V1 da E2E com o `R1__E2E.EDV` bate com o `E2E.TAB` regravado em `retrad_des_edc` (`desinitEdicao.test.ts`, `InicioSistrut.test.ts`). Os 16 `.EDV` do oráculo são o mesmo arquivo, e a edição desse roteiro não muda a armadura; o teste com edição que muda o quadro é sintético, com a conta à mão do DESINIT;
   - obra Alpha1 do cliente (16/10/2026, fora do repositório): as 18 vigas editadas que existem no `.VIG` batem com o `.TAB` nos dois modos, inclusive as 5 que não detalham com o `.DSP` de fábrica. O `R12_TER.EDV` sobra de uma viga que saiu do `.VIG` (o cabeçalho diz 11 vigas) e fica de fora com aviso. As vigas sem edição dependem do `.DSP` do cliente (seção 2).
   - obra Alpha1 completa (17/10/2026, 30 `.EDV`, fora do repositório): no modo original, 30 das 33 vigas do `.TAB` batem com os parâmetros de fábrica. A VE1 da ESCADA depende do `.DSP` próprio do cliente (parametrização ESC, que não veio): com o traspasse do porta-estribo em 0 em vez dos 15 cm de fábrica (linha 322 do `.DSP`; DESINIT.BAS:1427 e 1436), ela bate e nenhuma outra muda. As duas que sobram não têm como bater: a V12 do TER saiu do `.VIG` e o registro do `.TAB` ficou; e a V1 do TER tem no `.TAB` uma edição que não está no `.EDV`.
- **O `.TAB` pode ter edição que não está no `.EDV`.** Ao terminar a edição, o DESEDCAO pergunta "Gravo a Viga Editada em <R…EDV> S/*N*" com N como padrão e só grava o `.EDV` com S (DESEDCAO.BAS:325-328); depois encadeia o DESINIT (DESEDCAO.BAS:40), que regrava o `.TAB` com a armadura editada na memória. Uma segunda edição confirmada com Enter muda o `.TAB` e deixa o `.EDV` da edição anterior. É o caso da V1 do TER da Alpha1: o `R1__TER.EDV` é igual ao `R2__TER.EDV` (3 φ6,3 de 2 a 397 cm com dobras de 20 cm, 1305 cm, o que a V2 do TER tem no `.TAB`), e o `.TAB` da V1 tem 1133 cm de φ6,3 com os estribos da edição (2294 cm de φ5; o automático dá 2582 e 785). A V2 aplica o `.EDV` e não tem como reconstruir a edição que não foi gravada.

## 10. Lacunas

1. `V<n>_<pav4>.DXF`: o VPLOTA procura este nome antes do `R...` (VPLOTA.BAS:1647-1680), mas nenhum dos 28 programas o grava, e ele não aparece em nenhuma pasta do corpus. Pode ser de um módulo fora desta distribuição (o SISTRUT.BAS faz CHAIN também para PORTICO, GRELHA, TRELICA, DIAGRAMA, LDESENHO, PDESENHO, LPLOTA e PPLOTA, que não estão nela). Não confirmado.
2. FORMPLOT, `.PLT`: a tela pede um nome (`V_0e18$`, FORMPLOT.BAS:473-485, padrão o nome da forma) e o mostra (FORMPLOT.BAS:491), mas o OPEN usa o nome da forma (`V_0e32$`, FORMPLOT.BAS:2518). Pelo código, um nome diferente do padrão é ignorado. Não há `.PLT` do FORMPLOT no corpus para confirmar.
3. Leiaute completo do `.FRM` e do `.AVF`: só o cabeçalho e as primeiras linhas foram conferidos. Os 15 valores do `.TAB` e o `.PIL` foram tomados dos leitores da V2, sem nova conferência campo a campo.
4. `.PUB` (Cadtec): conferidas só as três linhas de cabeçalho; o resto sai das mesmas sub-rotinas do DXF com outra sintaxe, não levantada.
5. A obra não registra qual parametrização foi usada, exceto o `.COL` (nome do `.PIP`, ver `ParametrosCol` em pilar.ts) e o `.FRM` (nome da `.FOP`). Para `.LAJ` e `.VIG`, a parametrização e os `.INI` ficam no diretório da instalação e normalmente não vêm na pasta da obra.
6. A proteção do SISTRUT.BAS (arquivo `TEMP`) foi descrita pelas linhas comentadas da retradução; não foi executada.
7. As linhas de leitura de `.VIG` no VIGA na faixa 6150-6610 (gravação e leitura por intervalo) foram classificadas pelo nome da sub chamada (`_LE` ou `_GRAVA`), sem seguir cada caminho de tela.

## 11. Extensões vistas no corpus

Pastas: uma obra real de cliente (fora do repositório), as do oráculo (`C:/tmp/oraculo/runs/*/obra/` e `casos/*.dados/`) e as da V1 (`dist/roteiros/*.dados/`, `dist/tests/retraducao/`, `dist/sistrut-game/`). Só os nomes foram listados; alguns arquivos foram abertos para conferir o cabeçalho.

| Ext. | Onde aparece | Na tabela? |
|---|---|---|
| LAJ, VIG, SEC, FOR, TAB, REP, RLP, COL, BAK, EDV | Cliente, oráculo, V1 | Sim (seção 1). Nas pastas `roteiros/*.dados` da V1 estes arquivos estão no formato da reconstrução antiga (ver abaixo) |
| FRM, FOK, AVF | Oráculo, V1 (FRM) | Sim (seções 1 e 5) |
| DXF, PLT | Oráculo (`R1__E2E.DXF`, `FV1_E2E.DXF`, `FV1_E2E.PLT`, `E2E.DXF` do FORMPLOT), V1 | Sim (seção 4) |
| DSP, LAP, PIP, FOP | Oráculo (DSP), V1, `sistrut-game` | Sim (seção 2) |
| INI | Oráculo (`SISTRUT.INI`, `VPLOTA.INI`, `TESTE.INI` do caso do SISEDIT, em `SISTRUT/EXEC40/`), V1, `sistrut-game` | Sim (seção 3; `TESTE.INI` é arquivo livre do SISEDIT, seção 6) |
| sem extensão: `TEMP` | `sistrut-game` | Sim (seção 5) |
| OBR (`SISTRUT.OBR`), VET, EIX, FEL, CFO, PSC, FIN | V1 (`roteiros/*.dados`) | Não são do original: nenhum OPEN em `src-original`. Só a reconstrução antiga (`dist/src-reconstructed`) usa: OBR em `common/SISDADOS.BM`, DESENHO, DESINIT, FORMA, FORMIMP; VET em `common/SISPLOT.BM`, DESEDCAO, DESEDITA; EIX em FORMEDCA e LAJEGEOM; FEL em FORMEDCA; CFO em `common/SISDADOS`, FORMEDCA; PSC em PILAR; FIN em FORMINIT. O original só cita `.CFO` na tela do FORMEDCA (FORMEDCA.BAS:2932, 2993) e responde `*** AINDA NAO DISPONIVEL ***` (FORMEDCA.BAS:3001), sem gravar. Decisão: recusar com aviso "`<nome>`: arquivo da reconstrução antiga do SISTRUT (formato SISTRUT40), não do original; arquivo ignorado." |
| Qualquer extensão com primeira linha `"SISTRUT40","<EXT>",...` | V1 (`roteiros/*.dados`: LAJ, VIG, COL, REP, EDV...) | Formato da reconstrução antiga (o de `docs/formats/DADOS.md`). Só o `.LAJ` tem leitor na V2 (`formatoLaj` "entrada", `importarV1`). Para os outros, recusar com o mesmo aviso acima, testando a primeira linha antes de chamar o leitor do original |
| POS, LOG | V1 (`roteiro.txt.pos`, `roteiro.txt.log`) | Não são do SISTRUT: arquivos do executor de roteiros da reconstrução (`common/SISTELA.BM`) |
| COM (`HERCULES.COM`), EXE | `sistrut-game` | Programas da instalação, não dados. Ignorar com aviso: "`<nome>`: programa do SISTRUT, não é dado da obra." |
| OBJ, LIB, CGA, E0..E3, EXE, BAS, TXT, OUT (`ERR.OUT`, `STY.OUT`), BIN (`OUT20.BIN`), ABC (`LONGO.ABC`) | Oráculo, só nos casos `relogio*`, `retrad_t*`, `retrad_gfx_*`, `retrad_frm_err`, `retrad_frm_sty`, `retrad_sis_compila_sonda` | Não é do SISTRUT: sondas do QuickBASIC compiladas com `BC.EXE`/`LINK.EXE`/`BRUN45.LIB` dentro do DOSBox para medir o runtime |

## 12. Cobertura do grep

As 188 linhas de `grep -n -i -E '\b(OPEN|KILL|NAME)\b' */*.BAS comum/RT45.BM` (em `src-original`) estão todas acima. Conferido por script: toda linha `PROG.BAS:n` e `RT45.BM:n` do grep aparece citada neste documento, menos os 5 comentários do último item.

- 167 linhas de OPEN, KILL ou NAME em código ativo dos 28 `.BAS`, nas seções 1 a 6. Delas, 4 abrem dispositivo de plotter e não geram arquivo: FORMPLOT.BAS:2522 e 2525, VPLOTA.BAS:5247 e 5250 (seção 4, descartadas).
- 4 linhas comentadas da proteção do SISTRUT.BAS (159, 166, 174, 178): seção 5, `TEMP`.
- 12 linhas de código do RT45.BM (43, 47, 76, 412, 428, 452, 940, 1044, 1057, 1067, 1111, 1139): seção 7.
- 5 linhas do RT45.BM que só citam OPEN em comentário (410, 1488, 1530, 1547, 1548): descartadas.

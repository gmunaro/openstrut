* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
*               OpenStrut                                
*                       (omitido)                 
*
*               DETALHAMENTO E ARMACAO DE VIGAS CONTINUAS
*                     DESENHO DE VIGAS CONTINUAS
*               VERSAO 4.0                   OUTUBRO 1990
*                     **PARAMETRIZACAO INICIAL**
*
*
*  Este arquivo, possui as parametrizacoes basicas para o modulo DESENHO
*  sendo que cada usuario, podera recopia-lo com outro nome (novo nome.DSP) e
*  alterar as parametrizacoes da  maneira  mais  conveniente  atraves  de  um
*  editor de textos ou do proprio editor do sistema .
* 
*  Na implantacao inicial, este arquivo se encontra no disco original do 
*  programa DETALHAMENTO - DESENHO  ou se implantado em Winchester, dentro
*  do subdiretorio \SISTRUT\EXEC40
* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
*  REGRAS PARA ALTERACAO DO ARQUIVO TEXTO:
*
*  1) Mantenha o simbolo "*" afrente das linhas de comentarios
*  2) Nunca alterar a ordem das entradas de dados
*  3) Seguir instrucoes de preenchimento para cada Parametro
*  4) Todos os comentarios poderao ser eliminados (NAO ACONSELHAVEL)
* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
*  PARAMETRIZACAO : V2P (SISTRUT com aco A, acidentais S, inercia fissurada S, deformacao lenta S, fissuracao S, limite 1)
*  CRIADA POR     : (omitido)           
*  DATA           : 13 OUTUBRO 1990
* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
PARAMETROS GLOBAIS
1.0               COEFICIENTE MULTIPLICADOR DOS MOMENTOS NEGATIVOS-(0.15 A 1.0)
0.15              RESISTENCIA CARACTERISTICA DO CONCRETO - Fck
5.00              RESISTENCIA CARACTERISTICA DO ACO - Fyk
A                 TIPO DE ACO-(A OU B)
1                 COEFICIENTE MULTIPLICADOR DE Fck/Fyk PARA TRANSFORMAR EM T/C2
t/cm2             UNIDADE DE GRANDEZA PARA Fck E Fyk
0.9               MULT. DE Ec(NB1 8.2.5)CALCULO DEFORMACAO OU E250 FIXO EM t/c2
2.00              COBRIMENTO DA ARMADURA-CM
2.00              ACRESCIMO AO COBRIMENTO PARA O INICIO DA ALTURA UTIL-CM
S                 ALIVIO DE ESFORCOS CORTANTES-(S OU N)
S                 CARGAS ACIDENTAIS ENVOLTORIAS-(S OU N)
N                 MOMENTOS EXTERNOS APLICADOS NAS EXTREMIDADES-(S OU N)
1.4               COEFICIENTE DE SEGURANCA AOS ESFORCOS
1.4               COEFICIENTE DE SEGURANCA PARA O CONCRETO
1.15              COEFICIENTE DE SEGURANCA PARA O ACO
* * * * *
*   PARA A PARAMETRIZACAO DAS BITOLAS E AREAS:
*   1) Forneca area NULA para a nao consideracao da Bitola
*   2) Lembre-se de que caso seja anulada uma determinada Bitola,
*      nao utiliza-la nas Combinacoes que veremos afrente
*   3) A ordem sequencial deve permanecer inalterada
*   4) Teremos sempre 10 Bitolas - (ORDEM 0 a 9)
* * * * *
*   BITOLAS UTILIZADAS E AREAS
ORDEM        BITOLA (MM)           AREA (CM2)        PESO (KG/M)
  0  -         4   -                 0.00  -            0.10
  1  -         5   -                 0.20  -            0.16
  2  -         6.3 -                 0.315 -            0.25
  3  -         8   -                 0.5   -            0.40
  4  -        10   -                 0.8   -            0.63
  5  -        12.5 -                 1.25  -            1.0
  6  -        16   -                 2.0   -            1.6
  7  -        20   -                 3.15  -            2.5
  8  -        25   -                 5.0   -            4.0
  9  -        32   -                 0.00  -            6.3
* * * * *
*   PARAMETRIZACAO DAS OPCOES PARA ARMADURA DE FLEXAO
*
*   ATENCAO !
*   Para o Multiplicador de d para o Calculo da Decalagem e para os 
*   Multiplicadores dos comprimentos de ancoragem  poderemos entrar
*   das seguintes maneiras:
*     1) Numero entre 0 e 1  -  calcula decalagem multiplicando o valor por d
*     2) M1.5                -  Decala com a Medida fixa (1.5m = exemplo)
*     3) D20                 -  Decala com Diametros (20 = exemplo)
*
*     1) Numero>0            -  Multiplicador do comprimento de ancoragem
*     2) M2.55               -  Ancora com Medida fixa (2.55m = exemplo)
*     3) D30                 -  Ancora com Diametros (30 = exemplo)
* * * * *
PARAMETROS
0.0015            MULTIPLICADOR DE  Bw * Hw PARA OBTENCAO DA ARMADURA MINIMA
0.75              MULTIPLICADOR DE d PARA O CALCULO DO COMPRIMENTO DA DECALAGEM
1.00              MULTIPLICADOR DO COMPRIMENTO DE ANCORAGEM-FERRAGEM POSITIVA
1.50              MULTIPLICADOR DO COMPRIMENTO DE ANDORAGEM-FERRAGEM NEGATIVA
S                 VERIFICA NA ANCORAGEM MINIMO DE 10 DIAM. DA DECALAGEM(S OU N)
S                 CALCULO DE FLECHA CONSIDERANDO INERCIA FISSURADA (S OU N)
S                 CALCULO DA FLECHA COM DEFORMACAO LENTA (NB1 4.2.3.1.B)
S                 VERIFICO FISSURACAO E POSSIBILITO ALTERAR A ARMADURA (S OU N)
1                 LIMITES DE VERIFICACAO A FISSURACAO (1 OU 2 OU 3 PELA NB1)
*                    1  (PECAS NAO PROTEGIDAS MEIO AGRESSIVO)
*     NB1 4.2.2      2  (PECAS NAO PROTEGIDAS EM MEIO NAO AGRESSIVO)
*                    3  (PECAS PROTEGIDAS)
* * * * *
*   OPCAO DE ARMADURA(BITOLAS), EM FUNCAO DA LARGURA DA VIGA E DO As NECESSARIO
*   MAXIMO DE SEIS GRUPOS DIFERENTES DE ESCOLHA:
*   1) Sao fornecidos ate 6 diferentes intervalos em funcao da largura da Viga
*   2) E Conveniente que as larguras referentes aos intervalos que serao definidos
*      seja a mesma que definiremos afrente para a opcao de estribos Duplos
*   3) Para armaduras simples entre com  A#B onde A e a quantidade e B a bitola
*      que obrigatoriamente foi definida anteriormente
*   4) Para combinacoes entre com  A#B+C#D onde A e C sao quantidades (A>=C) e
*      B e D sao bitolas anteriormente definidas
*   5) Para quantidades variaveis de uma certa bitola entre com N#B
*      onde N indica a quantidade necessaria e B a bitola escolhida
*   6) Posicionamento dos intervalos   PRIMEIRO   Bw <= LIM 1
*                                      SEGUNDO    LIM 1 < Bw <= LIM 2
*                                      TERCEIRO   LIM 2 < Bw <= LIM 3
*                                      ... segue ate
*                                      SEXTO      LIM 5 < Bw
*   7) Maximo de 28 combinacoes por intervalo/grupo
*   8) A parametrizacao SISTRUT e feita apenas com 3 intervalos
*   9) Para X intervalos forneceremos X-1 limites sendo o ultimo intervalo
*      para valores maiores que o ultimo limite
* * * * *
PARAMETROS
3                 NUMERO DE GRUPOS DE BITOLAS PARA ESCOLHA DAS ARMADURAS
18                LIMITE DO PRIMEIRO INTERVALO (LIM 1)
39                LIMITE DO  SEGUNDO INTERVALO (LIM 2)
* * * * *
*   OPCAO DE ARMADURA PARA O PRIMEIRO INTERVALO
*   ATE (CM2)       OPCAO DE BITOLA
1 INTERVALO
     1.0    -            2#8
     1.6    -            2#10
     2.5    -            2#12.5
     3.0    -            2#12.5+#8
     3.3    -            2#12.5+#10
     3.75   -            3#12.5
     4.0    -            2#16
     5.0    -            4#12.5
     5.25   -            2#16+#12.5
     6.0    -            3#16
     6.5    -            2#16+2#12.5
     8.0    -            4#16
    10.0    -            5#16
    12.0    -            6#16
    12.6    -            4#20
    13.45   -            3#20+2#16
    18.0    -            N#16
    70.0    -            N#20
FIM
*   OPCAO DE ARMADURA PARA O SEGUNDO INTERVALO
*   ATE (CM2)       OPCAO DE BITOLA
2 INTERVALO
     1.0    -            2#8
     1.6    -            2#10
     2.5    -            2#12.5
     3.0    -            2#12.5+#8
     3.3    -            2#12.5+#10
     3.75   -            3#12.5
     4.0    -            2#16
     5.0    -            4#12.5
     5.25   -            2#16+#12.5
     6.0    -            3#16
     6.5    -            2#16+2#12.5
     8.0    -            4#16
     9.45   -            3#20
    10.0    -            5#16
    10.3    -            2#20+2#16
    12.6    -            4#20
    13.45   -            3#20+2#16
    20.0    -            N#20
    70.0    -            N#25
FIM
*   OPCAO DE ARMADURA PARA O TERCEIRO INTERVALO
*   ATE (CM2)       OPCAO DE BITOLA
3 INTERVALO
     2.0    -            4#8
     6.4    -            N#10
    10.0    -            N#12.5
    18.0    -            N#16
    26.0    -            N#20
    70.0    -            N#25
FIM
* * * * *
*   PARAMETRIZACAO DO CORTE DAS BARRAS SOBRE OS DIAGRAMAS
*   Escolha do grupo de barras a ser considerado para cada corte
*   Sendo necessario N barras, estas serao cortadas de A em A (A<=N)
*   Assim caso sejam necessarias 5 barras em um certo local e o grupo de corte
*   seja 2, teremos 2+2+1.  Sendo 3 o grupo de corte, teremos 3+2.
*   CUIDADO ! !
*   Caso tenhamos feito uma combinacao 3#B+2#D, NAO podemos optar por 2 no
*   grupo de corte pois teremos 2(B)+2(B & D)+1(D)
*
*   Nunca altere a coluna da esquerda - NUMERO DE BARRAS TOTAIS
*   Atencao !!
*   Sempre teremos o mesmo numero de Grupos de Corte o quanto forem os grupos
*   de Armadura acima definidos .
* * * * *
*   OPCAO DO GRUPO DE CORTE PRIMEIRO INTERVALO
NUMERO DE BARRAS TOTAIS    GRUPO DE CORTE
           2        -            2
           3        -            2
           4        -            2
           5        -            3
           6        -            3
           7        -            4
           8        -            4
          >9        -            5
*   OPCAO DO GRUPO DE CORTE SEGUNDO INTERVALO
NUMERO DE BARRAS TOTAIS    GRUPO DE CORTE
           2        -            2
           3        -            2
           4        -            2
           5        -            3
           6        -            3
           7        -            4
           8        -            4
          >9        -            5
*   OPCAO DO GRUPO DE CORTE TERCEIRO INTERVALO
NUMERO DE BARRAS TOTAIS    GRUPO DE CORTE
           2        -            0
           3        -            0
           4        -            6
           5        -            6
           6        -            6
           7        -            6
           8        -            6
          >9        -            6
* * * * *
*   PARAMETRIZACAO DAS OPCOES PARA ARMADURA DE CISALHAMENTO
* * * * *
PARAMETROS
0.14              MULTIPLICADOR DE Bw PARA A MINIMA ARMADURA DE CISALHAMENTO
10.0              MINIMO ESPACAMENTO DE ESTRIBOS-CM
30.0              MAXIMO ESPACAMENTO DE ESTRIBOS-CM (COMPARADO COM d/2 ou H/2)
0                 COMPARACAO DO MAXIMO ESPACAMENTO (0)-d/2  (1)-H/2
39                LARGURA MAXIMA PARA ESTRIBOS SIMPLES-CM
59                LARGURA MAXIMA PARA ESTRIBOS DUPLOS-CM
* * * * *
*   Para os espacamentos dos estribos utilizes valores Inteiros ou Fracionarios
*   O Calculo do espacamento necessario sera feito com valores inteiros e em
*   seguida optado o espacamento pelo valor configurado menor ou igual.
*   O primeiro espacamento e o ultimo devem coincidir com o Minimo e o Maximo
*
ESPACAMENTO DE ESTRIBOS
10/ 12/ 15/ 17/ 20/ 22/ 25/ 27/ 30/
* * * * *
*   Em funcao dos esforcos atuantes e escolhida a bitola de estribo para
*   cobrir os maximos esforcos (BITOLA MAXIMA).
*   Em funcao desta bitola e escolhida uma segunda bitola para cobrir as
*   armaduras minimas (BITOLA MINIMA).
*
*   Nao e necessario alterar a coluna da bitola maxima.
*   A bitola minima esta vinculada ao numero de ordem da bitola maxima 
*   Aletere somente caso queira visualizar a bitola correta.
*   BITOLA MAXIMA >= BITOLA MINIMA
*
MAXIMA   MINIMA
 12.5 -    8
 10   -    6.3
  8   -    6.3
  6.3 -    6.3
  5   -    5
  4   -    4
* * * * *
*   PARAMETRIZACAO DOS DADOS DE DESENHO DE VIGAS
*
*   Os valores abaixo sao destinados a parametrizacao do desenho final da peca
* 
*   Para o comprimento dos ganchos, entre com a altura total do gancho em CM
*     NEG. EXTERNO - gancho de ferros Negativos nas extremidades da viga
*     NEG. INTERNO - gancho de ferros negativos internos na viga (DENTES ..)
*     POS. EXTERNO - gancho de ferros positivos nas extremidades da viga
*     POS. INTERNO - gancho de ferros positivos internos na viga (DENTES ..)
*     ESTRIBO      - soma dos comprimentos dos ganchos do estribo
*
*     ORDEM  NEG. EXTERNO  NEG. INTERNO  POS. EXTERNO  POS. INTERNO  ESTRIBO
*     -----  ------------  ------------  ------------  ------------  -------
* * * * *
PARAMETROS
4       0   ,    15      ,       15    ,       15    ,      15     ,    8
5       1   ,    15      ,       15    ,       15    ,      15     ,    8
6.3     2   ,    20      ,       20    ,       20    ,      15     ,   10
8       3   ,    25      ,       25    ,       25    ,      20     ,   12
10      4   ,    30      ,       30    ,       25    ,      20     ,   15
12.5    5   ,    30      ,       30    ,       30    ,      25     ,   15
16      6   ,    35      ,       35    ,       30    ,      25     ,   NAO
20      7   ,    35      ,       35    ,       35    ,      30     ,   NAO
25      8   ,    40      ,       40    ,       40    ,      35     ,   NAO
32      9   ,    40      ,       40    ,       40    ,      35     ,   NAO
*
*   Para a escolha da bitola que sera utilizada como armadura minima nas
*   extremidades superiores das vigas simplesmente apoiadas temos:
*
*   ORDEM    ATE Hw(cm)
*   -----    -----------
* * * * *
PARAMETROS
4       0   ,    15
5       1   ,    30
6.3     2   ,    70
8       3   ,    85
10      4   ,   120
12.5    5   ,   acima de 120
*
*   Para a escolha da bitola que sera utilizada de preferencia como
*   armadura de pele nas faces das vigas temos:
*   Lembre-se  O calculo de As pele sera configurado adiante.
*   Para a escolha da bitola sera dada preferencia ao calculo de As total
*   obrigando desta forma a opcao de outra bitola devido ao espacamento .
*   (espacamento entre peles  >= 8)
*
*   ORDEM    ATE Hw(cm)
*   -----    -----------
* * * * *
PARAMETROS
4       0   ,    30
5       1   ,    70
6.3     2   ,    100
8       3   ,    140
10      4   ,    180
12.5    5   ,    acima de 180
*       
* * * * *
PARAMETROS
N                 LETRA PARA DAR NOME AOS FERROS (EXEMPLO - 3 N15 ..)
S                 COLOCACAO AUTOMATICA DE PORTA ESTRIBOS-(S OU N)
2                 NUMERO DE ORDEM PARA A MINIMA BITOLA DE PORTA ESTRIBO
15                EM CENTIMETROS(15) OU DIAMETROS(D20) TRANSPASSE PORTA ESTRIBO
S                 CALCULO DO COMPRIMENTO DA FERRAGEM DESENVOLVIDO-(S OU N)
8                 RAIO EM DIAMETROS DE DOBRAMENTO A 90 GRAUS
0.001             MULTIPLICADOR DE Bw * d PARA A MINIMA ARMADURA NEGATIVA 
60                ALTURA DA VIGA (INCLUSIVE) APARTIR DA QUAL TEREMOS ARM. PELE
0.0005            MULTIPLICADOR DE Bw * Hw PARA ARMADURA DE PELE EM UMA FACE 
20                EM CENTIMETROS(20) OU DIAMETROS(D20) TRANSPASSE ARMADURA PELE
40                MINIMA DIST. DE COLOCACAO DE ESTRIBOS NAS EXTREMIDADES (CM)
20                EM DIAMETROS, MINIMA ENTRADA DA FERRAGEM NOS APOIOS
S                 VERIFICACAO DE GRAMPOS NOS APOIOS-(S OU N)
N                 REDUZIR ANCORAGEM POSITIVA EM FUNCAO DE Ase/Anec-(S OU N)
1                 NUMERO DE ORDEM DA BITOLA (MENOR E IGUAL) CONSIDERADA CA60
1050              COMPRIMENTO MAXIMO DA FERRAGEM-CM

FINAL DA PARAMETRIZACAO
* * * * * * * * * * * *
ON ERROR GOTO trata
OPEN "C:\OUT13.TXT" FOR OUTPUT AS #1
e = 0: x# = 12345: x! = 12345: x# = LOG(0#): PRINT #1, "LOG(0)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = LOG(-1#): PRINT #1, "LOG(-1)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x! = LOG(0!): PRINT #1, "LOG!(0)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = LOG(1D-300): PRINT #1, "LOG(1E-300)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = SQR(-4#): PRINT #1, "SQR(-4)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x! = SQR(-4!): PRINT #1, "SQR!(-4)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = EXP(100#): PRINT #1, "EXP(100)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x! = EXP(100!): PRINT #1, "EXP!(100)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = EXP(1000#): PRINT #1, "EXP(1000)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = EXP(-1000#): PRINT #1, "EXP(-1000)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x! = EXP(89!): PRINT #1, "EXP!(89)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = (-8#) ^ (1# / 3#): PRINT #1, "(-8)^(1/3)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = (-2#) ^ .5#: PRINT #1, "(-2)^.5"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = (-2#) ^ 2#: PRINT #1, "(-2)^2"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = (-2#) ^ 3: PRINT #1, "(-2)^3"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = 0# ^ -1#: PRINT #1, "0^-1"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = 0# ^ 0#: PRINT #1, "0^0"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = 10# ^ 400#: PRINT #1, "10^400"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = ATN(1D+30): PRINT #1, "ATN(1E30)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = TAN(1.570796326794897#): PRINT #1, "TAN(PI/2)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = TAN(1D+10): PRINT #1, "TAN(1E10)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = SIN(1D+20): PRINT #1, "SIN(1E20)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = COS(1D+20): PRINT #1, "COS(1E20)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = 1# / 0#: PRINT #1, "1/0"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = -1# / 0#: PRINT #1, "-1/0"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = 0# / 0#: PRINT #1, "0/0"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: i% = CINT(1D+10): x# = i%: PRINT #1, "CINT(1E10)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: l& = CLNG(1D+20): x# = l&: PRINT #1, "CLNG(1E20)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: i% = CINT(LOG(-1#)): x# = i%: PRINT #1, "CINT(LOG(-1))"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x! = CSNG(1D+300): x# = x!: PRINT #1, "CSNG(1E300)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = INT(1D+300): PRINT #1, "INT(1E300)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = FIX(-1D+300): PRINT #1, "FIX(-1E300)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT13.TXT" FOR APPEND AS #1
CLOSE
END
trata:
e = ERR
RESUME NEXT

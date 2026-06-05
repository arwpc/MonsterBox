#!/usr/bin/env python3
"""
Build THE-MONSTERBOX-STORY.pdf — a single, publication-formatted PDF that
combines the full narrative (docs/THE-MONSTERBOX-STORY.md) with the visual
charts from the HTML dashboard, redrawn natively with reportlab (fully offline).
"""
import re, os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
    Spacer, Table, TableStyle, HRFlowable, KeepTogether, PageBreak, Flowable, CondPageBreak)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Group, PolyLine
from reportlab.graphics import renderPDF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, "docs", "THE-MONSTERBOX-STORY.md")
OUT = os.path.join(ROOT, "docs", "THE-MONSTERBOX-STORY.pdf")

# ---------- fonts ----------
LIB = "/usr/share/fonts/truetype/liberation/"
DEJ = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("Body", LIB+"LiberationSerif-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Body-Bold", LIB+"LiberationSerif-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Body-Italic", LIB+"LiberationSerif-Italic.ttf"))
pdfmetrics.registerFont(TTFont("Body-BoldItalic", LIB+"LiberationSerif-BoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("Head", LIB+"LiberationSans-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Head-Bold", LIB+"LiberationSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", DEJ+"DejaVuSansMono.ttf"))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold",
    italic="Body-Italic", boldItalic="Body-BoldItalic")

# ---------- palette (print-friendly) ----------
INK    = HexColor(0x1b1b1f)
MUTED  = HexColor(0x6b7280)
AMBER  = HexColor(0xb45309)
RED    = HexColor(0xc62828)
GREEN  = HexColor(0x15803d)
PURPLE = HexColor(0x6d28d9)
BLUE   = HexColor(0x1d4ed8)
GREY   = HexColor(0x64748b)
GRID   = HexColor(0xe5e7eb)
QUOTEBG= HexColor(0xf5f3ee)
QUOTEBG_W = HexColor(0xeefaf0)
RULE   = HexColor(0xd6d3cd)
CODEC  = HexColor(0x9a3412)

# ---------- styles ----------
S = {}
S['body'] = ParagraphStyle('body', fontName='Body', fontSize=10.5, leading=15.5,
    alignment=TA_JUSTIFY, textColor=INK, spaceAfter=8)
S['h1'] = ParagraphStyle('h1', fontName='Head-Bold', fontSize=17, leading=20,
    textColor=INK, spaceBefore=20, spaceAfter=2, keepWithNext=True)
S['h2'] = ParagraphStyle('h2', fontName='Head-Bold', fontSize=12.5, leading=15,
    textColor=AMBER, spaceBefore=12, spaceAfter=2, keepWithNext=True)
S['meta'] = ParagraphStyle('meta', fontName='Body-BoldItalic', fontSize=10,
    leading=13.5, textColor=GREY, spaceAfter=8, keepWithNext=True)
S['callh'] = ParagraphStyle('callh', fontName='Head-Bold', fontSize=15, leading=18,
    textColor=HexColor(0x1d4ed8), spaceAfter=6)
S['callb'] = ParagraphStyle('callb', fontName='Body', fontSize=11.5, leading=16.5,
    textColor=INK, spaceAfter=6)
S['callbi'] = ParagraphStyle('callbi', fontName='Body', fontSize=10, leading=14,
    textColor=HexColor(0x374151))
S['quote'] = ParagraphStyle('quote', fontName='Mono', fontSize=8.5, leading=12.5,
    textColor=HexColor(0x3a2a10))
S['quotew'] = ParagraphStyle('quotew', fontName='Mono', fontSize=8.5, leading=12.5,
    textColor=HexColor(0x14532d))
S['pull'] = ParagraphStyle('pull', fontName='Body-Italic', fontSize=13, leading=18,
    textColor=PURPLE, spaceBefore=8, spaceAfter=8, leftIndent=10)
S['bullet'] = ParagraphStyle('bullet', parent=S['body'], leftIndent=16,
    bulletIndent=2, spaceAfter=6)
S['num'] = ParagraphStyle('num', parent=S['body'], leftIndent=18, spaceAfter=6)
S['cap'] = ParagraphStyle('cap', fontName='Body-Italic', fontSize=8.8, leading=12,
    textColor=MUTED, spaceAfter=10)
S['cell'] = ParagraphStyle('cell', fontName='Body', fontSize=9, leading=12.5, textColor=INK)
S['cellb'] = ParagraphStyle('cellb', fontName='Body-Bold', fontSize=9, leading=12.5, textColor=INK)
S['cellh'] = ParagraphStyle('cellh', fontName='Head-Bold', fontSize=8.5, leading=11, textColor=white)
S['title'] = ParagraphStyle('title', fontName='Head-Bold', fontSize=32, leading=36,
    textColor=INK, alignment=TA_LEFT)
S['sub'] = ParagraphStyle('sub', fontName='Body-Italic', fontSize=13, leading=18,
    textColor=AMBER, spaceBefore=10)
S['statn'] = ParagraphStyle('statn', fontName='Head-Bold', fontSize=21, leading=22, textColor=AMBER)
S['statl'] = ParagraphStyle('statl', fontName='Body', fontSize=8.5, leading=11, textColor=MUTED)

# ---------- inline markdown ----------
def inline(t):
    t = t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    t = t.replace('→','-&gt;').replace('←','&lt;-').replace('↔','&lt;-&gt;')
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)', r'<i>\1</i>', t)
    t = re.sub(r'`(.+?)`', lambda m: '<font face="Mono" size="9" color="#9a3412">%s</font>'%m.group(1), t)
    t = re.sub(r'\[(.+?)\]\((.+?)\)', r'<link href="\2" color="#1d4ed8"><u>\1</u></link>', t)
    return t

# ---------- blockquote / callout boxes ----------
def quotebox(text, win=False):
    bg = QUOTEBG_W if win else QUOTEBG
    bar = GREEN if win else RED
    st = S['quotew'] if win else S['quote']
    p = Paragraph(inline(text), st)
    tb = Table([[p]], colWidths=[6.6*inch])
    tb.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),bg),
        ('LINEBEFORE',(0,0),(0,-1),2.5,bar),
        ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
    ]))
    return KeepTogether([Spacer(1,3), tb, Spacer(1,7)])

def pullbox(text):
    p = Paragraph(inline(text), S['pull'])
    tb = Table([[p]], colWidths=[6.6*inch])
    tb.setStyle(TableStyle([
        ('LINEBEFORE',(0,0),(0,-1),3,PURPLE),
        ('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),6),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ]))
    return KeepTogether([Spacer(1,6), tb, Spacer(1,6)])

def callout_commit():
    head = Paragraph("First — what's a &ldquo;commit&rdquo;? (a 30-second primer)", S['callh'])
    body = Paragraph(
        "A <b>commit</b> is a saved snapshot of the code at one moment &mdash; like hitting "
        "&ldquo;save&rdquo; on the entire project, with a short note attached describing what just "
        "changed. Developers commit <b>constantly</b> (often dozens of times a day).", S['callb'])
    why = Paragraph(
        "<b>Why they do it:</b> every commit is a checkpoint they can rewind to, so a mistake is "
        "never fatal &mdash; you just roll back to the last good snapshot. It&rsquo;s also how a team "
        "works on the same code without overwriting each other, and a running history of <i>who "
        "changed what, when, and why.</i>", S['callbi'])
    note = Paragraph(
        "Every commit carries a one-line <b>message</b>. Those messages are what this document reads "
        "&mdash; all <b>2,020</b> of them &mdash; to reconstruct how the project, and the AI building "
        "it, evolved.", S['callbi'])
    inner = Table([[head],[body],[why],[Spacer(1,2)],[note]], colWidths=[6.5*inch])
    inner.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
        ('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
    box = Table([[inner]], colWidths=[6.7*inch])
    box.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),HexColor(0xeef3fb)),
        ('BOX',(0,0),(-1,-1),1.2,HexColor(0x1d4ed8)),
        ('LEFTPADDING',(0,0),(-1,-1),16),('RIGHTPADDING',(0,0),(-1,-1),16),
        ('TOPPADDING',(0,0),(-1,-1),13),('BOTTOMPADDING',(0,0),(-1,-1),13),
    ]))
    return KeepTogether([box, Spacer(1,12)])

def md_table(rows):
    # rows: list of list of cell strings; first row header
    hdr = rows[0]
    body = rows[1:]
    ncol = len(hdr)
    cw = 6.6*inch
    # heuristic widths: first column narrower if it looks like labels
    if ncol == 2:
        widths = [cw*0.34, cw*0.66]
    elif ncol == 3:
        widths = [cw*0.18, cw*0.32, cw*0.50]
    else:
        widths = [cw/ncol]*ncol
    data = [[Paragraph(inline(c), S['cellh']) for c in hdr]]
    for r in body:
        data.append([Paragraph(inline(c), S['cell']) for c in r])
    tb = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ('BACKGROUND',(0,0),(-1,0),HexColor(0x3a2f1a)),
        ('TEXTCOLOR',(0,0),(-1,0),white),
        ('FONTNAME',(0,0),(-1,0),'Head-Bold'),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LINEBELOW',(0,0),(-1,-1),0.5,GRID),
        ('LINEBEFORE',(0,1),(0,-1),2,AMBER),
    ]
    for i in range(1,len(data)):
        if i%2==0: style.append(('BACKGROUND',(0,i),(-1,i),HexColor(0xf7f6f3)))
    tb.setStyle(TableStyle(style))
    return KeepTogether([Spacer(1,4), tb, Spacer(1,8)])

# ============================================================
# CHARTS (ported from the HTML dashboard, light theme)
# ============================================================
DW = 6.6*inch  # drawing width in points
def lbl(g,x,y,t,size=7,col=MUTED,anchor='middle',font='Head',bold=False):
    s = String(x,y,t,fontSize=size,fillColor=col,textAnchor=anchor)
    s.fontName = 'Head-Bold' if bold else font
    g.add(s)

MONTHS = [("Aug'24",80,20,6,11),("Sep'24",49,17,4,10),("Oct'24",601,13,22,15),
 ("Nov'24",13,14,0,0),("Dec–Apr",None,None,None,None),("May'25",144,41,2,3),
 ("Jun'25",279,40,5,40),("Jul'25",None,None,None,None),("Aug'25",61,35,1,16),
 ("Sep'25",162,48,6,22),("Oct'25",332,57,3,20),("Nov'25",6,59,1,0),
 ("Dec'25",None,None,None,None),("Jan'26",32,58,1,0),("Feb'26",116,65,0,7),
 ("Mar'26",109,70,0,2),("Apr'26",36,62,0,0)]

def legend(d, x, y, items, sw=10):
    """items: list of (color, label). draws swatch+label row, returns end x."""
    cx = x
    for col, label in items:
        if col == 'shade':
            d.add(Rect(cx, y, sw, sw, fillColor=HexColor(0xf0eee9), strokeColor=GRID, strokeWidth=0.5))
        else:
            d.add(Rect(cx, y, sw, sw, fillColor=col, strokeColor=None))
        lbl(d, cx+sw+3, y+1.5, label, 7, HexColor(0x374151), 'start')
        cx += sw + 6 + len(label)*3.7 + 12
    return cx

def chart_activity():
    W,H = DW, 268; L,R,T,B = 34,10,40,54
    d = Drawing(W,H)
    pw,ph = W-L-R, H-T-B; n=len(MONTHS); bw=pw/n; mx=601
    yy=lambda v: B+(v/mx)*ph    # bottom-up: 0 at baseline B, max near top
    # legend across the top
    legend(d, L, H-16, [(HexColor(0xcbd5e1),"commits / month"), (RED,"frustration words"),
        (GREEN,"triumph words"), ('shade',"dormant months (no commits)")])
    for gv in (0,150,300,450,600):
        d.add(Line(L,yy(gv),W-R,yy(gv),strokeColor=GRID,strokeWidth=0.5))
        lbl(d,L-4,yy(gv)-2,str(gv),6,MUTED,'end')
    for i,(m,c,ln,f,t) in enumerate(MONTHS):
        x=L+i*bw+bw*0.15; w=bw*0.7
        if c is None:
            d.add(Rect(L+i*bw+1,B,bw-2,ph,fillColor=HexColor(0xf0eee9),strokeColor=GRID,strokeWidth=0.5))
        else:
            d.add(Rect(x,B,w,(c/mx)*ph,fillColor=HexColor(0xcbd5e1),strokeColor=GREY,strokeWidth=0.4))
            lbl(d,x+w/2,yy(c)+3,str(c),6,INK,'middle')
            if f: d.add(Rect(x,B-(3+f*0.7),w*0.45,3+f*0.7,fillColor=RED,strokeColor=None))
            if t: d.add(Rect(x+w*0.55,B-(3+t*0.7),w*0.45,3+t*0.7,fillColor=GREEN,strokeColor=None))
        lbl(d,L+i*bw+bw/2,10,m,6,MUTED,'middle')
    # frustration/triumph strips sit just below the baseline (0 line)
    lbl(d,L+pw/2,H-32,"red & green strips below the zero-line count emotional words in that month's commit messages",6,MUTED,'middle')
    return d

def chart_msglen():
    W,H=DW,210; L,R,T,B=30,12,22,30
    d=Drawing(W,H); pw,ph=W-L-R,H-T-B; mx=80; n=len(MONTHS)
    xi=lambda i:L+(pw/(n-1))*i; yy=lambda v:B+(v/mx)*ph
    for gv in (0,20,40,60,80):
        d.add(Line(L,yy(gv),W-R,yy(gv),strokeColor=GRID,strokeWidth=0.5)); lbl(d,L-4,yy(gv)-2,str(gv),6,MUTED,'end')
    flat=[]
    for i,(m,c,ln,f,t) in enumerate(MONTHS):
        if ln is not None: flat+=[xi(i),yy(ln)]
    d.add(PolyLine(flat,strokeColor=AMBER,strokeWidth=2))
    for i,(m,c,ln,f,t) in enumerate(MONTHS):
        if ln is not None:
            d.add(Rect(xi(i)-1.6,yy(ln)-1.6,3.2,3.2,fillColor=AMBER,strokeColor=white,strokeWidth=0.5))
            lbl(d,xi(i),yy(ln)+5,str(ln),6,AMBER,'middle')
        lbl(d,xi(i),12,m,5.6,MUTED,'middle')
    lbl(d,xi(2),yy(13)-12,"manual grind",6.5,RED,'middle')
    lbl(d,xi(6),yy(40)+12,"AI writes the commits",6.5,GREEN,'middle')
    lbl(d,xi(15),yy(70)+11,"enforced grammar",6.5,PURPLE,'middle')
    lbl(d,L+pw/2,H-6,"avg commit-message length (chars), by month",6.5,MUTED,'middle')
    return d

def chart_filecount():
    W,H=DW,210; L,R,T,B=34,12,22,42
    d=Drawing(W,H); data=[("v0.1.0","Jun'25",312),("v5.3.0","Oct 8",1889),
     ("v5.4.0","Oct 23",1313),("v5.5.0","Oct 27",1385),("v5.5.1","Feb'26",1436),
     ("v8.1.0","Apr 14",908),("v8.3.0","Apr 19",921)]
    pw,ph=W-L-R,H-T-B; n=len(data); bw=pw/n; mx=2000; yy=lambda v:B+(v/mx)*ph
    for gv in (0,500,1000,1500,2000):
        d.add(Line(L,yy(gv),W-R,yy(gv),strokeColor=GRID,strokeWidth=0.5)); lbl(d,L-4,yy(gv)-2,str(gv),6,MUTED,'end')
    for i,(tg,dt,v) in enumerate(data):
        x=L+i*bw+bw*0.2; w=bw*0.6
        col = RED if v>1500 else (AMBER if v>1000 else GREEN)
        d.add(Rect(x,B,w,(v/mx)*ph,fillColor=col,strokeColor=None))
        lbl(d,x+w/2,yy(v)+3,str(v),6.5,INK,'middle')
        lbl(d,x+w/2,16,tg,6.5,INK,'middle'); lbl(d,x+w/2,8,dt,5.6,MUTED,'middle')
    lbl(d,L+pw/2,H-6,"tracked files at each release tag",6.5,MUTED,'middle')
    return d

def chart_tools():
    W=DW; L,R,T=170,12,28
    start=2024+7/12; end=2026+5/12; span=end-start
    X=lambda ym:L+((ym-start)/span)*(W-L-R)
    groups=[("LLMS (THE MODELS)",PURPLE,[
        ("Claude 3.5 (Claude Dev)",2024+7/12,2024+10/12,PURPLE,'"Broke LED"'),
        ("Google Gemini",2024+9/12,2024+10.5/12,PURPLE,"AJAX refactor"),
        ("Claude3/Son+GPT-4/3.5+Gemini",2025+4/12,2026+0/12,PURPLE,"multi-model swarm"),
        ("OpenAI GPT (in-product)",2025+5/12,2026+5/12,HexColor(0x8b7ad6),"ChatterPi runtime"),
        ("GPT-5",2025+7.5/12,2025+9/12,RED,"overnight -> debacle"),
        ("Claude Sonnet -> Opus",2026+1/12,2026+5/12,PURPLE,"governed")]),
     ("AGENT HARNESSES / IDEs",AMBER,[
        ("JetBrains / VSCode",2024+7/12,2026+5/12,GREY,"throughout"),
        ("CodeAnywhere",2024+7/12,2024+9/12,GREY,""),
        ("Cursor / Windsurf / Roo",2025+5/12,2026+0/12,AMBER,"purged Jan'26"),
        ("Augment (3 remote agents)",2025+5/12,2026+0/12,HexColor(0xc2620a),"swarm"),
        ("TaskMaster-AI",2025+5/12,2025+5.5/12,RED,"brief"),
        ("GitHub Copilot",2025+9/12,2026+5/12,BLUE,""),
        ("Claude Code + CLAUDE.md",2026+1/12,2026+5/12,PURPLE,"governed"),
        ("MCP servers",2025+4/12,2026+5/12,BLUE,"tool protocol")]),
     ("TESTING",GREEN,[
        ("Mocha (unit/system)",2024+7.3/12,2026+5/12,GREEN,"since Aug'24"),
        ("Chai + Supertest",2024+7.3/12,2026+5/12,GREEN,"assert + HTTP"),
        ("Playwright (browser E2E)",2025+5/12,2026+5/12,GREEN,""),
        ("Pact / gate / auditors",2026+3/12,2026+5/12,HexColor(0x0f766e),"contract")]),
     ("CI/CD, LINT & DOCS",BLUE,[
        ("GitHub Actions (5 flows)",2024+7/12,2026+5/12,BLUE,"day 1"),
        ("nodemon",2024+9.6/12,2026+5/12,HexColor(0x0369a1),""),
        ("ESLint custom rules",2026+3/12,2026+5/12,HexColor(0x0369a1),""),
        ("MkDocs",2025+4/12,2026+5/12,HexColor(0x0369a1),"")])]
    rowH=15; hH=16; rows=[]; y=T
    for cat,col,rs in groups:
        rows.append(("H",cat,col,y)); y+=hH
        for r in rs: rows.append(("R",r,y)); y+=rowH
        y+=4
    bottom=y; H=bottom+24
    d=Drawing(W,H)
    # flip y because reportlab origin is bottom-left; we computed top-down, so convert
    def Y(yt): return H-yt
    for gx,gl in [(2024+7/12,"Aug'24"),(2024+10/12,"Nov'24"),(2025+1/12,"Feb'25"),
        (2025+4/12,"May'25"),(2025+7/12,"Aug'25"),(2025+10/12,"Nov'25"),
        (2026+1/12,"Feb'26"),(2026+4/12,"May'26")]:
        d.add(Line(X(gx),Y(bottom),X(gx),Y(T-8),strokeColor=GRID,strokeWidth=0.5))
        lbl(d,X(gx),Y(T-12),gl,6,MUTED,'middle')
    # dormancy
    d.add(Rect(X(2024+11/12),Y(bottom),X(2025+4/12)-X(2024+11/12),bottom-T+8,
        fillColor=HexColor(0xf0eee9),strokeColor=None))
    for row in rows:
        if row[0]=="H":
            _,cat,col,yt=row
            d.add(Line(4,Y(yt+11),L-10,Y(yt+11),strokeColor=col,strokeWidth=1))
            lbl(d,4,Y(yt+9),cat,7,col,'start',bold=True)
        else:
            _,(n,a,b,c,note),yt=row
            lbl(d,L-8,Y(yt+11),n,6.8,INK,'end')
            x1=X(a); x2=max(X(b),x1+5)
            d.add(Rect(x1,Y(yt+13),x2-x1,11,fillColor=c,strokeColor=None,rx=3,ry=3))
            if note: lbl(d,x2+5,Y(yt+11),note,6,MUTED,'start')
    return d

# ============================================================
# parse markdown into flowables
# ============================================================
def parse_md(path):
    with open(path) as f:
        raw = f.read()
    # drop the top title block + companion-visual blockquote (handled by title page)
    lines = raw.split('\n')
    # find first '## '
    out_flow = []
    # group into blocks separated by blank lines
    blocks=[]; cur=[]
    for ln in lines:
        if ln.strip()=='':
            if cur: blocks.append(cur); cur=[]
        else:
            cur.append(ln)
    if cur: blocks.append(cur)

    # chart insertion anchors keyed by heading substring
    chart_after = {
        "How to read this history": ("AI Signature — average commit-message length", chart_msglen),
        "October Grind": ("Activity & mood, by month", chart_activity),
        "Real Story: How GPT": ("The tools that built it, grouped by kind", chart_tools),
        "Governed Collaboration": ("Bloat, then discipline — tracked files per release", chart_filecount),
    }
    started=False
    for blk in blocks:
        first=blk[0]
        # skip everything until first H2 section (title page handles preamble)
        if not started:
            if first.startswith('## '):
                started=True
            else:
                continue
        if first.startswith('# ') and not first.startswith('## '):
            continue
        if first.startswith('## '):
            htext = first[3:].strip()
            # don't strand a section heading near the bottom of a page
            out_flow.append(CondPageBreak(1.7*inch))
            # the rule + heading (+ any chart for this section) travel together as one block,
            # so a heading is never the last thing on a page and a chart never splits from it
            group = [HRFlowable(width="100%", thickness=0.8, color=RULE,
                        spaceBefore=14, spaceAfter=2, lineCap='round'),
                     Paragraph(inline(htext), S['h1'])]
            for key,(cap,fn) in chart_after.items():
                if key in htext:
                    group += [Spacer(1,6), fn(), Paragraph(cap, S['cap'])]
            out_flow.append(KeepTogether(group))
            continue
        if first.startswith('### '):
            out_flow.append(Paragraph(inline(first[4:].strip()), S['h2']))
            continue
        if first.startswith('>'):
            text=' '.join(re.sub(r'^>\s?','',l) for l in blk).strip()
            win = any(w in text.lower() for w in ['working','complete setup','100% done','pillar','fully functional','servos!'])
            # heuristics: green for triumphant lines, red otherwise
            out_flow.append(quotebox(text, win=win))
            continue
        if first.lstrip().startswith('|'):
            rows=[]
            for l in blk:
                if re.match(r'^\s*\|[\s:\-|]+\|\s*$', l): continue
                cells=[c.strip() for c in l.strip().strip('|').split('|')]
                rows.append(cells)
            if len(rows)>=2:
                out_flow.append(md_table(rows))
            continue
        if first.strip()=='---':
            continue
        m_b = re.match(r'^\s*[-*]\s+(.*)', first)
        m_n = re.match(r'^\s*(\d+)\.\s+(.*)', first)
        if m_b:
            text=m_b.group(1)+' '+' '.join(l.strip() for l in blk[1:])
            out_flow.append(Paragraph(inline(text.strip()), S['bullet'], bulletText='•'))
            continue
        if m_n:
            num=m_n.group(1); text=m_n.group(2)+' '+' '.join(l.strip() for l in blk[1:])
            out_flow.append(Paragraph('<b>%s.</b> %s'%(num,inline(text.strip())), S['num']))
            continue
        # plain paragraph
        text=' '.join(l.strip() for l in blk)
        # meta line right after an act heading: starts with ** and ends with **
        if text.startswith('**') and text.rstrip().endswith('**') and text.count('**')==2:
            out_flow.append(Paragraph(inline(text), S['meta']))
        else:
            out_flow.append(Paragraph(inline(text), S['body']))
    return out_flow

# ============================================================
# title page
# ============================================================
def title_page():
    fl=[]
    fl.append(Spacer(1,0.5*inch))
    fl.append(Paragraph("The MonsterBox Story", S['title']))
    fl.append(Paragraph("Two years of building alongside AI — told through 2,020 commits, "
        "from a hand-typed <i>fff</i> at midnight to an AI that obeys a constitution before it can commit.",
        S['sub']))
    fl.append(Spacer(1,0.3*inch))
    stat=lambda n,l: [Paragraph(n,S['statn']),Paragraph(l,S['statl'])]
    cells=[[Paragraph("2,020",S['statn']),Paragraph("601",S['statn']),Paragraph("13 → 70",S['statn']),Paragraph("11+",S['statn'])],
           [Paragraph("commits, 20 months",S['statl']),Paragraph("in Oct 2024 alone",S['statl']),
            Paragraph("avg msg length (chars/mo)",S['statl']),Paragraph("dev tools came & went",S['statl'])]]
    t=Table(cells,colWidths=[1.65*inch]*4)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),HexColor(0xf7f6f3)),
        ('BOX',(0,0),(-1,-1),0.5,GRID),('INNERGRID',(0,0),(-1,-1),0.5,GRID),
        ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('LEFTPADDING',(0,0),(-1,-1),10),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
    fl.append(t)
    fl.append(Spacer(1,0.3*inch))
    fl.append(KeepTogether([chart_activity(),
        Paragraph("The project's heartbeat and mood. This whole document is reconstructed "
        "from the git history; nothing here is invented.", S['cap'])]))
    fl.append(PageBreak())
    return fl

# ============================================================
# page furniture
# ============================================================
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Body-Italic',8); canvas.setFillColor(MUTED)
    canvas.drawString(0.9*inch, 0.55*inch, "The MonsterBox Story")
    canvas.drawRightString(letter[0]-0.9*inch, 0.55*inch, "%d" % doc.page)
    canvas.setStrokeColor(RULE); canvas.setLineWidth(0.5)
    canvas.line(0.9*inch,0.72*inch,letter[0]-0.9*inch,0.72*inch)
    canvas.restoreState()

def build():
    doc=BaseDocTemplate(OUT, pagesize=letter,
        leftMargin=0.9*inch, rightMargin=0.9*inch, topMargin=0.8*inch, bottomMargin=0.85*inch,
        title="The MonsterBox Story", author="Aaron Warner")
    frame=Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='main')
    doc.addPageTemplates([PageTemplate(id='main', frames=[frame], onPage=footer)])
    story = title_page() + [callout_commit()] + parse_md(MD)
    doc.build(story)
    print("WROTE", OUT, "%.0f KB" % (os.path.getsize(OUT)/1024))

if __name__=='__main__':
    build()

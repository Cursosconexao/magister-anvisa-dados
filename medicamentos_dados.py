#!/usr/bin/env python3
"""
Base de medicamentos para a página "Medicamentos TUSS" do Magister.

Gera, dentro da pasta de saída (a mesma do site GitHub Pages), a pasta med/ com:
  med/anvisa.json  -> registros de produto (9 dígitos) da base de medicamentos da ANVISA
                      que aparecem na Tabela 20 da TUSS (nome, princípio ativo, categoria,
                      classe terapêutica, detentor, situação, vencimento, processo)
  med/cmed.json    -> registros de apresentação (13 dígitos) presentes na lista de preços
                      CMED mais recente (substância, tipo de produto, tarja, restrição
                      hospitalar, EAN 1). NÃO publica preços: os valores continuam vindo da
                      NOVA_CMED no Bubble, só para quem tem permissão.
  med/meta.json    -> datas e totais

Só usa Python padrão. Se alguma fonte falhar, reaproveita o arquivo publicado no dia
anterior (lido do próprio site), para a página nunca ficar sem dados.

Uso: python medicamentos_dados.py --saida publicar
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import zipfile
from datetime import datetime, timezone, timedelta

URL_ANVISA = "https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv"
URL_CMED_PAGINA = "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos"
URL_TUSS20 = "https://magister-tuss-dados.pages.dev/tuss-20.json"
SITE = os.environ.get("ANVISA_SITE", "https://cursosconexao.github.io/magister-anvisa-dados").rstrip("/")
UA = {"User-Agent": "Mozilla/5.0 (Magister; dados abertos)"}
BRT = timezone(timedelta(hours=-3))


def baixar(url, tentativas=3, timeout=300):
    erro = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), r.headers
        except Exception as e:  # noqa: BLE001
            erro = e
            print(f"  tentativa {i + 1} falhou: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise erro


def anterior(nome):
    """Arquivo publicado anteriormente (fallback)."""
    try:
        dados, _ = baixar(f"{SITE}/med/{nome}", tentativas=2, timeout=60)
        return json.loads(dados.decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"  sem versão anterior de {nome}: {e}", file=sys.stderr)
        return None


def so_digitos(s):
    return re.sub(r"\D", "", s or "")


def limpa(s):
    s = (s or "").strip().strip('"').strip()
    return re.sub(r"\s+", " ", s)


# ---------------------------------------------------------------- TUSS 20
def registros_tuss():
    dados, _ = baixar(URL_TUSS20)
    j = json.loads(dados.decode("utf-8"))
    ci = [c["k"] for c in j["cols"]].index("registro")
    regs = set()
    for r in j["rows"]:
        d = so_digitos(r[ci])
        if len(d) >= 9:
            regs.add(d)
    print(f"TUSS 20 versão {j.get('versao')}: {len(regs)} registros de apresentação")
    return regs, j.get("versao", "")


# ---------------------------------------------------------------- ANVISA
def gerar_anvisa(regs_tuss):
    prod9 = {r[:9] for r in regs_tuss}
    dados, hdr = baixar(URL_ANVISA, timeout=900)
    lm = hdr.get("Last-Modified", "")
    texto = dados.decode("latin-1")
    leitor = csv.reader(io.StringIO(texto), delimiter=";", quotechar='"')
    cab = [c.strip().upper() for c in next(leitor)]
    ix = {c: i for i, c in enumerate(cab)}
    obrig = ["NOME_PRODUTO", "NUMERO_REGISTRO_PRODUTO", "SITUACAO_REGISTRO", "PRINCIPIO_ATIVO"]
    falta = [c for c in obrig if c not in ix]
    if falta:
        raise RuntimeError(f"colunas ausentes no CSV da ANVISA: {falta}")

    def g(row, c):
        i = ix.get(c)
        return limpa(row[i]) if i is not None and i < len(row) else ""

    total = 0
    melhor = {}
    for row in leitor:
        if not row:
            continue
        total += 1
        reg = so_digitos(g(row, "NUMERO_REGISTRO_PRODUTO")).zfill(9)
        if reg not in prod9:
            continue
        det = g(row, "EMPRESA_DETENTORA_REGISTRO")
        cnpj, nome_det = "", det
        m = re.match(r"^(\d{14})\s*-\s*(.*)$", det)
        if m:
            cnpj, nome_det = m.group(1), m.group(2)
        venc = so_digitos(g(row, "DATA_VENCIMENTO_REGISTRO"))
        venc = f"{venc[:2]}/{venc[2:]}" if len(venc) == 6 else g(row, "DATA_VENCIMENTO_REGISTRO")
        fin = g(row, "DATA_FINALIZACAO_PROCESSO")
        item = [
            g(row, "NOME_PRODUTO"),            # 0 nome do produto
            g(row, "PRINCIPIO_ATIVO"),         # 1 princípio ativo (nome genérico)
            g(row, "CATEGORIA_REGULATORIA"),   # 2 Genérico / Similar / Novo / Biológico...
            g(row, "CLASSE_TERAPEUTICA"),      # 3
            nome_det,                          # 4 detentor do registro
            cnpj,                              # 5
            g(row, "SITUACAO_REGISTRO"),       # 6 Ativo / Inativo...
            venc,                              # 7 vencimento MM/AAAA
            g(row, "NUMERO_PROCESSO"),         # 8
            fin,                               # 9 data de finalização do processo
        ]
        # vários processos por registro: fica o Ativo; entre iguais, o mais recente
        chave = (1 if item[6].lower() == "ativo" else 0, _data_ord(fin))
        atual = melhor.get(reg)
        if atual is None or chave > atual[0]:
            melhor[reg] = (chave, item)
    if total < 20000:
        raise RuntimeError(f"CSV da ANVISA veio com só {total} linhas")
    p = {k: v[1] for k, v in sorted(melhor.items())}
    print(f"ANVISA: {total} linhas lidas, {len(p)} registros ligados à TUSS 20 (de {len(prod9)})")
    return {
        "fonte": URL_ANVISA,
        "atualizado_fonte": lm,
        "cols": ["nome", "principio", "categoria", "classe", "detentor", "cnpj",
                 "situacao", "vencimento", "processo", "finalizacao"],
        "p": p,
    }


def _data_ord(d):
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", d or "")
    return f"{m.group(3)}{m.group(2)}{m.group(1)}" if m else ""


# ---------------------------------------------------------------- CMED
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _col(ref):
    letras = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letras:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def ler_xlsx(conteudo, precisa=("REGISTRO", "SUBST")):
    """Lê a planilha da CMED sem bibliotecas externas. Devolve (cabeçalho, linhas)."""
    import xml.etree.ElementTree as ET
    z = zipfile.ZipFile(io.BytesIO(conteudo))
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for _, el in ET.iterparse(z.open("xl/sharedStrings.xml")):
            if el.tag == NS + "si":
                ss.append("".join(t.text or "" for t in el.iter(NS + "t")))
                el.clear()
    planilhas = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    for nome in planilhas:
        cab, linhas = None, []
        for _, el in ET.iterparse(z.open(nome)):
            if el.tag != NS + "row":
                continue
            vals = {}
            for c in el.findall(NS + "c"):
                t = c.get("t")
                v = c.find(NS + "v")
                if t == "s" and v is not None:
                    val = ss[int(v.text)]
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(NS + "t"))
                else:
                    val = v.text if v is not None else ""
                vals[_col(c.get("r"))] = val
            el.clear()
            if not vals:
                continue
            linha = [vals.get(i, "") for i in range(max(vals) + 1)]
            if cab is None:
                up = [sem_acento(x).upper() for x in linha]
                if all(any(p in x for x in up) for p in precisa):
                    cab = [x.strip() for x in linha]
                continue
            linhas.append(linha)
        if cab:
            return cab, linhas
    raise RuntimeError("cabeçalho da CMED não encontrado")


def sem_acento(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()


def gerar_cmed():
    pagina, _ = baixar(URL_CMED_PAGINA, timeout=120)
    html = pagina.decode("utf-8", "ignore")
    links = re.findall(r'href="([^"]*lista_pmc_[^"]*\.xlsx[^"]*)"', html, flags=re.I)
    if not links:
        raise RuntimeError("link da lista PMC não encontrado na página da CMED")
    url = links[0]
    if url.startswith("/"):
        url = "https://www.gov.br" + url
    if "@@download" not in url:
        url = url.rstrip("/") + "/@@download/file"
    arq = re.search(r"(lista_pmc_[\w]+\.xlsx)", url).group(1)
    m = re.search(r"lista_pmc_(\d{4})(\d{2})(\d{2})", arq)
    publicada = f"{m.group(3)}/{m.group(2)}/{m.group(1)}" if m else ""
    conteudo, _ = baixar(url, timeout=600)
    cab, linhas = ler_xlsx(conteudo)
    norm = [sem_acento(c).upper() for c in cab]

    def idx(*nomes):
        for n in nomes:
            for i, c in enumerate(norm):
                if c.startswith(n):
                    return i
        return None

    i_reg, i_sub = idx("REGISTRO"), idx("SUBSTANCIA")
    i_tipo, i_tarja = idx("TIPO DE PRODUTO"), idx("TARJA")
    i_rest, i_ean = idx("RESTRICAO HOSPITALAR"), idx("EAN 1")

    def g(l, i):
        return limpa(l[i]) if i is not None and i < len(l) else ""

    regs = {}
    for l in linhas:
        reg = so_digitos(g(l, i_reg))
        if len(reg) != 13:
            continue
        ean = so_digitos(g(l, i_ean))
        tarja = g(l, i_tarja).replace("(*)", "").strip(" -")
        if reg not in regs:
            regs[reg] = [g(l, i_sub), g(l, i_tipo), tarja, g(l, i_rest), ean]
    if len(regs) < 10000:
        raise RuntimeError(f"lista CMED veio com só {len(regs)} registros")
    print(f"CMED {arq}: {len(regs)} registros de apresentação")
    return {
        "arquivo": arq,
        "publicada": publicada,
        "fonte": URL_CMED_PAGINA,
        "cols": ["substancia", "tipo", "tarja", "restricao_hospitalar", "ean1"],
        "r": dict(sorted(regs.items())),
    }


# ---------------------------------------------------------------- principal
def gravar(pasta, nome, obj):
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, nome), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default="publicar")
    a = ap.parse_args()
    pasta = os.path.join(a.saida, "med")
    agora = datetime.now(BRT).strftime("%d/%m/%Y %H:%M")
    meta = {"gerado": agora}

    try:
        regs, versao = registros_tuss()
        meta["tuss_versao"] = versao
    except Exception as e:  # noqa: BLE001
        print(f"ERRO TUSS 20: {e}", file=sys.stderr)
        regs = None

    anv = None
    if regs:
        try:
            anv = gerar_anvisa(regs)
            anv["gerado"] = agora
        except Exception as e:  # noqa: BLE001
            print(f"ERRO ANVISA: {e}", file=sys.stderr)
    if anv is None:
        anv = anterior("anvisa.json")
        meta["anvisa_reaproveitada"] = True
    if anv:
        gravar(pasta, "anvisa.json", anv)
        meta["anvisa_gerado"] = anv.get("gerado", "")
        meta["anvisa_registros"] = len(anv.get("p", {}))

    cm = None
    try:
        cm = gerar_cmed()
        cm["gerado"] = agora
    except Exception as e:  # noqa: BLE001
        print(f"ERRO CMED: {e}", file=sys.stderr)
        cm = anterior("cmed.json")
        meta["cmed_reaproveitada"] = True
    if cm:
        gravar(pasta, "cmed.json", cm)
        meta["cmed_arquivo"] = cm.get("arquivo", "")
        meta["cmed_publicada"] = cm.get("publicada", "")
        meta["cmed_registros"] = len(cm.get("r", {}))
        if regs:
            meta["tuss_com_cmed"] = len([r for r in regs if r in cm.get("r", {})])

    gravar(pasta, "meta.json", meta)
    print(json.dumps(meta, ensure_ascii=False, indent=1))
    if not anv and not cm:
        sys.exit(1)


if __name__ == "__main__":
    main()

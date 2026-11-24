"""Gera os dados da aba Cálculo AMB (Magister).

Uso:
    python3 gerar_dados_amb.py CALCULO_AMB.xlsx PASTA_SAIDA [--depara DEPARA.xlsx|.csv] [--aba AMB]

PASTA_SAIDA recebe a pasta amb/ (meta.json, AMB90.json ... CIEFAS.json e, se informado, depara.json).
No repositório magister-anvisa-dados a saída é estatico/  ->  publicado em
https://cursosconexao.github.io/magister-anvisa-dados/amb/

O de-para pode ser .xlsx ou .csv (; ou ,). O script procura as colunas pelo nome:
  - código AMB: cabeçalho com "AMB" (ou "CODIGO" que não seja TUSS)
  - código TUSS: cabeçalho com "TUSS" (e "COD")
  - descrição TUSS (opcional): cabeçalho com "DESCR" e "TUSS" (ou "TERMO")
Cada linha é um par; 1×n e n×1 são aceitos (várias linhas com o mesmo código).
  - grupo (opcional): cabeçalho "GRUPO" (CIRÚRGICO, SADT, CLINICO, CONSULTAS/VISITAS)
Com --aba lê só essa aba (ex.: aba AMB da planilha CALCULO_CBHPM_ABRAAO, código na coluna B e TUSS na O).
"""
import csv
import datetime
import json
import os
import sys
import unicodedata
import warnings

import openpyxl

warnings.filterwarnings("ignore")

TABELAS = ["AMB90", "AMB92", "AMB96", "AMB99", "CIEFAS"]


def num(v):
    if isinstance(v, bool):
        return 0
    if isinstance(v, (int, float)):
        v = float(v)
        return int(v) if v.is_integer() else round(v, 6)
    return 0


def sem_acento(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().upper()


def cod8(v):
    d = "".join(ch for ch in str(v if not isinstance(v, float) else int(v)) if ch.isdigit())
    return d.zfill(8) if 0 < len(d) <= 8 else None


def ler_tabelas(xlsx):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    portes, moeda = {t: [] for t in TABELAS}, {}
    for r in wb["Valores Portes"].iter_rows(min_row=2, max_row=44, values_only=True):
        t, p, _, valor, m = r[:5]
        if t in portes and isinstance(p, int):
            while len(portes[t]) <= p:
                portes[t].append(0)
            portes[t][p] = num(valor)
            moeda[t] = m
    itens = {t: [] for t in TABELAS}
    for r in wb["BD_AMB"].iter_rows(min_row=2, values_only=True):
        t, codigo, _, m, desc, total, hm, co, _pa, pa_num, aux, filme = r[:12]
        if t not in itens or not isinstance(codigo, int):
            continue
        hm_v, co_v = num(hm), num(co)
        if hm_v == 0 and co_v == 0 and num(total):
            hm_v = num(total)
        itens[t].append([str(codigo).zfill(8), " ".join(str(desc or "").replace("\xa0", " ").split()),
                         hm_v, co_v, pa_num if isinstance(pa_num, int) else 0,
                         aux if isinstance(aux, int) else 0, num(filme)])
        moeda.setdefault(t, m)
    return portes, moeda, itens


def ler_linhas(arq, aba=None):
    if arq.lower().endswith((".xlsx", ".xlsm")):
        wb = openpyxl.load_workbook(arq, data_only=True, read_only=True)
        for ws in ([wb[aba]] if aba else wb.worksheets):
            for r in ws.iter_rows(values_only=True):
                yield list(r)
        return
    with open(arq, encoding="utf-8-sig", errors="replace") as f:
        amostra = f.read(4096)
        f.seek(0)
        sep = ";" if amostra.count(";") >= amostra.count(",") else ","
        for r in csv.reader(f, delimiter=sep):
            yield r


def ler_depara(arq, aba=None):
    pares, cab, grupos = [], None, {}
    i_g = None
    for r in ler_linhas(arq, aba):
        nomes = [sem_acento(x) for x in r]
        if cab is None:
            i_t = next((i for i, n in enumerate(nomes) if "TUSS" in n and "COD" in n), None)
            if i_t is None:
                i_t = next((i for i, n in enumerate(nomes) if n.strip() == "TUSS"), None)
            i_a = next((i for i, n in enumerate(nomes) if "AMB" in n and "DESC" not in n), None)
            if i_a is None:
                i_a = next((i for i, n in enumerate(nomes) if "COD" in n and "TUSS" not in n), None)
            i_d = next((i for i, n in enumerate(nomes) if ("DESC" in n or "TERMO" in n) and "TUSS" in n), None)
            if i_t is not None and i_a is not None:
                cab = (i_a, i_t, i_d)
                i_g = next((i for i, n in enumerate(nomes) if n.strip() == "GRUPO"), None)
            continue
        i_a, i_t, i_d = cab
        a = cod8(r[i_a]) if i_a < len(r) else None
        t = cod8(r[i_t]) if i_t < len(r) else None
        if a and i_g is not None and i_g < len(r) and r[i_g]:
            grupos[a] = str(r[i_g]).strip()
        if not a or not t:
            continue
        d = " ".join(str(r[i_d] or "").split()) if i_d is not None and i_d < len(r) else ""
        pares.append([a, t, d])
    if cab is None:
        raise SystemExit("De-para: não achei as colunas de código AMB e código TUSS no cabeçalho.")
    vistos, unicos = set(), []
    for p in pares:
        if (p[0], p[1]) not in vistos:
            vistos.add((p[0], p[1]))
            unicos.append(p)
    return unicos, grupos


def main():
    args = sys.argv[1:]
    depara, aba = None, None
    if "--aba" in args:
        i = args.index("--aba")
        aba = args[i + 1]
        del args[i:i + 2]
    if "--depara" in args:
        i = args.index("--depara")
        depara = args[i + 1]
        del args[i:i + 2]
    xlsx, saida = args[0], args[1]
    pasta = os.path.join(saida, "amb")
    os.makedirs(pasta, exist_ok=True)
    portes, moeda, itens = ler_tabelas(xlsx)
    hoje = datetime.date.today().isoformat()
    meta = {"gerado_em": hoje, "origem": os.path.basename(xlsx), "depara": False,
            "tabelas": [{"id": t, "moeda": moeda.get(t, "R$"), "portes": portes[t], "itens": len(itens[t])}
                        for t in TABELAS]}
    if depara:
        pares, grupos = ler_depara(depara, aba)
        meta["depara"] = True
        with open(os.path.join(pasta, "depara.json"), "w", encoding="utf-8") as f:
            json.dump({"gerado_em": hoje, "fonte": os.path.basename(depara), "pares": pares, "grupos": grupos},
                      f, ensure_ascii=False, separators=(",", ":"))
        print("de-para:", len(pares), "pares")
    elif os.path.exists(os.path.join(pasta, "depara.json")):
        meta["depara"] = True
    with open(os.path.join(pasta, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    for t in TABELAS:
        with open(os.path.join(pasta, t + ".json"), "w", encoding="utf-8") as f:
            json.dump(itens[t], f, ensure_ascii=False, separators=(",", ":"))
        print(t, moeda.get(t), len(itens[t]), "itens")


if __name__ == "__main__":
    main()

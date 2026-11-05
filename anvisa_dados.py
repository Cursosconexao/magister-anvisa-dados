#!/usr/bin/env python3
"""
Magister · Base ANVISA de produtos para saúde (materiais) -> arquivos JSON para a página de materiais.

Roda todo dia (GitHub Actions) logo depois do monitoramento diário:
  1. baixa a planilha oficial de produtos para saúde regularizados (dados abertos da ANVISA);
  2. junta com a publicação anterior (lida do próprio site publicado), para guardar:
       - desde quando cada registro aparece na base,
       - a data da última alteração,
       - registros que SAÍRAM da base (vencidos / cancelados), com a data em que saíram;
  3. grava a pasta de saída pronta para publicar no GitHub Pages.

Só usa a biblioteca padrão do Python 3.9+.

Uso:
  python anvisa_dados.py --saida publicar
  python anvisa_dados.py --csv TA_PRODUTO_SAUDE_SITE.csv --saida publicar      (arquivo já baixado)
  python anvisa_dados.py --anterior https://cursosconexao.github.io/magister-anvisa-dados --saida publicar
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import shutil
import sys
import time
import urllib.request

URL_CSV = "https://dados.anvisa.gov.br/dados/TA_PRODUTO_SAUDE_SITE.csv"
POR_FATIA = 1200          # registros por arquivo r/N.json (~250 KB sem compressão)
AGENTE = "magister-anvisa-dados/1.0"


def baixar(url, tentativas=4, timeout=180):
    erro = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            erro = e
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"Falha ao baixar {url}: {erro}")


def texto_csv(raw):
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


def iso(d):
    """'09/05/2000' -> '2000-05-09'; 'VIGENTE' fica como está; vazio -> ''."""
    d = (d or "").strip()
    if len(d) >= 10 and d[2] == "/" and d[5] == "/":
        return f"{d[6:10]}-{d[3:5]}-{d[0:2]}"
    return d


def limpa(v):
    return " ".join((v or "").split())


def ler_base(raw):
    """Agrupa as linhas por número de registro (um registro pode ter vários fabricantes/países)."""
    leitor = csv.DictReader(io.StringIO(texto_csv(raw)), delimiter=";")
    base, data_base = {}, ""
    for l in leitor:
        reg = limpa(l.get("NUMERO_REGISTRO_CADASTRO")).replace(".", "")
        if not reg.isdigit():
            continue
        data_base = max(data_base, iso(limpa(l.get("DT_ATUALIZACAO_DADO"))[:10]))
        item = base.get(reg)
        if item is None:
            item = base[reg] = {
                "proc": limpa(l.get("NUMERO_PROCESSO")),
                "nt": limpa(l.get("NOME_TECNICO")),
                "cr": limpa(l.get("CLASSE_RISCO")),
                "nc": limpa(l.get("NOME_COMERCIAL")),
                "cnpj": limpa(l.get("CNPJ_DETENTOR_REGISTRO_CADASTRO")),
                "det": limpa(l.get("DETENTOR_REGISTRO_CADASTRO")),
                "pub": iso(limpa(l.get("DT_PUB_REGISTRO_CADASTRO"))),
                "val": iso(limpa(l.get("VALIDADE_REGISTRO_CADASTRO"))),
                "fab": [],
            }
        par = [limpa(l.get("NOME_FABRICANTE")), limpa(l.get("NOME_PAIS_FABRIC"))]
        if (par[0] or par[1]) and par not in item["fab"]:
            item["fab"].append(par)
    for item in base.values():
        item["fab"].sort()
    return base, data_base


CAMPOS = ("proc", "nt", "cr", "nc", "cnpj", "det", "pub", "val", "fab")


def assinatura(item):
    return json.dumps([item.get(k) for k in CAMPOS], ensure_ascii=False, sort_keys=True)


def ler_anterior(site):
    """Lê a publicação anterior (meta.json + r/*.json) do próprio site. Sem site ou erro: começa do zero."""
    if not site:
        return {}
    site = site.rstrip("/")
    try:
        meta = json.loads(baixar(site + "/meta.json", tentativas=2, timeout=60))
    except Exception as e:  # noqa: BLE001
        print(f"Aviso: publicação anterior não encontrada ({e}); começando do zero.")
        return {}
    ant = {}
    for n in range(len(meta.get("ix", []))):
        ant.update(json.loads(baixar(f"{site}/r/{n}.json", tentativas=3, timeout=60)))
    print(f"Publicação anterior: {len(ant):,} registros (base de {meta.get('base', '?')}).")
    return ant


def mesclar(base, ant, hoje):
    """Junta a base de hoje com a anterior e devolve (registros, mudanças do dia)."""
    saida, novos, alterados, removidos, voltaram = {}, [], [], [], []
    primeira_vez = not ant
    for reg, item in base.items():
        a = ant.get(reg)
        novo = dict(item)
        if a is None:
            novo["desde"] = "" if primeira_vez else hoje
            novo["alt"] = ""
            if not primeira_vez:
                novos.append(reg)
        else:
            novo["desde"] = a.get("desde", "")
            mudou = assinatura(a) != assinatura(item)
            novo["alt"] = hoje if mudou else a.get("alt", "")
            if a.get("fora"):
                voltaram.append(reg)
            elif mudou:
                alterados.append(reg)
        saida[reg] = novo
    for reg, a in ant.items():
        if reg in base:
            continue
        velho = dict(a)
        if not velho.get("fora"):
            velho["fora"] = hoje
            removidos.append(reg)
        saida[reg] = velho
    mud = {"data": hoje, "novos": sorted(novos), "alterados": sorted(alterados),
           "removidos": sorted(removidos), "voltaram": sorted(voltaram)}
    return saida, mud


def gravar(saida_dir, regs, mud, data_base, hoje):
    if os.path.isdir(saida_dir):
        shutil.rmtree(saida_dir)
    os.makedirs(os.path.join(saida_dir, "r"))
    chaves = sorted(regs)
    ix = []
    for n in range(0, len(chaves), POR_FATIA):
        fatia = chaves[n:n + POR_FATIA]
        ix.append(fatia[0])
        with open(os.path.join(saida_dir, "r", f"{n // POR_FATIA}.json"), "w", encoding="utf-8") as f:
            json.dump({k: regs[k] for k in fatia}, f, ensure_ascii=False, separators=(",", ":"))
    ativos = sum(1 for r in regs.values() if not r.get("fora"))
    meta = {"gerado": hoje, "base": data_base, "fonte": URL_CSV, "ativos": ativos,
            "fora": len(regs) - ativos, "ix": ix}
    with open(os.path.join(saida_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(saida_dir, "mudancas.json"), "w", encoding="utf-8") as f:
        json.dump(mud, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(saida_dir, "_headers"), "w", encoding="utf-8") as f:
        f.write("/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=1800\n")
    with open(os.path.join(saida_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write("<!doctype html><meta charset=utf-8><title>Magister · base ANVISA</title>"
                f"<p>Dados para o Magister. Base ANVISA de {data_base}, gerada em {hoje}: "
                f"{ativos:,} registros regularizados e {len(regs) - ativos:,} fora da base.</p>")
    return meta


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", help="arquivo CSV já baixado (senão baixa da ANVISA)")
    ap.add_argument("--anterior", default=os.environ.get("ANVISA_SITE", ""),
                    help="endereço do site publicado, para manter o histórico (ou variável ANVISA_SITE)")
    ap.add_argument("--saida", default="publicar")
    ap.add_argument("--hoje", default=dt.date.today().isoformat())
    a = ap.parse_args()

    raw = open(a.csv, "rb").read() if a.csv else baixar(URL_CSV)
    base, data_base = ler_base(raw)
    if len(base) < 50000:
        sys.exit(f"Base ANVISA veio com só {len(base)} registros; publicação cancelada para não apagar dados.")
    print(f"Base ANVISA de {data_base}: {len(base):,} registros.")
    ant = ler_anterior(a.anterior)
    regs, mud = mesclar(base, ant, a.hoje)
    meta = gravar(a.saida, regs, mud, data_base, a.hoje)
    print(f"Gravado em {a.saida}: {len(meta['ix'])} arquivos, {meta['ativos']:,} ativos, {meta['fora']:,} fora da base.")
    print(f"Mudanças de hoje: {len(mud['novos'])} novos, {len(mud['alterados'])} alterados, "
          f"{len(mud['removidos'])} removidos, {len(mud['voltaram'])} voltaram.")


if __name__ == "__main__":
    main()

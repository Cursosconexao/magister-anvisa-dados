# Base ANVISA para o Magister

Publica todo dia os dados abertos de **produtos para saúde regularizados na ANVISA** em arquivos JSON,
usados pela página de materiais (Tabela 19 da TUSS) do Magister.

- Site: https://cursosconexao.github.io/magister-anvisa-dados/
- Roda sozinho às 07:40 (Brasília) pelo GitHub Actions (aba **Actions** → "Base ANVISA para o Magister").
  Para rodar na hora: Actions → Base ANVISA para o Magister → **Run workflow**.
- `historico/AAAA-MM-DD.json`: registros novos, alterados, removidos (vencidos/cancelados) e que voltaram em cada dia.
- Fonte: https://dados.anvisa.gov.br/dados/TA_PRODUTO_SAUDE_SITE.csv

## Medicamentos (desde 18/11/2026)

`medicamentos_dados.py` roda no mesmo workflow e publica em `med/`, para a página **Medicamentos TUSS** do Magister:

- `med/anvisa.json`: base de medicamentos da ANVISA (https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv), só os registros que aparecem na Tabela 20 da TUSS.
- `med/cmed.json`: registros da lista de preços CMED mais recente (link lido da página da CMED no gov.br). Não publica preços: os valores continuam vindo da NOVA_CMED no Bubble.
- `med/meta.json`: datas e totais.

Se a ANVISA ou a CMED estiverem fora do ar, o script reaproveita os arquivos do dia anterior e a publicação dos materiais segue normalmente.

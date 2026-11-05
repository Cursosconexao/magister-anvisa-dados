# Base ANVISA para o Magister

Publica todo dia os dados abertos de **produtos para saúde regularizados na ANVISA** em arquivos JSON,
usados pela página de materiais (Tabela 19 da TUSS) do Magister.

- Site: https://cursosconexao.github.io/magister-anvisa-dados/
- Roda sozinho às 07:40 (Brasília) pelo GitHub Actions (aba **Actions** → "Base ANVISA para o Magister").
  Para rodar na hora: Actions → Base ANVISA para o Magister → **Run workflow**.
- `historico/AAAA-MM-DD.json`: registros novos, alterados, removidos (vencidos/cancelados) e que voltaram em cada dia.
- Fonte: https://dados.anvisa.gov.br/dados/TA_PRODUTO_SAUDE_SITE.csv

# RelatórioTec

Gerador de relatórios técnicos para a web: o técnico preenche o formulário, anexa fotos e medições, colhe a assinatura do cliente e gera um PDF pronto para enviar por WhatsApp ou e-mail.

Público: refrigeração, elétrica, mecânica, instalação e equipes de manutenção.

## Como rodar

Não precisa de build nem de instalação de dependências. Basta servir a pasta:

```bash
python3 -m http.server 8080
```

Depois abra http://localhost:8080.

Para testar no celular na mesma rede Wi-Fi, use `http://IP-DO-PC:8080`. O compartilhamento direto do PDF e a instalação como app exigem **HTTPS** (ou localhost). Em produção, hospede em qualquer serviço de site estático com HTTPS (Netlify, Vercel, GitHub Pages, Cloudflare Pages).

## Funcionalidades (versão 1)

| Aba | O que faz |
|---|---|
| **Dados** | Data, tipo de serviço, situação, cliente, equipamento, descrição (solicitação, diagnóstico, serviço executado, materiais, recomendações) e técnico |
| **Evidências** | Fotos pela câmera ou galeria, com categorias (Antes / Depois / Equipamento / Detalhe / Outro), legenda e ordenação. As fotos são reduzidas automaticamente (máx. 1600 px, JPEG) |
| **Medições** | Tabela de grandeza / valor / unidade / referência, com modelos por tipo de serviço (ex.: pressões, superaquecimento e corrente na refrigeração) e observações gerais |
| **Finalizar** | Lista de conferência, assinatura do cliente na tela, visualizar/baixar PDF, enviar por WhatsApp, e-mail ou pelo menu de compartilhamento do celular |
| **Histórico** | Busca por cliente/nº/equipamento, filtro por situação, abrir, gerar PDF, **duplicar** (mesmo cliente e equipamento, para manutenções recorrentes) e excluir |
| **Configurações** (⚙) | Dados e logotipo da empresa, cor do relatório, texto de garantia/rodapé, técnico padrão com assinatura, backup (exportar/importar JSON) |

Outros detalhes:
- Numeração automática por ano: `RT-2026-0001`.
- Salvamento automático a cada alteração (IndexedDB do navegador).
- Funciona sem internet depois do primeiro acesso (service worker), o que é útil em campo.
- Pode ser instalado na tela inicial do celular (PWA).

### Como funciona o envio
- **Celular (Android/iOS):** "WhatsApp", "E-mail" e "Compartilhar" abrem o menu do sistema já com o **PDF anexado**; o técnico escolhe o app e o contato.
- **Computador:** o PDF é baixado e o WhatsApp Web (`wa.me` com o número do cliente) ou o cliente de e-mail é aberto com a mensagem pronta. Falta só anexar o arquivo baixado.

## Estrutura

```
index.html            interface (abas e diálogo de configurações)
css/style.css         estilos (mobile first, tema claro/escuro)
js/app.js             lógica da aplicação
js/pdf.js             montagem do PDF (jsPDF + autoTable)
js/db.js              armazenamento local (IndexedDB)
js/images.js          redução das fotos
js/signature.js       área de assinatura
vendor/               jsPDF 2.5.2 e jspdf-autotable 3.8.4 (locais, para funcionar offline)
sw.js                 cache offline (incremente CACHE ao publicar mudanças)
manifest.webmanifest  instalação como app
```

## Limitações atuais e próximos passos

Os dados ficam **somente no navegador/aparelho**: limpar os dados do navegador apaga os relatórios. Por isso existe o backup em JSON. Caminho sugerido para virar produto:

1. **Backend + contas** (ex.: Supabase ou Firebase): login, sincronização entre aparelhos e equipes, fotos no armazenamento em nuvem.
2. **Cadastro de clientes e equipamentos** com autocompletar e histórico por equipamento (QR Code colado no aparelho).
3. **Link público do relatório** (em vez de só anexo) e confirmação de recebimento.
4. **Modelos de checklist** por tipo de serviço (PMOC para climatização, NR-10 para elétrica).
5. **Multiempresa / planos** para a versão comercial.

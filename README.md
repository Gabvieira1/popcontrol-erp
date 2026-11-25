# PopControl — Mini ERP de Gestão Comercial e Financeira (Dr. Pipoca)

Aplicação web Full Stack responsiva (PWA), desenvolvida com **React 18, TypeScript, Tailwind CSS, Recharts, Lucide Icons e Firebase (Authentication & Cloud Firestore)**, projetada especificamente para a operação comercial de revenda de pipocas gourmet **Dr. Pipoca**.

---

## 1. Arquitetura e Módulos Entregues

O código-fonte está organizado em `popcontrol/`:

- `src/types/domain.ts`: Tipagem rigorosa de todas as entidades (centavos inteiros para valores monetários, evitando erros de ponto flutuante).
- `src/lib/currency.ts`: Formatadores e conversores BRL ↔ centavos inteiros (`R$ 5,89 = 589`, `R$ 12,00 = 1200`, `R$ 130,00 = 13000`).
- `src/lib/accounting.ts`: Motor contábil puro, cálculo de DRE Gerencial, Patrimônio Líquido, alocação de lotes **FEFO (First Expired, First Out)**, Simulador de Precificação e Motor de Reposição Inteligente.
- `src/lib/operations.ts`: Camada transacional atômica com chaves de idempotência (`idempotencyKeys`) e trilha de auditoria (`auditLogs`).
- `src/services/firebase.ts`: Integração com **Firebase Authentication** e **Cloud Firestore** (`runTransaction`) + persistência local sincronizada multi-empresa.
- `src/components/`:
  - `AuthScreen.tsx`: Login com e-mail/senha, login com Google, recuperação de senha, configuração de credenciais Firebase e Modo Demonstração 100% isolado da produção.
  - `OnboardingWizard.tsx`: Configuração guiada em 7 etapas (não cria compras fictícias não autorizadas e impede duplicação de aporte ou da 1ª caixa).
  - `AppLayout.tsx`: Sidebar recolhível no desktop, barra inferior mobile-first (Dashboard, PDV, Estoque, Financeiro + menu de módulos), indicador de conectividade e tema claro/escuro.
- `src/modules/`:
  - `DashboardModule.tsx`: Indicadores separados entre Posição Atual e Desempenho do Período, gráficos Recharts, alertas inteligentes e atalhos rápidos.
  - `PosAndSalesModule.tsx`: PDV mobile-first com botão de Venda Rápida 1 toque (`"Vender 1 unidade — R$ 12,00"`), combos promocionais, programa de fidelidade, comprovante não fiscal (copiar, imprimir, WhatsApp) e Gestão de Vendas com estorno/cancelamento auditável.
  - `ProductsModule.tsx`: Catálogo completo (com os sabores futuros da Dr. Pipoca pré-cadastrados como inativos) e Simulador de Precificação integrado.
  - `InventoryModule.tsx`: Controle de estoque por lotes e validade (FEFO), bloqueio automático de lotes vencidos, histórico de movimentações e inventário físico auditável com justificativa obrigatória.
  - `PurchasesAndSuppliersModule.tsx`: Gestão de compras com separação estrita entre pagamento e recebimento físico, rateio de frete/descontos no custo do lote, Reposição Inteligente e Gestão de Fornecedores.
  - `FinancialAndReinvestmentModule.tsx`: Fluxo de caixa, Contas Financeiras com transferências neutras, DRE Gerencial de 10 linhas, Contas a Pagar/Receber com baixas parciais e Controle de Reinvestimento com simulador de ciclos de caixas fechadas.
  - `CrmGoalsReportsSettingsModule.tsx`: CRM de clientes com segmentação automática, cartão fidelidade, Metas comerciais, Relatórios exportáveis em CSV e impressão A4/PDF, e Configurações com backup JSON e anonimização LGPD.
- `firestore.rules` & `firestore.indexes.json`: Regras de segurança e índices compostos do Cloud Firestore.
- `src/__tests__/acceptance.test.ts`: Suíte automatizada de testes de aceitação (Vitest) cobrindo integralmente a Seção 23.

---

## 2. Como Executar Localmente

```bash
cd popcontrol
npm install
npm run dev
```

Acesse `http://localhost:5173`.

Para executar os testes automatizados de aceitação financeira e estoque:

```bash
cd popcontrol
npm test
```

Para gerar o build de produção:

```bash
cd popcontrol
npm run build
```

---

## 3. Orientações de Implantação e Configuração do Firebase

1. Crie um projeto gratuito (Plano **Spark — R$ 0,00**) no [Firebase Console](https://console.firebase.google.com/).
2. Ative o **Authentication** (provedores *E-mail/Senha* e *Google*).
3. Ative o **Cloud Firestore** em modo produção e publique os arquivos `firestore.rules` e `firestore.indexes.json`:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
4. Na tela de login do **PopControl**, clique em **"Firebase Config"** no canto superior direito e cole as credenciais públicas do Web App (`apiKey`, `authDomain`, `projectId`, `appId`), ou defina-as em um arquivo `.env` (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, etc.).

---

## 4. Checklist de Segurança (Seção 19)

- [x] **Negação por padrão (`allow read, write: if false;`)** em `firestore.rules`.
- [x] **Isolamento multi-empresa (`businesses/{businessId}`)**: Usuários só acessam documentos da empresa em que estão listados como membros ativos.
- [x] **Prevenção de elevação de privilégios**: O campo `role` (`admin` vs. `operator`) não pode ser auto-alterado pelo próprio usuário.
- [x] **Imutabilidade da trilha de auditoria**: Coleções `stockMovements`, `financialTransactions`, `auditLogs` e `idempotencyKeys` permitem apenas criação (`create`), bloqueando edição ou exclusão (`allow update, delete: if false`).
- [x] **Proteção contra vendas offline sem confirmação**: O motor transacional verifica a conectividade e executa mutações atômicas.
- [x] **Cache PWA seguro (`public/sw.js`)**: Faz cache exclusivamente de ativos estáticos da interface, ignorando chamadas de API do Firestore/Auth para jamais armazenar dados financeiros sensíveis em cache público.

---

## 5. Checklist de Validação Financeira e Contábil (Seções 11 e 23)

- [x] **Valores em centavos inteiros**: Zero erros de arredondamento IEEE-754.
- [x] **Aporte de capital (R$ 130,00) não é faturamento**: Entra no caixa e no Patrimônio Líquido, mantendo Faturamento = R$ 0,00.
- [x] **Compra paga e recebida (20 un × R$ 5,89 = R$ 117,80)**: Reduz o caixa para R$ 12,20 e cria ativo em estoque de R$ 117,80, mantendo Lucro Bruto = R$ 0,00 e Patrimônio Líquido = R$ 130,00.
- [x] **1ª Venda (R$ 12,00 via Pix)**: Caixa sobe para R$ 24,20, estoque cai para 19 un, Faturamento = R$ 12,00, CMV = R$ 5,89, Lucro Bruto = R$ 6,11.
- [x] **5 Vendas (R$ 60,00)**: Caixa = R$ 72,20, Estoque = 15 un (R$ 88,35), CMV = R$ 29,45, Lucro Bruto = R$ 30,55, Patrimônio Líquido = R$ 160,55.
- [x] **Venda integral da 1ª caixa (20 un)**: Faturamento = R$ 240,00, CMV = R$ 117,80, Lucro Bruto = R$ 122,20, Margem Bruta = 50,92%, Caixa = R$ 252,20, Estoque = 0 un.
- [x] **Compra de 2 novas caixas (40 un = R$ 235,60)**: Caixa = R$ 16,60, Estoque = 40 un (R$ 235,60), Lucro Acumulado = R$ 122,20, Patrimônio Líquido = R$ 252,20.
- [x] **Retirada do proprietário não é despesa operacional**: Reduz o caixa e o patrimônio líquido sem distorcer o Lucro Líquido Operacional da DRE.
- [x] **Transferências entre contas**: Neutras para DRE e para o saldo total de caixa.

---

## 6. Lista de Serviços Utilizados e Otimização de Custos (Seção 24)

Considerando o capital inicial de **R$ 130,00**, toda a arquitetura opera com **custo R$ 0,00**:

| Serviço / Recurso | Plano / Cota Utilizada | Custo Mensal | Observações e Limites |
|---|---|---|---|
| **Firebase Authentication** | Plano Spark (Gratuito) | **R$ 0,00** | Até 50.000 MAUs gratuitos para E-mail/Senha e Google Sign-In. |
| **Cloud Firestore** | Plano Spark (Gratuito) | **R$ 0,00** | 1 GiB armazenamento, 50.000 leituras/dia, 20.000 escritas/dia. Arquitetura otimizada em documento consolidado por empresa para consumir apenas 1 leitura/escrita por operação. |
| **Firebase Hosting** | Plano Spark (Gratuito) | **R$ 0,00** | 10 GB armazenamento e 360 MB/dia de transferência com SSL automático. |
| **APIs de IA Generativa** | **Não utilizadas** | **R$ 0,00** | Todos os algoritmos de reposição inteligente, FEFO, DRE e precificação são determinísticos em TypeScript puro. |
| **Integração Bancária Pix** | Confirmação Manual no PDV | **R$ 0,00** | APIs bancárias de webhook Pix (PSP) costumam cobrar tarifa por transação ou exigir certificado PJ pago; por isso a confirmação no PDV é manual e gratuita. |

---

## 7. Transparência sobre Funcionalidades Externas

- **Confirmação Automática de Pix via Webhook Bancário**: Conforme especificado na Seção 6, o sistema não afirma que um pagamento Pix foi confirmado automaticamente pelo banco, pois não há integração com gateway pago configurada; a confirmação no PDV é manual pelo operador.
- **Envio Automático de Mensagens WhatsApp em Background**: Conforme a Seção 13, o sistema não utiliza APIs pagas do WhatsApp Business para disparos automáticos; em vez disso, disponibiliza botões diretos `wa.me` com a mensagem e o comprovante preenchidos gratuitamente.

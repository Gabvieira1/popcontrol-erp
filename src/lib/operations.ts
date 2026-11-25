/**
 * POPCONTROL — ATOMIC TRANSACTIONAL OPERATIONS ENGINE
 * Executes every critical mutation (Onboarding, Purchase, Receipt, Payment,
 * POS Sale with FEFO & Idempotency, Sale Refund/Cancellation, Inventory Adjustments,
 * Financial Entries, Account Transfers, Payables/Receivables settlement)
 * atomically on a cloned state snapshot.
 *
 * Used identically by:
 * 1. Firestore Transaction Runner (`runTransaction`)
 * 2. Local Synchronized Engine (when running offline/local server or unit tests)
 */

import {
  BusinessDatabaseState,
  InventoryLot,
  StockMovement,
  Purchase,
  Sale,
  SaleItem,
  FinancialTransaction,
  AccountPayable,
  AccountReceivable,
  AuditLog,
  Product,
  Supplier,
  Customer,
  CommercialGoal,
  ShiftClosingRecord,
  Role,
} from '../types/domain';
import { allocateLotsFEFO, getProductInventorySummary, calculateFinancialSnapshot } from './accounting';

function cloneState(state: BusinessDatabaseState): BusinessDatabaseState {
  return JSON.parse(JSON.stringify(state));
}

function generateId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 9);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

function verifyAdminOrApproval(
  state: BusinessDatabaseState,
  actionLabel: string,
  adminApprovalPin?: string,
  actingRole?: Role
): string | undefined {
  const role = actingRole || state.profile.role || 'admin';
  if (role === 'admin') {
    return state.profile.displayName || 'Administrador';
  }
  const expectedPin = state.settings.permissionsConfig?.adminPinCode || '1234';
  if (!adminApprovalPin || adminApprovalPin.trim() !== expectedPin) {
    throw new Error(
      `Permissão negada para Operador de Caixa: "${actionLabel}" exige senha/PIN de aprovação do Administrador.`
    );
  }
  return 'Aprovado por PIN Administrador';
}

function appendAuditLog(
  state: BusinessDatabaseState,
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  now: string
) {
  const log: AuditLog = {
    id: generateId('log'),
    businessId: state.profile.businessId,
    action,
    entityType,
    entityId,
    details,
    userId: state.profile.uid,
    userName: state.profile.displayName || state.profile.email,
    createdAt: now,
  };
  state.auditLogs.unshift(log);
}

/**
 * 1. ONBOARDING COMPLETION (Section 22)
 * Prevents duplicate contribution or duplicate initial box purchase even if called multiple times.
 */
export interface OnboardingConfirmPayload {
  businessName: string;
  supplierName: string;
  productName: string;
  sku: string;
  unitCostCents: number;
  unitsPerBox: number;
  salePriceCents: number;
  minStockUnits: number;
  confirmCapitalContribution: boolean;
  capitalContributionCents: number; // 13000 (R$ 130,00)
  accountId: string; // e.g., 'acc_pix'
  confirmFirstBoxPurchase: boolean;
  firstBoxPaid: boolean;
  firstBoxReceived: boolean;
  firstBoxLotNumber: string;
  firstBoxExpirationDate: string;
  dailyUnitsGoal: number;
  nowISO?: string;
}

export function executeOnboardingSetup(
  currentState: BusinessDatabaseState,
  payload: OnboardingConfirmPayload
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  state.settings.businessName = payload.businessName.trim() || state.settings.businessName;
  state.settings.defaultMinStock = payload.minStockUnits;

  // Update supplier
  const supplier = state.suppliers[0];
  if (supplier) {
    supplier.name = payload.supplierName.trim() || 'Dr. Pipoca';
    supplier.updatedAt = now;
  }

  // Update primary product DP001
  const mainProduct = state.products.find((p) => p.id === 'prod_dp001') || state.products[0];
  if (mainProduct) {
    mainProduct.name = payload.productName.trim() || mainProduct.name;
    mainProduct.sku = payload.sku.trim() || mainProduct.sku;
    mainProduct.acquisitionCostCents = payload.unitCostCents;
    mainProduct.unitsPerBox = payload.unitsPerBox;
    mainProduct.salePriceCents = payload.salePriceCents;
    mainProduct.minStockUnits = payload.minStockUnits;
    mainProduct.active = true;
    mainProduct.updatedAt = now;
  }

  // Update daily goal if present
  const dailyGoal = state.goals.find((g) => g.id === 'goal_daily_units');
  if (dailyGoal && payload.dailyUnitsGoal > 0) {
    dailyGoal.targetValue = payload.dailyUnitsGoal;
  }

  // Step 5: Confirm capital contribution (idempotent: never duplicate if already confirmed)
  if (
    payload.confirmCapitalContribution &&
    !state.settings.initialCapitalConfirmed &&
    !state.idempotencyKeys['onboarding_initial_capital']
  ) {
    if (payload.capitalContributionCents <= 0) {
      throw new Error('O valor do aporte inicial deve ser maior que zero.');
    }
    const txId = 'tx_initial_capital';
    const tx: FinancialTransaction = {
      id: txId,
      businessId: state.profile.businessId,
      type: 'owner_contribution',
      direction: 'in',
      categoryId: 'cat_contribution',
      categoryName: 'Aportes',
      accountId: payload.accountId || 'acc_pix',
      amountCents: payload.capitalContributionCents,
      description: 'Aporte de capital inicial do proprietário (Configuração Inicial)',
      occurredAt: now,
      createdByUserId: state.profile.uid,
      createdAt: now,
    };
    state.financialTransactions.unshift(tx);
    state.settings.initialCapitalConfirmed = true;
    state.idempotencyKeys['onboarding_initial_capital'] = txId;

    appendAuditLog(
      state,
      'ONBOARDING_CAPITAL_APORTE',
      'financialTransaction',
      txId,
      `Aporte inicial confirmado: ${payload.capitalContributionCents} centavos.`,
      now
    );
  }

  // Step 6: Confirm first box purchase (idempotent: never duplicate if already confirmed)
  if (
    payload.confirmFirstBoxPurchase &&
    !state.settings.initialPurchaseConfirmed &&
    !state.idempotencyKeys['onboarding_initial_purchase'] &&
    mainProduct &&
    supplier
  ) {
    const afterPurchaseState = executeCreatePurchase(state, {
      idempotencyKey: 'onboarding_initial_purchase',
      supplierId: supplier.id,
      productId: mainProduct.id,
      purchaseDate: now.slice(0, 10),
      boxesQuantity: 1,
      unitsPerBox: payload.unitsPerBox,
      baseUnitCostCents: payload.unitCostCents,
      discountCents: 0,
      freightCents: 0,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: payload.accountId || 'acc_pix',
      markAsPaidImmediately: payload.firstBoxPaid,
      markAsReceivedImmediately: payload.firstBoxReceived,
      lotNumber: payload.firstBoxLotNumber || 'LOTE-001',
      expirationDate: payload.firstBoxExpirationDate,
      notes: 'Compra da 1ª caixa registrada no Onboarding.',
      nowISO: now,
    });
    afterPurchaseState.settings.initialPurchaseConfirmed = true;
    afterPurchaseState.settings.onboardingCompleted = true;
    afterPurchaseState.settings.updatedAt = now;
    return afterPurchaseState;
  }

  state.settings.onboardingCompleted = true;
  state.settings.updatedAt = now;
  return state;
}

/**
 * 2. PURCHASE CREATION, RECEIPT & PAYMENT (Section 10)
 * Strictly separates payment from physical receipt:
 * - Only increases stock when receiptStatus becomes 'received'.
 * - Only decreases cash when paymentStatus becomes 'paid'.
 * - Distributes discount, freight, and attributable acquisition costs into the lot's effective unit cost.
 */
export interface CreatePurchasePayload {
  idempotencyKey?: string;
  supplierId: string;
  productId: string;
  purchaseDate: string;
  boxesQuantity: number;
  unitsPerBox: number;
  baseUnitCostCents: number;
  discountCents: number;
  freightCents: number;
  otherAttributionCostsCents: number;
  paymentMethod: string;
  accountId: string;
  markAsPaidImmediately: boolean;
  markAsReceivedImmediately: boolean;
  dueDate?: string;
  lotNumber: string;
  manufacturingDate?: string;
  expirationDate: string;
  notes?: string;
  nowISO?: string;
}

export function executeCreatePurchase(
  currentState: BusinessDatabaseState,
  payload: CreatePurchasePayload
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  if (payload.idempotencyKey && state.idempotencyKeys[payload.idempotencyKey]) {
    throw new Error('Esta compra já foi processada anteriormente (chave de idempotência duplicada).');
  }

  if (payload.boxesQuantity <= 0 || payload.unitsPerBox <= 0) {
    throw new Error('Quantidade de caixas e unidades por caixa devem ser maiores que zero.');
  }
  if (payload.baseUnitCostCents < 0) {
    throw new Error('O custo unitário não pode ser negativo.');
  }
  if (!payload.expirationDate) {
    throw new Error('A data de validade do lote é obrigatória.');
  }

  const supplier = state.suppliers.find((s) => s.id === payload.supplierId);
  if (!supplier) throw new Error('Fornecedor não encontrado.');

  const product = state.products.find((p) => p.id === payload.productId);
  if (!product) throw new Error('Produto não encontrado.');

  const totalUnits = payload.boxesQuantity * payload.unitsPerBox;
  const merchandiseSubtotalCents = totalUnits * payload.baseUnitCostCents;
  const totalCostCents =
    merchandiseSubtotalCents -
    payload.discountCents +
    payload.freightCents +
    payload.otherAttributionCostsCents;

  if (totalCostCents < 0) {
    throw new Error('O valor total da compra após desconto não pode ser negativo.');
  }

  // Exact integer cents rounding with remainder awareness
  const effectiveUnitCostCents = Math.round(totalCostCents / totalUnits);
  const purchaseId = generateId('pur');

  const purchase: Purchase = {
    id: purchaseId,
    businessId: state.profile.businessId,
    supplierId: supplier.id,
    supplierName: supplier.name,
    purchaseDate: payload.purchaseDate,
    productId: product.id,
    productName: product.name,
    boxesQuantity: payload.boxesQuantity,
    unitsPerBox: payload.unitsPerBox,
    totalUnits,
    baseUnitCostCents: payload.baseUnitCostCents,
    discountCents: payload.discountCents,
    freightCents: payload.freightCents,
    otherAttributionCostsCents: payload.otherAttributionCostsCents,
    totalCostCents,
    effectiveUnitCostCents,
    paymentMethod: payload.paymentMethod,
    accountId: payload.accountId,
    paymentStatus: 'pending',
    receiptStatus: 'confirmed',
    lotNumber: payload.lotNumber.trim() || `LOTE-${purchaseId.slice(-4).toUpperCase()}`,
    manufacturingDate: payload.manufacturingDate,
    expirationDate: payload.expirationDate,
    notes: payload.notes,
    createdAt: now,
    updatedAt: now,
  };

  // Create corresponding Payable record
  const payableId = generateId('pay');
  const payable: AccountPayable = {
    id: payableId,
    businessId: state.profile.businessId,
    supplierId: supplier.id,
    supplierName: supplier.name,
    description: `Compra ${payload.boxesQuantity} cx ${product.name} (${purchase.lotNumber})`,
    categoryId: 'cat_purchases',
    categoryName: 'Compra de mercadorias',
    totalAmountCents: totalCostCents,
    paidAmountCents: 0,
    remainingAmountCents: totalCostCents,
    dueDate: payload.dueDate || payload.purchaseDate,
    status: 'pending',
    originPurchaseId: purchaseId,
    isInventoryAcquisition: true,
    createdAt: now,
    updatedAt: now,
  };

  purchase.payableId = payableId;
  state.purchases.unshift(purchase);
  state.payables.unshift(payable);

  if (payload.idempotencyKey) {
    state.idempotencyKeys[payload.idempotencyKey] = purchaseId;
  }

  appendAuditLog(
    state,
    'PURCHASE_CREATED',
    'purchase',
    purchaseId,
    `Compra registrada: ${totalUnits} un de ${product.name} por ${totalCostCents} centavos.`,
    now
  );

  let nextState = state;
  if (payload.markAsPaidImmediately) {
    nextState = executePayPurchase(nextState, {
      purchaseId,
      accountId: payload.accountId,
      paymentDate: payload.purchaseDate,
      nowISO: now,
    });
  }

  if (payload.markAsReceivedImmediately) {
    nextState = executeReceivePurchase(nextState, {
      purchaseId,
      receivedDate: payload.purchaseDate,
      nowISO: now,
    });
  }

  return nextState;
}

/**
 * Confirm Payment of an existing Purchase (prevents duplicate payment)
 */
export function executePayPurchase(
  currentState: BusinessDatabaseState,
  payload: {
    purchaseId: string;
    accountId?: string;
    paymentDate?: string;
    nowISO?: string;
  }
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  const purchase = state.purchases.find((p) => p.id === payload.purchaseId);
  if (!purchase) throw new Error('Compra não encontrada.');
  if (purchase.paymentStatus === 'paid') {
    throw new Error('Esta compra já consta como paga. Pagamento duplicado bloqueado.');
  }
  if (purchase.receiptStatus === 'cancelled') {
    throw new Error('Não é possível pagar uma compra cancelada.');
  }

  const accountId = payload.accountId || purchase.accountId || 'acc_pix';
  const payable = state.payables.find((p) => p.originPurchaseId === purchase.id);
  const amountToPayCents = payable ? payable.remainingAmountCents : purchase.totalCostCents;

  if (amountToPayCents <= 0) {
    throw new Error('Não há saldo pendente para pagamento nesta compra.');
  }

  const txId = generateId('tx');
  const tx: FinancialTransaction = {
    id: txId,
    businessId: state.profile.businessId,
    type: 'supplier_payment',
    direction: 'out',
    categoryId: 'cat_purchases',
    categoryName: 'Compra de mercadorias',
    accountId,
    amountCents: amountToPayCents,
    description: `Pagamento compra fornecedor ${purchase.supplierName} — ${purchase.productName} (${purchase.lotNumber})`,
    referenceDocumentId: purchase.id,
    occurredAt: now,
    createdByUserId: state.profile.uid,
    createdAt: now,
  };

  state.financialTransactions.unshift(tx);
  purchase.paymentStatus = 'paid';
  purchase.paymentDate = payload.paymentDate || now.slice(0, 10);
  purchase.accountId = accountId;
  purchase.updatedAt = now;

  if (payable) {
    payable.paidAmountCents = payable.totalAmountCents;
    payable.remainingAmountCents = 0;
    payable.status = 'paid';
    payable.updatedAt = now;
  }

  appendAuditLog(
    state,
    'PURCHASE_PAID',
    'purchase',
    purchase.id,
    `Pagamento confirmado para compra ${purchase.id}: ${amountToPayCents} centavos.`,
    now
  );

  return state;
}

/**
 * Confirm Physical Receipt of an existing Purchase (prevents duplicate receipt)
 * Creates the InventoryLot and StockMovement ('purchase_entry').
 */
export function executeReceivePurchase(
  currentState: BusinessDatabaseState,
  payload: {
    purchaseId: string;
    receivedDate?: string;
    lotNumber?: string;
    expirationDate?: string;
    nowISO?: string;
  }
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  const purchase = state.purchases.find((p) => p.id === payload.purchaseId);
  if (!purchase) throw new Error('Compra não encontrada.');
  if (purchase.receiptStatus === 'received' || purchase.createdLotId) {
    throw new Error('Esta compra já foi recebida no estoque. Recebimento duplicado bloqueado.');
  }
  if (purchase.receiptStatus === 'cancelled') {
    throw new Error('Não é possível receber mercadoria de uma compra cancelada.');
  }

  const product = state.products.find((p) => p.id === purchase.productId);
  if (!product) throw new Error('Produto da compra não encontrado.');

  const prevInv = getProductInventorySummary(product.id, state.inventoryLots, now);
  const previousStock = prevInv.totalPhysicalUnits;

  const lotId = generateId('lot');
  const lotNumber = payload.lotNumber?.trim() || purchase.lotNumber;
  const expirationDate = payload.expirationDate || purchase.expirationDate;

  const lot: InventoryLot = {
    id: lotId,
    businessId: state.profile.businessId,
    productId: product.id,
    lotNumber,
    manufacturingDate: purchase.manufacturingDate,
    expirationDate,
    quantityReceived: purchase.totalUnits,
    quantityRemaining: purchase.totalUnits,
    unitAcquisitionCostCents: purchase.effectiveUnitCostCents,
    originPurchaseId: purchase.id,
    createdAt: now,
    updatedAt: now,
  };

  state.inventoryLots.push(lot);

  const newStock = previousStock + purchase.totalUnits;
  const movId = generateId('mov');
  const movement: StockMovement = {
    id: movId,
    businessId: state.profile.businessId,
    productId: product.id,
    productName: product.name,
    lotId: lot.id,
    lotNumber: lot.lotNumber,
    quantity: purchase.totalUnits,
    direction: 'in',
    type: 'purchase_entry',
    reason: `Entrada por compra de ${purchase.supplierName} (${purchase.boxesQuantity} cx)`,
    unitCostCents: purchase.effectiveUnitCostCents,
    totalCostCents: purchase.totalCostCents,
    responsibleUserId: state.profile.uid,
    responsibleUserName: state.profile.displayName || state.profile.email,
    originDocumentId: purchase.id,
    previousStock,
    newStock,
    createdAt: now,
  };

  state.stockMovements.unshift(movement);

  purchase.receiptStatus = 'received';
  purchase.receivedDate = payload.receivedDate || now.slice(0, 10);
  purchase.lotNumber = lotNumber;
  purchase.expirationDate = expirationDate;
  purchase.createdLotId = lotId;
  purchase.updatedAt = now;

  // Update product reference cost & supplier negotiated price
  product.acquisitionCostCents = purchase.effectiveUnitCostCents;
  product.active = true;
  product.updatedAt = now;

  const supplier = state.suppliers.find((s) => s.id === purchase.supplierId);
  if (supplier) {
    supplier.negotiatedPrices = {
      ...(supplier.negotiatedPrices || {}),
      [product.id]: purchase.effectiveUnitCostCents,
    };
    supplier.updatedAt = now;
  }

  appendAuditLog(
    state,
    'PURCHASE_RECEIVED',
    'purchase',
    purchase.id,
    `Mercadoria recebida: +${purchase.totalUnits} un no lote ${lotNumber} a ${purchase.effectiveUnitCostCents} centavos/un.`,
    now
  );

  return state;
}

/**
 * 3. ATOMIC POINT OF SALE (PDV) CHECKOUT (Section 6)
 * Executes all 10 steps atomically:
 * 1. Validate stock availability (FEFO, blocking expired lots)
 * 2. Validate prices, quantities, and discounts
 * 3. Register sale with idempotency key protection
 * 4. Record items & historical costs from consumed lots
 * 5. Deduct stock from specific FEFO lots
 * 6. Create StockMovement for each lot consumed
 * 7. Record financial inflow when received immediately
 * 8. Record receivable when payment is deferred
 * 9. Update customer CRM stats & loyalty points
 * 10. Create audit log
 */
export interface PosCartItemInput {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  itemDiscountCents?: number;
  isLoyaltyFreeReward?: boolean;
}

export interface CreateSalePayload {
  idempotencyKey: string;
  items: PosCartItemInput[];
  generalDiscountCents?: number;
  customerId?: string;
  paymentMethod: string;
  accountId: string;
  paymentReceivedImmediately?: boolean;
  isPixPending?: boolean;
  isCardToSettle?: boolean;
  cardFeePercentOverride?: number;
  adminApprovalPin?: string;
  actingRole?: Role;
  dueDate?: string;
  notes?: string;
  salesChannel?: string;
  nowISO?: string;
}

export function executePosSale(
  currentState: BusinessDatabaseState,
  payload: CreateSalePayload
): { state: BusinessDatabaseState; sale: Sale; duplicateIdempotentHit?: boolean } {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  if (!payload.idempotencyKey) {
    throw new Error('Chave de idempotência obrigatória para registrar venda.');
  }

  // Idempotent retry behavior: if the exact same sale is resubmitted, return the existing single record!
  const existingSaleId = state.idempotencyKeys[payload.idempotencyKey];
  if (existingSaleId) {
    const existingSale = state.sales.find((s) => s.id === existingSaleId);
    if (existingSale) {
      return {
        state,
        sale: existingSale,
        duplicateIdempotentHit: true,
      };
    }
    throw new Error('Venda já processada (proteção contra clique duplicado).');
  }

  if (!payload.items || payload.items.length === 0) {
    throw new Error('O carrinho de vendas está vazio.');
  }

  const saleId = generateId('sale');
  const saleNumber = state.sales.length + 1;
  const saleCode = `#V${String(saleNumber).padStart(4, '0')}`;

  const saleItems: SaleItem[] = [];
  let totalUnits = 0;
  let subtotalCents = 0;
  let itemDiscountsTotalCents = 0;
  let totalCmvCents = 0;
  let promotionalLoyaltyCostCents = 0;
  let paidUnitsCountForLoyalty = 0;
  let redeemedLoyaltyUnitsCount = 0;

  for (const cartItem of payload.items) {
    if (cartItem.quantity <= 0 || !Number.isInteger(cartItem.quantity)) {
      throw new Error('A quantidade de cada item deve ser um número inteiro positivo.');
    }

    const product = state.products.find((p) => p.id === cartItem.productId);
    if (!product) {
      throw new Error(`Produto não encontrado (${cartItem.productId}).`);
    }

    const isFreeReward = Boolean(cartItem.isLoyaltyFreeReward);
    const unitPriceCents = isFreeReward ? 0 : cartItem.unitPriceCents;
    if (!isFreeReward && unitPriceCents < 0) {
      throw new Error(`Preço unitário inválido para ${product.name}.`);
    }

    const itemDiscountCents = isFreeReward ? 0 : (cartItem.itemDiscountCents || 0);
    const grossTotalCents = cartItem.quantity * unitPriceCents;
    if (itemDiscountCents < 0 || itemDiscountCents > grossTotalCents) {
      throw new Error(`Desconto inválido no item ${product.name}.`);
    }

    const netTotalCents = grossTotalCents - itemDiscountCents;

    // Step 1 & 4 & 5: FEFO allocation against current state.inventoryLots
    const prevSummary = getProductInventorySummary(product.id, state.inventoryLots, now);
    let runningPreviousStock = prevSummary.totalPhysicalUnits;

    const allocation = allocateLotsFEFO(
      product.id,
      cartItem.quantity,
      state.inventoryLots,
      now
    );

    // Mutate lots and create stock movements per consumed lot
    for (const consumed of allocation.consumedLots) {
      const lot = state.inventoryLots.find((l) => l.id === consumed.lotId);
      if (!lot || lot.quantityRemaining < consumed.quantity) {
        throw new Error(`Conflito de concorrência no lote ${consumed.lotNumber}.`);
      }

      lot.quantityRemaining -= consumed.quantity;
      lot.updatedAt = now;

      const newStockAfterLot = runningPreviousStock - consumed.quantity;
      const movement: StockMovement = {
        id: generateId('mov'),
        businessId: state.profile.businessId,
        productId: product.id,
        productName: product.name,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        quantity: consumed.quantity,
        direction: 'out',
        type: isFreeReward ? 'promotional_loyalty_exit' : 'sale_exit',
        reason: isFreeReward
          ? `Brinde Fidelidade na Venda ${saleCode}`
          : `Venda ${saleCode}`,
        unitCostCents: consumed.unitCostCents,
        totalCostCents: consumed.totalCostCents,
        responsibleUserId: state.profile.uid,
        responsibleUserName: state.profile.displayName || state.profile.email,
        originDocumentId: saleId,
        previousStock: runningPreviousStock,
        newStock: newStockAfterLot,
        createdAt: now,
      };
      state.stockMovements.unshift(movement);
      runningPreviousStock = newStockAfterLot;
    }

    const historicalCost = allocation.totalHistoricalCostCents;
    const itemGrossProfit = isFreeReward ? 0 : netTotalCents - historicalCost;

    saleItems.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity: cartItem.quantity,
      unitPriceCents,
      itemDiscountCents,
      grossTotalCents,
      netTotalCents,
      historicalCmvCents: isFreeReward ? 0 : historicalCost,
      grossProfitCents: itemGrossProfit,
      isLoyaltyFreeReward: isFreeReward,
      consumedLots: allocation.consumedLots,
    });

    totalUnits += cartItem.quantity;
    subtotalCents += grossTotalCents;
    itemDiscountsTotalCents += itemDiscountCents;

    if (isFreeReward) {
      promotionalLoyaltyCostCents += historicalCost;
      redeemedLoyaltyUnitsCount += cartItem.quantity;
    } else {
      totalCmvCents += historicalCost;
      paidUnitsCountForLoyalty += cartItem.quantity;
    }
  }

  const generalDiscountCents = payload.generalDiscountCents || 0;
  const totalAfterItemDiscounts = subtotalCents - itemDiscountsTotalCents;
  if (generalDiscountCents < 0 || generalDiscountCents > totalAfterItemDiscounts) {
    throw new Error('O desconto geral não pode exceder o valor subtotal da venda.');
  }

  const totalDiscountCents = itemDiscountsTotalCents + generalDiscountCents;
  const totalCents = subtotalCents - totalDiscountCents;
  const grossProfitCents = totalCents - totalCmvCents;

  // Check operator discount limit and require admin approval when above threshold
  const discountPercent =
    subtotalCents > 0 ? (totalDiscountCents / subtotalCents) * 100 : 0;
  const maxOperatorDiscountPct =
    state.settings.permissionsConfig?.operatorMaxDiscountPercent ?? 10;
  let approvedByAdminName: string | undefined;

  if (discountPercent > maxOperatorDiscountPct) {
    approvedByAdminName = verifyAdminOrApproval(
      state,
      `Desconto de ${discountPercent.toFixed(1)}% acima do limite de ${maxOperatorDiscountPct}%`,
      payload.adminApprovalPin,
      payload.actingRole
    );
  }

  // Optional customer update (CRM & Loyalty)
  let customerName: string | undefined;
  if (payload.customerId) {
    const customer = state.customers.find((c) => c.id === payload.customerId);
    if (customer) {
      customerName = customer.name;
      if (!customer.firstPurchaseDate) {
        customer.firstPurchaseDate = now;
      }
      customer.lastPurchaseDate = now;
      customer.totalPurchasesCount += 1;
      customer.totalUnitsBought += totalUnits;
      customer.totalSpentCents += totalCents;
      customer.averageTicketCents = Math.round(
        customer.totalSpentCents / customer.totalPurchasesCount
      );
      if (saleItems.length > 0) {
        customer.favoriteProductId = saleItems[0].productId;
        customer.favoriteProductName = saleItems[0].productName;
      }

      if (state.settings.loyaltyRules.enabled) {
        const requiredPerReward = state.settings.loyaltyRules.paidUnitsRequired || 10;
        if (redeemedLoyaltyUnitsCount > 0) {
          const pointsNeeded = redeemedLoyaltyUnitsCount * requiredPerReward;
          if (customer.loyaltyPointsPaidUnits < pointsNeeded) {
            throw new Error(
              `Cliente não possui selos suficientes no programa de fidelidade (${customer.loyaltyPointsPaidUnits}/${pointsNeeded}).`
            );
          }
          customer.loyaltyPointsPaidUnits -= pointsNeeded;
          customer.loyaltyRewardsRedeemed += redeemedLoyaltyUnitsCount;
        }
        customer.loyaltyPointsPaidUnits += paidUnitsCountForLoyalty;
      }
      customer.updatedAt = now;
    }
  }

  const isCardMethod =
    payload.paymentMethod === 'Cartão de débito' ||
    payload.paymentMethod === 'Cartão de crédito';
  const isCardToSettle =
    payload.isCardToSettle !== undefined ? payload.isCardToSettle : isCardMethod;
  const isPixPending = Boolean(
    payload.paymentMethod === 'Pix' && payload.isPixPending
  );

  // Determine card acquirer fee if paid by card
  let cardFeeCents = 0;
  if (isCardMethod && totalCents > 0) {
    const defaultFeePct =
      payload.paymentMethod === 'Cartão de débito'
        ? (state.settings.permissionsConfig?.debitCardFeePercent ?? 1.99)
        : (state.settings.permissionsConfig?.creditCardFeePercent ?? 3.99);
    const feePct =
      payload.cardFeePercentOverride !== undefined
        ? payload.cardFeePercentOverride
        : defaultFeePct;
    cardFeeCents = Math.round(totalCents * (feePct / 100));
  }
  const netSettlementCents = Math.max(0, totalCents - cardFeeCents);

  const paymentReceivedImmediately =
    !isPixPending &&
    !isCardToSettle &&
    payload.paymentReceivedImmediately !== false;

  const paymentStatus = isPixPending
    ? 'pending_pix'
    : isCardToSettle
    ? 'pending_card_settlement'
    : paymentReceivedImmediately
    ? 'received'
    : 'pending_receivable';

  const sale: Sale = {
    id: saleId,
    businessId: state.profile.businessId,
    code: saleCode,
    idempotencyKey: payload.idempotencyKey,
    customerId: payload.customerId,
    customerName,
    items: saleItems,
    totalUnits,
    subtotalCents,
    itemDiscountsTotalCents,
    generalDiscountCents,
    totalDiscountCents,
    totalCents,
    totalCmvCents,
    promotionalLoyaltyCostCents,
    grossProfitCents,
    cardFeeCents,
    netSettlementCents,
    paymentMethod: payload.paymentMethod,
    accountId: payload.accountId || 'acc_pix',
    paymentReceivedImmediately,
    paymentStatus,
    approvedByAdminName,
    status: 'completed',
    notes: payload.notes,
    salesChannel: payload.salesChannel || 'Venda Presencial',
    responsibleUserId: state.profile.uid,
    responsibleUserName: state.profile.displayName || state.profile.email,
    createdAt: now,
  };

  state.sales.unshift(sale);
  state.idempotencyKeys[payload.idempotencyKey] = saleId;

  // Step 7 & 8: Financial inflow or Account Receivable (Pix Pendente / Cartão a Liquidar)
  if (totalCents > 0) {
    if (paymentReceivedImmediately) {
      const tx: FinancialTransaction = {
        id: generateId('tx'),
        businessId: state.profile.businessId,
        type: 'sale_receipt',
        direction: 'in',
        categoryId: 'cat_sales',
        categoryName: 'Receita de vendas',
        accountId: sale.accountId,
        amountCents: totalCents,
        description: `Recebimento Venda ${saleCode} (${sale.paymentMethod})`,
        referenceDocumentId: sale.id,
        occurredAt: now,
        createdByUserId: state.profile.uid,
        createdAt: now,
      };
      state.financialTransactions.unshift(tx);

      if (cardFeeCents > 0) {
        state.financialTransactions.unshift({
          id: generateId('tx'),
          businessId: state.profile.businessId,
          type: 'payment_fee',
          direction: 'out',
          categoryId: 'cat_bank_fees',
          categoryName: 'Taxas bancárias',
          accountId: sale.accountId,
          amountCents: cardFeeCents,
          description: `Taxa de maquininha Venda ${saleCode} (${sale.paymentMethod})`,
          referenceDocumentId: sale.id,
          occurredAt: now,
          createdByUserId: state.profile.uid,
          createdAt: now,
        });
      }
    } else {
      const recKind = isPixPending
        ? 'pix_pending'
        : isCardToSettle
        ? 'card_settlement'
        : 'customer_credit';
      const recAmountCents = isCardToSettle ? netSettlementCents : totalCents;
      const receivable: AccountReceivable = {
        id: generateId('rec'),
        businessId: state.profile.businessId,
        customerId: sale.customerId,
        customerName: sale.customerName || 'Consumidor Final',
        description: isPixPending
          ? `Pix Pendente de Confirmação — Venda ${saleCode}`
          : isCardToSettle
          ? `Cartão a Liquidar (${sale.paymentMethod}) — Venda ${saleCode}`
          : `Venda a prazo ${saleCode}`,
        totalAmountCents: recAmountCents,
        grossSaleAmountCents: totalCents,
        cardFeeCents,
        receivedAmountCents: 0,
        remainingAmountCents: recAmountCents,
        dueDate: payload.dueDate || now.slice(0, 10),
        status: 'pending',
        originSaleId: sale.id,
        receivableKind: recKind,
        targetAccountId: sale.accountId,
        createdAt: now,
        updatedAt: now,
      };
      state.receivables.unshift(receivable);
    }
  }

  appendAuditLog(
    state,
    'SALE_COMPLETED',
    'sale',
    sale.id,
    `Venda ${saleCode} concluída: ${totalUnits} un | Total: ${totalCents} centavos | CMV: ${totalCmvCents} centavos.`,
    now
  );

  return { state, sale };
}

/**
 * 4. SALE REFUND / CANCELLATION (Section 7)
 * Never deletes a completed sale.
 * Records a compensatory financial operation (if payment was received),
 * restores stock to the original consumed lots ONLY if returnToSellableStock is true.
 * If returnToSellableStock is false, records the unrecovered product cost as an inventory loss movement.
 */
export interface RefundSalePayload {
  saleId: string;
  mode: 'refunded' | 'cancelled';
  returnToSellableStock: boolean;
  reason: string;
  adminApprovalPin?: string;
  actingRole?: Role;
  nowISO?: string;
}

export function executeRefundOrCancelSale(
  currentState: BusinessDatabaseState,
  payload: RefundSalePayload
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  verifyAdminOrApproval(
    state,
    'Estorno ou Cancelamento de Venda',
    payload.adminApprovalPin,
    payload.actingRole
  );

  if (!payload.reason || !payload.reason.trim()) {
    throw new Error('É obrigatório informar o motivo do estorno ou cancelamento.');
  }

  const sale = state.sales.find((s) => s.id === payload.saleId);
  if (!sale) throw new Error('Venda não encontrada.');
  if (sale.status !== 'completed') {
    throw new Error('Esta venda já foi estornada ou cancelada.');
  }

  sale.status = payload.mode;
  sale.refundReason = payload.reason.trim();
  sale.refundReturnedToStock = payload.returnToSellableStock;
  sale.refundedAt = now;

  // Compensatory financial transaction if cash was collected
  if (sale.paymentReceivedImmediately && sale.totalCents > 0) {
    const tx: FinancialTransaction = {
      id: generateId('tx'),
      businessId: state.profile.businessId,
      type: 'sale_refund',
      direction: 'out',
      categoryId: 'cat_sales',
      categoryName: 'Estorno de Venda',
      accountId: sale.accountId,
      amountCents: sale.totalCents,
      description: `Estorno financeiro da Venda ${sale.code}: ${sale.refundReason}`,
      referenceDocumentId: sale.id,
      occurredAt: now,
      createdByUserId: state.profile.uid,
      createdAt: now,
    };
    state.financialTransactions.unshift(tx);
  } else {
    // Cancel pending receivable if any
    const rec = state.receivables.find((r) => r.originSaleId === sale.id);
    if (rec && rec.status !== 'paid') {
      rec.status = 'cancelled';
      rec.remainingAmountCents = 0;
      rec.updatedAt = now;
    }
  }

  // Handle inventory return vs loss
  for (const item of sale.items) {
    const prevSummary = getProductInventorySummary(item.productId, state.inventoryLots, now);
    let runningPrevStock = prevSummary.totalPhysicalUnits;

    for (const consumed of item.consumedLots) {
      const lot = state.inventoryLots.find((l) => l.id === consumed.lotId);
      if (payload.returnToSellableStock && lot) {
        lot.quantityRemaining += consumed.quantity;
        lot.updatedAt = now;
        const newStock = runningPrevStock + consumed.quantity;

        const mov: StockMovement = {
          id: generateId('mov'),
          businessId: state.profile.businessId,
          productId: item.productId,
          productName: item.productName,
          lotId: lot.id,
          lotNumber: lot.lotNumber,
          quantity: consumed.quantity,
          direction: 'in',
          type: 'return_entry',
          reason: `Devolução vendável (Estorno ${sale.code}): ${sale.refundReason}`,
          unitCostCents: consumed.unitCostCents,
          totalCostCents: consumed.totalCostCents,
          responsibleUserId: state.profile.uid,
          responsibleUserName: state.profile.displayName || state.profile.email,
          originDocumentId: sale.id,
          previousStock: runningPrevStock,
          newStock,
          createdAt: now,
        };
        state.stockMovements.unshift(mov);
        runningPrevStock = newStock;
      } else {
        // Merchandise was not returned in sellable condition: record loss so cost is accounted in DRE losses
        const mov: StockMovement = {
          id: generateId('mov'),
          businessId: state.profile.businessId,
          productId: item.productId,
          productName: item.productName,
          lotId: consumed.lotId,
          lotNumber: consumed.lotNumber,
          quantity: consumed.quantity,
          direction: 'out',
          type: 'loss',
          reason: `Estorno sem retorno ao estoque vendável (${sale.code}): ${sale.refundReason}`,
          unitCostCents: consumed.unitCostCents,
          totalCostCents: consumed.totalCostCents,
          responsibleUserId: state.profile.uid,
          responsibleUserName: state.profile.displayName || state.profile.email,
          originDocumentId: sale.id,
          previousStock: runningPrevStock,
          newStock: runningPrevStock,
          createdAt: now,
        };
        state.stockMovements.unshift(mov);
      }
    }
  }

  // Revert customer stats if associated
  if (sale.customerId) {
    const customer = state.customers.find((c) => c.id === sale.customerId);
    if (customer) {
      customer.totalPurchasesCount = Math.max(0, customer.totalPurchasesCount - 1);
      customer.totalUnitsBought = Math.max(0, customer.totalUnitsBought - sale.totalUnits);
      customer.totalSpentCents = Math.max(0, customer.totalSpentCents - sale.totalCents);
      customer.averageTicketCents =
        customer.totalPurchasesCount > 0
          ? Math.round(customer.totalSpentCents / customer.totalPurchasesCount)
          : 0;
      customer.updatedAt = now;
    }
  }

  appendAuditLog(
    state,
    'SALE_REFUNDED',
    'sale',
    sale.id,
    `Venda ${sale.code} marcada como ${payload.mode}. Retornou ao estoque: ${payload.returnToSellableStock ? 'Sim' : 'Não'}. Motivo: ${sale.refundReason}`,
    now
  );

  return state;
}

/**
 * 5. INVENTORY MOVEMENTS & PHYSICAL INVENTORY AUDIT (Section 9)
 * Never changes lot quantities without creating a corresponding StockMovement.
 */
export interface ManualStockAdjustmentPayload {
  lotId: string;
  type: 'loss' | 'damage' | 'expiration' | 'positive_adjustment' | 'negative_adjustment';
  quantity: number;
  reason: string;
  adminApprovalPin?: string;
  actingRole?: Role;
  nowISO?: string;
}

export function executeStockLotAdjustment(
  currentState: BusinessDatabaseState,
  payload: ManualStockAdjustmentPayload
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  verifyAdminOrApproval(
    state,
    'Ajuste / Baixa de Estoque',
    payload.adminApprovalPin,
    payload.actingRole
  );

  if (payload.quantity <= 0 || !Number.isInteger(payload.quantity)) {
    throw new Error('A quantidade movimentada deve ser um número inteiro maior que zero.');
  }
  if (!payload.reason || !payload.reason.trim()) {
    throw new Error('É obrigatório informar a justificativa da movimentação de estoque.');
  }

  const lot = state.inventoryLots.find((l) => l.id === payload.lotId);
  if (!lot) throw new Error('Lote não encontrado.');

  const product = state.products.find((p) => p.id === lot.productId);
  if (!product) throw new Error('Produto do lote não encontrado.');

  const prevSummary = getProductInventorySummary(product.id, state.inventoryLots, now);
  const previousStock = prevSummary.totalPhysicalUnits;

  const isEntry = payload.type === 'positive_adjustment';
  if (!isEntry && lot.quantityRemaining < payload.quantity) {
    throw new Error(
      `Quantidade insuficiente no lote ${lot.lotNumber}. Saldo atual: ${lot.quantityRemaining} un.`
    );
  }

  lot.quantityRemaining = isEntry
    ? lot.quantityRemaining + payload.quantity
    : lot.quantityRemaining - payload.quantity;
  lot.updatedAt = now;

  const newStock = isEntry
    ? previousStock + payload.quantity
    : previousStock - payload.quantity;

  const totalCostCents = payload.quantity * lot.unitAcquisitionCostCents;

  const mov: StockMovement = {
    id: generateId('mov'),
    businessId: state.profile.businessId,
    productId: product.id,
    productName: product.name,
    lotId: lot.id,
    lotNumber: lot.lotNumber,
    quantity: payload.quantity,
    direction: isEntry ? 'in' : 'out',
    type: payload.type,
    reason: payload.reason.trim(),
    unitCostCents: lot.unitAcquisitionCostCents,
    totalCostCents,
    responsibleUserId: state.profile.uid,
    responsibleUserName: state.profile.displayName || state.profile.email,
    previousStock,
    newStock,
    createdAt: now,
  };

  state.stockMovements.unshift(mov);

  appendAuditLog(
    state,
    'STOCK_ADJUSTMENT',
    'inventoryLot',
    lot.id,
    `Movimentação (${payload.type}) no lote ${lot.lotNumber}: ${isEntry ? '+' : '-'}${payload.quantity} un. Motivo: ${payload.reason}`,
    now
  );

  return state;
}

/**
 * Physical Inventory Count Reconciliation for a Specific Lot
 */
export function executePhysicalInventoryCount(
  currentState: BusinessDatabaseState,
  payload: {
    lotId: string;
    countedPhysicalQuantity: number;
    justification: string;
    nowISO?: string;
  }
): BusinessDatabaseState {
  const lot = currentState.inventoryLots.find((l) => l.id === payload.lotId);
  if (!lot) throw new Error('Lote não encontrado.');
  if (payload.countedPhysicalQuantity < 0 || !Number.isInteger(payload.countedPhysicalQuantity)) {
    throw new Error('A quantidade física contada deve ser um número inteiro não negativo.');
  }

  const diff = payload.countedPhysicalQuantity - lot.quantityRemaining;
  if (diff === 0) {
    return currentState;
  }
  if (!payload.justification || !payload.justification.trim()) {
    throw new Error('Divergências de inventário físico exigem justificativa obrigatória.');
  }

  return executeStockLotAdjustment(currentState, {
    lotId: payload.lotId,
    type: diff > 0 ? 'positive_adjustment' : 'negative_adjustment',
    quantity: Math.abs(diff),
    reason: `Inventário Físico (Registrado: ${lot.quantityRemaining} un -> Contado: ${payload.countedPhysicalQuantity} un): ${payload.justification.trim()}`,
    nowISO: payload.nowISO,
  });
}

/**
 * 6. FINANCIAL TRANSACTIONS & ACCOUNT TRANSFERS (Section 11)
 */
export interface CreateFinancialEntryPayload {
  type:
    | 'owner_contribution'
    | 'owner_withdrawal'
    | 'operational_expense'
    | 'transport_expense'
    | 'payment_fee'
    | 'other_income'
    | 'other_expense';
  categoryId: string;
  accountId: string;
  amountCents: number;
  description: string;
  occurredAt?: string;
  nowISO?: string;
}

export function executeFinancialEntry(
  currentState: BusinessDatabaseState,
  payload: CreateFinancialEntryPayload
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  if (payload.amountCents <= 0) {
    throw new Error('O valor do lançamento financeiro deve ser maior que zero.');
  }
  if (!payload.description || !payload.description.trim()) {
    throw new Error('A descrição do lançamento é obrigatória.');
  }

  const category = state.settings.financialCategories.find((c) => c.id === payload.categoryId);
  const categoryName = category ? category.name : 'Geral';

  const isInflow =
    payload.type === 'owner_contribution' || payload.type === 'other_income';

  const txId = generateId('tx');
  const tx: FinancialTransaction = {
    id: txId,
    businessId: state.profile.businessId,
    type: payload.type,
    direction: isInflow ? 'in' : 'out',
    categoryId: payload.categoryId,
    categoryName,
    accountId: payload.accountId,
    amountCents: payload.amountCents,
    description: payload.description.trim(),
    occurredAt: payload.occurredAt || now,
    createdByUserId: state.profile.uid,
    createdAt: now,
  };

  state.financialTransactions.unshift(tx);

  appendAuditLog(
    state,
    'FINANCIAL_ENTRY',
    'financialTransaction',
    txId,
    `Lançamento (${payload.type}): ${payload.amountCents} centavos — ${tx.description}`,
    now
  );

  return state;
}

export function executeAccountTransfer(
  currentState: BusinessDatabaseState,
  payload: {
    sourceAccountId: string;
    targetAccountId: string;
    amountCents: number;
    description?: string;
    nowISO?: string;
  }
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  if (payload.sourceAccountId === payload.targetAccountId) {
    throw new Error('A conta de origem e destino devem ser diferentes.');
  }
  if (payload.amountCents <= 0) {
    throw new Error('O valor da transferência deve ser maior que zero.');
  }

  const sourceAcc = state.accounts.find((a) => a.id === payload.sourceAccountId);
  const targetAcc = state.accounts.find((a) => a.id === payload.targetAccountId);
  if (!sourceAcc || !targetAcc) {
    throw new Error('Conta financeira não encontrada.');
  }

  const txId = generateId('tx');
  const tx: FinancialTransaction = {
    id: txId,
    businessId: state.profile.businessId,
    type: 'account_transfer',
    direction: 'transfer',
    categoryId: 'cat_transfer',
    categoryName: 'Transferência entre contas',
    accountId: sourceAcc.id,
    targetAccountId: targetAcc.id,
    amountCents: payload.amountCents,
    description:
      payload.description?.trim() ||
      `Transferência: ${sourceAcc.name} -> ${targetAcc.name}`,
    occurredAt: now,
    createdByUserId: state.profile.uid,
    createdAt: now,
  };

  state.financialTransactions.unshift(tx);

  appendAuditLog(
    state,
    'ACCOUNT_TRANSFER',
    'financialTransaction',
    txId,
    `Transferência de ${payload.amountCents} centavos de ${sourceAcc.name} para ${targetAcc.name}`,
    now
  );

  return state;
}

/**
 * 7. ACCOUNTS PAYABLE & RECEIVABLE PARTIAL OR FULL SETTLEMENT (Section 11)
 */
export function executeSettlePayable(
  currentState: BusinessDatabaseState,
  payload: {
    payableId: string;
    paymentAmountCents: number;
    accountId: string;
    nowISO?: string;
  }
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  const payable = state.payables.find((p) => p.id === payload.payableId);
  if (!payable) throw new Error('Conta a pagar não encontrada.');
  if (payable.status === 'paid' || payable.status === 'cancelled') {
    throw new Error('Esta conta a pagar já foi quitada ou cancelada.');
  }
  if (payload.paymentAmountCents <= 0 || payload.paymentAmountCents > payable.remainingAmountCents) {
    throw new Error('Valor de pagamento inválido ou superior ao saldo restante.');
  }

  payable.paidAmountCents += payload.paymentAmountCents;
  payable.remainingAmountCents -= payload.paymentAmountCents;
  payable.status = payable.remainingAmountCents === 0 ? 'paid' : 'pending';
  payable.updatedAt = now;

  // Sync purchase payment status if linked
  if (payable.originPurchaseId) {
    const purchase = state.purchases.find((p) => p.id === payable.originPurchaseId);
    if (purchase) {
      purchase.paymentStatus = payable.remainingAmountCents === 0 ? 'paid' : 'partial';
      purchase.paymentDate = now.slice(0, 10);
      purchase.updatedAt = now;
    }
  }

  const tx: FinancialTransaction = {
    id: generateId('tx'),
    businessId: state.profile.businessId,
    type: payable.isInventoryAcquisition ? 'supplier_payment' : 'operational_expense',
    direction: 'out',
    categoryId: payable.categoryId,
    categoryName: payable.categoryName,
    accountId: payload.accountId,
    amountCents: payload.paymentAmountCents,
    description: `Baixa Conta a Pagar: ${payable.description}`,
    referenceDocumentId: payable.id,
    occurredAt: now,
    createdByUserId: state.profile.uid,
    createdAt: now,
  };
  state.financialTransactions.unshift(tx);

  return state;
}

export function executeSettleReceivable(
  currentState: BusinessDatabaseState,
  payload: {
    receivableId: string;
    receivedAmountCents: number;
    accountId: string;
    nowISO?: string;
  }
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();

  const rec = state.receivables.find((r) => r.id === payload.receivableId);
  if (!rec) throw new Error('Conta a receber não encontrada.');
  if (rec.status === 'paid' || rec.status === 'cancelled') {
    throw new Error('Este título já foi recebido ou cancelado.');
  }
  if (payload.receivedAmountCents <= 0 || payload.receivedAmountCents > rec.remainingAmountCents) {
    throw new Error('Valor recebido inválido ou superior ao saldo pendente.');
  }

  rec.receivedAmountCents += payload.receivedAmountCents;
  rec.remainingAmountCents -= payload.receivedAmountCents;
  rec.status = rec.remainingAmountCents === 0 ? 'paid' : 'pending';
  rec.updatedAt = now;

  // If linked to a sale (e.g. Pix Pendente or Cartão a Liquidar), mark sale paymentStatus as received when fully settled
  if (rec.originSaleId && rec.remainingAmountCents === 0) {
    const originSale = state.sales.find((s) => s.id === rec.originSaleId);
    if (originSale) {
      originSale.paymentStatus = 'received';
      originSale.paymentReceivedImmediately = true;
    }
  }

  // If settling a card receivable that had an acquirer fee, record the full gross sale inflow and the fee outflow so DRE recognizes the card fee expense accurately
  if (
    rec.receivableKind === 'card_settlement' &&
    rec.cardFeeCents &&
    rec.cardFeeCents > 0 &&
    rec.remainingAmountCents === 0
  ) {
    const grossInflow = payload.receivedAmountCents + rec.cardFeeCents;
    state.financialTransactions.unshift({
      id: generateId('tx'),
      businessId: state.profile.businessId,
      type: 'sale_receipt',
      direction: 'in',
      categoryId: 'cat_sales',
      categoryName: 'Receita de vendas',
      accountId: payload.accountId,
      amountCents: grossInflow,
      description: `Liquidação Bruta Cartão: ${rec.description}`,
      referenceDocumentId: rec.id,
      occurredAt: now,
      createdByUserId: state.profile.uid,
      createdAt: now,
    });
    state.financialTransactions.unshift({
      id: generateId('tx'),
      businessId: state.profile.businessId,
      type: 'payment_fee',
      direction: 'out',
      categoryId: 'cat_bank_fees',
      categoryName: 'Taxas bancárias',
      accountId: payload.accountId,
      amountCents: rec.cardFeeCents,
      description: `Taxa de Liquidação de Cartão: ${rec.description}`,
      referenceDocumentId: rec.id,
      occurredAt: now,
      createdByUserId: state.profile.uid,
      createdAt: now,
    });
  } else {
    const tx: FinancialTransaction = {
      id: generateId('tx'),
      businessId: state.profile.businessId,
      type: 'sale_receipt',
      direction: 'in',
      categoryId: 'cat_sales',
      categoryName: 'Receita de vendas',
      accountId: payload.accountId,
      amountCents: payload.receivedAmountCents,
      description: `Recebimento de Conta a Receber: ${rec.description}`,
      referenceDocumentId: rec.id,
      occurredAt: now,
      createdByUserId: state.profile.uid,
      createdAt: now,
    };
    state.financialTransactions.unshift(tx);
  }

  return state;
}

/**
 * Confirm Pending Pix on a Sale directly
 */
export function executeConfirmPendingPixSale(
  currentState: BusinessDatabaseState,
  payload: {
    saleId: string;
    accountId?: string;
    nowISO?: string;
  }
): BusinessDatabaseState {
  const rec = currentState.receivables.find(
    (r) =>
      r.originSaleId === payload.saleId &&
      r.status !== 'paid' &&
      r.status !== 'cancelled'
  );
  if (!rec) {
    throw new Error('Não há Pix pendente para esta venda.');
  }
  const sale = currentState.sales.find((s) => s.id === payload.saleId);
  return executeSettleReceivable(currentState, {
    receivableId: rec.id,
    receivedAmountCents: rec.remainingAmountCents,
    accountId: payload.accountId || sale?.accountId || 'acc_pix',
    nowISO: payload.nowISO,
  });
}

/**
 * Shift Closing (Fechamento de Caixa por Turno) — Item 4
 * Compares physical cash counted, Pix received vs pending, and Card to settle.
 */
export function executeCloseShift(
  currentState: BusinessDatabaseState,
  payload: {
    countedPhysicalCashCents: number;
    confirmedPixReceivedCents: number;
    notes?: string;
    nowISO?: string;
  }
): { state: BusinessDatabaseState; closing: ShiftClosingRecord } {
  const state = cloneState(currentState);
  const now = payload.nowISO || new Date().toISOString();
  const snap = calculateFinancialSnapshot(state, undefined, now);

  const expectedPhysicalCashCents = snap.accountBalances['acc_cash'] ?? 0;
  const expectedPixReceivedCents = snap.accountBalances['acc_pix'] ?? 0;
  const cashDifferenceCents =
    payload.countedPhysicalCashCents - expectedPhysicalCashCents;

  const closing: ShiftClosingRecord = {
    id: generateId('shift'),
    businessId: state.profile.businessId,
    openedAt: state.shiftClosings?.[0]?.closedAt || state.profile.createdAt,
    closedAt: now,
    closedByUserId: state.profile.uid,
    closedByUserName: state.profile.displayName || state.profile.email,
    expectedPhysicalCashCents,
    countedPhysicalCashCents: payload.countedPhysicalCashCents,
    cashDifferenceCents,
    expectedPixReceivedCents,
    confirmedPixReceivedCents: payload.confirmedPixReceivedCents,
    pixPendingCents: snap.pendingPixCents,
    cardToSettleReceivablesCents: snap.pendingCardSettlementCents,
    notes: payload.notes,
  };

  if (!state.shiftClosings) {
    state.shiftClosings = [];
  }
  state.shiftClosings.unshift(closing);

  appendAuditLog(
    state,
    'SHIFT_CLOSED',
    'shiftClosing',
    closing.id,
    `Fechamento de Turno: Dinheiro Contado=${payload.countedPhysicalCashCents} (Dif=${cashDifferenceCents}) | Pix Recebido=${payload.confirmedPixReceivedCents} | Pix Pendente=${snap.pendingPixCents} | Cartão a Liquidar=${snap.pendingCardSettlementCents}`,
    now
  );

  return { state, closing };
}

/**
 * 8. CRUD OPERATIONS FOR PRODUCTS, SUPPLIERS, CUSTOMERS, GOALS, PAYABLES
 */
export function executeSaveProduct(
  currentState: BusinessDatabaseState,
  productInput: Omit<Product, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = new Date().toISOString();

  const normalizedSku = productInput.sku.trim().toUpperCase();
  if (!normalizedSku) throw new Error('O SKU do produto é obrigatório.');

  const duplicateSku = state.products.find(
    (p) => p.sku.toUpperCase() === normalizedSku && p.id !== productInput.id
  );
  if (duplicateSku) {
    throw new Error(`Já existe um produto cadastrado com o SKU ${normalizedSku}.`);
  }

  if (productInput.id) {
    const idx = state.products.findIndex((p) => p.id === productInput.id);
    if (idx === -1) throw new Error('Produto não encontrado.');
    state.products[idx] = {
      ...state.products[idx],
      ...productInput,
      id: productInput.id,
      sku: normalizedSku,
      updatedAt: now,
    };
  } else {
    const newProd: Product = {
      ...productInput,
      id: generateId('prod'),
      businessId: state.profile.businessId,
      sku: normalizedSku,
      createdAt: now,
      updatedAt: now,
    };
    state.products.push(newProd);
  }

  return state;
}

export function executeSaveSupplier(
  currentState: BusinessDatabaseState,
  supplierInput: Omit<Supplier, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = new Date().toISOString();

  if (!supplierInput.name.trim()) {
    throw new Error('O nome do fornecedor é obrigatório.');
  }

  if (supplierInput.id) {
    const idx = state.suppliers.findIndex((s) => s.id === supplierInput.id);
    if (idx === -1) throw new Error('Fornecedor não encontrado.');
    state.suppliers[idx] = {
      ...state.suppliers[idx],
      ...supplierInput,
      id: supplierInput.id,
      updatedAt: now,
    };
  } else {
    state.suppliers.push({
      ...supplierInput,
      id: generateId('sup'),
      businessId: state.profile.businessId,
      createdAt: now,
      updatedAt: now,
    });
  }

  return state;
}

export function executeSaveCustomer(
  currentState: BusinessDatabaseState,
  customerInput: {
    id?: string;
    name: string;
    phone?: string;
    email?: string;
    notes?: string;
    marketingConsent: boolean;
  }
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = new Date().toISOString();

  if (!customerInput.name.trim()) {
    throw new Error('O nome do cliente é obrigatório.');
  }

  if (customerInput.id) {
    const idx = state.customers.findIndex((c) => c.id === customerInput.id);
    if (idx === -1) throw new Error('Cliente não encontrado.');
    state.customers[idx] = {
      ...state.customers[idx],
      name: customerInput.name.trim(),
      phone: customerInput.phone?.trim(),
      email: customerInput.email?.trim(),
      notes: customerInput.notes?.trim(),
      marketingConsent: customerInput.marketingConsent,
      updatedAt: now,
    };
  } else {
    const newCustomer: Customer = {
      id: generateId('cust'),
      businessId: state.profile.businessId,
      name: customerInput.name.trim(),
      phone: customerInput.phone?.trim(),
      email: customerInput.email?.trim(),
      notes: customerInput.notes?.trim(),
      marketingConsent: customerInput.marketingConsent,
      totalPurchasesCount: 0,
      totalUnitsBought: 0,
      totalSpentCents: 0,
      averageTicketCents: 0,
      loyaltyPointsPaidUnits: 0,
      loyaltyRewardsRedeemed: 0,
      createdAt: now,
      updatedAt: now,
    };
    state.customers.push(newCustomer);
  }

  return state;
}

export function executeAnonymizeCustomer(
  currentState: BusinessDatabaseState,
  customerId: string
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = new Date().toISOString();
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) throw new Error('Cliente não encontrado.');

  customer.name = `Cliente Anonimizado (${customer.id.slice(-4)})`;
  customer.phone = undefined;
  customer.email = undefined;
  customer.notes = 'Dados pessoais anonimizados conforme solicitação LGPD, preservando histórico financeiro.';
  customer.marketingConsent = false;
  customer.updatedAt = now;

  appendAuditLog(
    state,
    'CUSTOMER_ANONYMIZED',
    'customer',
    customerId,
    'Dados pessoais do cliente anonimizados com preservação dos registros contábeis.',
    now
  );

  return state;
}

export function executeSaveGoal(
  currentState: BusinessDatabaseState,
  goalInput: Omit<CommercialGoal, 'id' | 'businessId' | 'createdAt'> & { id?: string }
): BusinessDatabaseState {
  const state = cloneState(currentState);
  const now = new Date().toISOString();

  if (goalInput.id) {
    const idx = state.goals.findIndex((g) => g.id === goalInput.id);
    if (idx !== -1) {
      state.goals[idx] = {
        ...state.goals[idx],
        ...goalInput,
        id: goalInput.id,
      };
    }
  } else {
    state.goals.push({
      ...goalInput,
      id: generateId('goal'),
      businessId: state.profile.businessId,
      createdAt: now,
    });
  }
  return state;
}

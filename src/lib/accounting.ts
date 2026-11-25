/**
 * POPCONTROL — CORE BUSINESS RULES, ACCOUNTING & FEFO ENGINE
 * Pure, deterministic functions implementing all accounting, inventory (FEFO),
 * pricing, DRE, reinvestment, and replenishment rules.
 *
 * Tested against Section 23 Acceptance Tests.
 */

import {
  BusinessDatabaseState,
  FinancialCategory,
  InventoryLot,
  Product,
  Supplier,
  BusinessSettings,
  FinancialAccount,
  CommercialGoal,
  SaleLotConsumption,
  Customer,
  CustomerSegment,
} from '../types/domain';
import { safeDivide } from './currency';

export const SYSTEM_CATEGORIES: FinancialCategory[] = [
  { id: 'cat_sales', name: 'Receita de vendas', type: 'inflow', isOperationalExpense: false, isSystem: true },
  { id: 'cat_purchases', name: 'Compra de mercadorias', type: 'outflow', isOperationalExpense: false, isSystem: true },
  { id: 'cat_transport', name: 'Transporte', type: 'outflow', isOperationalExpense: true, isSystem: true },
  { id: 'cat_marketing', name: 'Marketing', type: 'outflow', isOperationalExpense: true, isSystem: true },
  { id: 'cat_packaging', name: 'Embalagens', type: 'outflow', isOperationalExpense: true, isSystem: true },
  { id: 'cat_bank_fees', name: 'Taxas bancárias', type: 'outflow', isOperationalExpense: true, isSystem: true },
  { id: 'cat_taxes', name: 'Impostos', type: 'outflow', isOperationalExpense: true, isSystem: true },
  { id: 'cat_admin', name: 'Despesas administrativas', type: 'outflow', isOperationalExpense: true, isSystem: true },
  { id: 'cat_contribution', name: 'Aportes', type: 'equity_in', isOperationalExpense: false, isSystem: true },
  { id: 'cat_withdrawal', name: 'Retiradas', type: 'equity_out', isOperationalExpense: false, isSystem: true },
  { id: 'cat_other_in', name: 'Outras receitas', type: 'inflow', isOperationalExpense: false, isSystem: true },
  { id: 'cat_other_out', name: 'Outras despesas', type: 'outflow', isOperationalExpense: true, isSystem: true },
];

/**
 * Generates initial seed catalog for Dr. Pipoca as requested in Section 1 & Section 8.
 * Notice: Does NOT automatically register a purchase or contribution that hasn't occurred yet!
 * Only sets up the supplier, accounts, default goals, primary product (DP001), and inactive future flavors.
 */
export function createInitialBusinessState(
  uid: string,
  email: string,
  displayName: string,
  businessId: string,
  businessName = 'PopControl — Revenda Dr. Pipoca'
): BusinessDatabaseState {
  const now = new Date().toISOString();
  const todayStr = now.slice(0, 10);

  const supplierId = 'sup_dr_pipoca';
  const supplier: Supplier = {
    id: supplierId,
    businessId,
    name: 'Dr. Pipoca',
    commercialTerms: 'Caixas fechadas (20 un Gourmet / 10 un Gringa)',
    minimumOrderBoxes: 1,
    preferredPaymentMethod: 'Pix',
    notes: 'Fornecedor principal de pipocas gourmet. Informações de contato editáveis.',
    negotiatedPrices: {
      prod_dp001: 589,
      prod_dp002: 589,
      prod_dp003: 589,
      prod_dp004: 589,
      prod_dp005: 589,
      prod_dp006: 896,
    },
    createdAt: now,
    updatedAt: now,
  };

  const products: Product[] = [
    {
      id: 'prod_dp001',
      businessId,
      name: 'Pipoca Gourmet Leite em Pó Trufada 60g',
      sku: 'DP001',
      barcode: '7898900000011',
      brand: 'Dr. Pipoca',
      category: 'Pipoca Gourmet',
      flavor: 'Leite em Pó Trufada',
      netWeightGrams: 60,
      unitOfMeasure: 'un',
      primarySupplierId: supplierId,
      acquisitionCostCents: 589, // R$ 5,89
      salePriceCents: 1200, // R$ 12,00
      unitsPerBox: 20, // Caixa com 20 un = R$ 117,80
      minStockUnits: 5,
      description: 'Pipoca Gourmet sabor Leite em Pó Trufada 60g — Produto carro-chefe.',
      active: true,
      isFeaturedFastSale: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod_dp002',
      businessId,
      name: 'Pipoca Gourmet Chocolate Belga 60g',
      sku: 'DP002',
      barcode: '7898900000028',
      brand: 'Dr. Pipoca',
      category: 'Pipoca Gourmet',
      flavor: 'Chocolate Belga',
      netWeightGrams: 60,
      unitOfMeasure: 'un',
      primarySupplierId: supplierId,
      acquisitionCostCents: 589,
      salePriceCents: 1200,
      unitsPerBox: 20,
      minStockUnits: 5,
      description: 'Sabor futuro cadastrado como inativo sem estoque inicial.',
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod_dp003',
      businessId,
      name: 'Pipoca Gourmet Paçoca 60g',
      sku: 'DP003',
      barcode: '7898900000035',
      brand: 'Dr. Pipoca',
      category: 'Pipoca Gourmet',
      flavor: 'Paçoca',
      netWeightGrams: 60,
      unitOfMeasure: 'un',
      primarySupplierId: supplierId,
      acquisitionCostCents: 589,
      salePriceCents: 1200,
      unitsPerBox: 20,
      minStockUnits: 5,
      description: 'Sabor futuro cadastrado como inativo sem estoque inicial.',
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod_dp004',
      businessId,
      name: 'Pipoca Gourmet Coco em Lascas 60g',
      sku: 'DP004',
      barcode: '7898900000042',
      brand: 'Dr. Pipoca',
      category: 'Pipoca Gourmet',
      flavor: 'Coco em Lascas',
      netWeightGrams: 60,
      unitOfMeasure: 'un',
      primarySupplierId: supplierId,
      acquisitionCostCents: 589,
      salePriceCents: 1200,
      unitsPerBox: 20,
      minStockUnits: 5,
      description: 'Sabor futuro cadastrado como inativo sem estoque inicial.',
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod_dp005',
      businessId,
      name: 'Pipoca Gourmet Caramelo com Flor de Sal 60g',
      sku: 'DP005',
      barcode: '7898900000059',
      brand: 'Dr. Pipoca',
      category: 'Pipoca Gourmet',
      flavor: 'Caramelo com Flor de Sal',
      netWeightGrams: 60,
      unitOfMeasure: 'un',
      primarySupplierId: supplierId,
      acquisitionCostCents: 589,
      salePriceCents: 1200,
      unitsPerBox: 20,
      minStockUnits: 5,
      description: 'Sabor futuro cadastrado como inativo sem estoque inicial.',
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod_dp006',
      businessId,
      name: 'Pipoca Gringa Doce e Salgada 100g',
      sku: 'DP006',
      barcode: '7898900000066',
      brand: 'Dr. Pipoca',
      category: 'Pipoca Gringa',
      flavor: 'Doce e Salgada',
      netWeightGrams: 100,
      unitOfMeasure: 'un',
      primarySupplierId: supplierId,
      acquisitionCostCents: 896, // R$ 8,96
      salePriceCents: 1800, // Sugestão editável R$ 18,00
      unitsPerBox: 10, // Caixa com 10 un = R$ 89,60
      minStockUnits: 5,
      description: 'Linha Gringa 100g cadastrada como inativa para expansão futura.',
      active: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const accounts: FinancialAccount[] = [
    {
      id: 'acc_pix',
      businessId,
      name: 'Carteira Pix Principal',
      type: 'pix',
      initialBalanceCents: 0,
      active: true,
      createdAt: now,
    },
    {
      id: 'acc_cash',
      businessId,
      name: 'Caixa Físico (Dinheiro)',
      type: 'cash',
      initialBalanceCents: 0,
      active: true,
      createdAt: now,
    },
    {
      id: 'acc_bank',
      businessId,
      name: 'Conta Bancária PJ',
      type: 'bank',
      initialBalanceCents: 0,
      active: true,
      createdAt: now,
    },
  ];

  const goals: CommercialGoal[] = [
    {
      id: 'goal_daily_units',
      businessId,
      title: 'Meta Diária de Unidades (Hipótese Inicial)',
      period: 'daily',
      metricType: 'units_sold',
      targetValue: 4,
      startDate: todayStr,
      endDate: '2027-12-31',
      active: true,
      notes: 'Hipótese inicial sugerida: 4 unidades por dia',
      createdAt: now,
    },
    {
      id: 'goal_weekly_units',
      businessId,
      title: 'Meta Semanal de Unidades (1 Caixa)',
      period: 'weekly',
      metricType: 'units_sold',
      targetValue: 20,
      startDate: todayStr,
      endDate: '2027-12-31',
      active: true,
      notes: 'Hipótese inicial sugerida: 20 unidades por semana',
      createdAt: now,
    },
    {
      id: 'goal_weekly_rev',
      businessId,
      title: 'Faturamento Semanal (1 Caixa Vendida)',
      period: 'weekly',
      metricType: 'gross_revenue',
      targetValue: 24000, // R$ 240,00
      startDate: todayStr,
      endDate: '2027-12-31',
      active: true,
      notes: 'Hipótese inicial sugerida: R$ 240,00 por semana',
      createdAt: now,
    },
    {
      id: 'goal_weekly_profit',
      businessId,
      title: 'Lucro Bruto Semanal',
      period: 'weekly',
      metricType: 'gross_profit',
      targetValue: 12220, // R$ 122,20
      startDate: todayStr,
      endDate: '2027-12-31',
      active: true,
      notes: 'Hipótese inicial sugerida: R$ 122,20 de lucro bruto semanal',
      createdAt: now,
    },
  ];

  const settings: BusinessSettings = {
    id: 'default',
    businessId,
    businessName,
    currency: 'BRL',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    theme: 'light',
    defaultMinStock: 5,
    minCashReserveCents: 1220, // R$ 12,20
    workingDaysPerMonth: 22,
    paymentMethods: ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Outros'],
    financialCategories: SYSTEM_CATEGORIES,
    reinvestmentStrategy: {
      reinvestPercent: 70,
      personalWithdrawalPercent: 20,
      reservePercent: 10,
    },
    loyaltyRules: {
      enabled: true,
      paidUnitsRequired: 10,
      freeUnitsReward: 1,
    },
    segmentationRules: {
      recurringMinPurchases: 2,
      frequentMinPurchases: 5,
      vipMinSpentCents: 10000, // R$ 100,00
      inactiveDaysThreshold: 30,
    },
    alertPreferences: {
      expiryWarningDays: [7, 15, 30],
      lowMarginThresholdPercent: 30,
      payableDueWarningDays: 5,
    },
    permissionsConfig: {
      operatorMaxDiscountPercent: 10,
      adminPinCode: '1234',
      debitCardFeePercent: 1.99,
      creditCardFeePercent: 3.99,
      cardSettlementDays: 1,
    },
    onboardingCompleted: true,
    initialCapitalConfirmed: false,
    initialPurchaseConfirmed: false,
    updatedAt: now,
  };

  return {
    profile: {
      uid,
      email,
      displayName,
      businessId,
      role: 'admin',
      createdAt: now,
    },
    members: [
      {
        uid,
        email,
        displayName,
        role: 'admin',
        active: true,
        joinedAt: now,
      },
    ],
    settings,
    accounts,
    products,
    combos: [
      {
        id: 'combo_2un',
        businessId,
        name: 'Combo Duplo Gourmet (2 unidades)',
        productId: 'prod_dp001',
        quantity: 2,
        comboPriceCents: 2200, // R$ 22,00 (R$ 2,00 de desconto)
        active: true,
      },
    ],
    suppliers: [supplier],
    inventoryLots: [],
    stockMovements: [],
    purchases: [],
    sales: [],
    financialTransactions: [],
    payables: [],
    receivables: [],
    customers: [],
    goals,
    auditLogs: [],
    shiftClosings: [],
    idempotencyKeys: {},
  };
}

/**
 * Product Unit & Box Metrics Calculation (Section 8)
 */
export function calculateProductMetrics(product: {
  acquisitionCostCents: number;
  salePriceCents: number;
  unitsPerBox: number;
}) {
  const unitGrossProfitCents = product.salePriceCents - product.acquisitionCostCents;
  const grossMarginPercent =
    product.salePriceCents > 0
      ? (unitGrossProfitCents / product.salePriceCents) * 100
      : 0;
  const markupPercent =
    product.acquisitionCostCents > 0
      ? (unitGrossProfitCents / product.acquisitionCostCents) * 100
      : 0;
  const boxCostCents = product.acquisitionCostCents * product.unitsPerBox;
  const boxPotentialRevenueCents = product.salePriceCents * product.unitsPerBox;
  const boxPotentialProfitCents = unitGrossProfitCents * product.unitsPerBox;

  return {
    unitGrossProfitCents,
    grossMarginPercent,
    markupPercent,
    boxCostCents,
    boxPotentialRevenueCents,
    boxPotentialProfitCents,
  };
}

/**
 * Pricing Simulator Formula (Section 17)
 * Preço = custos variáveis unitários em reais ÷ (1 − taxas percentuais sobre venda − margem desejada)
 */
export interface PricingSimulatorInput {
  unitCostCents: number;
  unitFreightCents: number;
  otherAcquisitionCostCents: number;
  variableExpenseCents: number;
  paymentFeePercent: number; // e.g., 0 or 2.5
  taxPercent: number; // e.g., 0 or 6
  desiredMarginPercent: number; // e.g., 45
  testedSalePriceCents: number;
  monthlyFixedGoalCents: number; // e.g., 100000 (R$ 1.000,00)
}

export function calculatePricingSimulation(input: PricingSimulatorInput) {
  const totalUnitVariableCostCents =
    input.unitCostCents +
    input.unitFreightCents +
    input.otherAcquisitionCostCents +
    input.variableExpenseCents;

  const totalSalesPercentages =
    (input.paymentFeePercent + input.taxPercent) / 100;
  const desiredMarginDecimal = input.desiredMarginPercent / 100;
  const denominator = 1 - totalSalesPercentages - desiredMarginDecimal;

  const isValidDenominator = denominator > 0;
  const suggestedSalePriceCents = isValidDenominator
    ? Math.round(totalUnitVariableCostCents / denominator)
    : 0;

  // Evaluate at testedSalePriceCents
  const salePrice = input.testedSalePriceCents;
  const taxesAndFeesCents = Math.round(salePrice * totalSalesPercentages);
  const acquisitionTotalCents =
    input.unitCostCents + input.unitFreightCents + input.otherAcquisitionCostCents;
  const estimatedGrossProfitCents = salePrice - acquisitionTotalCents;
  const contributionMarginCents =
    salePrice - totalUnitVariableCostCents - taxesAndFeesCents;

  const grossMarginPercent =
    salePrice > 0 ? (estimatedGrossProfitCents / salePrice) * 100 : 0;
  const contributionMarginPercent =
    salePrice > 0 ? (contributionMarginCents / salePrice) * 100 : 0;
  const markupPercent =
    acquisitionTotalCents > 0
      ? ((salePrice - acquisitionTotalCents) / acquisitionTotalCents) * 100
      : 0;

  const breakEvenUnits =
    contributionMarginCents > 0 && input.monthlyFixedGoalCents > 0
      ? Math.ceil(input.monthlyFixedGoalCents / contributionMarginCents)
      : 0;
  const requiredRevenueForGoalCents = breakEvenUnits * salePrice;

  return {
    totalUnitVariableCostCents,
    acquisitionTotalCents,
    denominator,
    isValidDenominator,
    suggestedSalePriceCents,
    estimatedGrossProfitCents,
    contributionMarginCents,
    grossMarginPercent,
    contributionMarginPercent,
    markupPercent,
    breakEvenUnits,
    requiredRevenueForGoalCents,
  };
}

/**
 * FEFO (First Expired, First Out) Lot Status & Allocation Engine (Section 9)
 */
export function isLotExpired(lot: InventoryLot, referenceDateISO: string): boolean {
  const refDay = referenceDateISO.slice(0, 10);
  const expDay = lot.expirationDate.slice(0, 10);
  return expDay < refDay;
}

export function getProductInventorySummary(
  productId: string,
  lots: InventoryLot[],
  referenceDateISO: string
) {
  const productLots = lots.filter((l) => l.productId === productId && l.quantityRemaining > 0);
  let totalPhysicalUnits = 0;
  let sellableUnits = 0;
  let expiredUnits = 0;
  let totalStockValueCents = 0;
  let sellableStockValueCents = 0;

  for (const lot of productLots) {
    totalPhysicalUnits += lot.quantityRemaining;
    const lotValue = lot.quantityRemaining * lot.unitAcquisitionCostCents;
    totalStockValueCents += lotValue;

    if (isLotExpired(lot, referenceDateISO)) {
      expiredUnits += lot.quantityRemaining;
    } else {
      sellableUnits += lot.quantityRemaining;
      sellableStockValueCents += lotValue;
    }
  }

  return {
    totalPhysicalUnits,
    sellableUnits,
    expiredUnits,
    totalStockValueCents,
    sellableStockValueCents,
  };
}

/**
 * Allocates required quantity across valid (non-expired) lots using FEFO (First Expired, First Out).
 * Throws an error if sellable stock is insufficient.
 */
export function allocateLotsFEFO(
  productId: string,
  requiredQuantity: number,
  lots: InventoryLot[],
  referenceDateISO: string
): {
  consumedLots: SaleLotConsumption[];
  totalHistoricalCostCents: number;
} {
  if (requiredQuantity <= 0) {
    throw new Error('A quantidade solicitada deve ser maior que zero.');
  }

  const validLots = lots
    .filter(
      (l) =>
        l.productId === productId &&
        l.quantityRemaining > 0 &&
        !isLotExpired(l, referenceDateISO)
    )
    .sort((a, b) => {
      const expCompare = a.expirationDate.localeCompare(b.expirationDate);
      if (expCompare !== 0) return expCompare;
      return a.createdAt.localeCompare(b.createdAt);
    });

  const totalAvailable = validLots.reduce((acc, l) => acc + l.quantityRemaining, 0);
  if (totalAvailable < requiredQuantity) {
    const expiredLotsCount = lots
      .filter((l) => l.productId === productId && l.quantityRemaining > 0 && isLotExpired(l, referenceDateISO))
      .reduce((acc, l) => acc + l.quantityRemaining, 0);

    if (expiredLotsCount > 0 && totalAvailable + expiredLotsCount >= requiredQuantity) {
      throw new Error(
        `Estoque vendável insuficiente (${totalAvailable} un disponíveis). Há ${expiredLotsCount} un em lote(s) vencido(s) bloqueadas pelo FEFO.`
      );
    }
    throw new Error(
      `Estoque insuficiente para a venda. Disponível: ${totalAvailable} un | Solicitado: ${requiredQuantity} un.`
    );
  }

  let remainingToAllocate = requiredQuantity;
  const consumedLots: SaleLotConsumption[] = [];
  let totalHistoricalCostCents = 0;

  for (const lot of validLots) {
    if (remainingToAllocate <= 0) break;
    const take = Math.min(lot.quantityRemaining, remainingToAllocate);
    const cost = take * lot.unitAcquisitionCostCents;
    consumedLots.push({
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      quantity: take,
      unitCostCents: lot.unitAcquisitionCostCents,
      totalCostCents: cost,
    });
    totalHistoricalCostCents += cost;
    remainingToAllocate -= take;
  }

  return {
    consumedLots,
    totalHistoricalCostCents,
  };
}

/**
 * Comprehensive Financial & Managerial Accounting Indicators (Sections 5, 11, 12, 23)
 * Strictly follows all accounting rules:
 * - Owner contributions (Aportes) are NOT revenue.
 * - Owner withdrawals (Retiradas) are NOT operational expenses.
 * - Purchases of inventory reduce cash when paid, but are NOT immediately CMV.
 * - Inventory on hand is an asset (valued at historical lot cost).
 * - CMV is recognized upon sale at the historical cost of consumed lots.
 * - Inventory losses reduce the inventory asset and reduce Managerial Net Profit.
 * - Account transfers do not count as revenue or expense.
 * - Receivables not yet collected are assets, NOT available cash.
 */
export interface DateRangeFilter {
  startDate?: string; // ISO YYYY-MM-DD
  endDate?: string; // ISO YYYY-MM-DD
}

function isWithinDateRange(isoTimestamp: string, filter?: DateRangeFilter): boolean {
  if (!filter || (!filter.startDate && !filter.endDate)) return true;
  const day = isoTimestamp.slice(0, 10);
  if (filter.startDate && day < filter.startDate) return false;
  if (filter.endDate && day > filter.endDate) return false;
  return true;
}

export function calculateFinancialSnapshot(
  state: BusinessDatabaseState,
  periodFilter?: DateRangeFilter,
  referenceDateISO: string = new Date().toISOString()
) {
  // 1. CURRENT POSITION INDICATORS (Always all-time up to now)
  const initialAccountsBalanceCents = state.accounts
    .filter((a) => a.active)
    .reduce((acc, a) => acc + a.initialBalanceCents, 0);

  let totalRealizedInflowsCents = 0;
  let totalRealizedOutflowsCents = 0;
  let totalOwnerContributionsCents = 0;
  let totalOwnerWithdrawalsCents = 0;

  // Per-account balances
  const accountBalances: Record<string, number> = {};
  for (const acc of state.accounts) {
    accountBalances[acc.id] = acc.initialBalanceCents;
  }

  for (const tx of state.financialTransactions) {
    if (tx.direction === 'in') {
      totalRealizedInflowsCents += tx.amountCents;
      accountBalances[tx.accountId] = (accountBalances[tx.accountId] ?? 0) + tx.amountCents;
      if (tx.type === 'owner_contribution') {
        totalOwnerContributionsCents += tx.amountCents;
      }
    } else if (tx.direction === 'out') {
      totalRealizedOutflowsCents += tx.amountCents;
      accountBalances[tx.accountId] = (accountBalances[tx.accountId] ?? 0) - tx.amountCents;
      if (tx.type === 'owner_withdrawal') {
        totalOwnerWithdrawalsCents += tx.amountCents;
      }
    } else if (tx.direction === 'transfer' && tx.targetAccountId) {
      accountBalances[tx.accountId] = (accountBalances[tx.accountId] ?? 0) - tx.amountCents;
      accountBalances[tx.targetAccountId] =
        (accountBalances[tx.targetAccountId] ?? 0) + tx.amountCents;
    }
  }

  // Saldo de caixa = saldo inicial + entradas realizadas − saídas realizadas
  const cashBalanceCents =
    initialAccountsBalanceCents + totalRealizedInflowsCents - totalRealizedOutflowsCents;

  // Current Inventory Position
  let totalStockUnits = 0;
  let sellableStockUnits = 0;
  let expiredStockUnits = 0;
  let totalInventoryAssetCents = 0;
  let sellableInventoryAssetCents = 0;

  for (const lot of state.inventoryLots) {
    if (lot.quantityRemaining > 0) {
      totalStockUnits += lot.quantityRemaining;
      const lotVal = lot.quantityRemaining * lot.unitAcquisitionCostCents;
      totalInventoryAssetCents += lotVal;
      if (isLotExpired(lot, referenceDateISO)) {
        expiredStockUnits += lot.quantityRemaining;
      } else {
        sellableStockUnits += lot.quantityRemaining;
        sellableInventoryAssetCents += lotVal;
      }
    }
  }

  // Pending Receivables & Payables (Separated by kind: Pix Pending vs Card to Settle vs Other)
  const activeReceivables = state.receivables.filter(
    (r) => r.status === 'pending' || r.status === 'overdue'
  );
  const pendingReceivablesCents = activeReceivables.reduce(
    (acc, r) => acc + r.remainingAmountCents,
    0
  );
  const pendingPixCents = activeReceivables
    .filter((r) => r.receivableKind === 'pix_pending')
    .reduce((acc, r) => acc + r.remainingAmountCents, 0);
  const pendingCardSettlementCents = activeReceivables
    .filter((r) => r.receivableKind === 'card_settlement')
    .reduce((acc, r) => acc + r.remainingAmountCents, 0);

  const pendingPayablesCents = state.payables
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .reduce((acc, p) => acc + p.remainingAmountCents, 0);

  // Patrimônio líquido gerencial = ativos registrados (caixa + estoque a custo + contas a receber) − obrigações registradas (contas a pagar)
  // Note: Expired stock not yet written off via movement is still in lots unless written off; once written off via movement, quantityRemaining becomes 0.
  const totalAssetsCents =
    cashBalanceCents + totalInventoryAssetCents + pendingReceivablesCents;
  const totalLiabilitiesCents = pendingPayablesCents;
  const managerialNetWorthCents = totalAssetsCents - totalLiabilitiesCents;

  // 2. PERIOD PERFORMANCE INDICATORS (Filtered by periodFilter when provided)
  const completedSalesInPeriod = state.sales.filter(
    (s) => s.status === 'completed' && isWithinDateRange(s.createdAt, periodFilter)
  );

  let grossRevenueCents = 0; // Receita bruta (subtotal antes de descontos)
  let totalDiscountsCents = 0;
  let netSalesRevenueCents = 0; // Vendas brutas - descontos - devoluções - impostos sobre vendas
  let cmvCents = 0;
  let promotionalLoyaltyCostCents = 0;
  let salesCount = 0;
  let unitsSold = 0;

  for (const sale of completedSalesInPeriod) {
    salesCount += 1;
    unitsSold += sale.totalUnits;
    grossRevenueCents += sale.subtotalCents;
    totalDiscountsCents += sale.totalDiscountCents;
    netSalesRevenueCents += sale.totalCents;
    cmvCents += sale.totalCmvCents;
    promotionalLoyaltyCostCents += sale.promotionalLoyaltyCostCents || 0;
  }

  // Taxes on sales if recorded in period
  const salesTaxesInPeriodCents = state.financialTransactions
    .filter(
      (tx) =>
        tx.direction === 'out' &&
        tx.categoryId === 'cat_taxes' &&
        isWithinDateRange(tx.occurredAt, periodFilter)
    )
    .reduce((acc, tx) => acc + tx.amountCents, 0);

  const netRevenueAfterTaxesCents = netSalesRevenueCents - salesTaxesInPeriodCents;

  // Lucro bruto = receita líquida de vendas − CMV
  const grossProfitCents = netRevenueAfterTaxesCents - cmvCents;

  // Operational expenses in period (excluding inventory purchases, owner withdrawals, sale refunds, and sales taxes already deducted above)
  const operationalExpensesCents =
    state.financialTransactions
      .filter((tx) => {
        if (tx.direction !== 'out') return false;
        if (!isWithinDateRange(tx.occurredAt, periodFilter)) return false;
        if (
          tx.type === 'supplier_payment' ||
          tx.type === 'owner_withdrawal' ||
          tx.type === 'sale_refund' ||
          tx.type === 'account_transfer'
        ) {
          return false;
        }
        if (tx.categoryId === 'cat_taxes' || tx.categoryId === 'cat_purchases' || tx.categoryId === 'cat_withdrawal') {
          return false;
        }
        return true;
      })
      .reduce((acc, tx) => acc + tx.amountCents, 0) + promotionalLoyaltyCostCents;

  // Inventory losses in period (loss, damage, expiration, negative_adjustment)
  const inventoryLossesCents = state.stockMovements
    .filter(
      (m) =>
        (m.type === 'loss' ||
          m.type === 'damage' ||
          m.type === 'expiration' ||
          m.type === 'negative_adjustment') &&
        isWithinDateRange(m.createdAt, periodFilter)
    )
    .reduce((acc, m) => acc + m.totalCostCents, 0);

  // Positive inventory adjustments in period
  const inventoryGainsCents = state.stockMovements
    .filter(
      (m) => m.type === 'positive_adjustment' && isWithinDateRange(m.createdAt, periodFilter)
    )
    .reduce((acc, m) => acc + m.totalCostCents, 0);

  // Other operational income in period
  const otherOperationalIncomeCents =
    state.financialTransactions
      .filter(
        (tx) =>
          tx.direction === 'in' &&
          tx.type === 'other_income' &&
          isWithinDateRange(tx.occurredAt, periodFilter)
      )
      .reduce((acc, tx) => acc + tx.amountCents, 0) + inventoryGainsCents;

  // Lucro líquido gerencial = lucro bruto − despesas operacionais − perdas de estoque não incluídas no CMV + outras receitas operacionais
  const netProfitCents =
    grossProfitCents -
    operationalExpensesCents -
    inventoryLossesCents +
    otherOperationalIncomeCents;

  // Margem bruta = lucro bruto ÷ receita líquida de vendas × 100
  const grossMarginPercent =
    netRevenueAfterTaxesCents > 0
      ? safeDivide(grossProfitCents, netRevenueAfterTaxesCents) * 100
      : 0;

  // Margem líquida = lucro líquido gerencial ÷ receita líquida de vendas × 100
  const netMarginPercent =
    netRevenueAfterTaxesCents > 0
      ? safeDivide(netProfitCents, netRevenueAfterTaxesCents) * 100
      : 0;

  const averageTicketCents =
    salesCount > 0 ? Math.round(netSalesRevenueCents / salesCount) : 0;

  // Lost and expired units from stock movements
  const lostUnitsCount = state.stockMovements
    .filter(
      (m) =>
        (m.type === 'loss' || m.type === 'damage' || m.type === 'negative_adjustment') &&
        isWithinDateRange(m.createdAt, periodFilter)
    )
    .reduce((acc, m) => acc + m.quantity, 0);

  const expiredUnitsMovedCount = state.stockMovements
    .filter((m) => m.type === 'expiration' && isWithinDateRange(m.createdAt, periodFilter))
    .reduce((acc, m) => acc + m.quantity, 0);

  return {
    // Current Position
    cashBalanceCents,
    accountBalances,
    totalStockUnits,
    sellableStockUnits,
    expiredStockUnits,
    totalInventoryAssetCents,
    sellableInventoryAssetCents,
    pendingReceivablesCents,
    pendingPixCents,
    pendingCardSettlementCents,
    pendingPayablesCents,
    totalOwnerContributionsCents,
    totalOwnerWithdrawalsCents,
    totalAssetsCents,
    totalLiabilitiesCents,
    managerialNetWorthCents,

    // Period Performance & DRE
    grossRevenueCents,
    totalDiscountsCents,
    salesTaxesInPeriodCents,
    netSalesRevenueCents: netRevenueAfterTaxesCents,
    cmvCents,
    grossProfitCents,
    operationalExpensesCents,
    inventoryLossesCents,
    otherOperationalIncomeCents,
    netProfitCents,
    grossMarginPercent,
    netMarginPercent,
    averageTicketCents,
    salesCount,
    unitsSold,
    lostUnitsCount,
    expiredUnitsMovedCount,
  };
}

/**
 * Intelligent Inventory Replenishment Engine (Section 10)
 * Considers cash reserve, observed demand, shelf life, and box constraints.
 */
export function calculateSmartReplenishment(
  product: Product,
  state: BusinessDatabaseState,
  referenceDateISO: string = new Date().toISOString()
) {
  const snapshot = calculateFinancialSnapshot(state, undefined, referenceDateISO);
  const invSummary = getProductInventorySummary(
    product.id,
    state.inventoryLots,
    referenceDateISO
  );

  // Calculate average daily sales velocity over the last 30 days (or since first sale)
  const thirtyDaysAgo = new Date(
    new Date(referenceDateISO).getTime() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const recentSales = state.sales.filter(
    (s) => s.status === 'completed' && s.createdAt >= thirtyDaysAgo
  );

  let recentProductUnitsSold = 0;
  for (const sale of recentSales) {
    for (const item of sale.items) {
      if (item.productId === product.id) {
        recentProductUnitsSold += item.quantity;
      }
    }
  }

  // Determine active operating days in window (minimum 1 day, or fallback to daily goal if beginning operation)
  const firstSaleDate = recentSales.length > 0
    ? recentSales.reduce((min, s) => (s.createdAt < min ? s.createdAt : min), recentSales[0].createdAt)
    : referenceDateISO;

  const daysElapsed = Math.max(
    1,
    Math.ceil(
      (new Date(referenceDateISO).getTime() - new Date(firstSaleDate).getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );

  const observedDailyVelocity =
    recentProductUnitsSold > 0
      ? recentProductUnitsSold / Math.max(1, Math.min(30, daysElapsed))
      : 0;

  // Use observed velocity or baseline hypothesis (4 un/day) for coverage estimate
  const effectiveDailyDemand = observedDailyVelocity > 0 ? observedDailyVelocity : 4;
  const currentCoverageDays =
    invSummary.sellableUnits > 0
      ? Math.floor(invSummary.sellableUnits / effectiveDailyDemand)
      : 0;

  const boxCostCents = product.acquisitionCostCents * product.unitsPerBox;
  const minReserveCents = state.settings.minCashReserveCents;
  const availableCashForPurchaseCents = Math.max(
    0,
    snapshot.cashBalanceCents - snapshot.pendingPayablesCents
  );
  const cashAboveReserveCents = Math.max(
    0,
    availableCashForPurchaseCents - minReserveCents
  );

  // Max boxes affordable total vs respecting reserve
  const maxBoxesWithTotalCash =
    boxCostCents > 0 ? Math.floor(availableCashForPurchaseCents / boxCostCents) : 0;
  const maxBoxesRespectingReserve =
    boxCostCents > 0 ? Math.floor(cashAboveReserveCents / boxCostCents) : 0;

  // Target coverage: 15 days of demand (to respect shelf life and not overstock just because cash exists)
  const targetUnitsFor15Days = Math.max(
    product.unitsPerBox,
    Math.ceil(effectiveDailyDemand * 15)
  );
  const deficitUnits = Math.max(0, targetUnitsFor15Days - invSummary.sellableUnits);
  const demandRecommendedBoxes =
    invSummary.sellableUnits <= product.minStockUnits
      ? Math.max(1, Math.ceil(deficitUnits / product.unitsPerBox))
      : Math.floor(deficitUnits / product.unitsPerBox);

  // Cap recommendation by demand AND affordability
  const recommendedBoxes = Math.min(
    demandRecommendedBoxes,
    Math.max(maxBoxesRespectingReserve, maxBoxesWithTotalCash > 0 && invSummary.sellableUnits <= product.minStockUnits ? 1 : 0)
  );

  const recommendedUnits = recommendedBoxes * product.unitsPerBox;
  const replenishmentCostCents = recommendedBoxes * boxCostCents;
  const projectedCashAfterPurchaseCents =
    snapshot.cashBalanceCents - replenishmentCostCents;

  return {
    sellableUnits: invSummary.sellableUnits,
    observedDailyVelocity,
    effectiveDailyDemand,
    currentCoverageDays,
    boxCostCents,
    minReserveCents,
    availableCashForPurchaseCents,
    maxBoxesWithTotalCash,
    maxBoxesRespectingReserve,
    demandRecommendedBoxes,
    recommendedBoxes,
    recommendedUnits,
    replenishmentCostCents,
    projectedCashAfterPurchaseCents,
    canAffordAtLeastOneBox: snapshot.cashBalanceCents >= boxCostCents,
  };
}

/**
 * Reinvestment Growth Cycle Simulator (Section 12)
 * Respects closed boxes and carries remaining balance to the next cycle.
 */
export interface GrowthSimulationInput {
  initialAvailableCapitalCents: number;
  boxCostCents: number;
  unitsPerBox: number;
  unitSalePriceCents: number;
  dailyDemandUnits: number;
  workingDaysPerMonth: number;
  reinvestPercent: number; // e.g. 70 or 100
  expectedCycleExpensesCents: number;
  minCashReserveCents: number;
  cyclesCount: number;
}

export interface GrowthCycleResult {
  cycle: number;
  startingCashCents: number;
  boxesPurchased: number;
  unitsPurchased: number;
  purchaseCostCents: number;
  cashAfterPurchaseCents: number;
  expectedRevenueCents: number;
  cycleGrossProfitCents: number;
  cycleNetProfitCents: number;
  reinvestedProfitCents: number;
  withdrawnOrReservedCents: number;
  endingReinvestableCashCents: number;
  estimatedDaysToSellCycle: number;
}

export function simulateReinvestmentGrowth(
  input: GrowthSimulationInput
): GrowthCycleResult[] {
  const results: GrowthCycleResult[] = [];
  let currentAvailableCash = input.initialAvailableCapitalCents;

  for (let c = 1; c <= input.cyclesCount; c++) {
    const startingCashCents = currentAvailableCash;
    const spendable = Math.max(0, startingCashCents - input.minCashReserveCents);
    // Allow using total cash on cycle 1 if initial capital is close to 1 box (like R$ 130,00 for R$ 117,80 box leaving R$ 12,20 reserve)
    const boxesPurchased =
      input.boxCostCents > 0 ? Math.floor(spendable / input.boxCostCents) : 0;

    const unitsPurchased = boxesPurchased * input.unitsPerBox;
    const purchaseCostCents = boxesPurchased * input.boxCostCents;
    const cashAfterPurchaseCents = startingCashCents - purchaseCostCents;

    const expectedRevenueCents = unitsPurchased * input.unitSalePriceCents;
    const cycleGrossProfitCents = expectedRevenueCents - purchaseCostCents;
    const cycleNetProfitCents = Math.max(
      0,
      cycleGrossProfitCents - input.expectedCycleExpensesCents
    );

    const reinvestedProfitCents = Math.round(
      cycleNetProfitCents * (input.reinvestPercent / 100)
    );
    const withdrawnOrReservedCents = cycleNetProfitCents - reinvestedProfitCents;

    // Ending cash available for next cycle = cash left after purchase + cost recovered (CMV) + reinvested share of net profit
    const endingReinvestableCashCents =
      cashAfterPurchaseCents + purchaseCostCents + reinvestedProfitCents;

    const estimatedDaysToSellCycle =
      input.dailyDemandUnits > 0
        ? Math.ceil(unitsPurchased / input.dailyDemandUnits)
        : 0;

    results.push({
      cycle: c,
      startingCashCents,
      boxesPurchased,
      unitsPurchased,
      purchaseCostCents,
      cashAfterPurchaseCents,
      expectedRevenueCents,
      cycleGrossProfitCents,
      cycleNetProfitCents,
      reinvestedProfitCents,
      withdrawnOrReservedCents,
      endingReinvestableCashCents,
      estimatedDaysToSellCycle,
    });

    currentAvailableCash = endingReinvestableCashCents;
  }

  return results;
}

/**
 * Customer Segmentation Engine (Section 13)
 */
export function classifyCustomerSegment(
  customer: Customer,
  rules: BusinessSettings['segmentationRules'],
  referenceDateISO: string = new Date().toISOString()
): CustomerSegment {
  if (customer.lastPurchaseDate) {
    const daysSinceLast = Math.floor(
      (new Date(referenceDateISO).getTime() -
        new Date(customer.lastPurchaseDate).getTime()) /
        (24 * 60 * 60 * 1000)
    );
    if (daysSinceLast > rules.inactiveDaysThreshold) {
      return 'inactive';
    }
  }

  if (customer.totalSpentCents >= rules.vipMinSpentCents) {
    return 'vip';
  }
  if (customer.totalPurchasesCount >= rules.frequentMinPurchases) {
    return 'frequent';
  }
  if (customer.totalPurchasesCount >= rules.recurringMinPurchases) {
    return 'recurring';
  }
  return 'new';
}

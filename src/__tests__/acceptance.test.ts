/**
 * POPCONTROL — AUTOMATED ACCEPTANCE & SECURITY TEST SUITE (SECTIONS 19 & 23)
 * Validates every accounting rule, FEFO inventory behavior, concurrency/idempotency,
 * and the exact financial scenario from Section 23.
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialBusinessState,
  calculateFinancialSnapshot,
  calculatePricingSimulation,
} from '../lib/accounting';
import {
  executeOnboardingSetup,
  executeCreatePurchase,
  executePayPurchase,
  executeReceivePurchase,
  executePosSale,
  executeRefundOrCancelSale,
  executeStockLotAdjustment,
  executePhysicalInventoryCount,
  executeFinancialEntry,
  executeAccountTransfer,
} from '../lib/operations';
import { formatCentsToBRL, formatPercent } from '../lib/currency';

const REF_NOW = '2026-11-25T12:00:00.000Z';
const FUTURE_EXPIRY = '2027-04-01';
const PAST_EXPIRY = '2026-01-01';

describe('PopControl ERP — Section 23 Financial & Inventory Acceptance Tests', () => {
  it('1. Validates the complete Section 23 lifecycle: R$ 130,00 capital -> 1st box -> 1st sale -> 5 sales -> 20 sales -> 2 new boxes', () => {
    // Initial clean business state (must NOT automatically register a purchase or capital)
    let state = createInitialBusinessState(
      'usr_owner',
      'owner@popcontrol.com.br',
      'Proprietário',
      'biz_01'
    );

    const snapBefore = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snapBefore.cashBalanceCents).toBe(0);
    expect(snapBefore.totalStockUnits).toBe(0);

    // Onboarding confirmation: Capital R$ 130,00 + Purchase paid & received (20 units @ R$ 5,89 = R$ 117,80)
    state = executeOnboardingSetup(state, {
      businessName: 'PopControl Dr. Pipoca',
      supplierName: 'Dr. Pipoca',
      productName: 'Pipoca Gourmet Leite em Pó Trufada 60g',
      sku: 'DP001',
      unitCostCents: 589,
      unitsPerBox: 20,
      salePriceCents: 1200,
      minStockUnits: 5,
      confirmCapitalContribution: true,
      capitalContributionCents: 13000, // R$ 130,00
      accountId: 'acc_pix',
      confirmFirstBoxPurchase: true,
      firstBoxPaid: true,
      firstBoxReceived: true,
      firstBoxLotNumber: 'LOTE-001',
      firstBoxExpirationDate: FUTURE_EXPIRY,
      dailyUnitsGoal: 4,
      nowISO: REF_NOW,
    });

    // Verify Onboarding idempotency: running onboarding again does NOT duplicate capital or purchase
    state = executeOnboardingSetup(state, {
      businessName: 'PopControl Dr. Pipoca',
      supplierName: 'Dr. Pipoca',
      productName: 'Pipoca Gourmet Leite em Pó Trufada 60g',
      sku: 'DP001',
      unitCostCents: 589,
      unitsPerBox: 20,
      salePriceCents: 1200,
      minStockUnits: 5,
      confirmCapitalContribution: true,
      capitalContributionCents: 13000,
      accountId: 'acc_pix',
      confirmFirstBoxPurchase: true,
      firstBoxPaid: true,
      firstBoxReceived: true,
      firstBoxLotNumber: 'LOTE-001',
      firstBoxExpirationDate: FUTURE_EXPIRY,
      dailyUnitsGoal: 4,
      nowISO: REF_NOW,
    });

    // Checkpoint A: After 1st box purchase (20 units @ R$ 5,89 = R$ 117,80)
    const snapAfterPurchase = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snapAfterPurchase.totalOwnerContributionsCents).toBe(13000); // R$ 130,00
    expect(snapAfterPurchase.cashBalanceCents).toBe(1220); // R$ 12,20
    expect(snapAfterPurchase.sellableStockUnits).toBe(20); // 20 unidades
    expect(snapAfterPurchase.totalInventoryAssetCents).toBe(11780); // R$ 117,80
    expect(snapAfterPurchase.netSalesRevenueCents).toBe(0); // R$ 0,00
    expect(snapAfterPurchase.grossProfitCents).toBe(0); // R$ 0,00
    expect(snapAfterPurchase.managerialNetWorthCents).toBe(13000); // R$ 130,00

    // Checkpoint B: After 1 sale via Pix for R$ 12,00
    state = executePosSale(state, {
      idempotencyKey: 'sale_1',
      items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      nowISO: REF_NOW,
    }).state;

    const snapAfter1Sale = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snapAfter1Sale.cashBalanceCents).toBe(2420); // R$ 24,20
    expect(snapAfter1Sale.sellableStockUnits).toBe(19); // 19 unidades
    expect(snapAfter1Sale.netSalesRevenueCents).toBe(1200); // R$ 12,00
    expect(snapAfter1Sale.cmvCents).toBe(589); // R$ 5,89
    expect(snapAfter1Sale.grossProfitCents).toBe(611); // R$ 6,11

    // Checkpoint C: After 5 sales total of R$ 12,00 (4 more sales)
    for (let i = 2; i <= 5; i++) {
      state = executePosSale(state, {
        idempotencyKey: `sale_${i}`,
        items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
        paymentMethod: 'Pix',
        accountId: 'acc_pix',
        nowISO: REF_NOW,
      }).state;
    }

    const snapAfter5Sales = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snapAfter5Sales.cashBalanceCents).toBe(7220); // R$ 72,20
    expect(snapAfter5Sales.sellableStockUnits).toBe(15); // 15 unidades
    expect(snapAfter5Sales.netSalesRevenueCents).toBe(6000); // R$ 60,00
    expect(snapAfter5Sales.cmvCents).toBe(2945); // R$ 29,45
    expect(snapAfter5Sales.grossProfitCents).toBe(3055); // R$ 30,55
    expect(snapAfter5Sales.totalInventoryAssetCents).toBe(8835); // R$ 88,35
    expect(snapAfter5Sales.managerialNetWorthCents).toBe(16055); // R$ 160,55

    // Checkpoint D: After selling the entire first box (15 remaining units sold)
    for (let i = 6; i <= 20; i++) {
      state = executePosSale(state, {
        idempotencyKey: `sale_${i}`,
        items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
        paymentMethod: 'Pix',
        accountId: 'acc_pix',
        nowISO: REF_NOW,
      }).state;
    }

    const snapAfterFullBox = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snapAfterFullBox.netSalesRevenueCents).toBe(24000); // R$ 240,00
    expect(snapAfterFullBox.cmvCents).toBe(11780); // R$ 117,80
    expect(snapAfterFullBox.grossProfitCents).toBe(12220); // R$ 122,20
    expect(snapAfterFullBox.netProfitCents).toBe(12220); // R$ 122,20
    expect(formatPercent(snapAfterFullBox.grossMarginPercent)).toBe('50,92%');
    expect(snapAfterFullBox.cashBalanceCents).toBe(25220); // R$ 252,20
    expect(snapAfterFullBox.sellableStockUnits).toBe(0); // 0 unidades

    // Checkpoint E: After paid & received purchase of 2 new boxes (40 units @ R$ 5,89 = R$ 235,60)
    state = executeCreatePurchase(state, {
      idempotencyKey: 'purchase_2_boxes',
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2026-11-26',
      boxesQuantity: 2,
      unitsPerBox: 20,
      baseUnitCostCents: 589,
      discountCents: 0,
      freightCents: 0,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: true,
      markAsReceivedImmediately: true,
      lotNumber: 'LOTE-002',
      expirationDate: FUTURE_EXPIRY,
      nowISO: REF_NOW,
    });

    const snapAfter2Boxes = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(state.purchases[0].totalCostCents).toBe(23560); // R$ 235,60
    expect(snapAfter2Boxes.cashBalanceCents).toBe(1660); // R$ 16,60
    expect(snapAfter2Boxes.sellableStockUnits).toBe(40); // 40 unidades
    expect(snapAfter2Boxes.totalInventoryAssetCents).toBe(23560); // R$ 235,60
    expect(snapAfter2Boxes.netProfitCents).toBe(12220); // Lucro acumulado permanece R$ 122,20
    expect(snapAfter2Boxes.managerialNetWorthCents).toBe(25220); // Patrimônio líquido permanece R$ 252,20
    expect(formatCentsToBRL(snapAfter2Boxes.cashBalanceCents)).toBe('R$\u00a016,60');
  });

  it('2. Blocks selling without stock, selling expired product, duplicate click (idempotency), and simultaneous sale of last unit', () => {
    let state = createInitialBusinessState('u1', 'a@a.com', 'Admin', 'b1');

    // Attempt to sell without stock
    expect(() =>
      executePosSale(state, {
        idempotencyKey: 'no_stock_sale',
        items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
        paymentMethod: 'Pix',
        accountId: 'acc_pix',
        nowISO: REF_NOW,
      })
    ).toThrow(/Estoque insuficiente/);

    // Add an EXPIRED lot of 5 units
    state = executeCreatePurchase(state, {
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2025-10-01',
      boxesQuantity: 1,
      unitsPerBox: 5,
      baseUnitCostCents: 589,
      discountCents: 0,
      freightCents: 0,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: true,
      markAsReceivedImmediately: true,
      lotNumber: 'LOTE-VENCIDO',
      expirationDate: PAST_EXPIRY,
      nowISO: REF_NOW,
    });

    // Attempt to sell expired product must be blocked by FEFO
    expect(() =>
      executePosSale(state, {
        idempotencyKey: 'expired_sale',
        items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
        paymentMethod: 'Pix',
        accountId: 'acc_pix',
        nowISO: REF_NOW,
      })
    ).toThrow(/lote\(s\) vencido\(s\) bloqueadas pelo FEFO/);

    // Add a valid lot with ONLY 1 unit
    state = executeCreatePurchase(state, {
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2026-11-25',
      boxesQuantity: 1,
      unitsPerBox: 1,
      baseUnitCostCents: 589,
      discountCents: 0,
      freightCents: 0,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: true,
      markAsReceivedImmediately: true,
      lotNumber: 'LOTE-UNICO',
      expirationDate: FUTURE_EXPIRY,
      nowISO: REF_NOW,
    });

    // First sale of the last unit succeeds
    state = executePosSale(state, {
      idempotencyKey: 'click_1',
      items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      nowISO: REF_NOW,
    }).state;

    // Duplicate click with same idempotencyKey is blocked
    expect(() =>
      executePosSale(state, {
        idempotencyKey: 'click_1',
        items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
        paymentMethod: 'Pix',
        accountId: 'acc_pix',
        nowISO: REF_NOW,
      })
    ).toThrow(/proteção contra clique duplicado/);

    // Simultaneous second sale for the last unit (now 0 valid left) is blocked
    expect(() =>
      executePosSale(state, {
        idempotencyKey: 'concurrent_sale_2',
        items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
        paymentMethod: 'Pix',
        accountId: 'acc_pix',
        nowISO: REF_NOW,
      })
    ).toThrow(/Estoque/);
  });

  it('3. Handles sale refunds with sellable return vs non-sellable return, and sale with discounts', () => {
    let state = createInitialBusinessState('u1', 'a@a.com', 'Admin', 'b1');
    state = executeCreatePurchase(state, {
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2026-11-25',
      boxesQuantity: 1,
      unitsPerBox: 20,
      baseUnitCostCents: 589,
      discountCents: 0,
      freightCents: 0,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: true,
      markAsReceivedImmediately: true,
      lotNumber: 'LOTE-01',
      expirationDate: FUTURE_EXPIRY,
      nowISO: REF_NOW,
    });

    // Sale 1 with discount (2 units @ 12,00 = 24,00 with 2,00 discount = 22,00)
    const sale1Res = executePosSale(state, {
      idempotencyKey: 'sale_disc_1',
      items: [
        {
          productId: 'prod_dp001',
          quantity: 2,
          unitPriceCents: 1200,
          itemDiscountCents: 200,
        },
      ],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      nowISO: REF_NOW,
    });
    state = sale1Res.state;
    expect(sale1Res.sale.totalCents).toBe(2200);
    expect(sale1Res.sale.totalCmvCents).toBe(1178);
    expect(sale1Res.sale.grossProfitCents).toBe(1022);

    // Refund Sale 1 WITH sellable return to stock
    state = executeRefundOrCancelSale(state, {
      saleId: sale1Res.sale.id,
      mode: 'refunded',
      returnToSellableStock: true,
      reason: 'Cliente trocou pedido com embalagem lacrada',
      nowISO: REF_NOW,
    });

    let snap = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snap.sellableStockUnits).toBe(20); // All 20 units back in stock
    expect(snap.netSalesRevenueCents).toBe(0);

    // Sale 2 (1 unit @ 12,00) then refunded WITHOUT return to stock (damaged/opened)
    const sale2Res = executePosSale(state, {
      idempotencyKey: 'sale_2',
      items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      nowISO: REF_NOW,
    });
    state = executeRefundOrCancelSale(sale2Res.state, {
      saleId: sale2Res.sale.id,
      mode: 'refunded',
      returnToSellableStock: false,
      reason: 'Embalagem aberta descartada',
      nowISO: REF_NOW,
    });

    snap = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snap.sellableStockUnits).toBe(19); // Not returned to sellable stock
    expect(snap.inventoryLossesCents).toBe(589); // Recognizing the R$ 5,89 loss in DRE
    expect(snap.netProfitCents).toBe(-589);
  });

  it('4. Separates purchase payment vs receipt, distributes freight/different unit cost into FEFO lots, and preserves historical CMV', () => {
    let state = createInitialBusinessState('u1', 'a@a.com', 'Admin', 'b1');

    // Purchase 1: Received but NOT yet paid (10 un @ 5,89 + 1,10 freight = 60,00 -> effective 6,00/un)
    state = executeCreatePurchase(state, {
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2026-11-25',
      boxesQuantity: 1,
      unitsPerBox: 10,
      baseUnitCostCents: 589,
      discountCents: 0,
      freightCents: 110, // R$ 1,10 freight distributed across 10 units = +11 cents/un -> 600 cents/un
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: false,
      markAsReceivedImmediately: true,
      lotNumber: 'LOTE-FRETE',
      expirationDate: '2027-02-01', // Earlier expiry -> FEFO priority 1
      nowISO: REF_NOW,
    });

    let snap = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snap.sellableStockUnits).toBe(10); // Stock increased on receipt
    expect(snap.cashBalanceCents).toBe(0); // Cash NOT reduced because not paid yet
    expect(snap.pendingPayablesCents).toBe(6000); // R$ 60,00 liability recorded
    expect(state.inventoryLots[0].unitAcquisitionCostCents).toBe(600); // R$ 6,00 effective unit cost

    // Purchase 2: Advance payment (Paid immediately, NOT yet received) at a different cost (R$ 6,50/un)
    state = executeCreatePurchase(state, {
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2026-11-25',
      boxesQuantity: 1,
      unitsPerBox: 10,
      baseUnitCostCents: 650,
      discountCents: 0,
      freightCents: 0,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: true,
      markAsReceivedImmediately: false,
      lotNumber: 'LOTE-NOVO-CUSTO',
      expirationDate: '2027-05-01', // Later expiry -> FEFO priority 2
      nowISO: REF_NOW,
    });

    snap = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snap.sellableStockUnits).toBe(10); // Still 10 units because Purchase 2 not received yet
    expect(snap.cashBalanceCents).toBe(-6500); // Paid R$ 65,00

    // Now receive Purchase 2
    const pur2 = state.purchases.find((p) => p.lotNumber === 'LOTE-NOVO-CUSTO')!;
    state = executeReceivePurchase(state, { purchaseId: pur2.id, nowISO: REF_NOW });

    // Prevent duplicate receipt or duplicate payment
    expect(() =>
      executeReceivePurchase(state, { purchaseId: pur2.id, nowISO: REF_NOW })
    ).toThrow(/já foi recebida/);
    expect(() =>
      executePayPurchase(state, { purchaseId: pur2.id, nowISO: REF_NOW })
    ).toThrow(/já consta como paga/);

    // Sell 1 unit: FEFO must consume from LOTE-FRETE (600 cents) and NEVER recalculate using the newer 650 cents cost!
    const saleRes = executePosSale(state, {
      idempotencyKey: 'sale_fefo_check',
      items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      nowISO: REF_NOW,
    });
    expect(saleRes.sale.totalCmvCents).toBe(600);
    expect(saleRes.sale.items[0].consumedLots[0].lotNumber).toBe('LOTE-FRETE');
  });

  it('5. Handles merchandise loss, physical inventory adjustment, owner profit withdrawal, additional contribution, and account transfers', () => {
    let state = createInitialBusinessState('u1', 'a@a.com', 'Admin', 'b1');
    state = executeOnboardingSetup(state, {
      businessName: 'PopControl',
      supplierName: 'Dr. Pipoca',
      productName: 'Pipoca Gourmet Leite em Pó Trufada 60g',
      sku: 'DP001',
      unitCostCents: 589,
      unitsPerBox: 20,
      salePriceCents: 1200,
      minStockUnits: 5,
      confirmCapitalContribution: true,
      capitalContributionCents: 13000,
      accountId: 'acc_pix',
      confirmFirstBoxPurchase: true,
      firstBoxPaid: true,
      firstBoxReceived: true,
      firstBoxLotNumber: 'LOTE-01',
      firstBoxExpirationDate: FUTURE_EXPIRY,
      dailyUnitsGoal: 4,
      nowISO: REF_NOW,
    });

    const lotId = state.inventoryLots[0].id;

    // 1. Loss of 1 unit
    state = executeStockLotAdjustment(state, {
      lotId,
      type: 'loss',
      quantity: 1,
      reason: 'Pacote perfurado no transporte',
      nowISO: REF_NOW,
    });

    // 2. Physical inventory count finds 18 units instead of 19 (-1 divergence)
    state = executePhysicalInventoryCount(state, {
      lotId,
      countedPhysicalQuantity: 18,
      justification: 'Contagem física semanal',
      nowISO: REF_NOW,
    });

    // 3. Additional owner contribution (+R$ 50,00) & Owner profit withdrawal (-R$ 20,00)
    state = executeFinancialEntry(state, {
      type: 'owner_contribution',
      categoryId: 'cat_contribution',
      accountId: 'acc_pix',
      amountCents: 5000,
      description: 'Aporte adicional',
      nowISO: REF_NOW,
    });

    state = executeFinancialEntry(state, {
      type: 'owner_withdrawal',
      categoryId: 'cat_withdrawal',
      accountId: 'acc_pix',
      amountCents: 2000,
      description: 'Retirada pessoal do proprietário',
      nowISO: REF_NOW,
    });

    // 4. Transfer between accounts (R$ 10,00 from Pix to Cash)
    state = executeAccountTransfer(state, {
      sourceAccountId: 'acc_pix',
      targetAccountId: 'acc_cash',
      amountCents: 1000,
      description: 'Troco para caixa físico',
      nowISO: REF_NOW,
    });

    const snap = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snap.sellableStockUnits).toBe(18);
    expect(snap.inventoryLossesCents).toBe(589 * 2); // 2 units lost/adjusted = R$ 11,78
    expect(snap.netSalesRevenueCents).toBe(0); // Contributions & transfers never count as revenue
    expect(snap.operationalExpensesCents).toBe(0); // Withdrawals & transfers never count as operational expense
    expect(snap.cashBalanceCents).toBe(1220 + 5000 - 2000); // Total cash unchanged by internal transfer
    expect(snap.accountBalances['acc_pix']).toBe(1220 + 5000 - 2000 - 1000);
    expect(snap.accountBalances['acc_cash']).toBe(1000);
  });

  it('6. Validates Pricing Simulator formula and zero/negative denominator protection', () => {
    const validSim = calculatePricingSimulation({
      unitCostCents: 589,
      unitFreightCents: 0,
      otherAcquisitionCostCents: 0,
      variableExpenseCents: 0,
      paymentFeePercent: 0,
      taxPercent: 0,
      desiredMarginPercent: 50.9166,
      testedSalePriceCents: 1200,
      monthlyFixedGoalCents: 12220,
    });
    expect(validSim.isValidDenominator).toBe(true);
    expect(validSim.suggestedSalePriceCents).toBe(1200);
    expect(validSim.estimatedGrossProfitCents).toBe(611);
    expect(validSim.breakEvenUnits).toBe(20);

    const invalidSim = calculatePricingSimulation({
      unitCostCents: 589,
      unitFreightCents: 0,
      otherAcquisitionCostCents: 0,
      variableExpenseCents: 0,
      paymentFeePercent: 15,
      taxPercent: 10,
      desiredMarginPercent: 80, // 15 + 10 + 80 = 105% -> denominator = -0.05 <= 0
      testedSalePriceCents: 1200,
      monthlyFixedGoalCents: 12220,
    });
    expect(invalidSim.isValidDenominator).toBe(false);
    expect(invalidSim.suggestedSalePriceCents).toBe(0);
  });
});

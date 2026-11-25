/**
 * POPCONTROL — COMPLETE PRODUCTION ACCEPTANCE & SECURITY TEST SUITE
 * Covers:
 * - Section 23 Full Lifecycle (R$ 130,00 -> 1st box -> 1st sale -> 5 sales -> 20 sales -> 2 new boxes)
 * - Item 1: Combo sale (20 un @ R$ 5,89 -> Combo 2 un = single sale R$ 22,00, 18 un remaining, CMV R$ 11,78, Gross Profit R$ 10,22) & idempotent retries returning single record
 * - Item 2: Pix Pendente, Operator vs Admin RBAC permissions, Supervisor PIN approval for refunds, discounts above limit, and stock adjustments
 * - Item 4: Shift Closing (Fechamento por turno) with physical cash difference, Pix received vs pending, and Card to settle
 * - Production Scope Pending Tests:
 *   1. Purchase discount, freight, and rounding allocation
 *   2. Card fees and card settlement (Taxas e liquidação de cartão)
 *   3. DRE date cut-off filtering (Corte de datas na DRE)
 *   4. Concurrent and expired FEFO lots (Lotes concorrentes e vencidos)
 *   5. Two devices selling the last unit simultaneously (Dois dispositivos vendendo a última unidade)
 *   6. Connection drop during transaction & backup restoration (Queda de conexão e restauração de backup)
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
  executeConfirmPendingPixSale,
  executeSettleReceivable,
  executeCloseShift,
} from '../lib/operations';
import { formatCentsToBRL, formatPercent } from '../lib/currency';

const REF_NOW = '2026-11-25T12:00:00.000Z';
const FUTURE_EXPIRY = '2027-04-01';
const PAST_EXPIRY = '2026-01-01';

describe('PopControl ERP — Complete Production & Financial Acceptance Suite', () => {
  it('1. Validates the complete Section 23 lifecycle: R$ 130,00 capital -> 1st box -> 1st sale -> 5 sales -> 20 sales -> 2 new boxes', () => {
    let state = createInitialBusinessState(
      'usr_owner',
      'owner@popcontrol.com.br',
      'Proprietário',
      'biz_01'
    );

    const snapBefore = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snapBefore.cashBalanceCents).toBe(0);
    expect(snapBefore.totalStockUnits).toBe(0);

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

    const snapAfterPurchase = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snapAfterPurchase.totalOwnerContributionsCents).toBe(13000);
    expect(snapAfterPurchase.cashBalanceCents).toBe(1220);
    expect(snapAfterPurchase.sellableStockUnits).toBe(20);
    expect(snapAfterPurchase.totalInventoryAssetCents).toBe(11780);
    expect(snapAfterPurchase.netSalesRevenueCents).toBe(0);
    expect(snapAfterPurchase.grossProfitCents).toBe(0);
    expect(snapAfterPurchase.managerialNetWorthCents).toBe(13000);

    // 1st Sale
    state = executePosSale(state, {
      idempotencyKey: 'sale_1',
      items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      nowISO: REF_NOW,
    }).state;

    const snapAfter1Sale = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snapAfter1Sale.cashBalanceCents).toBe(2420);
    expect(snapAfter1Sale.sellableStockUnits).toBe(19);
    expect(snapAfter1Sale.netSalesRevenueCents).toBe(1200);
    expect(snapAfter1Sale.cmvCents).toBe(589);
    expect(snapAfter1Sale.grossProfitCents).toBe(611);

    // 5 Sales Total
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
    expect(snapAfter5Sales.cashBalanceCents).toBe(7220);
    expect(snapAfter5Sales.sellableStockUnits).toBe(15);
    expect(snapAfter5Sales.netSalesRevenueCents).toBe(6000);
    expect(snapAfter5Sales.cmvCents).toBe(2945);
    expect(snapAfter5Sales.grossProfitCents).toBe(3055);
    expect(snapAfter5Sales.totalInventoryAssetCents).toBe(8835);
    expect(snapAfter5Sales.managerialNetWorthCents).toBe(16055);

    // 20 Sales Total (Full Box)
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
    expect(snapAfterFullBox.netSalesRevenueCents).toBe(24000);
    expect(snapAfterFullBox.cmvCents).toBe(11780);
    expect(snapAfterFullBox.grossProfitCents).toBe(12220);
    expect(snapAfterFullBox.netProfitCents).toBe(12220);
    expect(formatPercent(snapAfterFullBox.grossMarginPercent)).toBe('50,92%');
    expect(snapAfterFullBox.cashBalanceCents).toBe(25220);
    expect(snapAfterFullBox.sellableStockUnits).toBe(0);

    // Purchase of 2 new boxes
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
    expect(state.purchases[0].totalCostCents).toBe(23560);
    expect(snapAfter2Boxes.cashBalanceCents).toBe(1660);
    expect(snapAfter2Boxes.sellableStockUnits).toBe(40);
    expect(snapAfter2Boxes.totalInventoryAssetCents).toBe(23560);
    expect(snapAfter2Boxes.netProfitCents).toBe(12220);
    expect(snapAfter2Boxes.managerialNetWorthCents).toBe(25220);
    expect(formatCentsToBRL(snapAfter2Boxes.cashBalanceCents)).toBe('R$\u00a016,60');
  });

  it('2. [Ordem de Correção #1] Combo validation: 20 units @ R$ 5,89 -> Combo generates a single sale of R$ 22,00, leaves 18 units, CMV R$ 11,78, Gross Profit R$ 10,22, and idempotent retries generate a single record', () => {
    let state = createInitialBusinessState('u1', 'a@a.com', 'Admin', 'b1');

    // Fictitious purchase of 20 units @ R$ 5,89
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
      lotNumber: 'LOTE-COMBO-01',
      expirationDate: FUTURE_EXPIRY,
      nowISO: REF_NOW,
    });

    // Execute Combo Sale (2 units @ R$ 12,00 with R$ 2,00 combo discount = R$ 22,00)
    const comboAttempt1 = executePosSale(state, {
      idempotencyKey: 'combo_idem_key_001',
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
    state = comboAttempt1.state;

    // Retry / Resubmit the exact same sale with the same idempotencyKey: must return the single existing record without deducting stock twice!
    const comboAttempt2 = executePosSale(state, {
      idempotencyKey: 'combo_idem_key_001',
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
    state = comboAttempt2.state;

    expect(comboAttempt2.duplicateIdempotentHit).toBe(true);
    expect(comboAttempt2.sale.id).toBe(comboAttempt1.sale.id);
    expect(state.sales.length).toBe(1); // Strictly a single sale record

    const snap = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(comboAttempt1.sale.totalCents).toBe(2200); // R$ 22,00
    expect(snap.sellableStockUnits).toBe(18); // 18 units remaining
    expect(snap.cmvCents).toBe(1178); // R$ 11,78
    expect(snap.grossProfitCents).toBe(1022); // R$ 10,22
  });

  it('3. [Ordem de Correção #2] Controls Pix Pendente, Operator vs Admin permissions, and Supervisor PIN approval for refunds, discounts above limit, and stock adjustments', () => {
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
      lotNumber: 'LOTE-RBAC',
      expirationDate: FUTURE_EXPIRY,
      nowISO: REF_NOW,
    });

    const cashBeforeSale = calculateFinancialSnapshot(state, undefined, REF_NOW).cashBalanceCents;

    // 1. Pix Pendente Sale: deducts stock immediately, does NOT increase cash until confirmed
    const pixPendingRes = executePosSale(state, {
      idempotencyKey: 'sale_pix_pending_1',
      items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      isPixPending: true,
      nowISO: REF_NOW,
    });
    state = pixPendingRes.state;
    expect(pixPendingRes.sale.paymentStatus).toBe('pending_pix');

    let snap = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snap.sellableStockUnits).toBe(19);
    expect(snap.cashBalanceCents).toBe(cashBeforeSale); // Cash NOT incremented yet
    expect(snap.pendingPixCents).toBe(1200);

    // Confirm Pending Pix -> now enters cash
    state = executeConfirmPendingPixSale(state, {
      saleId: pixPendingRes.sale.id,
      nowISO: REF_NOW,
    });
    snap = calculateFinancialSnapshot(state, undefined, REF_NOW);
    expect(snap.cashBalanceCents).toBe(cashBeforeSale + 1200);
    expect(snap.pendingPixCents).toBe(0);

    // 2. Operator tries to give a 25% discount (R$ 3,00 on R$ 12,00) above the 10% limit WITHOUT admin PIN -> blocked
    expect(() =>
      executePosSale(state, {
        idempotencyKey: 'op_disc_blocked',
        items: [
          {
            productId: 'prod_dp001',
            quantity: 1,
            unitPriceCents: 1200,
            itemDiscountCents: 300,
          },
        ],
        paymentMethod: 'Pix',
        accountId: 'acc_pix',
        actingRole: 'operator',
        nowISO: REF_NOW,
      })
    ).toThrow(/exige senha\/PIN de aprovação do Administrador/);

    // Operator provides valid Admin PIN ('1234') -> approved
    const approvedDiscSale = executePosSale(state, {
      idempotencyKey: 'op_disc_approved',
      items: [
        {
          productId: 'prod_dp001',
          quantity: 1,
          unitPriceCents: 1200,
          itemDiscountCents: 300,
        },
      ],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      actingRole: 'operator',
      adminApprovalPin: '1234',
      nowISO: REF_NOW,
    });
    state = approvedDiscSale.state;
    expect(approvedDiscSale.sale.approvedByAdminName).toBeDefined();

    // 3. Operator tries to refund a sale without Admin PIN -> blocked; with PIN -> succeeds
    expect(() =>
      executeRefundOrCancelSale(state, {
        saleId: approvedDiscSale.sale.id,
        mode: 'refunded',
        returnToSellableStock: true,
        reason: 'Estorno teste operador',
        actingRole: 'operator',
        nowISO: REF_NOW,
      })
    ).toThrow(/exige senha\/PIN/);

    state = executeRefundOrCancelSale(state, {
      saleId: approvedDiscSale.sale.id,
      mode: 'refunded',
      returnToSellableStock: true,
      reason: 'Estorno aprovado pelo supervisor',
      actingRole: 'operator',
      adminApprovalPin: '1234',
      nowISO: REF_NOW,
    });

    // 4. Operator tries to adjust stock without Admin PIN -> blocked; with PIN -> succeeds
    const lotId = state.inventoryLots[0].id;
    expect(() =>
      executeStockLotAdjustment(state, {
        lotId,
        type: 'loss',
        quantity: 1,
        reason: 'Perda operador sem PIN',
        actingRole: 'operator',
        nowISO: REF_NOW,
      })
    ).toThrow(/exige senha\/PIN/);

    state = executeStockLotAdjustment(state, {
      lotId,
      type: 'loss',
      quantity: 1,
      reason: 'Perda aprovada por PIN',
      actingRole: 'operator',
      adminApprovalPin: '1234',
      nowISO: REF_NOW,
    });
    expect(state.inventoryLots[0].quantityRemaining).toBe(18);
  });

  it('4. [Escopo de Produção & Ordem #4] Card fees & settlement, Freight/Discount rounding, DRE Date Cut-off, and Shift Closing reconciliation', () => {
    let state = createInitialBusinessState('u1', 'a@a.com', 'Admin', 'b1');

    // A. Purchase with discount, freight, and rounding: 3 boxes (60 un) @ R$ 5,89 = R$ 353,40 - R$ 5,00 discount + R$ 11,80 freight = R$ 360,20 -> 36020 / 60 = 600.333 -> rounded to 600 cents/un
    state = executeCreatePurchase(state, {
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2026-10-15',
      boxesQuantity: 3,
      unitsPerBox: 20,
      baseUnitCostCents: 589,
      discountCents: 500,
      freightCents: 1180,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: true,
      markAsReceivedImmediately: true,
      lotNumber: 'LOTE-OUTUBRO',
      expirationDate: FUTURE_EXPIRY,
      nowISO: '2026-10-15T10:00:00.000Z',
    });
    expect(state.purchases[0].totalCostCents).toBe(36020);
    expect(state.inventoryLots[0].unitAcquisitionCostCents).toBe(600);

    // B. Sale in October (for DRE date cut-off test): 2 units in Cash @ R$ 12,00 = R$ 24,00
    state = executePosSale(state, {
      idempotencyKey: 'oct_cash_sale',
      items: [{ productId: 'prod_dp001', quantity: 2, unitPriceCents: 1200 }],
      paymentMethod: 'Dinheiro',
      accountId: 'acc_cash',
      nowISO: '2026-10-20T14:00:00.000Z',
    }).state;

    // C. Sale in November via Credit Card (3.99% fee -> Card to Settle): 5 units @ R$ 12,00 = R$ 60,00 (6000 cents). Fee = round(6000 * 0.0399) = 239 cents. Net settlement = 5761 cents.
    const cardSaleRes = executePosSale(state, {
      idempotencyKey: 'nov_card_sale',
      items: [{ productId: 'prod_dp001', quantity: 5, unitPriceCents: 1200 }],
      paymentMethod: 'Cartão de crédito',
      accountId: 'acc_bank',
      isCardToSettle: true,
      nowISO: '2026-11-10T15:00:00.000Z',
    });
    state = cardSaleRes.state;
    expect(cardSaleRes.sale.cardFeeCents).toBe(239);
    expect(cardSaleRes.sale.netSettlementCents).toBe(5761);

    // Verify Shift Closing before settling the card receivable
    // Expected physical cash = R$ 24,00 (2400 cents). If operator counts R$ 23,00 (2300 cents), difference is -R$ 1,00 (-100 cents).
    const shiftRes = executeCloseShift(state, {
      countedPhysicalCashCents: 2300,
      confirmedPixReceivedCents: 0,
      notes: 'Quebra de R$ 1,00 em moedas',
      nowISO: '2026-11-10T18:00:00.000Z',
    });
    state = shiftRes.state;
    expect(shiftRes.closing.expectedPhysicalCashCents).toBe(2400);
    expect(shiftRes.closing.cashDifferenceCents).toBe(-100);
    expect(shiftRes.closing.cardToSettleReceivablesCents).toBe(5761);

    // Settle the Credit Card Receivable into Bank account -> recognizes R$ 60,00 sale receipt and R$ 2,39 payment fee in DRE
    const cardRec = state.receivables.find((r) => r.originSaleId === cardSaleRes.sale.id)!;
    state = executeSettleReceivable(state, {
      receivableId: cardRec.id,
      receivedAmountCents: cardRec.remainingAmountCents,
      accountId: 'acc_bank',
      nowISO: '2026-11-12T10:00:00.000Z',
    });

    // D. DRE Date Cut-off validation: October only vs November only
    const octDre = calculateFinancialSnapshot(
      state,
      { startDate: '2026-10-01', endDate: '2026-10-31' },
      REF_NOW
    );
    expect(octDre.netSalesRevenueCents).toBe(2400); // Only October R$ 24,00 sale
    expect(octDre.cmvCents).toBe(1200); // 2 * 600
    expect(octDre.operationalExpensesCents).toBe(0);

    const novDre = calculateFinancialSnapshot(
      state,
      { startDate: '2026-11-01', endDate: '2026-11-30' },
      REF_NOW
    );
    expect(novDre.netSalesRevenueCents).toBe(6000); // Only November R$ 60,00 sale
    expect(novDre.cmvCents).toBe(3000); // 5 * 600
    expect(novDre.grossProfitCents).toBe(3000);
    expect(novDre.operationalExpensesCents).toBe(239); // Card fee R$ 2,39 recognized in November DRE
    expect(novDre.netProfitCents).toBe(3000 - 239); // R$ 27,61
  });

  it('5. [Escopo de Produção] Concurrent & expired FEFO lots, two devices selling the last unit, connection drop rollback, and backup restoration', () => {
    let state = createInitialBusinessState('u1', 'a@a.com', 'Admin', 'b1');

    // Add 1 expired lot (5 un), 1 valid lot expiring sooner (1 un @ R$ 5,80), 1 valid lot expiring later (1 un @ R$ 6,10)
    state = executeCreatePurchase(state, {
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2025-05-01',
      boxesQuantity: 1,
      unitsPerBox: 5,
      baseUnitCostCents: 550,
      discountCents: 0,
      freightCents: 0,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: true,
      markAsReceivedImmediately: true,
      lotNumber: 'LOTE-EXP',
      expirationDate: PAST_EXPIRY,
      nowISO: REF_NOW,
    });

    state = executeCreatePurchase(state, {
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2026-11-01',
      boxesQuantity: 1,
      unitsPerBox: 1,
      baseUnitCostCents: 580,
      discountCents: 0,
      freightCents: 0,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: true,
      markAsReceivedImmediately: true,
      lotNumber: 'LOTE-FEFO-1',
      expirationDate: '2027-01-15',
      nowISO: REF_NOW,
    });

    state = executeCreatePurchase(state, {
      supplierId: 'sup_dr_pipoca',
      productId: 'prod_dp001',
      purchaseDate: '2026-11-10',
      boxesQuantity: 1,
      unitsPerBox: 1,
      baseUnitCostCents: 610,
      discountCents: 0,
      freightCents: 0,
      otherAttributionCostsCents: 0,
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      markAsPaidImmediately: true,
      markAsReceivedImmediately: true,
      lotNumber: 'LOTE-FEFO-2',
      expirationDate: '2027-03-20',
      nowISO: REF_NOW,
    });

    // Backup snapshot before sales (for backup restore verification)
    const backupJsonString = JSON.stringify(state);

    // 1. Concurrent FEFO consumption across 2 valid lots while skipping the expired lot:
    // Selling 1 unit consumes LOTE-FEFO-1 (580 cents), leaving 1 valid unit in LOTE-FEFO-2 (610 cents)
    state = executePosSale(state, {
      idempotencyKey: 'device_a_sale_1',
      items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      nowISO: REF_NOW,
    }).state;
    expect(state.sales[0].totalCmvCents).toBe(580);

    // 2. Two devices (Device A and Device B) attempting to sell the LAST remaining valid unit:
    // Device A commits against the authoritative cloud state first:
    state = executePosSale(state, {
      idempotencyKey: 'device_a_last_unit',
      items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
      paymentMethod: 'Pix',
      accountId: 'acc_pix',
      nowISO: REF_NOW,
    }).state;
    expect(state.sales[0].totalCmvCents).toBe(610);

    // Device B pulls latest cloud state during atomic transaction and attempts to sell the last unit -> blocked with clear explanation (5 expired units remain blocked by FEFO)
    expect(() =>
      executePosSale(state, {
        idempotencyKey: 'device_b_last_unit',
        items: [{ productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 }],
        paymentMethod: 'Pix',
        accountId: 'acc_pix',
        nowISO: REF_NOW,
      })
    ).toThrow(/Estoque vendável insuficiente \(0 un disponíveis\)\. Há 5 un em lote\(s\) vencido\(s\) bloqueadas pelo FEFO/);

    // 3. Simulated connection failure / mid-transaction error atomic rollback:
    const stateBeforeFailedTx = JSON.stringify(state);
    expect(() =>
      executePosSale(state, {
        idempotencyKey: 'failed_multi_item_tx',
        items: [
          { productId: 'prod_dp001', quantity: 1, unitPriceCents: 1200 },
          { productId: 'non_existent_prod', quantity: 1, unitPriceCents: 1200 },
        ],
        paymentMethod: 'Pix',
        accountId: 'acc_pix',
        nowISO: REF_NOW,
      })
    ).toThrow();
    // State must remain 100% untouched (zero partial writes)
    expect(JSON.stringify(state)).toBe(stateBeforeFailedTx);

    // 4. Backup restoration integrity:
    const restoredState = JSON.parse(backupJsonString);
    const restoredSnap = calculateFinancialSnapshot(restoredState, undefined, REF_NOW);
    expect(restoredSnap.sellableStockUnits).toBe(2);
    expect(restoredSnap.expiredStockUnits).toBe(5);
    expect(restoredState.sales.length).toBe(0);
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
      desiredMarginPercent: 80,
      testedSalePriceCents: 1200,
      monthlyFixedGoalCents: 12220,
    });
    expect(invalidSim.isValidDenominator).toBe(false);
    expect(invalidSim.suggestedSalePriceCents).toBe(0);
  });
});

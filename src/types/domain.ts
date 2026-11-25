/**
 * POPCONTROL — DOMAIN MODELS & DATA TYPES
 * All monetary amounts are strictly stored as integer cents (BRL centavos).
 * Example: R$ 5,89 = 589 | R$ 12,00 = 1200 | R$ 130,00 = 13000
 */

export type Role = 'admin' | 'operator';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  businessId: string;
  role: Role;
  createdAt: string;
}

export interface BusinessMember {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  joinedAt: string;
}

export interface ReinvestmentStrategy {
  reinvestPercent: number; // default 70
  personalWithdrawalPercent: number; // default 20
  reservePercent: number; // default 10
}

export interface LoyaltyRules {
  enabled: boolean;
  paidUnitsRequired: number; // e.g., 10
  freeUnitsReward: number; // e.g., 1
}

export interface CustomerSegmentationRules {
  recurringMinPurchases: number; // e.g., 2
  frequentMinPurchases: number; // e.g., 5
  vipMinSpentCents: number; // e.g., 12000 (R$ 120,00)
  inactiveDaysThreshold: number; // e.g., 30 days
}

export interface AlertPreferences {
  expiryWarningDays: number[]; // [7, 15, 30]
  lowMarginThresholdPercent: number; // e.g. 30
  payableDueWarningDays: number; // e.g. 5
}

export interface RolePermissionsConfig {
  operatorMaxDiscountPercent: number; // Default 10% (above requires admin PIN/approval)
  adminPinCode: string; // Default '1234' for supervisor approval on operator actions
  debitCardFeePercent: number; // e.g. 1.99%
  creditCardFeePercent: number; // e.g. 3.99%
  cardSettlementDays: number; // e.g. 1 day for debit, 30 for credit
}

export interface ShiftClosingRecord {
  id: string;
  businessId: string;
  openedAt: string;
  closedAt: string;
  closedByUserId: string;
  closedByUserName: string;
  expectedPhysicalCashCents: number;
  countedPhysicalCashCents: number;
  cashDifferenceCents: number; // counted - expected
  expectedPixReceivedCents: number;
  confirmedPixReceivedCents: number;
  pixPendingCents: number;
  cardToSettleReceivablesCents: number;
  notes?: string;
}

export interface BusinessSettings {
  id: string;
  businessId: string;
  businessName: string;
  logoUrl?: string;
  currency: 'BRL';
  locale: 'pt-BR';
  timezone: 'America/Sao_Paulo';
  theme: 'light' | 'dark';
  defaultMinStock: number;
  minCashReserveCents: number; // e.g. 1220 or 2000
  workingDaysPerMonth: number; // default 22
  paymentMethods: string[];
  financialCategories: FinancialCategory[];
  reinvestmentStrategy: ReinvestmentStrategy;
  loyaltyRules: LoyaltyRules;
  segmentationRules: CustomerSegmentationRules;
  alertPreferences: AlertPreferences;
  permissionsConfig?: RolePermissionsConfig;
  onboardingCompleted: boolean;
  initialCapitalConfirmed: boolean;
  initialPurchaseConfirmed: boolean;
  updatedAt: string;
}

export interface FinancialCategory {
  id: string;
  name: string;
  type: 'inflow' | 'outflow' | 'equity_in' | 'equity_out' | 'transfer';
  isOperationalExpense: boolean;
  isSystem: boolean;
}

export interface FinancialAccount {
  id: string;
  businessId: string;
  name: string;
  type: 'cash' | 'bank' | 'pix' | 'other';
  initialBalanceCents: number;
  active: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  businessId: string;
  name: string;
  sku: string; // Unique per business, e.g., DP001
  barcode?: string;
  brand: string; // e.g., Dr. Pipoca
  category: string; // e.g., Pipoca Gourmet
  flavor: string; // e.g., Leite em Pó Trufada
  netWeightGrams: number; // e.g., 60 or 100
  unitOfMeasure: string; // e.g., 'un'
  primarySupplierId: string;
  acquisitionCostCents: number; // e.g., 589
  salePriceCents: number; // e.g., 1200
  promotionalPriceCents?: number;
  unitsPerBox: number; // e.g., 20
  minStockUnits: number; // e.g., 5
  description?: string;
  imageUrl?: string;
  active: boolean;
  isFeaturedFastSale?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionalCombo {
  id: string;
  businessId: string;
  name: string;
  productId: string;
  quantity: number;
  comboPriceCents: number;
  active: boolean;
}

export interface Supplier {
  id: string;
  businessId: string;
  name: string; // Razão social ou nome comercial (Dr. Pipoca)
  cnpj?: string;
  contactPerson?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  commercialTerms?: string;
  minimumOrderValueCents?: number;
  minimumOrderBoxes?: number;
  deliveryLeadTimeDays?: number;
  preferredPaymentMethod?: string;
  notes?: string;
  negotiatedPrices?: Record<string, number>; // productId -> costCents
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLot {
  id: string;
  businessId: string;
  productId: string;
  lotNumber: string;
  manufacturingDate?: string; // ISO YYYY-MM-DD
  expirationDate: string; // ISO YYYY-MM-DD
  quantityReceived: number;
  quantityRemaining: number;
  unitAcquisitionCostCents: number; // Effective unit cost including allocated freight/fees/discounts
  originPurchaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export type StockMovementType =
  | 'purchase_entry'
  | 'sale_exit'
  | 'return_entry'
  | 'loss'
  | 'damage'
  | 'expiration'
  | 'positive_adjustment'
  | 'negative_adjustment'
  | 'promotional_loyalty_exit';

export interface StockMovement {
  id: string;
  businessId: string;
  productId: string;
  productName: string;
  lotId: string;
  lotNumber: string;
  quantity: number; // positive integer magnitude
  direction: 'in' | 'out';
  type: StockMovementType;
  reason: string;
  unitCostCents: number;
  totalCostCents: number;
  responsibleUserId: string;
  responsibleUserName: string;
  originDocumentId?: string;
  previousStock: number;
  newStock: number;
  createdAt: string;
}

export type PurchaseReceiptStatus = 'planned' | 'confirmed' | 'received' | 'cancelled';
export type PurchasePaymentStatus = 'pending' | 'paid' | 'partial' | 'cancelled';

export interface Purchase {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string; // ISO date
  productId: string;
  productName: string;
  boxesQuantity: number;
  unitsPerBox: number;
  totalUnits: number;
  baseUnitCostCents: number;
  discountCents: number;
  freightCents: number;
  otherAttributionCostsCents: number;
  totalCostCents: number; // (totalUnits * baseUnitCostCents) - discount + freight + other
  effectiveUnitCostCents: number; // Math.round(totalCostCents / totalUnits)
  paymentMethod: string;
  accountId: string;
  paymentDate?: string;
  paymentStatus: PurchasePaymentStatus;
  receiptStatus: PurchaseReceiptStatus;
  receivedDate?: string;
  lotNumber: string;
  manufacturingDate?: string;
  expirationDate: string;
  notes?: string;
  createdLotId?: string;
  payableId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleLotConsumption {
  lotId: string;
  lotNumber: string;
  quantity: number;
  unitCostCents: number;
  totalCostCents: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  itemDiscountCents: number;
  grossTotalCents: number; // quantity * unitPriceCents
  netTotalCents: number; // grossTotalCents - itemDiscountCents
  historicalCmvCents: number; // Exact sum of consumed lots' costs
  grossProfitCents: number; // netTotalCents - historicalCmvCents
  isLoyaltyFreeReward?: boolean;
  consumedLots: SaleLotConsumption[];
}

export type SaleStatus = 'completed' | 'cancelled' | 'refunded';
export type SalePaymentStatus = 'received' | 'pending_pix' | 'pending_card_settlement' | 'pending_receivable';

export interface Sale {
  id: string;
  businessId: string;
  code: string; // e.g., #V0001
  idempotencyKey: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  totalUnits: number;
  subtotalCents: number; // Sum of items grossTotalCents
  itemDiscountsTotalCents: number;
  generalDiscountCents: number;
  totalDiscountCents: number;
  totalCents: number; // Final sale amount charged
  totalCmvCents: number; // Total historical CMV of paid items
  promotionalLoyaltyCostCents: number; // Cost of free loyalty reward items
  grossProfitCents: number; // totalCents - totalCmvCents (before fees and operational expenses)
  cardFeeCents?: number; // Acquirer fee when paid by card
  netSettlementCents?: number; // totalCents - cardFeeCents
  paymentMethod: string;
  accountId: string;
  paymentReceivedImmediately: boolean;
  paymentStatus?: SalePaymentStatus;
  approvedByAdminName?: string;
  status: SaleStatus;
  refundReason?: string;
  refundReturnedToStock?: boolean;
  refundedAt?: string;
  notes?: string;
  salesChannel: string; // e.g., 'Venda Presencial'
  responsibleUserId: string;
  responsibleUserName: string;
  createdAt: string;
}

export type TransactionType =
  | 'sale_receipt'
  | 'supplier_payment'
  | 'owner_contribution'
  | 'owner_withdrawal'
  | 'operational_expense'
  | 'transport_expense'
  | 'payment_fee'
  | 'sale_refund'
  | 'other_income'
  | 'other_expense'
  | 'account_transfer';

export interface FinancialTransaction {
  id: string;
  businessId: string;
  type: TransactionType;
  direction: 'in' | 'out' | 'transfer';
  categoryId: string;
  categoryName: string;
  accountId: string;
  targetAccountId?: string; // For transfers
  amountCents: number;
  description: string;
  referenceDocumentId?: string; // saleId, purchaseId, payableId, receivableId
  occurredAt: string;
  createdByUserId: string;
  createdAt: string;
}

export type PayableReceivableStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface AccountPayable {
  id: string;
  businessId: string;
  supplierId?: string;
  supplierName?: string;
  description: string;
  categoryId: string;
  categoryName: string;
  totalAmountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  dueDate: string; // YYYY-MM-DD
  status: PayableReceivableStatus;
  originPurchaseId?: string;
  isInventoryAcquisition: boolean; // True if from purchase (so paying it doesn't double count as operational expense)
  createdAt: string;
  updatedAt: string;
}

export interface AccountReceivable {
  id: string;
  businessId: string;
  customerId?: string;
  customerName?: string;
  description: string;
  totalAmountCents: number; // Gross sale amount or net receivable
  grossSaleAmountCents?: number;
  cardFeeCents?: number;
  receivedAmountCents: number;
  remainingAmountCents: number;
  dueDate: string;
  status: PayableReceivableStatus;
  originSaleId?: string;
  receivableKind?: 'pix_pending' | 'card_settlement' | 'customer_credit';
  targetAccountId?: string;
  createdAt: string;
  updatedAt: string;
}

export type CustomerSegment = 'new' | 'recurring' | 'frequent' | 'inactive' | 'vip';

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  marketingConsent: boolean;
  firstPurchaseDate?: string;
  lastPurchaseDate?: string;
  totalPurchasesCount: number;
  totalUnitsBought: number;
  totalSpentCents: number;
  averageTicketCents: number;
  favoriteProductId?: string;
  favoriteProductName?: string;
  loyaltyPointsPaidUnits: number; // Cumulative paid units toward loyalty
  loyaltyRewardsRedeemed: number; // How many free units redeemed
  createdAt: string;
  updatedAt: string;
}

export type GoalPeriod = 'daily' | 'weekly' | 'monthly' | 'annual' | 'custom';
export type GoalMetricType =
  | 'gross_revenue'
  | 'gross_profit'
  | 'net_profit'
  | 'units_sold'
  | 'sales_count'
  | 'average_ticket'
  | 'accumulated_capital';

export interface CommercialGoal {
  id: string;
  businessId: string;
  title: string;
  period: GoalPeriod;
  metricType: GoalMetricType;
  targetValue: number; // Cents for monetary metrics, integer units for count metrics
  startDate: string;
  endDate: string;
  active: boolean;
  notes?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  businessId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface BusinessDatabaseState {
  profile: UserProfile;
  members: BusinessMember[];
  settings: BusinessSettings;
  accounts: FinancialAccount[];
  products: Product[];
  combos: PromotionalCombo[];
  suppliers: Supplier[];
  inventoryLots: InventoryLot[];
  stockMovements: StockMovement[];
  purchases: Purchase[];
  sales: Sale[];
  financialTransactions: FinancialTransaction[];
  payables: AccountPayable[];
  receivables: AccountReceivable[];
  customers: Customer[];
  goals: CommercialGoal[];
  auditLogs: AuditLog[];
  shiftClosings?: ShiftClosingRecord[];
  idempotencyKeys: Record<string, string>; // key -> entityId
}

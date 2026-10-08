export const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'STOCK_CLERK'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'sale.create', 'sale.void', 'buyback.create', 'discount.apply', 'value.override',
  'item.read', 'item.manage', 'stock.adjust',
  'rate.read', 'rate.set',
  'customer.read', 'customer.manage',
  'pawn.manage', 'pawn.forfeit', 'savings.manage', 'loyalty.manage', 'document.issue', 'ledger.manage',
  'report.view', 'audit.view', 'user.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as Permission[];
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  MANAGER: ALL.filter((p) => p !== 'user.manage'),
  CASHIER: ['sale.create', 'buyback.create', 'item.read', 'rate.read', 'customer.read', 'customer.manage', 'pawn.manage', 'savings.manage', 'loyalty.manage', 'document.issue'],
  STOCK_CLERK: ['item.read', 'item.manage', 'stock.adjust', 'rate.read'],
};
export const can = (role: Role, p: Permission): boolean => ROLE_PERMISSIONS[role]?.includes(p) ?? false;

import { DomainError, isValidPurityBp, type MakingCharge } from '@sola/core';
import type { DB } from '../db/schema';
import type { Actor } from '../context';
import { audit } from '../repos/audit';
import { getItem, insertItem, insertMovement, setItemStatus, type ItemStatus, type NewItem } from '../repos/items';

export function receiveItem(db: DB, actor: Actor, input: NewItem & { making: MakingCharge }) {
  if (!isValidPurityBp(input.purityBp)) throw new DomainError('INVALID_PURITY', 'invalid purity');
  return db.transaction(() => {
    let id: number;
    try { id = insertItem(db, input); }
    catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) throw new DomainError('DUPLICATE_SKU', `SKU already exists: ${input.sku}`);
      throw e;
    }
    insertMovement(db, { itemId: id, type: 'RECEIVE', from: null, to: 'IN_STOCK', weightMg: input.weightMg, userId: actor.id });
    audit(db, actor, 'item.create', 'item', id, input);
    return getItem(db, id)!;
  })();
}

const MANUAL: ItemStatus[] = ['IN_STOCK', 'RESERVED', 'MISSING'];
/** Manual stock corrections. SOLD/VOIDED only change through transactions. */
export function adjustItemStatus(db: DB, actor: Actor, id: number, to: ItemStatus, note: string) {
  if (!MANUAL.includes(to)) throw new DomainError('INVALID_STATUS', `status can only be set to ${MANUAL.join(', ')}`);
  if (!note.trim()) throw new DomainError('NOTE_REQUIRED', 'a reason is required');
  return db.transaction(() => {
    const item = getItem(db, id);
    if (!item) throw new DomainError('NOT_FOUND', 'item not found');
    if (!MANUAL.includes(item.status)) throw new DomainError('ITEM_UNAVAILABLE', `item is ${item.status}`);
    setItemStatus(db, id, to);
    insertMovement(db, { itemId: id, type: 'ADJUST', from: item.status, to, weightMg: item.weightMg, userId: actor.id, note });
    audit(db, actor, 'item.adjust', 'item', id, { from: item.status, to, note });
    return getItem(db, id)!;
  })();
}

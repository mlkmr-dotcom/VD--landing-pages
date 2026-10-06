// Réservation atomique d'une référence technique. Aucune donnée de contact ou message ici.
const CREATE=`CREATE TABLE IF NOT EXISTS lead_receipts (event_id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`;
export async function claimReceipt(db,eventId,now=Date.now()) {
 if(!db||!/^dcub-[A-Za-z0-9-]{8,70}$/.test(eventId))throw new Error('receipt_not_configured');
 await db.prepare(CREATE).run();
 const r=await db.prepare('INSERT OR IGNORE INTO lead_receipts (event_id,state,created_at,updated_at) VALUES (?, ?, ?, ?)').bind(eventId,'pending',now,now).run();
 if(typeof r.meta?.changes!=='number')throw new Error('receipt_unknown_result');
 return r.meta.changes===1;
}
export async function finishReceipt(db,eventId,state,now=Date.now()) {
 if(!['accepted','uncertain','rejected'].includes(state))throw new Error('receipt_invalid_state');
 await db.prepare('UPDATE lead_receipts SET state=?,updated_at=? WHERE event_id=? AND state=?').bind(state,now,eventId,'pending').run();
}

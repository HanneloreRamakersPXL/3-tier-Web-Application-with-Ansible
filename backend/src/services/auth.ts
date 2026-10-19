import { pool } from '@cinevote/storage';
import { hashService } from './hash.js';

export async function verifyGroupAdmin(groupId: string, adminCode: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT admin_code_hash FROM groups WHERE id = $1`,
    [groupId]
  );
  if (result.rows.length === 0) return false;
  return hashService.verify(adminCode, result.rows[0].admin_code_hash);
}
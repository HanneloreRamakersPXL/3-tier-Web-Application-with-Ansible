import { pool } from '@cinevote/storage';
import { generateHmacToken } from './hmac-token.js';
import { hashService } from './hash.js';
import { logger } from './logger.js';

export interface SessionResumeResponse {
  member_id: string;
  role: 'admin' | 'member';
  display_name: string;
  group_id: string;
  group_name: string;
  invite_code: string;
  current_round: {
    round_id: string;
    round_number: number;
    status: string;
  } | null;
}

export async function resumeSession(
  inviteCode: string,
  memberCode: string
): Promise<SessionResumeResponse> {
  const groupResult = await pool.query(
    'SELECT id, name, invite_code FROM groups WHERE invite_code = $1',
    [inviteCode.toUpperCase()]
  );

  if (groupResult.rows.length === 0) {
    throw new Error('Invalid invite code or member code');
  }

  const group = groupResult.rows[0];

  const lookupToken = generateHmacToken(memberCode);

  const memberResult = await pool.query(
    `SELECT id, display_name, member_code_hash, role
     FROM members
     WHERE group_id = $1 AND member_code_lookup_token = $2`,
    [group.id, lookupToken]
  );

  if (memberResult.rows.length === 0) {
    throw new Error('Invalid invite code or member code');
  }

  const member = memberResult.rows[0];

  const isValid = await hashService.verify(memberCode, member.member_code_hash);

  if (!isValid) {
    throw new Error('Invalid invite code or member code');
  }

  const roundResult = await pool.query(
    `SELECT id, round_number, status FROM rounds
     WHERE group_id = $1 AND status::text NOT IN ('completed', 'cancelled', 'watched')
     ORDER BY round_number DESC LIMIT 1`,
    [group.id]
  );

  const currentRound = roundResult.rows[0] || null;

  logger.info('Session resumed', { groupId: group.id, memberId: member.id });

  return {
    member_id: member.id,
    role: member.role,
    display_name: member.display_name,
    group_id: group.id,
    group_name: group.name,
    invite_code: group.invite_code,
    current_round: currentRound ? {
      round_id: currentRound.id,
      round_number: currentRound.round_number,
      status: currentRound.status,
    } : null,
  };
}

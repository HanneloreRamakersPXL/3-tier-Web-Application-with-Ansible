import { pool, insertGroup, insertMember, insertRound } from '@cinevote/storage';
import {
  generateInviteCode,
  generateAdminCode,
  generateMemberCode,
} from './code-generator.js';
import {
  generateAdminLookupToken,
  generateMemberLookupToken,
  generateHmacToken,
} from './hmac-token.js';
import { logger } from './logger.js';
import type { CreateGroupResponse, JoinGroupResponse } from '../types/group.js';

export type { CreateGroupResponse, JoinGroupResponse };

export async function createGroup(
  groupName: string,
  creatorDisplayName: string,
  maxMembers: number,
  userId?: string
): Promise<CreateGroupResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inviteCodeResult = await generateInviteCode(async (code) => {
      const existing = await client.query(
        'SELECT 1 FROM groups WHERE invite_code = $1',
        [code.toUpperCase()]
      );
      return existing.rows.length > 0;
    });

    const adminCodeResult = await generateAdminCode(async (code) => {
      const lookupToken = generateAdminLookupToken(code);
      const existing = await client.query(
        'SELECT 1 FROM groups WHERE admin_code_lookup_token = $1',
        [lookupToken]
      );
      return existing.rows.length > 0;
    });

    const memberCodeResult = await generateMemberCode(async (code) => {
      const lookupToken = generateMemberLookupToken(code);
      const existing = await client.query(
        'SELECT 1 FROM members WHERE member_code_lookup_token = $1',
        [lookupToken]
      );
      return existing.rows.length > 0;
    });

    const groupId = await insertGroup(client, {
      name: groupName,
      inviteCode: inviteCodeResult.code,
      adminCodeLookupToken: adminCodeResult.lookupToken,
      adminCodeHash: adminCodeResult.hash,
      maxMembers,
    });

    const memberId = await insertMember(client, {
      groupId,
      displayName: creatorDisplayName,
      memberCodeLookupToken: memberCodeResult.lookupToken,
      memberCodeHash: memberCodeResult.hash,
      role: 'admin',
      userId,
    });

    const roundId = await insertRound(client, {
      groupId,
      roundNumber: 1,
      status: 'proposing',
    });

    await client.query('COMMIT');

    logger.info('Group created successfully', { groupId, memberId });

    return {
      group_id: groupId,
      group_name: groupName,
      invite_code: inviteCodeResult.code,
      admin_code: adminCodeResult.code,
      member_id: memberId,
      member_code: memberCodeResult.code,
      round_id: roundId,
      max_members: maxMembers,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create group', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function joinGroup(
  inviteCode: string,
  displayName: string,
  userId?: string
): Promise<JoinGroupResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const groupResult = await client.query(
      'SELECT id, name, invite_code FROM groups WHERE invite_code = $1',
      [inviteCode.toUpperCase()]
    );

    if (groupResult.rows.length === 0) {
      throw new Error('Group not found');
    }

    const group = groupResult.rows[0];

    const memberCodeResult = await generateMemberCode(async (code) => {
      const existing = await client.query(
        'SELECT 1 FROM members WHERE group_id = $1 AND member_code_lookup_token = $2',
        [group.id, generateHmacToken(code)]
      );
      return existing.rows.length > 0;
    });

    const memberResult = await client.query(
      `INSERT INTO members (group_id, display_name, member_code_lookup_token, member_code_hash, role, user_id)
       VALUES ($1, $2, $3, $4, 'member', $5)
       RETURNING id`,
      [
        group.id,
        displayName,
        memberCodeResult.lookupToken,
        memberCodeResult.hash,
        userId ?? null,
      ]
    );

    const memberId = memberResult.rows[0].id;

    const roundResult = await client.query(
      `SELECT id, round_number, status FROM rounds
       WHERE group_id = $1 AND status::text NOT IN ('completed', 'cancelled', 'watched')
       ORDER BY round_number DESC LIMIT 1`,
      [group.id]
    );

    const currentRound = roundResult.rows[0] || null;

    await client.query('COMMIT');

    logger.info('Member joined group', { groupId: group.id, memberId });

    return {
      group_id: group.id,
      group_name: group.name,
      invite_code: group.invite_code,
      member_id: memberId,
      member_code: memberCodeResult.code,
      current_round: currentRound ? {
        round_id: currentRound.id,
        round_number: currentRound.round_number,
        status: currentRound.status,
      } : null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to join group', error);
    throw error;
  } finally {
    client.release();
  }
}

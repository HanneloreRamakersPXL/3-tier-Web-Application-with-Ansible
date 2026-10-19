export interface CreateGroupRequest {
  group_name: string;
  display_name: string;
  max_members: number;
}

export interface CreateGroupResponse {
  group_id: string;
  group_name: string;
  invite_code: string;
  admin_code: string;
  member_id: string;
  member_code: string;
  round_id: string;
  max_members: number;
}

export interface JoinGroupResponse {
  group_id: string;
  group_name: string;
  invite_code: string;
  member_id: string;
  member_code: string;
  current_round: {
    round_id: string;
    round_number: number;
    status: string;
  } | null;
}

export interface GroupRecord {
  id: string;
  name: string;
  invite_code: string;
  admin_code_lookup_token: string;
  admin_code_hash: string;
  created_at: Date;
}

export interface MemberRecord {
  id: string;
  group_id: string;
  display_name: string;
  member_code_lookup_token: string;
  member_code_hash: string;
  role: 'admin' | 'member';
  joined_at: Date;
}

export interface RoundRecord {
  id: string;
  group_id: string;
  round_number: number;
  status: RoundStatus;
  winning_proposal_id: string | null;
  voting_started_at: Date | null;
  watched_at: Date | null;
  created_at: Date;
  closed_at: Date | null;
}

export type RoundStatus =
  | 'proposing'
  | 'voting'
  | 'winner_selected'
  | 'watched'
  | 'completed'
  | 'cancelled';

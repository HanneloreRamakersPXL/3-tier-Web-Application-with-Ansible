export interface CreateGroupRequest {
  group_name: string;
  max_members: number;
}

export interface CreateGroupResponse {
  group_id: string;
  group_name: string;
  invite_code: string;
  member_id: string;
  member_code: string;
  round_id: string;
  max_members: number;
}

export interface JoinGroupRequest {
  invite_code: string;
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
  };
}

export interface MyGroup {
  group_id: string;
  group_name: string;
  invite_code: string;
  max_members: number;
  member_id: string;
  role: 'admin' | 'member';
  member_count: number;
  active_round_id: string | null;
  round_status: string | null;
  round_number: number | null;
}

export interface GroupMember {
  id: string;
  display_name: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface SessionResumeRequest {
  invite_code: string;
  member_code: string;
}

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
  };
}

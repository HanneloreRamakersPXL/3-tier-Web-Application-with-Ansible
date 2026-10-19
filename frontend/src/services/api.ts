import axios from 'axios';
import { CreateGroupResponse, JoinGroupResponse, SessionResumeResponse, MyGroup, GroupMember } from '../types/group';
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../types/auth';
import {
  SearchMoviesResponse,
  SubmitProposalRequest,
  ProposalResponse,
  ListProposalsResponse,
  CloseProposalsRequest,
} from '../types/proposal';
import {
  GroupDashboard,
  Round,
  Proposal,
  Vote,
  Rating,
  VotingStatus,
  MemberProfile,
  MyWatchedMovie,
} from '../types/dashboard';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('cv_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const api = {
  auth: {
    async register(data: RegisterRequest): Promise<AuthResponse> {
      const response = await apiClient.post<AuthResponse>('/auth/register', data);
      return response.data;
    },
    async login(data: LoginRequest): Promise<AuthResponse> {
      const response = await apiClient.post<AuthResponse>('/auth/login', data);
      return response.data;
    },
    async me(): Promise<User> {
      const response = await apiClient.get<{ user: User }>('/auth/me');
      return response.data.user;
    },
  },

  async createGroup(data: {
    group_name: string;
    max_members: number;
  }): Promise<CreateGroupResponse> {
    const response = await apiClient.post<CreateGroupResponse>('/groups', data);
    return response.data;
  },

  async getMemberCount(groupId: string): Promise<{ count: number; max_members: number }> {
    const response = await apiClient.get(`/groups/${groupId}/members`);
    return response.data;
  },

  async joinGroup(data: {
    invite_code: string;
  }): Promise<JoinGroupResponse> {
    const response = await apiClient.post<JoinGroupResponse>('/groups/join', data);
    return response.data;
  },

  async resumeSession(data: {
    invite_code: string;
    member_code: string;
  }): Promise<SessionResumeResponse> {
    const response = await apiClient.post<SessionResumeResponse>('/groups/resume', data);
    return response.data;
  },

  async getMyGroups(): Promise<MyGroup[]> {
    const response = await apiClient.get<{ groups: MyGroup[] }>('/groups/my-groups');
    return response.data.groups;
  },

  async deleteGroup(groupId: string): Promise<void> {
    await apiClient.delete(`/groups/${groupId}`);
  },

  async startNewRound(groupId: string): Promise<{ id: string; round_number: number; status: string }> {
    const response = await apiClient.post(`/groups/${groupId}/rounds`);
    return response.data;
  },

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const response = await apiClient.get<{ members: GroupMember[] }>(`/groups/${groupId}/members/list`);
    return response.data.members;
  },

  async getPopularMovies(page = 1, genre?: number): Promise<{ movies: SearchMoviesResponse['movies']; page: number; total_pages: number }> {
    const response = await apiClient.get('/movies/popular', {
      params: { page, ...(genre ? { genre } : {}) },
    });
    return response.data;
  },

  async resumeSessionByUser(invite_code: string): Promise<SessionResumeResponse> {
    const response = await apiClient.post<SessionResumeResponse>('/groups/resume/by-user', { invite_code });
    return response.data;
  },

  async searchMovies(query: string): Promise<SearchMoviesResponse> {
    const response = await apiClient.get<SearchMoviesResponse>('/search/movies', {
      params: { q: query },
    });
    return response.data;
  },

  async submitProposal(roundId: string, data: SubmitProposalRequest): Promise<ProposalResponse> {
    const response = await apiClient.post<ProposalResponse>(`/rounds/${roundId}/proposals`, data);
    return response.data;
  },

  async listProposals(roundId: string, memberId?: string): Promise<ListProposalsResponse> {
    const response = await apiClient.get<ListProposalsResponse>(`/rounds/${roundId}/proposals`, {
      params: memberId ? { memberId } : undefined,
    });
    return response.data;
  },

  async closeProposals(roundId: string, data: CloseProposalsRequest): Promise<unknown> {
    const response = await apiClient.patch(`/rounds/${roundId}/close-proposals`, data);
    return response.data;
  },

  async getMyMember(groupId: string): Promise<{ member_id: string; role: 'admin' | 'member' }> {
    const response = await apiClient.get(`/groups/${groupId}/my-member`);
    return response.data;
  },

  // Dashboard
  async getGroupDashboard(groupId: string): Promise<GroupDashboard> {
    const response = await apiClient.get<GroupDashboard>(`/groups/${groupId}/dashboard`);
    return response.data;
  },

  // Rounds
  async getRound(roundId: string): Promise<Round> {
    const response = await apiClient.get<Round>(`/rounds/${roundId}`);
    return response.data;
  },

  async getRounds(groupId: string): Promise<Round[]> {
    const response = await apiClient.get<Round[]>(`/groups/${groupId}/rounds`);
    return response.data;
  },

  // Proposals (unwrapped array for component consumption)
  async getProposals(roundId: string, memberId?: string): Promise<Proposal[]> {
    const response = await apiClient.get<ListProposalsResponse>(`/rounds/${roundId}/proposals`, {
      params: memberId ? { memberId } : undefined,
    });
    return response.data.proposals as Proposal[];
  },

  // Voting
  async castVote(data: {
    round_id: string;
    member_id: string;
    proposal_id: string;
  }): Promise<Vote> {
    const response = await apiClient.post<Vote>(`/rounds/${data.round_id}/votes`, {
      member_id: data.member_id,
      proposal_id: data.proposal_id,
    });
    return response.data;
  },

  async getVotingStatus(roundId: string, memberId?: string): Promise<VotingStatus> {
    const response = await apiClient.get<VotingStatus>(`/rounds/${roundId}/votes/status`, {
      params: memberId ? { memberId } : undefined,
    });
    return response.data;
  },

  // Ratings
  async rateProposal(data: {
    proposal_id: string;
    member_id: string;
    rating: number;
  }): Promise<Rating> {
    const response = await apiClient.post<Rating>(`/proposals/${data.proposal_id}/rating`, {
      member_id: data.member_id,
      rating: data.rating,
    });
    return response.data;
  },

  async getProposalRatings(proposalId: string, memberId?: string): Promise<ProposalResponse> {
    const response = await apiClient.get<ProposalResponse>(`/proposals/${proposalId}/ratings`, {
      params: memberId ? { memberId } : undefined,
    });
    return response.data;
  },

  async markWatched(roundId: string): Promise<{ id: string; status: string; watched_at: string }> {
    const response = await apiClient.patch(`/rounds/${roundId}/mark-watched`);
    return response.data;
  },

  async getMemberProfile(memberId: string): Promise<MemberProfile> {
    const response = await apiClient.get<MemberProfile>(`/members/${memberId}/profile`);
    return response.data;
  },

  async getMyProfile(): Promise<{ watched_movies: MyWatchedMovie[] }> {
    const response = await apiClient.get('/me/profile');
    return response.data;
  },
};

export default apiClient;

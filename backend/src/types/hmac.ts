export interface HmacToken {
  token: string;
  codeType: 'invite' | 'member' | 'admin';
}

export interface LookupTokenResult {
  token: string;
  code: string;
  codeType: 'invite' | 'member' | 'admin';
}

export type CodeType = 'invite' | 'member' | 'admin';

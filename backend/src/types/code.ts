export interface GeneratedCode {
  code: string;
  lookupToken: string;
  hash: string;
}

export interface InviteCode extends GeneratedCode {
  code: string;
}

export interface MemberCode extends GeneratedCode {
  code: string;
}

export interface AdminCode extends GeneratedCode {
  code: string;
}

export type CodeType = 'invite' | 'member' | 'admin';

export interface CodeGenerationResult {
  code: string;
  lookupToken: string;
  hash: string;
  codeType: CodeType;
}

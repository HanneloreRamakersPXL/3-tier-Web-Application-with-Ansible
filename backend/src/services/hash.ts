import bcrypt from 'bcrypt';

const DEFAULT_ROUNDS = 12;

export interface HashService {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hash: string): Promise<boolean>;
}

class BcryptHashService implements HashService {
  private readonly rounds: number;

  constructor(rounds: number = DEFAULT_ROUNDS) {
    this.rounds = rounds;
  }

  async hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, this.rounds);
  }

  async verify(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }
}

export const hashService: HashService = new BcryptHashService(DEFAULT_ROUNDS);

export function createHashService(rounds: number = DEFAULT_ROUNDS): HashService {
  return new BcryptHashService(rounds);
}

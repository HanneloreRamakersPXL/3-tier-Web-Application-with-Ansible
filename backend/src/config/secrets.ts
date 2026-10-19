import crypto from 'crypto';

const HMAC_SECRET = process.env.HMAC_SECRET || crypto.randomBytes(32).toString('hex');

export const secrets = {
  HMAC_SECRET,
  getHmacSecret: () => HMAC_SECRET,
};

export default secrets;

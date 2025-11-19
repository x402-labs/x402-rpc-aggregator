// Minimal bs58 encode/decode for browser (no dependencies)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
window.bs58 = {
  encode: function(buffer) {
    if (buffer.length === 0) return '';
    const digits = [0];
    for (let i = 0; i < buffer.length; i++) {
      let carry = buffer[i];
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    let result = '';
    for (let i = 0; i < buffer.length && buffer[i] === 0; i++) result += '1';
    for (let i = digits.length - 1; i >= 0; i--) result += BASE58_ALPHABET[digits[i]];
    return result;
  },
  decode: function(string) {
    if (string.length === 0) return new Uint8Array(0);
    const bytes = [0];
    for (let i = 0; i < string.length; i++) {
      const value = BASE58_ALPHABET.indexOf(string[i]);
      if (value === -1) throw new Error('Invalid base58 character');
      let carry = value;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    for (let i = 0; i < string.length && string[i] === '1'; i++) bytes.push(0);
    return new Uint8Array(bytes.reverse());
  }
};
console.log('✅ Solana web3.js loaded:', typeof window.solanaWeb3 !== 'undefined');
console.log('✅ bs58 loaded:', typeof window.bs58 !== 'undefined');

(function() {
  // Complete Buffer polyfill that @solana/web3.js needs
  class BufferPolyfill extends Uint8Array {
    constructor(arg, encodingOrOffset, length) {
      if (typeof arg === 'number') {
        super(arg);
      } else if (typeof arg === 'string') {
        const encoded = new TextEncoder().encode(arg);
        super(encoded);
      } else {
        super(arg, encodingOrOffset, length);
      }
    }
    
    static from(value, encoding) {
      if (typeof value === 'string') {
        return new TextEncoder().encode(value);
      }
      if (value instanceof Uint8Array) {
        return value;
      }
      if (Array.isArray(value)) {
        return new Uint8Array(value);
      }
      if (value?.buffer) {
        return new Uint8Array(value.buffer);
      }
      return new Uint8Array(value);
    }
    
    static alloc(size, fill = 0) {
      const buf = new Uint8Array(size);
      if (fill !== 0) buf.fill(fill);
      return buf;
    }
    
    static allocUnsafe(size) {
      return new Uint8Array(size);
    }
    
    static isBuffer(obj) {
      return obj instanceof Uint8Array;
    }
    
    static concat(list, totalLength) {
      if (!totalLength) {
        totalLength = list.reduce((acc, buf) => acc + buf.length, 0);
      }
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of list) {
        result.set(buf, offset);
        offset += buf.length;
      }
      return result;
    }
  }
  
  window.Buffer = BufferPolyfill;
  console.log('✅ Enhanced Buffer polyfill loaded');
  console.log('✅ Buffer.from:', typeof Buffer.from === 'function');
  console.log('✅ Buffer.alloc:', typeof Buffer.alloc === 'function');
})();

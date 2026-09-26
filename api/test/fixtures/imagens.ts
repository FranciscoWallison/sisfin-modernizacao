// Bytes iniciais REAIS de cada formato de logo (a detecção só olha a assinatura) — admin-bancos (A02/A03).
export const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
export const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');
export const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8L'), Buffer.alloc(8)]);

// Inspect image headers without Node dependencies or decoding unbounded pixels.
export function screenshotDimensions(bytes) {
  if (!ArrayBuffer.isView(bytes) || bytes.byteLength < 24 || bytes.byteLength > 16 * 1024 * 1024) return null;
  const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset) => new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);
  if (data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 &&
      data[12] === 73 && data[13] === 72 && data[14] === 68 && data[15] === 82) {
    return { width: u32(16), height: u32(20), mediaType: "image/png" };
  }
  if (data[0] !== 255 || data[1] !== 216) return null;
  for (let offset = 2; offset + 9 < data.length;) {
    if (data[offset] !== 255) return null;
    const marker = data[offset + 1];
    const length = (data[offset + 2] << 8) | data[offset + 3];
    if (length < 2 || offset + 2 + length > data.length) return null;
    if ([192, 193, 194].includes(marker)) return {
      width: (data[offset + 7] << 8) | data[offset + 8],
      height: (data[offset + 5] << 8) | data[offset + 6], mediaType: "image/jpeg",
    };
    offset += 2 + length;
  }
  return null;
}

/** Bound actual streamed bytes before JSON parsing or forwarding. */
export class RequestSizeError extends Error {}
export async function boundedRequest(request: Request, maxBytes = 2_000_000): Promise<Request> {
 const length = request.headers.get('content-length');
 if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new RequestSizeError();
 if (!request.body) return request;
 const reader = request.body.getReader();
 const chunks: Uint8Array[] = [];
 let size = 0;
 try {
  while (true) {
   const {done, value} = await reader.read();
   if (done) break;
   size += value.byteLength;
   if (size > maxBytes) { void reader.cancel().catch(() => {}); throw new RequestSizeError(); }
   chunks.push(value);
  }
 } finally { reader.releaseLock(); }
 const body = new Uint8Array(size);
 let offset = 0;
 for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
 return new Request(request.url, {method: request.method, headers: request.headers, body});
}

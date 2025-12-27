function chunkText(text, maxBytes = 4800) {
  const encoder = new TextEncoder();
  let chunks = [];
  let currentChunk = "";
  let currentBytes = 0;

  const sentences = text.split(/(?<=[।.!?])/); // split by Bengali or English sentence enders

  for (const sentence of sentences) {
    const encoded = encoder.encode(sentence);
    if (currentBytes + encoded.length > maxBytes) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      currentBytes = encoded.length;
    } else {
      currentChunk += sentence;
      currentBytes += encoded.length;
    }
  }

  if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
  return chunks;
}


export {chunkText};
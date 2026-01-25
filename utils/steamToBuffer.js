const streamToBuffer = async (readableStream) => {
  const reader = readableStream.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
};

export {streamToBuffer};

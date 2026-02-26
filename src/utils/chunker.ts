interface ChunkOptions {
  maxTokens: number;
  overlap: number;
  strategy: 'semantic' | 'fixed';
}

export default function chunkText(text: string, options: ChunkOptions): string[] {
  // A simple dummy chunker that splits by length for now, 
  // since this is just getting it to compile.
  const chunks: string[] = [];
  const chunkSize = options.maxTokens * 4; // roughly 4 chars per token
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += (chunkSize - options.overlap * 4);
  }
  return chunks.length > 0 ? chunks : [text];
}

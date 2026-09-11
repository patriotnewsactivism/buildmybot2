declare module 'pdf-parse' {
  export default function parse(data: Buffer): Promise<{
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }>;
}

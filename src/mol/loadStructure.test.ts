// @vitest-environment node
/**
 * Taken from the doc 115 verification pass (05/10) — loadStructure() under Node, because
 * jsdom's Blob has no .stream() and the gzip branch cannot run there. This
 * is the seam §8.2 names: vite serves .gz with Content-Encoding (browser
 * decodes → "already decoded" branch), the mnemo-plugin:// handler copies a
 * file:// fetch's headers and sets none (→ the sniff-and-inflate branch).
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import index from '../../public/corpus/index.json';
import { loadStructure, type Corpus, type PdbEntry } from './corpus';

const corpus = index as unknown as Corpus;
const PUB = join(__dirname, '..', '..', 'public', 'corpus');
const entry = corpus.structures.find((e) => e.id === '1HHO') as PdbEntry;
const gz = readFileSync(join(PUB, entry.file));
const plain = gunzipSync(gz);

// corpus.ts resolves against document.baseURI; Node has no document.
(globalThis as unknown as { document: unknown }).document = { baseURI: 'mnemo-plugin://app/@mnemosyne-plugins/mnemo-molecule/index.html' };

const serve = (body: Uint8Array, ok = true, status = 200) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok, status,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  })));
};
afterEach(() => { vi.unstubAllGlobals(); });

describe('the two ways a host can serve a .gz', () => {
  it('raw gzip bytes (installed cartridge) come back inflated', async () => {
    serve(new Uint8Array(gz));
    const out = await loadStructure(entry);
    expect(out.byteLength).toBe(plain.byteLength);
    expect(Buffer.from(out).equals(plain)).toBe(true);
  });
  it('already-decoded bytes (vite dev/preview) come back untouched', async () => {
    serve(new Uint8Array(plain));
    const out = await loadStructure(entry);
    expect(Buffer.from(out).equals(plain)).toBe(true);
  });
  it('the fetch goes to the cartridge origin, never to a root-absolute path', async () => {
    serve(new Uint8Array(plain));
    await loadStructure(entry);
    const url = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0]![0];
    expect(url).toBe('mnemo-plugin://app/@mnemosyne-plugins/mnemo-molecule/corpus/pdb/1HHO.bcif.gz');
  });
});

describe('three ways a file can be bad', () => {
  it('a truncated gzip rejects — never a silent short model', async () => {
    serve(new Uint8Array(gz.subarray(0, Math.floor(gz.length / 2))));
    await expect(loadStructure(entry)).rejects.toThrow();
  });
  it('an HTTP failure names the id and the status', async () => {
    serve(new Uint8Array(0), false, 404);
    await expect(loadStructure(entry)).rejects.toThrow(/1HHO.*404/);
  });
  it('an empty 200 body is returned as zero bytes (the viewer must then say "nothing drawn")', async () => {
    serve(new Uint8Array(0));
    expect((await loadStructure(entry)).byteLength).toBe(0);
  });
});

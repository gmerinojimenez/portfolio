import { toWireEvent, type WireEvent } from './protocol';

/**
 * Splits a byte stream into NDJSON events (one JSON object per line).
 *
 * Network chunks don't line up with lines: a chunk can hold three lines, or
 * half of one. Think of reading an OkHttp `Source` with `readUtf8Line()`
 * except that here the bytes arrive when the network feels like it, so the
 * unfinished last line is kept until the next `push`.
 *
 * Lines that aren't valid JSON, or aren't events, are skipped and counted.
 */
export class NdjsonParser {
  private buffer = '';
  private skipped = 0;

  /** Lines that couldn't be read so far. */
  get skippedLines(): number {
    return this.skipped;
  }

  /** Feeds decoded text; returns the events of the lines it completed. */
  push(text: string): WireEvent[] {
    this.buffer += text;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.flatMap((line) => this.parseLine(line));
  }

  /** Call when the stream ends: a last line may lack its `\n`. */
  end(): WireEvent[] {
    const rest = this.buffer;
    this.buffer = '';
    return this.parseLine(rest);
  }

  private parseLine(line: string): WireEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      const event = toWireEvent(JSON.parse(trimmed));
      if (event) return [event];
    } catch {
      // Fall through: counted below.
    }
    this.skipped += 1;
    return [];
  }
}

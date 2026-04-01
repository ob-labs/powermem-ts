/**
 * Snowflake ID generator — port of Python's SnowflakeIDGenerator.
 *
 * Layout (64 bits):
 *   41 bits timestamp (ms since epoch) | 5 bits datacenter | 5 bits worker | 12 bits sequence
 *
 * IDs are always returned as strings to prevent JS precision loss.
 */

const EPOCH = 1609459200000n; // 2021-01-01 00:00:00 UTC
const DATACENTER_BITS = 5n;
const WORKER_BITS = 5n;
const SEQUENCE_BITS = 12n;

const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n; // 4095

const WORKER_SHIFT = SEQUENCE_BITS;
const DATACENTER_SHIFT = SEQUENCE_BITS + WORKER_BITS;
const TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_BITS + DATACENTER_BITS;

export class SnowflakeIDGenerator {
  private readonly datacenterId: bigint;
  private readonly workerId: bigint;
  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(datacenterId = 0, workerId = 0) {
    this.datacenterId = BigInt(datacenterId);
    this.workerId = BigInt(workerId);
  }

  nextId(): string {
    let timestamp = BigInt(Date.now());

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;
      if (this.sequence === 0n) {
        // Sequence exhausted — wait for next millisecond
        while (timestamp <= this.lastTimestamp) {
          timestamp = BigInt(Date.now());
        }
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    const id =
      ((timestamp - EPOCH) << TIMESTAMP_SHIFT) |
      (this.datacenterId << DATACENTER_SHIFT) |
      (this.workerId << WORKER_SHIFT) |
      this.sequence;

    return id.toString();
  }
}

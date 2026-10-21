// =============================================================================
// Study engine — tiny non-crypto RNG for weighted activity selection.
// =============================================================================
// The `rand` crate isn't a dependency; activity selection only needs cheap,
// good-enough randomness so one activity type doesn't monopolise a session.
// Seeded from the system clock (nanos) with xorshift64*.
// =============================================================================

use std::cell::Cell;
use std::time::{SystemTime, UNIX_EPOCH};

thread_local! {
    static STATE: Cell<u64> = Cell::new(seed());
}

fn seed() -> u64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E3779B97F4A7C15);
    // Avoid a zero state (xorshift is stuck at 0).
    nanos ^ 0x9E3779B97F4A7C15 | 1
}

/// Returns a pseudo-random f64 in [0.0, 1.0).
pub fn next_f64() -> f64 {
    STATE.with(|s| {
        let mut x = s.get();
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        s.set(x);
        let v = x.wrapping_mul(0x2545F4914F6CDD1D);
        // Top 53 bits → [0,1)
        ((v >> 11) as f64) / ((1u64 << 53) as f64)
    })
}

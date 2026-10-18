package org.teavm.classlib.impl.math;

/**
 * Fork addition: integer division and remainder that behave like Java's.
 *
 * <p>The WasmGC backend maps {@code DIVIDE} straight to {@code i32.div_s} / {@code i64.div_s} (and
 * {@code MODULO} to the corresponding {@code rem_s}), so a division by zero traps inside the wasm
 * operator instead of throwing {@code ArithmeticException} — a surrounding {@code catch} never runs.
 * Java also requires {@code MIN_VALUE / -1} to be {@code MIN_VALUE} and {@code MIN_VALUE % -1} to be
 * {@code 0}, where wasm's {@code div_s} traps on overflow. These methods handle both, and
 * {@code DivisionCheckTransformer} rewrites user and class-library divisions into calls to them.
 *
 * <p>The transformer skips this class, which is why the plain {@code /} and {@code %} below survive:
 * by the time they run, the divisor is known to be non-zero and the overflow case is handled.
 */
public final class Division {
    private Division() {
    }

    public static int div(int a, int b) {
        if (b == 0) {
            throw new ArithmeticException("/ by zero");
        }
        if (a == Integer.MIN_VALUE && b == -1) {
            return Integer.MIN_VALUE;
        }
        return a / b;
    }

    public static int rem(int a, int b) {
        if (b == 0) {
            throw new ArithmeticException("/ by zero");
        }
        return a % b;
    }

    public static long div(long a, long b) {
        if (b == 0) {
            throw new ArithmeticException("/ by zero");
        }
        if (a == Long.MIN_VALUE && b == -1) {
            return Long.MIN_VALUE;
        }
        return a / b;
    }

    public static long rem(long a, long b) {
        if (b == 0) {
            throw new ArithmeticException("/ by zero");
        }
        return a % b;
    }
}

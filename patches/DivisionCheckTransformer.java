package org.teavm.javac;

import java.util.ArrayList;
import java.util.List;
import org.teavm.model.BasicBlock;
import org.teavm.model.ClassHolder;
import org.teavm.model.ClassHolderTransformer;
import org.teavm.model.ClassHolderTransformerContext;
import org.teavm.model.Instruction;
import org.teavm.model.MethodHolder;
import org.teavm.model.MethodReference;
import org.teavm.model.Program;
import org.teavm.model.ValueType;
import org.teavm.model.instructions.BinaryInstruction;
import org.teavm.model.instructions.BinaryOperation;
import org.teavm.model.instructions.InvocationType;
import org.teavm.model.instructions.InvokeInstruction;

/**
 * Rewrites int/long division and remainder into calls to {@code org.teavm.classlib.impl.math.Division}.
 *
 * <p>{@code BaseWasmGenerationVisitor} maps {@code DIVIDE} straight to {@code WasmIntBinaryOperation
 * .DIV_SIGNED} (and {@code MODULO} to {@code REM_SIGNED}) with no zero check, so a division by zero
 * traps in the wasm operator instead of throwing {@code ArithmeticException} — a surrounding
 * {@code catch} never runs. Java also requires {@code MIN_VALUE / -1} to be {@code MIN_VALUE}, where
 * wasm's {@code div_s} traps on overflow. Unlike bounds and null checks there is no instruction or
 * helper in the backend to reuse for this, so the check lives in the class library and this
 * transformer routes arithmetic to it.
 *
 * <p>Only the WasmGC backend needs this: the JavaScript backend lowers division to its own throwing
 * runtime helper.
 */
public class DivisionCheckTransformer implements ClassHolderTransformer {
    private static final String HELPER = "org.teavm.classlib.impl.math.Division";
    private static final MethodReference INT_DIV = new MethodReference(HELPER, "div",
            ValueType.INTEGER, ValueType.INTEGER, ValueType.INTEGER);
    private static final MethodReference INT_REM = new MethodReference(HELPER, "rem",
            ValueType.INTEGER, ValueType.INTEGER, ValueType.INTEGER);
    private static final MethodReference LONG_DIV = new MethodReference(HELPER, "div",
            ValueType.LONG, ValueType.LONG, ValueType.LONG);
    private static final MethodReference LONG_REM = new MethodReference(HELPER, "rem",
            ValueType.LONG, ValueType.LONG, ValueType.LONG);

    @Override
    public void transformClass(ClassHolder cls, ClassHolderTransformerContext context) {
        // The helper's own `/` and `%` must stay as they are, or the rewrite would recurse forever.
        if (cls.getName().equals(HELPER)) {
            return;
        }
        for (MethodHolder method : cls.getMethods()) {
            Program program = method.getProgram();
            if (program == null) {
                continue;
            }
            for (BasicBlock block : program.getBasicBlocks()) {
                List<Instruction> instructions = new ArrayList<>();
                for (var instruction = block.getFirstInstruction(); instruction != null;
                        instruction = instruction.getNext()) {
                    instructions.add(instruction);
                }
                boolean changed = false;
                for (int i = 0; i < instructions.size(); ++i) {
                    Instruction replacement = replacementFor(instructions.get(i));
                    if (replacement != null) {
                        instructions.set(i, replacement);
                        changed = true;
                    }
                }
                if (!changed) {
                    continue;
                }
                // A block's instructions are a linked list with no remove(), so rebuild it.
                block.removeAllInstructions();
                block.addAll(instructions);
            }
        }
    }

    private static Instruction replacementFor(Instruction instruction) {
        if (!(instruction instanceof BinaryInstruction)) {
            return null;
        }
        var binary = (BinaryInstruction) instruction;
        boolean divide = binary.getOperation() == BinaryOperation.DIVIDE;
        boolean remainder = binary.getOperation() == BinaryOperation.MODULO;
        if (!divide && !remainder) {
            return null;
        }
        MethodReference target;
        switch (binary.getOperandType()) {
            case INT:
                target = divide ? INT_DIV : INT_REM;
                break;
            case LONG:
                target = divide ? LONG_DIV : LONG_REM;
                break;
            default:
                // Floating-point division by zero is Infinity/NaN, not an exception.
                return null;
        }
        var invoke = new InvokeInstruction();
        invoke.setType(InvocationType.SPECIAL);
        invoke.setMethod(target);
        invoke.setArguments(binary.getFirstOperand(), binary.getSecondOperand());
        invoke.setReceiver(binary.getReceiver());
        invoke.setLocation(binary.getLocation());
        return invoke;
    }
}

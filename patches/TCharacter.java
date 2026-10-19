/*
 *  Copyright 2014 Alexey Andreev.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
package org.teavm.classlib.java.lang;

import java.util.Objects;
import org.teavm.classlib.impl.unicode.CharMapping;
import org.teavm.classlib.impl.unicode.UnicodeHelper;
import org.teavm.platform.metadata.StringResource;

public class TCharacter extends TObject implements TComparable<TCharacter> {
    public static final int MIN_RADIX = 2;
    public static final int MAX_RADIX = 36;
    public static final char MIN_VALUE = '\0';
    public static final char MAX_VALUE = '\uFFFF';
    public static final Class<Character> TYPE = char.class;
    public static final byte UNASSIGNED = 0;
    public static final byte UPPERCASE_LETTER = 1;
    public static final byte LOWERCASE_LETTER = 2;
    public static final byte TITLECASE_LETTER = 3;
    public static final byte MODIFIER_LETTER = 4;
    public static final byte OTHER_LETTER = 5;
    public static final byte NON_SPACING_MARK = 6;
    public static final byte ENCLOSING_MARK = 7;
    public static final byte COMBINING_SPACING_MARK = 8;
    public static final byte DECIMAL_DIGIT_NUMBER = 9;
    public static final byte LETTER_NUMBER = 10;
    public static final byte OTHER_NUMBER = 11;
    public static final byte SPACE_SEPARATOR = 12;
    public static final byte LINE_SEPARATOR = 13;
    public static final byte PARAGRAPH_SEPARATOR = 14;
    public static final byte CONTROL = 15;
    public static final byte FORMAT = 16;
    public static final byte PRIVATE_USE = 17;
    public static final byte SURROGATE = 19;
    public static final byte DASH_PUNCTUATION = 20;
    public static final byte START_PUNCTUATION = 21;
    public static final byte END_PUNCTUATION = 22;
    public static final byte CONNECTOR_PUNCTUATION = 23;
    public static final byte OTHER_PUNCTUATION = 24;
    public static final byte MATH_SYMBOL = 25;
    public static final byte CURRENCY_SYMBOL = 26;
    public static final byte MODIFIER_SYMBOL = 27;
    public static final byte OTHER_SYMBOL = 28;
    public static final byte INITIAL_QUOTE_PUNCTUATION = 29;
    public static final byte FINAL_QUOTE_PUNCTUATION = 30;
    public static final byte DIRECTIONALITY_UNDEFINED = -1;
    public static final byte DIRECTIONALITY_LEFT_TO_RIGHT = 0;
    public static final byte DIRECTIONALITY_RIGHT_TO_LEFT = 1;
    public static final byte DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC = 2;
    public static final byte DIRECTIONALITY_EUROPEAN_NUMBER = 3;
    public static final byte DIRECTIONALITY_EUROPEAN_NUMBER_SEPARATOR = 4;
    public static final byte DIRECTIONALITY_EUROPEAN_NUMBER_TERMINATOR = 5;
    public static final byte DIRECTIONALITY_ARABIC_NUMBER = 6;
    public static final byte DIRECTIONALITY_COMMON_NUMBER_SEPARATOR = 7;
    public static final byte DIRECTIONALITY_NONSPACING_MARK = 8;
    public static final byte DIRECTIONALITY_BOUNDARY_NEUTRAL = 9;
    public static final byte DIRECTIONALITY_PARAGRAPH_SEPARATOR = 10;
    public static final byte DIRECTIONALITY_SEGMENT_SEPARATOR = 11;
    public static final byte DIRECTIONALITY_WHITESPACE = 12;
    public static final byte DIRECTIONALITY_OTHER_NEUTRALS = 13;
    public static final byte DIRECTIONALITY_LEFT_TO_RIGHT_EMBEDDING = 14;
    public static final byte DIRECTIONALITY_LEFT_TO_RIGHT_OVERRIDE = 15;
    public static final byte DIRECTIONALITY_RIGHT_TO_LEFT_EMBEDDING = 16;
    public static final byte DIRECTIONALITY_RIGHT_TO_LEFT_OVERRIDE = 17;
    public static final byte DIRECTIONALITY_POP_DIRECTIONAL_FORMAT = 18;
    public static final char MIN_HIGH_SURROGATE = '\uD800';
    public static final char MAX_HIGH_SURROGATE = '\uDBFF';
    public static final char MIN_LOW_SURROGATE  = '\uDC00';
    public static final char MAX_LOW_SURROGATE  = '\uDFFF';
    public static final char MIN_SURROGATE = MIN_HIGH_SURROGATE;
    public static final char MAX_SURROGATE = MAX_LOW_SURROGATE;
    public static final int MIN_SUPPLEMENTARY_CODE_POINT = 0x010000;
    public static final int MIN_CODE_POINT = 0x000000;
    public static final int MAX_CODE_POINT = 0X10FFFF;
    public static final int SIZE = 16;
    public static final int BYTES = SIZE / Byte.SIZE;
    static final int ERROR = 0xFFFFFFFF;
    private static int[] digitMapping;
    private static CharMapping titleCaseMapping;
    private static CharMapping upperCaseMapping;
    private static CharMapping lowerCaseMapping;
    private static UnicodeHelper.Range[] classMapping;
    private final char value;
    private static TCharacter[] characterCache = new TCharacter[128];
    private static final int SURROGATE_NEUTRAL_BIT_MASK = 0xF800;
    private static final int SURROGATE_BITS = 0xD800;
    private static final int SURROGATE_BIT_MASK = 0xFC00;
    private static final int SURROGATE_BIT_INV_MASK = 0x03FF;
    private static final int HIGH_SURROGATE_BITS = 0xD800;
    private static final int LOW_SURROGATE_BITS = 0xDC00;
    private static final int MEANINGFUL_SURROGATE_BITS = 10;

    public TCharacter(char value) {
        this.value = value;
    }

    public char charValue() {
        return value;
    }

    public static TCharacter valueOf(char value) {
        if (value < characterCache.length) {
            TCharacter result = characterCache[value];
            if (result == null) {
                result = new TCharacter(value);
                characterCache[value] = result;
            }
            return result;
        }
        return new TCharacter(value);
    }

    @Override
    public String toString() {
        return toString(value);
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        return other instanceof TCharacter && ((TCharacter) other).value == value;
    }

    @Override
    public int hashCode() {
        return hashCode(value);
    }

    public static int hashCode(char value) {
        return value;
    }

    public static String toString(char c) {
        return new String(new char[] { c });
    }

    public static boolean isValidCodePoint(int codePoint) {
        return codePoint >= 0 && codePoint <= MAX_CODE_POINT;
    }

    public static boolean isBmpCodePoint(int codePoint) {
        return codePoint > 0 && codePoint <= MAX_VALUE;
    }

    public static boolean isSupplementaryCodePoint(int codePoint) {
        return codePoint >= MIN_SUPPLEMENTARY_CODE_POINT && codePoint <= MAX_CODE_POINT;
    }

    public static boolean isHighSurrogate(char ch) {
        return (ch & SURROGATE_BIT_MASK) == HIGH_SURROGATE_BITS;
    }

    public static boolean isLowSurrogate(char ch) {
        return (ch & SURROGATE_BIT_MASK) == LOW_SURROGATE_BITS;
    }

    public static boolean isSurrogate(char ch) {
        return isHighSurrogate(ch) || isLowSurrogate(ch);
    }

    public static boolean isSurrogatePair(char high, char low) {
        return isHighSurrogate(high) && isLowSurrogate(low);
    }

    public static int charCount(int codePoint) {
        return codePoint >= MIN_SUPPLEMENTARY_CODE_POINT ? 2 : 1;
    }

    public static int toCodePoint(char high, char low) {
        return (((high & SURROGATE_BIT_INV_MASK) << MEANINGFUL_SURROGATE_BITS) | (low & SURROGATE_BIT_INV_MASK))
                + MIN_SUPPLEMENTARY_CODE_POINT;
    }

    public static int codePointAt(TCharSequence seq, int index) {
        if (index >= seq.length() - 1 || !isHighSurrogate(seq.charAt(index))
                || !isLowSurrogate(seq.charAt(index + 1))) {
            return seq.charAt(index);
        } else {
            return toCodePoint(seq.charAt(index), seq.charAt(index + 1));
        }
    }

    public static int codePointAt(char[] a, int index) {
        return codePointAt(a, index, a.length);
    }

    public static int codePointAt(char[] a, int index, int limit) {
        if (index >= limit || index < 0 || limit > a.length) {
            throw new IndexOutOfBoundsException();
        }
        if (index >= limit - 1 || !isHighSurrogate(a[index]) || !isLowSurrogate(a[index + 1])) {
            return a[index];
        } else {
            return toCodePoint(a[index], a[index + 1]);
        }
    }

    public static int codePointBefore(TCharSequence seq, int index) {
        if (index == 1 || !isLowSurrogate(seq.charAt(index - 1)) || !isHighSurrogate(seq.charAt(index - 2))) {
            return seq.charAt(index - 1);
        }
        return toCodePoint(seq.charAt(index - 2), seq.charAt(index - 1));
    }

    public static int codePointBefore(char[] a, int index) {
        return codePointBefore(a, index, 0);
    }

    public static int codePointBefore(char[] a, int index, int start) {
        if (index > a.length || index <= start || start < 0) {
            throw new IndexOutOfBoundsException();
        }
        if (index <= start + 1 || !isLowSurrogate(a[index - 1]) || !isHighSurrogate(a[index - 2])) {
            return a[index - 1];
        } else {
            return toCodePoint(a[index - 2], a[index - 1]);
        }
    }

    public static char highSurrogate(int codePoint) {
        codePoint -= MIN_SUPPLEMENTARY_CODE_POINT;
        return (char) (HIGH_SURROGATE_BITS | (codePoint >> MEANINGFUL_SURROGATE_BITS) & SURROGATE_BIT_INV_MASK);
    }

    public static char lowSurrogate(int codePoint) {
        return (char) (LOW_SURROGATE_BITS | codePoint & SURROGATE_BIT_INV_MASK);
    }

    public static char toLowerCase(char ch) {
        return (char) toLowerCase((int) ch);
    }

    public static int toLowerCase(int ch) {
        return mapChar(getLowerCaseMapping(), ch);
    }

    private static CharMapping getLowerCaseMapping() {
        if (lowerCaseMapping == null) {
            lowerCaseMapping = UnicodeHelper.createCharMapping(
                    UnicodeHelper.decodeCaseMapping(acquireLowerCaseMapping().getValue()));
        }
        return lowerCaseMapping;
    }

    private static native StringResource acquireLowerCaseMapping();


    public static char toUpperCase(char ch) {
        return (char) toUpperCase((int) ch);
    }

    public static int toUpperCase(int codePoint) {
        return mapChar(getUpperCaseMapping(), codePoint);
    }

    private static CharMapping getUpperCaseMapping() {
        if (upperCaseMapping == null) {
            upperCaseMapping = UnicodeHelper.createCharMapping(
                    UnicodeHelper.decodeCaseMapping(acquireUpperCaseMapping().getValue()));
        }
        return upperCaseMapping;
    }

    private static native StringResource acquireUpperCaseMapping();

    public static int toTitleCase(int codePoint) {
        codePoint = mapChar(getTitleCaseMapping(), codePoint);
        if (codePoint == codePoint) {
            codePoint = toUpperCase(codePoint);
        }
        return codePoint;
    }

    public static char toTitleCase(char c) {
        return (char) toTitleCase((int) c);
    }

    private static CharMapping getTitleCaseMapping() {
        if (titleCaseMapping == null) {
            titleCaseMapping = UnicodeHelper.createCharMapping(
                    UnicodeHelper.decodeCaseMapping(acquireTitleCaseMapping().getValue()));
        }
        return titleCaseMapping;
    }

    private static native StringResource acquireTitleCaseMapping();

    private static int mapChar(CharMapping table, int codePoint) {
        if (codePoint < table.fastTable.length) {
            return codePoint + table.fastTable[codePoint];
        }

        var binSearchTable = table.binarySearchTable;
        int index = binarySearchTable(binSearchTable, codePoint);
        if (index < 0 || index * 2 >= binSearchTable.length) {
            return 0;
        }
        return codePoint + binSearchTable[index * 2 + 1];
    }

    private static int binarySearchTable(int[] data, int key) {
        int l = 0;
        int u = data.length / 2 - 1;
        while (true) {
            int i = (l + u) / 2;
            int e = data[i * 2];
            if (e == key) {
                return i;
            } else if (e > key) {
                u = i - 1;
                if (u < l) {
                    return i - 1;
                }
            } else {
                l = i + 1;
                if (l > u) {
                    return i;
                }
            }
        }
    }

    public static int digit(char ch, int radix) {
        return digit((int) ch, radix);
    }

    public static int digit(int codePoint, int radix) {
        if (radix < MIN_RADIX || radix > MAX_RADIX) {
            return -1;
        }
        int d = getNumericValue(codePoint);
        return d < radix ? d : -1;
    }

    public static int getNumericValue(char ch) {
        return getNumericValue((int) ch);
    }

    public static int getNumericValue(int codePoint) {
        int[] digitMapping = getDigitMapping();
        int l = 0;
        int u = (digitMapping.length / 2) - 1;
        while (u >= l) {
            int idx = (l + u) / 2;
            int val = digitMapping[idx * 2];
            if (codePoint > val) {
                l = idx + 1;
            } else if (codePoint < val) {
                u = idx - 1;
            } else {
                return digitMapping[idx * 2 + 1];
            }
        }
        return -1;
    }

    public static char forDigit(int digit, int radix) {
        if (radix < MIN_RADIX || radix > MAX_RADIX || digit < 0 || digit >= radix) {
            return '\0';
        }
        return digit < 10 ? (char) ('0' + digit) : (char) ('a' + digit - 10);
    }

    public static boolean isDigit(char ch) {
        return isDigit((int) ch);
    }

    public static boolean isDigit(int codePoint) {
        return getType(codePoint) == DECIMAL_DIGIT_NUMBER;
    }

    private static int[] getDigitMapping() {
        if (digitMapping == null) {
            digitMapping = UnicodeHelper.decodeIntPairsDiff(obtainDigitMapping().getValue());
        }
        return digitMapping;
    }

    private static native StringResource obtainDigitMapping();

    private static UnicodeHelper.Range[] getClasses() {
        if (classMapping == null) {
            classMapping = UnicodeHelper.extractRle(obtainClasses().getValue());
        }
        return classMapping;
    }

    private static native StringResource obtainClasses();

    public static int toChars(int codePoint, char[] dst, int dstIndex) {
        if (!isValidCodePoint(codePoint)) {
            throw new IllegalArgumentException();
        }
        if (codePoint >= MIN_SUPPLEMENTARY_CODE_POINT) {
            dst[dstIndex] = highSurrogate(codePoint);
            dst[dstIndex + 1] = lowSurrogate(codePoint);
            return 2;
        } else {
            dst[dstIndex] = (char) codePoint;
            return 1;
        }
    }

    public static char[] toChars(int codePoint) {
        if (!isValidCodePoint(codePoint)) {
            throw new IllegalArgumentException();
        }
        if (codePoint >= MIN_SUPPLEMENTARY_CODE_POINT) {
            return new char[] { highSurrogate(codePoint), lowSurrogate(codePoint) };
        } else {
            return new char[] { (char) codePoint };
        }
    }

    public static int codePointCount(TCharSequence seq, int beginIndex, int endIndex) {
        Objects.checkFromToIndex(beginIndex, endIndex, seq.length());
        int count = endIndex - beginIndex;
        --endIndex;
        for (int i = beginIndex; i < endIndex; ++i) {
            if (isHighSurrogate(seq.charAt(i)) && isLowSurrogate(seq.charAt(i + 1))) {
                --count;
                ++i;
            }
        }
        return count;
    }

    public static int codePointCount(char[] a, int offset, int count) {
        Objects.checkFromIndexSize(offset, count, a.length);
        int r = count;
        --count;
        for (int i = 0; i < count; ++i) {
            if (isHighSurrogate(a[offset]) && isLowSurrogate(a[offset + i + 1])) {
                --r;
                ++i;
            }
        }
        return r;
    }

    public static int offsetByCodePoints(TCharSequence seq, int index, int codePointOffset) {
        if (codePointOffset >= 0) {
            int i;
            for (i = 0; i < codePointOffset && index < seq.length(); ++i) {
                if (index < seq.length() - 1 && isHighSurrogate(seq.charAt(index))
                        && isLowSurrogate(seq.charAt(index + 1))) {
                    index += 2;
                } else {
                    index++;
                }
            }
            if (i < codePointOffset) {
                throw new IndexOutOfBoundsException();
            }
        } else {
            int i;
            for (i = codePointOffset; i < 0 && index > 0; ++i) {
                if (index > 0 && isLowSurrogate(seq.charAt(index - 1))
                        && isHighSurrogate(seq.charAt(index - 2))) {
                    index -= 2;
                } else {
                    index--;
                }
            }
            if (i < 0) {
                throw new IndexOutOfBoundsException();
            }
        }
        return index;
    }

    public static int offsetByCodePoints(char[] a, int start, int count, int index, int codePointOffset) {
        if (count > a.length - start || start < 0 || count < 0
                || index < start || index > start + count) {
            throw new IndexOutOfBoundsException();
        }
        if (codePointOffset >= 0) {
            int i;
            for (i = 0; i < codePointOffset && index < start + count; ++i) {
                if (index < count - 1 && isHighSurrogate(a[index])
                        && isLowSurrogate(a[index + 1])) {
                    index += 2;
                } else {
                    index++;
                }
            }
            if (i < codePointOffset) {
                throw new IndexOutOfBoundsException();
            }
        } else {
            int i;
            for (i = codePointOffset; i < 0 && index > start; ++i) {
                if (index > start && isLowSurrogate(a[index - 1])
                        && isHighSurrogate(a[index - 2])) {
                    index -= 2;
                } else {
                    index--;
                }
            }
            if (i < 0) {
                throw new IndexOutOfBoundsException();
            }
        }
        return index;
    }

    public static boolean isISOControl(char ch) {
        return isISOControl((int) ch);
    }

    public static boolean isISOControl(int codePoint) {
        return codePoint >= 0 && codePoint <= 0x1F || codePoint >= 0x7F && codePoint <= 0x9F;
    }

    public static int getType(char c) {
        return getType((int) c);
    }

    public static int getType(int codePoint) {
        if (isBmpCodePoint(codePoint) && isSurrogate((char) codePoint)) {
            return SURROGATE;
        }
        UnicodeHelper.Range[] classes = getClasses();
        int l = 0;
        int u = classes.length - 1;
        while (l <= u) {
            int i = (l + u) / 2;
            UnicodeHelper.Range range = classes[i];
            if (codePoint >= range.end) {
                l = i + 1;
            } else if (codePoint < range.start) {
                u = i - 1;
            } else {
                return range.data[codePoint - range.start];
            }
        }
        return 0;
    }

    public static boolean isLowerCase(char ch) {
        return isLowerCase((int) ch);
    }

    public static boolean isLowerCase(int codePoint) {
        return getType(codePoint) == LOWERCASE_LETTER;
    }

    public static boolean isUpperCase(char ch) {
        return isUpperCase((int) ch);
    }

    public static boolean isUpperCase(int codePoint) {
        return getType(codePoint) == UPPERCASE_LETTER;
    }

    public static boolean isTitleCase(char ch) {
        return isTitleCase((int) ch);
    }

    public static boolean isTitleCase(int codePoint) {
        return getType(codePoint) == TITLECASE_LETTER;
    }

    public static boolean isDefined(char ch) {
        return isDefined((int) ch);
    }

    public static boolean isDefined(int codePoint) {
        return getType(codePoint) != UNASSIGNED;
    }

    public static boolean isLetter(char ch) {
        return isLetter((int) ch);
    }

    public static boolean isLetter(int codePoint) {
        switch (getType(codePoint)) {
            case UPPERCASE_LETTER:
            case LOWERCASE_LETTER:
            case TITLECASE_LETTER:
            case MODIFIER_LETTER:
            case OTHER_LETTER:
                return true;
            default:
                return false;
        }
    }

    public static boolean isLetterOrDigit(char ch) {
        return isLetterOrDigit((int) ch);
    }

    public static boolean isLetterOrDigit(int codePoint) {
        switch (getType(codePoint)) {
            case UPPERCASE_LETTER:
            case LOWERCASE_LETTER:
            case TITLECASE_LETTER:
            case MODIFIER_LETTER:
            case OTHER_LETTER:
            case DECIMAL_DIGIT_NUMBER:
                return true;
            default:
                return false;
        }
    }

    @Deprecated
    public static boolean isJavaLetter(char ch) {
        return isJavaIdentifierStart(ch);
    }

    public static boolean isJavaIdentifierStart(char ch) {
        return isJavaIdentifierStart((int) ch);
    }

    public static boolean isJavaIdentifierStart(int codePoint) {
        switch (getType(codePoint)) {
            case UPPERCASE_LETTER:
            case LOWERCASE_LETTER:
            case TITLECASE_LETTER:
            case MODIFIER_LETTER:
            case OTHER_LETTER:
            case LETTER_NUMBER:
            case CONNECTOR_PUNCTUATION:
            case CURRENCY_SYMBOL:
                return true;
            default:
                return isIdentifierIgnorable(codePoint);
        }
    }

    @Deprecated
    public static boolean isJavaLetterOrDigit(char ch) {
        return isJavaIdentifierPart(ch);
    }

    public static boolean isJavaIdentifierPart(char ch) {
        return isJavaIdentifierPart((int) ch);
    }

    public static boolean isJavaIdentifierPart(int codePoint) {
        switch (getType(codePoint)) {
            case UPPERCASE_LETTER:
            case LOWERCASE_LETTER:
            case TITLECASE_LETTER:
            case MODIFIER_LETTER:
            case OTHER_LETTER:
            case LETTER_NUMBER:
            case DECIMAL_DIGIT_NUMBER:
            case COMBINING_SPACING_MARK:
            case NON_SPACING_MARK:
            case CONNECTOR_PUNCTUATION:
            case CURRENCY_SYMBOL:
                return true;
            default:
                return isIdentifierIgnorable(codePoint);
        }
    }

    public static boolean isAlphabetic(int codePoint) {
        switch (getType(codePoint)) {
            case UPPERCASE_LETTER:
            case LOWERCASE_LETTER:
            case TITLECASE_LETTER:
            case MODIFIER_LETTER:
            case OTHER_LETTER:
            case LETTER_NUMBER:
                return true;
            default:
                return false;
        }
    }

    public static boolean isUnicodeIdentifierStart(char ch) {
        return isUnicodeIdentifierStart((int) ch);
    }

    public static boolean isUnicodeIdentifierStart(int codePoint) {
        switch (getType(codePoint)) {
            case UPPERCASE_LETTER:
            case LOWERCASE_LETTER:
            case TITLECASE_LETTER:
            case MODIFIER_LETTER:
            case OTHER_LETTER:
            case LETTER_NUMBER:
                return true;
            default:
                return isIdentifierIgnorable(codePoint);
        }
    }

    public static boolean isUnicodeIdentifierPart(char ch) {
        return isUnicodeIdentifierPart((int) ch);
    }

    public static boolean isUnicodeIdentifierPart(int codePoint) {
        switch (getType(codePoint)) {
            case UPPERCASE_LETTER:
            case LOWERCASE_LETTER:
            case TITLECASE_LETTER:
            case MODIFIER_LETTER:
            case OTHER_LETTER:
            case LETTER_NUMBER:
            case CONNECTOR_PUNCTUATION:
            case DECIMAL_DIGIT_NUMBER:
            case COMBINING_SPACING_MARK:
            case NON_SPACING_MARK:
                return true;
            default:
                return isIdentifierIgnorable(codePoint);
        }
    }

    public static boolean isIdentifierIgnorable(char ch) {
        return isIdentifierIgnorable((int) ch);
    }

    public static boolean isIdentifierIgnorable(int codePoint) {
        if (codePoint >= 0x00 && codePoint <= 0x08 || codePoint >= 0x0E && codePoint <= 0x1B
                || codePoint >= 0x7F && codePoint <= 0x9F) {
            return true;
        }
        return getType(codePoint) == FORMAT;
    }

    @Deprecated
    public static boolean isSpace(char ch) {
        switch (ch) {
            case '\t':
            case '\n':
            case '\f':
            case '\r':
            case ' ':
                return true;
            default:
                return false;
        }
    }

    public static boolean isSpaceChar(char ch) {
        return isSpaceChar((int) ch);
    }

    public static boolean isSpaceChar(int codePoint) {
        switch (getType(codePoint)) {
            case SPACE_SEPARATOR:
            case LINE_SEPARATOR:
            case PARAGRAPH_SEPARATOR:
                return true;
            default:
                return false;
        }
    }

    public static boolean isWhitespace(char ch) {
        return isWhitespace((int) ch);
    }

    public static boolean isWhitespace(int codePoint) {
        switch (codePoint) {
            case '\t':
            case '\n':
            case 0xB:
            case '\f':
            case '\r':
            case 0x1C:
            case 0x1D:
            case 0x1E:
            case 0x1F:
                return true;
            case 0xA0:
            case 0x2007:
            case 0x202F:
                return false;
            default:
                return isSpaceChar(codePoint);
        }
    }

    // TODO: public static byte getDirectionality(char ch)
    // TODO: public static boolean isMirrored(char ch)

    @Override
    public int compareTo(TCharacter anotherCharacter) {
        return compare(value, anotherCharacter.value);
    }

    public static int compare(char x, char y) {
        return x - y;
    }

    public static char reverseBytes(char ch) {
        return (char) (((ch & 0xFF00) >> 8) | (ch << 8));
    }

    // ----- Character.Subset / Character.UnicodeBlock ----------------------------------------------
    //
    // Fork addition: TeaVM 0.14.1's class library has neither type, so any program touching
    // Character.UnicodeBlock fails to compile ("cannot find symbol: variable UnicodeBlock"). The
    // block names and code-point ranges are data; they are generated from the running JDK by
    // scripts/gen-unicode-blocks.java (see patches/README.md) so that of() matches the JDK exactly,
    // including the code points that fall in no block. Everything outside the marked region is
    // hand-written.

    public static class Subset extends TObject {
        private final String name;

        protected Subset(String name) {
            this.name = name;
        }

        @Override
        public final boolean equals(Object obj) {
            // Identity, like the JDK: Character.Subset is not a value type, and two distinct
            // Subsets with the same name are *not* equal (measured against the JDK).
            return this == obj;
        }

        @Override
        public final int hashCode() {
            return super.hashCode();
        }

        @Override
        public final String toString() {
            return name;
        }
    }

    public static final class UnicodeBlock extends Subset {
    // ---- generated by scripts/gen-unicode-blocks.java - do not edit by hand ----

    public static final UnicodeBlock ADLAM = new UnicodeBlock("ADLAM");
    public static final UnicodeBlock AEGEAN_NUMBERS = new UnicodeBlock("AEGEAN_NUMBERS");
    public static final UnicodeBlock AHOM = new UnicodeBlock("AHOM");
    public static final UnicodeBlock ALCHEMICAL_SYMBOLS = new UnicodeBlock("ALCHEMICAL_SYMBOLS");
    public static final UnicodeBlock ALPHABETIC_PRESENTATION_FORMS = new UnicodeBlock("ALPHABETIC_PRESENTATION_FORMS");
    public static final UnicodeBlock ANATOLIAN_HIEROGLYPHS = new UnicodeBlock("ANATOLIAN_HIEROGLYPHS");
    public static final UnicodeBlock ANCIENT_GREEK_MUSICAL_NOTATION = new UnicodeBlock("ANCIENT_GREEK_MUSICAL_NOTATION");
    public static final UnicodeBlock ANCIENT_GREEK_NUMBERS = new UnicodeBlock("ANCIENT_GREEK_NUMBERS");
    public static final UnicodeBlock ANCIENT_SYMBOLS = new UnicodeBlock("ANCIENT_SYMBOLS");
    public static final UnicodeBlock ARABIC = new UnicodeBlock("ARABIC");
    public static final UnicodeBlock ARABIC_EXTENDED_A = new UnicodeBlock("ARABIC_EXTENDED_A");
    public static final UnicodeBlock ARABIC_EXTENDED_B = new UnicodeBlock("ARABIC_EXTENDED_B");
    public static final UnicodeBlock ARABIC_EXTENDED_C = new UnicodeBlock("ARABIC_EXTENDED_C");
    public static final UnicodeBlock ARABIC_MATHEMATICAL_ALPHABETIC_SYMBOLS = new UnicodeBlock("ARABIC_MATHEMATICAL_ALPHABETIC_SYMBOLS");
    public static final UnicodeBlock ARABIC_PRESENTATION_FORMS_A = new UnicodeBlock("ARABIC_PRESENTATION_FORMS_A");
    public static final UnicodeBlock ARABIC_PRESENTATION_FORMS_B = new UnicodeBlock("ARABIC_PRESENTATION_FORMS_B");
    public static final UnicodeBlock ARABIC_SUPPLEMENT = new UnicodeBlock("ARABIC_SUPPLEMENT");
    public static final UnicodeBlock ARMENIAN = new UnicodeBlock("ARMENIAN");
    public static final UnicodeBlock ARROWS = new UnicodeBlock("ARROWS");
    public static final UnicodeBlock AVESTAN = new UnicodeBlock("AVESTAN");
    public static final UnicodeBlock BALINESE = new UnicodeBlock("BALINESE");
    public static final UnicodeBlock BAMUM = new UnicodeBlock("BAMUM");
    public static final UnicodeBlock BAMUM_SUPPLEMENT = new UnicodeBlock("BAMUM_SUPPLEMENT");
    public static final UnicodeBlock BASIC_LATIN = new UnicodeBlock("BASIC_LATIN");
    public static final UnicodeBlock BASSA_VAH = new UnicodeBlock("BASSA_VAH");
    public static final UnicodeBlock BATAK = new UnicodeBlock("BATAK");
    public static final UnicodeBlock BENGALI = new UnicodeBlock("BENGALI");
    public static final UnicodeBlock BHAIKSUKI = new UnicodeBlock("BHAIKSUKI");
    public static final UnicodeBlock BLOCK_ELEMENTS = new UnicodeBlock("BLOCK_ELEMENTS");
    public static final UnicodeBlock BOPOMOFO = new UnicodeBlock("BOPOMOFO");
    public static final UnicodeBlock BOPOMOFO_EXTENDED = new UnicodeBlock("BOPOMOFO_EXTENDED");
    public static final UnicodeBlock BOX_DRAWING = new UnicodeBlock("BOX_DRAWING");
    public static final UnicodeBlock BRAHMI = new UnicodeBlock("BRAHMI");
    public static final UnicodeBlock BRAILLE_PATTERNS = new UnicodeBlock("BRAILLE_PATTERNS");
    public static final UnicodeBlock BUGINESE = new UnicodeBlock("BUGINESE");
    public static final UnicodeBlock BUHID = new UnicodeBlock("BUHID");
    public static final UnicodeBlock BYZANTINE_MUSICAL_SYMBOLS = new UnicodeBlock("BYZANTINE_MUSICAL_SYMBOLS");
    public static final UnicodeBlock CARIAN = new UnicodeBlock("CARIAN");
    public static final UnicodeBlock CAUCASIAN_ALBANIAN = new UnicodeBlock("CAUCASIAN_ALBANIAN");
    public static final UnicodeBlock CHAKMA = new UnicodeBlock("CHAKMA");
    public static final UnicodeBlock CHAM = new UnicodeBlock("CHAM");
    public static final UnicodeBlock CHEROKEE = new UnicodeBlock("CHEROKEE");
    public static final UnicodeBlock CHEROKEE_SUPPLEMENT = new UnicodeBlock("CHEROKEE_SUPPLEMENT");
    public static final UnicodeBlock CHESS_SYMBOLS = new UnicodeBlock("CHESS_SYMBOLS");
    public static final UnicodeBlock CHORASMIAN = new UnicodeBlock("CHORASMIAN");
    public static final UnicodeBlock CJK_COMPATIBILITY = new UnicodeBlock("CJK_COMPATIBILITY");
    public static final UnicodeBlock CJK_COMPATIBILITY_FORMS = new UnicodeBlock("CJK_COMPATIBILITY_FORMS");
    public static final UnicodeBlock CJK_COMPATIBILITY_IDEOGRAPHS = new UnicodeBlock("CJK_COMPATIBILITY_IDEOGRAPHS");
    public static final UnicodeBlock CJK_COMPATIBILITY_IDEOGRAPHS_SUPPLEMENT = new UnicodeBlock("CJK_COMPATIBILITY_IDEOGRAPHS_SUPPLEMENT");
    public static final UnicodeBlock CJK_RADICALS_SUPPLEMENT = new UnicodeBlock("CJK_RADICALS_SUPPLEMENT");
    public static final UnicodeBlock CJK_STROKES = new UnicodeBlock("CJK_STROKES");
    public static final UnicodeBlock CJK_SYMBOLS_AND_PUNCTUATION = new UnicodeBlock("CJK_SYMBOLS_AND_PUNCTUATION");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS_EXTENSION_C = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS_EXTENSION_C");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS_EXTENSION_D = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS_EXTENSION_D");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS_EXTENSION_E = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS_EXTENSION_E");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS_EXTENSION_F = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS_EXTENSION_F");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS_EXTENSION_G = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS_EXTENSION_G");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS_EXTENSION_H = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS_EXTENSION_H");
    public static final UnicodeBlock CJK_UNIFIED_IDEOGRAPHS_EXTENSION_I = new UnicodeBlock("CJK_UNIFIED_IDEOGRAPHS_EXTENSION_I");
    public static final UnicodeBlock COMBINING_DIACRITICAL_MARKS = new UnicodeBlock("COMBINING_DIACRITICAL_MARKS");
    public static final UnicodeBlock COMBINING_DIACRITICAL_MARKS_EXTENDED = new UnicodeBlock("COMBINING_DIACRITICAL_MARKS_EXTENDED");
    public static final UnicodeBlock COMBINING_DIACRITICAL_MARKS_SUPPLEMENT = new UnicodeBlock("COMBINING_DIACRITICAL_MARKS_SUPPLEMENT");
    public static final UnicodeBlock COMBINING_HALF_MARKS = new UnicodeBlock("COMBINING_HALF_MARKS");
    public static final UnicodeBlock COMBINING_MARKS_FOR_SYMBOLS = new UnicodeBlock("COMBINING_MARKS_FOR_SYMBOLS");
    public static final UnicodeBlock COMMON_INDIC_NUMBER_FORMS = new UnicodeBlock("COMMON_INDIC_NUMBER_FORMS");
    public static final UnicodeBlock CONTROL_PICTURES = new UnicodeBlock("CONTROL_PICTURES");
    public static final UnicodeBlock COPTIC = new UnicodeBlock("COPTIC");
    public static final UnicodeBlock COPTIC_EPACT_NUMBERS = new UnicodeBlock("COPTIC_EPACT_NUMBERS");
    public static final UnicodeBlock COUNTING_ROD_NUMERALS = new UnicodeBlock("COUNTING_ROD_NUMERALS");
    public static final UnicodeBlock CUNEIFORM = new UnicodeBlock("CUNEIFORM");
    public static final UnicodeBlock CUNEIFORM_NUMBERS_AND_PUNCTUATION = new UnicodeBlock("CUNEIFORM_NUMBERS_AND_PUNCTUATION");
    public static final UnicodeBlock CURRENCY_SYMBOLS = new UnicodeBlock("CURRENCY_SYMBOLS");
    public static final UnicodeBlock CYPRIOT_SYLLABARY = new UnicodeBlock("CYPRIOT_SYLLABARY");
    public static final UnicodeBlock CYPRO_MINOAN = new UnicodeBlock("CYPRO_MINOAN");
    public static final UnicodeBlock CYRILLIC = new UnicodeBlock("CYRILLIC");
    public static final UnicodeBlock CYRILLIC_EXTENDED_A = new UnicodeBlock("CYRILLIC_EXTENDED_A");
    public static final UnicodeBlock CYRILLIC_EXTENDED_B = new UnicodeBlock("CYRILLIC_EXTENDED_B");
    public static final UnicodeBlock CYRILLIC_EXTENDED_C = new UnicodeBlock("CYRILLIC_EXTENDED_C");
    public static final UnicodeBlock CYRILLIC_EXTENDED_D = new UnicodeBlock("CYRILLIC_EXTENDED_D");
    public static final UnicodeBlock CYRILLIC_SUPPLEMENTARY = new UnicodeBlock("CYRILLIC_SUPPLEMENTARY");
    public static final UnicodeBlock DESERET = new UnicodeBlock("DESERET");
    public static final UnicodeBlock DEVANAGARI = new UnicodeBlock("DEVANAGARI");
    public static final UnicodeBlock DEVANAGARI_EXTENDED = new UnicodeBlock("DEVANAGARI_EXTENDED");
    public static final UnicodeBlock DEVANAGARI_EXTENDED_A = new UnicodeBlock("DEVANAGARI_EXTENDED_A");
    public static final UnicodeBlock DINGBATS = new UnicodeBlock("DINGBATS");
    public static final UnicodeBlock DIVES_AKURU = new UnicodeBlock("DIVES_AKURU");
    public static final UnicodeBlock DOGRA = new UnicodeBlock("DOGRA");
    public static final UnicodeBlock DOMINO_TILES = new UnicodeBlock("DOMINO_TILES");
    public static final UnicodeBlock DUPLOYAN = new UnicodeBlock("DUPLOYAN");
    public static final UnicodeBlock EARLY_DYNASTIC_CUNEIFORM = new UnicodeBlock("EARLY_DYNASTIC_CUNEIFORM");
    public static final UnicodeBlock EGYPTIAN_HIEROGLYPHS = new UnicodeBlock("EGYPTIAN_HIEROGLYPHS");
    public static final UnicodeBlock EGYPTIAN_HIEROGLYPHS_EXTENDED_A = new UnicodeBlock("EGYPTIAN_HIEROGLYPHS_EXTENDED_A");
    public static final UnicodeBlock EGYPTIAN_HIEROGLYPH_FORMAT_CONTROLS = new UnicodeBlock("EGYPTIAN_HIEROGLYPH_FORMAT_CONTROLS");
    public static final UnicodeBlock ELBASAN = new UnicodeBlock("ELBASAN");
    public static final UnicodeBlock ELYMAIC = new UnicodeBlock("ELYMAIC");
    public static final UnicodeBlock EMOTICONS = new UnicodeBlock("EMOTICONS");
    public static final UnicodeBlock ENCLOSED_ALPHANUMERICS = new UnicodeBlock("ENCLOSED_ALPHANUMERICS");
    public static final UnicodeBlock ENCLOSED_ALPHANUMERIC_SUPPLEMENT = new UnicodeBlock("ENCLOSED_ALPHANUMERIC_SUPPLEMENT");
    public static final UnicodeBlock ENCLOSED_CJK_LETTERS_AND_MONTHS = new UnicodeBlock("ENCLOSED_CJK_LETTERS_AND_MONTHS");
    public static final UnicodeBlock ENCLOSED_IDEOGRAPHIC_SUPPLEMENT = new UnicodeBlock("ENCLOSED_IDEOGRAPHIC_SUPPLEMENT");
    public static final UnicodeBlock ETHIOPIC = new UnicodeBlock("ETHIOPIC");
    public static final UnicodeBlock ETHIOPIC_EXTENDED = new UnicodeBlock("ETHIOPIC_EXTENDED");
    public static final UnicodeBlock ETHIOPIC_EXTENDED_A = new UnicodeBlock("ETHIOPIC_EXTENDED_A");
    public static final UnicodeBlock ETHIOPIC_EXTENDED_B = new UnicodeBlock("ETHIOPIC_EXTENDED_B");
    public static final UnicodeBlock ETHIOPIC_SUPPLEMENT = new UnicodeBlock("ETHIOPIC_SUPPLEMENT");
    public static final UnicodeBlock GARAY = new UnicodeBlock("GARAY");
    public static final UnicodeBlock GENERAL_PUNCTUATION = new UnicodeBlock("GENERAL_PUNCTUATION");
    public static final UnicodeBlock GEOMETRIC_SHAPES = new UnicodeBlock("GEOMETRIC_SHAPES");
    public static final UnicodeBlock GEOMETRIC_SHAPES_EXTENDED = new UnicodeBlock("GEOMETRIC_SHAPES_EXTENDED");
    public static final UnicodeBlock GEORGIAN = new UnicodeBlock("GEORGIAN");
    public static final UnicodeBlock GEORGIAN_EXTENDED = new UnicodeBlock("GEORGIAN_EXTENDED");
    public static final UnicodeBlock GEORGIAN_SUPPLEMENT = new UnicodeBlock("GEORGIAN_SUPPLEMENT");
    public static final UnicodeBlock GLAGOLITIC = new UnicodeBlock("GLAGOLITIC");
    public static final UnicodeBlock GLAGOLITIC_SUPPLEMENT = new UnicodeBlock("GLAGOLITIC_SUPPLEMENT");
    public static final UnicodeBlock GOTHIC = new UnicodeBlock("GOTHIC");
    public static final UnicodeBlock GRANTHA = new UnicodeBlock("GRANTHA");
    public static final UnicodeBlock GREEK = new UnicodeBlock("GREEK");
    public static final UnicodeBlock GREEK_EXTENDED = new UnicodeBlock("GREEK_EXTENDED");
    public static final UnicodeBlock GUJARATI = new UnicodeBlock("GUJARATI");
    public static final UnicodeBlock GUNJALA_GONDI = new UnicodeBlock("GUNJALA_GONDI");
    public static final UnicodeBlock GURMUKHI = new UnicodeBlock("GURMUKHI");
    public static final UnicodeBlock GURUNG_KHEMA = new UnicodeBlock("GURUNG_KHEMA");
    public static final UnicodeBlock HALFWIDTH_AND_FULLWIDTH_FORMS = new UnicodeBlock("HALFWIDTH_AND_FULLWIDTH_FORMS");
    public static final UnicodeBlock HANGUL_COMPATIBILITY_JAMO = new UnicodeBlock("HANGUL_COMPATIBILITY_JAMO");
    public static final UnicodeBlock HANGUL_JAMO = new UnicodeBlock("HANGUL_JAMO");
    public static final UnicodeBlock HANGUL_JAMO_EXTENDED_A = new UnicodeBlock("HANGUL_JAMO_EXTENDED_A");
    public static final UnicodeBlock HANGUL_JAMO_EXTENDED_B = new UnicodeBlock("HANGUL_JAMO_EXTENDED_B");
    public static final UnicodeBlock HANGUL_SYLLABLES = new UnicodeBlock("HANGUL_SYLLABLES");
    public static final UnicodeBlock HANIFI_ROHINGYA = new UnicodeBlock("HANIFI_ROHINGYA");
    public static final UnicodeBlock HANUNOO = new UnicodeBlock("HANUNOO");
    public static final UnicodeBlock HATRAN = new UnicodeBlock("HATRAN");
    public static final UnicodeBlock HEBREW = new UnicodeBlock("HEBREW");
    public static final UnicodeBlock HIGH_PRIVATE_USE_SURROGATES = new UnicodeBlock("HIGH_PRIVATE_USE_SURROGATES");
    public static final UnicodeBlock HIGH_SURROGATES = new UnicodeBlock("HIGH_SURROGATES");
    public static final UnicodeBlock HIRAGANA = new UnicodeBlock("HIRAGANA");
    public static final UnicodeBlock IDEOGRAPHIC_DESCRIPTION_CHARACTERS = new UnicodeBlock("IDEOGRAPHIC_DESCRIPTION_CHARACTERS");
    public static final UnicodeBlock IDEOGRAPHIC_SYMBOLS_AND_PUNCTUATION = new UnicodeBlock("IDEOGRAPHIC_SYMBOLS_AND_PUNCTUATION");
    public static final UnicodeBlock IMPERIAL_ARAMAIC = new UnicodeBlock("IMPERIAL_ARAMAIC");
    public static final UnicodeBlock INDIC_SIYAQ_NUMBERS = new UnicodeBlock("INDIC_SIYAQ_NUMBERS");
    public static final UnicodeBlock INSCRIPTIONAL_PAHLAVI = new UnicodeBlock("INSCRIPTIONAL_PAHLAVI");
    public static final UnicodeBlock INSCRIPTIONAL_PARTHIAN = new UnicodeBlock("INSCRIPTIONAL_PARTHIAN");
    public static final UnicodeBlock IPA_EXTENSIONS = new UnicodeBlock("IPA_EXTENSIONS");
    public static final UnicodeBlock JAVANESE = new UnicodeBlock("JAVANESE");
    public static final UnicodeBlock KAITHI = new UnicodeBlock("KAITHI");
    public static final UnicodeBlock KAKTOVIK_NUMERALS = new UnicodeBlock("KAKTOVIK_NUMERALS");
    public static final UnicodeBlock KANA_EXTENDED_A = new UnicodeBlock("KANA_EXTENDED_A");
    public static final UnicodeBlock KANA_EXTENDED_B = new UnicodeBlock("KANA_EXTENDED_B");
    public static final UnicodeBlock KANA_SUPPLEMENT = new UnicodeBlock("KANA_SUPPLEMENT");
    public static final UnicodeBlock KANBUN = new UnicodeBlock("KANBUN");
    public static final UnicodeBlock KANGXI_RADICALS = new UnicodeBlock("KANGXI_RADICALS");
    public static final UnicodeBlock KANNADA = new UnicodeBlock("KANNADA");
    public static final UnicodeBlock KATAKANA = new UnicodeBlock("KATAKANA");
    public static final UnicodeBlock KATAKANA_PHONETIC_EXTENSIONS = new UnicodeBlock("KATAKANA_PHONETIC_EXTENSIONS");
    public static final UnicodeBlock KAWI = new UnicodeBlock("KAWI");
    public static final UnicodeBlock KAYAH_LI = new UnicodeBlock("KAYAH_LI");
    public static final UnicodeBlock KHAROSHTHI = new UnicodeBlock("KHAROSHTHI");
    public static final UnicodeBlock KHITAN_SMALL_SCRIPT = new UnicodeBlock("KHITAN_SMALL_SCRIPT");
    public static final UnicodeBlock KHMER = new UnicodeBlock("KHMER");
    public static final UnicodeBlock KHMER_SYMBOLS = new UnicodeBlock("KHMER_SYMBOLS");
    public static final UnicodeBlock KHOJKI = new UnicodeBlock("KHOJKI");
    public static final UnicodeBlock KHUDAWADI = new UnicodeBlock("KHUDAWADI");
    public static final UnicodeBlock KIRAT_RAI = new UnicodeBlock("KIRAT_RAI");
    public static final UnicodeBlock LAO = new UnicodeBlock("LAO");
    public static final UnicodeBlock LATIN_1_SUPPLEMENT = new UnicodeBlock("LATIN_1_SUPPLEMENT");
    public static final UnicodeBlock LATIN_EXTENDED_A = new UnicodeBlock("LATIN_EXTENDED_A");
    public static final UnicodeBlock LATIN_EXTENDED_ADDITIONAL = new UnicodeBlock("LATIN_EXTENDED_ADDITIONAL");
    public static final UnicodeBlock LATIN_EXTENDED_B = new UnicodeBlock("LATIN_EXTENDED_B");
    public static final UnicodeBlock LATIN_EXTENDED_C = new UnicodeBlock("LATIN_EXTENDED_C");
    public static final UnicodeBlock LATIN_EXTENDED_D = new UnicodeBlock("LATIN_EXTENDED_D");
    public static final UnicodeBlock LATIN_EXTENDED_E = new UnicodeBlock("LATIN_EXTENDED_E");
    public static final UnicodeBlock LATIN_EXTENDED_F = new UnicodeBlock("LATIN_EXTENDED_F");
    public static final UnicodeBlock LATIN_EXTENDED_G = new UnicodeBlock("LATIN_EXTENDED_G");
    public static final UnicodeBlock LEPCHA = new UnicodeBlock("LEPCHA");
    public static final UnicodeBlock LETTERLIKE_SYMBOLS = new UnicodeBlock("LETTERLIKE_SYMBOLS");
    public static final UnicodeBlock LIMBU = new UnicodeBlock("LIMBU");
    public static final UnicodeBlock LINEAR_A = new UnicodeBlock("LINEAR_A");
    public static final UnicodeBlock LINEAR_B_IDEOGRAMS = new UnicodeBlock("LINEAR_B_IDEOGRAMS");
    public static final UnicodeBlock LINEAR_B_SYLLABARY = new UnicodeBlock("LINEAR_B_SYLLABARY");
    public static final UnicodeBlock LISU = new UnicodeBlock("LISU");
    public static final UnicodeBlock LISU_SUPPLEMENT = new UnicodeBlock("LISU_SUPPLEMENT");
    public static final UnicodeBlock LOW_SURROGATES = new UnicodeBlock("LOW_SURROGATES");
    public static final UnicodeBlock LYCIAN = new UnicodeBlock("LYCIAN");
    public static final UnicodeBlock LYDIAN = new UnicodeBlock("LYDIAN");
    public static final UnicodeBlock MAHAJANI = new UnicodeBlock("MAHAJANI");
    public static final UnicodeBlock MAHJONG_TILES = new UnicodeBlock("MAHJONG_TILES");
    public static final UnicodeBlock MAKASAR = new UnicodeBlock("MAKASAR");
    public static final UnicodeBlock MALAYALAM = new UnicodeBlock("MALAYALAM");
    public static final UnicodeBlock MANDAIC = new UnicodeBlock("MANDAIC");
    public static final UnicodeBlock MANICHAEAN = new UnicodeBlock("MANICHAEAN");
    public static final UnicodeBlock MARCHEN = new UnicodeBlock("MARCHEN");
    public static final UnicodeBlock MASARAM_GONDI = new UnicodeBlock("MASARAM_GONDI");
    public static final UnicodeBlock MATHEMATICAL_ALPHANUMERIC_SYMBOLS = new UnicodeBlock("MATHEMATICAL_ALPHANUMERIC_SYMBOLS");
    public static final UnicodeBlock MATHEMATICAL_OPERATORS = new UnicodeBlock("MATHEMATICAL_OPERATORS");
    public static final UnicodeBlock MAYAN_NUMERALS = new UnicodeBlock("MAYAN_NUMERALS");
    public static final UnicodeBlock MEDEFAIDRIN = new UnicodeBlock("MEDEFAIDRIN");
    public static final UnicodeBlock MEETEI_MAYEK = new UnicodeBlock("MEETEI_MAYEK");
    public static final UnicodeBlock MEETEI_MAYEK_EXTENSIONS = new UnicodeBlock("MEETEI_MAYEK_EXTENSIONS");
    public static final UnicodeBlock MENDE_KIKAKUI = new UnicodeBlock("MENDE_KIKAKUI");
    public static final UnicodeBlock MEROITIC_CURSIVE = new UnicodeBlock("MEROITIC_CURSIVE");
    public static final UnicodeBlock MEROITIC_HIEROGLYPHS = new UnicodeBlock("MEROITIC_HIEROGLYPHS");
    public static final UnicodeBlock MIAO = new UnicodeBlock("MIAO");
    public static final UnicodeBlock MISCELLANEOUS_MATHEMATICAL_SYMBOLS_A = new UnicodeBlock("MISCELLANEOUS_MATHEMATICAL_SYMBOLS_A");
    public static final UnicodeBlock MISCELLANEOUS_MATHEMATICAL_SYMBOLS_B = new UnicodeBlock("MISCELLANEOUS_MATHEMATICAL_SYMBOLS_B");
    public static final UnicodeBlock MISCELLANEOUS_SYMBOLS = new UnicodeBlock("MISCELLANEOUS_SYMBOLS");
    public static final UnicodeBlock MISCELLANEOUS_SYMBOLS_AND_ARROWS = new UnicodeBlock("MISCELLANEOUS_SYMBOLS_AND_ARROWS");
    public static final UnicodeBlock MISCELLANEOUS_SYMBOLS_AND_PICTOGRAPHS = new UnicodeBlock("MISCELLANEOUS_SYMBOLS_AND_PICTOGRAPHS");
    public static final UnicodeBlock MISCELLANEOUS_TECHNICAL = new UnicodeBlock("MISCELLANEOUS_TECHNICAL");
    public static final UnicodeBlock MODI = new UnicodeBlock("MODI");
    public static final UnicodeBlock MODIFIER_TONE_LETTERS = new UnicodeBlock("MODIFIER_TONE_LETTERS");
    public static final UnicodeBlock MONGOLIAN = new UnicodeBlock("MONGOLIAN");
    public static final UnicodeBlock MONGOLIAN_SUPPLEMENT = new UnicodeBlock("MONGOLIAN_SUPPLEMENT");
    public static final UnicodeBlock MRO = new UnicodeBlock("MRO");
    public static final UnicodeBlock MULTANI = new UnicodeBlock("MULTANI");
    public static final UnicodeBlock MUSICAL_SYMBOLS = new UnicodeBlock("MUSICAL_SYMBOLS");
    public static final UnicodeBlock MYANMAR = new UnicodeBlock("MYANMAR");
    public static final UnicodeBlock MYANMAR_EXTENDED_A = new UnicodeBlock("MYANMAR_EXTENDED_A");
    public static final UnicodeBlock MYANMAR_EXTENDED_B = new UnicodeBlock("MYANMAR_EXTENDED_B");
    public static final UnicodeBlock MYANMAR_EXTENDED_C = new UnicodeBlock("MYANMAR_EXTENDED_C");
    public static final UnicodeBlock NABATAEAN = new UnicodeBlock("NABATAEAN");
    public static final UnicodeBlock NAG_MUNDARI = new UnicodeBlock("NAG_MUNDARI");
    public static final UnicodeBlock NANDINAGARI = new UnicodeBlock("NANDINAGARI");
    public static final UnicodeBlock NEWA = new UnicodeBlock("NEWA");
    public static final UnicodeBlock NEW_TAI_LUE = new UnicodeBlock("NEW_TAI_LUE");
    public static final UnicodeBlock NKO = new UnicodeBlock("NKO");
    public static final UnicodeBlock NUMBER_FORMS = new UnicodeBlock("NUMBER_FORMS");
    public static final UnicodeBlock NUSHU = new UnicodeBlock("NUSHU");
    public static final UnicodeBlock NYIAKENG_PUACHUE_HMONG = new UnicodeBlock("NYIAKENG_PUACHUE_HMONG");
    public static final UnicodeBlock OGHAM = new UnicodeBlock("OGHAM");
    public static final UnicodeBlock OLD_HUNGARIAN = new UnicodeBlock("OLD_HUNGARIAN");
    public static final UnicodeBlock OLD_ITALIC = new UnicodeBlock("OLD_ITALIC");
    public static final UnicodeBlock OLD_NORTH_ARABIAN = new UnicodeBlock("OLD_NORTH_ARABIAN");
    public static final UnicodeBlock OLD_PERMIC = new UnicodeBlock("OLD_PERMIC");
    public static final UnicodeBlock OLD_PERSIAN = new UnicodeBlock("OLD_PERSIAN");
    public static final UnicodeBlock OLD_SOGDIAN = new UnicodeBlock("OLD_SOGDIAN");
    public static final UnicodeBlock OLD_SOUTH_ARABIAN = new UnicodeBlock("OLD_SOUTH_ARABIAN");
    public static final UnicodeBlock OLD_TURKIC = new UnicodeBlock("OLD_TURKIC");
    public static final UnicodeBlock OLD_UYGHUR = new UnicodeBlock("OLD_UYGHUR");
    public static final UnicodeBlock OL_CHIKI = new UnicodeBlock("OL_CHIKI");
    public static final UnicodeBlock OL_ONAL = new UnicodeBlock("OL_ONAL");
    public static final UnicodeBlock OPTICAL_CHARACTER_RECOGNITION = new UnicodeBlock("OPTICAL_CHARACTER_RECOGNITION");
    public static final UnicodeBlock ORIYA = new UnicodeBlock("ORIYA");
    public static final UnicodeBlock ORNAMENTAL_DINGBATS = new UnicodeBlock("ORNAMENTAL_DINGBATS");
    public static final UnicodeBlock OSAGE = new UnicodeBlock("OSAGE");
    public static final UnicodeBlock OSMANYA = new UnicodeBlock("OSMANYA");
    public static final UnicodeBlock OTTOMAN_SIYAQ_NUMBERS = new UnicodeBlock("OTTOMAN_SIYAQ_NUMBERS");
    public static final UnicodeBlock PAHAWH_HMONG = new UnicodeBlock("PAHAWH_HMONG");
    public static final UnicodeBlock PALMYRENE = new UnicodeBlock("PALMYRENE");
    public static final UnicodeBlock PAU_CIN_HAU = new UnicodeBlock("PAU_CIN_HAU");
    public static final UnicodeBlock PHAGS_PA = new UnicodeBlock("PHAGS_PA");
    public static final UnicodeBlock PHAISTOS_DISC = new UnicodeBlock("PHAISTOS_DISC");
    public static final UnicodeBlock PHOENICIAN = new UnicodeBlock("PHOENICIAN");
    public static final UnicodeBlock PHONETIC_EXTENSIONS = new UnicodeBlock("PHONETIC_EXTENSIONS");
    public static final UnicodeBlock PHONETIC_EXTENSIONS_SUPPLEMENT = new UnicodeBlock("PHONETIC_EXTENSIONS_SUPPLEMENT");
    public static final UnicodeBlock PLAYING_CARDS = new UnicodeBlock("PLAYING_CARDS");
    public static final UnicodeBlock PRIVATE_USE_AREA = new UnicodeBlock("PRIVATE_USE_AREA");
    public static final UnicodeBlock PSALTER_PAHLAVI = new UnicodeBlock("PSALTER_PAHLAVI");
    public static final UnicodeBlock REJANG = new UnicodeBlock("REJANG");
    public static final UnicodeBlock RUMI_NUMERAL_SYMBOLS = new UnicodeBlock("RUMI_NUMERAL_SYMBOLS");
    public static final UnicodeBlock RUNIC = new UnicodeBlock("RUNIC");
    public static final UnicodeBlock SAMARITAN = new UnicodeBlock("SAMARITAN");
    public static final UnicodeBlock SAURASHTRA = new UnicodeBlock("SAURASHTRA");
    public static final UnicodeBlock SHARADA = new UnicodeBlock("SHARADA");
    public static final UnicodeBlock SHAVIAN = new UnicodeBlock("SHAVIAN");
    public static final UnicodeBlock SHORTHAND_FORMAT_CONTROLS = new UnicodeBlock("SHORTHAND_FORMAT_CONTROLS");
    public static final UnicodeBlock SIDDHAM = new UnicodeBlock("SIDDHAM");
    public static final UnicodeBlock SINHALA = new UnicodeBlock("SINHALA");
    public static final UnicodeBlock SINHALA_ARCHAIC_NUMBERS = new UnicodeBlock("SINHALA_ARCHAIC_NUMBERS");
    public static final UnicodeBlock SMALL_FORM_VARIANTS = new UnicodeBlock("SMALL_FORM_VARIANTS");
    public static final UnicodeBlock SMALL_KANA_EXTENSION = new UnicodeBlock("SMALL_KANA_EXTENSION");
    public static final UnicodeBlock SOGDIAN = new UnicodeBlock("SOGDIAN");
    public static final UnicodeBlock SORA_SOMPENG = new UnicodeBlock("SORA_SOMPENG");
    public static final UnicodeBlock SOYOMBO = new UnicodeBlock("SOYOMBO");
    public static final UnicodeBlock SPACING_MODIFIER_LETTERS = new UnicodeBlock("SPACING_MODIFIER_LETTERS");
    public static final UnicodeBlock SPECIALS = new UnicodeBlock("SPECIALS");
    public static final UnicodeBlock SUNDANESE = new UnicodeBlock("SUNDANESE");
    public static final UnicodeBlock SUNDANESE_SUPPLEMENT = new UnicodeBlock("SUNDANESE_SUPPLEMENT");
    public static final UnicodeBlock SUNUWAR = new UnicodeBlock("SUNUWAR");
    public static final UnicodeBlock SUPERSCRIPTS_AND_SUBSCRIPTS = new UnicodeBlock("SUPERSCRIPTS_AND_SUBSCRIPTS");
    public static final UnicodeBlock SUPPLEMENTAL_ARROWS_A = new UnicodeBlock("SUPPLEMENTAL_ARROWS_A");
    public static final UnicodeBlock SUPPLEMENTAL_ARROWS_B = new UnicodeBlock("SUPPLEMENTAL_ARROWS_B");
    public static final UnicodeBlock SUPPLEMENTAL_ARROWS_C = new UnicodeBlock("SUPPLEMENTAL_ARROWS_C");
    public static final UnicodeBlock SUPPLEMENTAL_MATHEMATICAL_OPERATORS = new UnicodeBlock("SUPPLEMENTAL_MATHEMATICAL_OPERATORS");
    public static final UnicodeBlock SUPPLEMENTAL_PUNCTUATION = new UnicodeBlock("SUPPLEMENTAL_PUNCTUATION");
    public static final UnicodeBlock SUPPLEMENTAL_SYMBOLS_AND_PICTOGRAPHS = new UnicodeBlock("SUPPLEMENTAL_SYMBOLS_AND_PICTOGRAPHS");
    public static final UnicodeBlock SUPPLEMENTARY_PRIVATE_USE_AREA_A = new UnicodeBlock("SUPPLEMENTARY_PRIVATE_USE_AREA_A");
    public static final UnicodeBlock SUPPLEMENTARY_PRIVATE_USE_AREA_B = new UnicodeBlock("SUPPLEMENTARY_PRIVATE_USE_AREA_B");
    public static final UnicodeBlock SURROGATES_AREA = new UnicodeBlock("SURROGATES_AREA");
    public static final UnicodeBlock SUTTON_SIGNWRITING = new UnicodeBlock("SUTTON_SIGNWRITING");
    public static final UnicodeBlock SYLOTI_NAGRI = new UnicodeBlock("SYLOTI_NAGRI");
    public static final UnicodeBlock SYMBOLS_AND_PICTOGRAPHS_EXTENDED_A = new UnicodeBlock("SYMBOLS_AND_PICTOGRAPHS_EXTENDED_A");
    public static final UnicodeBlock SYMBOLS_FOR_LEGACY_COMPUTING = new UnicodeBlock("SYMBOLS_FOR_LEGACY_COMPUTING");
    public static final UnicodeBlock SYMBOLS_FOR_LEGACY_COMPUTING_SUPPLEMENT = new UnicodeBlock("SYMBOLS_FOR_LEGACY_COMPUTING_SUPPLEMENT");
    public static final UnicodeBlock SYRIAC = new UnicodeBlock("SYRIAC");
    public static final UnicodeBlock SYRIAC_SUPPLEMENT = new UnicodeBlock("SYRIAC_SUPPLEMENT");
    public static final UnicodeBlock TAGALOG = new UnicodeBlock("TAGALOG");
    public static final UnicodeBlock TAGBANWA = new UnicodeBlock("TAGBANWA");
    public static final UnicodeBlock TAGS = new UnicodeBlock("TAGS");
    public static final UnicodeBlock TAI_LE = new UnicodeBlock("TAI_LE");
    public static final UnicodeBlock TAI_THAM = new UnicodeBlock("TAI_THAM");
    public static final UnicodeBlock TAI_VIET = new UnicodeBlock("TAI_VIET");
    public static final UnicodeBlock TAI_XUAN_JING_SYMBOLS = new UnicodeBlock("TAI_XUAN_JING_SYMBOLS");
    public static final UnicodeBlock TAKRI = new UnicodeBlock("TAKRI");
    public static final UnicodeBlock TAMIL = new UnicodeBlock("TAMIL");
    public static final UnicodeBlock TAMIL_SUPPLEMENT = new UnicodeBlock("TAMIL_SUPPLEMENT");
    public static final UnicodeBlock TANGSA = new UnicodeBlock("TANGSA");
    public static final UnicodeBlock TANGUT = new UnicodeBlock("TANGUT");
    public static final UnicodeBlock TANGUT_COMPONENTS = new UnicodeBlock("TANGUT_COMPONENTS");
    public static final UnicodeBlock TANGUT_SUPPLEMENT = new UnicodeBlock("TANGUT_SUPPLEMENT");
    public static final UnicodeBlock TELUGU = new UnicodeBlock("TELUGU");
    public static final UnicodeBlock THAANA = new UnicodeBlock("THAANA");
    public static final UnicodeBlock THAI = new UnicodeBlock("THAI");
    public static final UnicodeBlock TIBETAN = new UnicodeBlock("TIBETAN");
    public static final UnicodeBlock TIFINAGH = new UnicodeBlock("TIFINAGH");
    public static final UnicodeBlock TIRHUTA = new UnicodeBlock("TIRHUTA");
    public static final UnicodeBlock TODHRI = new UnicodeBlock("TODHRI");
    public static final UnicodeBlock TOTO = new UnicodeBlock("TOTO");
    public static final UnicodeBlock TRANSPORT_AND_MAP_SYMBOLS = new UnicodeBlock("TRANSPORT_AND_MAP_SYMBOLS");
    public static final UnicodeBlock TULU_TIGALARI = new UnicodeBlock("TULU_TIGALARI");
    public static final UnicodeBlock UGARITIC = new UnicodeBlock("UGARITIC");
    public static final UnicodeBlock UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS = new UnicodeBlock("UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS");
    public static final UnicodeBlock UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_EXTENDED = new UnicodeBlock("UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_EXTENDED");
    public static final UnicodeBlock UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_EXTENDED_A = new UnicodeBlock("UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_EXTENDED_A");
    public static final UnicodeBlock VAI = new UnicodeBlock("VAI");
    public static final UnicodeBlock VARIATION_SELECTORS = new UnicodeBlock("VARIATION_SELECTORS");
    public static final UnicodeBlock VARIATION_SELECTORS_SUPPLEMENT = new UnicodeBlock("VARIATION_SELECTORS_SUPPLEMENT");
    public static final UnicodeBlock VEDIC_EXTENSIONS = new UnicodeBlock("VEDIC_EXTENSIONS");
    public static final UnicodeBlock VERTICAL_FORMS = new UnicodeBlock("VERTICAL_FORMS");
    public static final UnicodeBlock VITHKUQI = new UnicodeBlock("VITHKUQI");
    public static final UnicodeBlock WANCHO = new UnicodeBlock("WANCHO");
    public static final UnicodeBlock WARANG_CITI = new UnicodeBlock("WARANG_CITI");
    public static final UnicodeBlock YEZIDI = new UnicodeBlock("YEZIDI");
    public static final UnicodeBlock YIJING_HEXAGRAM_SYMBOLS = new UnicodeBlock("YIJING_HEXAGRAM_SYMBOLS");
    public static final UnicodeBlock YI_RADICALS = new UnicodeBlock("YI_RADICALS");
    public static final UnicodeBlock YI_SYLLABLES = new UnicodeBlock("YI_SYLLABLES");
    public static final UnicodeBlock ZANABAZAR_SQUARE = new UnicodeBlock("ZANABAZAR_SQUARE");
    public static final UnicodeBlock ZNAMENNY_MUSICAL_NOTATION = new UnicodeBlock("ZNAMENNY_MUSICAL_NOTATION");

    private static final String[] BLOCK_NAMES = {
        "ADLAM", "AEGEAN_NUMBERS", "AHOM", "ALCHEMICAL_SYMBOLS",
        "ALPHABETIC_PRESENTATION_FORMS", "ANATOLIAN_HIEROGLYPHS", "ANCIENT_GREEK_MUSICAL_NOTATION", "ANCIENT_GREEK_NUMBERS",
        "ANCIENT_SYMBOLS", "ARABIC", "ARABIC_EXTENDED_A", "ARABIC_EXTENDED_B",
        "ARABIC_EXTENDED_C", "ARABIC_MATHEMATICAL_ALPHABETIC_SYMBOLS", "ARABIC_PRESENTATION_FORMS_A", "ARABIC_PRESENTATION_FORMS_B",
        "ARABIC_SUPPLEMENT", "ARMENIAN", "ARROWS", "AVESTAN",
        "BALINESE", "BAMUM", "BAMUM_SUPPLEMENT", "BASIC_LATIN",
        "BASSA_VAH", "BATAK", "BENGALI", "BHAIKSUKI",
        "BLOCK_ELEMENTS", "BOPOMOFO", "BOPOMOFO_EXTENDED", "BOX_DRAWING",
        "BRAHMI", "BRAILLE_PATTERNS", "BUGINESE", "BUHID",
        "BYZANTINE_MUSICAL_SYMBOLS", "CARIAN", "CAUCASIAN_ALBANIAN", "CHAKMA",
        "CHAM", "CHEROKEE", "CHEROKEE_SUPPLEMENT", "CHESS_SYMBOLS",
        "CHORASMIAN", "CJK_COMPATIBILITY", "CJK_COMPATIBILITY_FORMS", "CJK_COMPATIBILITY_IDEOGRAPHS",
        "CJK_COMPATIBILITY_IDEOGRAPHS_SUPPLEMENT", "CJK_RADICALS_SUPPLEMENT", "CJK_STROKES", "CJK_SYMBOLS_AND_PUNCTUATION",
        "CJK_UNIFIED_IDEOGRAPHS", "CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A", "CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B", "CJK_UNIFIED_IDEOGRAPHS_EXTENSION_C",
        "CJK_UNIFIED_IDEOGRAPHS_EXTENSION_D", "CJK_UNIFIED_IDEOGRAPHS_EXTENSION_E", "CJK_UNIFIED_IDEOGRAPHS_EXTENSION_F", "CJK_UNIFIED_IDEOGRAPHS_EXTENSION_G",
        "CJK_UNIFIED_IDEOGRAPHS_EXTENSION_H", "CJK_UNIFIED_IDEOGRAPHS_EXTENSION_I", "COMBINING_DIACRITICAL_MARKS", "COMBINING_DIACRITICAL_MARKS_EXTENDED",
        "COMBINING_DIACRITICAL_MARKS_SUPPLEMENT", "COMBINING_HALF_MARKS", "COMBINING_MARKS_FOR_SYMBOLS", "COMMON_INDIC_NUMBER_FORMS",
        "CONTROL_PICTURES", "COPTIC", "COPTIC_EPACT_NUMBERS", "COUNTING_ROD_NUMERALS",
        "CUNEIFORM", "CUNEIFORM_NUMBERS_AND_PUNCTUATION", "CURRENCY_SYMBOLS", "CYPRIOT_SYLLABARY",
        "CYPRO_MINOAN", "CYRILLIC", "CYRILLIC_EXTENDED_A", "CYRILLIC_EXTENDED_B",
        "CYRILLIC_EXTENDED_C", "CYRILLIC_EXTENDED_D", "CYRILLIC_SUPPLEMENTARY", "DESERET",
        "DEVANAGARI", "DEVANAGARI_EXTENDED", "DEVANAGARI_EXTENDED_A", "DINGBATS",
        "DIVES_AKURU", "DOGRA", "DOMINO_TILES", "DUPLOYAN",
        "EARLY_DYNASTIC_CUNEIFORM", "EGYPTIAN_HIEROGLYPHS", "EGYPTIAN_HIEROGLYPHS_EXTENDED_A", "EGYPTIAN_HIEROGLYPH_FORMAT_CONTROLS",
        "ELBASAN", "ELYMAIC", "EMOTICONS", "ENCLOSED_ALPHANUMERICS",
        "ENCLOSED_ALPHANUMERIC_SUPPLEMENT", "ENCLOSED_CJK_LETTERS_AND_MONTHS", "ENCLOSED_IDEOGRAPHIC_SUPPLEMENT", "ETHIOPIC",
        "ETHIOPIC_EXTENDED", "ETHIOPIC_EXTENDED_A", "ETHIOPIC_EXTENDED_B", "ETHIOPIC_SUPPLEMENT",
        "GARAY", "GENERAL_PUNCTUATION", "GEOMETRIC_SHAPES", "GEOMETRIC_SHAPES_EXTENDED",
        "GEORGIAN", "GEORGIAN_EXTENDED", "GEORGIAN_SUPPLEMENT", "GLAGOLITIC",
        "GLAGOLITIC_SUPPLEMENT", "GOTHIC", "GRANTHA", "GREEK",
        "GREEK_EXTENDED", "GUJARATI", "GUNJALA_GONDI", "GURMUKHI",
        "GURUNG_KHEMA", "HALFWIDTH_AND_FULLWIDTH_FORMS", "HANGUL_COMPATIBILITY_JAMO", "HANGUL_JAMO",
        "HANGUL_JAMO_EXTENDED_A", "HANGUL_JAMO_EXTENDED_B", "HANGUL_SYLLABLES", "HANIFI_ROHINGYA",
        "HANUNOO", "HATRAN", "HEBREW", "HIGH_PRIVATE_USE_SURROGATES",
        "HIGH_SURROGATES", "HIRAGANA", "IDEOGRAPHIC_DESCRIPTION_CHARACTERS", "IDEOGRAPHIC_SYMBOLS_AND_PUNCTUATION",
        "IMPERIAL_ARAMAIC", "INDIC_SIYAQ_NUMBERS", "INSCRIPTIONAL_PAHLAVI", "INSCRIPTIONAL_PARTHIAN",
        "IPA_EXTENSIONS", "JAVANESE", "KAITHI", "KAKTOVIK_NUMERALS",
        "KANA_EXTENDED_A", "KANA_EXTENDED_B", "KANA_SUPPLEMENT", "KANBUN",
        "KANGXI_RADICALS", "KANNADA", "KATAKANA", "KATAKANA_PHONETIC_EXTENSIONS",
        "KAWI", "KAYAH_LI", "KHAROSHTHI", "KHITAN_SMALL_SCRIPT",
        "KHMER", "KHMER_SYMBOLS", "KHOJKI", "KHUDAWADI",
        "KIRAT_RAI", "LAO", "LATIN_1_SUPPLEMENT", "LATIN_EXTENDED_A",
        "LATIN_EXTENDED_ADDITIONAL", "LATIN_EXTENDED_B", "LATIN_EXTENDED_C", "LATIN_EXTENDED_D",
        "LATIN_EXTENDED_E", "LATIN_EXTENDED_F", "LATIN_EXTENDED_G", "LEPCHA",
        "LETTERLIKE_SYMBOLS", "LIMBU", "LINEAR_A", "LINEAR_B_IDEOGRAMS",
        "LINEAR_B_SYLLABARY", "LISU", "LISU_SUPPLEMENT", "LOW_SURROGATES",
        "LYCIAN", "LYDIAN", "MAHAJANI", "MAHJONG_TILES",
        "MAKASAR", "MALAYALAM", "MANDAIC", "MANICHAEAN",
        "MARCHEN", "MASARAM_GONDI", "MATHEMATICAL_ALPHANUMERIC_SYMBOLS", "MATHEMATICAL_OPERATORS",
        "MAYAN_NUMERALS", "MEDEFAIDRIN", "MEETEI_MAYEK", "MEETEI_MAYEK_EXTENSIONS",
        "MENDE_KIKAKUI", "MEROITIC_CURSIVE", "MEROITIC_HIEROGLYPHS", "MIAO",
        "MISCELLANEOUS_MATHEMATICAL_SYMBOLS_A", "MISCELLANEOUS_MATHEMATICAL_SYMBOLS_B", "MISCELLANEOUS_SYMBOLS", "MISCELLANEOUS_SYMBOLS_AND_ARROWS",
        "MISCELLANEOUS_SYMBOLS_AND_PICTOGRAPHS", "MISCELLANEOUS_TECHNICAL", "MODI", "MODIFIER_TONE_LETTERS",
        "MONGOLIAN", "MONGOLIAN_SUPPLEMENT", "MRO", "MULTANI",
        "MUSICAL_SYMBOLS", "MYANMAR", "MYANMAR_EXTENDED_A", "MYANMAR_EXTENDED_B",
        "MYANMAR_EXTENDED_C", "NABATAEAN", "NAG_MUNDARI", "NANDINAGARI",
        "NEWA", "NEW_TAI_LUE", "NKO", "NUMBER_FORMS",
        "NUSHU", "NYIAKENG_PUACHUE_HMONG", "OGHAM", "OLD_HUNGARIAN",
        "OLD_ITALIC", "OLD_NORTH_ARABIAN", "OLD_PERMIC", "OLD_PERSIAN",
        "OLD_SOGDIAN", "OLD_SOUTH_ARABIAN", "OLD_TURKIC", "OLD_UYGHUR",
        "OL_CHIKI", "OL_ONAL", "OPTICAL_CHARACTER_RECOGNITION", "ORIYA",
        "ORNAMENTAL_DINGBATS", "OSAGE", "OSMANYA", "OTTOMAN_SIYAQ_NUMBERS",
        "PAHAWH_HMONG", "PALMYRENE", "PAU_CIN_HAU", "PHAGS_PA",
        "PHAISTOS_DISC", "PHOENICIAN", "PHONETIC_EXTENSIONS", "PHONETIC_EXTENSIONS_SUPPLEMENT",
        "PLAYING_CARDS", "PRIVATE_USE_AREA", "PSALTER_PAHLAVI", "REJANG",
        "RUMI_NUMERAL_SYMBOLS", "RUNIC", "SAMARITAN", "SAURASHTRA",
        "SHARADA", "SHAVIAN", "SHORTHAND_FORMAT_CONTROLS", "SIDDHAM",
        "SINHALA", "SINHALA_ARCHAIC_NUMBERS", "SMALL_FORM_VARIANTS", "SMALL_KANA_EXTENSION",
        "SOGDIAN", "SORA_SOMPENG", "SOYOMBO", "SPACING_MODIFIER_LETTERS",
        "SPECIALS", "SUNDANESE", "SUNDANESE_SUPPLEMENT", "SUNUWAR",
        "SUPERSCRIPTS_AND_SUBSCRIPTS", "SUPPLEMENTAL_ARROWS_A", "SUPPLEMENTAL_ARROWS_B", "SUPPLEMENTAL_ARROWS_C",
        "SUPPLEMENTAL_MATHEMATICAL_OPERATORS", "SUPPLEMENTAL_PUNCTUATION", "SUPPLEMENTAL_SYMBOLS_AND_PICTOGRAPHS", "SUPPLEMENTARY_PRIVATE_USE_AREA_A",
        "SUPPLEMENTARY_PRIVATE_USE_AREA_B", "SURROGATES_AREA", "SUTTON_SIGNWRITING", "SYLOTI_NAGRI",
        "SYMBOLS_AND_PICTOGRAPHS_EXTENDED_A", "SYMBOLS_FOR_LEGACY_COMPUTING", "SYMBOLS_FOR_LEGACY_COMPUTING_SUPPLEMENT", "SYRIAC",
        "SYRIAC_SUPPLEMENT", "TAGALOG", "TAGBANWA", "TAGS",
        "TAI_LE", "TAI_THAM", "TAI_VIET", "TAI_XUAN_JING_SYMBOLS",
        "TAKRI", "TAMIL", "TAMIL_SUPPLEMENT", "TANGSA",
        "TANGUT", "TANGUT_COMPONENTS", "TANGUT_SUPPLEMENT", "TELUGU",
        "THAANA", "THAI", "TIBETAN", "TIFINAGH",
        "TIRHUTA", "TODHRI", "TOTO", "TRANSPORT_AND_MAP_SYMBOLS",
        "TULU_TIGALARI", "UGARITIC", "UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS", "UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_EXTENDED",
        "UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_EXTENDED_A", "VAI", "VARIATION_SELECTORS", "VARIATION_SELECTORS_SUPPLEMENT",
        "VEDIC_EXTENSIONS", "VERTICAL_FORMS", "VITHKUQI", "WANCHO",
        "WARANG_CITI", "YEZIDI", "YIJING_HEXAGRAM_SYMBOLS", "YI_RADICALS",
        "YI_SYLLABLES", "ZANABAZAR_SQUARE", "ZNAMENNY_MUSICAL_NOTATION"
    };

    private static final UnicodeBlock[] BLOCK_BY_INDEX = {
        ADLAM, AEGEAN_NUMBERS, AHOM, ALCHEMICAL_SYMBOLS,
        ALPHABETIC_PRESENTATION_FORMS, ANATOLIAN_HIEROGLYPHS, ANCIENT_GREEK_MUSICAL_NOTATION, ANCIENT_GREEK_NUMBERS,
        ANCIENT_SYMBOLS, ARABIC, ARABIC_EXTENDED_A, ARABIC_EXTENDED_B,
        ARABIC_EXTENDED_C, ARABIC_MATHEMATICAL_ALPHABETIC_SYMBOLS, ARABIC_PRESENTATION_FORMS_A, ARABIC_PRESENTATION_FORMS_B,
        ARABIC_SUPPLEMENT, ARMENIAN, ARROWS, AVESTAN,
        BALINESE, BAMUM, BAMUM_SUPPLEMENT, BASIC_LATIN,
        BASSA_VAH, BATAK, BENGALI, BHAIKSUKI,
        BLOCK_ELEMENTS, BOPOMOFO, BOPOMOFO_EXTENDED, BOX_DRAWING,
        BRAHMI, BRAILLE_PATTERNS, BUGINESE, BUHID,
        BYZANTINE_MUSICAL_SYMBOLS, CARIAN, CAUCASIAN_ALBANIAN, CHAKMA,
        CHAM, CHEROKEE, CHEROKEE_SUPPLEMENT, CHESS_SYMBOLS,
        CHORASMIAN, CJK_COMPATIBILITY, CJK_COMPATIBILITY_FORMS, CJK_COMPATIBILITY_IDEOGRAPHS,
        CJK_COMPATIBILITY_IDEOGRAPHS_SUPPLEMENT, CJK_RADICALS_SUPPLEMENT, CJK_STROKES, CJK_SYMBOLS_AND_PUNCTUATION,
        CJK_UNIFIED_IDEOGRAPHS, CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A, CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B, CJK_UNIFIED_IDEOGRAPHS_EXTENSION_C,
        CJK_UNIFIED_IDEOGRAPHS_EXTENSION_D, CJK_UNIFIED_IDEOGRAPHS_EXTENSION_E, CJK_UNIFIED_IDEOGRAPHS_EXTENSION_F, CJK_UNIFIED_IDEOGRAPHS_EXTENSION_G,
        CJK_UNIFIED_IDEOGRAPHS_EXTENSION_H, CJK_UNIFIED_IDEOGRAPHS_EXTENSION_I, COMBINING_DIACRITICAL_MARKS, COMBINING_DIACRITICAL_MARKS_EXTENDED,
        COMBINING_DIACRITICAL_MARKS_SUPPLEMENT, COMBINING_HALF_MARKS, COMBINING_MARKS_FOR_SYMBOLS, COMMON_INDIC_NUMBER_FORMS,
        CONTROL_PICTURES, COPTIC, COPTIC_EPACT_NUMBERS, COUNTING_ROD_NUMERALS,
        CUNEIFORM, CUNEIFORM_NUMBERS_AND_PUNCTUATION, CURRENCY_SYMBOLS, CYPRIOT_SYLLABARY,
        CYPRO_MINOAN, CYRILLIC, CYRILLIC_EXTENDED_A, CYRILLIC_EXTENDED_B,
        CYRILLIC_EXTENDED_C, CYRILLIC_EXTENDED_D, CYRILLIC_SUPPLEMENTARY, DESERET,
        DEVANAGARI, DEVANAGARI_EXTENDED, DEVANAGARI_EXTENDED_A, DINGBATS,
        DIVES_AKURU, DOGRA, DOMINO_TILES, DUPLOYAN,
        EARLY_DYNASTIC_CUNEIFORM, EGYPTIAN_HIEROGLYPHS, EGYPTIAN_HIEROGLYPHS_EXTENDED_A, EGYPTIAN_HIEROGLYPH_FORMAT_CONTROLS,
        ELBASAN, ELYMAIC, EMOTICONS, ENCLOSED_ALPHANUMERICS,
        ENCLOSED_ALPHANUMERIC_SUPPLEMENT, ENCLOSED_CJK_LETTERS_AND_MONTHS, ENCLOSED_IDEOGRAPHIC_SUPPLEMENT, ETHIOPIC,
        ETHIOPIC_EXTENDED, ETHIOPIC_EXTENDED_A, ETHIOPIC_EXTENDED_B, ETHIOPIC_SUPPLEMENT,
        GARAY, GENERAL_PUNCTUATION, GEOMETRIC_SHAPES, GEOMETRIC_SHAPES_EXTENDED,
        GEORGIAN, GEORGIAN_EXTENDED, GEORGIAN_SUPPLEMENT, GLAGOLITIC,
        GLAGOLITIC_SUPPLEMENT, GOTHIC, GRANTHA, GREEK,
        GREEK_EXTENDED, GUJARATI, GUNJALA_GONDI, GURMUKHI,
        GURUNG_KHEMA, HALFWIDTH_AND_FULLWIDTH_FORMS, HANGUL_COMPATIBILITY_JAMO, HANGUL_JAMO,
        HANGUL_JAMO_EXTENDED_A, HANGUL_JAMO_EXTENDED_B, HANGUL_SYLLABLES, HANIFI_ROHINGYA,
        HANUNOO, HATRAN, HEBREW, HIGH_PRIVATE_USE_SURROGATES,
        HIGH_SURROGATES, HIRAGANA, IDEOGRAPHIC_DESCRIPTION_CHARACTERS, IDEOGRAPHIC_SYMBOLS_AND_PUNCTUATION,
        IMPERIAL_ARAMAIC, INDIC_SIYAQ_NUMBERS, INSCRIPTIONAL_PAHLAVI, INSCRIPTIONAL_PARTHIAN,
        IPA_EXTENSIONS, JAVANESE, KAITHI, KAKTOVIK_NUMERALS,
        KANA_EXTENDED_A, KANA_EXTENDED_B, KANA_SUPPLEMENT, KANBUN,
        KANGXI_RADICALS, KANNADA, KATAKANA, KATAKANA_PHONETIC_EXTENSIONS,
        KAWI, KAYAH_LI, KHAROSHTHI, KHITAN_SMALL_SCRIPT,
        KHMER, KHMER_SYMBOLS, KHOJKI, KHUDAWADI,
        KIRAT_RAI, LAO, LATIN_1_SUPPLEMENT, LATIN_EXTENDED_A,
        LATIN_EXTENDED_ADDITIONAL, LATIN_EXTENDED_B, LATIN_EXTENDED_C, LATIN_EXTENDED_D,
        LATIN_EXTENDED_E, LATIN_EXTENDED_F, LATIN_EXTENDED_G, LEPCHA,
        LETTERLIKE_SYMBOLS, LIMBU, LINEAR_A, LINEAR_B_IDEOGRAMS,
        LINEAR_B_SYLLABARY, LISU, LISU_SUPPLEMENT, LOW_SURROGATES,
        LYCIAN, LYDIAN, MAHAJANI, MAHJONG_TILES,
        MAKASAR, MALAYALAM, MANDAIC, MANICHAEAN,
        MARCHEN, MASARAM_GONDI, MATHEMATICAL_ALPHANUMERIC_SYMBOLS, MATHEMATICAL_OPERATORS,
        MAYAN_NUMERALS, MEDEFAIDRIN, MEETEI_MAYEK, MEETEI_MAYEK_EXTENSIONS,
        MENDE_KIKAKUI, MEROITIC_CURSIVE, MEROITIC_HIEROGLYPHS, MIAO,
        MISCELLANEOUS_MATHEMATICAL_SYMBOLS_A, MISCELLANEOUS_MATHEMATICAL_SYMBOLS_B, MISCELLANEOUS_SYMBOLS, MISCELLANEOUS_SYMBOLS_AND_ARROWS,
        MISCELLANEOUS_SYMBOLS_AND_PICTOGRAPHS, MISCELLANEOUS_TECHNICAL, MODI, MODIFIER_TONE_LETTERS,
        MONGOLIAN, MONGOLIAN_SUPPLEMENT, MRO, MULTANI,
        MUSICAL_SYMBOLS, MYANMAR, MYANMAR_EXTENDED_A, MYANMAR_EXTENDED_B,
        MYANMAR_EXTENDED_C, NABATAEAN, NAG_MUNDARI, NANDINAGARI,
        NEWA, NEW_TAI_LUE, NKO, NUMBER_FORMS,
        NUSHU, NYIAKENG_PUACHUE_HMONG, OGHAM, OLD_HUNGARIAN,
        OLD_ITALIC, OLD_NORTH_ARABIAN, OLD_PERMIC, OLD_PERSIAN,
        OLD_SOGDIAN, OLD_SOUTH_ARABIAN, OLD_TURKIC, OLD_UYGHUR,
        OL_CHIKI, OL_ONAL, OPTICAL_CHARACTER_RECOGNITION, ORIYA,
        ORNAMENTAL_DINGBATS, OSAGE, OSMANYA, OTTOMAN_SIYAQ_NUMBERS,
        PAHAWH_HMONG, PALMYRENE, PAU_CIN_HAU, PHAGS_PA,
        PHAISTOS_DISC, PHOENICIAN, PHONETIC_EXTENSIONS, PHONETIC_EXTENSIONS_SUPPLEMENT,
        PLAYING_CARDS, PRIVATE_USE_AREA, PSALTER_PAHLAVI, REJANG,
        RUMI_NUMERAL_SYMBOLS, RUNIC, SAMARITAN, SAURASHTRA,
        SHARADA, SHAVIAN, SHORTHAND_FORMAT_CONTROLS, SIDDHAM,
        SINHALA, SINHALA_ARCHAIC_NUMBERS, SMALL_FORM_VARIANTS, SMALL_KANA_EXTENSION,
        SOGDIAN, SORA_SOMPENG, SOYOMBO, SPACING_MODIFIER_LETTERS,
        SPECIALS, SUNDANESE, SUNDANESE_SUPPLEMENT, SUNUWAR,
        SUPERSCRIPTS_AND_SUBSCRIPTS, SUPPLEMENTAL_ARROWS_A, SUPPLEMENTAL_ARROWS_B, SUPPLEMENTAL_ARROWS_C,
        SUPPLEMENTAL_MATHEMATICAL_OPERATORS, SUPPLEMENTAL_PUNCTUATION, SUPPLEMENTAL_SYMBOLS_AND_PICTOGRAPHS, SUPPLEMENTARY_PRIVATE_USE_AREA_A,
        SUPPLEMENTARY_PRIVATE_USE_AREA_B, SURROGATES_AREA, SUTTON_SIGNWRITING, SYLOTI_NAGRI,
        SYMBOLS_AND_PICTOGRAPHS_EXTENDED_A, SYMBOLS_FOR_LEGACY_COMPUTING, SYMBOLS_FOR_LEGACY_COMPUTING_SUPPLEMENT, SYRIAC,
        SYRIAC_SUPPLEMENT, TAGALOG, TAGBANWA, TAGS,
        TAI_LE, TAI_THAM, TAI_VIET, TAI_XUAN_JING_SYMBOLS,
        TAKRI, TAMIL, TAMIL_SUPPLEMENT, TANGSA,
        TANGUT, TANGUT_COMPONENTS, TANGUT_SUPPLEMENT, TELUGU,
        THAANA, THAI, TIBETAN, TIFINAGH,
        TIRHUTA, TODHRI, TOTO, TRANSPORT_AND_MAP_SYMBOLS,
        TULU_TIGALARI, UGARITIC, UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS, UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_EXTENDED,
        UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_EXTENDED_A, VAI, VARIATION_SELECTORS, VARIATION_SELECTORS_SUPPLEMENT,
        VEDIC_EXTENSIONS, VERTICAL_FORMS, VITHKUQI, WANCHO,
        WARANG_CITI, YEZIDI, YIJING_HEXAGRAM_SYMBOLS, YI_RADICALS,
        YI_SYLLABLES, ZANABAZAR_SQUARE, ZNAMENNY_MUSICAL_NOTATION
    };

    private static final int[] BLOCK_RANGES = {
        0, 127, 23, 128, 255, 166, 256, 383, 167, 384, 591, 169,
        592, 687, 144, 688, 767, 275, 768, 879, 62, 880, 1023, 119,
        1024, 1279, 77, 1280, 1327, 82, 1328, 1423, 17, 1424, 1535, 134,
        1536, 1791, 9, 1792, 1871, 295, 1872, 1919, 16, 1920, 1983, 312,
        1984, 2047, 226, 2048, 2111, 262, 2112, 2143, 190, 2144, 2159, 296,
        2160, 2207, 11, 2208, 2303, 10, 2304, 2431, 84, 2432, 2559, 26,
        2560, 2687, 123, 2688, 2815, 121, 2816, 2943, 243, 2944, 3071, 305,
        3072, 3199, 311, 3200, 3327, 153, 3328, 3455, 189, 3456, 3583, 268,
        3584, 3711, 313, 3712, 3839, 165, 3840, 4095, 314, 4096, 4255, 217,
        4256, 4351, 112, 4352, 4607, 127, 4608, 4991, 103, 4992, 5023, 107,
        5024, 5119, 41, 5120, 5759, 322, 5760, 5791, 230, 5792, 5887, 261,
        5888, 5919, 297, 5920, 5951, 132, 5952, 5983, 35, 5984, 6015, 298,
        6016, 6143, 160, 6144, 6319, 212, 6320, 6399, 323, 6400, 6479, 177,
        6480, 6527, 300, 6528, 6623, 225, 6624, 6655, 161, 6656, 6687, 34,
        6688, 6831, 301, 6832, 6911, 63, 6912, 7039, 20, 7040, 7103, 277,
        7104, 7167, 25, 7168, 7247, 175, 7248, 7295, 240, 7296, 7311, 80,
        7312, 7359, 113, 7360, 7375, 278, 7376, 7423, 328, 7424, 7551, 254,
        7552, 7615, 255, 7616, 7679, 64, 7680, 7935, 168, 7936, 8191, 120,
        8192, 8303, 109, 8304, 8351, 280, 8352, 8399, 74, 8400, 8447, 66,
        8448, 8527, 176, 8528, 8591, 227, 8592, 8703, 18, 8704, 8959, 195,
        8960, 9215, 209, 9216, 9279, 68, 9280, 9311, 242, 9312, 9471, 99,
        9472, 9599, 31, 9600, 9631, 28, 9632, 9727, 110, 9728, 9983, 206,
        9984, 10175, 87, 10176, 10223, 204, 10224, 10239, 281, 10240, 10495, 33,
        10496, 10623, 282, 10624, 10751, 205, 10752, 11007, 284, 11008, 11263, 207,
        11264, 11359, 115, 11360, 11391, 170, 11392, 11519, 69, 11520, 11567, 114,
        11568, 11647, 315, 11648, 11743, 104, 11744, 11775, 78, 11776, 11903, 285,
        11904, 12031, 49, 12032, 12255, 152, 12272, 12287, 138, 12288, 12351, 51,
        12352, 12447, 137, 12448, 12543, 154, 12544, 12591, 29, 12592, 12687, 126,
        12688, 12703, 151, 12704, 12735, 30, 12736, 12783, 50, 12784, 12799, 155,
        12800, 13055, 101, 13056, 13311, 45, 13312, 19903, 53, 19904, 19967, 334,
        19968, 40959, 52, 40960, 42127, 336, 42128, 42191, 335, 42192, 42239, 181,
        42240, 42559, 325, 42560, 42655, 79, 42656, 42751, 21, 42752, 42783, 211,
        42784, 43007, 171, 43008, 43055, 291, 43056, 43071, 67, 43072, 43135, 251,
        43136, 43231, 263, 43232, 43263, 85, 43264, 43311, 157, 43312, 43359, 259,
        43360, 43391, 128, 43392, 43487, 145, 43488, 43519, 219, 43520, 43615, 40,
        43616, 43647, 218, 43648, 43743, 302, 43744, 43775, 199, 43776, 43823, 105,
        43824, 43887, 172, 43888, 43967, 42, 43968, 44031, 198, 44032, 55215, 130,
        55216, 55295, 129, 55296, 56191, 136, 56192, 56319, 135, 56320, 57343, 183,
        57344, 63743, 257, 63744, 64255, 47, 64256, 64335, 4, 64336, 65023, 14,
        65024, 65039, 326, 65040, 65055, 329, 65056, 65071, 65, 65072, 65103, 46,
        65104, 65135, 270, 65136, 65279, 15, 65280, 65519, 125, 65520, 65535, 276,
        65536, 65663, 180, 65664, 65791, 179, 65792, 65855, 1, 65856, 65935, 7,
        65936, 65999, 8, 66000, 66047, 252, 66176, 66207, 184, 66208, 66271, 37,
        66272, 66303, 70, 66304, 66351, 232, 66352, 66383, 117, 66384, 66431, 234,
        66432, 66463, 321, 66464, 66527, 235, 66560, 66639, 83, 66640, 66687, 265,
        66688, 66735, 246, 66736, 66815, 245, 66816, 66863, 96, 66864, 66927, 38,
        66928, 67007, 330, 67008, 67071, 317, 67072, 67455, 178, 67456, 67519, 173,
        67584, 67647, 75, 67648, 67679, 140, 67680, 67711, 249, 67712, 67759, 221,
        67808, 67839, 133, 67840, 67871, 253, 67872, 67903, 185, 67968, 67999, 202,
        68000, 68095, 201, 68096, 68191, 158, 68192, 68223, 237, 68224, 68255, 233,
        68288, 68351, 191, 68352, 68415, 19, 68416, 68447, 143, 68448, 68479, 142,
        68480, 68527, 258, 68608, 68687, 238, 68736, 68863, 231, 68864, 68927, 131,
        68928, 69007, 108, 69216, 69247, 260, 69248, 69311, 333, 69312, 69375, 12,
        69376, 69423, 236, 69424, 69487, 272, 69488, 69551, 239, 69552, 69599, 44,
        69600, 69631, 97, 69632, 69759, 32, 69760, 69839, 146, 69840, 69887, 273,
        69888, 69967, 39, 69968, 70015, 186, 70016, 70111, 264, 70112, 70143, 269,
        70144, 70223, 162, 70272, 70319, 215, 70320, 70399, 163, 70400, 70527, 118,
        70528, 70655, 320, 70656, 70783, 224, 70784, 70879, 316, 71040, 71167, 267,
        71168, 71263, 210, 71264, 71295, 213, 71296, 71375, 304, 71376, 71423, 220,
        71424, 71503, 2, 71680, 71759, 89, 71840, 71935, 332, 71936, 72031, 88,
        72096, 72191, 223, 72192, 72271, 337, 72272, 72367, 274, 72368, 72383, 324,
        72384, 72447, 250, 72448, 72543, 86, 72640, 72703, 279, 72704, 72815, 27,
        72816, 72895, 192, 72960, 73055, 193, 73056, 73135, 122, 73440, 73471, 188,
        73472, 73567, 156, 73648, 73663, 182, 73664, 73727, 306, 73728, 74751, 72,
        74752, 74879, 73, 74880, 75087, 92, 77712, 77823, 76, 77824, 78895, 93,
        78896, 78943, 95, 78944, 82943, 94, 82944, 83583, 5, 90368, 90431, 124,
        92160, 92735, 22, 92736, 92783, 214, 92784, 92879, 307, 92880, 92927, 24,
        92928, 93071, 248, 93504, 93567, 164, 93760, 93855, 197, 93952, 94111, 203,
        94176, 94207, 139, 94208, 100351, 308, 100352, 101119, 309, 101120, 101631, 159,
        101632, 101759, 310, 110576, 110591, 149, 110592, 110847, 150, 110848, 110895, 148,
        110896, 110959, 271, 110960, 111359, 228, 113664, 113823, 91, 113824, 113839, 266,
        117760, 118463, 294, 118528, 118735, 338, 118784, 119039, 36, 119040, 119295, 216,
        119296, 119375, 6, 119488, 119519, 147, 119520, 119551, 196, 119552, 119647, 303,
        119648, 119679, 71, 119808, 120831, 194, 120832, 121519, 290, 122624, 122879, 174,
        122880, 122927, 116, 122928, 123023, 81, 123136, 123215, 229, 123536, 123583, 318,
        123584, 123647, 331, 124112, 124159, 222, 124368, 124415, 241, 124896, 124927, 106,
        124928, 125151, 200, 125184, 125279, 0, 126064, 126143, 141, 126208, 126287, 247,
        126464, 126719, 13, 126976, 127023, 187, 127024, 127135, 90, 127136, 127231, 256,
        127232, 127487, 100, 127488, 127743, 102, 127744, 128511, 208, 128512, 128591, 98,
        128592, 128639, 244, 128640, 128767, 319, 128768, 128895, 3, 128896, 129023, 111,
        129024, 129279, 283, 129280, 129535, 286, 129536, 129647, 43, 129648, 129791, 292,
        129792, 130047, 293, 131072, 173791, 54, 173824, 177983, 55, 177984, 178207, 56,
        178208, 183983, 57, 183984, 191471, 58, 191472, 192095, 61, 194560, 195103, 48,
        196608, 201551, 59, 201552, 205743, 60, 917504, 917631, 299, 917760, 917999, 327,
        983040, 1048575, 287, 1048576, 1114111, 288
    };
        // ---- end generated ----

        private UnicodeBlock(String name) {
            super(name);
        }

        /** The block containing the character, or null when it is in no block. */
        public static UnicodeBlock of(char c) {
            return of((int) c);
        }

        /** The block containing the code point, or null when it is in no block. */
        public static UnicodeBlock of(int codePoint) {
            if (!isValidCodePoint(codePoint)) {
                throw new IllegalArgumentException("Not a valid Unicode code point: "
                        + Integer.toHexString(codePoint));
            }
            // BLOCK_RANGES is sorted by start and the blocks are disjoint, so binary search is enough.
            int low = 0;
            int high = BLOCK_RANGES.length / 3 - 1;
            while (low <= high) {
                int mid = (low + high) >>> 1;
                if (codePoint < BLOCK_RANGES[mid * 3]) {
                    high = mid - 1;
                } else if (codePoint > BLOCK_RANGES[mid * 3 + 1]) {
                    low = mid + 1;
                } else {
                    return BLOCK_BY_INDEX[BLOCK_RANGES[mid * 3 + 2]];
                }
            }
            return null;
        }

        public static final UnicodeBlock forName(String blockName) {
            for (int i = 0; i < BLOCK_NAMES.length; ++i) {
                if (BLOCK_NAMES[i].equals(blockName)) {
                    return BLOCK_BY_INDEX[i];
                }
            }
            throw new IllegalArgumentException("Not a valid Unicode block: " + blockName);
        }
    }
}

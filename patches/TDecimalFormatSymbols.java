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
package org.teavm.classlib.java.text;

import org.teavm.classlib.impl.unicode.CLDRHelper;
import org.teavm.classlib.impl.unicode.DecimalData;
import org.teavm.classlib.java.util.TLocale;

public class TDecimalFormatSymbols implements Cloneable {
    private TLocale locale;
    private char zeroDigit;
    private char groupingSeparator;
    private char decimalSeparator;
    private char perMill;
    private char percent;
    private char digit;
    private char patternSeparator;
    private String nan;
    private String infinity;
    private char minusSign;
    private char monetaryDecimalSeparator;
    private String exponentSeparator;

    public TDecimalFormatSymbols() {
        this(TLocale.getDefault());
    }

    public TDecimalFormatSymbols(TLocale locale) {
        this.locale = locale;
        initData();
    }

    private TDecimalFormatSymbols(TDecimalFormatSymbols source) {
        locale = source.locale;
        zeroDigit = source.zeroDigit;
        groupingSeparator = source.groupingSeparator;
        decimalSeparator = source.decimalSeparator;
        perMill = source.perMill;
        percent = source.percent;
        digit = source.digit;
        patternSeparator = source.patternSeparator;
        nan = source.nan;
        infinity = source.infinity;
        minusSign = source.minusSign;
        monetaryDecimalSeparator = source.monetaryDecimalSeparator;
        exponentSeparator = source.exponentSeparator;
    }

    private void initData() {
        DecimalData data = CLDRHelper.resolveDecimalData(locale.getLanguage(), locale.getCountry());
        zeroDigit = '0';
        groupingSeparator = (char) data.getGroupingSeparator();
        decimalSeparator = (char) data.getDecimalSeparator();
        perMill = (char) data.getPerMille();
        percent = (char) data.getPercent();
        digit = '#';
        patternSeparator = ';';
        nan = data.getNaN();
        infinity = data.getInfinity();
        minusSign = (char) data.getMinusSign();
        monetaryDecimalSeparator = (char) data.getDecimalSeparator();
        exponentSeparator = data.getExponentSeparator();
    }

    public static TLocale[] getAvailableLocales() {
        return TLocale.getAvailableLocales();
    }

    public static final TDecimalFormatSymbols getInstance() {
        return new TDecimalFormatSymbols();
    }

    public static final TDecimalFormatSymbols getInstance(TLocale locale) {
        return new TDecimalFormatSymbols(locale);
    }

    public char getZeroDigit() {
        return zeroDigit;
    }

    public void setZeroDigit(char zeroDigit) {
        this.zeroDigit = zeroDigit;
    }

    public char getGroupingSeparator() {
        return groupingSeparator;
    }

    public void setGroupingSeparator(char groupingSeparator) {
        this.groupingSeparator = groupingSeparator;
    }

    public char getPerMill() {
        return perMill;
    }

    public void setPerMill(char perMill) {
        this.perMill = perMill;
    }

    public char getPercent() {
        return percent;
    }

    public void setPercent(char percent) {
        this.percent = percent;
    }

    public TLocale getLocale() {
        return locale;
    }

    public char getDecimalSeparator() {
        return decimalSeparator;
    }

    public void setDecimalSeparator(char decimalSeparator) {
        this.decimalSeparator = decimalSeparator;
    }

    public char getDigit() {
        return digit;
    }

    public void setDigit(char digit) {
        this.digit = digit;
    }

    public char getPatternSeparator() {
        return patternSeparator;
    }

    public void setPatternSeparator(char patternSeparator) {
        this.patternSeparator = patternSeparator;
    }

    public String getNaN() {
        return nan;
    }

    public void setNaN(String naN) {
        nan = naN;
    }

    public String getInfinity() {
        return infinity;
    }

    public void setInfinity(String infinity) {
        this.infinity = infinity;
    }

    public char getMinusSign() {
        return minusSign;
    }

    public void setMinusSign(char minusSign) {
        this.minusSign = minusSign;
    }

    public char getMonetaryDecimalSeparator() {
        return monetaryDecimalSeparator;
    }

    public void setMonetaryDecimalSeparator(char monetaryDecimalSeparator) {
        this.monetaryDecimalSeparator = monetaryDecimalSeparator;
    }

    public String getExponentSeparator() {
        return exponentSeparator;
    }

    public void setExponentSeparator(String exponentSeparator) {
        this.exponentSeparator = exponentSeparator;
    }

    public void setLocale(TLocale locale) {
        this.locale = locale;
    }

    // Fork addition: Object.clone() is broken on the WasmGC backend — the copy it allocates has no
    // vtable, so the first virtual call on the copy traps with "dereferencing a null pointer".
    // TDecimalFormat clones its symbols on construction, which is what made every %f/%e conversion
    // die inside DecimalFormat.forDigit; copy the fields explicitly instead.
    @Override
    public Object clone() {
        return new TDecimalFormatSymbols(this);
    }
}

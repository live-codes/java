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
package org.teavm.classlib.java.io;

import java.io.IOException;
import java.io.Writer;
import java.util.Objects;
import org.teavm.classlib.java.lang.TMath;
import org.teavm.classlib.java.lang.TObject;
import org.teavm.classlib.java.lang.TReadable;
import org.teavm.classlib.java.nio.TCharBuffer;
import org.teavm.classlib.java.nio.TReadOnlyBufferException;

public abstract class TReader implements TCloseable, TReadable {
    protected TObject lock;

    protected TReader() {
        this(new TObject());
    }

    protected TReader(TObject lock) {
        this.lock = lock;
    }

    public int read() throws IOException {
        char[] buf = new char[1];
        return read(buf) >= 0 ? buf[0] : -1;
    }

    public int read(char[] cbuf) throws IOException {
        return read(cbuf, 0, cbuf.length);
    }

    public abstract int read(char[] cbuf, int off, int len) throws IOException;

    @Override
    public int read(TCharBuffer cb) throws IOException {
        if (!cb.hasRemaining()) {
            return 0;
        }
        if (cb.isReadOnly()) {
            throw new TReadOnlyBufferException();
        }
        int bytesRead;
        if (cb.hasArray()) {
            bytesRead = read(cb.array(), cb.position() + cb.arrayOffset(), cb.remaining());
            if (bytesRead > 0) {
                cb.position(cb.position() + bytesRead);
            }
        } else {
            var array = new char[cb.remaining()];
            bytesRead = read(array);
            if (bytesRead > 0) {
                cb.put(array, 0, bytesRead);
            }
        }
        return bytesRead;
    }

    public long skip(long n) throws IOException {
        char[] buffer = new char[1024];
        long skipped = 0;
        while (skipped < n) {
            int charsRead = read(buffer, 0, (int) TMath.min(n, buffer.length));
            if (charsRead < 0) {
                break;
            }
            skipped += charsRead;
        }
        return skipped;
    }

    public boolean ready() throws IOException {
        return false;
    }

    public boolean markSupported() {
        return false;
    }

    public void mark(@SuppressWarnings("unused") int readAheadLimit) throws IOException {
        throw new IOException();
    }

    public void reset() throws IOException {
        throw new IOException();
    }

    /**
     * Fork addition: the Java 10 method. TeaVM 0.14.1's class library predates it, but its own
     * {@code TFiles.readString}, {@code writeString} and {@code copy} call it — so those failed to
     * compile against the generated SDK, with "Method java.io.BufferedReader.transferTo(Ljava/io/Writer;)J
     * was not found". Reads to end of stream and writes everything to {@code out}.
     */
    public long transferTo(Writer out) throws IOException {
        Objects.requireNonNull(out, "out");
        char[] buffer = new char[8192];
        long transferred = 0;
        int charsRead;
        while ((charsRead = read(buffer, 0, buffer.length)) >= 0) {
            out.write(buffer, 0, charsRead);
            transferred += charsRead;
        }
        return transferred;
    }
}

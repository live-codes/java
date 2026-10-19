/*
 *  Copyright 2019 Alexey Andreev.
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
package org.teavm.runtime.fs.memory;

import java.io.IOException;
import org.teavm.interop.Export;
import org.teavm.jso.JSBody;
import org.teavm.runtime.fs.VirtualFile;
import org.teavm.runtime.fs.VirtualFileAccessor;
import org.teavm.runtime.fs.VirtualFileSystem;
import org.teavm.runtime.fs.VirtualFileSystemProvider;

public class InMemoryVirtualFileSystem implements VirtualFileSystem {
    /** Fork addition: whether paths behave like Windows. The host sets it before the module starts. */
    private static final boolean WINDOWS = windowsPaths();

    /** Fork addition: the header of a snapshot, so a stale or foreign value is ignored, not parsed. */
    private static final String SNAPSHOT_HEADER = "TEAVMFS1\n";

    InMemoryVirtualDirectory root = new InMemoryVirtualDirectory("");
    private String userDir = "/";

    public InMemoryVirtualFileSystem() {
        // Fork addition. This file system is the whole file model in a browser: it starts empty, and
        // `File.createTempFile` / `Files.createTempFile` start from `System.getProperty("java.io.tmpdir")`
        // -- "/tmp" here (TSystem.getTempDir()) -- so without this they fail with "Directory does not
        // exist" before the program does anything. Creating it costs one empty map entry.
        root.createDirectory("tmp");
    }

    @Override
    public VirtualFile getFile(String path) {
        ensureRestored();
        // Fork addition: paths are stored with forward slashes, whatever the platform spells them with.
        return new VirtualFileImpl(this, WINDOWS ? path.replace('\\', '/') : path);
    }

    @Override
    public String getUserDir() {
        return userDir;
    }

    public void setUserDir(String userDir) {
        this.userDir = userDir;
    }

    @Override
    public boolean isWindows() {
        return WINDOWS;
    }

    @Override
    public String canonicalize(String path) {
        return path;
    }

    @Override
    public String[] getRoots() {
        return new String[] { "" };
    }

    /* ---- Fork additions below: platform flag, and persistence through the host ---- */

    private boolean restored;

    /**
     * Fork addition: restore on first use, not in the constructor. The file system is created while
     * DefaultFileSystem's static initializer runs, which is early enough that charsets do not exist
     * yet -- String.getBytes(ISO_8859_1) traps there.
     */
    private void ensureRestored() {
        if (restored) {
            return;
        }
        restored = true;
        restoreFrom(loadSnapshot());
    }

    @JSBody(params = { }, script = "return globalThis.__teavmWindowsPaths === true;")
    private static native boolean windowsPaths();

    @JSBody(params = { }, script = """
            return globalThis.teavmFile && typeof globalThis.teavmFile.loadFileSystem === 'function'
                    ? globalThis.teavmFile.loadFileSystem() : null;
            """)
    private static native String loadSnapshot();

    @JSBody(params = { "snapshot" }, script = """
            if (globalThis.teavmFile && typeof globalThis.teavmFile.saveFileSystem === 'function') {
                globalThis.teavmFile.saveFileSystem(snapshot);
            }
            """)
    private static native void saveSnapshot(String snapshot);

    /**
     * Fork addition: called by the host when a program finishes, so it can keep the file system for the
     * next run. Exported rather than done automatically so a host that does not want persistence pays
     * nothing for it.
     */
    @Export(name = "teavm_fs_snapshot")
    public static void snapshotToHost() {
        if (!(VirtualFileSystemProvider.getInstance() instanceof InMemoryVirtualFileSystem fileSystem)) {
            return;
        }
        var builder = new StringBuilder(SNAPSHOT_HEADER);
        snapshotDirectory(fileSystem.root, "", builder);
        saveSnapshot(builder.toString());
    }

    private static void snapshotDirectory(InMemoryVirtualDirectory directory, String path, StringBuilder builder) {
        for (var child : directory.children.values()) {
            var childPath = path.isEmpty() ? child.getName() : path + "/" + child.getName();
            if (child instanceof InMemoryVirtualDirectory childDirectory) {
                builder.append('D').append(':').append(childPath.length()).append(':').append('0').append('\n')
                        .append(childPath);
                snapshotDirectory(childDirectory, childPath, builder);
            } else if (child instanceof InMemoryVirtualFile file) {
                var data = readFile(file);
                if (data == null) {
                    continue;
                }
                builder.append('F').append(':').append(childPath.length()).append(':').append(data.length)
                        .append('\n').append(childPath).append(bytesToChars(data));
            }
        }
    }

    private static byte[] readFile(InMemoryVirtualFile file) {
        var accessor = file.createAccessor(true, false, false);
        if (accessor == null) {
            return null;
        }
        try {
            int size = accessor.size();
            var data = new byte[size];
            int offset = 0;
            while (offset < size) {
                int count = accessor.read(data, offset, size - offset);
                if (count <= 0) {
                    break;
                }
                offset += count;
            }
            return data;
        } catch (IOException e) {
            return null;
        } finally {
            try {
                accessor.close();
            } catch (IOException e) {
                // nothing useful to do about a close failure on a read-only view
            }
        }
    }

    private void restoreFrom(String snapshot) {
        if (snapshot == null || !snapshot.startsWith(SNAPSHOT_HEADER)) {
            return;
        }
        int position = SNAPSHOT_HEADER.length();
        while (position < snapshot.length()) {
            int first = snapshot.indexOf(':', position);
            int second = first < 0 ? -1 : snapshot.indexOf(':', first + 1);
            int headerEnd = second < 0 ? -1 : snapshot.indexOf('\n', second + 1);
            if (first < 0 || second < 0 || headerEnd < 0) {
                return;
            }
            char kind = snapshot.charAt(position);
            int pathLength;
            int dataLength;
            try {
                pathLength = Integer.parseInt(snapshot.substring(first + 1, second));
                dataLength = Integer.parseInt(snapshot.substring(second + 1, headerEnd));
            } catch (NumberFormatException e) {
                return;
            }
            int pathStart = headerEnd + 1;
            int dataStart = pathStart + pathLength;
            if (dataStart + dataLength > snapshot.length()) {
                return;
            }
            var path = snapshot.substring(pathStart, dataStart);
            if (kind == 'D') {
                ensureDirectory(path);
            } else if (kind == 'F') {
                var data = charsToBytes(snapshot.substring(dataStart, dataStart + dataLength));
                restoreFile(path, data);
            }
            position = dataStart + dataLength;
        }
    }

    /**
     * Fork addition: bytes to characters, one to one. A charset would be the obvious way to encode the
     * payload, but this runs while the class library is still initializing (the file system is created
     * from DefaultFileSystem's static initializer) and Charset.encode is not usable yet.
     */
    private static String bytesToChars(byte[] data) {
        var chars = new char[data.length];
        for (int i = 0; i < data.length; ++i) {
            chars[i] = (char) (data[i] & 0xff);
        }
        return new String(chars);
    }

    private static byte[] charsToBytes(String text) {
        var data = new byte[text.length()];
        for (int i = 0; i < data.length; ++i) {
            data[i] = (byte) text.charAt(i);
        }
        return data;
    }

    private InMemoryVirtualDirectory ensureDirectory(String path) {
        var current = root;
        for (var part : path.split("/")) {
            if (part.isEmpty()) {
                continue;
            }
            Object child = current.getChildFile(part);
            if (child == null) {
                child = current.createDirectory(part);
            }
            if (!(child instanceof InMemoryVirtualDirectory directory)) {
                return null;
            }
            current = directory;
        }
        return current;
    }

    private void restoreFile(String path, byte[] data) {
        int slash = path.lastIndexOf('/');
        var parent = ensureDirectory(slash < 0 ? "" : path.substring(0, slash));
        if (parent == null) {
            return;
        }
        var name = slash < 0 ? path : path.substring(slash + 1);
        Object child = parent.getChildFile(name);
        InMemoryVirtualFile file;
        if (child instanceof InMemoryVirtualFile existing) {
            file = existing;
        } else {
            try {
                file = parent.createFile(name);
            } catch (IOException e) {
                return;
            }
        }
        if (file == null) {
            return;
        }
        var accessor = file.createAccessor(false, true, false);
        if (accessor == null) {
            return;
        }
        try {
            accessor.write(data, 0, data.length);
            accessor.resize(data.length);
            accessor.flush();
        } catch (IOException e) {
            // a file that cannot be restored is simply absent, rather than breaking startup
        } finally {
            try {
                accessor.close();
            } catch (IOException e) {
                // ignore
            }
        }
    }
}

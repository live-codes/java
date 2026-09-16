/*
 *  Copyright 2025 Alexey Andreev.
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

package org.teavm.javac;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.objectweb.asm.AnnotationVisitor;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.FieldVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;

/**
 * Converts TeaVM's class library (packages {@code org.teavm.classlib.java.*} with {@code T}-prefixed
 * type names) into the {@code java.*} shape that javac consumes when compiling user code.
 *
 * <p>Two things in the class library are metadata rather than names, and both have to be applied
 * here or the generated SDK is not the API javac will see at runtime:
 *
 * <ul>
 *   <li>{@code @org.teavm.interop.Rename} — a member is declared under an internal name and renamed
 *       by TeaVM when it builds the runtime (e.g. {@code getClass0} becomes {@code getClass}).
 *       Without applying it, {@code getClass()}, {@code Throwable.getMessage()}, {@code clone()},
 *       {@code notify()} and friends do not resolve for user code.</li>
 *   <li>{@code InnerClasses} — nested types are renamed like any other class, so the
 *       {@code InnerClasses} entries must be renamed with them. Otherwise {@code Map.Entry} does not
 *       resolve even though {@code java/util/Map$Entry.class} is present.</li>
 * </ul>
 */
public class StdlibConverter extends ClassVisitor {
    private static final String PREFIX = "org/teavm/classlib/java/";
    private static final String RENAME_DESC = "Lorg/teavm/interop/Rename;";
    private static final String[] EXCLUDED = {
            "org/teavm/classlib/",
            "org/teavm/jso/impl/",
            "org/teavm/platform",
    };
    boolean visible;
    String className;
    private boolean isInterface;
    private final Map<String, Set<String>> visibleOwners;
    private final Map<String, String> renameTargets;
    /** Members this class has already emitted, so an input that repeats one does not duplicate it. */
    private final Set<String> emitted = new LinkedHashSet<>();
    /** Java-visible {@code name+descriptor} of every non-abstract method of a platform class. */
    private static final Map<String, Set<String>> jdkNonAbstract = new HashMap<>();

    /**
     * @param visibleOwners {@code name+descriptor} as it would look after renaming, mapped to the raw
     *                      names that claim it, so a rename that would duplicate a member is skipped
     * @param renameTargets {@code name+descriptor} to the Java-visible name from {@code @Rename}
     */
    public StdlibConverter(ClassVisitor cv, Map<String, Set<String>> visibleOwners,
            Map<String, String> renameTargets) {
        super(Opcodes.ASM9, cv);
        this.visibleOwners = visibleOwners;
        this.renameTargets = renameTargets;
    }

    @Override
    public void visit(int version, int access, String name, String signature, String superName, String[] interfaces) {
        if ((access & Opcodes.ACC_PRIVATE) != 0) {
            return;
        }
        name = rename(name);
        for (String excluded : EXCLUDED) {
            if (name.startsWith(excluded)) {
                return;
            }
        }

        visible = true;
        className = name;
        isInterface = (access & Opcodes.ACC_INTERFACE) != 0;
        if (superName != null) {
            superName = rename(superName);
        }

        switch (name) {
            case "java/lang/Throwable":
                superName = "java/lang/Object";
                break;
            case "java/lang/RuntimeException":
                superName = "java/lang/Exception";
                break;
        }

        if (interfaces != null) {
            for (int i = 0; i < interfaces.length; ++i) {
                interfaces[i] = rename(interfaces[i]);
            }
            // TeaVM's `TAnnotation` extends the very interface it renames to, which would leave
            // `java.lang.annotation.Annotation` extending itself ("cyclic inheritance").
            interfaces = removeSelfType(interfaces, name);
        }
        if (signature != null) {
            signature = renameClassSignature(signature);
        }

        if (superName.equals(name)) {
            superName = null;
        }
        super.visit(version, access, name, signature, superName, interfaces);
    }

    @Override
    public void visitInnerClass(String name, String outerName, String innerName, int access) {
        super.visitInnerClass(rename(name), outerName != null ? rename(outerName) : null, innerName, access);
    }

    @Override
    public void visitOuterClass(String owner, String name, String descriptor) {
        super.visitOuterClass(rename(owner), name, descriptor);
    }

    @Override
    public void visitNestHost(String nestHost) {
        super.visitNestHost(rename(nestHost));
    }

    @Override
    public void visitNestMember(String nestMember) {
        super.visitNestMember(rename(nestMember));
    }

    @Override
    public FieldVisitor visitField(int access, String name, String desc, String signature, Object value) {
        if ((access & Opcodes.ACC_PUBLIC) == 0 && ((access & Opcodes.ACC_PROTECTED) == 0)) {
            return null;
        }
        String visibleDesc = renameDesc(desc);
        name = renameMember(name, desc, visibleDesc);
        desc = visibleDesc;
        if (!emitted.add(name + desc)) {
            return null;
        }
        if (signature != null) {
            signature = renameFieldSignature(signature);
        }
        return new FieldVisitorImpl(super.visitField(access, name, desc, signature, value));
    }

    @Override
    public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
        if (className != null && className.equals("java/lang/System")) {
            if (name.equals("out") || name.equals("err") || name.equals("in")) {
                FieldVisitor fv = super.visitField(access, name, renameDesc(Type.getReturnType(desc).getDescriptor()),
                        null, null);
                fv.visitEnd();
                return null;
            }
        }

        if ((access & Opcodes.ACC_PUBLIC) == 0 && ((access & Opcodes.ACC_PROTECTED) == 0)) {
            return null;
        }
        String visibleDesc = renameMethodDesc(desc);
        name = renameMember(name, desc, visibleDesc);
        desc = visibleDesc;
        if (!emitted.add(name + desc)) {
            return null;
        }
        access = relaxAbstract(access, name, desc);
        if (signature != null) {
            signature = renameMethodSignature(signature);
        }

        if (exceptions != null) {
            for (int i = 0; i < exceptions.length; ++i) {
                exceptions[i] = rename(exceptions[i]);
            }
        }
        return new MethodVisitorImpl(super.visitMethod(access, name, desc, signature, exceptions));
    }

    /**
     * Applies {@code @Rename}. Constructors keep their special names, and a rename is skipped when a
     * sibling member already answers to the same Java-visible signature — the class file must not end
     * up with two members of one name and descriptor ({@code equals0(TObject)} is {@code @Rename}
     * "equals" but {@code equals(Object)} exists, and both descriptors rename to the same thing).
     */
    private String renameMember(String name, String desc, String visibleDesc) {
        if (name.equals("<init>") || name.equals("<clinit>")) {
            return name;
        }
        String target = renameTargets.get(name + desc);
        if (target == null || target.equals(name)) {
            return name;
        }
        // A static factory that TeaVM turns into a constructor (`TThrowable.init` is @Rename
        // "<init>") must stay a method here: the class already has a constructor with that
        // descriptor, and javac rejects two of them.
        if (target.charAt(0) == '<') {
            return name;
        }
        Set<String> owners = visibleOwners.get(target + visibleDesc);
        if (owners != null && owners.size() > 1) {
            return name;
        }
        return target;
    }

    private static String[] removeSelfType(String[] interfaces, String name) {
        for (var type : interfaces) {
            if (type.equals(name)) {
                var result = new String[interfaces.length - 1];
                var count = 0;
                for (var other : interfaces) {
                    if (!other.equals(name)) {
                        result[count++] = other;
                    }
                }
                return result;
            }
        }
        return interfaces;
    }

    /**
     * TeaVM's class library declares some interfaces by hand, and where it does, a member the JDK
     * implements as a {@code default} method comes out abstract. javac then demands that every
     * implementer supply it — {@code implements CharSequence} fails with "does not override abstract
     * method isEmpty()", and the same happens for {@code Iterator.remove()}. The platform the compiler
     * runs on knows the real answer, so ask it and drop the flag when the JDK has a body.
     */
    private int relaxAbstract(int access, String name, String desc) {
        if (!isInterface || (access & Opcodes.ACC_ABSTRACT) == 0
                || className == null || !className.startsWith("java/")) {
            return access;
        }
        if (jdkNonAbstract.computeIfAbsent(className, StdlibConverter::nonAbstractMethods)
                .contains(name + desc)) {
            return access & ~Opcodes.ACC_ABSTRACT;
        }
        return access;
    }

    private static Set<String> nonAbstractMethods(String className) {
        var result = new LinkedHashSet<String>();
        try {
            var type = Class.forName(className.replace('/', '.'), false, ClassLoader.getPlatformClassLoader());
            for (var method : type.getDeclaredMethods()) {
                if (!java.lang.reflect.Modifier.isAbstract(method.getModifiers())) {
                    result.add(method.getName() + Type.getMethodDescriptor(method));
                }
            }
        } catch (ClassNotFoundException | LinkageError e) {
            // Not in this JDK (TeaVM ships a few java.* classes of its own) — leave the flags alone.
        }
        return result;
    }

    @Override
    public AnnotationVisitor visitAnnotation(String desc, boolean visible) {
        return super.visitAnnotation(desc, visible);
    }

    class FieldVisitorImpl extends FieldVisitor {
        FieldVisitorImpl(FieldVisitor fv) {
            super(Opcodes.ASM5, fv);
        }

        @Override
        public AnnotationVisitor visitAnnotation(String desc, boolean visible) {
            if (!visible) {
                return null;
            }
            desc = renameDesc(desc);
            return new AnnotationVisitorImpl(super.visitAnnotation(desc, visible));
        }
    }

    class MethodVisitorImpl extends MethodVisitor {
        MethodVisitorImpl(MethodVisitor mv) {
            super(Opcodes.ASM5, mv);
        }

        @Override
        public AnnotationVisitor visitAnnotation(String desc, boolean visible) {
            if (!visible) {
                return null;
            }
            desc = renameDesc(desc);
            return new AnnotationVisitorImpl(super.visitAnnotation(desc, visible));
        }
    }

    class AnnotationVisitorImpl extends AnnotationVisitor {
        AnnotationVisitorImpl(AnnotationVisitor av) {
            super(Opcodes.ASM5, av);
        }

        @Override
        public AnnotationVisitor visitAnnotation(String name, String desc) {
            if (!visible) {
                return null;
            }
            desc = renameDesc(desc);
            return new AnnotationVisitorImpl(super.visitAnnotation(name, desc));
        }

        @Override
        public void visit(String name, Object value) {
            if (value instanceof Type) {
                value = Type.getType(renameDesc(((Type) value).getDescriptor()));
            }
            super.visit(name, value);
        }
    }

    private static String rename(String className) {
        if (className.startsWith(PREFIX)) {
            int slashIndex = className.lastIndexOf('/');
            if (className.charAt(slashIndex + 1) != 'T') {
                return className;
            }

            return "java/" + className.substring(PREFIX.length(), slashIndex) + "/" + className.substring(
                    slashIndex + 2);
        } else if (className.startsWith("org/threeten/bp/")) {
            return "java/time/" + className.substring("org/threeten/bp/".length());
        } else {
            return className;
        }
    }

    private static String renameDesc(String desc) {
        DescRename rename = new DescRename(desc);
        rename.renameType();
        return rename.sb.toString();
    }

    private static String renameMethodDesc(String desc) {
        DescRename rename = new DescRename(desc);
        assert desc.charAt(0) == '(';
        rename.sb.append('(');
        rename.index++;
        while (desc.charAt(rename.index) != ')') {
            rename.renameType();
        }
        rename.sb.append(')');
        rename.index++;
        rename.renameType();
        return rename.sb.toString();
    }

    static class DescRename {
        String desc;
        StringBuilder sb;
        int index;

        DescRename(String desc) {
            this.desc = desc;
            sb = new StringBuilder(desc.length());
        }

        void renameType() {
            char c = desc.charAt(index);
            switch (c) {
                case 'Z':
                case 'B':
                case 'C':
                case 'S':
                case 'I':
                case 'J':
                case 'F':
                case 'D':
                case 'V':
                    sb.append(c);
                    index++;
                    break;
                case '[':
                    sb.append(c);
                    index++;
                    renameType();
                    break;
                case 'L':
                    sb.append(c);
                    int classStart = ++index;
                    index = desc.indexOf(';', index);
                    sb.append(rename(desc.substring(classStart, index)));
                    sb.append(';');
                    index++;
                    break;
            }
        }
    }

    private String renameClassSignature(String signature) {
        SignatureRename rename = new SignatureRename(signature);

        if (rename.current() == '<') {
            renameTypeParameters(rename);
        }

        while (rename.hasMore()) {
            rename.renameClassType();
        }
        return rename.sb.toString();
    }

    private String renameFieldSignature(String signature) {
        SignatureRename rename = new SignatureRename(signature);
        rename.renameFieldType();
        return rename.sb.toString();
    }

    private String renameMethodSignature(String signature) {
        SignatureRename rename = new SignatureRename(signature);

        if (rename.current() == '<') {
            renameTypeParameters(rename);
        }

        assert rename.current() == '(';
        rename.nextChar();
        while (rename.current() != ')') {
            rename.renameType();
        }
        rename.nextChar();
        rename.renameType();

        while (rename.hasMore() && rename.current() == '^') {
            rename.nextChar();
            rename.renameFieldType();
        }
        return rename.sb.toString();
    }

    private void renameTypeParameters(SignatureRename rename) {
        rename.nextChar();
        while (rename.current() != '>') {
            rename.skipIdentifier();
            while (rename.current() == ':') {
                rename.nextChar();
                if (rename.current() != ':' && rename.current() != '>') {
                    rename.renameFieldType();
                }
            }
        }
        rename.nextChar();
    }

    class SignatureRename {
        StringBuilder sb;
        String signature;
        int index;

        SignatureRename(String signature) {
            this.signature = signature;
            sb = new StringBuilder(signature.length());
        }

        char current() {
            return signature.charAt(index);
        }

        boolean hasMore() {
            return index < signature.length();
        }

        void nextChar() {
            sb.append(signature.charAt(index++));
        }

        void skipIdentifier() {
            loop: while (index < signature.length()) {
                switch (current()) {
                    case '.':
                    case ';':
                    case '[':
                    case '/':
                    case '<':
                    case '>':
                    case ':':
                        break loop;
                    default:
                        nextChar();
                        break;
                }
            }
        }

        void renameType() {
            switch (current()) {
                case 'Z':
                case 'B':
                case 'C':
                case 'S':
                case 'I':
                case 'J':
                case 'F':
                case 'D':
                case 'V':
                    nextChar();
                    break;
                default:
                    renameFieldType();
                    break;
            }
        }

        void renameFieldType() {
            switch (current()) {
                case 'L':
                    renameClassType();
                    break;
                case 'T':
                    nextChar();
                    skipIdentifier();
                    assert current() == ';';
                    nextChar();
                    break;
                case '[':
                    nextChar();
                    renameType();
                    break;
            }
        }

        void renameClassType() {
            assert current() == 'L';
            nextChar();

            StringBuilder name = new StringBuilder();
            while (current() != '<' && current() != '.' && current() != ';') {
                name.append(signature.charAt(index++));
            }
            sb.append(rename(name.toString()));

            if (current() == '<') {
                nextChar();
                renameTypeArguments();
            }

            while (current() == '.') {
                nextChar();
                renameSimpleClassType();
            }

            assert current() == ';';
            nextChar();
        }

        void renameSimpleClassType() {
            while (current() != '<' && current() != '.' && current() != ';') {
                nextChar();
            }

            if (current() == '<') {
                nextChar();
                renameTypeArguments();
            }
        }

        void renameTypeArguments() {
            while (current() != '>') {
                if (current() == '*') {
                    nextChar();
                    continue;
                }
                if (current() == '+' || current() == '-') {
                    nextChar();
                }
                renameFieldType();
            }
            nextChar();
        }
    }

    /**
     * Collects a class's declared members and its {@code @Rename} targets before conversion, because
     * the converter has to know both before it can emit any member.
     */
    static class MemberScanner extends ClassVisitor {
        private final List<String[]> members = new ArrayList<>();
        private final Map<String, String> renameTargets = new HashMap<>();

        MemberScanner() {
            super(Opcodes.ASM9);
        }

        @Override
        public FieldVisitor visitField(int access, String name, String desc, String signature, Object value) {
            members.add(new String[] { name, desc, renameDesc(desc) });
            String key = name + desc;
            return new FieldVisitor(Opcodes.ASM9) {
                @Override
                public AnnotationVisitor visitAnnotation(String desc, boolean visible) {
                    return capture(key, desc);
                }
            };
        }

        @Override
        public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
            members.add(new String[] { name, desc, renameMethodDesc(desc) });
            String key = name + desc;
            return new MethodVisitor(Opcodes.ASM9) {
                @Override
                public AnnotationVisitor visitAnnotation(String desc, boolean visible) {
                    return capture(key, desc);
                }
            };
        }

        /**
         * Java-visible {@code name+descriptor} to the raw names that would answer to it. More than one
         * raw name means a rename would produce a duplicate member, so it has to be left alone.
         */
        Map<String, Set<String>> visibleOwners() {
            Map<String, Set<String>> owners = new HashMap<>();
            for (String[] member : members) {
                String target = renameTargets.get(member[0] + member[1]);
                String visibleName = target != null ? target : member[0];
                owners.computeIfAbsent(visibleName + member[2], key -> new LinkedHashSet<>()).add(member[0]);
            }
            return owners;
        }

        Map<String, String> renameTargets() {
            return renameTargets;
        }

        private AnnotationVisitor capture(String key, String desc) {
            if (!RENAME_DESC.equals(desc)) {
                return null;
            }
            return new AnnotationVisitor(Opcodes.ASM9) {
                @Override
                public void visit(String name, Object value) {
                    if ("value".equals(name) && value instanceof String) {
                        renameTargets.put(key, (String) value);
                    }
                }
            };
        }
    }

    public static void main(String[] args) throws IOException {
        try (var output = new ArchiveBuilder(new FileOutputStream(args[0]))) {
            var packageNames = new LinkedHashSet<String>();
            for (var i = 1; i < args.length; ++i) {
                var file = new File(args[i]);
                if (file.isFile()) {
                    try (var input = new ZipInputStream(new FileInputStream(args[i]))) {
                        while (true) {
                            ZipEntry entry = input.getNextEntry();
                            if (entry == null) {
                                break;
                            }
                            if (entry.isDirectory() || !entry.getName().endsWith(".class")) {
                                continue;
                            }

                            addFile(input, output, packageNames);
                        }
                    }
                } else {
                    try (var stream = Files.walk(file.toPath())) {
                        stream.forEach(path -> {
                            if (Files.isRegularFile(path) && path.getFileName().toString().endsWith(".class")) {
                                try {
                                    addFile(Files.newInputStream(path), output, packageNames);
                                } catch (IOException e) {
                                    throw new UncheckedIOException(e);
                                }
                            }
                        });
                    }
                }
            }
            if (!packageNames.isEmpty()) {
                var writer = new ClassWriter(0);
                writer.visit(Opcodes.V21, Opcodes.ACC_MODULE, "java.base", null, null, null);
                var mv = writer.visitModule("java.base", Opcodes.ACC_OPEN, null);
                for (var packageName : packageNames) {
                    mv.visitExport(packageName, 0, (String[]) null);
                }
                mv.visitEnd();
                output.append("module-info.class", writer.toByteArray());
            }
        }
    }

    private static void addFile(InputStream input, ArchiveBuilder output, Set<String> packageNames)
            throws IOException {
        byte[] classBytes = input.readAllBytes();
        ClassReader reader = new ClassReader(classBytes);

        MemberScanner scanner = new MemberScanner();
        reader.accept(scanner, ClassReader.SKIP_CODE | ClassReader.SKIP_FRAMES | ClassReader.SKIP_DEBUG);

        ClassWriter writer = new ClassWriter(0);
        StdlibConverter converter = new StdlibConverter(writer, scanner.visibleOwners(), scanner.renameTargets());
        reader.accept(converter, ClassReader.SKIP_CODE | ClassReader.SKIP_FRAMES
                | ClassReader.SKIP_DEBUG);
        if (converter.visible) {
            var outputName = converter.className + ".class";
            output.append(outputName, writer.toByteArray());
        }
        if (converter.className != null) {
            var index = converter.className.lastIndexOf('/');
            if (index > 0) {
                packageNames.add(converter.className.substring(0, index));
            }
        }
    }
}

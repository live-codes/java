// Second half of the corpus. Same rules as programs.mjs: a self-contained
// `public class Main` per program, deterministic output only (sorted where
// iteration order would otherwise vary between engines).

export const PROGRAMS_EXTRA = [
  {
    id: 'operators',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    int a = 0b1010, b = 0b0110;
    System.out.println((a & b) + " " + (a | b) + " " + (a ^ b) + " " + (~a));
    System.out.println((5 << 2) + " " + (-16 >> 2) + " " + (-16 >>> 28));
    int x = 5;
    System.out.println((x++ + ++x) + " " + (x += 3) + " " + (x > 10 ? "big" : "small"));
    System.out.println((true && false) + " " + (true || false) + " " + (1 == 1 && 2 != 3));
  }
}`,
  },
  {
    id: 'numeric-limits',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println(Integer.MAX_VALUE + 1);
    System.out.println(Long.MAX_VALUE + " " + Long.MIN_VALUE);
    System.out.println(Integer.bitCount(255) + " " + Integer.highestOneBit(100) + " " + Integer.numberOfTrailingZeros(8));
    System.out.println(Integer.parseInt("7f", 16) + " " + Long.toHexString(255L) + " " + Integer.toString(-5, 2));
    System.out.println(Math.addExact(1, 2) + " " + Math.floorDiv(-7, 2) + " " + Math.floorMod(-7, 2));
  }
}`,
  },
  {
    id: 'control-flow',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    int total = 0;
    outer: for (int i = 0; i < 5; i++) {
      for (int j = 0; j < 5; j++) {
        if (j > i) continue outer;
        if (i == 3 && j == 2) break outer;
        total++;
      }
    }
    System.out.println("total=" + total);
    int n = 3;
    do { n--; } while (n > 0);
    System.out.println("n=" + n);
    for (int i = 0; i < 3; i++) { if (i == 1) continue; System.out.println("i=" + i); }
  }
}`,
  },
  {
    id: 'switch-forms',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    for (String s : new String[]{"a", "b", "z"}) {
      switch (s) {
        case "a": System.out.println("A"); break;
        case "b": System.out.println("B"); break;
        default: System.out.println("?");
      }
    }
    int n = 2;
    switch (n) {
      case 1:
      case 2: System.out.println("one-or-two");
      case 3: System.out.println("falls through to three"); break;
      default: System.out.println("other");
    }
  }
}`,
  },
  {
    id: 'static-init',
    area: 'oop',
    source: `public class Main {
  static int counter;
  static { counter = 10; System.out.println("static block counter=" + counter); }
  int instance = ++counter;
  { System.out.println("instance block instance=" + instance); }
  Main() { System.out.println("ctor instance=" + instance + " counter=" + counter); }
  public static void main(String[] args) {
    new Main();
    new Main();
    System.out.println("final counter=" + counter);
  }
}`,
  },
  {
    id: 'enum-abstract',
    area: 'oop',
    source: `public class Main {
  enum Op {
    ADD { int apply(int a, int b) { return a + b; } },
    MUL { int apply(int a, int b) { return a * b; } };
    abstract int apply(int a, int b);
  }
  public static void main(String[] args) {
    for (Op op : Op.values()) System.out.println(op + "=" + op.apply(3, 4));
    System.out.println(Op.valueOf("ADD").ordinal() + " " + Op.MUL.name());
  }
}`,
  },
  {
    id: 'abstract-polymorphism',
    area: 'oop',
    source: `abstract class Animal {
  private final String name;
  Animal(String name) { this.name = name; }
  String name() { return name; }
  abstract String sound();
  String describe() { return name + " says " + sound(); }
}
class Dog extends Animal { Dog() { super("dog"); } String sound() { return "woof"; } }
class Cat extends Animal { Cat() { super("cat"); } String sound() { return "meow"; } }
public class Main {
  public static void main(String[] args) {
    Animal[] animals = { new Dog(), new Cat(), new Animal("x") { String sound() { return "?"; } } };
    for (Animal a : animals) System.out.println(a.describe());
  }
}`,
  },
  {
    id: 'covariant-override',
    area: 'oop',
    source: `class Base {
  Object get() { return "base"; }
  Base self() { return this; }
}
class Derived extends Base {
  @Override String get() { return "derived"; }
  @Override Derived self() { return this; }
  String extra() { return "extra"; }
}
public class Main {
  public static void main(String[] args) {
    Base b = new Derived();
    System.out.println(b.get());
    System.out.println(((Derived) b.self()).extra());
    System.out.println(b instanceof Derived);
  }
}`,
  },
  {
    id: 'constructor-chain',
    area: 'oop',
    source: `public class Main {
  static class A { A() { System.out.println("A"); } A(int x) { this(); System.out.println("A" + x); } }
  static class B extends A { B() { super(1); System.out.println("B"); } }
  public static void main(String[] args) {
    new B();
    System.out.println("done");
  }
}`,
  },
  {
    id: 'overloading',
    area: 'oop',
    source: `public class Main {
  static String pick(int x) { return "int"; }
  static String pick(long x) { return "long"; }
  static String pick(Integer x) { return "Integer"; }
  static String pick(Object x) { return "Object"; }
  static String pick(int... x) { return "varargs"; }
  public static void main(String[] args) {
    System.out.println(pick(1));
    System.out.println(pick(1L));
    System.out.println(pick(Integer.valueOf(1)));
    System.out.println(pick("s"));
    System.out.println(pick((Object) null));
    System.out.println(pick(new int[]{1, 2}));
  }
}`,
  },
  {
    id: 'nested-kinds',
    area: 'oop',
    source: `public class Main {
  static int staticField = 1;
  int instanceField = 2;
  static class StaticNested { int get() { return staticField; } }
  class Inner { int get() { return instanceField + staticField; } }
  interface Callback { int call(); }
  public static void main(String[] args) {
    Main m = new Main();
    System.out.println(new StaticNested().get() + " " + m.new Inner().get());
    Callback c = () -> 42;
    System.out.println(c.call());
    class Local { int v() { return 7; } }
    System.out.println(new Local().v());
  }
}`,
  },
  {
    id: 'generics-bounds',
    area: 'collections',
    source: `import java.util.Arrays;
import java.util.List;

public class Main {
  static <T extends Comparable<T>> T max(List<T> xs) {
    T best = xs.get(0);
    for (T x : xs) if (x.compareTo(best) > 0) best = x;
    return best;
  }
  static <T extends Number & Comparable<T>> String describe(T n) { return n.getClass().getSimpleName() + ":" + n; }
  public static void main(String[] args) {
    System.out.println(max(Arrays.asList(3, 9, 4)));
    System.out.println(max(Arrays.asList("b", "c", "a")));
    System.out.println(describe(5) + " " + describe(2.5));
  }
}`,
  },
  {
    id: 'generics-wildcards',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class Main {
  static double sum(List<? extends Number> xs) { double t = 0; for (Number n : xs) t += n.doubleValue(); return t; }
  static void fill(List<? super Integer> xs) { xs.add(1); xs.add(2); }
  static void copy(List<? super String> to, List<? extends String> from) { for (String s : from) to.add(s); }
  public static void main(String[] args) {
    System.out.println(sum(Arrays.asList(1, 2.5, 3L)));
    List<Object> objs = new ArrayList<>();
    fill(objs);
    copy(objs, Arrays.asList("a", "b"));
    System.out.println(objs);
    List<?> unknown = Arrays.asList(1, "two", 3.0);
    System.out.println(unknown.size() + " " + unknown.get(1));
  }
}`,
  },
  {
    id: 'generics-inference',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
  static <K, V> Map<K, V> mapOf(K k, V v) { Map<K, V> m = new HashMap<>(); m.put(k, v); return m; }
  static <T> List<T> listOf(T... xs) { return new ArrayList<>(java.util.Arrays.asList(xs)); }
  public static void main(String[] args) {
    Map<String, List<Integer>> m = mapOf("a", listOf(1, 2, 3));
    System.out.println(m);
    var inferred = listOf("x", "y");
    System.out.println(inferred.getClass().getSimpleName() + " " + inferred);
    Map<String, Integer> counts = new HashMap<>();
    for (String s : new String[]{"a", "b", "a"}) counts.merge(s, 1, Integer::sum);
    System.out.println(new java.util.TreeMap<>(counts));
  }
}`,
  },
  {
    id: 'list-deque-queue',
    area: 'collections',
    source: `import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedList;
import java.util.PriorityQueue;
import java.util.Queue;

public class Main {
  public static void main(String[] args) {
    Deque<Integer> d = new ArrayDeque<>();
    d.addFirst(2); d.addLast(3); d.push(1);
    System.out.println(d + " peek=" + d.peek() + " poll=" + d.poll());
    Queue<String> q = new LinkedList<>();
    q.offer("a"); q.offer("b");
    System.out.println(q.poll() + q.poll() + " empty=" + q.isEmpty());
    PriorityQueue<Integer> pq = new PriorityQueue<>();
    pq.addAll(java.util.Arrays.asList(5, 1, 3));
    StringBuilder sb = new StringBuilder();
    while (!pq.isEmpty()) sb.append(pq.poll());
    System.out.println(sb);
  }
}`,
  },
  {
    id: 'map-impls',
    area: 'collections',
    source: `import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

public class Main {
  public static void main(String[] args) {
    Map<String, Integer> linked = new LinkedHashMap<>();
    for (String k : new String[]{"z", "a", "m"}) linked.put(k, k.length());
    System.out.println(linked);
    System.out.println(new TreeMap<>(linked));
    TreeMap<String, Integer> tm = new TreeMap<>(linked);
    System.out.println(tm.firstKey() + " " + tm.lastKey() + " " + tm.headMap("m") + " " + tm.tailMap("m"));
    System.out.println(tm.descendingMap());
  }
}`,
  },
  {
    id: 'collections-utils',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class Main {
  public static void main(String[] args) {
    List<Integer> xs = new ArrayList<>(Arrays.asList(3, 1, 2));
    Collections.sort(xs);
    Collections.reverse(xs);
    System.out.println(xs + " max=" + Collections.max(xs) + " min=" + Collections.min(xs));
    Collections.swap(xs, 0, 2);
    System.out.println(xs);
    System.out.println(Collections.frequency(xs, 2) + " " + Collections.nCopies(3, "x"));
    List<Integer> ro = Collections.unmodifiableList(xs);
    System.out.println(ro);
    try { ro.add(9); } catch (UnsupportedOperationException e) { System.out.println("unmodifiable"); }
    System.out.println(Collections.emptyList() + " " + Collections.singletonList("s"));
  }
}`,
  },
  {
    id: 'iterator-listiterator',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.ListIterator;

public class Main {
  public static void main(String[] args) {
    List<String> xs = new ArrayList<>(java.util.Arrays.asList("a", "b", "c"));
    for (Iterator<String> it = xs.iterator(); it.hasNext(); ) {
      String s = it.next();
      if (s.equals("b")) it.remove();
    }
    System.out.println(xs);
    ListIterator<String> it = xs.listIterator();
    while (it.hasNext()) { it.set(it.next().toUpperCase()); }
    it.add("Z");
    System.out.println(xs);
    while (it.hasPrevious()) System.out.print(it.previous());
    System.out.println();
  }
}`,
  },
  {
    id: 'sorting-comparators',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public class Main {
  static class Item { final String name; final int qty; Item(String n, int q) { name = n; qty = q; } public String toString() { return name + qty; } }
  public static void main(String[] args) {
    List<Item> items = new ArrayList<>(Arrays.asList(new Item("b", 2), new Item("a", 3), new Item("c", 1)));
    items.sort(Comparator.comparing((Item i) -> i.name));
    System.out.println(items);
    items.sort(Comparator.comparingInt((Item i) -> i.qty).reversed());
    System.out.println(items);
    System.out.println(items.stream().sorted((x, y) -> x.name.compareTo(y.name)).map(Item::toString).toList());
    String[] names = {"Bob", "alice", "Carol"};
    Arrays.sort(names, String.CASE_INSENSITIVE_ORDER);
    System.out.println(Arrays.toString(names));
  }
}`,
  },
  {
    id: 'streams-collectors',
    area: 'functional',
    source: `import java.util.Arrays;
import java.util.IntSummaryStatistics;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class Main {
  public static void main(String[] args) {
    List<String> words = Arrays.asList("apple", "banana", "cherry", "avocado");
    System.out.println(words.stream().collect(Collectors.joining(", ", "[", "]")));
    Map<Character, List<String>> byFirst = words.stream().collect(Collectors.groupingBy(w -> w.charAt(0)));
    System.out.println(new java.util.TreeMap<>(byFirst));
    Map<Integer, Long> byLen = words.stream().collect(Collectors.groupingBy(String::length, Collectors.counting()));
    System.out.println(new java.util.TreeMap<>(byLen));
    Map<Integer, String> merged = words.stream().collect(Collectors.toMap(String::length, w -> w, (a, b) -> a + "/" + b, java.util.TreeMap::new));
    System.out.println(merged);
    IntSummaryStatistics stats = words.stream().mapToInt(String::length).summaryStatistics();
    System.out.println(stats.getCount() + " " + stats.getSum() + " " + stats.getMin() + " " + stats.getMax() + " " + stats.getAverage());
  }
}`,
  },
  {
    id: 'streams-flatmap',
    area: 'functional',
    source: `import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class Main {
  public static void main(String[] args) {
    List<List<Integer>> nested = Arrays.asList(Arrays.asList(1, 2), Arrays.asList(3), List.of(4, 5));
    System.out.println(nested.stream().flatMap(List::stream).collect(Collectors.toList()));
    System.out.println(Stream.of("a b", "c d").flatMap(s -> Arrays.stream(s.split(" "))).collect(Collectors.toList()));
    System.out.println(Stream.iterate(1, n -> n * 2).limit(6).collect(Collectors.toList()));
    System.out.println(Stream.of(5, 3, 9, 1).sorted().skip(1).limit(2).collect(Collectors.toList()));
    System.out.println(Stream.of(1, 2, 3, 4).collect(Collectors.partitioningBy(n -> n % 2 == 0)));
  }
}`,
  },
  {
    id: 'streams-reduce',
    area: 'functional',
    source: `import java.util.Arrays;
import java.util.List;
import java.util.Optional;

public class Main {
  public static void main(String[] args) {
    List<Integer> xs = Arrays.asList(1, 2, 3, 4);
    System.out.println(xs.stream().reduce(0, Integer::sum));
    System.out.println(xs.stream().reduce((a, b) -> a * b).orElse(-1));
    System.out.println(xs.stream().map(String::valueOf).reduce("", (a, b) -> a + b));
    Optional<Integer> max = xs.stream().max(Integer::compareTo);
    System.out.println(max.get());
    System.out.println(xs.stream().anyMatch(n -> n > 3) + " " + xs.stream().allMatch(n -> n > 0) + " " + xs.stream().noneMatch(n -> n > 9));
    System.out.println(xs.stream().count() + " " + xs.stream().findFirst().get());
  }
}`,
  },
  {
    id: 'streams-numbers',
    area: 'functional',
    source: `import java.util.stream.IntStream;
import java.util.stream.LongStream;

public class Main {
  public static void main(String[] args) {
    System.out.println(IntStream.range(0, 5).sum() + " " + IntStream.rangeClosed(1, 5).reduce(1, (a, b) -> a * b));
    System.out.println(IntStream.of(4, 2, 8).min().getAsInt() + " " + IntStream.of(4, 2, 8).max().getAsInt());
    System.out.println(IntStream.of(1, 2, 3).average().getAsDouble());
    System.out.println(LongStream.rangeClosed(1, 5).map(n -> n * n).sum());
    System.out.println(IntStream.rangeClosed(1, 10).filter(n -> n % 3 == 0).boxed().collect(java.util.stream.Collectors.toList()));
    System.out.println(IntStream.of(1, 2, 3).asDoubleStream().sum());
  }
}`,
  },
  {
    id: 'functional-composition',
    area: 'functional',
    source: `import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.function.IntUnaryOperator;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;

public class Main {
  public static void main(String[] args) {
    Function<Integer, Integer> inc = x -> x + 1;
    Function<Integer, Integer> dbl = x -> x * 2;
    System.out.println(inc.compose(dbl).apply(5) + " " + inc.andThen(dbl).apply(5));
    UnaryOperator<String> bang = s -> s + "!";
    System.out.println(bang.apply("hi") + " " + UnaryOperator.<String>identity().apply("id"));
    Predicate<String> nonEmpty = s -> !s.isEmpty();
    System.out.println(nonEmpty.and(s -> s.length() > 2).test("abc") + " " + nonEmpty.negate().test(""));
    BiFunction<Integer, Integer, Integer> add = Integer::sum;
    System.out.println(add.apply(2, 3));
    IntUnaryOperator triple = n -> n * 3;
    System.out.println(triple.applyAsInt(4));
  }
}`,
  },
  {
    id: 'exceptions-multicatch',
    area: 'errors',
    source: `public class Main {
  static String classify(int n) {
    try {
      if (n == 0) throw new IllegalStateException("zero");
      if (n == 1) throw new NumberFormatException("one");
      if (n == 2) throw new RuntimeException(new java.io.IOException("cause"));
      return "ok";
    } catch (IllegalStateException | NumberFormatException e) {
      return "value:" + e.getMessage();
    } catch (RuntimeException e) {
      return "wrapped:" + e.getCause().getMessage();
    }
  }
  public static void main(String[] args) {
    for (int i = 0; i < 4; i++) System.out.println(classify(i));
  }
}`,
  },
  {
    id: 'exceptions-finally',
    area: 'errors',
    source: `public class Main {
  static int withFinally(int n) {
    try {
      if (n > 0) return 1;
      throw new IllegalArgumentException("neg");
    } catch (IllegalArgumentException e) {
      return 2;
    } finally {
      System.out.println("finally " + n);
    }
  }
  static int overrideReturn() {
    try { return 1; } finally { return 2; }
  }
  public static void main(String[] args) {
    System.out.println(withFinally(1));
    System.out.println(withFinally(-1));
    System.out.println(overrideReturn());
  }
}`,
  },
  {
    id: 'exceptions-custom-hierarchy',
    area: 'errors',
    source: `class AppError extends Exception {
  AppError(String m, Throwable c) { super(m, c); }
}
class AppRuntime extends RuntimeException { AppRuntime(String m) { super(m); } }

public class Main {
  static void checked() throws AppError { throw new AppError("checked", new IllegalStateException("root")); }
  public static void main(String[] args) {
    try {
      checked();
    } catch (AppError e) {
      System.out.println(e.getMessage() + " <- " + e.getCause().getClass().getSimpleName());
      System.out.println(e instanceof Exception);
    }
    try {
      throw new AppRuntime("runtime");
    } catch (RuntimeException e) {
      System.out.println(e.getClass().getSimpleName() + " " + e.getMessage());
    }
    System.out.println(new Exception("x").toString().startsWith("java.lang.Exception"));
  }
}`,
  },
  {
    id: 'exceptions-suppressed',
    area: 'errors',
    source: `public class Main {
  static class R implements AutoCloseable {
    private final String name;
    private final boolean fail;
    R(String name, boolean fail) { this.name = name; this.fail = fail; }
    public void close() { if (fail) throw new IllegalStateException("close-" + name); }
  }
  public static void main(String[] args) {
    try (R a = new R("a", true); R b = new R("b", true)) {
      throw new RuntimeException("body");
    } catch (RuntimeException e) {
      System.out.println("primary=" + e.getMessage());
      System.out.println("suppressed=" + e.getSuppressed().length);
      for (Throwable t : e.getSuppressed()) System.out.println("  " + t.getMessage());
    }
  }
}`,
  },
  {
    id: 'exceptions-stacktrace',
    area: 'errors',
    source: `public class Main {
  static void inner() { throw new IllegalStateException("boom"); }
  public static void main(String[] args) {
    try {
      inner();
    } catch (IllegalStateException e) {
      StackTraceElement[] frames = e.getStackTrace();
      System.out.println("frames>0=" + (frames.length > 0));
      System.out.println("hasMain=" + java.util.Arrays.stream(frames).anyMatch(f -> f.getMethodName().equals("main")));
      System.out.println("hasInner=" + java.util.Arrays.stream(frames).anyMatch(f -> f.getMethodName().equals("inner")));
      System.out.println("classOfTop=" + frames[0].getClassName());
    }
  }
}`,
  },
  {
    id: 'strings-more',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println("abc".compareTo("abd") + " " + "abc".equalsIgnoreCase("ABC"));
    System.out.println("a-b-c".replace('-', '+') + " " + "  x  ".strip() + "|");
    System.out.println(String.join("|", "a", "b", "c") + " " + "abc".chars().count());
    System.out.println("Hello".toLowerCase() + " " + "Hello".toUpperCase() + " " + "Hello".isEmpty());
    System.out.println("ab".concat("cd") + " " + "aXbXc".indexOf("X", 2) + " " + "abc".lastIndexOf('b'));
    System.out.println("x".repeat(3) + " " + "  a b  ".trim().replace(" ", "_"));
  }
}`,
  },
  {
    id: 'strings-split-join',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    String csv = "a,b,,c";
    String[] parts = csv.split(",");
    System.out.println(parts.length + " " + java.util.Arrays.toString(parts));
    System.out.println(java.util.Arrays.toString(csv.split(",", 3)));
    System.out.println(java.util.Arrays.toString(csv.split(",", -1)));
    System.out.println(java.util.Arrays.toString("a1b2c".split("[0-9]")));
    System.out.println(String.join("-", parts) + " " + "  ".isBlank());
  }
}`,
  },
  {
    id: 'string-encoding',
    area: 'basics',
    source: `import java.nio.charset.StandardCharsets;

public class Main {
  public static void main(String[] args) throws Exception {
    byte[] bytes = "caf\u00e9".getBytes(StandardCharsets.UTF_8);
    System.out.println(bytes.length);
    System.out.println(new String(bytes, StandardCharsets.UTF_8));
    System.out.println(java.util.Arrays.toString(bytes));
    System.out.println(new String(new byte[]{72, 105}, StandardCharsets.ISO_8859_1));
    System.out.println("abc".getBytes(StandardCharsets.US_ASCII).length);
  }
}`,
  },
  {
    id: 'stringbuilder-vs-buffer',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder("start");
    sb.append('-').append(42).append(true).append(1.5).append('c').append(new char[]{'x', 'y'});
    sb.insert(0, ">>").delete(2, 4).setCharAt(sb.length() - 1, 'Z');
    System.out.println(sb + " len=" + sb.length() + " cap>0=" + (sb.capacity() > 0));
    StringBuffer buf = new StringBuffer("ab");
    buf.append("cd").reverse();
    System.out.println(buf);
    System.out.println(new StringBuilder().append((String) null).toString());
    System.out.println(new StringBuilder().append((Object) null).toString());
  }
}`,
  },
  {
    id: 'char-classes',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    String s = "Hello123";
    int letters = 0, digits = 0;
    for (char c : s.toCharArray()) {
      if (Character.isLetter(c)) letters++;
      if (Character.isDigit(c)) digits++;
    }
    System.out.println(letters + " " + digits);
    System.out.println(Character.toLowerCase('A') + " " + Character.getNumericValue('7') + " " + Character.compare('a', 'b'));
    System.out.println(Arrays_sizes());
  }
  static String Arrays_sizes() {
    return "unicode-blocks=" + Character.UnicodeBlock.of('A');
  }
}`,
  },
  {
    id: 'big-integer',
    area: 'basics',
    source: `import java.math.BigInteger;

public class Main {
  public static void main(String[] args) {
    BigInteger a = new BigInteger("12345678901234567890");
    BigInteger b = BigInteger.valueOf(1000);
    System.out.println(a.add(b));
    System.out.println(a.multiply(b).toString().length());
    System.out.println(a.divide(b) + " " + a.mod(b));
    System.out.println(a.compareTo(b) + " " + a.negate());
    System.out.println(BigInteger.TWO.pow(10) + " " + new BigInteger("ff", 16));
    System.out.println(a.gcd(b) + " " + a.shiftRight(4));
  }
}`,
  },
  {
    id: 'big-decimal',
    area: 'basics',
    source: `import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

public class Main {
  public static void main(String[] args) {
    BigDecimal a = new BigDecimal("1.005"), b = new BigDecimal("2.5");
    System.out.println(a.add(b) + " " + a.multiply(b));
    System.out.println(a.setScale(2, RoundingMode.HALF_UP) + " " + a.setScale(2, RoundingMode.DOWN));
    System.out.println(b.divide(new BigDecimal("3"), 5, RoundingMode.HALF_UP));
    System.out.println(a.compareTo(b) + " " + a.stripTrailingZeros().toPlainString());
    System.out.println(new BigDecimal("10").divide(new BigDecimal("4"), MathContext.DECIMAL64));
  }
}`,
  },
  {
    id: 'math-functions',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println(Math.abs(-3) + " " + Math.signum(-2.5) + " " + Math.max(2, 3));
    System.out.println(Math.round(2.5) + " " + Math.round(-2.5) + " " + Math.rint(2.5));
    System.out.println(Math.sqrt(2) > 1.41 && Math.sqrt(2) < 1.42);
    System.out.println(Math.log(Math.E) + " " + Math.exp(0) + " " + Math.pow(2, 0.5));
    System.out.println(Math.hypot(3, 4) + " " + Math.toRadians(180) + " " + Math.sin(0));
    System.out.println(Math.min(1, 2) + " " + Math.copySign(3, -1));
  }
}`,
  },
  {
    id: 'date-time',
    area: 'runtime',
    source: `import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Period;

public class Main {
  public static void main(String[] args) {
    LocalDate d = LocalDate.of(2024, 2, 29);
    System.out.println(d + " " + d.plusDays(1) + " " + d.minusYears(1));
    System.out.println(d.getDayOfWeek() + " " + d.getDayOfYear() + " " + d.lengthOfMonth() + " " + d.isLeapYear());
    LocalTime t = LocalTime.of(13, 45, 30);
    System.out.println(t + " " + t.plusMinutes(30) + " " + t.getHour());
    LocalDateTime dt = LocalDateTime.of(d, t);
    System.out.println(dt + " " + dt.plus(Duration.ofHours(2)));
    System.out.println(Period.between(LocalDate.of(2020, 1, 1), d) + " " + Duration.ofMinutes(90).toHours());
  }
}`,
  },
  {
    id: 'date-format',
    area: 'runtime',
    source: `import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class Main {
  public static void main(String[] args) {
    LocalDateTime dt = LocalDateTime.of(2026, 9, 15, 8, 5, 3);
    System.out.println(dt.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
    System.out.println(dt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));
    System.out.println(dt.format(DateTimeFormatter.ofPattern("d MMM yyyy")));
    System.out.println(LocalDateTime.parse("2026-09-15T08:05:03"));
    System.out.println(DateTimeFormatter.ofPattern("HH:mm").format(dt));
  }
}`,
  },
  {
    id: 'instant-duration',
    area: 'runtime',
    source: `import java.time.Duration;
import java.time.Instant;

public class Main {
  public static void main(String[] args) {
    Instant a = Instant.parse("2026-01-01T00:00:00Z");
    Instant b = a.plusSeconds(3661);
    System.out.println(Duration.between(a, b).getSeconds() + " " + Duration.between(a, b).toMinutes());
    System.out.println(b.isAfter(a) + " " + a.isBefore(b));
    System.out.println(Duration.ofDays(1).plusHours(2).toHours() + " " + Duration.ofSeconds(90).toSecondsPart());
    System.out.println(a.plus(Duration.ofHours(1)).toString().endsWith("Z"));
  }
}`,
  },
  {
    id: 'regex-groups',
    area: 'runtime',
    source: `import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Main {
  public static void main(String[] args) {
    Pattern p = Pattern.compile("(\\\\d{4})-(\\\\d{2})-(\\\\d{2})");
    Matcher m = p.matcher("on 2026-09-15 and 2025-01-02");
    while (m.find()) {
      System.out.println(m.group() + " y=" + m.group(1) + " m=" + m.group(2) + " start=" + m.start());
    }
    System.out.println("count=" + m.reset().results().count());
    System.out.println("a1b2".replaceAll("([a-z])(\\\\d)", "$2$1"));
    System.out.println(Pattern.compile("x", Pattern.CASE_INSENSITIVE).matcher("X").matches());
  }
}`,
  },
  {
    id: 'regex-split-replace',
    area: 'runtime',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println(java.util.Arrays.toString("one two  three".split("\\\\s+")));
    System.out.println("2026-09-15".replaceAll("-", "/"));
    System.out.println("Hello World".replaceFirst("o", "0"));
    System.out.println("abc".matches("[a-z]+") + " " + "a1".matches("[a-z]+"));
    System.out.println("a.b.c".replace(".", "#"));
    System.out.println("a.b.c".replaceAll("\\\\.", "#"));
  }
}`,
  },
  {
    id: 'regex-quantifiers',
    area: 'runtime',
    source: `import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Main {
  public static void main(String[] args) {
    Matcher m = Pattern.compile("[0-9]+").matcher("a12b345c6");
    StringBuilder sb = new StringBuilder();
    while (m.find()) sb.append(m.group()).append(',');
    System.out.println(sb);
    System.out.println(Pattern.matches("^[A-Z][a-z]*$", "Hello"));
    System.out.println(Pattern.matches("^[A-Z][a-z]*$", "hello"));
    System.out.println("aaa".replaceAll("a+", "b"));
    System.out.println(Pattern.compile("(?i)abc").matcher("ABC").find());
  }
}`,
  },
  {
    id: 'reflection-members',
    area: 'runtime',
    source: `import java.lang.reflect.Field;
import java.lang.reflect.Method;

public class Main {
  public static class Sample {
    public int value = 7;
    public String greet(String who) { return "hi " + who; }
    private int secret() { return 42; }
  }
  public static void main(String[] args) throws Exception {
    Sample s = new Sample();
    Class<?> c = s.getClass();
    System.out.println(c.getSimpleName() + " " + c.getName());
    Field f = c.getField("value");
    System.out.println(f.getInt(s));
    f.setInt(s, 9);
    System.out.println(s.value);
    Method m = c.getMethod("greet", String.class);
    System.out.println(m.invoke(s, "world"));
    Method priv = c.getDeclaredMethod("secret");
    priv.setAccessible(true);
    System.out.println(priv.invoke(s));
  }
}`,
  },
  {
    id: 'reflection-class-api',
    area: 'runtime',
    source: `public class Main {
  interface I {}
  static class Impl implements I {}
  public static void main(String[] args) {
    System.out.println(Impl.class.getSuperclass().getSimpleName());
    System.out.println(I.class.isInterface() + " " + Impl.class.isInterface());
    System.out.println(I.class.isAssignableFrom(Impl.class) + " " + I.class.isInstance(new Impl()));
    System.out.println(int.class.isPrimitive() + " " + String[].class.isArray());
    System.out.println(String.class.getSimpleName() + " " + int[].class.getComponentType().getName());
    System.out.println(Main.class.getDeclaredClasses().length > 0);
  }
}`,
  },
  {
    id: 'arrays-more',
    area: 'basics',
    source: `import java.util.Arrays;

public class Main {
  public static void main(String[] args) {
    String[] xs = {"b", "a", "c"};
    String[] ys = xs.clone();
    System.out.println(Arrays.equals(xs, ys) + " " + (xs != ys));
    int[] src = {1, 2, 3, 4, 5};
    int[] dst = new int[5];
    System.arraycopy(src, 1, dst, 0, 3);
    System.out.println(Arrays.toString(dst));
    System.out.println(Arrays.toString(Arrays.copyOfRange(src, 1, 3)));
    System.out.println(Arrays.deepToString(new int[][]{{1, 2}, {3}}));
    System.out.println(Arrays.hashCode(src) == Arrays.hashCode(new int[]{1, 2, 3, 4, 5}));
  }
}`,
  },
  {
    id: 'arrays-objects',
    area: 'basics',
    source: `import java.util.Arrays;

public class Main {
  record P(int x) {}
  public static void main(String[] args) {
    P[] ps = {new P(3), new P(1), new P(2)};
    Arrays.sort(ps, java.util.Comparator.comparingInt(P::x));
    System.out.println(Arrays.toString(ps));
    P[] filled = new P[3];
    Arrays.fill(filled, new P(9));
    System.out.println(Arrays.toString(filled));
    System.out.println(Arrays.asList(ps).indexOf(new P(2)));
    System.out.println(Arrays.stream(ps).mapToInt(P::x).sum());
  }
}`,
  },
  {
    id: 'io-memory-streams',
    area: 'io',
    source: `import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.StringReader;
import java.io.StringWriter;
import java.io.BufferedReader;

public class Main {
  public static void main(String[] args) throws Exception {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.write("hello".getBytes());
    out.write('!');
    System.out.println(out.toString() + " size=" + out.size());
    ByteArrayInputStream in = new ByteArrayInputStream(out.toByteArray());
    byte[] buf = new byte[6];
    System.out.println(in.read(buf, 0, 6) + " " + new String(buf));
    StringWriter sw = new StringWriter();
    sw.write("abc");
    System.out.println(sw.toString());
    BufferedReader br = new BufferedReader(new StringReader("line1\\nline2"));
    System.out.println(br.readLine() + "/" + br.readLine() + "/" + br.readLine());
  }
}`,
  },
  {
    id: 'io-writers',
    area: 'io',
    source: `import java.io.PrintWriter;
import java.io.StringWriter;

public class Main {
  public static void main(String[] args) {
    StringWriter sw = new StringWriter();
    PrintWriter pw = new PrintWriter(sw);
    pw.print("int=");
    pw.println(42);
    pw.printf("%s=%d%n", "x", 7);
    pw.flush();
    System.out.print(sw.toString());
    System.out.println("chars=" + sw.toString().length());
  }
}`,
  },
  {
    id: 'parse-format',
    area: 'basics',
    source: `import java.text.NumberFormat;
import java.util.Locale;

public class Main {
  public static void main(String[] args) throws Exception {
    NumberFormat nf = NumberFormat.getInstance(Locale.US);
    nf.setMaximumFractionDigits(2);
    System.out.println(nf.format(1234.5678));
    System.out.println(nf.parse("1234.5678").doubleValue());
    NumberFormat ints = NumberFormat.getIntegerInstance(Locale.US);
    System.out.println(ints.format(1000000));
    System.out.println(String.format("%.2f|%d|%s", 1.234, 7, "x"));
  }
}`,
  },
  {
    id: 'atomic-sync',
    area: 'concurrency',
    source: `import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class Main {
  static int counter = 0;
  static synchronized void bump() { counter++; }
  public static void main(String[] args) {
    synchronized (Main.class) { counter += 5; }
    bump();
    System.out.println("counter=" + counter);
    AtomicInteger ai = new AtomicInteger(1);
    System.out.println(ai.incrementAndGet() + " " + ai.getAndAdd(5) + " " + ai.get());
    System.out.println(ai.compareAndSet(7, 10) + " " + ai.get());
    AtomicLong al = new AtomicLong(3);
    System.out.println(al.addAndGet(-1));
  }
}`,
  },
  {
    id: 'concurrent-collections',
    area: 'concurrency',
    source: `import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public class Main {
  public static void main(String[] args) {
    Map<String, Integer> m = new ConcurrentHashMap<>();
    m.put("a", 1);
    m.merge("a", 2, Integer::sum);
    m.computeIfAbsent("b", k -> 3);
    System.out.println(new java.util.TreeMap<>(m));
    List<Integer> list = new CopyOnWriteArrayList<>(java.util.Arrays.asList(1, 2, 3));
    for (Integer v : list) if (v == 2) list.remove(v);
    System.out.println(list);
    System.out.println(m.getOrDefault("z", -1) + " " + m.size());
  }
}`,
  },
  {
    id: 'optional-more',
    area: 'functional',
    source: `import java.util.Optional;

public class Main {
  public static void main(String[] args) {
    Optional<Integer> some = Optional.of(5);
    System.out.println(some.filter(n -> n > 3).isPresent() + " " + some.filter(n -> n > 9).isPresent());
    System.out.println(some.map(n -> n * 2).orElse(-1) + " " + Optional.<Integer>empty().map(n -> n * 2).orElse(-1));
    System.out.println(some.flatMap(n -> Optional.of(n + 1)).get());
    some.ifPresentOrElse(v -> System.out.println("present " + v), () -> System.out.println("absent"));
    Optional.ofNullable((String) null).ifPresentOrElse(v -> System.out.println("x"), () -> System.out.println("null absent"));
    System.out.println(some.or(() -> Optional.of(9)).get() + " " + Optional.of(1).stream().count());
  }
}`,
  },
  {
    id: 'records-nested',
    area: 'modern',
    source: `import java.util.List;

public class Main {
  record Address(String city) {}
  record Person(String name, int age, Address address) {
    Person { java.util.Objects.requireNonNull(name); }
    String label() { return name + "/" + age; }
  }
  public static void main(String[] args) {
    Person p = new Person("ann", 30, new Address("Seoul"));
    System.out.println(p.name() + " " + p.address().city() + " " + p.label());
    System.out.println(p.equals(new Person("ann", 30, new Address("Seoul"))));
    System.out.println(p.hashCode() == new Person("ann", 30, new Address("Seoul")).hashCode());
    System.out.println(p);
    System.out.println(List.of(p).stream().map(Person::label).toList());
  }
}`,
  },
  {
    id: 'switch-patterns',
    area: 'modern',
    source: `public class Main {
  sealed interface Shape permits Circle, Rect {}
  record Circle(double r) implements Shape {}
  record Rect(double w, double h) implements Shape {}

  static String describe(Object o) {
    return switch (o) {
      case Circle c when c.r() > 10 -> "big circle";
      case Circle c -> "circle " + c.r();
      case Rect r -> "rect " + (r.w() * r.h());
      case null -> "null";
      default -> "other";
    };
  }
  public static void main(String[] args) {
    System.out.println(describe(new Circle(2)));
    System.out.println(describe(new Circle(20)));
    System.out.println(describe(new Rect(2, 3)));
    System.out.println(describe("x"));
    System.out.println(describe(null));
  }
}`,
  },
  {
    id: 'text-block-more',
    area: 'modern',
    source: `public class Main {
  public static void main(String[] args) {
    String json = """
        {
          "name": "livecodes",
          "n": 1
        }""";
    System.out.println(json.lines().count());
    System.out.println(json.strip().startsWith("{"));
    String sql = """
        SELECT *
        FROM t
        WHERE id = %d""".formatted(7);
    System.out.println(sql.contains("id = 7"));
    System.out.println("a\\nb".lines().count() + " " + "x".repeat(2));
  }
}`,
  },
  {
    id: 'var-inference',
    area: 'modern',
    source: `import java.util.ArrayList;
import java.util.HashMap;

public class Main {
  public static void main(String[] args) {
    var n = 42;
    var s = "text";
    var list = new ArrayList<String>();
    list.add("a");
    var map = new HashMap<String, Integer>();
    map.put("k", 1);
    var arr = new int[]{1, 2, 3};
    for (var v : arr) s += v;
    System.out.println(n + " " + list.getClass().getSimpleName() + " " + map.get("k") + " " + s);
  }
}`,
  },
  {
    id: 'enhanced-for-maps',
    area: 'collections',
    source: `import java.util.Map;
import java.util.TreeMap;

public class Main {
  public static void main(String[] args) {
    Map<String, Integer> m = new TreeMap<>();
    m.put("b", 2); m.put("a", 1); m.put("c", 3);
    int total = 0;
    for (Map.Entry<String, Integer> e : m.entrySet()) total += e.getValue();
    System.out.println("total=" + total);
    for (String k : m.keySet()) System.out.print(k);
    System.out.println();
    for (int v : m.values()) System.out.print(v);
    System.out.println();
    m.forEach((k, v) -> System.out.print(k + "=" + v + " "));
    System.out.println();
  }
}`,
  },
  {
    id: 'iterable-custom',
    area: 'collections',
    source: `import java.util.Iterator;
import java.util.NoSuchElementException;

public class Main {
  static class Countdown implements Iterable<Integer> {
    private final int from;
    Countdown(int from) { this.from = from; }
    public Iterator<Integer> iterator() {
      return new Iterator<Integer>() {
        int n = from;
        public boolean hasNext() { return n > 0; }
        public Integer next() { if (n <= 0) throw new NoSuchElementException(); return n--; }
      };
    }
  }
  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder();
    for (int n : new Countdown(4)) sb.append(n).append(' ');
    System.out.println(sb.toString().trim());
    int sum = 0;
    for (int n : new Countdown(3)) sum += n;
    System.out.println(sum);
  }
}`,
  },
  {
    id: 'comparable-tree',
    area: 'collections',
    source: `import java.util.TreeSet;

public class Main {
  static class Version implements Comparable<Version> {
    final int major, minor;
    Version(int major, int minor) { this.major = major; this.minor = minor; }
    public int compareTo(Version o) { return major != o.major ? Integer.compare(major, o.major) : Integer.compare(minor, o.minor); }
    public String toString() { return major + "." + minor; }
  }
  public static void main(String[] args) {
    TreeSet<Version> versions = new TreeSet<>();
    versions.add(new Version(2, 0));
    versions.add(new Version(1, 10));
    versions.add(new Version(1, 2));
    System.out.println(versions);
    System.out.println(versions.first() + " " + versions.last());
    System.out.println(versions.headSet(new Version(2, 0)));
  }
}`,
  },
  {
    id: 'boxing-collections',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.List;

public class Main {
  public static void main(String[] args) {
    List<Integer> xs = new ArrayList<>();
    for (int i = 0; i < 5; i++) xs.add(i * i);
    int sum = 0;
    for (int x : xs) sum += x;
    System.out.println(xs + " sum=" + sum);
    xs.remove(Integer.valueOf(4));
    xs.remove(1);
    System.out.println(xs);
    System.out.println(xs.contains(16) + " " + xs.indexOf(9) + " " + xs.set(0, 100));
    System.out.println(xs);
  }
}`,
  },
  {
    id: 'interfaces-functional',
    area: 'oop',
    source: `@FunctionalInterface
interface Calc { int apply(int a, int b); default String describe() { return "calc"; } }

public class Main {
  static int use(Calc c) { return c.apply(6, 7); }
  public static void main(String[] args) {
    Calc add = (a, b) -> a + b;
    Calc mul = (a, b) -> a * b;
    System.out.println(use(add) + " " + use(mul) + " " + add.describe());
    System.out.println(use(Integer::sum) + " " + use(Math::max));
    Calc anon = new Calc() { public int apply(int a, int b) { return Math.abs(a - b); } };
    System.out.println(use(anon));
  }
}`,
  },
  {
    id: 'lambda-capture',
    area: 'functional',
    source: `import java.util.ArrayList;
import java.util.List;
import java.util.function.IntSupplier;

public class Main {
  public static void main(String[] args) {
    List<IntSupplier> suppliers = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      int captured = i * 10;
      suppliers.add(() -> captured);
    }
    for (IntSupplier s : suppliers) System.out.print(s.getAsInt() + " ");
    System.out.println();
    StringBuilder sb = new StringBuilder();
    List<String> names = java.util.Arrays.asList("a", "b");
    names.forEach(n -> sb.append(n));
    System.out.println(sb);
    final int[] holder = {0};
    Runnable r = () -> holder[0] = 5;
    r.run();
    System.out.println(holder[0]);
  }
}`,
  },
  {
    id: 'nested-generics',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public class Main {
  public static void main(String[] args) {
    Map<String, List<Map<String, Integer>>> data = new TreeMap<>();
    data.put("a", new ArrayList<>());
    Map<String, Integer> inner = new HashMap<>();
    inner.put("x", 1);
    inner.put("y", 2);
    data.get("a").add(new TreeMap<>(inner));
    System.out.println(data);
    Map<String, Map<String, Integer>> copy = new TreeMap<>();
    for (Map.Entry<String, List<Map<String, Integer>>> e : data.entrySet()) {
      copy.put(e.getKey(), e.getValue().get(0));
    }
    System.out.println(copy.get("a").get("y"));
  }
}`,
  },
  {
    id: 'varargs-generic',
    area: 'collections',
    source: `import java.util.Arrays;
import java.util.List;

public class Main {
  @SafeVarargs
  static <T> List<T> listOf(T... items) { return Arrays.asList(items); }
  static int sum(int first, int... rest) { int t = first; for (int r : rest) t += r; return t; }
  public static void main(String[] args) {
    System.out.println(listOf("a", "b", "c"));
    System.out.println(listOf(1, 2));
    System.out.println(sum(1) + " " + sum(1, 2, 3));
    String[] arr = {"x", "y"};
    System.out.println(listOf(arr));
    System.out.println(Arrays.toString(new int[]{1, 2}) + " " + sum(0, new int[]{4, 5}));
  }
}`,
  },
  {
    id: 'static-members',
    area: 'oop',
    source: `public class Main {
  static final int CONST = compute();
  static final String NAME;
  static int counter;
  static { NAME = "static"; counter = 1; }
  static int compute() { return 21 * 2; }
  static class Registry {
    static final String ID = "reg";
    static int count;
  }
  public static void main(String[] args) {
    System.out.println(CONST + " " + NAME + " " + counter);
    System.out.println(Registry.ID + " " + Registry.count++ + " " + Registry.count);
    System.out.println(Integer.MAX_VALUE / 2 + " " + (1 << 30));
  }
}`,
  },
  {
    id: 'inner-this',
    area: 'oop',
    source: `public class Main {
  private final String outer = "outer";
  class Inner {
    private final String outer = "inner";
    String both() { return this.outer + "+" + Main.this.outer; }
  }
  public static void main(String[] args) {
    Main m = new Main();
    System.out.println(m.new Inner().both());
    Main.Inner i = m.new Inner();
    System.out.println(i.getClass().getName().contains("$"));
  }
}`,
  },
  {
    id: 'annotation-basic',
    area: 'runtime',
    source: `import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

public class Main {
  @Retention(RetentionPolicy.RUNTIME)
  @interface Tag { String value(); int order() default 0; }

  @Tag(value = "sample", order = 3)
  static class Marked {}

  public static void main(String[] args) throws Exception {
    Tag t = Marked.class.getAnnotation(Tag.class);
    System.out.println(t != null);
    if (t != null) System.out.println(t.value() + " " + t.order());
    System.out.println(Marked.class.getAnnotations().length);
  }
}`,
  },
  {
    id: 'hashcode-equals',
    area: 'oop',
    source: `import java.util.HashSet;
import java.util.Set;
import java.util.TreeSet;

public class Main {
  static class Key implements Comparable<Key> {
    final String a; final int b;
    Key(String a, int b) { this.a = a; this.b = b; }
    public boolean equals(Object o) { return o instanceof Key k && k.a.equals(a) && k.b == b; }
    public int hashCode() { return java.util.Objects.hash(a, b); }
    public int compareTo(Key o) { return a.equals(o.a) ? Integer.compare(b, o.b) : a.compareTo(o.a); }
    public String toString() { return a + b; }
  }
  public static void main(String[] args) {
    Set<Key> set = new HashSet<>();
    set.add(new Key("x", 1));
    set.add(new Key("x", 1));
    System.out.println("hashset=" + set.size() + " " + set.contains(new Key("x", 1)));
    Set<Key> tree = new TreeSet<>(set);
    System.out.println("treeset=" + tree);
    System.out.println(new Key("x", 1).equals(new Key("x", 1)) + " " + (new Key("x", 1).hashCode() == new Key("x", 1).hashCode()));
  }
}`,
  },
  {
    id: 'objects-utilities',
    area: 'basics',
    source: `import java.util.Objects;

public class Main {
  public static void main(String[] args) {
    System.out.println(Objects.equals(null, null) + " " + Objects.equals("a", "a") + " " + Objects.equals("a", null));
    System.out.println(Objects.hash("a", 1) == Objects.hash("a", 1));
    System.out.println(Objects.requireNonNullElse(null, "fallback") + " " + Objects.requireNonNullElse("v", "fallback"));
    System.out.println(Objects.toString(null, "?") + " " + Objects.isNull(null) + " " + Objects.nonNull("x"));
    try { Objects.requireNonNull(null, "msg"); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
  }
}`,
  },
  {
    id: 'numbers-parsing',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println(Integer.valueOf("42") + " " + Integer.parseInt("1010", 2));
    System.out.println(Double.parseDouble("3.14") + " " + Double.isInfinite(1.0 / 0.0));
    System.out.println(Integer.toString(255, 16) + " " + Long.toString(8, 2));
    System.out.println(Byte.MIN_VALUE + " " + Short.MAX_VALUE + " " + Character.MAX_VALUE);
    System.out.println(Integer.compare(1, 2) + " " + Double.compare(1.0, 1.0));
    try { Integer.parseInt("nope"); } catch (NumberFormatException e) { System.out.println("nf"); }
  }
}`,
  },
  {
    id: 'string-valueof',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println(String.valueOf(42) + " " + String.valueOf(new char[]{'a', 'b'}) + " " + String.valueOf((Object) null));
    System.out.println(String.valueOf(true) + " " + String.valueOf(1.5) + " " + String.valueOf('c'));
    System.out.println(Integer.valueOf(1) + "" + Double.valueOf(2.5));
    System.out.println("x" + 1 + 2 + " " + (1 + 2 + "x"));
    System.out.println("" + 'a' + 'b');
  }
}`,
  },
  {
    id: 'autobox-unbox',
    area: 'basics',
    source: `import java.util.ArrayList;
import java.util.List;

public class Main {
  public static void main(String[] args) {
    List<Integer> xs = new ArrayList<>();
    xs.add(1);
    xs.add(Integer.valueOf(2));
    int first = xs.get(0);
    Integer wrapped = first;
    System.out.println(wrapped + " " + (int) wrapped + " " + wrapped.equals(1));
    Boolean b = true;
    if (b) System.out.println("auto-unboxed");
    Integer big = 1000, big2 = 1000;
    System.out.println((big == big2) + " " + big.equals(big2));
    Number n = 3.5;
    System.out.println(n.intValue() + " " + n.doubleValue());
  }
}`,
  },
  {
    id: 'nested-loops-labels',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    int[][] grid = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
    int found = -1;
    search: for (int r = 0; r < grid.length; r++) {
      for (int c = 0; c < grid[r].length; c++) {
        if (grid[r][c] == 6) { found = r * 10 + c; break search; }
      }
    }
    System.out.println("found=" + found);
    int sum = 0;
    for (int[] row : grid) for (int v : row) sum += v;
    System.out.println("sum=" + sum);
    System.out.println("#rows=" + grid.length + " #cols=" + grid[0].length);
  }
}`,
  },
  {
    id: 'recursion-more',
    area: 'basics',
    source: `import java.math.BigInteger;

public class Main {
  static int ackermann(int m, int n) {
    if (m == 0) return n + 1;
    if (n == 0) return ackermann(m - 1, 1);
    return ackermann(m - 1, ackermann(m, n - 1));
  }
  static BigInteger fact(int n) { return n <= 1 ? BigInteger.ONE : BigInteger.valueOf(n).multiply(fact(n - 1)); }
  static int depth(int n) { return n == 0 ? 0 : 1 + depth(n - 1); }
  public static void main(String[] args) {
    System.out.println(ackermann(2, 3));
    System.out.println(fact(20));
    System.out.println(depth(500));
  }
}`,
  },
  {
    id: 'string-switch-enum',
    area: 'oop',
    source: `public class Main {
  enum Color { RED, GREEN, BLUE }
  static int score(Color c) {
    switch (c) {
      case RED: return 1;
      case GREEN: return 2;
      case BLUE: return 3;
    }
    return 0;
  }
  public static void main(String[] args) {
    for (Color c : Color.values()) System.out.print(score(c) + " ");
    System.out.println();
    System.out.println(Color.valueOf("GREEN").ordinal());
    System.out.println(java.util.Arrays.toString(Color.values()));
  }
}`,
  },
  {
    id: 'charsequence-impl',
    area: 'basics',
    source: `public class Main {
  static class Filler implements CharSequence {
    private final char c; private final int len;
    Filler(char c, int len) { this.c = c; this.len = len; }
    public int length() { return len; }
    public char charAt(int i) { return c; }
    public CharSequence subSequence(int s, int e) { return new Filler(c, e - s); }
    public String toString() {
      StringBuilder sb = new StringBuilder();
      for (int i = 0; i < len; i++) sb.append(c);
      return sb.toString();
    }
  }
  public static void main(String[] args) {
    CharSequence f = new Filler('*', 5);
    System.out.println(f + " " + f.length() + " " + f.charAt(2));
    System.out.println(f.subSequence(0, 2));
    System.out.println(String.join(",", f, f));
  }
}`,
  },
  {
    id: 'clone-deep',
    area: 'oop',
    source: `public class Main {
  static class Point implements Cloneable {
    int x, y;
    Point(int x, int y) { this.x = x; this.y = y; }
    public Point clone() { try { return (Point) super.clone(); } catch (CloneNotSupportedException e) { throw new AssertionError(e); } }
    public String toString() { return x + "," + y; }
  }
  public static void main(String[] args) {
    Point p = new Point(1, 2);
    Point q = p.clone();
    q.x = 9;
    System.out.println(p + " " + q + " " + (p != q));
    int[] xs = {1, 2, 3};
    int[] ys = xs.clone();
    ys[0] = 9;
    System.out.println(java.util.Arrays.toString(xs) + " " + java.util.Arrays.toString(ys));
  }
}`,
  },
  {
    id: 'interfaces-static-default',
    area: 'oop',
    source: `interface Repo<T> {
  T load(String id);
  default T loadOrDefault(String id, T fallback) { T v = load(id); return v != null ? v : fallback; }
  static String kind() { return "repo"; }
  private String helper() { return "private"; }
}
public class Main {
  public static void main(String[] args) {
    Repo<String> repo = id -> id.equals("a") ? "A" : null;
    System.out.println(repo.loadOrDefault("a", "-") + " " + repo.loadOrDefault("z", "-"));
    System.out.println(Repo.kind());
  }
}`,
  },
  {
    id: 'type-casts',
    area: 'oop',
    source: `public class Main {
  public static void main(String[] args) {
    Object o = "text";
    System.out.println((o instanceof String) + " " + (o instanceof Number));
    String s = (String) o;
    System.out.println(s.length() + " " + (o instanceof CharSequence));
    Object n = 42;
    if (n instanceof Integer i) System.out.println("int=" + (i + 1));
    System.out.println((int) 3.99 + " " + (double) 7 + " " + (char) 65 + " " + (byte) 130);
    Number num = 3;
    System.out.println(num.intValue() + " " + num.getClass().getSimpleName());
  }
}`,
  },
  {
    id: 'ternary-conditions',
    area: 'basics',
    source: `public class Main {
  static int abs(int n) { return n < 0 ? -n : n; }
  public static void main(String[] args) {
    System.out.println(abs(-5) + " " + abs(5) + " " + abs(0));
    int a = 3, b = 5;
    System.out.println((a > b ? a : b) + " " + (a % 2 == 0 ? "even" : "odd"));
    String s = null;
    System.out.println((s == null ? "none" : s) + " " + (s != null && s.length() > 0 ? "yes" : "no"));
    System.out.println(a > 0 && b > 0 ? "both" : "not");
  }
}`,
  },
  {
    id: 'identity-hashcode',
    area: 'runtime',
    source: `public class Main {
  static class A {}
  public static void main(String[] args) {
    A a = new A();
    System.out.println(a.hashCode() == a.hashCode());
    System.out.println(a.equals(a) + " " + a.equals(new A()));
    A b = a;
    System.out.println(a == b);
    java.util.IdentityHashMap<A, String> im = new java.util.IdentityHashMap<>();
    im.put(a, "x");
    im.put(new A(), "y");
    System.out.println(im.size() + " " + im.get(b));
    System.out.println(Integer.toHexString(a.hashCode()).length() > 0);
  }
}`,
  },
  {
    id: 'matrix-compute',
    area: 'basics',
    source: `public class Main {
  static int[][] multiply(int[][] a, int[][] b) {
    int n = a.length, m = b[0].length, k = b.length;
    int[][] c = new int[n][m];
    for (int i = 0; i < n; i++) for (int j = 0; j < m; j++) for (int x = 0; x < k; x++) c[i][j] += a[i][x] * b[x][j];
    return c;
  }
  public static void main(String[] args) {
    int[][] a = {{1, 2}, {3, 4}};
    int[][] b = {{5, 6}, {7, 8}};
    StringBuilder sb = new StringBuilder();
    for (int[] row : multiply(a, b)) { for (int v : row) sb.append(v).append(' '); sb.append('|'); }
    System.out.println(sb.toString().trim());
    int[][] identity = {{1, 0}, {0, 1}};
    System.out.println(java.util.Arrays.deepEquals(multiply(a, identity), a));
  }
}`,
  },
  {
    id: 'sieve-primes',
    area: 'basics',
    source: `import java.util.ArrayList;
import java.util.List;

public class Main {
  public static void main(String[] args) {
    int limit = 100;
    boolean[] composite = new boolean[limit + 1];
    List<Integer> primes = new ArrayList<>();
    for (int i = 2; i <= limit; i++) {
      if (!composite[i]) {
        primes.add(i);
        for (int j = i * i; j <= limit; j += i) composite[j] = true;
      }
    }
    System.out.println("count=" + primes.size());
    System.out.println(primes.subList(0, 10));
    System.out.println(primes.get(primes.size() - 1));
  }
}`,
  },
  {
    id: 'word-count',
    area: 'functional',
    source: `import java.util.Arrays;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

public class Main {
  public static void main(String[] args) {
    String text = "the quick brown fox jumps over the lazy dog the end";
    Map<String, Long> counts = Arrays.stream(text.split(" "))
        .collect(Collectors.groupingBy(w -> w, TreeMap::new, Collectors.counting()));
    System.out.println(counts.get("the") + " " + counts.get("fox") + " " + counts.size());
    System.out.println(counts.entrySet().stream().filter(e -> e.getValue() > 1).map(Map.Entry::getKey).collect(Collectors.toList()));
    System.out.println(Arrays.stream(text.split(" ")).map(String::toUpperCase).sorted().limit(3).collect(Collectors.toList()));
    System.out.println(text.chars().filter(c -> c == 'e').count());
  }
}`,
  },
  {
    id: 'csv-parse',
    area: 'functional',
    source: `import java.util.ArrayList;
import java.util.List;

public class Main {
  record Row(String name, int age, String city) {}
  public static void main(String[] args) {
    String csv = "name,age,city\\nalice,30,seoul\\nbob,25,busan\\ncarol,35,seoul";
    String[] lines = csv.split("\\n");
    List<Row> rows = new ArrayList<>();
    for (int i = 1; i < lines.length; i++) {
      String[] f = lines[i].split(",");
      rows.add(new Row(f[0], Integer.parseInt(f[1]), f[2]));
    }
    System.out.println(rows.size() + " " + rows.get(0));
    rows.stream().filter(r -> r.city().equals("seoul")).forEach(System.out::println);
    System.out.println(rows.stream().mapToInt(Row::age).average().getAsDouble());
    System.out.println(rows.stream().max(java.util.Comparator.comparingInt(Row::age)).get().name());
  }
}`,
  },
  {
    id: 'inventory-app',
    area: 'functional',
    source: `import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

public class Main {
  record Item(String sku, int qty, double price) { double total() { return qty * price; } }
  public static void main(String[] args) {
    List<Item> items = new ArrayList<>(List.of(
        new Item("a", 2, 1.5), new Item("b", 1, 10.0), new Item("c", 5, 0.5), new Item("d", 0, 3.0)));
    double total = items.stream().mapToDouble(Item::total).sum();
    System.out.println("total=" + total);
    items.sort(Comparator.comparingDouble(Item::total).reversed());
    System.out.println(items.get(0).sku());
    Map<Boolean, List<Item>> inStock = items.stream().collect(Collectors.partitioningBy(i -> i.qty() > 0));
    System.out.println(inStock.get(true).size() + " " + inStock.get(false).size());
    Map<String, Double> bySku = items.stream().collect(Collectors.toMap(Item::sku, Item::total, Double::sum, TreeMap::new));
    System.out.println(bySku);
  }
}`,
  },
  {
    id: 'json-ish-builder',
    area: 'functional',
    source: `import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

public class Main {
  static String toJson(Map<String, Object> m) {
    return m.entrySet().stream()
        .map(e -> "\\"" + e.getKey() + "\\":" + (e.getValue() instanceof String ? "\\"" + e.getValue() + "\\"" : e.getValue()))
        .collect(Collectors.joining(",", "{", "}"));
  }
  public static void main(String[] args) {
    Map<String, Object> m = new TreeMap<>();
    m.put("name", "livecodes");
    m.put("stars", 100);
    m.put("active", true);
    System.out.println(toJson(m));
    System.out.println(m.keySet().stream().collect(Collectors.joining("|")));
    System.out.println(m.values().stream().map(String::valueOf).collect(Collectors.toList()));
  }
}`,
  },
  {
    id: 'stack-queue-sim',
    area: 'collections',
    source: `import java.util.ArrayDeque;
import java.util.Deque;

public class Main {
  static boolean balanced(String s) {
    Deque<Character> stack = new ArrayDeque<>();
    for (char c : s.toCharArray()) {
      if (c == '(' || c == '[') stack.push(c);
      else if (c == ')' || c == ']') {
        if (stack.isEmpty()) return false;
        char open = stack.pop();
        if ((c == ')' && open != '(') || (c == ']' && open != '[')) return false;
      }
    }
    return stack.isEmpty();
  }
  public static void main(String[] args) {
    for (String s : new String[]{"()[]", "(]", "(()", "([()])"}) System.out.println(s + "=" + balanced(s));
  }
}`,
  },
  {
    id: 'binary-search',
    area: 'basics',
    source: `import java.util.Arrays;

public class Main {
  static int binarySearch(int[] xs, int target) {
    int lo = 0, hi = xs.length - 1;
    while (lo <= hi) {
      int mid = lo + (hi - lo) / 2;
      if (xs[mid] == target) return mid;
      if (xs[mid] < target) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }
  public static void main(String[] args) {
    int[] xs = {1, 3, 5, 7, 9, 11};
    for (int t : new int[]{1, 7, 11, 4}) System.out.print(binarySearch(xs, t) + " ");
    System.out.println();
    System.out.println(Arrays.binarySearch(xs, 7) + " " + Arrays.binarySearch(xs, 4));
  }
}`,
  },
  {
    id: 'string-algorithms',
    area: 'basics',
    source: `public class Main {
  static boolean isPalindrome(String s) {
    String t = s.replaceAll("[^a-zA-Z0-9]", "").toLowerCase();
    return t.equals(new StringBuilder(t).reverse().toString());
  }
  static String reverseWords(String s) {
    String[] w = s.split(" ");
    StringBuilder sb = new StringBuilder();
    for (int i = w.length - 1; i >= 0; i--) sb.append(w[i]).append(i > 0 ? " " : "");
    return sb.toString();
  }
  public static void main(String[] args) {
    for (String s : new String[]{"A man, a plan, a canal: Panama", "hello"}) System.out.println(isPalindrome(s));
    System.out.println(reverseWords("one two three"));
  }
}`,
  },
  {
    id: 'custom-exception-flow',
    area: 'errors',
    source: `public class Main {
  static class Insufficient extends Exception { Insufficient(String m) { super(m); } }
  static class Account {
    private int balance;
    Account(int b) { balance = b; }
    void withdraw(int amount) throws Insufficient {
      if (amount > balance) throw new Insufficient("need " + (amount - balance) + " more");
      balance -= amount;
    }
    int balance() { return balance; }
  }
  public static void main(String[] args) {
    Account a = new Account(100);
    try {
      a.withdraw(30);
      System.out.println("balance=" + a.balance());
      a.withdraw(100);
    } catch (Insufficient e) {
      System.out.println("error: " + e.getMessage());
    } finally {
      System.out.println("final balance=" + a.balance());
    }
  }
}`,
  },
  {
    id: 'exception-propagation',
    area: 'errors',
    source: `public class Main {
  static int level3() { throw new IllegalArgumentException("deep"); }
  static int level2() { return level3(); }
  static int level1() { return level2(); }
  static String traceOf(Runnable r) {
    try { r.run(); return "no throw"; }
    catch (IllegalArgumentException e) {
      return e.getStackTrace()[0].getMethodName();
    }
  }
  public static void main(String[] args) {
    System.out.println(traceOf(Main::level1));
    try {
      level1();
    } catch (RuntimeException e) {
      long distinct = java.util.Arrays.stream(e.getStackTrace()).map(StackTraceElement::getMethodName).distinct().count();
      System.out.println("distinct frames >= 3: " + (distinct >= 3));
    }
  }
}`,
  },
  {
    id: 'finally-resource-order',
    area: 'errors',
    source: `public class Main {
  static class R implements AutoCloseable {
    private final String id;
    R(String id) { this.id = id; System.out.println("open " + id); }
    public void close() { System.out.println("close " + id); }
  }
  public static void main(String[] args) {
    try (R a = new R("1"); R b = new R("2")) {
      System.out.println("body");
    } finally {
      System.out.println("outer finally");
    }
    System.out.println("after");
  }
}`,
  },
  {
    id: 'string-format-more',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println(String.format("[%10s]", "hi") + String.format("[%-10s]", "hi") + "|");
    System.out.println(String.format("%08.3f", 3.14159));
    System.out.println(String.format("%x %X %o", 255, 255, 8));
    System.out.println(String.format("%s has %d items", "cart", 3));
    System.out.println(String.format("%c%c", 'a', 'b'));
  }
}`,
  },
  {
    id: 'localdate-ops',
    area: 'runtime',
    source: `import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

public class Main {
  public static void main(String[] args) {
    LocalDate start = LocalDate.of(2026, 1, 1);
    LocalDate end = LocalDate.of(2026, 3, 15);
    System.out.println(ChronoUnit.DAYS.between(start, end));
    System.out.println(start.plusMonths(2).plusDays(14) + " " + start.withMonth(12));
    System.out.println(start.isBefore(end) + " " + start.getDayOfWeek());
    LocalDate nextMonday = start.with(java.time.temporal.TemporalAdjusters.next(DayOfWeek.MONDAY));
    System.out.println(nextMonday + " " + nextMonday.getDayOfWeek());
    System.out.println(end.isAfter(start.plusYears(1)));
  }
}`,
  },
  {
    id: 'collections-frequency',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.TreeMap;

public class Main {
  public static void main(String[] args) {
    List<String> words = Arrays.asList("a", "b", "a", "c", "b", "a");
    System.out.println(Collections.frequency(words, "a"));
    TreeMap<String, Integer> counts = new TreeMap<>();
    for (String w : words) counts.merge(w, 1, Integer::sum);
    System.out.println(counts);
    List<String> sorted = new ArrayList<>(words);
    Collections.sort(sorted, Collections.reverseOrder());
    System.out.println(sorted);
    System.out.println(Collections.binarySearch(new ArrayList<>(Arrays.asList("a", "b", "c")), "b"));
  }
}`,
  },
  {
    id: 'enum-map-set',
    area: 'collections',
    source: `import java.util.EnumMap;
import java.util.EnumSet;

public class Main {
  enum Level { LOW, MED, HIGH }
  public static void main(String[] args) {
    EnumMap<Level, Integer> m = new EnumMap<>(Level.class);
    m.put(Level.LOW, 1);
    m.put(Level.HIGH, 3);
    System.out.println(m + " " + m.getOrDefault(Level.MED, 0));
    EnumSet<Level> set = EnumSet.of(Level.LOW, Level.HIGH);
    System.out.println(set.contains(Level.MED) + " " + set.size());
    System.out.println(EnumSet.allOf(Level.class) + " " + EnumSet.complementOf(set));
  }
}`,
  },
  {
    id: 'recursive-generics',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.List;

public class Main {
  static abstract class Builder<T extends Builder<T>> {
    private final List<String> parts = new ArrayList<>();
    @SuppressWarnings("unchecked") T add(String p) { parts.add(p); return (T) this; }
    String build() { return String.join("+", parts); }
  }
  static class Query extends Builder<Query> {
    Query where(String c) { return add(c); }
  }
  public static void main(String[] args) {
    Query q = new Query().where("a").where("b");
    System.out.println(q.build());
    System.out.println(q.getClass().getSimpleName());
  }
}`,
  },
  {
    id: 'interface-diamond',
    area: 'oop',
    source: `interface A { default String name() { return "A"; } }
interface B extends A { default String name() { return "B"; } }
interface C extends A { default String name() { return "C"; } }
class D implements B, C {
  public String name() { return B.super.name() + "/" + C.super.name(); }
}
public class Main {
  public static void main(String[] args) {
    System.out.println(new D().name());
    A a = new D();
    System.out.println(a.name());
    System.out.println(a instanceof B && a instanceof C);
  }
}`,
  },
  {
    id: 'cached-computation',
    area: 'functional',
    source: `import java.util.HashMap;
import java.util.Map;
import java.util.function.IntUnaryOperator;

public class Main {
  static final Map<Integer, Long> CACHE = new HashMap<>();
  static long slowFib(int n) {
    if (n < 2) return n;
    return CACHE.computeIfAbsent(n, k -> slowFib(k - 1) + slowFib(k - 2));
  }
  public static void main(String[] args) {
    IntUnaryOperator square = n -> n * n;
    System.out.println(square.applyAsInt(9));
    System.out.println(slowFib(60));
    System.out.println(CACHE.size() > 0);
  }
}`,
  },
  {
    id: 'supplier-consumer',
    area: 'functional',
    source: `import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Supplier;

public class Main {
  static <T> T withDefaults(Supplier<T> supplier, Consumer<T> consumer) {
    T value = supplier.get();
    consumer.accept(value);
    return value;
  }
  public static void main(String[] args) {
    StringBuilder log = new StringBuilder();
    String result = withDefaults(() -> "value", v -> log.append("consumed:").append(v));
    System.out.println(result + " " + log);
    BiConsumer<String, Integer> printer = (s, n) -> System.out.println(s + "=" + n);
    printer.accept("count", 3);
    Supplier<StringBuilder> sb = StringBuilder::new;
    System.out.println(sb.get().append("built"));
  }
}`,
  },
  {
    id: 'string-interning',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    String a = "hello";
    String b = "hel" + "lo";
    String c = new String("hello");
    String d = c.intern();
    System.out.println(a == b);
    System.out.println(a == c);
    System.out.println(a == d);
    System.out.println(a.equals(c) + " " + a.equals(d));
  }
}`,
  },
  {
    id: 'assert-like-validation',
    area: 'errors',
    source: `import java.util.Objects;

public class Main {
  record Range(int lo, int hi) {
    Range {
      if (lo > hi) throw new IllegalArgumentException("lo > hi: " + lo + " > " + hi);
    }
    int clamp(int v) { return Math.max(lo, Math.min(hi, v)); }
  }
  public static void main(String[] args) {
    Range r = new Range(1, 10);
    System.out.println(r.clamp(-5) + " " + r.clamp(5) + " " + r.clamp(50));
    try {
      new Range(5, 1);
    } catch (IllegalArgumentException e) {
      System.out.println(e.getMessage());
    }
    try {
      Objects.requireNonNull(null, "must not be null");
    } catch (NullPointerException e) {
      System.out.println(e.getMessage());
    }
  }
}`,
  },
  {
    id: 'bulk-collection-ops',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class Main {
  public static void main(String[] args) {
    List<Integer> a = new ArrayList<>(Arrays.asList(1, 2, 3, 4));
    List<Integer> b = new ArrayList<>(Arrays.asList(3, 4, 5));
    System.out.println(a.containsAll(b) + " " + a.retainAll(b) + " " + a);
    System.out.println(a.addAll(b) + " " + a);
    System.out.println(a.removeAll(Arrays.asList(3)) + " " + a);
    List<String> xs = new ArrayList<>(Arrays.asList("a", "b", "c", "d"));
    System.out.println(xs.subList(1, 3));
    xs.subList(1, 3).clear();
    System.out.println(xs);
  }
}`,
  },
  {
    id: 'binary-trees',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.List;

public class Main {
  static class Node {
    int value; Node left, right;
    Node(int v) { value = v; }
  }
  static Node insert(Node n, int v) {
    if (n == null) return new Node(v);
    if (v < n.value) n.left = insert(n.left, v); else n.right = insert(n.right, v);
    return n;
  }
  static void inorder(Node n, List<Integer> out) {
    if (n == null) return;
    inorder(n.left, out); out.add(n.value); inorder(n.right, out);
  }
  public static void main(String[] args) {
    Node root = null;
    for (int v : new int[]{5, 3, 8, 1, 4, 7, 9}) root = insert(root, v);
    List<Integer> sorted = new ArrayList<>();
    inorder(root, sorted);
    System.out.println(sorted);
    System.out.println(sorted.get(0) + " " + sorted.get(sorted.size() - 1));
  }
}`,
  },
  {
    id: 'state-machine',
    area: 'oop',
    source: `public class Main {
  enum State { IDLE, RUNNING, DONE }
  static class Machine {
    private State state = State.IDLE;
    private int steps;
    Machine start() { if (state == State.IDLE) state = State.RUNNING; return this; }
    Machine step() { if (state == State.RUNNING) steps++; return this; }
    Machine finish() { if (state == State.RUNNING) state = State.DONE; return this; }
    String describe() { return state + ":" + steps; }
  }
  public static void main(String[] args) {
    System.out.println(new Machine().step().describe());
    System.out.println(new Machine().start().step().step().finish().describe());
  }
}`,
  },
  {
    id: 'shapes-interface',
    area: 'oop',
    source: `import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class Main {
  interface Shape { double area(); default String label() { return getClass().getSimpleName(); } }
  record Circle(double r) implements Shape { public double area() { return Math.PI * r * r; } }
  record Square(double s) implements Shape { public double area() { return s * s; } }
  public static void main(String[] args) {
    List<Shape> shapes = new ArrayList<>(List.of(new Circle(1), new Square(3), new Circle(2)));
    shapes.sort(Comparator.comparingDouble(Shape::area));
    StringBuilder sb = new StringBuilder();
    for (Shape s : shapes) sb.append(s.label()).append('(').append(Math.round(s.area())).append(") ");
    System.out.println(sb.toString().trim());
    System.out.println(Math.round(shapes.stream().mapToDouble(Shape::area).sum()));
  }
}`,
  },
  {
    id: 'game-of-life',
    area: 'basics',
    source: `public class Main {
  static final int N = 5;
  static int[][] step(int[][] g) {
    int[][] next = new int[N][N];
    for (int i = 0; i < N; i++) for (int j = 0; j < N; j++) {
      int n = 0;
      for (int di = -1; di <= 1; di++) for (int dj = -1; dj <= 1; dj++) {
        if (di == 0 && dj == 0) continue;
        int r = i + di, c = j + dj;
        if (r >= 0 && r < N && c >= 0 && c < N) n += g[r][c];
      }
      next[i][j] = g[i][j] == 1 ? (n == 2 || n == 3 ? 1 : 0) : (n == 3 ? 1 : 0);
    }
    return next;
  }
  public static void main(String[] args) {
    int[][] grid = new int[N][N];
    grid[1][2] = grid[2][2] = grid[3][2] = 1;
    for (int i = 0; i < 2; i++) grid = step(grid);
    StringBuilder sb = new StringBuilder();
    for (int[] row : grid) { for (int v : row) sb.append(v); sb.append('|'); }
    System.out.println(sb.toString());
  }
}`,
  },
  {
    id: 'use-all-generics',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public class Main {
  static <K extends Comparable<K>, V> Map<K, V> sortedCopy(Map<K, V> in) { return new TreeMap<>(in); }
  static <T> List<T> repeat(T value, int n) {
    List<T> out = new ArrayList<>();
    for (int i = 0; i < n; i++) out.add(value);
    return out;
  }
  public static void main(String[] args) {
    Map<String, Integer> m = new HashMap<>();
    m.put("b", 2); m.put("a", 1);
    System.out.println(sortedCopy(m));
    System.out.println(repeat("x", 3) + " " + repeat(7, 2));
    List<? extends Number> nums = repeat(1, 2);
    double sum = 0;
    for (Number n : nums) sum += n.doubleValue();
    System.out.println(sum);
  }
}`,
  },
];

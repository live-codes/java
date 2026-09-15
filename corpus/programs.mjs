// Shared Java corpus for the engine comparison: the same programs run on
// LiveCodes' current engine (Doppio + JDK 8) and on @live-codes/java-wasm.
//
// Each program is a self-contained `public class Main` that prints deterministic
// output. Some are expected to fail on one engine or the other — that is the point.

export const STDIN = 'livecodes\n';

export const PROGRAMS = [
  {
    id: 'hello',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello, world");
  }
}`,
  },
  {
    id: 'primitives',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    int i = 2147483647;
    long l = 9007199254740993L;
    double d = 1.0 / 3.0;
    char c = 'A';
    boolean b = true;
    System.out.println("overflow=" + (i + 1));
    System.out.println("long=" + l);
    System.out.println("double=" + d);
    System.out.println("char=" + (int) c + " cast=" + (byte) 300);
    System.out.println("bool=" + b + " not=" + !b);
    System.out.println("shift=" + (1 << 31) + " " + (-8 >> 1) + " " + (-8 >>> 1));
  }
}`,
  },
  {
    id: 'strings',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    String s = "Hello, world";
    System.out.println(s.length() + " " + s.substring(7) + " " + s.indexOf("world"));
    System.out.println(s.toUpperCase() + " " + s.replace("world", "java"));
    String[] parts = "a,b,,c".split(",");
    System.out.println(parts.length + " " + String.join("-", parts));
    System.out.println("  pad  ".trim() + "|" + "ab".repeat(3));
    System.out.println(s.contains("world") + " " + s.startsWith("He") + " " + s.charAt(1));
  }
}`,
  },
  {
    id: 'stringbuilder',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < 10; i++) sb.append(i).append(',');
    sb.reverse();
    System.out.println(sb.toString());
    System.out.println(new StringBuilder("abc").deleteCharAt(1).insert(1, "X").toString());
  }
}`,
  },
  {
    id: 'stringformat',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println(String.format("%d|%5d|%-5d|%05d", 42, 42, 42, 42));
    System.out.println(String.format("%.3f|%e|%s|%b", 3.14159, 1234.5, "x", true));
    System.out.printf("%s=%d%n", "n", 7);
    System.out.println(String.format("%,d", 1234567));
  }
}`,
  },
  {
    id: 'arrays-1d',
    area: 'basics',
    source: `import java.util.Arrays;

public class Main {
  public static void main(String[] args) {
    int[] a = {5, 3, 9, 1};
    Arrays.sort(a);
    System.out.println(Arrays.toString(a));
    System.out.println(Arrays.binarySearch(a, 5));
    int[] b = Arrays.copyOf(a, 6);
    Arrays.fill(b, 4, 6, 7);
    System.out.println(Arrays.toString(b) + " sum=" + Arrays.stream(b).sum());
    System.out.println(Arrays.equals(a, new int[]{1, 3, 5, 9}));
  }
}`,
  },
  {
    id: 'arrays-2d',
    area: 'basics',
    source: `import java.util.Arrays;

public class Main {
  public static void main(String[] args) {
    int[][] m = new int[3][3];
    for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) m[i][j] = i * 3 + j;
    for (int[] row : m) System.out.println(Arrays.toString(row));
    System.out.println("deep=" + Arrays.deepToString(m));
  }
}`,
  },
  {
    id: 'boxing',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    Integer a = 127, b = 127, c = 128, d = 128;
    System.out.println((a == b) + " " + (c.equals(d)) + " " + (c == d));
    Integer x = Integer.valueOf("42");
    System.out.println(x + 1 + " " + Integer.parseInt("-7") + " " + Integer.toBinaryString(10));
    System.out.println(Integer.MAX_VALUE + " " + Long.MIN_VALUE + " " + Double.isNaN(0.0 / 0.0));
  }
}`,
  },
  {
    id: 'math-big',
    area: 'basics',
    source: `import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

public class Main {
  public static void main(String[] args) {
    System.out.println(Math.max(3, 7) + " " + Math.abs(-4) + " " + (int) Math.pow(2, 10));
    System.out.println(Math.round(2.5) + " " + Math.floor(2.9) + " " + Math.sqrt(144.0));
    BigDecimal bd = new BigDecimal("1.005");
    System.out.println(bd.setScale(2, RoundingMode.HALF_UP).toPlainString());
    System.out.println(new BigDecimal("0.1").add(new BigDecimal("0.2")));
    BigInteger bi = new BigInteger("123456789012345678901234567890");
    System.out.println(bi.multiply(BigInteger.valueOf(2)));
  }
}`,
  },
  {
    id: 'chars',
    area: 'basics',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println(Character.isDigit('7') + " " + Character.isLetter('x') + " " + Character.toUpperCase('a'));
    String s = "caf\u00e9";
    System.out.println(s.length() + " " + s.codePointAt(3) + " " + (int) s.charAt(3));
    System.out.println(new String(Character.toChars(0x1F600)).codePointCount(0, 2));
  }
}`,
  },
  {
    id: 'inheritance',
    area: 'oop',
    source: `abstract class Shape {
  abstract double area();
  public String toString() { return getClass().getSimpleName() + ":" + area(); }
}
class Square extends Shape {
  private final double side;
  Square(double side) { this.side = side; }
  double area() { return side * side; }
}
class Circle extends Shape {
  private final double r;
  Circle(double r) { this.r = r; }
  double area() { return Math.round(Math.PI * r * r * 100) / 100.0; }
}
public class Main {
  public static void main(String[] args) {
    Shape[] shapes = { new Square(3), new Circle(2) };
    for (Shape s : shapes) System.out.println(s);
    System.out.println(shapes[0] instanceof Square);
  }
}`,
  },
  {
    id: 'interfaces',
    area: 'oop',
    source: `interface Greeter {
  String name();
  default String greet() { return "hello " + name(); }
  static Greeter of(String n) { return () -> n; }
}
interface Loud extends Greeter {
  default String greet() { return Greeter.super.greet().toUpperCase(); }
}
public class Main {
  public static void main(String[] args) {
    System.out.println(Greeter.of("world").greet());
    Loud loud = () -> "scala";
    System.out.println(loud.greet());
  }
}`,
  },
  {
    id: 'inner-classes',
    area: 'oop',
    source: `public class Main {
  private int outer = 10;
  class Inner { int get() { return outer; } }
  static class Nested { int get() { return 1; } }
  public static void main(String[] args) {
    Main m = new Main();
    System.out.println(m.new Inner().get() + " " + new Nested().get());
    Runnable r = new Runnable() { public void run() { System.out.println("anon"); } };
    r.run();
    class Local { int v() { return 5; } }
    System.out.println(new Local().v());
  }
}`,
  },
  {
    id: 'enums',
    area: 'oop',
    source: `public class Main {
  enum Planet {
    MERCURY(3.3e23, 2.4e6), EARTH(5.9e24, 6.3e6);
    private final double mass, radius;
    Planet(double mass, double radius) { this.mass = mass; this.radius = radius; }
    double density() { return mass / (4.0 / 3.0 * Math.PI * Math.pow(radius, 3)); }
  }
  public static void main(String[] args) {
    for (Planet p : Planet.values()) {
      System.out.println(p + " ordinal=" + p.ordinal() + " density=" + (Math.round(p.density()) / 1000));
    }
    switch (Planet.EARTH) {
      case EARTH: System.out.println("home"); break;
      default: System.out.println("away");
    }
    System.out.println(Planet.valueOf("MERCURY") == Planet.MERCURY);
  }
}`,
  },
  {
    id: 'varargs-recursion',
    area: 'oop',
    source: `public class Main {
  static int sum(int... xs) { int t = 0; for (int x : xs) t += x; return t; }
  static long fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
  static void overload(String s) { System.out.println("string " + s); }
  static void overload(Object o) { System.out.println("object " + o); }
  public static void main(String[] args) {
    System.out.println(sum(1, 2, 3) + " " + sum(new int[]{4, 5}) + " " + sum());
    System.out.println("fib=" + fib(20));
    overload("x");
    overload((Object) "x");
  }
}`,
  },
  {
    id: 'list',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;

public class Main {
  public static void main(String[] args) {
    List<String> list = new ArrayList<>(Arrays.asList("b", "a", "c"));
    list.add("d");
    java.util.Collections.sort(list);
    System.out.println(list + " size=" + list.size());
    list.removeIf(s -> s.equals("b"));
    System.out.println(list + " sub=" + list.subList(0, 2));
    for (Iterator<String> it = list.iterator(); it.hasNext(); ) { if (it.next().equals("c")) it.remove(); }
    System.out.println(list + " contains=" + list.contains("a") + " idx=" + list.indexOf("d"));
  }
}`,
  },
  {
    id: 'map',
    area: 'collections',
    source: `import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

public class Main {
  public static void main(String[] args) {
    Map<String, Integer> m = new HashMap<>();
    m.put("a", 1); m.put("b", 2);
    m.merge("a", 10, Integer::sum);
    m.computeIfAbsent("c", k -> 3);
    System.out.println(m.get("a") + " " + m.getOrDefault("z", -1) + " size=" + m.size());
    for (Map.Entry<String, Integer> e : new TreeMap<>(m).entrySet()) {
      System.out.println(e.getKey() + "=" + e.getValue());
    }
    System.out.println(m.keySet() + " " + m.values() + " " + m.containsKey("b"));
  }
}`,
  },
  {
    id: 'set',
    area: 'collections',
    source: `import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.TreeSet;

public class Main {
  public static void main(String[] args) {
    Set<Integer> hs = new HashSet<>();
    hs.add(3); hs.add(1); hs.add(3); hs.add(2);
    System.out.println(hs.size() + " " + hs.contains(2));
    System.out.println(new TreeSet<>(hs));
    System.out.println(new LinkedHashSet<>(new java.util.ArrayList<>(hs)));
    Set<Integer> a = new HashSet<>(java.util.Arrays.asList(1, 2, 3));
    Set<Integer> b = new HashSet<>(java.util.Arrays.asList(2, 3, 4));
    a.retainAll(b);
    System.out.println(a);
  }
}`,
  },
  {
    id: 'generics',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

class Box<T extends Comparable<T>> {
  private final T value;
  Box(T value) { this.value = value; }
  T get() { return value; }
  boolean greater(Box<T> other) { return value.compareTo(other.get()) > 0; }
}

public class Main {
  static double sumOf(List<? extends Number> xs) {
    double t = 0; for (Number n : xs) t += n.doubleValue(); return t;
  }
  static void addInts(List<? super Integer> xs) { xs.add(9); }
  public static void main(String[] args) {
    System.out.println(new Box<>("b").greater(new Box<>("a")));
    System.out.println(sumOf(Arrays.asList(1, 2.5, 3L)));
    List<Number> nums = new ArrayList<>();
    addInts(nums);
    System.out.println(nums);
    List<String> l = new ArrayList<>();
    l.add("x");
    System.out.println(l.get(0).getClass().getSimpleName());
  }
}`,
  },
  {
    id: 'comparator',
    area: 'collections',
    source: `import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

class Person implements Comparable<Person> {
  final String name; final int age;
  Person(String name, int age) { this.name = name; this.age = age; }
  public int compareTo(Person o) { return Integer.compare(age, o.age); }
  public String toString() { return name + "(" + age + ")"; }
}

public class Main {
  public static void main(String[] args) {
    List<Person> ps = new ArrayList<>();
    ps.add(new Person("ann", 30)); ps.add(new Person("bob", 25)); ps.add(new Person("cy", 30));
    java.util.Collections.sort(ps);
    System.out.println(ps);
    ps.sort(Comparator.comparing((Person p) -> p.name).thenComparing(p -> p.age));
    System.out.println(ps);
    ps.sort(Comparator.comparingInt((Person p) -> p.age).reversed());
    System.out.println(ps);
  }
}`,
  },
  {
    id: 'lambda',
    area: 'functional',
    source: `import java.util.Arrays;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.function.Supplier;

public class Main {
  public static void main(String[] args) {
    Function<Integer, Integer> twice = x -> x * 2;
    BiFunction<Integer, Integer, Integer> add = Integer::sum;
    Supplier<String> s = () -> "supplied";
    System.out.println(twice.apply(21) + " " + add.apply(2, 3) + " " + s.get());
    List<String> names = Arrays.asList("ann", "bob");
    names.replaceAll(String::toUpperCase);
    System.out.println(names);
    System.out.println(twice.andThen(x -> x + 1).apply(10));
  }
}`,
  },
  {
    id: 'streams',
    area: 'functional',
    source: `import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

public class Main {
  public static void main(String[] args) {
    List<Integer> xs = Arrays.asList(5, 3, 8, 1, 8);
    System.out.println(xs.stream().filter(n -> n > 2).map(n -> n * 2).collect(Collectors.toList()));
    System.out.println(xs.stream().distinct().sorted().reduce(0, Integer::sum));
    Map<Boolean, List<Integer>> parts = xs.stream().collect(Collectors.partitioningBy(n -> n % 2 == 0));
    System.out.println(parts);
    System.out.println(xs.stream().collect(Collectors.groupingBy(n -> n % 3, Collectors.counting())));
    System.out.println(IntStream.rangeClosed(1, 5).map(n -> n * n).sum());
    System.out.println(IntStream.of(3, 1, 2).max().getAsInt() + " " + xs.stream().mapToInt(Integer::intValue).average().getAsDouble());
    System.out.println(String.join(",", xs.stream().map(String::valueOf).collect(Collectors.toList())));
  }
}`,
  },
  {
    id: 'optional',
    area: 'functional',
    source: `import java.util.Optional;

public class Main {
  public static void main(String[] args) {
    Optional<String> o = Optional.of("value");
    System.out.println(o.map(String::toUpperCase).orElse("none"));
    System.out.println(Optional.<String>empty().orElseGet(() -> "fallback"));
    System.out.println(o.filter(s -> s.length() > 3).isPresent());
    System.out.println(Optional.ofNullable((String) null).isPresent());
    o.ifPresent(v -> System.out.println("got " + v));
    System.out.println(Optional.of(42).map(n -> n + 1).get());
  }
}`,
  },
  {
    id: 'exceptions',
    area: 'errors',
    source: `class AppException extends RuntimeException {
  AppException(String m) { super(m); }
}

public class Main {
  static int risky(int n) {
    try {
      if (n < 0) throw new AppException("negative");
      return 100 / n;
    } catch (ArithmeticException e) {
      return -1;
    } finally {
      System.out.println("finally " + n);
    }
  }
  public static void main(String[] args) {
    System.out.println(risky(5) + " " + risky(0));
    try { risky(-1); } catch (AppException e) { System.out.println("caught " + e.getMessage()); }
    try {
      throw new IllegalStateException("nested");
    } catch (RuntimeException e) {
      System.out.println(e.getClass().getSimpleName() + ":" + e.getMessage());
    }
  }
}`,
  },
  {
    id: 'try-with-resources',
    area: 'errors',
    source: `class Res implements AutoCloseable {
  private final String name;
  Res(String name) { this.name = name; System.out.println("open " + name); }
  public void close() { System.out.println("close " + name); }
  void use() { System.out.println("use " + name); }
}

public class Main {
  public static void main(String[] args) {
    try (Res a = new Res("a"); Res b = new Res("b")) {
      a.use();
      b.use();
    }
    System.out.println("done");
  }
}`,
  },
  {
    id: 'records',
    area: 'modern',
    source: `import java.util.List;

public class Main {
  record Point(int x, int y) {
    Point { if (x < 0) throw new IllegalArgumentException("x"); }
    int sum() { return x + y; }
  }
  public static void main(String[] args) {
    Point p = new Point(1, 2);
    System.out.println(p + " " + p.x() + " " + p.sum());
    System.out.println(p.equals(new Point(1, 2)) + " " + (p.hashCode() == new Point(1, 2).hashCode()));
    System.out.println(List.of(p, new Point(3, 4)));
  }
}`,
  },
  {
    id: 'var-textblock',
    area: 'modern',
    source: `public class Main {
  public static void main(String[] args) {
    var n = 41;
    var s = "text";
    String block = """
        line one
        line two %s""";
    System.out.println(n + 1 + " " + s);
    System.out.println(block.replace(" ", "_"));
    System.out.println(block.lines().count() + " " + block.strip().lines().count());
  }
}`,
  },
  {
    id: 'switch-expression',
    area: 'modern',
    source: `public class Main {
  sealed interface Shape permits Circle, Square {}
  record Circle(double r) implements Shape {}
  record Square(double s) implements Shape {}

  static double area(Shape shape) {
    return switch (shape) {
      case Circle c -> Math.round(Math.PI * c.r() * c.r() * 100) / 100.0;
      case Square s -> s.s() * s.s();
    };
  }
  public static void main(String[] args) {
    System.out.println(area(new Circle(1)) + " " + area(new Square(2)));
    String day = "MON";
    int num = switch (day) { case "MON", "TUE" -> 1; default -> 0; };
    System.out.println(num);
  }
}`,
  },
  {
    id: 'reflection',
    area: 'runtime',
    source: `public class Main {
  static class Thing {
    public int value = 3;
    public String describe() { return "thing"; }
  }
  public static void main(String[] args) throws Exception {
    Thing t = new Thing();
    System.out.println(t.getClass().getName() + " " + t.getClass().getSimpleName());
    System.out.println(t.getClass().getDeclaredFields().length);
    java.lang.reflect.Field f = t.getClass().getDeclaredField("value");
    f.setAccessible(true);
    System.out.println("value=" + f.getInt(t));
    java.lang.reflect.Method m = t.getClass().getDeclaredMethod("describe");
    System.out.println(m.invoke(t));
    System.out.println(Class.forName("java.lang.String").getSimpleName());
  }
}`,
  },
  {
    id: 'time-api',
    area: 'runtime',
    source: `import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class Main {
  public static void main(String[] args) {
    LocalDate d = LocalDate.of(2024, 2, 29);
    System.out.println(d + " " + d.getDayOfWeek() + " " + d.plusDays(1));
    LocalDateTime dt = LocalDateTime.of(2024, 1, 2, 3, 4, 5);
    System.out.println(dt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
    System.out.println(Duration.ofMinutes(90).toMinutes() + " " + d.isLeapYear());
  }
}`,
  },
  {
    id: 'regex',
    area: 'runtime',
    source: `import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Main {
  public static void main(String[] args) {
    Pattern p = Pattern.compile("([a-z]+)([0-9]+)");
    Matcher m = p.matcher("abc123 def456");
    while (m.find()) System.out.println(m.group() + " " + m.group(1) + " " + m.group(2));
    System.out.println("a1b2".replaceAll("[0-9]", "#"));
    System.out.println(Pattern.matches("[0-9]{3}", "123"));
    System.out.println(java.util.Arrays.toString("a,b,,c".split(",")));
  }
}`,
  },
  {
    id: 'system-props',
    area: 'runtime',
    source: `public class Main {
  public static void main(String[] args) {
    System.out.println("java.version=" + System.getProperty("java.version"));
    System.out.println("os.name=" + System.getProperty("os.name"));
    System.out.println("spec=" + System.getProperty("java.specification.version"));
    System.out.println("line.separator=" + System.lineSeparator().length());
    System.out.println("nanoTime>0=" + (System.nanoTime() > 0));
    System.out.println("currentTimeMillis>0=" + (System.currentTimeMillis() > 0));
    long t = System.nanoTime();
    System.out.println("elapsed>=0=" + (System.nanoTime() - t >= 0));
  }
}`,
  },
  {
    id: 'threads',
    area: 'concurrency',
    source: `public class Main {
  public static void main(String[] args) throws Exception {
    Thread t = new Thread(() -> System.out.println("in thread"));
    t.start();
    t.join();
    System.out.println("name=" + Thread.currentThread().getName());
    java.util.concurrent.atomic.AtomicInteger ai = new java.util.concurrent.atomic.AtomicInteger();
    ai.incrementAndGet();
    ai.addAndGet(4);
    System.out.println("atomic=" + ai.get());
  }
}`,
  },
  {
    id: 'file-io',
    area: 'io',
    source: `import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

public class Main {
  public static void main(String[] args) throws Exception {
    Path p = Files.createTempFile("livecodes", ".txt");
    Files.write(p, "hello file".getBytes());
    System.out.println(new String(Files.readAllBytes(p)));
    System.out.println("exists=" + Files.exists(p) + " size=" + Files.size(p));
    Files.delete(p);
    System.out.println("deleted=" + !Files.exists(p));
    System.out.println(new File("/tmp").isAbsolute());
  }
}`,
  },
  {
    id: 'stdin',
    area: 'io',
    source: `import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    String line = br.readLine();
    System.out.println("buffered=" + line);
    Scanner sc = new Scanner(System.in);
    if (sc.hasNextLine()) System.out.println("scanner=" + sc.nextLine());
    else System.out.println("scanner=eof");
  }
}`,
  },
];

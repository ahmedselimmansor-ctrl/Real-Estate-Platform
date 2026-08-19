# Flutter's engine reaches these over JNI, so R8 must not rename or drop them.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# The Flutter embedding compiles against Play Core so that apps *using*
# deferred components work. This app has none, so those classes are absent at
# build time and R8 stops on the dangling references. Nothing here is ever
# reached at runtime; silencing the warnings is the documented resolution
# rather than pulling in a Play dependency we do not use.
-dontwarn com.google.android.play.core.**
-dontwarn com.google.errorprone.annotations.**

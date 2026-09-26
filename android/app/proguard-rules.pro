# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep Capacitor Core & Plugins
-keep public class * extends com.getcapacitor.Plugin
-keep public class * extends com.getcapacitor.BridgeActivity
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep interface com.getcapacitor.** { *; }

# Keep JavaScript Interface methods
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep PluginMethod annotations
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}

# Preserve line numbers for stack traces
-keepattributes SourceFile,LineNumberTable


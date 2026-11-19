import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val configuredOrigin = providers.environmentVariable("IERP_ORIGIN").orElse("https://erp.example.com").get()
val serverUri = URI(configuredOrigin)
require(
    serverUri.scheme == "https" && serverUri.host != null && serverUri.userInfo == null &&
        serverUri.path in setOf("", "/") && serverUri.rawQuery == null && serverUri.rawFragment == null &&
        (serverUri.port == -1 || serverUri.port in 1..65535)
) { "IERP_ORIGIN 必须是 HTTPS 站点源，可包含端口" }
val serverOrigin = "https://" + serverUri.host.lowercase() +
    if (serverUri.port == -1 || serverUri.port == 443) "" else ":${serverUri.port}"

android {
    namespace = "cn.i2000.ierp"
    compileSdk = 35

    defaultConfig {
        applicationId = "cn.i2000.ierp"
        minSdk = 26
        targetSdk = 35
        versionCode = 7
        versionName = "1.2.4"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "IERP_API_BASE_URL", "\"$serverOrigin/api/\"")
        buildConfigField("String", "IERP_ORIGIN", "\"$serverOrigin\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.compose.material:material")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}

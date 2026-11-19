package cn.i2000.ierp.ui

import okhttp3.Cookie
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebWorkspaceConfigTest {
    @Test
    fun nativeSessionCookieIsTransferredWithSecurityAttributes() {
        val cookie = Cookie.Builder()
            .name("ierp_session")
            .value("authenticated")
            .hostOnlyDomain("erp.example.com")
            .path("/")
            .secure()
            .httpOnly()
            .expiresAt(4_102_444_800_000)
            .build()

        val header = WebWorkspaceConfig.cookieHeader(cookie)

        assertTrue(header.startsWith("ierp_session=authenticated; Path=/"))
        assertTrue(header.contains("; Secure"))
        assertTrue(header.contains("; HttpOnly"))
        assertTrue(header.contains("; SameSite=Lax"))
        assertFalse(header.contains("; Domain="))
        assertFalse(header.contains("; Expires="))
    }

    @Test
    fun excludedAiModuleIsHiddenWithoutReplacingTheWebApplication() {
        val script = WebWorkspaceConfig.pageBootstrapScript

        assertTrue(script.contains("AI 中心"))
        assertTrue(script.contains("MutationObserver"))
        assertTrue(script.contains("document.querySelectorAll('button')"))
    }

    @Test
    fun webLoginIsUpgradedToAPersistentSessionInsideTheSamePage() {
        val script = WebWorkspaceConfig.pageBootstrapScript

        assertTrue(script.contains("/api/auth/login"))
        assertTrue(script.contains("payload.persistent = true"))
        assertTrue(script.contains("window.fetch"))
    }

    @Test
    fun blobDownloadsAreStreamedThroughTheNativeBridge() {
        val script = WebWorkspaceConfig.pageBootstrapScript

        assertTrue(script.contains("HTMLAnchorElement.prototype.click"))
        assertTrue(script.contains("window.IERPDownloads.begin"))
        assertTrue(script.contains("window.IERPDownloads.append"))
        assertTrue(script.contains("window.IERPDownloads.finish"))
        assertTrue(script.contains("startsWith('blob:')"))
        assertTrue(script.contains("blob.stream()"))
    }

    @Test
    fun nativeDownloadFileNamesCannotEscapeTheDownloadDirectory() {
        assertTrue(NativeDownloadPolicy.safeFileName("../工程:台账?.csv") == "工程_台账_.csv")
        assertTrue(NativeDownloadPolicy.safeFileName("   ") == "iERP-download")
        assertTrue(NativeDownloadPolicy.safeMimeType("text/csv") == "text/csv")
        assertTrue(NativeDownloadPolicy.safeMimeType("text/csv;charset=utf-8") == "text/csv")
        assertTrue(NativeDownloadPolicy.safeMimeType("bad mime") == "application/octet-stream")
    }

    @Test
    fun initialPageRequestCarriesTheAuthenticatedCookieWithoutWaitingForCallbacks() {
        val cookies = listOf(
            Cookie.Builder()
                .name("ierp_session")
                .value("authenticated")
                .hostOnlyDomain("erp.example.com")
                .path("/")
                .build()
        )

        assertTrue(WebWorkspaceConfig.requestCookieHeader(cookies) == "ierp_session=authenticated")
    }
}

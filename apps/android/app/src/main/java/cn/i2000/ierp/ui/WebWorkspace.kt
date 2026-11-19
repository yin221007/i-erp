package cn.i2000.ierp.ui

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.net.http.SslError
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import cn.i2000.ierp.BuildConfig
import java.io.File
import java.util.UUID
import okhttp3.Cookie

private const val WEB_ROOT = BuildConfig.IERP_ORIGIN + "/"

internal object WebWorkspaceConfig {
    const val homeUrl = WEB_ROOT
    private val origin by lazy { Uri.parse(BuildConfig.IERP_ORIGIN) }

    fun isInternal(url: Uri): Boolean =
        url.scheme == origin.scheme && url.host == origin.host &&
            (if (url.port == -1) 443 else url.port) == (if (origin.port == -1) 443 else origin.port)

    val pageBootstrapScript = """
        (() => {
          if (!window.__ierpNativeFetchInstalled) {
            const originalFetch = window.fetch.bind(window);
            window.fetch = (input, init = {}) => {
              const url = typeof input === 'string' ? input : (input && input.url) || '';
              let isLoginRequest = false;
              try {
                const parsedUrl = new URL(url, window.location.href);
                isLoginRequest = parsedUrl.origin === window.location.origin && parsedUrl.pathname === '/api/auth/login';
              } catch (_) {}
              if (isLoginRequest && typeof init.body === 'string') {
                try {
                  const payload = JSON.parse(init.body);
                  payload.persistent = true;
                  init = { ...init, body: JSON.stringify(payload) };
                } catch (_) {}
              }
              return originalFetch(input, init);
            };
            window.__ierpNativeFetchInstalled = true;
          }

          const downloadToken = /* IERP_DOWNLOAD_TOKEN */ null;
          if (window === window.top && window.location.origin === '${BuildConfig.IERP_ORIGIN}' &&
              downloadToken && window.IERPDownloads && !window.__ierpNativeBlobDownloadsInstalled) {
            const objectUrlBlobs = new Map();
            const createObjectURL = URL.createObjectURL.bind(URL);
            const revokeObjectURL = URL.revokeObjectURL.bind(URL);
            // Keep the original Blob available for exports even when page policy blocks a new fetch.
            URL.createObjectURL = (object) => {
              const objectUrl = createObjectURL(object);
              if (object instanceof Blob) objectUrlBlobs.set(objectUrl, object);
              return objectUrl;
            };
            URL.revokeObjectURL = (objectUrl) => {
              objectUrlBlobs.delete(objectUrl);
              return revokeObjectURL(objectUrl);
            };

            const originalAnchorClick = HTMLAnchorElement.prototype.click;
            const saveBlob = async (anchor) => {
              const blobUrl = anchor.href || '';
              if (!blobUrl.startsWith('blob:')) return false;

              const downloadId = (window.crypto && window.crypto.randomUUID)
                ? window.crypto.randomUUID()
                : `ierp-${'$'}{Date.now()}-${'$'}{Math.random().toString(16).slice(2)}`;
              let started = false;
              try {
                const blob = objectUrlBlobs.get(blobUrl) || await (await window.fetch(blobUrl)).blob();
                const fileName = anchor.download || 'iERP-download';
                const mimeType = blob.type || 'application/octet-stream';
                started = window.IERPDownloads.begin(
                  downloadToken,
                  downloadId,
                  fileName,
                  mimeType,
                  String(blob.size)
                );
                if (!started) throw new Error('native download rejected');

                const chunkSize = 48 * 1024;
                const sendBytes = (bytes) => {
                  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
                    let binary = '';
                    for (let cursor = 0; cursor < chunk.length; cursor += 8192) {
                      binary += String.fromCharCode(...chunk.subarray(cursor, Math.min(cursor + 8192, chunk.length)));
                    }
                    if (!window.IERPDownloads.append(downloadToken, downloadId, window.btoa(binary))) {
                      throw new Error('native download write failed');
                    }
                  }
                };
                if (blob.stream) {
                  const reader = blob.stream().getReader();
                  while (true) {
                    const result = await reader.read();
                    if (result.done) break;
                    sendBytes(result.value);
                  }
                } else {
                  sendBytes(new Uint8Array(await blob.arrayBuffer()));
                }
                if (!window.IERPDownloads.finish(downloadToken, downloadId)) {
                  throw new Error('native download finish failed');
                }
                return true;
              } catch (_) {
                if (started) window.IERPDownloads.abort(downloadToken, downloadId);
                window.alert('下载失败，请稍后重试');
                return false;
              }
            };

            HTMLAnchorElement.prototype.click = function() {
              if ((this.href || '').startsWith('blob:') && this.hasAttribute('download')) {
                void saveBlob(this);
                return;
              }
              return originalAnchorClick.call(this);
            };
            window.__ierpNativeBlobDownloadsInstalled = true;
          }

          const hideExcludedModules = () => {
            document.querySelectorAll('button').forEach((button) => {
              if (button.textContent && button.textContent.trim().includes('AI 中心')) {
                button.style.setProperty('display', 'none', 'important');
              }
            });
          };
          hideExcludedModules();
          if (!window.__ierpNativeModuleObserver) {
            window.__ierpNativeModuleObserver = new MutationObserver(hideExcludedModules);
            window.__ierpNativeModuleObserver.observe(document.documentElement, { childList: true, subtree: true });
          }
        })();
    """.trimIndent()

    fun bootstrapWithDownloads(token: UUID): String =
        pageBootstrapScript.replace("/* IERP_DOWNLOAD_TOKEN */ null", "'$token'")

    fun cookieHeader(cookie: Cookie): String = buildString {
        append(cookie.name).append('=').append(cookie.value)
        append("; Path=").append(cookie.path)
        if (!cookie.hostOnly) append("; Domain=").append(cookie.domain)
        // WebView only needs a process cookie; the native cookie store restores it on every launch.
        if (cookie.secure) append("; Secure")
        if (cookie.httpOnly) append("; HttpOnly")
        append("; SameSite=Lax")
    }

    fun requestCookieHeader(cookies: List<Cookie>): String =
        cookies.joinToString("; ") { "${it.name}=${it.value}" }
}

@Composable
fun WebWorkspace(sessionCookies: List<Cookie>) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var webView by remember { mutableStateOf<WebView?>(null) }
    var loading by remember { mutableStateOf(true) }
    var loadFailed by remember { mutableStateOf(false) }
    var fileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var capturedImageUri by remember { mutableStateOf<Uri?>(null) }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val selected = if (result.resultCode == Activity.RESULT_OK && result.data?.data == null) {
            capturedImageUri?.let { arrayOf(it) }
        } else {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        }
        fileCallback?.onReceiveValue(selected)
        fileCallback = null
        capturedImageUri = null
    }

    BackHandler(enabled = webView?.canGoBack() == true) { webView?.goBack() }

    Box(Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                WebView(context).apply {
                    webView = this
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = true
                    settings.allowContentAccess = true
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    settings.mediaPlaybackRequiresUserGesture = true
                    settings.setSupportMultipleWindows(false)
                    settings.userAgentString = "${settings.userAgentString} iERP-Android/${BuildConfig.VERSION_NAME}"
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)

                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                            val url = request.url
                            if (!WebWorkspaceConfig.isInternal(url)) {
                                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, url)) }
                                return true
                            }
                            return false
                        }

                        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                            loading = true
                            loadFailed = false
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            loading = false
                            view.evaluateJavascript(WebWorkspaceConfig.pageBootstrapScript, null)
                            CookieManager.getInstance().flush()
                        }

                        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                            if (request.isForMainFrame) {
                                loading = false
                                loadFailed = true
                            }
                        }

                        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                            handler.cancel()
                            loading = false
                            loadFailed = true
                        }
                    }

                    webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(
                            webView: WebView,
                            callback: ValueCallback<Array<Uri>>,
                            fileChooserParams: FileChooserParams
                        ): Boolean {
                            fileCallback?.onReceiveValue(null)
                            fileCallback = callback
                            val pickerIntent = runCatching { fileChooserParams.createIntent() }
                                .getOrElse { Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE) }
                            val acceptTypes = fileChooserParams.acceptTypes.filter { it.isNotBlank() }
                            val acceptsImage = acceptTypes.isEmpty() || acceptTypes.any { it == "*/*" || it.startsWith("image/") }
                            val cameraIntent = if (acceptsImage) createCameraIntent(context) { capturedImageUri = it } else null
                            val chooser = Intent.createChooser(pickerIntent, "选择上传文件").apply {
                                if (cameraIntent != null) putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
                            }
                            filePicker.launch(chooser)
                            return true
                        }
                    }

                    setDownloadListener(WebDownloadListener(context))
                    loadAuthenticatedHome(this, sessionCookies)
                }
            },
            update = { }
        )

        if (loading) CircularProgressIndicator(Modifier.align(Alignment.Center))
        if (loadFailed) {
            Surface(Modifier.fillMaxSize()) {
                Box(contentAlignment = Alignment.Center) {
                    Button(onClick = { webView?.reload() }) { Text("连接失败，点此重试") }
                }
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            fileCallback?.onReceiveValue(null)
            webView?.stopLoading()
            webView?.destroy()
        }
    }
}

private fun loadAuthenticatedHome(webView: WebView, cookies: List<Cookie>) {
    val manager = CookieManager.getInstance()
    manager.setAcceptCookie(true)
    cookies.forEach { cookie ->
        manager.setCookie(WEB_ROOT, WebWorkspaceConfig.cookieHeader(cookie)) {
            manager.flush()
        }
    }
    manager.flush()

    // Do not wait for CookieManager callbacks: some vendor WebViews never invoke them.
    // The first request also carries the cookie header so authenticated rendering starts immediately.
    val cookieHeader = WebWorkspaceConfig.requestCookieHeader(cookies)
    if (cookieHeader.isEmpty()) webView.loadUrl(WEB_ROOT)
    else webView.loadUrl(WEB_ROOT, mapOf("Cookie" to cookieHeader))
}

private fun createCameraIntent(context: Context, onUri: (Uri) -> Unit): Intent? = runCatching {
    val directory = File(context.cacheDir, "camera").apply { mkdirs() }
    val image = File(directory, "ierp-${System.currentTimeMillis()}.jpg")
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", image)
    onUri(uri)
    Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
        putExtra(MediaStore.EXTRA_OUTPUT, uri)
        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }.takeIf { it.resolveActivity(context.packageManager) != null }
}.getOrNull()

private class WebDownloadListener(private val context: Context) : DownloadListener {
    override fun onDownloadStart(
        url: String,
        userAgent: String,
        contentDisposition: String,
        mimetype: String,
        contentLength: Long
    ) {
        runCatching {
            val fileName = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimetype)
            val request = DownloadManager.Request(Uri.parse(url))
                .setMimeType(mimetype)
                .setTitle(fileName)
                .setDescription("正在下载 iERP 文件")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
            CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
            request.addRequestHeader("User-Agent", userAgent)
            (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(context, "已开始下载：$fileName", Toast.LENGTH_LONG).show()
        }.onFailure {
            Toast.makeText(context, "下载失败，请稍后重试", Toast.LENGTH_LONG).show()
        }
    }
}

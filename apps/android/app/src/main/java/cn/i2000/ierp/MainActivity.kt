package cn.i2000.ierp

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import cn.i2000.ierp.ui.WebWorkspaceConfig
import cn.i2000.ierp.ui.NativeDownloadBridge
import cn.i2000.ierp.ui.NativeDownloadPolicy
import java.io.File

private const val WEB_LOG_TAG = "IERPWebView"

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var capturedImageUri: Uri? = null
    private var lastExitAttemptAt = 0L
    private var webViewDestroyed = false
    private lateinit var downloadBridge: NativeDownloadBridge

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val selected = if (result.resultCode == Activity.RESULT_OK && result.data?.data == null) {
            capturedImageUri?.let { arrayOf(it) }
        } else {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        }
        fileCallback?.onReceiveValue(selected)
        fileCallback = null
        capturedImageUri = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        downloadBridge = NativeDownloadBridge(this)

        val root = FrameLayout(this)
        webView = createWebView()
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val params = webView.layoutParams as FrameLayout.LayoutParams
            if (
                params.topMargin != bars.top || params.bottomMargin != bars.bottom ||
                params.leftMargin != bars.left || params.rightMargin != bars.right
            ) {
                params.topMargin = bars.top
                params.bottomMargin = bars.bottom
                params.leftMargin = bars.left
                params.rightMargin = bars.right
                webView.layoutParams = params
            }
            insets
        }
        setContentView(root)

        onBackPressedDispatcher.addCallback(this) { handleBackNavigation() }
    }

    private fun createWebView(): WebView = WebView(this).apply {
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
        isFocusable = true
        isFocusableInTouchMode = true
        requestFocusFromTouch()
        addJavascriptInterface(downloadBridge, "IERPDownloads")

        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (!WebWorkspaceConfig.isInternal(url)) {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                        .onFailure { Toast.makeText(this@MainActivity, "无法打开外部链接", Toast.LENGTH_SHORT).show() }
                    return true
                }
                return false
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                Log.i(WEB_LOG_TAG, "page started: $url")
            }

            override fun onPageFinished(view: WebView, url: String?) {
                Log.i(WEB_LOG_TAG, "page finished: $url")
                val page = url?.let(Uri::parse)
                if (page != null && WebWorkspaceConfig.isInternal(page)) {
                    view.evaluateJavascript(WebWorkspaceConfig.bootstrapWithDownloads(downloadBridge.pageToken), null)
                }
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    Log.e(WEB_LOG_TAG, "main-frame error ${error.errorCode}: ${error.description} at ${request.url}")
                    showConnectionError(view)
                }
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                Log.e(WEB_LOG_TAG, "SSL error ${error.primaryError} at ${error.url}")
                handler.cancel()
                showConnectionError(view)
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                Log.e(WEB_LOG_TAG, "renderer exited; crashed=${detail.didCrash()}")
                view.destroy()
                webViewDestroyed = true
                recreate()
                return true
            }
        }

        webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) {
                    Log.i(
                        WEB_LOG_TAG,
                        "console ${consoleMessage.messageLevel()} ${consoleMessage.sourceId()}:${consoleMessage.lineNumber()} ${consoleMessage.message()}"
                    )
                }
                return true
            }

            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val pickerIntent = runCatching { fileChooserParams.createIntent() }
                    .getOrElse {
                        Intent(Intent.ACTION_OPEN_DOCUMENT)
                            .setType("*/*")
                            .addCategory(Intent.CATEGORY_OPENABLE)
                    }
                val acceptTypes = fileChooserParams.acceptTypes.filter { it.isNotBlank() }
                val acceptsImage = acceptTypes.isEmpty() || acceptTypes.any { it == "*/*" || it.startsWith("image/") }
                val cameraIntent = if (acceptsImage) createCameraIntent() else null
                val chooser = Intent.createChooser(pickerIntent, "选择上传文件").apply {
                    if (cameraIntent != null) putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
                }
                filePicker.launch(chooser)
                return true
            }
        }

        setDownloadListener(WebDownloadListener(this@MainActivity))
        loadUrl(WebWorkspaceConfig.homeUrl)
    }

    private fun handleBackNavigation() {
        val closeSidebarScript = """
            (() => {
              const overlay = Array.from(document.querySelectorAll('div')).find((element) =>
                element.classList.contains('bg-slate-950/60') &&
                getComputedStyle(element).pointerEvents !== 'none' &&
                Number.parseFloat(getComputedStyle(element).opacity) > 0
              );
              if (!overlay) return false;
              overlay.click();
              return true;
            })()
        """.trimIndent()
        webView.evaluateJavascript(closeSidebarScript) { closedSidebar ->
            if (closedSidebar == "true") return@evaluateJavascript
            if (webView.canGoBack()) {
                webView.goBack()
                return@evaluateJavascript
            }

            val now = System.currentTimeMillis()
            if (now - lastExitAttemptAt <= 2_000L) {
                finish()
            } else {
                lastExitAttemptAt = now
                Toast.makeText(this, "再返回一次退出 iERP", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun createCameraIntent(): Intent? = runCatching {
        val directory = File(cacheDir, "camera").apply { mkdirs() }
        val image = File(directory, "ierp-${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(this, "$packageName.files", image)
        capturedImageUri = uri
        Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }.takeIf { it.resolveActivity(packageManager) != null }
    }.getOrNull()

    private fun showConnectionError(view: WebView) {
        val html = """
            <!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f5f9;font-family:sans-serif;color:#0f172a}.card{padding:28px;text-align:center}button{border:0;border-radius:14px;background:#2563eb;color:#fff;padding:14px 24px;font-size:16px;font-weight:700}</style>
            <div class="card"><h2>暂时无法连接 iERP</h2><p>请检查手机网络后重试。</p><button onclick="location.href='${WebWorkspaceConfig.homeUrl}'">重新连接</button></div>
        """.trimIndent()
        view.loadDataWithBaseURL(WebWorkspaceConfig.homeUrl, html, "text/html", "UTF-8", null)
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        if (::downloadBridge.isInitialized) downloadBridge.abortAll()
        if (!webViewDestroyed) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}

private class WebDownloadListener(private val context: Context) : DownloadListener {
    override fun onDownloadStart(
        url: String,
        userAgent: String,
        contentDisposition: String,
        mimeType: String,
        contentLength: Long
    ) {
        runCatching {
            val fileName = NativeDownloadPolicy.safeFileName(
                android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType)
            )
            val request = DownloadManager.Request(Uri.parse(url))
                .setMimeType(mimeType)
                .setTitle(fileName)
                .setDescription("正在下载 iERP 文件")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    "iERP/$fileName"
                )
            } else {
                request.setDestinationInExternalFilesDir(
                    context,
                    Environment.DIRECTORY_DOWNLOADS,
                    "iERP/$fileName"
                )
            }
            CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
            request.addRequestHeader("User-Agent", userAgent)
            (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(context, "已开始下载：$fileName", Toast.LENGTH_LONG).show()
        }.onFailure {
            Toast.makeText(context, "下载失败，请稍后重试", Toast.LENGTH_LONG).show()
        }
    }
}

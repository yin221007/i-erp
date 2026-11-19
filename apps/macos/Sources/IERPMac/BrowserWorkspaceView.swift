import AppKit
import SwiftUI
import WebKit

@MainActor
final class BrowserController: ObservableObject {
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = true
    @Published var errorMessage: String?

    weak var webView: WKWebView?

    func goBack() { webView?.goBack() }
    func goForward() { webView?.goForward() }
    func reload() { errorMessage = nil; webView?.reload() }
    func goHome() { webView?.load(URLRequest(url: BrowserWorkspace.homeURL)) }

    func update(from webView: WKWebView) {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        isLoading = webView.isLoading
    }
}

struct BrowserWorkspaceView: View {
    @StateObject private var browser = BrowserController()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Button(action: browser.goBack) { Image(systemName: "chevron.left") }
                    .disabled(!browser.canGoBack)
                    .help("后退")
                Button(action: browser.goForward) { Image(systemName: "chevron.right") }
                    .disabled(!browser.canGoForward)
                    .help("前进")
                Button(action: browser.reload) { Image(systemName: "arrow.clockwise") }
                    .help("刷新")
                Button(action: browser.goHome) { Image(systemName: "house") }
                    .help("首页")
                Text("iERP")
                    .font(.headline)
                Spacer()
                if browser.isLoading { ProgressView().controlSize(.small) }
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, 12)
            .frame(height: 38)
            .background(.bar)

            ZStack {
                BrowserWebView(controller: browser)
                if let errorMessage = browser.errorMessage {
                    ContentUnavailableView {
                        Label("页面连接失败", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("重新加载", action: browser.reload)
                    }
                    .background(.background)
                }
            }
        }
    }
}

enum BrowserWorkspace {
    static let homeURL = URL(string: APIClient.productionOrigin + "/")!

    static let loginPersistenceScript = """
    (() => {
      if (window.__ierpNativeFetchInstalled) return;
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
    })();
    """

    static let hideExcludedModulesScript = """
    (() => {
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
    """

    static func isInternal(_ url: URL) -> Bool {
        url.scheme == homeURL.scheme && url.host == homeURL.host && url.port == homeURL.port
    }

    static func isWorkspaceSessionCookie(_ cookie: HTTPCookie) -> Bool {
        cookie.name == "ierp_session" && cookie.domain == homeURL.host &&
            cookie.path == "/" && cookie.isSecure && cookie.isHTTPOnly
    }
}

struct BrowserWebView: NSViewRepresentable {
    @ObservedObject var controller: BrowserController

    func makeCoordinator() -> Coordinator { Coordinator(controller: controller) }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        configuration.applicationNameForUserAgent = "iERP-macOS/\(appVersion)"
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: BrowserWorkspace.loginPersistenceScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: BrowserWorkspace.hideExcludedModulesScript,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: false
            )
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsMagnification = true
        webView.allowsBackForwardNavigationGestures = true
        controller.webView = webView
        context.coordinator.loadAuthenticatedHome(in: webView)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        controller.webView = webView
    }

    static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.stopObservingCookies()
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKHTTPCookieStoreObserver {
        private let controller: BrowserController
        private weak var observedCookieStore: WKHTTPCookieStore?
        private var isWorkspaceActive = true
        private var cookieRevision = 0

        init(controller: BrowserController) {
            self.controller = controller
        }

        func loadAuthenticatedHome(in webView: WKWebView) {
            let cookies = HTTPCookieStorage.shared.cookies(for: BrowserWorkspace.homeURL) ?? []
            let store = webView.configuration.websiteDataStore.httpCookieStore
            let start = { [weak self, weak webView] in
                guard let self, let webView, self.isWorkspaceActive else { return }
                self.observedCookieStore = store
                store.add(self)
                webView.load(URLRequest(url: BrowserWorkspace.homeURL))
            }
            guard !cookies.isEmpty else {
                start()
                return
            }
            let group = DispatchGroup()
            cookies.forEach { cookie in
                group.enter()
                store.setCookie(cookie) { group.leave() }
            }
            group.notify(queue: .main) {
                start()
            }
        }

        func stopObservingCookies() {
            isWorkspaceActive = false
            observedCookieStore?.remove(self)
            observedCookieStore = nil
        }

        func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
            cookieRevision += 1
            let revision = cookieRevision
            cookieStore.getAllCookies { [weak self] cookies in
                guard let self, self.observedCookieStore === cookieStore, self.cookieRevision == revision else { return }
                // Native startup checks this cookie jar. Follow web login and logout so neither
                // a previous account nor an expired web session is restored on the next launch.
                let storage = HTTPCookieStorage.shared
                if let session = cookies.first(where: BrowserWorkspace.isWorkspaceSessionCookie) {
                    storage.setCookie(session)
                } else {
                    let nativeCookies = storage.cookies(for: BrowserWorkspace.homeURL) ?? []
                    nativeCookies.filter(BrowserWorkspace.isWorkspaceSessionCookie).forEach(storage.deleteCookie)
                }
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
            controller.errorMessage = nil
            controller.update(from: webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            controller.update(from: webView)
            webView.evaluateJavaScript(BrowserWorkspace.hideExcludedModulesScript)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
            show(error, webView: webView)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: Error) {
            show(error, webView: webView)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download)
            } else if BrowserWorkspace.isInternal(url) {
                decisionHandler(.allow)
            } else {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            let panel = NSSavePanel()
            panel.nameFieldStringValue = suggestedFilename
            panel.canCreateDirectories = true
            panel.begin { result in
                completionHandler(result == .OK ? panel.url : nil)
            }
        }

        func downloadDidFinish(_ download: WKDownload) {
            controller.errorMessage = nil
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            controller.errorMessage = "下载失败：\(error.localizedDescription)"
        }

        func webView(
            _ webView: WKWebView,
            runOpenPanelWith parameters: WKOpenPanelParameters,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping ([URL]?) -> Void
        ) {
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = parameters.allowsMultipleSelection
            panel.canChooseDirectories = parameters.allowsDirectories
            panel.canChooseFiles = true
            panel.begin { result in
                completionHandler(result == .OK ? panel.urls : nil)
            }
        }

        private func show(_ error: Error, webView: WKWebView) {
            controller.update(from: webView)
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
            controller.errorMessage = error.localizedDescription
        }
    }
}

import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.051, green: 0.043, blue: 0.071, alpha: 1)

        var request = URLRequest(url: url)
        request.cachePolicy = .useProtocolCachePolicy
        webView.load(request)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var parent: WebView

        init(_ parent: WebView) {
            self.parent = parent
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            parent.isLoading = true
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.isLoading = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
            // Offline-Seite anzeigen
            let html = """
            <html><body style="background:#0d0b12;color:#f0ecf8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;margin:0">
            <div><div style="font-size:48px">📡</div><h2 style="margin:16px 0 8px">Keine Verbindung</h2>
            <p style="color:#7a6e8a">Bitte Internet prüfen und neu laden.</p>
            <button onclick="location.reload()" style="background:#e8156a;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:16px;margin-top:16px;">Neu laden</button>
            </div></body></html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }

        // Datei-Upload erlauben
        func webView(_ webView: WKWebView,
                     runOpenPanelWith parameters: WKOpenPanelParameters,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping ([URL]?) -> Void) {
            completionHandler(nil)
        }
    }
}

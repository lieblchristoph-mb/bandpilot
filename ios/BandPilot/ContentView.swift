import SwiftUI

struct ContentView: View {
    @State private var isLoading = true

    var body: some View {
        ZStack {
            Color(red: 0.051, green: 0.043, blue: 0.071)
                .ignoresSafeArea()

            WebView(url: URL(string: "https://thedeadnotesapp.duckdns.org")!,
                    isLoading: $isLoading)
                .ignoresSafeArea()

            if isLoading {
                ZStack {
                    Color(red: 0.051, green: 0.043, blue: 0.071)
                        .ignoresSafeArea()
                    VStack(spacing: 20) {
                        Text("🎸")
                            .font(.system(size: 64))
                        Text("BandPilot")
                            .font(.system(size: 30, weight: .bold))
                            .foregroundColor(.white)
                        ProgressView()
                            .tint(Color(red: 0.91, green: 0.08, blue: 0.42))
                    }
                }
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.3), value: isLoading)
    }
}

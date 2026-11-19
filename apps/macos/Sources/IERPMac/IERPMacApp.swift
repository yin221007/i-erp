import SwiftUI

@main
struct IERPMacApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if model.isRestoring {
                    ProgressView("正在恢复登录…")
                        .frame(width: 420, height: 280)
                } else if model.user == nil {
                    LoginView()
                } else {
                    BrowserWorkspaceView()
                }
            }
            .environmentObject(model)
            .frame(minWidth: model.user == nil ? 420 : 960, minHeight: model.user == nil ? 420 : 640)
        }
        .defaultSize(width: 1280, height: 800)

        Settings {
            Form {
                LabeledContent("服务器", value: APIClient.productionOrigin)
                Text("登录会话由服务器安全 Cookie 管理。")
                    .foregroundStyle(.secondary)
            }
            .padding(24)
            .frame(width: 460)
        }
    }
}

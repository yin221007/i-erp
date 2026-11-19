import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var model: AppModel
    @State private var username = ""
    @State private var password = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: "building.2.crop.circle.fill")
                .font(.system(size: 52))
                .foregroundStyle(.tint)
            Text("iERP")
                .font(.largeTitle.bold())
            Text("企业资源管理")
                .font(.title3)
                .foregroundStyle(.secondary)
            TextField("账号", text: $username)
                .textFieldStyle(.roundedBorder)
                .onSubmit(submit)
            SecureField("密码", text: $password)
                .textFieldStyle(.roundedBorder)
                .onSubmit(submit)
            Button(action: submit) {
                HStack {
                    Spacer()
                    if model.isWorking { ProgressView().controlSize(.small) }
                    Text("登录")
                    Spacer()
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(model.isWorking)
            .keyboardShortcut(.defaultAction)
            Text("登录后保持在线，退出登录或修改密码时会立即失效。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(width: 340)
        .padding(40)
    }

    private func submit() {
        model.login(username: username, password: password)
    }
}

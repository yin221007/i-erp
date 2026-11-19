import SwiftUI
import UniformTypeIdentifiers

struct StructuredRecordView: View {
    @EnvironmentObject private var model: AppModel
    let module: IERPModule
    let record: ResourceRecord

    private var orderedFields: [(String, String, JSONValue)] {
        let definitions = module.definition?.fields ?? []
        var result = definitions.compactMap { field in
            record.values[field.key].map { (field.key, field.label, $0) }
        }
        var known = Set(definitions.map(\.key)).union(["id", "password"])
        if module == .mail {
            known.formUnion(["html", "text"])
            let text = record.values["text"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
            let body = text?.isEmpty == false ? text! : Self.readableHTML(record.values["html"]?.stringValue ?? "")
            if !body.isEmpty { result.append(("mailBody", "正文", .string(body))) }
        }
        result += record.values.filter { !known.contains($0.key) }.sorted { $0.key < $1.key }.map {
            ($0.key, Self.label(for: $0.key), $0.value)
        }
        return result
    }

    var body: some View {
        ForEach(orderedFields, id: \.0) { key, label, value in
            if value != .null {
                switch value {
                case .array(let rows):
                    Section(label) {
                        if rows.isEmpty { Text("暂无").foregroundStyle(.secondary) }
                        ForEach(Array(rows.enumerated()), id: \.offset) { index, item in
                            VStack(alignment: .leading, spacing: 5) {
                                Text("\(label) \(index + 1)").font(.headline)
                                StructuredJSONValue(value: item)
                            }
                            .padding(.vertical, 5)
                        }
                        if module == .mail {
                            ForEach(Array(rows.enumerated()), id: \.offset) { _, item in
                                if case .object(let fields) = item,
                                   let part = fields["part"]?.stringValue {
                                    let filename = fields["filename"]?.stringValue ?? "邮件附件"
                                    Button("打开附件：\(filename)") {
                                        model.openAttachment(
                                            path: "/api/email/messages/\(record.id)/attachments/\(part)",
                                            name: filename
                                        )
                                    }
                                }
                            }
                        }
                    }
                case .object:
                    Section(label) { StructuredJSONValue(value: value) }
                default:
                    if key == "url", let path = value.stringValue, !path.isEmpty {
                        LabeledContent(label) {
                            Button("预览或下载") { model.openAttachment(path: path, name: record.title) }
                        }
                    } else {
                        LabeledContent(label, value: value.humanText)
                    }
                }
            }
        }
    }

    static func label(for key: String) -> String {
        [
            "status": "状态", "date": "日期", "createdAt": "创建时间", "updatedAt": "更新时间",
            "creatorName": "创建人", "uploader": "上传人", "department": "部门", "permission": "权限",
            "subject": "主题", "from": "发件人", "to": "收件人", "text": "正文", "html": "正文",
            "timestamp": "时间", "phase": "阶段", "message": "说明", "mediaPhase": "影像阶段",
            "capturedAt": "拍摄日期", "mediaType": "影像类型", "actionExecutionStatus": "执行状态"
        ][key] ?? key
    }

    private static func readableHTML(_ html: String) -> String {
        var value = html.replacingOccurrences(
            of: "(?is)<(script|style)[^>]*>.*?</\\1>", with: "", options: .regularExpression
        )
        value = value.replacingOccurrences(
            of: "(?i)<br\\s*/?>|</p\\s*>|</div\\s*>|</li\\s*>|</tr\\s*>",
            with: "\n", options: .regularExpression
        )
        value = value.replacingOccurrences(of: "(?s)<[^>]+>", with: "", options: .regularExpression)
        let entities = ["&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'"]
        for (entity, decoded) in entities { value = value.replacingOccurrences(of: entity, with: decoded) }
        value = value.replacingOccurrences(of: "[ \\t]+", with: " ", options: .regularExpression)
        value = value.replacingOccurrences(of: "\\n{3,}", with: "\n\n", options: .regularExpression)
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private struct StructuredJSONValue: View {
    let value: JSONValue

    var body: some View {
        switch value {
        case .object(let fields):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(fields.sorted(by: { $0.key < $1.key }), id: \.key) { key, value in
                    if value != .null {
                        Text("\(StructuredRecordView.label(for: key))：\(value.humanText)")
                            .textSelection(.enabled)
                    }
                }
            }
        case .array(let rows):
            VStack(alignment: .leading) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in Text(row.humanText) }
            }
        default:
            Text(value.humanText).textSelection(.enabled)
        }
    }
}

struct StructuredListFieldEditor: View {
    let field: FieldDefinition
    @Binding var value: String

    private var rows: [JSONValue] {
        guard let data = value.data(using: .utf8),
              case .array(let rows) = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [] }
        return rows
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(field.label).font(.headline)
                Spacer()
                Button("添加", systemImage: "plus") { addRow() }
            }
            if rows.isEmpty { Text("暂无内容").foregroundStyle(.secondary) }
            ForEach(Array(rows.enumerated()), id: \.offset) { index, _ in
                GroupBox("\(field.label) \(index + 1)") {
                    VStack(spacing: 8) {
                        ForEach(field.itemFields) { child in
                            if child.kind == .choice {
                                Picker(child.label, selection: binding(index: index, field: child)) {
                                    Text("请选择").tag("")
                                    ForEach(child.choices, id: \.self) { Text($0).tag($0) }
                                }
                            } else {
                                TextField(child.label, text: binding(index: index, field: child))
                            }
                        }
                        HStack { Spacer(); Button("删除", role: .destructive) { removeRow(index) } }
                    }
                    .padding(6)
                }
            }
        }
    }

    private func binding(index: Int, field child: FieldDefinition) -> Binding<String> {
        Binding(
            get: {
                guard index < rows.count else { return "" }
                if field.itemFields.count == 1, field.itemFields[0].key == "value" {
                    return rows[index].stringValue ?? ""
                }
                guard case .object(let object) = rows[index] else { return "" }
                return object[child.key]?.humanText ?? ""
            },
            set: { newValue in
                var updated = rows
                guard index < updated.count else { return }
                if field.itemFields.count == 1, field.itemFields[0].key == "value" {
                    updated[index] = .string(newValue)
                } else {
                    var object: [String: JSONValue]
                    if case .object(let existing) = updated[index] { object = existing } else { object = [:] }
                    object[child.key] = child.kind == .number ? .number(Double(newValue) ?? 0) : .string(newValue)
                    updated[index] = .object(object)
                }
                encode(updated)
            }
        )
    }

    private func addRow() {
        var updated = rows
        if field.itemFields.count == 1, field.itemFields[0].key == "value" {
            updated.append(.string(""))
        } else {
            var object = Dictionary(uniqueKeysWithValues: field.itemFields.map { ($0.key, JSONValue.string("")) })
            object["id"] = .string("item-\(UUID().uuidString)")
            updated.append(.object(object))
        }
        encode(updated)
    }

    private func removeRow(_ index: Int) {
        var updated = rows
        guard index < updated.count else { return }
        updated.remove(at: index)
        encode(updated)
    }

    private func encode(_ rows: [JSONValue]) {
        guard let data = try? JSONEncoder().encode(JSONValue.array(rows)) else { return }
        value = String(decoding: data, as: UTF8.self)
    }
}

struct ArchiveUploadSheet: View {
    @Environment(\.dismiss) private var dismiss
    let fileURL: URL
    let media: Bool
    let projects: [ResourceRecord]
    let upload: (String, String, String, String, String, String) -> Void
    @State private var projectID = ""
    @State private var category = "Other"
    @State private var phase = "前期对接 & 设计"
    @State private var date = Date()
    @State private var albumTitle = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("上传 \(fileURL.lastPathComponent)").font(.title2.bold())
                Spacer()
                Button("取消") { dismiss() }
                Button("上传") { submit() }.buttonStyle(.borderedProminent).disabled(projectID.isEmpty)
            }.padding()
            Divider()
            Form {
                Picker("所属工程", selection: $projectID) {
                    Text("请选择").tag("")
                    ForEach(projects) { Text($0.title).tag($0.id) }
                }
                if media {
                    Picker("拍摄阶段", selection: $phase) {
                        ForEach(["前期对接 & 设计", "生产准备", "进场施工", "安装调试", "验收交付", "结算收尾"], id: \.self) { Text($0) }
                    }
                    DatePicker("拍摄日期", selection: $date, displayedComponents: .date)
                    TextField("影像相册 / 文件夹（可选）", text: $albumTitle)
                } else {
                    Picker("档案分类", selection: $category) {
                        ForEach(["Drawing", "Contract", "Invoice", "List", "ContactForm", "Inspection", "Acceptance", "Audit", "Settlement", "AuditMaterial", "WinningNotice", "SignOff", "Training", "Other"], id: \.self) { Text($0) }
                    }
                }
            }.formStyle(.grouped)
        }
        .frame(width: 600, height: 420)
        .onAppear { if projectID.isEmpty { projectID = projects.first?.id ?? "" } }
    }

    private func submit() {
        guard let project = projects.first(where: { $0.id == projectID }) else { return }
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"
        upload(projectID, project.title, media ? "Media" : category, phase, formatter.string(from: date), albumTitle)
    }
}

struct ApprovalActionsView: View {
    @EnvironmentObject private var model: AppModel
    let record: ResourceRecord
    @State private var action: String?
    @State private var comment = ""

    var body: some View {
        Section("审批处理") {
            TextField("审批意见", text: $comment, axis: .vertical)
            HStack {
                Button("通过") { action = "Approved" }.buttonStyle(.borderedProminent)
                Button("退回") { action = "Returned" }
                Button("拒绝", role: .destructive) { action = "Rejected" }
            }
        }
        .confirmationDialog("确认提交审批结果？", isPresented: Binding(get: { action != nil }, set: { if !$0 { action = nil } })) {
            Button("确认提交") {
                if let action { model.actOnApproval(id: record.id, status: action, comment: comment) }
                action = nil
            }
            Button("取消", role: .cancel) { action = nil }
        }
    }
}

struct ProductionActionsView: View {
    @EnvironmentObject private var model: AppModel
    let record: ResourceRecord
    @State private var importing = false
    @State private var exporting = false
    @State private var pendingStatus: String?
    private var canWrite: Bool {
        model.user?.permission == "ReadWrite" || model.user?.role == "Admin" || model.user?.isDefaultAdmin == true
    }

    var body: some View {
        Section("生产工具") {
            HStack {
                Button("导出 CSV", systemImage: "square.and.arrow.down") { exporting = true }
                if canWrite { Button("导入 CSV", systemImage: "square.and.arrow.up") { importing = true } }
            }
            if canWrite {
                Text("整单批量标记")
                HStack {
                    Button("全部待生产") { pendingStatus = "Waiting" }
                    Button("全部已入库") { pendingStatus = "InStock" }
                    Button("全部已发货") { pendingStatus = "Shipped" }
                }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.commaSeparatedText, .plainText]) { result in
            guard case .success(let url) = result else { return }
            let accessing = url.startAccessingSecurityScopedResource()
            defer { if accessing { url.stopAccessingSecurityScopedResource() } }
            if let text = try? String(contentsOf: url, encoding: .utf8) {
                model.importProductionCSV(id: record.id, text: text)
            }
        }
        .fileExporter(
            isPresented: $exporting,
            document: CSVDocument(text: Self.csv(for: record)),
            contentType: .commaSeparatedText,
            defaultFilename: "\(record.values["projectName"]?.stringValue ?? "生产清单")_全部"
        ) { _ in }
        .confirmationDialog("确认批量修改？", isPresented: Binding(
            get: { pendingStatus != nil }, set: { if !$0 { pendingStatus = nil } }
        )) {
            Button("确认") {
                if let pendingStatus { model.markAllProduction(id: record.id, status: pendingStatus) }
                pendingStatus = nil
            }
            Button("取消", role: .cancel) { pendingStatus = nil }
        } message: {
            Text("当前工程的全部生产项都会更新状态。")
        }
    }

    private static func csv(for record: ResourceRecord) -> String {
        func escaped(_ value: String) -> String {
            let protected = ["=", "+", "-", "@"].contains(where: { value.hasPrefix($0) }) ? "'\(value)" : value
            return "\"\(protected.replacingOccurrences(of: "\"", with: "\"\""))\""
        }
        let labels = ["Waiting": "待生产", "InStock": "已入库", "Shipped": "已发货"]
        var lines = ["编号,设备名称,清单规格/型号,实际生产规格,数量,状态,备注,日期"]
        if case .array(let items) = record.values["items"] {
            lines += items.compactMap { item -> String? in
                guard case .object(let fields) = item else { return nil }
                let model = fields["model"]?.stringValue ?? ""
                return [
                    escaped(fields["serialNumber"]?.stringValue ?? ""), escaped(fields["name"]?.stringValue ?? ""),
                    escaped(model), escaped(fields["actualProductionSpec"]?.stringValue ?? model),
                    fields["quantity"]?.humanText ?? "0", escaped(labels[fields["status"]?.stringValue ?? ""] ?? ""),
                    escaped(fields["notes"]?.stringValue ?? ""), escaped(fields["batchDate"]?.stringValue ?? "")
                ].joined(separator: ",")
            }
        }
        return "\u{FEFF}" + lines.joined(separator: "\n")
    }
}

private struct CSVDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText, .plainText] }
    var text: String
    init(text: String) { self.text = text }
    init(configuration: ReadConfiguration) throws {
        text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self)
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

struct MailManagementView: View {
    @EnvironmentObject private var model: AppModel
    let records: [ResourceRecord]
    @Binding var selection: String?
    @State private var composing = false

    var body: some View {
        List(records, selection: $selection) { record in
            VStack(alignment: .leading) {
                Text(record.values["subject"]?.stringValue ?? "（无主题）").font(.headline)
                Text(record.values["from"]?.stringValue ?? "").foregroundStyle(.secondary)
            }.tag(record.id)
        }
        .navigationTitle("业务邮箱")
        .toolbar { Button("写邮件", systemImage: "square.and.pencil") { composing = true } }
        .overlay { if records.isEmpty { ContentUnavailableView("暂无邮件", systemImage: "tray") } }
        .sheet(isPresented: $composing) { ComposeMailSheet { to, subject, text in
            composing = false; model.sendEmail(to: to, subject: subject, text: text)
        } }
        .onChange(of: selection) {
            if let selection { model.loadEmailMessage(id: selection) }
        }
    }
}

struct ProfilePreferencesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var themeColor = "blue"
    @State private var fontSize = "medium"
    @State private var dateFormat = "YYYY-MM-DD"
    @State private var timeFormat = "24h"
    @State private var enableBrowser = true
    @State private var sound = true
    @State private var chat = true
    @State private var approval = true
    @State private var task = true
    @State private var system = true
    @State private var decimalPlaces = 2
    @State private var thousands = true
    @State private var currency = "¥"
    @State private var weatherMode = "auto"
    @State private var city = ""
    @State private var pushPlusToken = ""
    @State private var wecomWebhook = ""
    @State private var dingtalkWebhook = ""
    @State private var dingtalkSecret = ""

    var body: some View {
        Form {
            Section("账户") {
                LabeledContent("姓名", value: model.user?.displayName ?? "")
                LabeledContent("部门", value: model.user?.department ?? "")
                LabeledContent("角色", value: model.user?.role ?? "")
            }
            Section("显示偏好") {
                Picker("主题颜色", selection: $themeColor) {
                    Text("经典蓝").tag("blue"); Text("翡翠绿").tag("emerald"); Text("紫罗兰").tag("violet")
                    Text("琥珀金").tag("amber"); Text("玫瑰红").tag("rose"); Text("天际青").tag("cyan")
                }
                Picker("字体大小", selection: $fontSize) {
                    Text("小").tag("small"); Text("中").tag("medium"); Text("大").tag("large"); Text("特大").tag("xlarge")
                }
                TextField("日期格式", text: $dateFormat)
                Picker("时间格式", selection: $timeFormat) { Text("24 小时").tag("24h"); Text("12 小时").tag("12h") }
                Toggle("桌面实时推送", isOn: $enableBrowser)
                Toggle("交互提示音效", isOn: $sound)
            }
            Section("通知订阅") {
                Toggle("团队即时沟通", isOn: $chat); Toggle("审批动态", isOn: $approval)
                Toggle("工程任务", isOn: $task); Toggle("系统通知", isOn: $system)
            }
            Section("数字与天气") {
                Stepper("小数位数：\(decimalPlaces)", value: $decimalPlaces, in: 0...6)
                Toggle("使用千位分隔符", isOn: $thousands)
                TextField("货币符号", text: $currency)
                Picker("天气定位", selection: $weatherMode) {
                    Text("自动").tag("auto"); Text("手动").tag("manual"); Text("自定义").tag("custom")
                }
                TextField("城市", text: $city)
            }
            Section("推送集成") {
                SecureField("PushPlus Token", text: $pushPlusToken)
                Button("测试 PushPlus") { model.testPush(type: "PushPlus", config: webhookConfig) }.disabled(pushPlusToken.isEmpty)
                TextField("企业微信 Webhook", text: $wecomWebhook)
                Button("测试企业微信") { model.testPush(type: "WeCom", config: webhookConfig) }.disabled(wecomWebhook.isEmpty)
                TextField("钉钉 Webhook", text: $dingtalkWebhook)
                SecureField("钉钉安全密钥", text: $dingtalkSecret)
                Button("测试钉钉") { model.testPush(type: "DingTalk", config: webhookConfig) }.disabled(dingtalkWebhook.isEmpty)
            }
            Section {
                Button("保存全部个人偏好") { save() }.buttonStyle(.borderedProminent)
            }
        }
        .formStyle(.grouped)
        .navigationTitle("个人偏好")
        .onAppear {
            themeColor = model.user?.preferences["themeColor"]?.stringValue ?? "blue"
            fontSize = model.user?.preferences["fontSize"]?.stringValue ?? "medium"
            dateFormat = model.user?.preferences["dateFormat"]?.stringValue ?? "YYYY-MM-DD"
            timeFormat = model.user?.preferences["timeFormat"]?.stringValue ?? "24h"
            enableBrowser = model.user?.preferences["enableBrowser"]?.boolValue ?? true
            sound = model.user?.preferences["sound"]?.boolValue ?? true
            if case .object(let types)? = model.user?.preferences["types"] {
                chat = types["chat"]?.boolValue ?? true; approval = types["approval"]?.boolValue ?? true
                task = types["task"]?.boolValue ?? true; system = types["system"]?.boolValue ?? true
            }
            if case .object(let numbers)? = model.user?.preferences["numberFormat"] {
                decimalPlaces = Int(numbers["decimalPlaces"]?.numberValue ?? 2)
                thousands = numbers["useThousandsSeparator"]?.boolValue ?? true
                currency = numbers["currencySymbol"]?.stringValue ?? "¥"
            }
            if case .object(let weather)? = model.user?.preferences["weatherLocation"] {
                weatherMode = weather["mode"]?.stringValue ?? "auto"; city = weather["city"]?.stringValue ?? ""
            }
            if case .object(let webhooks)? = model.user?.preferences["webhooks"] {
                pushPlusToken = webhooks["pushPlusToken"]?.stringValue ?? ""
                wecomWebhook = webhooks["wecomWebhook"]?.stringValue ?? ""
                dingtalkWebhook = webhooks["dingtalkWebhook"]?.stringValue ?? ""
                dingtalkSecret = webhooks["dingtalkSecret"]?.stringValue ?? ""
            }
        }
    }

    private var webhookConfig: [String: JSONValue] {
        ["pushPlusToken": .string(pushPlusToken), "wecomWebhook": .string(wecomWebhook),
         "dingtalkWebhook": .string(dingtalkWebhook), "dingtalkSecret": .string(dingtalkSecret)]
    }

    private func save() {
        model.updatePreferences([
            "themeColor": .string(themeColor), "fontSize": .string(fontSize),
            "dateFormat": .string(dateFormat), "timeFormat": .string(timeFormat),
            "enableBrowser": .boolean(enableBrowser), "sound": .boolean(sound),
            "types": .object(["chat": .boolean(chat), "approval": .boolean(approval), "task": .boolean(task), "system": .boolean(system)]),
            "numberFormat": .object(["decimalPlaces": .number(Double(decimalPlaces)), "useThousandsSeparator": .boolean(thousands), "currencySymbol": .string(currency)]),
            "weatherLocation": .object(["mode": .string(weatherMode), "city": .string(city)]),
            "webhooks": .object(webhookConfig)
        ])
    }
}

private struct ComposeMailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let send: (String, String, String) -> Void
    @State private var to = ""
    @State private var subject = ""
    @State private var text = ""
    var body: some View {
        VStack(spacing: 12) {
            HStack { Text("写邮件").font(.title2.bold()); Spacer(); Button("取消") { dismiss() }; Button("发送") { send(to, subject, text) }.buttonStyle(.borderedProminent).disabled(to.isEmpty) }
            TextField("收件人", text: $to)
            TextField("主题", text: $subject)
            TextEditor(text: $text).frame(minHeight: 280).border(.separator)
        }.padding(20).frame(width: 680, height: 480)
    }
}

struct RecycleBinManagementView: View {
    @EnvironmentObject private var model: AppModel
    let records: [ResourceRecord]
    @State private var clearing = false
    var body: some View {
        List {
            ForEach(records) { record in
                HStack {
                    VStack(alignment: .leading) { Text(record.title).font(.headline); Text(record.values["deletedAt"]?.humanText ?? "").foregroundStyle(.secondary) }
                    Spacer()
                    Button("恢复") { model.restoreRecycleItem(record.id) }
                    Button("永久删除", role: .destructive) { model.permanentlyDeleteRecycleItem(record.id) }
                }.padding(.vertical, 5)
            }
        }
        .navigationTitle("回收站")
        .toolbar { Button("清空", role: .destructive) { clearing = true }.disabled(records.isEmpty) }
        .confirmationDialog("确认清空回收站？", isPresented: $clearing) {
            Button("永久清空", role: .destructive) { model.emptyRecycleBin() }
        } message: { Text("清空后无法恢复。") }
    }
}

struct BackupManagementView: View {
    @EnvironmentObject private var model: AppModel
    let records: [ResourceRecord]
    @State private var action: BackupAction?
    var body: some View {
        List {
            ForEach(records) { record in
                VStack(alignment: .leading, spacing: 6) {
                    Text(record.values["_kind"]?.stringValue == "job" ? "维护任务 \(record.id)" : record.id).font(.headline)
                    Text(record.values["message"]?.humanText ?? record.values["createdAt"]?.humanText ?? "").foregroundStyle(.secondary)
                    if record.values["_kind"]?.stringValue == "backup", record.values["selectable"] == .boolean(true) {
                        Button("恢复此备份") { action = .restore(record.id) }
                    }
                }.padding(.vertical, 5)
            }
        }
        .navigationTitle("备份与维护")
        .toolbar { Button("立即备份", systemImage: "externaldrive.badge.plus") { action = .backup } }
        .sheet(item: $action) { value in PasswordConfirmationSheet(title: value.title) { password in
            action = nil
            switch value { case .backup: model.createBackup(password: password); case .restore(let id): model.restoreBackup(id: id, password: password) }
        } }
    }
}

private enum BackupAction: Identifiable {
    case backup, restore(String)
    var id: String { switch self { case .backup: "backup"; case .restore(let id): "restore-\(id)" } }
    var title: String { switch self { case .backup: "创建备份"; case .restore(let id): "恢复备份 \(id)" } }
}

private struct PasswordConfirmationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let confirm: (String) -> Void
    @State private var password = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.title2.bold())
            SecureField("当前管理员密码", text: $password)
            HStack { Spacer(); Button("取消") { dismiss() }; Button("确认") { confirm(password) }.buttonStyle(.borderedProminent).disabled(password.isEmpty) }
        }.padding(24).frame(width: 460)
    }
}

extension JSONValue {
    var humanText: String {
        switch self {
        case .string(let value): value
        case .number(let value): value.rounded() == value ? String(Int(value)) : String(value)
        case .boolean(let value): value ? "是" : "否"
        case .null: ""
        case .array(let values): "\(values.count) 项"
        case .object(let values): values.map { "\(StructuredRecordView.label(for: $0.key))：\($0.value.humanText)" }.joined(separator: "，")
        }
    }
}

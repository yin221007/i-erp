import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage("selectedModule") private var selectedRawValue = IERPModule.dashboard.rawValue
    @State private var selectedRecordID: String?
    @State private var editorRecord: ResourceRecord?
    @State private var isCreating = false
    @State private var pendingDelete: ResourceRecord?
    @State private var importingFile = false
    @State private var pendingUploadURL: URL?

    private var module: IERPModule { IERPModule(rawValue: selectedRawValue) ?? .dashboard }
    private var canWrite: Bool {
        model.user?.permission == "ReadWrite" || model.user?.role == "Admin" || model.user?.isDefaultAdmin == true
    }
    private var visibleModules: [IERPModule] {
        IERPModule.allCases.filter { item in
            (item != .backup && item.definition?.administratorOnly != true) || model.user?.role == "Admin" || model.user?.isDefaultAdmin == true
        }
    }

    var body: some View {
        NavigationSplitView {
            BrandSidebar(selection: $selectedRawValue, modules: visibleModules, user: model.user, logout: model.logout)
                .navigationSplitViewColumnWidth(min: 205, ideal: 224, max: 260)
        } detail: {
            ModuleWorkspace(
                module: module,
                selectedRecordID: $selectedRecordID,
                openModule: { selectedRawValue = $0.rawValue },
                create: { isCreating = true },
                edit: { editorRecord = $0 },
                delete: { pendingDelete = $0 },
                upload: { importingFile = true },
                refresh: model.refresh
            )
        }
        .navigationSplitViewStyle(.balanced)
        .onAppear { model.select(module) }
        .onChange(of: selectedRawValue) {
            selectedRecordID = nil
            editorRecord = nil
            model.select(module)
        }
        .sheet(isPresented: $isCreating) {
            if let definition = module.definition {
                RecordEditor(module: module, definition: definition, record: nil) { fields in
                    isCreating = false
                    model.save(module: module, id: nil, fields: fields)
                }
            }
        }
        .sheet(item: $editorRecord) { record in
            if let definition = module.definition {
                RecordEditor(module: module, definition: definition, record: record) { fields in
                    editorRecord = nil
                    model.save(module: module, id: record.id, fields: fields)
                }
            }
        }
        .confirmationDialog(
            "确认删除“\(pendingDelete?.title ?? "该记录")”？",
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("删除", role: .destructive) {
                if let record = pendingDelete { model.delete(module: module, id: record.id) }
                pendingDelete = nil
            }
            Button("取消", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("删除后将按服务端规则进入回收站。")
        }
        .fileImporter(
            isPresented: $importingFile,
            allowedContentTypes: [.data, .image, .movie, .pdf],
            allowsMultipleSelection: false
        ) { result in
            pendingUploadURL = try? result.get().first
        }
        .sheet(isPresented: Binding(get: { pendingUploadURL != nil }, set: { if !$0 { pendingUploadURL = nil } })) {
            if let url = pendingUploadURL {
                ArchiveUploadSheet(fileURL: url, media: module == .media, projects: model.projects) { projectID, projectName, category, phase, date, album in
                    pendingUploadURL = nil
                    model.uploadArchive(fileURL: url, projectID: projectID, projectName: projectName, category: category, phase: phase, capturedAt: date, albumTitle: album)
                }
            }
        }
        .overlay {
            if model.isWorking {
                ZStack {
                    Color.black.opacity(0.08)
                    ProgressView("正在处理…")
                        .padding(20)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
                .ignoresSafeArea()
            }
        }
        .alert("提示", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("知道了") { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    private var selectedRecord: ResourceRecord? {
        model.moduleRecords.first { $0.id == selectedRecordID }
    }
}

private struct ModuleWorkspace: View {
    @EnvironmentObject private var model: AppModel
    let module: IERPModule
    @Binding var selectedRecordID: String?
    let openModule: (IERPModule) -> Void
    let create: () -> Void
    let edit: (ResourceRecord) -> Void
    let delete: (ResourceRecord) -> Void
    let upload: () -> Void
    let refresh: () -> Void
    @State private var query = ""
    private var canWrite: Bool {
        model.user?.permission == "ReadWrite" || model.user?.role == "Admin" || model.user?.isDefaultAdmin == true
    }

    private var records: [ResourceRecord] {
        guard !query.isEmpty else { return model.moduleRecords }
        return model.moduleRecords.filter { record in
            record.values.values.contains { $0.displayText.localizedCaseInsensitiveContains(query) }
        }
    }

    var body: some View {
        if module == .dashboard {
            DashboardView(projects: model.projects, user: model.user) { selected in
                selectedRecordID = nil
                openModule(selected)
            }
        } else {
            VStack(spacing: 0) {
                PageHeader(title: module.rawValue, subtitle: Presentation.moduleSubtitle(module)) {
                    HStack(spacing: 9) {
                        if module.definition != nil && ![IERPModule.profile, .backup].contains(module) {
                            HStack(spacing: 7) {
                                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                                TextField("搜索", text: $query).textFieldStyle(.plain).frame(width: 145)
                                if !query.isEmpty {
                                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }.buttonStyle(.plain).foregroundStyle(.tertiary)
                                }
                            }
                            .padding(.horizontal, 11).frame(height: 34)
                            .background(Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 10))
                        }
                        if canWrite && (module == .archives || module == .media) {
                            Button(action: upload) { Label("上传", systemImage: "square.and.arrow.up") }.buttonStyle(.bordered)
                        }
                        if canWrite && module.definition?.readOnly == false {
                            Button(action: create) { Label("新建", systemImage: "plus") }.buttonStyle(.borderedProminent)
                                .keyboardShortcut("n", modifiers: .command)
                        }
                        Button(action: refresh) { Image(systemName: "arrow.clockwise") }
                            .buttonStyle(.bordered).help("刷新").disabled(model.isWorking)
                    }
                }

                if module == .backup {
                    BackupManagementView(records: model.moduleRecords)
                } else if module == .recycleBin {
                    RecycleBinManagementView(records: model.moduleRecords)
                } else if module == .mail {
                    HSplitView {
                        MailManagementView(records: records, selection: $selectedRecordID).frame(minWidth: 360)
                        BusinessDetailView(module: module, record: selectedRecord).frame(minWidth: 360)
                    }
                } else if module == .profile {
                    ProfilePreferencesView()
                } else {
                    HSplitView {
                        BusinessRecordList(
                            module: module,
                            records: records,
                            selection: $selectedRecordID,
                            edit: edit,
                            delete: delete,
                            canWrite: canWrite && module.definition?.readOnly == false
                        )
                        .frame(minWidth: 430, idealWidth: 610)
                        BusinessDetailView(module: module, record: selectedRecord)
                            .frame(minWidth: 350, idealWidth: 470)
                    }
                }
            }
        }
    }

    private var selectedRecord: ResourceRecord? {
        model.moduleRecords.first { $0.id == selectedRecordID }
    }
}

private struct RecordEditor: View {
    @Environment(\.dismiss) private var dismiss
    let module: IERPModule
    let definition: ModuleDefinition
    let record: ResourceRecord?
    let save: ([String: JSONValue]) -> Void
    @State private var values: [String: String]
    @State private var validationError: String?

    init(
        module: IERPModule,
        definition: ModuleDefinition,
        record: ResourceRecord?,
        save: @escaping ([String: JSONValue]) -> Void
    ) {
        self.module = module
        self.definition = definition
        self.record = record
        self.save = save
        _values = State(initialValue: Dictionary(uniqueKeysWithValues: definition.fields.map { field in
            let value = record?.values[field.key]
            return (field.key, value?.editorText(for: field.kind) ?? (field.kind == .boolean ? "false" : ""))
        }))
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(record == nil ? "新建\(module.rawValue)" : "编辑\(module.rawValue)").font(.title2.bold())
                Spacer()
                Button("取消") { dismiss() }
                Button("保存", action: submit).buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
            }
            .padding()
            Divider()
            Form {
                ForEach(definition.fields) { field in
                    FieldEditor(field: field, value: binding(for: field.key))
                }
                if let validationError { Text(validationError).foregroundStyle(.red) }
            }
            .formStyle(.grouped)
        }
        .frame(minWidth: 600, idealWidth: 720, minHeight: 520, idealHeight: 680)
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(get: { values[key, default: ""] }, set: { values[key] = $0 })
    }

    private func submit() {
        if let missing = definition.fields.first(where: { $0.required && values[$0.key, default: ""].isEmpty }) {
            validationError = "请填写\(missing.label)"
            return
        }
        do {
            var fields: [String: JSONValue] = [:]
            for field in definition.fields {
                let raw = values[field.key, default: ""]
                if raw.isEmpty && field.kind != .boolean { continue }
                switch field.kind {
                case .number:
                    guard let number = Double(raw) else { throw EditorError.message("\(field.label)必须是数字") }
                    fields[field.key] = .number(number)
                case .boolean:
                    fields[field.key] = .boolean(raw == "true")
                case .list:
                    fields[field.key] = try JSONDecoder().decode(JSONValue.self, from: Data(raw.utf8))
                default:
                    fields[field.key] = .string(raw)
                }
            }
            save(fields)
        } catch {
            validationError = error.localizedDescription
        }
    }
}

private struct FieldEditor: View {
    let field: FieldDefinition
    @Binding var value: String

    init(field: FieldDefinition, value: Binding<String>) {
        self.field = field
        _value = value
    }

    var body: some View {
        switch field.kind {
        case .boolean:
            Toggle(field.label, isOn: Binding(get: { value == "true" }, set: { value = $0 ? "true" : "false" }))
        case .list:
            StructuredListFieldEditor(field: field, value: $value)
        case .choice:
            Picker(field.label, selection: $value) {
                Text("请选择").tag("")
                ForEach(field.choices, id: \.self) { Text($0).tag($0) }
            }
        case .multiline:
            VStack(alignment: .leading) {
                Text(field.label)
                TextEditor(text: $value)
                    .font(.body)
                    .frame(minHeight: 90)
                if !field.hint.isEmpty { Text(field.hint).font(.caption).foregroundStyle(.secondary) }
            }
        case .password:
            SecureField(field.label, text: $value)
        default:
            TextField(field.label, text: $value)
        }
    }
}

private enum EditorError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { text } else { nil } }
}

private extension ResourceRecord {
    func displayTitle(for module: IERPModule) -> String {
        module.definition?.titleKeys.compactMap { values[$0]?.stringValue }.first { !$0.isEmpty } ?? title
    }
}

private extension JSONValue {
    var displayText: String {
        switch self {
        case .string(let value): return value
        case .number(let value): return value.rounded() == value ? String(Int(value)) : String(value)
        case .boolean(let value): return value ? "是" : "否"
        case .null: return ""
        case .object, .array:
            guard let data = try? JSONEncoder().encode(self) else { return "" }
            return String(decoding: data, as: UTF8.self)
        }
    }

    func editorText(for kind: FieldKind) -> String {
        if kind == .text || kind == .multiline || kind == .date || kind == .password || kind == .choice {
            return stringValue ?? displayText
        }
        if case .boolean(let value) = self { return value ? "true" : "false" }
        return displayText
    }
}

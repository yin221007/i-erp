import Foundation
import SwiftUI
import AppKit

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var user: IERPUser?
    @Published private(set) var projects: [ResourceRecord] = []
    @Published private(set) var moduleRecords: [ResourceRecord] = []
    @Published private(set) var activeModule: IERPModule = .dashboard
    @Published private(set) var isRestoring = true
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    private let api: APIClient
    private var restoreTask: Task<Void, Never>?
    private var pollingTask: Task<Void, Never>?

    init(api: APIClient = .production()) {
        self.api = api
        restoreTask = Task { await restore() }
    }

    deinit {
        restoreTask?.cancel()
        pollingTask?.cancel()
    }

    func login(username: String, password: String) {
        guard !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !password.isEmpty else {
            errorMessage = "请输入账号和密码"
            return
        }
        run {
            self.user = try await self.api.login(
                username: username.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            await self.refreshProjects()
        }
    }

    func refresh() {
        run {
            if self.activeModule.definition == nil {
                await self.refreshProjects()
            } else {
                try await self.loadRecords(for: self.activeModule)
            }
        }
    }

    func select(_ module: IERPModule) {
        activeModule = module
        pollingTask?.cancel()
        guard module.definition != nil || module == .mail || module == .backup || module == .profile else {
            moduleRecords = []
            return
        }
        run { try await self.loadRecords(for: module) }
        if [.messages, .channels, .announcements, .mail, .backup].contains(module) {
            pollingTask = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(5))
                    guard let self, self.activeModule == module, !self.isWorking else { continue }
                    try? await self.loadRecords(for: module)
                }
            }
        }
    }

    func save(module: IERPModule, id: String?, fields: [String: JSONValue]) {
        guard let definition = module.definition else { return }
        run {
            if let id,
               let existing = self.moduleRecords.first(where: { $0.id == id }) {
                _ = try await self.api.updateResource(
                    definition.resource,
                    id: id,
                    fields: existing.values.merging(fields) { _, edited in edited }
                )
            } else {
                _ = try await self.api.createResource(
                    definition.resource,
                    fields: self.prepareCreateFields(resource: definition.resource, fields: fields)
                )
            }
            try await self.loadRecords(for: module)
            if module == .projects { await self.refreshProjects() }
        }
    }

    func delete(module: IERPModule, id: String) {
        guard let definition = module.definition else { return }
        run {
            try await self.api.deleteResource(definition.resource, id: id)
            try await self.loadRecords(for: module)
            if module == .projects { await self.refreshProjects() }
        }
    }

    func logout() {
        run {
            try await self.api.logout()
            self.user = nil
            self.projects = []
        }
    }

    func restoreRecycleItem(_ id: String) {
        run {
            try await self.api.restoreRecycleItem(id: id)
            try await self.loadRecords(for: .recycleBin)
            await self.refreshProjects()
        }
    }

    func permanentlyDeleteRecycleItem(_ id: String) {
        run {
            try await self.api.permanentlyDeleteRecycleItem(id: id)
            try await self.loadRecords(for: .recycleBin)
        }
    }

    func emptyRecycleBin() {
        run {
            try await self.api.emptyRecycleBin()
            try await self.loadRecords(for: .recycleBin)
        }
    }

    func sendEmail(to: String, subject: String, text: String) {
        run {
            try await self.api.sendEmail(to: to, subject: subject, text: text)
            try await self.loadRecords(for: .mail)
        }
    }

    func loadEmailMessage(id: String) {
        run {
            let detail = try await self.api.emailMessage(id: id)
            if let index = self.moduleRecords.firstIndex(where: { $0.id == id }) {
                self.moduleRecords[index] = detail
            }
        }
    }

    func updatePreferences(_ changes: [String: JSONValue]) {
        run {
            var preferences = self.user?.preferences ?? [:]
            preferences.merge(changes) { _, new in new }
            self.user = try await self.api.updateCurrentUser(preferences: preferences)
        }
    }

    func testPush(type: String, config: [String: JSONValue]) {
        run { try await self.api.testPush(type: type, config: config) }
    }

    func createBackup(password: String) {
        run {
            try await self.api.createMaintenanceJob(operation: "backup", currentPassword: password)
            try await self.loadRecords(for: .backup)
        }
    }

    func restoreBackup(id: String, password: String) {
        run {
            try await self.api.createMaintenanceJob(operation: "restore", backupID: id, currentPassword: password)
            try await self.loadRecords(for: .backup)
        }
    }

    func actOnApproval(id: String, status: String, comment: String) {
        run {
            guard let record = self.moduleRecords.first(where: { $0.id == id }),
                  case .array(var versions) = record.values["versions"], !versions.isEmpty,
                  case .object(var latest) = versions[0] else { throw APIError.invalidConfiguration }
            var outcomes: [JSONValue] = []
            if case .array(let current) = latest["outcomes"] { outcomes = current }
            let user = self.user
            outcomes.append(.object([
                "status": .string(status), "approverId": .string(user?.id ?? ""),
                "approverName": .string(user?.displayName ?? ""), "comment": .string(comment),
                "date": .string(ISO8601DateFormatter().string(from: Date()))
            ]))
            latest["outcomes"] = .array(outcomes)
            versions[0] = .object(latest)
            var approverIDs: [String] = []
            if case .array(let values) = record.values["approverIds"] { approverIDs = values.compactMap(\.stringValue) }
            let approvedIDs = Set(outcomes.compactMap { value -> String? in
                guard case .object(let fields) = value, fields["status"]?.stringValue == "Approved" else { return nil }
                return fields["approverId"]?.stringValue
            })
            let nextStatus = ["Rejected", "Returned"].contains(status) ? status :
                ((record.values["strategy"]?.stringValue == "OR_SIGN" || approverIDs.allSatisfy(approvedIDs.contains)) ? "Approved" : "Pending")
            var fields = record.values
            fields["versions"] = .array(versions)
            fields["status"] = .string(nextStatus)
            fields["updatedAt"] = .string(ISO8601DateFormatter().string(from: Date()))
            _ = try await self.api.updateResource("approvals", id: id, fields: fields)
            try await self.loadRecords(for: .approvals)
        }
    }

    func markAllProduction(id: String, status: String) {
        run {
            guard ["Waiting", "InStock", "Shipped"].contains(status),
                  let record = self.moduleRecords.first(where: { $0.id == id }),
                  case .array(let currentItems) = record.values["items"] else {
                throw APIError.invalidConfiguration
            }
            let today = Self.dayFormatter.string(from: Date())
            let items = currentItems.map { value -> JSONValue in
                guard case .object(var fields) = value else { return value }
                fields["status"] = .string(status)
                if fields["batchDate"]?.stringValue?.isEmpty != false { fields["batchDate"] = .string(today) }
                return .object(fields)
            }
            var fields = record.values
            fields["items"] = .array(items)
            _ = try await self.api.updateResource("production", id: id, fields: fields)
            try await self.loadRecords(for: .production)
        }
    }

    func importProductionCSV(id: String, text: String) {
        run {
            guard let record = self.moduleRecords.first(where: { $0.id == id }) else {
                throw APIError.invalidConfiguration
            }
            var items: [JSONValue] = []
            if case .array(let current) = record.values["items"] { items = current }
            let imported = Self.parseProductionCSV(text, sourceOffset: items.count)
            guard !imported.isEmpty else { throw ProductionImportError.noValidRows }
            items.append(contentsOf: imported)
            var fields = record.values
            fields["items"] = .array(items)
            _ = try await self.api.updateResource("production", id: id, fields: fields)
            try await self.loadRecords(for: .production)
        }
    }

    func uploadArchive(
        fileURL: URL,
        projectID: String,
        projectName: String,
        category: String,
        phase: String = "",
        capturedAt: String = "",
        albumTitle: String = ""
    ) {
        run {
            let accessing = fileURL.startAccessingSecurityScopedResource()
            defer { if accessing { fileURL.stopAccessingSecurityScopedResource() } }
            let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
            let localSize = (attributes[.size] as? NSNumber)?.doubleValue ?? 0
            let upload = try await self.api.uploadFile(
                name: fileURL.lastPathComponent,
                mimeType: Self.mimeType(for: fileURL),
                fileURL: fileURL
            )
            guard let remoteURL = upload.values["url"]?.stringValue else { throw APIError.server(500) }
            var fields: [String: JSONValue] = [
                "id": .string("archive-\(UUID().uuidString)"),
                "title": .string(fileURL.lastPathComponent),
                "category": .string(category),
                "projectId": .string(projectID),
                "projectName": .string(projectName),
                "fileType": .string(fileURL.pathExtension.lowercased()),
                "size": upload.values["size"] ?? .number(localSize),
                "url": .string(remoteURL),
                "uploadDate": .string(Self.dayFormatter.string(from: Date()))
            ]
            if category == "Media" {
                fields["mediaPhase"] = .string(phase.isEmpty ? "前期对接 & 设计" : phase)
                fields["capturedAt"] = .string(capturedAt.isEmpty ? Self.dayFormatter.string(from: Date()) : capturedAt)
                fields["mediaType"] = .string(["mp4", "mov", "m4v"].contains(fileURL.pathExtension.lowercased()) ? "video" : "image")
                if !albumTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    fields["mediaAlbumTitle"] = .string(albumTitle.trimmingCharacters(in: .whitespacesAndNewlines))
                }
            }
            _ = try await self.api.createResource("archives", fields: fields)
            try await self.loadRecords(for: self.activeModule)
        }
    }

    func openAttachment(path: String, name: String) {
        run {
            let data = try await self.api.download(path: path)
            let safeName = name.replacingOccurrences(of: "/", with: "_")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            try data.write(to: url, options: .atomic)
            NSWorkspace.shared.open(url)
        }
    }

    private func restore() async {
        defer { isRestoring = false }
        do {
            user = try await api.currentUser()
            await refreshProjects()
        } catch APIError.unauthorized {
            user = nil
        } catch {
            user = nil
        }
    }

    private func refreshProjects() async {
        do {
            projects = try await api.resources("projects")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadRecords(for module: IERPModule) async throws {
        switch module {
        case .mail:
            let summaries = try await api.emailMessages()
            moduleRecords = summaries.map { summary in
                guard let existing = moduleRecords.first(where: { $0.id == summary.id }),
                      existing.values["html"] != nil || existing.values["text"] != nil else { return summary }
                return ResourceRecord(values: summary.values.merging(existing.values) { _, detail in detail })
            }
        case .backup:
            async let backups = api.backupCatalog()
            async let jobs = api.maintenanceJobs()
            let (backupRows, jobRows) = try await (backups, jobs)
            moduleRecords = backupRows + jobRows
        case .profile:
            moduleRecords = []
        default:
            guard let definition = module.definition else {
                moduleRecords = []
                return
            }
            let rows = try await api.resources(definition.resource)
            if module == .media {
                moduleRecords = rows.filter { $0.values["category"]?.stringValue == "Media" }
            } else if module == .archives {
                moduleRecords = rows.filter { $0.values["category"]?.stringValue != "Media" }
            } else {
                moduleRecords = rows
            }
        }
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        Task {
            defer { isWorking = false }
            do { try await work() }
            catch is CancellationError { }
            catch APIError.unauthorized {
                user = nil
                moduleRecords = []
                errorMessage = APIError.unauthorized.localizedDescription
            }
            catch { errorMessage = error.localizedDescription }
        }
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "jpg", "jpeg": "image/jpeg"
        case "png": "image/png"
        case "webp": "image/webp"
        case "pdf": "application/pdf"
        case "mp4", "m4v": "video/mp4"
        case "mov": "video/quicktime"
        default: "application/octet-stream"
        }
    }

    private static func parseProductionCSV(_ text: String, sourceOffset: Int) -> [JSONValue] {
        let lines = text.replacingOccurrences(of: "\u{FEFF}", with: "")
            .components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        guard lines.count >= 2 else { return [] }
        let rows = lines.map(parseCSVLine)
        let headers = rows[0].map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        func column(_ names: String...) -> Int? {
            headers.firstIndex { header in names.contains { header == $0.lowercased() } }
        }
        let serial = column("编号", "序号", "编号 / 序号", "serialnumber")
        guard let name = column("设备名称", "名称", "name") else { return [] }
        let model = column("清单规格/型号", "清单规格 / 型号", "型号", "规格", "model")
        let actual = column("实际生产规格", "actualproductionspec")
        let quantity = column("数量", "quantity", "qty")
        let status = column("状态", "status")
        let notes = column("备注", "notes", "remark")
        let date = column("日期", "批次日期", "batchdate", "date")
        func cell(_ row: [String], _ index: Int?) -> String {
            guard let index, row.indices.contains(index) else { return "" }
            return row[index].trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return rows.dropFirst().enumerated().compactMap { rowIndex, row in
            let itemName = cell(row, name)
            guard !itemName.isEmpty else { return nil }
            let rawStatus = cell(row, status).lowercased()
            let normalizedStatus: String
            if ["instock", "已入库", "已生产", "已生产 / 已入库"].contains(rawStatus) { normalizedStatus = "InStock" }
            else if ["shipped", "已发货"].contains(rawStatus) { normalizedStatus = "Shipped" }
            else { normalizedStatus = "Waiting" }
            let modelValue = cell(row, model)
            return .object([
                "id": .string("item-\(UUID().uuidString)"),
                "serialNumber": .string(cell(row, serial)),
                "sourceOrder": .number(Double(sourceOffset + rowIndex)),
                "name": .string(itemName), "model": .string(modelValue),
                "actualProductionSpec": .string(cell(row, actual).isEmpty ? modelValue : cell(row, actual)),
                "quantity": .number(max(Double(cell(row, quantity)) ?? 1, 1)),
                "status": .string(normalizedStatus), "notes": .string(cell(row, notes)),
                "batchDate": .string(cell(row, date).isEmpty ? Self.dayFormatter.string(from: Date()) : cell(row, date)),
                "createdAt": .string(ISO8601DateFormatter().string(from: Date()))
            ])
        }
    }

    private static func parseCSVLine(_ line: String) -> [String] {
        var values: [String] = []
        var current = ""
        var quoted = false
        var index = line.startIndex
        while index < line.endIndex {
            let character = line[index]
            let next = line.index(after: index)
            if character == "\"", quoted, next < line.endIndex, line[next] == "\"" {
                current.append("\""); index = line.index(after: next); continue
            }
            if character == "\"" { quoted.toggle() }
            else if character == ",", !quoted { values.append(current); current = "" }
            else { current.append(character) }
            index = next
        }
        values.append(current)
        return values
    }

    private func prepareCreateFields(resource: String, fields: [String: JSONValue]) -> [String: JSONValue] {
        guard resource != "projects" else { return fields }
        var result = fields
        let generatedID: String
        if resource == "email_configs" { generatedID = user?.id ?? "" }
        else if resource == "production" { generatedID = fields["projectId"]?.stringValue ?? "" }
        else if resource == "settings" { generatedID = "global_config" }
        else { generatedID = "\(resource)-\(UUID().uuidString)" }
        result["id"] = result["id"] ?? .string(generatedID)
        result["createdAt"] = result["createdAt"] ?? .string(ISO8601DateFormatter().string(from: Date()))
        switch resource {
        case "worklogs":
            result["userId"] = .string(user?.id ?? "")
            result["userName"] = .string(user?.displayName ?? "")
            result["date"] = result["date"] ?? .string(Self.dayFormatter.string(from: Date()))
        case "schedule": result["userId"] = .string(user?.id ?? "")
        case "messages": result["timestamp"] = .string(ISO8601DateFormatter().string(from: Date()))
        case "approvals": result["status"] = result["status"] ?? .string("Draft")
        default: break
        }
        return result
    }
}

private enum ProductionImportError: LocalizedError {
    case noValidRows
    var errorDescription: String? { "没有识别到有效设备行，请检查 CSV 表头" }
}

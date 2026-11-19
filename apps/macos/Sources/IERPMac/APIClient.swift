import Foundation

enum APIError: LocalizedError, Equatable, Sendable {
    case invalidConfiguration
    case unauthorized
    case forbidden
    case notFound
    case conflict
    case rateLimited
    case timeout
    case transport
    case server(Int)

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration: "服务器地址配置无效"
        case .unauthorized: "登录已失效，请重新登录"
        case .forbidden: "没有权限执行此操作"
        case .notFound: "未找到请求的内容"
        case .conflict: "数据已发生变化，请刷新后重试"
        case .rateLimited: "操作过于频繁，请稍后再试"
        case .timeout: "连接超时，请检查网络后重试"
        case .transport: "无法连接服务器，请检查网络"
        case .server(let status): "服务器暂时无法处理请求（\(status)）"
        }
    }
}

final class APIClient: @unchecked Sendable {
    static let productionOrigin = normalizedOrigin(
        Bundle.main.object(forInfoDictionaryKey: "IERPServerOrigin") as? String
    ) ?? "https://erp.example.com"
    static let productionBaseURL = URL(string: productionOrigin + "/api/")!

    static func normalizedOrigin(_ value: String?) -> String? {
        guard let value, var url = URLComponents(string: value), url.scheme == "https",
              let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
              url.path.isEmpty || url.path == "/", url.query == nil, url.fragment == nil,
              url.port.map({ (1...65535).contains($0) }) ?? true else { return nil }
        url.host = host.lowercased()
        url.path = ""
        if url.port == 443 { url.port = nil }
        return url.url?.absoluteString
    }

    private let baseURL: URL
    private let origin: String
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(baseURL: URL, origin: String, session: URLSession = APIClient.persistentSession()) {
        precondition(baseURL.scheme == "https", "iERP API 必须使用 HTTPS")
        self.baseURL = baseURL
        self.origin = origin
        self.session = session
        encoder = JSONEncoder()
        decoder = JSONDecoder()
    }

    static func production() -> APIClient {
        APIClient(baseURL: productionBaseURL, origin: productionOrigin)
    }

    func login(username: String, password: String) async throws -> IERPUser {
        let payload = LoginRequest(username: username, password: password)
        let data = try encoder.encode(payload)
        let response = try await send(path: "auth/login", method: "POST", body: data)
        return try decoder.decode(LoginResponse.self, from: response).user
    }

    func currentUser() async throws -> IERPUser {
        let data = try await send(path: "auth/me")
        return try decoder.decode(CurrentUserResponse.self, from: data).user
    }

    func updateCurrentUser(preferences: [String: JSONValue]) async throws -> IERPUser {
        let body = try encoder.encode(["preferences": JSONValue.object(preferences)])
        let data = try await send(path: "auth/me", method: "PATCH", body: body)
        return try decoder.decode(CurrentUserResponse.self, from: data).user
    }

    func testPush(type: String, config: [String: JSONValue]) async throws {
        let body: [String: JSONValue] = ["type": .string(type), "config": .object(config)]
        _ = try await send(path: "push/test", method: "POST", body: try encoder.encode(body))
    }

    func logout() async throws {
        _ = try await send(path: "auth/logout", method: "POST", body: Data("{}".utf8))
        clearCookies()
    }

    func resources(_ resource: String) async throws -> [ResourceRecord] {
        try validate(resource)
        let data = try await send(path: resource)
        return try decoder.decode([ResourceRecord].self, from: data)
    }

    func createResource(_ resource: String, fields: [String: JSONValue]) async throws -> ResourceRecord {
        try validate(resource)
        let data = try encoder.encode(fields)
        let response = try await send(path: resource, method: "POST", body: data)
        return try decoder.decode(ResourceRecord.self, from: response)
    }

    func updateResource(_ resource: String, id: String, fields: [String: JSONValue]) async throws -> ResourceRecord {
        try validate(resource)
        guard !id.isEmpty else { throw APIError.invalidConfiguration }
        let data = try encoder.encode(fields)
        let response = try await send(path: "\(resource)/\(id)", method: "PUT", body: data)
        return try decoder.decode(ResourceRecord.self, from: response)
    }

    func deleteResource(_ resource: String, id: String) async throws {
        try validate(resource)
        guard !id.isEmpty else { throw APIError.invalidConfiguration }
        _ = try await send(path: "\(resource)/\(id)", method: "DELETE")
    }

    func renameArchive(id: String, title: String) async throws -> ResourceRecord {
        let data = try encoder.encode(["title": JSONValue.string(title)])
        let response = try await send(path: "archives/\(id)/name", method: "PATCH", body: data)
        return try decoder.decode(ResourceRecord.self, from: response)
    }

    func restoreRecycleItem(id: String) async throws {
        _ = try await send(path: "recycle_bin/restore/\(id)", method: "POST", body: Data("{}".utf8))
    }

    func permanentlyDeleteRecycleItem(id: String) async throws {
        _ = try await send(path: "recycle_bin/\(id)", method: "DELETE")
    }

    func emptyRecycleBin() async throws {
        _ = try await send(path: "recycle_bin/empty/all", method: "DELETE")
    }

    func emailMessages() async throws -> [ResourceRecord] {
        let data = try await send(path: "email/fetch")
        if let rows = try? decoder.decode([ResourceRecord].self, from: data) { return rows }
        let value = try decoder.decode(JSONValue.self, from: data)
        if case .object(let object) = value,
           let array = object.values.first(where: { if case .array = $0 { true } else { false } }),
           case .array(let rows) = array {
            return rows.compactMap { if case .object(let fields) = $0 { ResourceRecord(values: fields) } else { nil } }
        }
        return []
    }

    func emailMessage(id: String) async throws -> ResourceRecord {
        let data = try await send(path: "email/messages/\(id)")
        return try decoder.decode(ResourceRecord.self, from: data)
    }

    func sendEmail(to: String, subject: String, text: String) async throws {
        let body: [String: JSONValue] = ["to": .string(to), "subject": .string(subject), "text": .string(text)]
        _ = try await send(path: "email/send", method: "POST", body: try encoder.encode(body))
    }

    func backupCatalog() async throws -> [ResourceRecord] {
        let data = try await send(path: "backup/catalog")
        let value = try decoder.decode(JSONValue.self, from: data)
        guard case .object(let object) = value, case .array(let rows) = object["backups"] else { return [] }
        return rows.compactMap { if case .object(let fields) = $0 { ResourceRecord(values: fields.merging(["_kind": .string("backup")]) { _, new in new }) } else { nil } }
    }

    func maintenanceJobs() async throws -> [ResourceRecord] {
        let data = try await send(path: "backup/jobs")
        let value = try decoder.decode(JSONValue.self, from: data)
        guard case .object(let object) = value, case .array(let rows) = object["jobs"] else { return [] }
        return rows.compactMap { if case .object(let fields) = $0 { ResourceRecord(values: fields.merging(["_kind": .string("job")]) { _, new in new }) } else { nil } }
    }

    func createMaintenanceJob(
        operation: String,
        backupID: String? = nil,
        currentPassword: String
    ) async throws {
        var body: [String: JSONValue] = [
            "operation": .string(operation), "currentPassword": .string(currentPassword)
        ]
        if let backupID {
            body["backupId"] = .string(backupID)
            body["confirmation"] = .string(backupID)
            body["maintenanceAcknowledged"] = .boolean(true)
        }
        _ = try await send(path: "backup/jobs", method: "POST", body: try encoder.encode(body))
    }

    func uploadFile(name: String, mimeType: String, data: Data) async throws -> ResourceRecord {
        if mimeType.hasPrefix("video/") {
            return try await uploadVideoChunks(name: name, mimeType: mimeType, data: data)
        }
        let boundary = "IERP-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(name.replacingOccurrences(of: "\"", with: "_"))\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        let response = try await send(path: "upload", method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
        return try decoder.decode(ResourceRecord.self, from: response)
    }

    func uploadFile(name: String, mimeType: String, fileURL: URL) async throws -> ResourceRecord {
        if mimeType.hasPrefix("video/") {
            return try await uploadVideoChunks(name: name, mimeType: mimeType, fileURL: fileURL)
        }
        return try await uploadFile(name: name, mimeType: mimeType, data: Data(contentsOf: fileURL))
    }

    private func uploadVideoChunks(name: String, mimeType: String, data: Data) async throws -> ResourceRecord {
        let initBody: [String: JSONValue] = [
            "fileName": .string(name), "fileSize": .number(Double(data.count)), "mimeType": .string(mimeType)
        ]
        let initData = try await send(path: "upload/chunks/init", method: "POST", body: try encoder.encode(initBody))
        guard case .object(let initialized) = try decoder.decode(JSONValue.self, from: initData) else {
            throw APIError.server(500)
        }
        if case .object(let completed) = initialized["completedUpload"] {
            return ResourceRecord(values: completed)
        }
        guard let uploadID = initialized["uploadId"]?.stringValue else { throw APIError.server(500) }
        let chunkSize: Int
        if case .number(let size) = initialized["chunkSize"] { chunkSize = Int(size) } else { chunkSize = 4 * 1024 * 1024 }
        var uploaded = Set<Int>()
        if case .array(let values) = initialized["uploadedChunks"] {
            uploaded = Set(values.compactMap { if case .number(let value) = $0 { Int(value) } else { nil } })
        }
        let count = (data.count + chunkSize - 1) / chunkSize
        for index in 0..<count where !uploaded.contains(index) {
            let start = index * chunkSize
            let end = min(data.count, start + chunkSize)
            _ = try await send(
                path: "upload/chunks/\(uploadID)/\(index)", method: "PUT",
                body: data.subdata(in: start..<end), contentType: "application/octet-stream"
            )
        }
        let completed = try await send(path: "upload/chunks/\(uploadID)/complete", method: "POST", body: Data("{}".utf8))
        return try decoder.decode(ResourceRecord.self, from: completed)
    }

    private func uploadVideoChunks(name: String, mimeType: String, fileURL: URL) async throws -> ResourceRecord {
        let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let fileSize = (attributes[.size] as? NSNumber)?.int64Value ?? 0
        let initBody: [String: JSONValue] = [
            "fileName": .string(name), "fileSize": .number(Double(fileSize)), "mimeType": .string(mimeType)
        ]
        let initData = try await send(path: "upload/chunks/init", method: "POST", body: try encoder.encode(initBody))
        guard case .object(let initialized) = try decoder.decode(JSONValue.self, from: initData) else { throw APIError.server(500) }
        if case .object(let completed) = initialized["completedUpload"] { return ResourceRecord(values: completed) }
        guard let uploadID = initialized["uploadId"]?.stringValue else { throw APIError.server(500) }
        let chunkSize: Int
        if case .number(let size) = initialized["chunkSize"] { chunkSize = Int(size) } else { chunkSize = 4 * 1024 * 1024 }
        var uploaded = Set<Int>()
        if case .array(let values) = initialized["uploadedChunks"] {
            uploaded = Set(values.compactMap { if case .number(let value) = $0 { Int(value) } else { nil } })
        }
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }
        let count = Int((fileSize + Int64(chunkSize) - 1) / Int64(chunkSize))
        for index in 0..<count where !uploaded.contains(index) {
            try handle.seek(toOffset: UInt64(index * chunkSize))
            let chunk = try handle.read(upToCount: min(chunkSize, Int(fileSize) - index * chunkSize)) ?? Data()
            _ = try await send(
                path: "upload/chunks/\(uploadID)/\(index)", method: "PUT", body: chunk,
                contentType: "application/octet-stream"
            )
        }
        let completed = try await send(path: "upload/chunks/\(uploadID)/complete", method: "POST", body: Data("{}".utf8))
        return try decoder.decode(ResourceRecord.self, from: completed)
    }

    func download(path: String) async throws -> Data {
        if path.hasPrefix("/api/") { return try await send(path: String(path.dropFirst(5))) }
        return try await send(path: path)
    }

    private func send(
        path: String,
        method: String = "GET",
        body: Data? = nil,
        contentType: String = "application/json; charset=utf-8"
    ) async throws -> Data {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.scheme == "https" else {
            throw APIError.invalidConfiguration
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let storage = session.configuration.httpCookieStorage,
           let cookies = storage.cookies(for: url),
           !cookies.isEmpty {
            HTTPCookie.requestHeaderFields(with: cookies).forEach {
                request.setValue($0.value, forHTTPHeaderField: $0.key)
            }
        }
        if method != "GET" {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
            request.setValue(origin, forHTTPHeaderField: "Origin")
            request.httpBody = body
        }

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.transport }
            persistResponseCookies(from: http, for: url)
            guard (200..<300).contains(http.statusCode) else { throw mapStatus(http.statusCode) }
            return data
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as APIError {
            throw error
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch let error as URLError where error.code == .timedOut {
            throw APIError.timeout
        } catch {
            throw APIError.transport
        }
    }

    private func validate(_ resource: String) throws {
        guard Self.resources.contains(resource) else { throw APIError.invalidConfiguration }
    }

    private func mapStatus(_ status: Int) -> APIError {
        switch status {
        case 401: .unauthorized
        case 403: .forbidden
        case 404: .notFound
        case 409: .conflict
        case 429: .rateLimited
        default: .server(status)
        }
    }

    private func clearCookies() {
        guard let storage = session.configuration.httpCookieStorage else { return }
        storage.cookies?.forEach(storage.deleteCookie)
    }

    private func persistResponseCookies(from response: HTTPURLResponse, for url: URL) {
        guard let storage = session.configuration.httpCookieStorage else { return }
        let headers = response.allHeaderFields.reduce(into: [String: String]()) { result, entry in
            result[String(describing: entry.key)] = String(describing: entry.value)
        }
        HTTPCookie.cookies(withResponseHeaderFields: headers, for: url).forEach {
            storage.setCookie($0)
        }
    }

    private static func persistentSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = .shared
        configuration.httpShouldSetCookies = true
        configuration.requestCachePolicy = .reloadRevalidatingCacheData
        configuration.timeoutIntervalForRequest = 60
        configuration.timeoutIntervalForResource = 300
        return URLSession(configuration: configuration)
    }

    private static let resources: Set<String> = [
        "projects", "clients", "equipment", "schedule", "docs", "archives",
        "production", "users", "settings", "payments", "approvals", "worklogs",
        "messages", "channels", "email_configs", "announcements",
        "recycle_bin"
    ]
}

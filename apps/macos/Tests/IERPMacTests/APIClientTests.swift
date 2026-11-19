import Foundation
import Testing
@testable import IERPMac

@Suite(.serialized)
struct APIClientTests {
    @Test
    func loginUsesPersistentAccountSessionAndCookie() async throws {
        let recorder = RequestRecorder()
        recorder.responses = [
            .init(
                status: 200,
                headers: ["Set-Cookie": "ierp_session=abc; Path=/; HttpOnly"],
                body: #"{"user":{"id":"u1","nickname":"测试","department":"工程部","role":"User"}}"#
            ),
            .init(status: 200, body: #"{"id":"w1","content":"现场记录"}"#)
        ]
        let client = APIClient(
            baseURL: URL(string: "https://example.test/api/")!,
            origin: "https://example.test",
            session: recorder.session
        )

        let user = try await client.login(username: "测试", password: " pass ")
        #expect(user.nickname == "测试")
        let login = try #require(recorder.requests.first)
        let json = try #require(login.jsonBody)
        #expect(json["password"] as? String == " pass ")
        #expect(json["persistent"] as? Bool == true)

        _ = try await client.createResource("worklogs", fields: ["content": .string("现场记录")])
        let write = try #require(recorder.requests.last)
        #expect(write.value(forHTTPHeaderField: "Origin") == "https://example.test")
        #expect(write.value(forHTTPHeaderField: "Cookie") == "ierp_session=abc")
    }

    @Test
    func mapsForbiddenToChineseMessage() async throws {
        let recorder = RequestRecorder()
        recorder.responses = [.init(status: 403, body: #"{"error":"forbidden"}"#)]
        let client = APIClient(
            baseURL: URL(string: "https://example.test/api/")!,
            origin: "https://example.test",
            session: recorder.session
        )

        await #expect(throws: APIError.forbidden) {
            _ = try await client.currentUser()
        }
    }

    @Test
    func resourceCRUDPreservesTypedAndNestedJSON() async throws {
        let recorder = RequestRecorder()
        let record = #"{"id":"p1","name":"厨房工程","progress":42,"active":true,"nodes":[{"id":"n1"}]}"#
        recorder.responses = [
            .init(status: 200, body: "[\(record)]"),
            .init(status: 201, body: record),
            .init(status: 200, body: record.replacingOccurrences(of: "42", with: "70")),
            .init(status: 204, body: "")
        ]
        let client = APIClient(
            baseURL: URL(string: "https://example.test/api/")!,
            origin: "https://example.test",
            session: recorder.session
        )

        let rows = try await client.resources("projects")
        #expect(rows.first?.values["progress"] == .number(42))
        #expect(rows.first?.values["active"] == .boolean(true))
        #expect(rows.first?.values["nodes"] == .array([.object(["id": .string("n1")])]))

        let fields: [String: JSONValue] = [
            "name": .string("厨房工程"), "progress": .number(42), "active": .boolean(true),
            "nodes": .array([.object(["id": .string("n1")])])
        ]
        _ = try await client.createResource("projects", fields: fields)
        _ = try await client.updateResource("projects", id: "p1", fields: ["progress": .number(70)])
        try await client.deleteResource("projects", id: "p1")

        #expect(recorder.requests.map(\.httpMethod) == ["GET", "POST", "PUT", "DELETE"])
        #expect(recorder.requests[2].value(forHTTPHeaderField: "Origin") == "https://example.test")
        let createJSON = try #require(recorder.requests[1].jsonBody)
        #expect(createJSON["progress"] as? Double == 42)
        #expect(createJSON["active"] as? Bool == true)
        #expect(createJSON["nodes"] is [[String: Any]])
    }

    @Test
    func specializedBusinessEndpointsUseOriginAndExactPaths() async throws {
        let recorder = RequestRecorder()
        recorder.responses = Array(repeating: .init(status: 200, body: "{}"), count: 5)
        let client = APIClient(baseURL: URL(string: "https://example.test/api/")!, origin: "https://example.test", session: recorder.session)

        _ = try await client.renameArchive(id: "a1", title: "新名称.pdf")
        try await client.restoreRecycleItem(id: "r1")
        try await client.permanentlyDeleteRecycleItem(id: "r2")
        try await client.sendEmail(to: "user@example.test", subject: "进度", text: "已完成")
        try await client.createMaintenanceJob(operation: "backup", currentPassword: "secret")

        #expect(recorder.requests.map { $0.url?.path } == [
            "/api/archives/a1/name", "/api/recycle_bin/restore/r1", "/api/recycle_bin/r2",
            "/api/email/send", "/api/backup/jobs"
        ])
        #expect(recorder.requests.allSatisfy { $0.value(forHTTPHeaderField: "Origin") == "https://example.test" })
    }

    @Test
    func multipartUploadCarriesFilenameAndBytes() async throws {
        let recorder = RequestRecorder()
        recorder.responses = [.init(status: 200, body: #"{"url":"/api/uploads/a.pdf","size":3}"#)]
        let client = APIClient(baseURL: URL(string: "https://example.test/api/")!, origin: "https://example.test", session: recorder.session)

        let result = try await client.uploadFile(name: "验收.pdf", mimeType: "application/pdf", data: Data([1, 2, 3]))
        let request = try #require(recorder.requests.first)
        #expect(request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
        let body = request.httpBody ?? request.httpBodyStream?.readAllData() ?? Data()
        #expect(String(decoding: body, as: UTF8.self).contains("验收.pdf"))
        #expect(result.values["url"] == .string("/api/uploads/a.pdf"))
    }

    @Test
    func videoUploadUsesResumableChunkProtocol() async throws {
        let recorder = RequestRecorder()
        recorder.responses = [
            .init(status: 200, body: #"{"uploadId":"u1","chunkSize":2,"chunkCount":2,"uploadedChunks":[]}"#),
            .init(status: 204, body: ""), .init(status: 204, body: ""),
            .init(status: 200, body: #"{"url":"/api/uploads/v.mp4","filename":"v.mp4"}"#)
        ]
        let client = APIClient(baseURL: URL(string: "https://example.test/api/")!, origin: "https://example.test", session: recorder.session)

        let result = try await client.uploadFile(name: "现场.mp4", mimeType: "video/mp4", data: Data([1, 2, 3, 4]))
        #expect(recorder.requests.map { $0.url?.path } == [
            "/api/upload/chunks/init", "/api/upload/chunks/u1/0",
            "/api/upload/chunks/u1/1", "/api/upload/chunks/u1/complete"
        ])
        #expect(recorder.requests[1].value(forHTTPHeaderField: "Content-Type") == "application/octet-stream")
        #expect(result.values["url"] == .string("/api/uploads/v.mp4"))
    }

    @Test
    func presentationMapsBusinessStatusAndBoundsProgress() {
        #expect(Presentation.progress(.number(135)) == 100)
        #expect(Presentation.progress(.number(-8)) == 0)
        #expect(Presentation.statusTone("Completed") == .success)
        #expect(Presentation.statusTone("BLOCKED") == .danger)
        #expect(Presentation.statusLabel("InStock") == "已入库")
        #expect(Presentation.currency(.number(234_100)) == "¥23.4万")
        let completed = ResourceRecord(values: [
            "status": .string("Active"),
            "nodes": .array([.object(["title": .string("核算成本支出"), "status": .string("COMPLETED")])])
        ])
        #expect(Presentation.projectBusinessStatus(completed) == "Completed")
    }

    @Test
    func browserWorkspaceKeepsProductionOriginAndExcludesAiEntry() throws {
        #expect(BrowserWorkspace.isInternal(try #require(URL(string: APIClient.productionOrigin + "/api/messages"))))
        #expect(!BrowserWorkspace.isInternal(try #require(URL(string: "http://erp.example.com/"))))
        #expect(BrowserWorkspace.hideExcludedModulesScript.contains("AI 中心"))
        #expect(BrowserWorkspace.hideExcludedModulesScript.contains("MutationObserver"))
        #expect(BrowserWorkspace.loginPersistenceScript.contains("/api/auth/login"))
        #expect(BrowserWorkspace.loginPersistenceScript.contains("payload.persistent = true"))
        #expect(BrowserWorkspace.loginPersistenceScript.contains("window.fetch"))
    }

    @Test
    func configurableOriginRequiresAnHttpsOriginWithoutCredentialsOrPath() {
        #expect(APIClient.normalizedOrigin("https://example.test:8443/") == "https://example.test:8443")
        #expect(APIClient.normalizedOrigin("https://example.test:443") == "https://example.test")
        #expect(APIClient.normalizedOrigin("http://example.test") == nil)
        #expect(APIClient.normalizedOrigin("https://user@example.test/") == nil)
        #expect(APIClient.normalizedOrigin("https://example.test/api") == nil)
    }

    @Test
    func nativeRestoreOnlyFollowsTheSecureWorkspaceSessionCookie() throws {
        let home = BrowserWorkspace.homeURL
        let otherOrigin = try #require(URL(string: "https://unrelated.example.test/"))
        func parsedCookie(_ header: String, origin: URL) throws -> HTTPCookie {
            try #require(HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: origin).first)
        }

        let secureSession = "ierp_session=fixture; Path=/; Secure; HttpOnly"
        #expect(BrowserWorkspace.isWorkspaceSessionCookie(try parsedCookie(secureSession, origin: home)))
        #expect(!BrowserWorkspace.isWorkspaceSessionCookie(try parsedCookie(secureSession, origin: otherOrigin)))
        #expect(!BrowserWorkspace.isWorkspaceSessionCookie(try parsedCookie("ierp_session=fixture; Path=/; Secure", origin: home)))
        #expect(!BrowserWorkspace.isWorkspaceSessionCookie(try parsedCookie("preferences=fixture; Path=/; Secure; HttpOnly", origin: home)))
    }
}

private final class RequestRecorder: @unchecked Sendable {
    struct Response {
        let status: Int
        var headers: [String: String] = [:]
        let body: String
    }

    private let lock = NSLock()
    private var pending: [Response] = []
    private var recorded: [URLRequest] = []

    var responses: [Response] {
        get { lock.withLock { pending } }
        set { lock.withLock { pending = newValue } }
    }

    var requests: [URLRequest] { lock.withLock { recorded } }

    lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecorderURLProtocol.self]
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.httpShouldSetCookies = true
        RecorderURLProtocol.recorder = self
        return URLSession(configuration: configuration)
    }()

    func respond(to request: URLRequest) throws -> (HTTPURLResponse, Data) {
        lock.withLock { recorded.append(request) }
        let response = try lock.withLock {
            guard !pending.isEmpty else { throw URLError(.badServerResponse) }
            return pending.removeFirst()
        }
        let http = try #require(
            HTTPURLResponse(
                url: request.url!,
                statusCode: response.status,
                httpVersion: "HTTP/1.1",
                headerFields: response.headers
            )
        )
        return (http, Data(response.body.utf8))
    }
}

private final class RecorderURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static weak var recorder: RequestRecorder?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            let (response, data) = try Self.recorder?.respond(to: request)
                ?? { throw URLError(.badServerResponse) }()
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private extension URLRequest {
    var jsonBody: [String: Any]? {
        let data = httpBody ?? httpBodyStream?.readAllData()
        guard let data else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}

private extension InputStream {
    func readAllData() -> Data {
        open()
        defer { close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while hasBytesAvailable {
            let count = read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

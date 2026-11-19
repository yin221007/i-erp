package cn.i2000.ierp.data

import cn.i2000.ierp.ui.Presentation
import cn.i2000.ierp.ui.StatusTone

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ApiClientTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun loginPersistsCookiePreservesPasswordAndAuthenticatesWrites() = runTest {
        server.enqueue(
            MockResponse()
                .setHeader("Set-Cookie", "ierp_session=abc; Path=/; HttpOnly")
                .setBody(
                    """{"user":{"id":"u1","nickname":"测试","department":"工程部","role":"User"}}"""
                )
        )
        server.enqueue(MockResponse().setResponseCode(200).setBody("[]"))

        val cookieStore = InMemoryCookieStore()
        val client = ApiClient(
            baseUrl = server.url("api/").toString(),
            origin = "https://erp.example.test",
            cookieStore = cookieStore
        )
        val user = client.login("测试", " pass ")
        val loginRequest = server.takeRequest()
        val loginBody = loginRequest.body.readUtf8()

        assertEquals("测试", user.nickname)
        assertTrue(loginBody.contains("\"password\":\" pass \""))
        assertTrue(loginBody.contains("\"persistent\":true"))
        assertEquals("abc", cookieStore.cookies().single().value)

        client.createResource("worklogs", buildJsonObject { put("content", "现场记录") })
        val writeRequest = server.takeRequest()
        assertEquals("ierp_session=abc", writeRequest.getHeader("Cookie"))
        assertEquals("https://erp.example.test", writeRequest.getHeader("Origin"))
    }

    @Test
    fun mapsServerStatusToChineseMessage() = runTest {
        server.enqueue(MockResponse().setResponseCode(403).setBody("{\"error\":\"forbidden\"}"))
        val client = ApiClient(
            baseUrl = server.url("api/").toString(),
            origin = "https://erp.example.test",
            cookieStore = InMemoryCookieStore()
        )

        val error = runCatching { client.currentUser() }.exceptionOrNull()
        assertTrue(error is ApiException)
        assertEquals("没有权限执行此操作", error?.message)
    }

    @Test
    fun resourceCrudPreservesNumbersBooleansAndNestedJson() = runTest {
        val record = """{"id":"p1","name":"厨房工程","progress":42,"active":true,"nodes":[{"id":"n1"}]}"""
        server.enqueue(MockResponse().setBody("[$record]"))
        server.enqueue(MockResponse().setResponseCode(201).setBody(record))
        server.enqueue(MockResponse().setBody(record.replace("42", "70")))
        server.enqueue(MockResponse().setResponseCode(204))
        val client = ApiClient(
            baseUrl = server.url("api/").toString(),
            origin = "https://erp.example.test",
            cookieStore = InMemoryCookieStore()
        )

        val rows = client.readResources("projects")
        assertEquals(42.0, rows.single()["progress"]?.jsonPrimitive?.double)
        assertTrue(rows.single()["active"]?.jsonPrimitive?.boolean == true)
        assertEquals("n1", rows.single()["nodes"]?.jsonArray?.first()?.jsonObject?.get("id")?.jsonPrimitive?.content)
        assertEquals("/api/projects", server.takeRequest().path)

        val createFields = buildJsonObject {
            put("name", "厨房工程")
            put("progress", 42)
            put("active", true)
            put("nodes", buildJsonArray { add(buildJsonObject { put("id", "n1") }) })
        }
        client.createResource("projects", createFields)
        val create = server.takeRequest()
        val createJSON = Json.parseToJsonElement(create.body.readUtf8()).jsonObject
        assertEquals(42.0, createJSON["progress"]?.jsonPrimitive?.double)
        assertTrue(createJSON["active"]?.jsonPrimitive?.boolean == true)
        assertTrue(createJSON["nodes"] is JsonArray)

        client.updateResource("projects", "p1", buildJsonObject { put("progress", 70) })
        val update = server.takeRequest()
        assertEquals("PUT", update.method)
        assertEquals("/api/projects/p1", update.path)
        assertEquals("https://erp.example.test", update.getHeader("Origin"))

        client.deleteResource("projects", "p1")
        val delete = server.takeRequest()
        assertEquals("DELETE", delete.method)
        assertEquals("/api/projects/p1", delete.path)
    }

    @Test
    fun specializedBusinessEndpointsUseAuthenticatedWriteContract() = runTest {
        repeat(5) { server.enqueue(MockResponse().setBody("{}")) }
        val client = ApiClient(
            baseUrl = server.url("api/").toString(),
            origin = "https://erp.example.test",
            cookieStore = InMemoryCookieStore()
        )

        client.renameArchive("a1", "新名称.pdf")
        client.restoreRecycleItem("r1")
        client.permanentlyDeleteRecycleItem("r2")
        client.sendEmail("user@example.test", "进度", "已完成")
        client.createBackup("secret")

        val requests = List(5) { server.takeRequest() }
        assertEquals("PATCH", requests[0].method)
        assertEquals("/api/archives/a1/name", requests[0].path)
        assertEquals("/api/recycle_bin/restore/r1", requests[1].path)
        assertEquals("DELETE", requests[2].method)
        assertEquals("/api/email/send", requests[3].path)
        assertEquals("/api/backup/jobs", requests[4].path)
        assertTrue(requests.all { it.getHeader("Origin") == "https://erp.example.test" })
    }

    @Test
    fun multipartUploadIncludesFileNameAndBytes() = runTest {
        server.enqueue(MockResponse().setBody("""{"url":"/api/uploads/a.pdf","size":3}"""))
        val client = ApiClient(
            baseUrl = server.url("api/").toString(),
            origin = "https://erp.example.test",
            cookieStore = InMemoryCookieStore()
        )

        val response = client.uploadFile("验收.pdf", "application/pdf", byteArrayOf(1, 2, 3))
        val request = server.takeRequest()
        assertEquals("/api/upload", request.path)
        assertTrue(request.getHeader("Content-Type")!!.startsWith("multipart/form-data; boundary="))
        assertTrue(request.body.readUtf8().contains("验收.pdf"))
        assertEquals("/api/uploads/a.pdf", response["url"]?.jsonPrimitive?.content)
    }

    @Test
    fun videoUploadUsesResumableChunkProtocol() = runTest {
        server.enqueue(MockResponse().setBody("""{"uploadId":"u1","chunkSize":2,"chunkCount":2,"uploadedChunks":[]}"""))
        server.enqueue(MockResponse().setResponseCode(204))
        server.enqueue(MockResponse().setResponseCode(204))
        server.enqueue(MockResponse().setBody("""{"url":"/api/uploads/v.mp4","filename":"v.mp4"}"""))
        val client = ApiClient(server.url("api/").toString(), "https://erp.example.test", InMemoryCookieStore())

        val result = client.uploadFile("现场.mp4", "video/mp4", byteArrayOf(1, 2, 3, 4))
        val requests = List(4) { server.takeRequest() }
        assertEquals(listOf(
            "/api/upload/chunks/init", "/api/upload/chunks/u1/0",
            "/api/upload/chunks/u1/1", "/api/upload/chunks/u1/complete"
        ), requests.map { it.path })
        assertEquals("application/octet-stream", requests[1].getHeader("Content-Type"))
        assertEquals("/api/uploads/v.mp4", result["url"]?.jsonPrimitive?.content)
    }

    @Test
    fun presentationMapsBusinessStatusAndBoundsProgress() {
        assertEquals(100, Presentation.progress(JsonPrimitive(135)))
        assertEquals(0, Presentation.progress(JsonPrimitive(-8)))
        assertEquals(StatusTone.SUCCESS, Presentation.statusTone("Completed"))
        assertEquals(StatusTone.DANGER, Presentation.statusTone("BLOCKED"))
        assertEquals("已入库", Presentation.statusLabel("InStock"))
        assertEquals("¥23.4万", Presentation.currency(JsonPrimitive(234100)))
        val completed = buildJsonObject {
            put("status", "Active")
            put("nodes", buildJsonArray { add(buildJsonObject { put("title", "核算成本支出"); put("status", "COMPLETED") }) })
        }
        assertEquals("Completed", Presentation.projectBusinessStatus(completed))
    }
}

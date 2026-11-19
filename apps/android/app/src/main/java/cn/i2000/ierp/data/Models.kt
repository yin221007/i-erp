package cn.i2000.ierp.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class IERPUser(
    val id: String,
    val username: String = "",
    val nickname: String = "",
    val department: String = "",
    val role: String = "",
    val permission: String = "ReadOnly",
    val isDefaultAdmin: Boolean = false,
    val preferences: JsonObject = JsonObject(emptyMap())
)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
    val persistent: Boolean = true
)

@Serializable
data class LoginResponse(val user: IERPUser)

@Serializable
data class CurrentUserResponse(val user: IERPUser)

@Serializable
data class ApiErrorResponse(val error: String = "")

@Serializable
data class ResourceRecord(
    val id: String,
    val name: String = "",
    @SerialName("projectName") val projectName: String = "",
    val status: String = ""
)

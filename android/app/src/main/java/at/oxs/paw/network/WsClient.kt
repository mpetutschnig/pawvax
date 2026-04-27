package at.oxs.paw.network

import android.content.Context
import android.net.Uri
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import okhttp3.*
import java.io.InputStream

sealed class WsEvent {
    data class Status(val message: String) : WsEvent()
    data class Result(val documentId: String, val docType: String, val content: Any) : WsEvent()
    data class Error(val message: String) : WsEvent()
}

class WsClient(private val context: Context) {
    private val gson = Gson()
    private val client = OkHttpClient()

    suspend fun uploadDocument(
        serverBaseUrl: String,
        token: String,
        animalId: String,
        uri: Uri,
        filename: String,
        pageNumber: Int = 1,
        isLast: Boolean = true
    ): Flow<WsEvent> {
        val channel = Channel<WsEvent>(Channel.UNLIMITED)

        val wsUrl = serverBaseUrl
            .replace("http://", "ws://")
            .replace("https://", "wss://")
            .removeSuffix("/api/")
            .let { "$it/ws?token=$token" }

        val request = Request.Builder().url(wsUrl).build()

        client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                val msg = gson.toJson(mapOf(
                    "type" to "upload_start",
                    "animalId" to animalId,
                    "filename" to filename,
                    "mimeType" to "image/jpeg",
                    "page_number" to pageNumber,
                    "is_last" to isLast
                ))
                ws.send(msg)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                val json = gson.fromJson(text, JsonObject::class.java)
                when (json.get("type").asString) {
                    "ready" -> {
                        val stream: InputStream = context.contentResolver.openInputStream(uri)!!
                        val buffer = ByteArray(64 * 1024)
                        var n: Int
                        while (stream.read(buffer).also { n = it } != -1) {
                            ws.send(okio.ByteString.of(*buffer.copyOf(n)))
                        }
                        stream.close()
                        ws.send(gson.toJson(mapOf("type" to "upload_end", "is_last" to isLast)))
                    }
                    "status" -> channel.trySend(WsEvent.Status(json.get("message").asString))
                    "page_saved" -> channel.trySend(WsEvent.Status(json.get("message").asString))
                    "result" -> {
                        val data = json.getAsJsonObject("data")
                        channel.trySend(WsEvent.Result(
                            documentId = data.get("documentId").asString,
                            docType = data.get("docType").asString,
                            content = data.get("content")
                        ))
                        channel.close()
                    }
                    "error" -> {
                        channel.trySend(WsEvent.Error(json.get("message").asString))
                        channel.close()
                    }
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                channel.trySend(WsEvent.Error(t.message ?: "Verbindungsfehler"))
                channel.close()
            }
        })

        return channel.receiveAsFlow()
    }
}

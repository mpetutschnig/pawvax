package at.oxs.paw.network

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("paw_prefs")

object TokenStore {
    private val TOKEN_KEY = stringPreferencesKey("jwt_token")
    private val SERVER_URL_KEY = stringPreferencesKey("server_url")

    suspend fun saveToken(context: Context, token: String) {
        context.dataStore.edit { it[TOKEN_KEY] = token }
    }

    suspend fun getToken(context: Context): String? =
        context.dataStore.data.map { it[TOKEN_KEY] }.first()

    suspend fun clearToken(context: Context) {
        context.dataStore.edit { it.remove(TOKEN_KEY) }
    }

    suspend fun saveServerUrl(context: Context, url: String) {
        context.dataStore.edit { it[SERVER_URL_KEY] = url }
    }

    suspend fun getServerUrl(context: Context): String =
        context.dataStore.data.map { it[SERVER_URL_KEY] ?: "http://10.0.2.2:3000/api/" }.first()
}

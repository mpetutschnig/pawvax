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
    private val ROLE_KEY = stringPreferencesKey("user_role")

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

    suspend fun saveRole(context: Context, role: String) {
        context.dataStore.edit { it[ROLE_KEY] = role }
    }

    suspend fun getRole(context: Context): String =
        context.dataStore.data.map { it[ROLE_KEY] ?: "user" }.first()

    suspend fun clearRole(context: Context) {
        context.dataStore.edit { it.remove(ROLE_KEY) }
    }
}

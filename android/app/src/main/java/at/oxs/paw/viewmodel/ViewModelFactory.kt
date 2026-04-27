package at.oxs.paw.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import at.oxs.paw.network.RetrofitClient
import at.oxs.paw.network.TokenStore
import kotlinx.coroutines.runBlocking

class ViewModelFactory(private val context: Context) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        val apiService = RetrofitClient.getApiService() ?: run {
            // Fallback: build with current token if available
            val token = runBlocking { TokenStore.getToken(context) }
            val serverUrl = runBlocking { TokenStore.getServerUrl(context) }
            RetrofitClient.build(serverUrl, token)
        }

        return when (modelClass) {
            AuthViewModel::class.java -> AuthViewModel(apiService) as T
            AnimalViewModel::class.java -> AnimalViewModel(apiService) as T
            DocumentViewModel::class.java -> DocumentViewModel(apiService) as T
            ProfileViewModel::class.java -> ProfileViewModel(apiService) as T
            OrganizationViewModel::class.java -> OrganizationViewModel(apiService) as T
            AdminViewModel::class.java -> AdminViewModel(apiService) as T
            else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
